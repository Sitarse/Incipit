#!/bin/sh
# Construit Incipit.app : double-clic direct, aucun terminal (--windowed),
# icone .icns generee depuis frontend/logo.png (sips/iconutil, deja sur macOS).
# `uv` embarque a cote pour que l'utilisateur final n'ait rien a installer.
#
# Prerequis pour CONSTRUIRE (pas pour l'utilisateur final) : uv, macOS (sips
# et iconutil n'existent que la -- ce script doit tourner sur un Mac).
# Lancer :  sh packaging/build_macos.sh
set -eu

racine=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$racine"

uv_bundle="packaging/vendor/macos/uv"
if [ ! -f "$uv_bundle" ]; then
    mkdir -p "$(dirname "$uv_bundle")"
    arch=$(uname -m)
    [ "$arch" = "arm64" ] && cible="aarch64-apple-darwin" || cible="x86_64-apple-darwin"
    curl -fsSL -o packaging/vendor/macos/uv.tar.gz \
        "https://github.com/astral-sh/uv/releases/latest/download/uv-${cible}.tar.gz"
    tar -xzf packaging/vendor/macos/uv.tar.gz -C packaging/vendor/macos --strip-components=1
    chmod +x "$uv_bundle"
fi

# .icns : iconutil n'accepte qu'un dossier .iconset rempli des tailles standard.
icns="packaging/vendor/macos/logo.icns"
if [ ! -f "$icns" ]; then
    iconset="packaging/vendor/macos/logo.iconset"
    mkdir -p "$iconset"
    for taille in 16 32 64 128 256 512; do
        sips -z $taille $taille frontend/logo.png --out "$iconset/icon_${taille}x${taille}.png" >/dev/null
        double=$((taille * 2))
        sips -z $double $double frontend/logo.png --out "$iconset/icon_${taille}x${taille}@2x.png" >/dev/null
    done
    iconutil -c icns "$iconset" -o "$icns"
fi

# --exclude-module pkg_resources : Werkzeug importe pkg_resources dans une
# fonction morte (testapp.py, jamais appelee ici), PyInstaller le detecte quand
# meme et embarque un pkg_resources casse (jaraco manquant) qui plante le
# lancement.
uv run --with pyinstaller --with flask --with pywebview pyinstaller app.py \
    --name Incipit --onedir --windowed --noconfirm \
    --icon "$racine/$icns" \
    --distpath dist --workpath build/macos --specpath packaging \
    --exclude-module pkg_resources \
    --add-data "$racine/frontend:frontend" \
    --add-data "$racine/generator.py:." \
    --add-data "$racine/md2pdf.py:." \
    --add-data "$racine/exercices.py:." \
    --add-data "$racine/config/keys.env.example:config" \
    --add-binary "$racine/$uv_bundle:."

echo
echo "OK : dist/Incipit.app -- double-clic direct."

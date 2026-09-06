#!/bin/sh
# Construit Incipit : dist/Incipit/Incipit, sans console visible,
# `uv` embarque a cote pour que l'utilisateur final n'ait rien a installer.
#
# Prerequis pour CONSTRUIRE (pas pour l'utilisateur final) : uv.
# Lancer :  sh packaging/build_linux.sh
set -eu

racine=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$racine"

uv_bundle="packaging/vendor/linux/uv"
if [ ! -f "$uv_bundle" ]; then
    mkdir -p "$(dirname "$uv_bundle")"
    curl -fsSL -o packaging/vendor/linux/uv.tar.gz \
        https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-unknown-linux-gnu.tar.gz
    tar -xzf packaging/vendor/linux/uv.tar.gz -C packaging/vendor/linux --strip-components=1
    chmod +x "$uv_bundle"
fi

uv run --with pyinstaller --with flask --with pywebview pyinstaller app.py \
    --name Incipit --onedir --windowed --noconfirm \
    --distpath dist --workpath build/linux --specpath packaging \
    --add-data "$racine/frontend:frontend" \
    --add-data "$racine/generator.py:." \
    --add-data "$racine/md2pdf.py:." \
    --add-data "$racine/exercices.py:." \
    --add-data "$racine/config/keys.env.example:config" \
    --add-binary "$racine/$uv_bundle:."

# Lanceur .desktop : icone + "aucun terminal" dans les environnements de
# bureau (Terminal=false), comme launchers/Incipit.vbs sous Windows.
cat > dist/Incipit.desktop << EOF
[Desktop Entry]
Type=Application
Name=Incipit
Comment=Cours generes a partir de vos photos et PDF
Exec=$racine/dist/Incipit/Incipit
Icon=$racine/frontend/logo.png
Terminal=false
Categories=Education;
EOF
chmod +x dist/Incipit.desktop

echo
echo "OK : dist/Incipit/Incipit"
echo "Double-clic (apres 'Autoriser l'execution' dans les proprietes du fichier) : dist/Incipit.desktop"

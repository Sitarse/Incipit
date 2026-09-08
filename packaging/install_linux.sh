#!/bin/sh
# Integre Incipit au menu des applications (une seule fois, apres extraction
# de l'archive Incipit-linux.tar.gz).
#
# Lancer depuis le dossier extrait :  sh install_linux.sh
set -eu

ici=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
binaire="$ici/Incipit/Incipit"

if [ ! -x "$binaire" ] && [ ! -f "$binaire" ]; then
    echo "Erreur : $binaire introuvable." >&2
    echo "Lancer ce script depuis le dossier extrait de Incipit-linux.tar.gz." >&2
    exit 1
fi
chmod +x "$binaire"

# L'icone embarquee par PyInstaller vit sous _internal/ (PyInstaller >= 6)
# ou directement a la racine du dossier selon la version utilisee au build.
icone="$ici/Incipit/_internal/frontend/logo.png"
[ -f "$icone" ] || icone="$ici/Incipit/frontend/logo.png"

apps_dir="$HOME/.local/share/applications"
mkdir -p "$apps_dir"

cat > "$apps_dir/Incipit.desktop" << EOF
[Desktop Entry]
Type=Application
Name=Incipit
Comment=Cours generes a partir de vos photos et PDF
Exec=$binaire
Icon=$icone
Terminal=false
Categories=Education;
EOF
chmod +x "$apps_dir/Incipit.desktop"

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$apps_dir" 2>/dev/null || true
fi

echo "OK : Incipit ajoute au menu des applications."
echo "(Si le raccourci n'apparait pas tout de suite, redemarrer le menu ou la session.)"
echo "Pour retirer le raccourci plus tard : sh uninstall_linux.sh"

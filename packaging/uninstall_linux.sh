#!/bin/sh
# Retire le raccourci de bureau installe par install_linux.sh.
# N'affecte pas le dossier Incipit lui-meme : le supprimer manuellement
# suffit a desinstaller completement l'application.
set -eu

desktop_file="$HOME/.local/share/applications/Incipit.desktop"

if [ -f "$desktop_file" ]; then
    rm -f "$desktop_file"
    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
    fi
    echo "OK : raccourci retire du menu des applications."
else
    echo "Rien a faire : $desktop_file n'existe pas."
fi

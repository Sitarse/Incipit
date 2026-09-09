#!/bin/sh
# Lanceur Linux / macOS d'Incipit.
#
# Sert aussi bien au double-clic (via le .desktop sous Linux ou le paquet .app
# sous macOS, qui n'ouvrent tous deux aucun terminal) qu'a un lancement manuel.
#
# Passe par `uv run --script` : Flask et pywebview sont declares dans l'en-tete
# PEP 723 de app.py et installes au premier lancement. Rien a installer a la
# main, aucun chemin code en dur.
#
# D'abord, verifie/installe les dependances systeme (uv, Chrome) via installer.py

set -eu

# Ce script vit dans launchers/ : la racine du projet est un cran au-dessus.
racine=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

if command -v uv >/dev/null 2>&1; then
    uv=uv
elif [ -x "$HOME/.local/bin/uv" ]; then
    uv="$HOME/.local/bin/uv"
else
    # Sans terminal visible, un `exit 1` muet laisserait l'utilisateur devant
    # rien du tout : on affiche une vraie boite de dialogue quand c'est possible.
    message="uv est introuvable. Installez-le : https://docs.astral.sh/uv/"
    if command -v osascript >/dev/null 2>&1; then
        osascript -e "display alert \"Incipit\" message \"$message\""
    elif command -v zenity >/dev/null 2>&1; then
        zenity --error --text="$message"
    else
        echo "$message" >&2
    fi
    exit 1
fi

# 1. Verifier les dependances systeme (mode --check silencieux)
if ! "$uv" run --script "$racine/installer.py" --check >/dev/null 2>&1; then
    # Dependance manquante : lancer l'installation complete
    # Essayer d'ouvrir un terminal pour l'affichage
    if [ -t 1 ] || [ -t 2 ]; then
        # Deja dans un terminal
        "$uv" run --script "$racine/installer.py"
    elif command -v osascript >/dev/null 2>&1; then
        # macOS : ouvrir Terminal.app
        osascript -e "tell application \"Terminal\" to do script \"cd '$racine' && '$uv' run --script '$racine/installer.py'\""
        # Attendre un peu que l'utilisateur fasse l'installation
        sleep 2
    elif command -v gnome-terminal >/dev/null 2>&1; then
        gnome-terminal -- "$uv" run --script "$racine/installer.py"
    elif command -v konsole >/dev/null 2>&1; then
        konsole -e "$uv" run --script "$racine/installer.py"
    elif command -v xterm >/dev/null 2>&1; then
        xterm -e "$uv" run --script "$racine/installer.py"
    else
        # Fallback : lancer en arriere-plan sans terminal visible
        "$uv" run --script "$racine/installer.py" &
    fi
    # Re-verifier
    "$uv" run --script "$racine/installer.py" --check >/dev/null 2>&1 || true
fi

# 2. Lancer l'application principale
exec "$uv" run --script "$racine/app.py"

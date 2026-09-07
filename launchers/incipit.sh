#!/bin/sh
# Lanceur Linux / macOS d'Incipit.
#
# Sert aussi bien au double-clic (via le .desktop sous Linux ou le paquet .app
# sous macOS, qui n'ouvrent tous deux aucun terminal) qu'a un lancement manuel.
#
# Passe par `uv run --script` : Flask et pywebview sont declares dans l'en-tete
# PEP 723 de app.py et installes au premier lancement. Rien a installer a la
# main, aucun chemin code en dur.

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

exec "$uv" run --script "$racine/app.py"

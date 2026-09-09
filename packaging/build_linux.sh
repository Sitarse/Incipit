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

# Trouver la libpython partagee (necessaire sur Linux pour PyInstaller)
# Python doit avoir ete compile avec --enable-shared
LIBPYTHON=$(python3 -c "import sysconfig; print(sysconfig.get_config_var('LIBDIR'))" 2>/dev/null)/libpython$(python3 -c "import sysconfig; print(sysconfig.get_config_var('VERSION'))").so.1.0
if [ ! -f "$LIBPYTHON" ]; then
    # Fallback : chercher dans les emplacements standards
    LIBPYTHON=$(find /usr/lib -name "libpython3.*.so.1.0" 2>/dev/null | head -1)
fi
if [ ! -f "$LIBPYTHON" ]; then
    echo "ERREUR: libpython partagee introuvable. Python doit etre compile avec --enable-shared" >&2
    exit 1
fi
echo "Utilisation de libpython: $LIBPYTHON"

# pywebview[qt] : PyQt6 s'installe via pip partout, contrairement au binding
# GTK (`gi`) qui reclame des paquets systeme absents de l'environnement isole
# de `uv run --with`. --exclude-module pkg_resources : Werkzeug importe
# pkg_resources dans une fonction morte (testapp.py, jamais appelee ici),
# PyInstaller le detecte quand meme et embarque un pkg_resources casse (jaraco
# manquant) qui plante le lancement.
uv run --with pyinstaller --with flask --with "pywebview[qt]" pyinstaller app.py \
    --name Incipit --onedir --windowed --noconfirm \
    --distpath dist --workpath build/linux --specpath packaging \
    --exclude-module pkg_resources \
    --add-data "$racine/frontend:frontend" \
    --add-data "$racine/generator.py:." \
    --add-data "$racine/md2pdf.py:." \
    --add-data "$racine/exercices.py:." \
    --add-data "$racine/config/keys.env.example:config" \
    --add-binary "$racine/$uv_bundle:." \
    --add-binary "$LIBPYTHON:."

# Lanceur .desktop : icone + "aucun terminal" dans les environnements de
# bureau (Terminal=false), comme launchers/Incipit.vbs sous Windows.
# On cree un wrapper qui definit LD_LIBRARY_PATH pour trouver libpython
cat > dist/Incipit/Incipit.sh << 'EOF'
#!/bin/sh
# Wrapper pour l'executable PyInstaller : definit LD_LIBRARY_PATH
# pour que la libpython partagee soit trouvee a cote de l'executable.
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
export LD_LIBRARY_PATH="$DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$DIR/Incipit" "$@"
EOF
chmod +x dist/Incipit/Incipit.sh

cat > dist/Incipit.desktop << EOF
[Desktop Entry]
Type=Application
Name=Incipit
Comment=Cours generes a partir de vos photos et PDF
Exec=$racine/dist/Incipit/Incipit.sh
Icon=$racine/frontend/logo.png
Terminal=false
Categories=Education;
EOF
chmod +x dist/Incipit.desktop

echo
echo "OK : dist/Incipit/Incipit"
echo "Double-clic (apres 'Autoriser l'execution' dans les proprietes du fichier) : dist/Incipit.desktop"

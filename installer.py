#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Installateur cross-platform pour Incipit.

Verifie et installe les dependances necessaires :
- uv (gestionnaire de paquets Python)
- Chrome/Chromium (pour la generation PDF via md2pdf.py)
- Les dependances Python sont installees automatiquement par `uv run --script`
  grace aux en-tetes PEP 723 dans app.py, generator.py, md2pdf.py, exercices.py

Usage :
    uv run installer.py           # Installation complete
    uv run installer.py --check   # Verification seulement (sortie 0 si OK, 1 si manque)
    uv run installer.py --uv-only # Installe seulement uv
    uv run installer.py --chrome-only # Verifie seulement Chrome
"""

import os
import sys
import subprocess
import platform
import shutil
import urllib.request
import tempfile
from pathlib import Path

WINDOWS = sys.platform == "win32"
MACOS = sys.platform == "darwin"
LINUX = sys.platform.startswith("linux")

UV_INSTALL_URL = "https://astral.sh/uv/install.sh"
UV_INSTALL_URL_WINDOWS = "https://astral.sh/uv/install.ps1"

# Chemins communs pour uv
UV_CANDIDATES = [
    Path.home() / ".local" / "bin" / ("uv.exe" if WINDOWS else "uv"),
    Path.home() / ".cargo" / "bin" / ("uv.exe" if WINDOWS else "uv"),
    Path("/usr/local/bin/uv"),
    Path("/opt/homebrew/bin/uv"),
]

# Noms des executables Chrome/Chromium par plateforme
CHROME_EXECUTABLES = {
    "win32": [
        "chrome.exe",
        "msedge.exe",
        "chromium.exe",
    ],
    "darwin": [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ],
    "linux": [
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
        "msedge",
    ],
}


def log_info(msg: str) -> None:
    print(f"[INFO] {msg}")


def log_ok(msg: str) -> None:
    print(f"[OK]   {msg}")


def log_warn(msg: str) -> None:
    print(f"[WARN] {msg}")


def log_error(msg: str) -> None:
    print(f"[ERREUR] {msg}")


def run_cmd(cmd: list[str], capture: bool = True) -> subprocess.CompletedProcess:
    """Execute une commande et retourne le resultat."""
    try:
        return subprocess.run(cmd, capture_output=capture, text=True, encoding="utf-8", errors="replace")
    except FileNotFoundError:
        return subprocess.CompletedProcess(cmd, 1, "", "command not found")
    except Exception as e:
        return subprocess.CompletedProcess(cmd, 1, "", str(e))


def trouver_uv() -> Path | None:
    """Cherche uv dans les emplacements connus et le PATH."""
    # 1. Dans le PATH
    if uv_path := shutil.which("uv"):
        return Path(uv_path)
    # 2. Emplacements connus
    for cand in UV_CANDIDATES:
        if cand.is_file():
            return cand
    return None


def installer_uv() -> bool:
    """Installe uv via le script officiel."""
    log_info("Installation de uv...")
    
    if WINDOWS:
        # Windows : utiliser le script PowerShell
        try:
            ps_cmd = [
                "powershell", "-ExecutionPolicy", "Bypass",
                "-Command", "irm https://astral.sh/uv/install.ps1 | iex"
            ]
            result = run_cmd(ps_cmd, capture=False)
            if result.returncode == 0:
                log_ok("uv installe avec succes")
                return True
            else:
                log_error(f"Echec installation uv: {result.stderr}")
                return False
        except Exception as e:
            log_error(f"Exception lors de l'installation de uv: {e}")
            return False
    else:
        # Linux/macOS : utiliser le script shell
        try:
            # Telecharger le script
            with urllib.request.urlopen(UV_INSTALL_URL) as response:
                script = response.read().decode("utf-8")
            
            # Executer le script
            result = run_cmd(["sh", "-c", script], capture=False)
            if result.returncode == 0:
                log_ok("uv installe avec succes")
                return True
            else:
                log_error(f"Echec installation uv: {result.stderr}")
                return False
        except Exception as e:
            log_error(f"Exception lors de l'installation de uv: {e}")
            return False


def verifier_chrome() -> tuple[bool, str | None]:
    """Verifie si Chrome/Chromium est installe.
    
    Returns:
        (trouve, chemin_ou_message)
    """
    executables = CHROME_EXECUTABLES.get(sys.platform, CHROME_EXECUTABLES["linux"])
    
    for exe in executables:
        if WINDOWS:
            # Sur Windows, chercher dans le PATH et les emplacements standards
            if shutil.which(exe):
                return True, exe
            # Verifier les emplacements d'installation typiques
            for base in [
                Path(os.environ.get("PROGRAMFILES", "C:\\Program Files")),
                Path(os.environ.get("PROGRAMFILES(X86)", "C:\\Program Files (x86)")),
                Path(os.environ.get("LOCALAPPDATA", "")) / "Google" / "Chrome" / "Application",
                Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "Edge" / "Application",
            ]:
                if base:
                    chrome_path = base / exe
                    if chrome_path.is_file():
                        return True, str(chrome_path)
            # Recherche specifique pour Edge (nom variable selon version)
            edge_base = Path(os.environ.get("PROGRAMFILES(X86)", "C:\\Program Files (x86)")) / "Microsoft" / "Edge" / "Application"
            if edge_base.is_dir():
                for edge_exe in edge_base.glob("msedge.exe"):
                    return True, str(edge_exe)
            edge_base_user = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "Edge" / "Application"
            if edge_base_user.is_dir():
                for edge_exe in edge_base_user.glob("msedge.exe"):
                    return True, str(edge_exe)
        else:
            # Linux/macOS
            if exe.startswith("/"):
                # Chemin absolu
                if Path(exe).is_file():
                    return True, exe
            else:
                # Dans le PATH
                if shutil.which(exe):
                    return True, exe
    
    return False, None


def afficher_instructions_chrome() -> None:
    """Affiche les instructions pour installer Chrome selon l'OS."""
    log_warn("Chrome/Chromium non trouve. Necessaire pour la generation PDF.")
    print()
    if WINDOWS:
        print("  Options d'installation :")
        print("  1. Google Chrome : https://www.google.com/chrome/")
        print("  2. Microsoft Edge (inclus dans Windows 10/11) : deja present")
        print("  3. Chromium : https://www.chromium.org/getting-involved/download-chromium/")
        print()
        print("  Si Edge est installe, md2pdf l'utilisera automatiquement.")
    elif MACOS:
        print("  Options d'installation :")
        print("  1. Google Chrome : https://www.google.com/chrome/")
        print("  2. Chromium : brew install --cask chromium")
        print("  3. Microsoft Edge : https://www.microsoft.com/edge/")
    else:
        print("  Options d'installation (selon votre distribution) :")
        print("  - Ubuntu/Debian : sudo apt install google-chrome-stable")
        print("    ou : sudo apt install chromium-browser")
        print("  - Fedora : sudo dnf install google-chrome-stable")
        print("  - Arch : sudo pacman -S google-chrome")
        print("  - Snap : sudo snap install chromium")
        print("  - Flatpak : flatpak install flathub com.google.Chrome")


def verifier_python() -> tuple[bool, str]:
    """Verifie la version de Python."""
    version = sys.version_info
    if version.major == 3 and version.minor >= 11:
        return True, f"Python {version.major}.{version.minor}.{version.micro}"
    return False, f"Python {version.major}.{version.minor}.{version.micro} (requis: 3.11+)"


def verifier_dependances_python() -> bool:
    """Verifie que les modules Python de base sont disponibles.
    
    Les dependances specifiques (Flask, pywebview, etc.) sont installees
    automatiquement par uv grace aux en-tetes PEP 723.
    """
    modules_requis = ["json", "pathlib", "subprocess", "threading", "argparse"]
    for mod in modules_requis:
        try:
            __import__(mod)
        except ImportError:
            log_error(f"Module Python manquant: {mod}")
            return False
    return True


def installer_complet(check_only: bool = False, uv_only: bool = False, chrome_only: bool = False) -> int:
    """Lance l'installation complete.
    
    Returns:
        0 si tout est OK, 1 si quelque chose manque (en mode --check)
    """
    print("=" * 60)
    print("  INSTALLATEUR INCIPIT")
    print("=" * 60)
    print()
    
    tout_ok = True
    
    # 1. Verifier Python
    log_info("Verification de Python...")
    py_ok, py_msg = verifier_python()
    if py_ok:
        log_ok(py_msg)
    else:
        log_error(py_msg)
        tout_ok = False
    
    # 2. Verifier les modules Python de base
    if verifier_dependances_python():
        log_ok("Modules Python de base presents")
    else:
        tout_ok = False
    
    # 3. Verifier/installer uv
    if not chrome_only:
        log_info("Verification de uv...")
        uv_path = trouver_uv()
        if uv_path:
            log_ok(f"uv trouve: {uv_path}")
            # Verifier la version
            result = run_cmd([str(uv_path), "--version"])
            if result.returncode == 0:
                log_ok(f"Version: {result.stdout.strip()}")
        else:
            log_warn("uv non trouve")
            if check_only:
                tout_ok = False
            else:
                if installer_uv():
                    # Re-verifier apres installation
                    uv_path = trouver_uv()
                    if uv_path:
                        log_ok(f"uv installe et trouve: {uv_path}")
                    else:
                        log_error("uv installe mais introuvable (redemarrez le terminal?)")
                        tout_ok = False
                else:
                    tout_ok = False
    
    # 4. Verifier Chrome/Chromium
    if not uv_only:
        log_info("Verification de Chrome/Chromium (pour PDF)...")
        chrome_ok, chrome_path = verifier_chrome()
        if chrome_ok:
            log_ok(f"Navigateur trouve: {chrome_path}")
        else:
            log_warn("Aucun navigateur Chrome/Chromium/Edge detecte")
            if not check_only:
                afficher_instructions_chrome()
            tout_ok = False
    
    print()
    print("=" * 60)
    if tout_ok:
        log_ok("TOUTES LES DEPENDANCES SONT SATISFAITES")
        print("=" * 60)
        return 0
    else:
        if check_only:
            log_error("DEPENDANCES MANQUANTES (mode --check)")
        else:
            log_warn("CERTAINES DEPENDANCES SONT MANQUANTES")
            print("L'application peut ne pas fonctionner correctement.")
        print("=" * 60)
        return 1


def main() -> None:
    import argparse
    
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true",
                        help="Verification seulement (code de sortie 0=OK, 1=manque)")
    parser.add_argument("--uv-only", action="store_true",
                        help="Installe/verifie seulement uv")
    parser.add_argument("--chrome-only", action="store_true",
                        help="Verifie seulement Chrome/Chromium")
    args = parser.parse_args()
    
    sys.exit(installer_complet(
        check_only=args.check,
        uv_only=args.uv_only,
        chrome_only=args.chrome_only
    ))


if __name__ == "__main__":
    main()
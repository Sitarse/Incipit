# Construit Incipit.exe : dist\Incipit\Incipit.exe, sans console,
# icone de l'app, `uv` embarque a cote pour que l'utilisateur final n'ait
# rien a installer (Chrome/Edge deja present sur toute machine Windows sert
# pour le PDF, c'est tout).
#
# Prerequis pour CONSTRUIRE (pas pour l'utilisateur final) : uv.
# Lancer :  powershell -File packaging\build_windows.ps1

$ErrorActionPreference = "Stop"
$racine = Split-Path -Parent $PSScriptRoot
Set-Location $racine

$uvBundle = "packaging\vendor\windows\uv.exe"
if (-not (Test-Path $uvBundle)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $uvBundle) | Out-Null
    Invoke-WebRequest -Uri "https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip" -OutFile "packaging\vendor\windows\uv.zip"
    Expand-Archive "packaging\vendor\windows\uv.zip" "packaging\vendor\windows" -Force
}

uv run --with pyinstaller --with flask --with pywebview pyinstaller app.py `
    --name Incipit --onedir --windowed --noconfirm `
    --icon "$racine\frontend\logo.ico" `
    --distpath dist --workpath build\windows --specpath packaging `
    --add-data "$racine\frontend;frontend" `
    --add-data "$racine\generator.py;." `
    --add-data "$racine\md2pdf.py;." `
    --add-data "$racine\exercices.py;." `
    --add-data "$racine\config\keys.env.example;config" `
    --add-binary "$racine\$uvBundle;."

Write-Host "`nOK : dist\Incipit\Incipit.exe"

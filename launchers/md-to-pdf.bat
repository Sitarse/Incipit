@echo off
rem Glisse un ou plusieurs .md sur ce fichier pour les convertir en PDF.
rem Ce script vit dans launchers\ : md2pdf.py est un cran au-dessus (%~dp0..).
rem D'abord, verifie/installe les dependances systeme via installer.py
setlocal

set "UV=%USERPROFILE%\.local\bin\uv.exe"
if not exist "%UV%" set "UV=uv"

rem Verifier les dependances (mode silencieux)
"%UV%" run --script "%~dp0..\installer.py" --check >nul 2>nul
if errorlevel 1 (
    echo Dependance(s) manquante(s), installation en cours...
    "%UV%" run --script "%~dp0..\installer.py"
    "%UV%" run --script "%~dp0..\installer.py" --check >nul 2>nul
    if errorlevel 1 (
        echo Erreur : impossible de satisfaire les dependances.
        pause
        exit /b 1
    )
)

if "%~1"=="" (
  echo Glisse un fichier .md sur ce script.
  pause
  exit /b 1
)

for %%F in (%*) do (
  echo Conversion de %%~nxF ...
  "%UV%" run "%~dp0..\md2pdf.py" "%%~fF"
)

echo.
echo Termine.
pause

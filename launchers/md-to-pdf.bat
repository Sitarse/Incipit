@echo off
rem Glisse un ou plusieurs .md sur ce fichier pour les convertir en PDF.
rem Ce script vit dans launchers\ : md2pdf.py est un cran au-dessus (%~dp0..).
setlocal

set "UV=%USERPROFILE%\.local\bin\uv.exe"
if not exist "%UV%" set "UV=uv"

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

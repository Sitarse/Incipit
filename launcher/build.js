// Le lanceur d'Incipit, refait : npm run launcher
// Incipit.exe (Lanceur.cs) est compilé avec le compilateur C# fourni avec Windows, avec le logo d'Incipit dedans
// (assets/icon.ico, le même que dans l'ancienne appli). Rien à installer.
const { execFile } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const ICON = path.join(ROOT, 'assets', 'icon.ico')
const CSC = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')

if (!fs.existsSync(CSC)) { console.error(`Échec : compilateur C# introuvable (${CSC})`); process.exit(1) }
if (!fs.existsSync(ICON)) { console.error(`Échec : ${ICON} est introuvable`); process.exit(1) }
execFile(CSC, ['/nologo', '/target:winexe', '/optimize+', '/codepage:65001', `/win32icon:${ICON}`, `/out:${path.join(ROOT, 'Incipit.exe')}`,
  '/r:System.Windows.Forms.dll', path.join(__dirname, 'Lanceur.cs')], { windowsHide: true }, (err, out) => {
  if (err) { console.error(`Échec : ${err.message}\n${out}`); process.exit(1) }
  console.log('Incipit.exe : le lanceur, avec le logo')
})

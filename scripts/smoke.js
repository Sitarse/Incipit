// Essai de démarrage de la vraie appli, hors écran : la fenêtre se charge, l'onglet Cours se dessine, aucune erreur dans la
// console. Sert à l'intégration continue (Windows, macOS, Linux : voir .github/workflows/build.yml) et à la main :
//   npm run smoke            (Linux sans écran : xvfb-run -a npm run smoke)
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const electron = require('electron') // le chemin de l'exécutable
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'incipit-smoke-'))
const r = spawnSync(electron, [path.join(__dirname, '..')], {
  env: { ...process.env, INCIPIT_SMOKE: path.join(dir, 'out'), INCIPIT_DATA: path.join(dir, 'data'), INCIPIT_NO_SANDBOX: '1' },
  encoding: 'utf8', timeout: 120_000,
})
const stateFile = path.join(dir, 'out', 'etat.json')
if (!fs.existsSync(stateFile)) { console.error(`Pas d'état : l'appli n'a pas démarré (code ${r.status}).\n${r.stdout}\n${r.stderr}`); process.exit(1) }
const { probe, errors } = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
const problems = []
if (!probe.cn) problems.push('l’onglet Cours ne s’est pas dessiné')
if (probe.api !== 'object') problems.push('window.api absent (le preload n’a pas chargé)')
if (!probe.today) problems.push('la colonne « Aujourd’hui » est vide')
if (errors.length) problems.push(`erreurs de console :\n  ${errors.join('\n  ')}`)
fs.rmSync(dir, { recursive: true, force: true })
if (problems.length) { console.error(`Essai de démarrage : ÉCHEC\n- ${problems.join('\n- ')}`); process.exit(1) }
console.log(`Essai de démarrage : OK (${process.platform})`)

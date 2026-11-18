// Lance chaque tests/*.test.js dans son processus ; échoue si l'un échoue
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort()
let bad = 0
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: 120_000 })
  if (r.status === 0) console.log(`ok      ${f}`)
  else { bad++; console.log(`ECHEC   ${f}\n${r.stdout}${r.stderr}`) }
}
console.log(`\n${files.length - bad} / ${files.length} fichiers de tests passent`)
process.exit(bad ? 1 : 0)

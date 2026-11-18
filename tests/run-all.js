// Lance chaque tests/*.test.js dans son processus ; échoue si l'un échoue
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

// Dans GitHub Actions, l'échec d'un test devient une annotation (visible dans l'onglet Actions et par l'API, sans ouvrir les
// journaux) : son message d'erreur, quelques lignes
const annotate = (file, text) => {
  if (!process.env.GITHUB_ACTIONS) return
  const lines = text.split(/\r?\n/).filter(l => l.trim()), i = lines.findIndex(l => /Error|ECHEC|assert/i.test(l))
  const msg = lines.slice(Math.max(0, i), Math.max(0, i) + 6).join('\n').slice(0, 900)
  console.log(`::error title=Test en échec : ${file}::${msg.replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A')}`)
}

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort()
let bad = 0
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: 120_000 })
  if (r.status === 0) console.log(`ok      ${f}`)
  else { bad++; console.log(`ECHEC   ${f}\n${r.stdout}${r.stderr}`); annotate(f, `${r.stderr}\n${r.stdout}${r.error ? `\n${r.error.message}` : ''}`) }
}
console.log(`\n${files.length - bad} / ${files.length} fichiers de tests passent`)
process.exit(bad ? 1 : 0)

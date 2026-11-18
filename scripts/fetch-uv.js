// Télécharge uv (astral.sh) dans build/uv/<système>-<arch>/ : electron-builder le livre avec l'appli (extraResources →
// resources/uv), pour que l'étudiant n'ait rien à installer. Le moteur Python d'Incipit se lance par uv.
//   node scripts/fetch-uv.js                  celui de ce système (sur macOS : Intel et Apple Silicon)
//   node scripts/fetch-uv.js linux-x64 mac-arm64
// Systèmes : win, mac, linux ; architectures : x64, arm64.
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const TRIPLES = {
  'win-x64': ['x86_64-pc-windows-msvc', 'zip'], 'win-arm64': ['aarch64-pc-windows-msvc', 'zip'],
  'linux-x64': ['x86_64-unknown-linux-gnu', 'tar.gz'], 'linux-arm64': ['aarch64-unknown-linux-gnu', 'tar.gz'],
  'mac-x64': ['x86_64-apple-darwin', 'tar.gz'], 'mac-arm64': ['aarch64-apple-darwin', 'tar.gz'],
}
const OUT = path.join(__dirname, '..', 'build', 'uv')

const here = () => {
  const sys = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform], arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return sys === 'mac' ? ['mac-x64', 'mac-arm64'] : [`${sys}-${arch}`] // un .dmg se fait pour les deux architectures
}
// Le fichier uv (ou uv.exe) quelque part dans le dossier déballé
function find(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { const f = find(p); if (f) return f } else if (e.name === 'uv' || e.name === 'uv.exe') return p
  }
  return null
}
function extract(archive, dir, ext) {
  // tar sait lire les .tar.gz partout, et les .zip sous Windows et macOS (bsdtar) ; sous Linux, unzip
  if (ext === 'zip' && process.platform === 'linux') execFileSync('unzip', ['-o', '-q', archive, '-d', dir])
  else execFileSync('tar', ['-xf', archive, '-C', dir])
}

async function fetchOne(key) {
  const entry = TRIPLES[key]
  if (!entry) throw new Error(`Système inconnu : ${key} (${Object.keys(TRIPLES).join(', ')})`)
  const [triple, ext] = entry, target = path.join(OUT, key), bin = path.join(target, key.startsWith('win') ? 'uv.exe' : 'uv')
  if (fs.existsSync(bin)) { console.log(`${key} : déjà là`); return }
  const url = `https://github.com/astral-sh/uv/releases/latest/download/uv-${triple}.${ext}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} : ${res.status}`)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'incipit-uv-')), archive = path.join(tmp, `uv.${ext}`)
  try {
    fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()))
    const dir = path.join(tmp, 'x')
    fs.mkdirSync(dir)
    extract(archive, dir, ext)
    const found = find(dir)
    if (!found) throw new Error(`uv introuvable dans ${url}`)
    fs.mkdirSync(target, { recursive: true })
    fs.copyFileSync(found, bin)
    fs.chmodSync(bin, 0o755)
    console.log(`${key} : ${bin}`)
  } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
}

;(async () => {
  const keys = process.argv.length > 2 ? process.argv.slice(2) : here()
  for (const k of keys) await fetchOne(k)
})().catch(err => { console.error(err.message); process.exit(1) })

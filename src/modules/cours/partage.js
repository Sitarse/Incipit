// Le fichier .incipit : un cours en un seul fichier, lisible et importable par Hitodama comme par Incipit (les deux
// partagent ce fichier à l'identique). C'est une archive zip (app/zip.js) : incipit.json (le manifeste : format, matière,
// type, titre, appli qui l'a écrit) + tout ce qui accompagne le cours, rangé comme dans son dossier (lib.companions) :
//   CM - Titre.md, CM - Titre.pdf, _fiche.md, _sujet.md, _cartes.md, .tp/…_cartes.json, .tp/…_exercices.json, _img/…
// Pur (pas d'Electron) : testé dans tests/partage.test.js. Prudent avec ce qu'il reçoit : zip.read refuse chemins
// dangereux et archives gonflées, et seuls les types de fichiers d'un cours passent (jamais un .bat ni un script).
const fs = require('node:fs')
const path = require('node:path')
const zip = require('../../app/zip')
const lib = require('./lib')

const EXT = '.incipit'
const FORMAT = 1
const MANIFEST = 'incipit.json'
const LIMITS = { maxFiles: 500, maxTotal: 256 << 20, maxFile: 96 << 20 }
const ALLOWED = new Set(['.md', '.pdf', '.json', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic'])

const isIncipit = p => typeof p === 'string' && p.toLowerCase().endsWith(EXT)

// Les fichiers d'un dossier, récursivement : chemins relatifs, en « / »
function walk(dir, rel = '') {
  let out = []
  let entries = []
  try { entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) out = out.concat(walk(dir, r))
    else if (e.isFile()) out.push(r)
  }
  return out
}

// Le cours (son chemin .md) et sa matière/type/titre -> le contenu de l'archive
function pack(course, who, from = 'hitodama') {
  const dir = path.dirname(course), c = lib.companions(course)
  const names = [path.basename(course)]
  for (const [key, file] of Object.entries(c)) {
    if (key === 'lanceur' || !fs.existsSync(file)) continue
    names.push(path.relative(dir, file).split(path.sep).join('/'))
  }
  names.push(...walk(dir, `_img/${lib.slug(lib.getTitre(who.titre))}`))
  const files = [...new Set(names)].filter(n => ALLOWED.has(path.extname(n).toLowerCase())).map(name => ({ name, data: fs.readFileSync(path.join(dir, name)) }))
  if (files.reduce((s, f) => s + f.data.length, 0) > LIMITS.maxTotal) throw new Error('Ce cours est trop gros pour un fichier .incipit (256 Mo au plus).')
  const manifest = { format: FORMAT, from, matiere: who.matiere, type: who.type, titre: who.titre }
  return zip.write([{ name: MANIFEST, data: Buffer.from(JSON.stringify(manifest, null, 2)) }, ...files])
}

// L'archive lue et vérifiée : { who, files, tp } ; tp : le cours porte un TP (du code s'exécutera chez toi)
function unpack(buf) {
  const all = zip.read(buf, LIMITS)
  const head = all.find(f => f.name === MANIFEST)
  let m
  try { m = JSON.parse(head?.data.toString('utf8')) } catch { m = null }
  if (!m || typeof m !== 'object') throw new Error('Ce fichier n’est pas un cours Incipit.')
  if (!Number.isInteger(m.format) || m.format < 1) throw new Error('Ce fichier n’est pas un cours Incipit.')
  if (m.format > FORMAT) throw new Error('Ce cours vient d’une version plus récente : mets ton appli à jour pour l’ouvrir.')
  if (typeof m.type !== 'string' || lib.getType(m.type) !== m.type.trim().toUpperCase()) throw new Error('Type de cours inconnu dans ce fichier.')
  const who = { matiere: lib.getMatiere(m.matiere), type: lib.getType(m.type), titre: lib.getTitre(m.titre) }
  const stem = `${who.type} - ${who.titre}`
  const files = all.filter(f => f !== head)
  if (!files.some(f => f.name === `${stem}.md`)) throw new Error('Le cours est introuvable dans ce fichier.')
  for (const f of files) {
    const n = f.name, ok = n === `${stem}.md` || n === `${stem}.pdf` || n.startsWith(`${stem}_`) || n.startsWith(`.tp/${stem}_`) || n.startsWith('_img/')
    if (!ok || !ALLOWED.has(path.extname(n).toLowerCase())) throw new Error(`Fichier inattendu dans ce cours : ${n}`)
  }
  return { who, files, tp: files.some(f => f.name.startsWith('.tp/') && f.name.endsWith('_exercices.json')), from: typeof m.from === 'string' ? m.from.slice(0, 40) : '' }
}

// Le cours déjà là (dans la destination), ou null
const existing = (dest, who) => {
  const f = lib.courseFile(dest, who.matiere, who.type, who.titre)
  return fs.existsSync(f) ? f : null
}

// Pose le cours dans la destination, à la place de celui du même nom si replace ; rend le chemin de la note, ou
// { exists } si le cours est déjà là et qu'on n'a pas dit de le remplacer
function install(dest, unpacked, replace = false) {
  const { who, files } = unpacked
  const there = existing(dest, who)
  if (there && !replace) return { exists: there }
  const course = there ?? lib.courseFile(dest, who.matiere, who.type, who.titre, () => false) // un cours neuf a son dossier
  const dir = path.dirname(course)
  for (const f of files) {
    const target = path.join(dir, f.name)
    if (!lib.isInside(dir, target)) throw new Error(`Chemin refusé : ${f.name}`)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, f.data)
  }
  return { course }
}

module.exports = { EXT, FORMAT, MANIFEST, isIncipit, pack, unpack, install, existing }

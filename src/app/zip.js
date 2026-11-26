const zlib = require('node:zlib')

// Archives zip, juste ce qu'il faut pour les fichiers .incipit (modules/cours/partage.js) : lire une archive faite par n'importe quel
// outil (l'Explorateur de Windows, 7-Zip, Compress-Archive…) et en écrire une. Prudent avec ce qu'il lit : pas de
// chemin qui sort du dossier, pas de lien, pas d'archive chiffrée, des tailles plafonnées (une petite archive qui
// gonflerait à l'infini est refusée), chaque fichier vérifié par sa somme de contrôle. Pur : testé dans tests/zip.test.js.

class ZipError extends Error {}
const LOCAL = 0x04034b50, CENTRAL = 0x02014b50, END = 0x06054b50

// Un chemin d'archive sans danger (« dossier/fichier.js »), ou null : relatif, sans « .. », sans lecteur, sans caractère
// interdit par Windows
function safeName(name) {
  const n = String(name).replace(/\\/g, '/')
  if (!n || n.length > 240 || n.startsWith('/') || /[\x00-\x1f<>:"|?*]/.test(n)) return null
  const parts = n.split('/')
  if (parts.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(p))) return null
  return n
}

// Les fichiers de l'archive : [{ name, data }] (les dossiers vides sont ignorés)
function read(buf, { maxFiles = 2000, maxTotal = 64 << 20, maxFile = 32 << 20 } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new ZipError('Ce fichier n’est pas une archive.')
  let end = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) if (buf.readUInt32LE(i) === END) { end = i; break }
  if (end < 0) throw new ZipError('Ce fichier n’est pas une archive.')
  const count = buf.readUInt16LE(end + 10), size = buf.readUInt32LE(end + 12), at = buf.readUInt32LE(end + 16)
  if (count === 0xffff || at === 0xffffffff) throw new ZipError('Archive trop grande.')
  if (count > maxFiles) throw new ZipError(`Trop de fichiers dans l’archive (plus de ${maxFiles}).`)
  if (at + size > end) throw new ZipError('Archive abîmée.')
  const files = [], seen = new Set()
  let p = at, total = 0
  for (let n = 0; n < count; n++) {
    if (p + 46 > end || buf.readUInt32LE(p) !== CENTRAL) throw new ZipError('Archive abîmée.')
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16)
    const packed = buf.readUInt32LE(p + 20), unpacked = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), noteLen = buf.readUInt16LE(p + 32)
    const attrs = buf.readUInt32LE(p + 38), local = buf.readUInt32LE(p + 42)
    const raw = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + noteLen
    if (flags & 1) throw new ZipError('Archive chiffrée : impossible de l’ouvrir.')
    if (((attrs >>> 16) & 0o170000) === 0o120000) throw new ZipError(`Lien refusé dans l’archive : ${raw}`)
    if (raw.endsWith('/') || raw.endsWith('\\')) continue // un dossier
    const name = safeName(raw)
    if (!name) throw new ZipError(`Chemin refusé dans l’archive : ${raw}`)
    if (seen.has(name.toLowerCase())) throw new ZipError(`Fichier en double dans l’archive : ${name}`)
    seen.add(name.toLowerCase())
    if (unpacked > maxFile || packed > maxFile) throw new ZipError(`Fichier trop gros dans l’archive : ${name}`)
    if ((total += unpacked) > maxTotal) throw new ZipError('Archive trop grosse une fois ouverte.')
    if (local + 30 > end || buf.readUInt32LE(local) !== LOCAL) throw new ZipError('Archive abîmée.')
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), body = buf.subarray(start, start + packed)
    if (body.length !== packed) throw new ZipError('Archive incomplète.')
    let data
    if (method === 0) data = Buffer.from(body)
    else if (method === 8) {
      try { data = zlib.inflateRawSync(body, { maxOutputLength: Math.max(1, unpacked) }) } catch { throw new ZipError(`Fichier illisible dans l’archive : ${name}`) }
    } else throw new ZipError(`Compression inconnue dans l’archive : ${name}`)
    if (data.length !== unpacked || zlib.crc32(data) !== crc) throw new ZipError(`Fichier abîmé dans l’archive : ${name}`)
    files.push({ name, data })
  }
  return files
}

// Une archive de ces fichiers ([{ name, data }]), compressés quand ça gagne de la place ; noms en UTF-8
function write(files, at = new Date()) {
  const time = (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1)
  const date = ((Math.max(1980, at.getFullYear()) - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate()
  const parts = [], central = []
  let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'), data = Buffer.from(f.data), crc = zlib.crc32(data)
    const deflated = zlib.deflateRawSync(data, { level: 9 }), method = deflated.length < data.length ? 8 : 0, body = method ? deflated : data
    const head = (size, sig) => {
      const h = Buffer.alloc(size)
      h.writeUInt32LE(sig, 0)
      const o = sig === LOCAL ? 4 : 6 // l'en-tête central a en plus « fait par »
      if (sig === CENTRAL) h.writeUInt16LE(20, 4)
      h.writeUInt16LE(20, o); h.writeUInt16LE(0x800, o + 2); h.writeUInt16LE(method, o + 4); h.writeUInt16LE(time, o + 6); h.writeUInt16LE(date, o + 8)
      h.writeUInt32LE(crc, o + 10); h.writeUInt32LE(body.length, o + 14); h.writeUInt32LE(data.length, o + 18); h.writeUInt16LE(name.length, o + 22)
      return h
    }
    const c = head(46, CENTRAL)
    c.writeUInt32LE(offset, 42)
    parts.push(head(30, LOCAL), name, body)
    central.push(c, name)
    offset += 30 + name.length + body.length
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22)
  end.writeUInt32LE(END, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, dir, end])
}

module.exports = { read, write, safeName, ZipError }

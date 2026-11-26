// Archives zip des modules .hito (zip.js) : aller-retour, et tout ce qu'une archive piégée ou abîmée tenterait
const assert = require('node:assert/strict')
const zlib = require('node:zlib')
const { read, write, safeName, ZipError } = require('../src/app/zip')

const files = [
  { name: 'module.json', data: Buffer.from(JSON.stringify({ id: 'essai', name: 'Essai' }, null, 2)) },
  { name: 'images/logo.svg', data: Buffer.from('<svg/>'.repeat(200)) }, // se compresse
  { name: 'vide.txt', data: Buffer.alloc(0) },
  { name: 'données/é.txt', data: Buffer.from('accentué ✓') }, // noms en UTF-8
  { name: 'bruit.bin', data: require('node:crypto').randomBytes(3000) }, // ne se compresse pas : gardé tel quel
]
const zip = write(files)
assert.deepEqual(read(zip).map(f => [f.name, f.data.toString('hex')]), files.map(f => [f.name, f.data.toString('hex')]))

// Chemins
assert.equal(safeName('a/b.js'), 'a/b.js')
assert.equal(safeName('a\\b.js'), 'a/b.js')
for (const bad of ['../x', 'a/../x', '/x', 'C:/x', 'c:x', 'a//b', 'a/./b', 'x.', 'x ', 'nul', 'CON.txt', 'a\x01b', 'a*b', ''])
  assert.equal(safeName(bad), null, bad)
const trap = write([{ name: '../hors.txt', data: Buffer.from('x') }])
assert.throws(() => read(trap), /Chemin refusé/)
assert.throws(() => read(write([{ name: 'a.txt', data: Buffer.from('1') }, { name: 'A.TXT', data: Buffer.from('2') }])), /en double/)

// Limites : nombre, taille d'un fichier, taille totale
assert.throws(() => read(zip, { maxFiles: 2 }), /Trop de fichiers/)
assert.throws(() => read(zip, { maxFile: 100 }), /trop gros/)
assert.throws(() => read(zip, { maxTotal: 1000 }), /trop grosse/)

// Bombe : une archive qui annonce 10 octets mais en déborde (inflate est arrêté à la taille annoncée)
const big = Buffer.alloc(1 << 20)
const bomb = write([{ name: 'bombe.txt', data: big }])
const lie = Buffer.from(bomb), central = lie.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
lie.writeUInt32LE(10, central + 24) // taille décompressée annoncée dans le répertoire central
assert.throws(() => read(lie), /illisible|abîmé/)

// Abîmée : somme de contrôle, données tronquées, pas une archive
const broken = Buffer.from(zip)
broken[60] ^= 0xff
assert.throws(() => read(broken), ZipError)
assert.throws(() => read(zip.subarray(0, zip.length - 30)), ZipError)
assert.throws(() => read(Buffer.from('pas une archive du tout, juste du texte')), /pas une archive/)
assert.throws(() => read('texte'), /pas une archive/)

// Chiffrée (drapeau 1) : refusée
const locked = Buffer.from(write([{ name: 'a.txt', data: Buffer.from('secret') }]))
locked.writeUInt16LE(1 | 0x800, locked.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 8)
assert.throws(() => read(locked), /chiffrée/)

// Une archive d'un autre outil : données décrites après coup (drapeau 8), dossiers explicites, noms en latin1
const name = Buffer.from('dossier/note.txt'), data = Buffer.from('bonjour bonjour bonjour'), body = zlib.deflateRawSync(data)
const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 6); lh.writeUInt16LE(8, 8); lh.writeUInt16LE(name.length, 26)
const dd = Buffer.alloc(16); dd.writeUInt32LE(0x08074b50, 0); dd.writeUInt32LE(zlib.crc32(data), 4); dd.writeUInt32LE(body.length, 8); dd.writeUInt32LE(data.length, 12)
const dirName = Buffer.from('dossier/'), dirLocal = Buffer.alloc(30); dirLocal.writeUInt32LE(0x04034b50, 0); dirLocal.writeUInt16LE(dirName.length, 26)
const cen = (n, offset, crc, packed, unpacked, method, flags) => {
  const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(flags, 8); c.writeUInt16LE(method, 10); c.writeUInt32LE(crc, 16)
  c.writeUInt32LE(packed, 20); c.writeUInt32LE(unpacked, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42); return Buffer.concat([c, n])
}
const fileAt = dirLocal.length + dirName.length
const dir = Buffer.concat([cen(dirName, 0, 0, 0, 0, 0, 0), cen(name, fileAt, zlib.crc32(data), body.length, data.length, 8, 8)])
const head = Buffer.concat([dirLocal, dirName, lh, name, body, dd])
const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(2, 8); eocd.writeUInt16LE(2, 10); eocd.writeUInt32LE(dir.length, 12); eocd.writeUInt32LE(head.length, 16)
assert.deepEqual(read(Buffer.concat([head, dir, eocd])).map(f => [f.name, f.data.toString()]), [['dossier/note.txt', 'bonjour bonjour bonjour']])

console.log('archives zip : tous les tests passent')

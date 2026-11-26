// Le fichier .incipit (modules/cours/partage.js) : un cours exporté se réimporte à l'identique, et une archive hostile
// est refusée. Le même test tourne dans Incipit : c'est lui qui garantit que les deux applis se lisent.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zip = require('../src/app/zip')
const lib = require('../src/modules/cours/lib')
const partage = require('../src/modules/cours/partage')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'partage-'))
const put = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const who = { matiere: 'Algo', type: 'CM', titre: 'Les piles' }

try {
  // Un cours complet chez « lui » : note, PDF, fiche, cartes, TP, une photo, et un lanceur qui ne doit pas voyager
  const a = path.join(tmp, 'a'), course = lib.courseFile(a, who.matiere, who.type, who.titre, () => false), c = lib.companions(course)
  put(course, '---\ntitre: Les piles\n---\n# Les piles\n')
  put(c.pdf, 'PDF'); put(c.fiche, 'fiche'); put(c.cartesJson, '[{"recto":"q","verso":"r"}]'); put(c.exercices, '[]'); put(c.lanceur, 'echo pas moi')
  put(path.join(lib.imagesDir(course, who.titre), 'photo.jpg'), 'JPG')
  put(path.join(path.dirname(course), 'notes-perso.txt'), 'pas dans le cours')

  const buf = partage.pack(course, who, 'hitodama')
  const un = partage.unpack(buf)
  assert.deepEqual(un.who, who)
  assert.equal(un.tp, true)
  assert.equal(un.from, 'hitodama')
  const names = un.files.map(f => f.name).sort()
  assert.ok(names.includes('CM - Les piles.md') && names.includes('.tp/CM - Les piles_exercices.json') && names.includes('_img/les-piles/photo.jpg'))
  assert.ok(!names.some(n => n.endsWith('.bat') || n.endsWith('.txt')), 'ni lanceur ni fichier étranger')

  // Importé chez « elle » : mêmes fichiers, au même endroit relatif ; un second import demande avant d'écraser
  const b = path.join(tmp, 'b')
  const r = partage.install(b, un)
  assert.equal(r.course, lib.courseFile(b, who.matiere, who.type, who.titre, () => false))
  assert.equal(fs.readFileSync(lib.companions(r.course).exercices, 'utf8'), '[]')
  assert.equal(fs.readFileSync(path.join(lib.imagesDir(r.course, who.titre), 'photo.jpg'), 'utf8'), 'JPG')
  assert.ok(lib.identity(b, r.course), 'le cours importé est retrouvé par la bibliothèque')
  assert.deepEqual(partage.install(b, un), { exists: r.course })
  fs.writeFileSync(r.course, 'modifié')
  assert.equal(partage.install(b, un, true).course, r.course)
  assert.match(fs.readFileSync(r.course, 'utf8'), /Les piles/)

  // Un cours écrit à plat (anciennes versions) est remplacé là où il est, sans doublon
  const f = path.join(tmp, 'f'), flat = lib.courseFile(f, who.matiere, who.type, who.titre, () => true)
  put(flat, 'vieux')
  assert.equal(partage.install(f, un, true).course, flat)
  assert.ok(!fs.existsSync(path.join(f, who.matiere, 'CM - Les piles')), 'pas de second dossier')

  // Refusés : pas une archive, pas de manifeste, format futur, type inconnu, fichier dangereux ou étranger
  const man = o => ({ name: partage.MANIFEST, data: Buffer.from(JSON.stringify({ format: 1, ...who, ...o })) })
  const note = { name: 'CM - Les piles.md', data: Buffer.from('# x') }
  const bad = (files, re) => assert.throws(() => partage.unpack(zip.write(files)), re)
  assert.throws(() => partage.unpack(Buffer.from('pas un zip du tout, vraiment pas')), /archive/)
  bad([note], /pas un cours Incipit/)
  bad([man({ format: 2 }), note], /version plus récente/)
  bad([man({ type: 'XX' }), note], /Type de cours/)
  bad([man({ titre: 'Autre' }), note], /introuvable/)
  bad([man(), note, { name: 'CM - Les piles_TP.bat', data: Buffer.from('calc') }], /inattendu/)
  bad([man(), note, { name: 'autre.md', data: Buffer.from('x') }], /inattendu/)
  bad([man(), note, { name: '_img/x.exe', data: Buffer.from('x') }], /inattendu/)
  bad([man(), note, { name: '../evil.md', data: Buffer.from('x') }], /refusé/)
  // Un titre piégé dans le manifeste ne sort jamais de la destination
  const sneaky = partage.unpack(zip.write([man({ matiere: '..', titre: '..\\..\\x' }), { name: 'CM - x.md', data: Buffer.from('#') }]))
  assert.ok(lib.isInside(b, partage.install(b, sneaky).course))

  assert.equal(partage.isIncipit('C:\\x\\Cours.INCIPIT'), true)
  assert.equal(partage.isIncipit('cours.hito'), false)
  assert.equal(partage.isIncipit(42), false)
} finally { fs.rmSync(tmp, { recursive: true, force: true }) }

console.log('partage : tous les tests passent')

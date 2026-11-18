// « Pour aller plus loin » (modules/cours/ressources.js) : la part pure — reconnaître une vidéo YouTube, lire un temps,
// trouver les chapitres d'une description, nettoyer ce que Claude renvoie. La recherche elle-même (Claude, réseau) ne
// tourne pas ici.
const assert = require('node:assert/strict')
const Module = require('node:module')
// electron n'existe pas sous node : ressources.js n'en prend que net, inutile pour la part pure
const load = Module._load
Module._load = (req, ...rest) => (req === 'electron' ? { net: {} } : load(req, ...rest))
const { ytId, seconds, clock, chaptersOf, clean, withTime } = require('../src/modules/cours/ressources')
Module._load = load

assert.equal(ytId('https://www.youtube.com/watch?v=XEa09E2yKl4'), 'XEa09E2yKl4')
assert.equal(ytId('https://youtu.be/XEa09E2yKl4?t=42'), 'XEa09E2yKl4')
assert.equal(ytId('https://www.youtube.com/watch?feature=share&v=gMPUFJfcIU4'), 'gMPUFJfcIU4')
assert.equal(ytId('https://www.youtube.com/shorts/gMPUFJfcIU4'), 'gMPUFJfcIU4')
assert.equal(ytId('https://cplusplus.com/doc/tutorial/exceptions'), null)

assert.equal(seconds('7:55'), 475); assert.equal(seconds('1:02:03'), 3723); assert.equal(seconds(''), null); assert.equal(seconds('7 min'), null)
assert.equal(clock(475), '7:55'); assert.equal(clock(3723), '1:02:03'); assert.equal(clock(5), '0:05')

const desc = 'Dans cette vidéo…\n\n0:00 Introduction\n1:35 What is an exception?\n3:17 - Introduction to try and catch blocks\n(11:44) Catching an exception\nAbonne-toi !'
assert.deepEqual(chaptersOf(desc).map(c => [c.s, c.titre]), [[0, 'Introduction'], [95, 'What is an exception?'], [197, 'Introduction to try and catch blocks'], [704, 'Catching an exception']])
assert.deepEqual(chaptersOf('Le code à 3:17 montre…\n12:00 fin'), [], 'deux temps épars ne font pas des chapitres')
assert.deepEqual(chaptersOf('1:00 a\n2:00 b\n3:00 c'), [], 'des chapitres commencent au début de la vidéo')

const v = clean({ type: 'site', titre: 'Try', url: 'https://youtu.be/XEa09E2yKl4', debut: '3:17', pourquoi: 'x' })
assert.equal(v.type, 'video', 'une adresse YouTube est une vidéo, quoi qu’en dise le modèle')
assert.equal(v.url, 'https://www.youtube.com/watch?v=XEa09E2yKl4'); assert.equal(v.debut, 197)
assert.equal(withTime(v.url, v.debut), 'https://www.youtube.com/watch?v=XEa09E2yKl4&t=197s')
assert.equal(clean({ url: 'javascript:alert(1)' }), null, 'seulement http(s)')
assert.equal(clean({ url: 'pas une adresse' }), null)
const s = clean({ type: 'site', titre: '', url: 'https://www.cplusplus.com/doc/tutorial/exceptions/', pourquoi: 'y' })
assert.equal(s.site, 'cplusplus.com'); assert.equal(s.titre, 'www.cplusplus.com'); assert.equal(s.debut, null)
console.log('ressources : ok')

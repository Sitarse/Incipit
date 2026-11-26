// L'onglet Pile de l'IDE (modules/cours/ide-mem.js) : les pas d'un programme (le format commun des traceurs) deviennent
// un schéma « memoire » : cadres empilés, tas, flèches, ce qui vient de changer mis en avant, une légende par pas.
const assert = require('node:assert/strict')
const M = require('../src/modules/cours/ide-mem')
const S = require('../src/modules/cours/schemas')

const fr = (func, vars = {}) => ({ func, line: 1, file: 'main.py', vars: Object.entries(vars).map(([nom, v]) => ({ nom, v })) })
const st = (frames, o = {}) => ({ line: 1, file: 'main.py', event: 'line', out: '', frames, heap: {}, ...o })
const T = t => ({ t })
const draw = (spec, k = 0) => S.render(spec, { libre: true, theme: 'css', step: k })
const varOf = (spec, k, ci, nom) => spec.etapes[k].cadres[ci].variables.find(v => v.nom === nom)

// programme sans variable : un cadre vide, dessiné
const vide = M.toSpec([st([fr('programme')])])
assert.equal(vide.type, 'memoire'); assert.equal(vide.etapes.length, 1)
assert.equal(vide.etapes[0].cadres.length, 1); assert.equal(vide.etapes[0].cadres[0].variables.length, 0)
draw(vide)

// nouvel appel : le cadre en avant, la légende le dit
const appel = M.toSpec([st([fr('programme')]), st([fr('programme'), fr('carre', { n: T('7') })])])
assert.equal(appel.etapes[1].cadres[1].nom, 'carre()'); assert.equal(appel.etapes[1].cadres[1].ton, 'accent')
assert.equal(appel.etapes[1].legende, 'carre() est appelée')

// valeur changée
const chg = M.toSpec([st([fr('programme', { x: T('2') })]), st([fr('programme', { x: T('3') })])])
assert.equal(varOf(chg, 1, 0, 'x').ton, 'accent')
assert.match(chg.etapes[1].legende, /x passe de 2 à 3/)
assert.equal(varOf(chg, 0, 0, 'x').ton, undefined, 'au premier pas, rien n’est « changé »')

// retour : la valeur renvoyée sur le cadre
const ret = M.toSpec([st([fr('programme'), fr('carre', { n: T('7') })]), st([fr('programme'), fr('carre', { n: T('7') })], { event: 'return', ret: '49' })])
assert.equal(ret.etapes[1].cadres[1].note, '→ 49'); assert.equal(ret.etapes[1].legende, 'carre() renvoie 49')

// exception
const exc = M.toSpec([st([fr('programme')]), st([fr('programme')], { event: 'exception', exc: 'ZeroDivisionError: division by zero' })])
assert.equal(exc.etapes[1].cadres[0].ton, 'erreur'); assert.match(exc.etapes[1].legende, /ZeroDivisionError/)

// alias : une boîte, deux flèches
const heap = { o1: { classe: 'list', kind: 'liste', champs: [{ nom: '[0]', v: T('1') }] } }
const alias = M.toSpec([st([fr('programme', { a: { ref: 'o1' }, b: { ref: 'o1' } })], { heap })])
assert.deepEqual(alias.etapes[0].objets.map(o => o.id), ['o1'])
assert.equal(varOf(alias, 0, 0, 'a').vers, 'o1'); assert.equal(varOf(alias, 0, 0, 'b').vers, 'o1')
draw(alias)
// les légendes d'un alias et d'un élément ajouté
const two = { o1: { classe: 'list', kind: 'liste', champs: [{ nom: '[0]', v: T('1') }, { nom: '[1]', v: T('2') }] } }
const L1 = M.toSpec([st([fr('programme', { a: { ref: 'o1' } })], { heap }), st([fr('programme', { a: { ref: 'o1' }, b: { ref: 'o1' } })], { heap }), st([fr('programme', { a: { ref: 'o1' }, b: { ref: 'o1' } })], { heap: two })])
assert.equal(L1.etapes[0].legende, 'programme démarre')
assert.equal(L1.etapes[1].legende, 'b pointe vers le même objet que a')
assert.match(L1.etapes[2].legende, /list\[1\] ajouté : 2/)
assert.equal(M.toSpec([st([fr('main')]), st([fr('main', { p: { ref: 'o1' } })], { heap })]).etapes[1].legende, 'p pointe vers un objet list')
// au retour d'un appel : ce qui vient de changer dans l'appel qui reprend la main
const back = M.toSpec([st([fr('programme'), fr('carre', { n: T('7') })]), st([fr('programme', { x: T('49') })])])
assert.equal(back.etapes[1].legende, 'retour dans programme · x vaut 49')
// une variable static (ou globale) qui change : la légende le dit
const stat = M.toSpec([st([fr('main')], { statics: [{ nom: 'Compte.nb', v: T('0') }] }), st([fr('main')], { statics: [{ nom: 'Compte.nb', v: T('1') }] })])
assert.equal(stat.etapes[1].legende, 'Compte.nb passe de 0 à 1')
// les pointeurs dits par ce qu'ils visent, jamais par une adresse
const leg = (a, b, h = heap) => M.toSpec([st([fr('main', a)], { heap: h }), st([fr('main', b)], { heap: h })]).etapes[1].legende
assert.equal(leg({}, { q: { sref: [0, 't', '1'] } }), 'q pointe vers t[1]')
assert.equal(leg({}, { q: { sref: [0, 's', 'x'] } }), 'q pointe vers s.x')
assert.equal(leg({ n: { ref: 'o1' } }, { n: { nul: true } }), 'n vaut maintenant null')
assert.equal(leg({ c: { sref: [0, 'a'] } }, { c: { sref: [0, 'b'] } }), 'c pointe maintenant vers b')
assert.equal(leg({}, { u: { inv: 'non-init' } }), 'u est déclaré sans valeur')
assert.doesNotMatch(leg({ p: { ref: 'o1' } }, { p: { inv: 'libere' } }), /o1|→/, 'pas d’identifiant interne dans la légende')

// pointeur vers une case d'un tableau local
const tab = { champs: [{ nom: '[0]', v: T('1') }, { nom: '[1]', v: T('2') }] }
const sref = M.toSpec([st([fr('main', { t: tab, q: { sref: [0, 't', '1'] } })])])
assert.deepEqual(varOf(sref, 0, 0, 'q').versVar, [0, 't', '1']); assert.equal(varOf(sref, 0, 0, 't').champs.length, 2)
draw(sref)

// pointeur invalide : pas de flèche, la case le dit
const pend = varOf(M.toSpec([st([fr('main', { p: { inv: 'pendant' } })])]), 0, 0, 'p')
assert.equal(pend.valeur, 'pendant'); assert.equal(pend.ton, 'erreur'); assert.equal(pend.vers, undefined)

// libéré, fuite : montrés même sans flèche vers eux
const lib = M.toSpec([st([fr('main')], { heap: { h1: { classe: 'Point', kind: 'objet', champs: [], etat: 'libere' }, h2: { classe: 'int[4]', kind: 'tableau', champs: [], etat: 'fuite' } } })])
const [o1, o2] = lib.etapes[0].objets
assert.equal(o1.ton, 'discret'); assert.equal(o1.note, 'libéré'); assert.equal(o2.ton, 'erreur'); assert.equal(o2.note, 'fuite')

// récursion plafonnée : 6 cadres + « … n appels plus bas »
const deep = M.toSpec([st([fr('main'), ...Array.from({ length: 10 }, (_, i) => fr('fact', { n: T(String(10 - i)) }))])])
assert.equal(deep.etapes[0].cadres.length, 7); assert.equal(deep.etapes[0].cadres[0].nom, '… 5 appels plus bas')

// plafonds : 12 objets montrés, valeurs coupées à 28 caractères, objets sans flèche cachés
const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`o${i}`, { classe: 'P', kind: 'objet', champs: [] }]))
const vars10 = k => Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`v${k * 10 + i}`, { ref: `o${k * 10 + i}` }]))
const cap = M.toSpec([st([fr('main', vars10(0)), fr('f', vars10(1))], { heap: many })])
assert.equal(cap.etapes[0].objets.length, 13); assert.equal(cap.etapes[0].objets[12].classe, '… 8 autres objets')
assert.equal(cap.etapes[0].cadres[1].variables.filter(v => v.vers).length, 2, 'les variables vers un objet caché n’ont pas de flèche')
draw(cap)
const long = varOf(M.toSpec([st([fr('main', { s: T('x'.repeat(40)) })])]), 0, 0, 's')
assert.equal(long.valeur.length, 28); assert.ok(long.valeur.endsWith('…'))
assert.equal(M.toSpec([st([fr('main')], { heap: { seul: { classe: 'P', kind: 'objet', champs: [] } } })]).etapes[0].objets.length, 0)

// le repli texte (le dessin a échoué)
assert.equal(M.textOf({ ref: 'o1' }), '→ o1'); assert.equal(M.textOf({ inv: 'pendant' }), 'pendant')
assert.equal(M.textOf({ champs: [{ nom: 'x', v: T('1') }] }), '{x = 1}'); assert.equal(M.textOf({ nul: true }), 'null')

console.log('ide-mem : ok')

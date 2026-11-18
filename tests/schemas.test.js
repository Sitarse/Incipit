// Les schémas des cours (modules/cours/schemas, schemas-cours.js) : chaque exemple du guide donné à l'IA se dessine,
// chaque type et chaque étape sans valeur manquante, un schéma faux est refusé avec sa raison, et le .md d'un cours
// est transformé sans rien perdre (bloc -> commentaire + image ; schéma faux retiré avec sa légende).
const assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const S = require('../src/modules/cours/schemas')
const schemas = require('../src/modules/cours/schemas-cours')

const drawAll = (spec, label) => {
  const fixe = S.render(spec), lecteur = S.render(spec, { theme: 'css', step: 0 })
  assert.match(fixe.svg, /^<svg [^>]*viewBox="0 0 \d+ \d+"/, label)
  assert.ok(fixe.width > 40 && fixe.height > 30 && fixe.width < 2400 && fixe.height < 2400, `${label} : ${fixe.width}x${fixe.height}`)
  assert.ok(!/--s-bg:#/.test(lecteur.svg), `${label} : le lecteur donne ses couleurs`)
  for (let i = 0; i < fixe.steps; i++) S.render(spec, { theme: 'css', step: i })
  return fixe
}

// 1. Le guide : chaque exemple est un schéma valide qui se dessine
const guide = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'cours', 'engine', 'config', 'schemas.md'), 'utf8').replace(/\r\n/g, '\n') // Windows peut rendre des \r\n au clonage
const examples = [...guide.matchAll(/```schema\n([\s\S]*?)\n```/g)].map(m => S.parse(m[1]))
assert.ok(examples.length >= 12, `exemples du guide : ${examples.length}`)
const seen = new Set()
for (const e of examples) {
  const v = S.validate(e)
  assert.ok(v.ok, `guide, ${e.type} : ${v.errors?.join(' ; ')}`)
  drawAll(e, `guide ${e.type}`); seen.add(v.spec.type)
}
assert.deepEqual([...seen].sort(), Object.keys(S.types).sort(), 'le guide montre chaque type')

// 2. Des schémas plus riches, comme ceux des vrais cours
const rich = [
  { type: 'pile', nom: 'Objets', etapes: [{ pile: ['#0'] }, { pile: ['#0', { texte: '#1', note: 'throw 3', ton: 'erreur' }] }, { pile: [], sortie: 'caught 3' }, { pile: ['a'] }, { pile: ['a', 'b'] }] },
  { type: 'memoire', variables: [{ nom: 'tete', vers: 'n1' }], objets: [{ id: 'n1', classe: 'Noeud', champs: [['v', '4'], { nom: 'suivant', vers: 'n2' }] }, { id: 'n2', classe: 'Noeud', champs: [{ nom: 'suivant', vers: null }] }] },
  { type: 'zones', zones: [{ id: 'm', titre: 'Moteur', icone: 'engrenage', elements: ['Heap', 'Call Stack'] }, { id: 'f', titre: 'File', sens: 'ligne', elements: ['cb1()', 'cb2()'] }], disposition: [['m'], ['f']], liens: [{ de: 'cb1()', vers: 'Call Stack', texte: 'event loop', ton: 'accent' }, { de: 'Heap', vers: 'Call Stack', pointille: true }] },
  { type: 'courbe', series: [{ histogramme: { bornes: [0, 10, 20, 40], effectifs: [3, 7, 4], densite: true } }], zones: [{ de: 10, a: 20, texte: 'classe modale' }] },
  { type: 'courbe', series: [{ barres: { categories: ['A', 'B', 'C'], valeurs: [3, 5, 2] } }] },
  { type: 'courbe', series: [{ loi: 'poisson', lambda: 3 }, { loi: 'exponentielle', lambda: 0.5, texte: 'expo' }], reperes: [{ y: 0.1, texte: 'seuil' }] },
  { type: 'cycle', forme: 'cascade', retours: true, phases: ['A', 'B', 'C'] },
  { type: 'cycle', forme: 'spirale', quadrants: ['1', '2', '3', '4'], tours: 2 },
  { type: 'cycle', forme: 'frise', unite: 'sem.', phases: [{ texte: 'Analyse', duree: 2 }, { texte: 'Code', duree: 6 }, { texte: 'Fin', duree: 1 }], jalons: [{ a: 2, texte: 'revue' }] },
  { type: 'arbre', sens: 'droite', liens: 'fleche', racine: { texte: 'src', enfants: ['main.c', { texte: 'lib', enfants: ['a.c', 'b.c'] }] } },
]
for (const spec of rich) drawAll(spec, `riche ${spec.type}`)
// La pile : image fixe = toutes les étapes côte à côte ; lecteur = une étape
assert.ok(S.render(rich[0]).width > S.render(rich[0], { step: 1 }).width * 2)
assert.deepEqual(S.render(rich[0]).captions.length, 5)

// 3. Refus avec une raison, jamais un plantage
const bad = [
  [{ type: 'camembert' }, /type inconnu/],
  [{ type: 'zones', zones: [{ titre: 'A', elements: ['x'] }], liens: [{ de: 'x', vers: 'y' }] }, /y n'existe pas/],
  [{ type: 'memoire', variables: [{ nom: 'p', vers: 'o9' }], objets: [] }, /o9/],
  [{ type: 'courbe', series: [{ loi: 'normale', moyenne: 0 }] }, /paramètres/],
  [{ type: 'dendrogramme', feuilles: ['a', 'b'], fusions: [{ groupes: ['a', 'c'], hauteur: 1 }] }, /introuvables/],
  [{ type: 'algorithme', noeuds: [{ id: 'q', question: 'ok ?', oui: 'z' }, { id: 'f', fin: 'fin' }] }, /oui » et « non|z/],
  [{ type: 'pile', etapes: Array(9).fill({ pile: ['a'] }) }, /6 étapes/],
  ['pas un objet', /objet JSON/],
]
for (const [spec, why] of bad) {
  const v = S.validate(spec)
  assert.equal(v.ok, false, JSON.stringify(spec))
  assert.match(v.errors.join(' ; '), why)
  assert.throws(() => S.render(spec))
}
assert.throws(() => S.parse('{"type": "pile",'), /JSON illisible/)
assert.deepEqual(S.parse('{"type": "pile", "pile": ["a",],}'), { type: 'pile', pile: ['a'] }, 'virgules finales tolérées')
// Alias écrits par l'IA
assert.equal(S.validate({ type: 'cycle-en-v', paires: [['a', 'b'], ['c', 'd']] }).spec.forme, 'v')
assert.equal(S.validate({ type: 'heritage', racine: { texte: 'A', enfants: ['B'] } }).spec.liens, 'heritage')

// 4. Texte : largeurs, coupure
assert.ok(S.measure('Bonjour') > 30 && S.measure('Bonjour', 13, { bold: true }) > S.measure('Bonjour'))
assert.ok(S.wrap('un texte assez long pour tenir sur plusieurs lignes', 80).length >= 3)
assert.ok(S.wrap('anticonstitutionnellement', 60).every(l => S.measure(l) <= 60 + 1))
assert.equal(S.num(39.5), '39,5')

// 5. Le .md d'un cours : bloc -> commentaire + image ; faux -> retiré avec sa légende ; deuxième passage stable
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hito-schemas-'))
const md = ['# Cours', '', '## 1. La pile', 'Texte.', '', '```schema', '{"type":"pile","etapes":[{"pile":["main()"]},{"pile":["main()","f()"]}]}', '```',
  '*La pile grandit.*', '', '```schema', '{"type":"pile","pile":', '```', '*Légende du schéma raté.*', '', '```js', '<!-- schema s-faux', '```', 'Fin.'].join('\n')
const out = schemas.transform(md, path.join(dir, 'schemas'), dir)
assert.equal(out.drawn, 1); assert.equal(out.dropped.length, 1); assert.match(out.dropped[0].raison, /JSON illisible/)
assert.match(out.md, /<!-- schema s-\w+\n\{"type":"pile".*\}\n-->\n!\[\[schemas\/s-\w+\.svg\]\]\n\*La pile grandit\.\*/)
assert.ok(!out.md.includes('Légende du schéma raté'), 'la légende part avec le schéma faux')
assert.ok(out.md.includes('```js\n<!-- schema s-faux\n```'), 'un bloc de code reste intact')
const [file] = [...out.used]
assert.match(fs.readFileSync(path.join(dir, 'schemas', file), 'utf8'), /^<svg /)
const again = schemas.transform(out.md, path.join(dir, 'schemas'), dir)
assert.equal(again.md, out.md); assert.equal(again.kept, 1); assert.equal(again.drawn, 0)
// La description gardée se relit (lecteur), et « -- » ne casse pas le commentaire HTML
assert.equal(Object.values(schemas.specsOf(out.md))[0].type, 'pile')
const tricky = { type: 'pile', pile: ['i--', 'a-->b'] }
assert.ok(!schemas.commentJson(tricky).includes('--'))
assert.deepEqual(JSON.parse(schemas.commentJson(tricky)), tricky)
// Image perdue : redessinée au passage suivant
fs.rmSync(path.join(dir, 'schemas', file))
assert.equal(schemas.transform(out.md, path.join(dir, 'schemas'), dir).kept, 1)
assert.ok(fs.existsSync(path.join(dir, 'schemas', file)))
fs.rmSync(dir, { recursive: true })

console.log(`schémas : tous les tests passent (${Object.keys(S.types).length} types, ${examples.length} exemples du guide)`)

// Cours (modules/cours/lib.js) : noms et chemins des cours (les mêmes qu'Incipit), lignes du moteur, révisions espacées,
// correction du TP, réglages acceptés
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const lib = require('../src/modules/cours/lib')

// Noms : les mêmes règles que le slug et le nom_note de Python (engine.py), sinon un cours n'est plus retrouvé
assert.equal(lib.slug('Analyse Numérique'), 'analyse-numerique')
assert.equal(lib.slug('  Chap. 3 : Séries !  '), 'chap-3-series')
assert.equal(lib.slug(''), 'cours')
assert.equal(lib.slug('!!'), 'cours')
assert.equal(lib.slug('Génie Logiciel M1'), 'genie-logiciel-m1')
assert.equal(lib.slug('Cœur & âme'), 'cur-ame') // œ n'a pas d'équivalent ASCII : il saute, comme en Python
assert.equal(lib.nomNote('Analyse Numérique'), 'Analyse Numérique')
assert.equal(lib.nomNote('Chap 3 : Séries'), 'Chap 3 Séries')
assert.equal(lib.nomNote('..'), 'Cours')
assert.equal(lib.getMatiere('  '), 'Divers')
assert.equal(lib.getTitre(''), 'Chapitre 1')
assert.equal(lib.getType('td'), 'TD')
assert.equal(lib.getType('autre'), 'CM')

// Chemins : un cours neuf a son dossier ; un cours écrit à plat (anciennes versions) est lu là où il est
const dest = path.join(os.tmpdir(), 'Cours'), work = path.join(os.tmpdir(), 'ws')
const nested = lib.courseFile(dest, 'Génie Logiciel M1', 'cm', 'CM1 - Besoins', () => false)
assert.equal(nested, path.join(dest, 'Génie Logiciel M1', 'CM - CM1 - Besoins', 'CM - CM1 - Besoins.md'))
const flat = path.join(dest, 'Génie Logiciel M1', 'CM - CM1 - Besoins.md')
assert.equal(lib.courseFile(dest, 'Génie Logiciel M1', 'cm', 'CM1 - Besoins', p => p === flat), flat)
assert.equal(lib.sourcesDir(work, 'Génie Logiciel M1', 'cm', 'CM1 - Besoins'), path.join(work, 'genie-logiciel-m1', 'cm-cm1-besoins', 'sources'))
assert.equal(lib.imagesDir(nested, 'CM1 - Besoins'), path.join(path.dirname(nested), '_img', 'cm1-besoins'))
const c = lib.companions(nested)
assert.equal(c.fiche, nested.replace(/\.md$/, '_fiche.md'))
assert.equal(c.cartesJson, path.join(path.dirname(nested), '.tp', 'CM - CM1 - Besoins_cartes.json'))
assert.equal(c.exercices, path.join(path.dirname(nested), '.tp', 'CM - CM1 - Besoins_exercices.json'))
// Matière, type et titre retrouvés depuis le chemin : ils redonnent le même dossier de sources
const id = lib.identity(dest, nested)
assert.deepEqual(id, { matiere: 'Génie Logiciel M1', type: 'CM', titre: 'CM1 - Besoins' })
assert.equal(lib.sourcesDir(work, id.matiere, id.type, id.titre), lib.sourcesDir(work, 'Génie Logiciel M1', 'cm', 'CM1 - Besoins'))
assert.equal(lib.identity(dest, path.join(dest, 'CM - X.md')), null, 'un cours hors matière')
assert.ok(lib.isCourseFile('TD - Séries.md'))
for (const no of ['CM - X_fiche.md', 'CM - X_sujet.md', 'CM - X_cartes.md', 'Notes.md', 'CM - X.pdf']) assert.ok(!lib.isCourseFile(no), no)

// Un chemin venu du panneau ne sort pas de son dossier
assert.ok(lib.isInside(dest, nested))
assert.ok(!lib.isInside(dest, path.join(dest, '..', 'ailleurs.md')))
assert.ok(!lib.isInside(dest, dest))
assert.ok(!lib.isInside(dest, 'C:\\Windows\\win.ini'))

// Un nom déjà pris est suffixé, rien n'est écrasé
assert.equal(lib.freeName('d', 'photo.jpg', () => false), 'photo.jpg')
assert.equal(lib.freeName('d', 'photo.jpg', p => /photo(-1)?\.jpg$/.test(p)), 'photo-2.jpg')
assert.deepEqual(['a.JPG', 'b.pdf', 'c.url', 'd.py'].map(lib.kindOf), ['photo', 'pdf', 'lien', 'texte'])

// Liens : http(s) seulement, jamais de saut de ligne dans le raccourci
assert.deepEqual(lib.linkFile('https://fr.wikipedia.org/wiki/Pile_(informatique)'), {
  name: 'fr-wikipedia-org-wiki-pile-informatique.url', text: '[InternetShortcut]\nURL=https://fr.wikipedia.org/wiki/Pile_(informatique)\n' })
for (const bad of ['file:///C:/Windows/win.ini', 'javascript:alert(1)', 'https://a.fr/x\nURL=file:///etc', 'pas un lien']) assert.equal(lib.linkFile(bad), null, bad)

// En-tête et sections d'un cours
const md = '---\nmatiere: Algo\ntype: CM\ntitre: Piles\nmoteur: claude-cli [opus]\n---\n\n# Piles\n\n## 1. La pile\n\n### 1.1 LIFO\n\n```py\n# pas un titre\n```\n\n## Vocabulaire à retenir\n\n| a | b |\n'
assert.deepEqual(lib.frontmatter(md).meta, { matiere: 'Algo', type: 'CM', titre: 'Piles', moteur: 'claude-cli [opus]' })
assert.deepEqual(lib.sectionsOf(md), [{ level: 2, title: '1. La pile', fin: false }, { level: 3, title: '1.1 LIFO', fin: false }, { level: 2, title: 'Vocabulaire à retenir', fin: true }])
assert.equal(lib.words('un  deux\ntrois'), 3)

// Cours v2 (trois couches) : les notions sont ses titres ##, lues sans modèle ; mêmes identifiants qu'engine/v2.py
assert.equal(lib.notionId('1. API REST'), 'api-rest')
assert.equal(lib.notionId('3.2 Clés étrangères'), 'cles-etrangeres')
assert.equal(lib.notionId('  '), 'notion')
const v2corps = '# X\n\n## L’essentiel\nun deux trois\n\n## 1. API REST\nquatre cinq\n\n```\n## faux titre\n```\n\n## 2. Docker\nsix\n\n### 2.1 Détail\n\n## 3. API REST\nsept\n\n'
  + '## Pour aller plus loin\nhuit neuf dix\n\n## Sources\n- a.pdf\n'
const v2 = `---\ntitre: X\nformat: 2\n---\n${v2corps}`
assert.deepEqual(lib.notionsOf(v2), [{ id: 'api-rest', titre: 'API REST' }, { id: 'docker', titre: 'Docker' }, { id: 'api-rest-2', titre: 'API REST' }])
assert.equal(lib.layersOf(v2).essentiel.trim(), 'un deux trois')
assert.equal(lib.layersOf(v2).plus.trim(), 'huit neuf dix')
assert.equal(lib.countedWords(v2), 3 + 23, 'couches 1 et 2 seulement')
assert.equal(lib.formatOf(v2), 2)
assert.equal(lib.formatOf(`---\ntitre: X\n---\n${v2corps}`), 1, 'sans format: 2 dans l’en-tête')
assert.equal(lib.layersOf(md), null)
assert.deepEqual(lib.notionsOf(md), [])
assert.equal(lib.countedWords(md), lib.words(lib.frontmatter(md).body))
assert.equal(lib.layersOf('# X\n\n## L\'essentiel\nseul\n\n## Sources\n- a\n'), null, 'aucune notion')
assert.deepEqual(lib.sectionsOf(v2).filter(s => s.fin).map(s => s.title), ['L’essentiel', 'Pour aller plus loin', 'Sources'])
assert.equal(lib.validSetting('format', '2'), '2')
assert.equal(lib.validSetting('format', '3'), undefined)
assert.deepEqual(lib.CAPS, { court: 1500, normal: 3000, detaille: 5000 })

// Les lignes du moteur : avancement, activité de l'IA, journal (avec ses accents)
assert.deepEqual(lib.parseLine('[42] Redaction du cours  (812 mots)'), { type: 'phase', text: 'Rédaction du cours (812 mots)', pct: 42 })
assert.deepEqual(lib.parseLine('[999] Deborde'), { type: 'phase', text: 'Deborde', pct: 100 })
assert.deepEqual(lib.parseLine('@{"t": "fini", "id": 3, "mots": 120}'), { type: 'event', data: { t: 'fini', id: 3, mots: 120 } })
assert.deepEqual(lib.parseLine('. p1.jpg : deja transcrite (210 mots)'), { type: 'log', text: 'p1.jpg : déjà transcrite (210 mots)' })
assert.equal(lib.parseLine('Installed 14 packages in 1.07s').type, 'log')
assert.equal(lib.parseLine('@{pas du json').type, 'log')
// Jetons d'un appel Claude (generator.py, _claude_cli) ; Sonnet quand le quota est presque plein
assert.deepEqual(lib.parseLine('@{"t":"jetons","modele":"opus","usage":{"input_tokens":5}}'),
  { type: 'event', data: { t: 'jetons', modele: 'opus', usage: { input_tokens: 5 } } })
// La progression venue du site : nettoyée, jamais de quoi casser le fichier
assert.deepEqual(lib.cleanProgress({ done: ['c-a', 'c-a', 'c-b', 3, 'x'.repeat(300)], quiz: { 'q-a': 0.8, 'q-b': 2, 'q-c': 'oui' }, at: 'c-b', total: 12 }, 5),
  { done: ['c-a', 'c-b'], quiz: { 'q-a': 0.8 }, at: 'c-b', total: 12, t: 5 })
assert.deepEqual(lib.cleanProgress(null, 5), { done: [], quiz: {}, at: null, total: 0, t: 5 })
assert.deepEqual(lib.cleanProgress({ quiz: [1, 2], total: -3, at: '' }, 5), { done: [], quiz: {}, at: null, total: 0, t: 5 })
// Les étapes d'une génération, en clair
assert.deepEqual(lib.planOf('cours', { cours: true, fiche: true, cartes: true }).map(s => s[1]),
  ['Lecture des sources', 'Rédaction du cours', 'Schémas et PDF', 'Fiche et flash cards'])
assert.deepEqual(lib.planOf('cours', { cours: true, sujet: true, tp: true }).map(s => s[0]), ['lecture', 'ecrit', 'pdf', 'sujet', 'supports'])
assert.deepEqual(lib.planOf('supports', { fiche: true, cartes: true, tp: true }), [['supports', 'Fiche, flash cards et TP noté']])
assert.deepEqual(lib.planOf('reecrire').map(s => s[0]), ['ecrit', 'pdf'])
assert.deepEqual(lib.planOf('supports', {}), [])
// Un schéma n'est pas du texte : ni le bloc ```schema ni sa description en commentaire ne comptent dans les mots
assert.equal(lib.words('un deux\n```schema\n{"type": "pile", "x": 1}\n```\n<!-- schema s-1\n{"type": "pile"}\n-->\ntrois'), 3)
// Le skill « cours » impose Opus ou NIM ; quota presque plein : NIM si sa clé est là, sinon Opus quand même
assert.deepEqual(lib.planFor('claude-cli', false, true), { moteur: 'claude-cli', modele: 'opus', note: '' })
assert.equal(lib.planFor('claude-cli', true, true).moteur, 'gratuit')
assert.deepEqual(lib.planFor('claude-cli', true, false).modele, 'opus')
assert.match(lib.planFor('claude-cli', true, false).note, /Opus quand même/)
assert.deepEqual(lib.planFor('gratuit', true, true), { moteur: 'gratuit', modele: null, note: '' })
assert.equal(lib.engineOfSkill('nim'), 'gratuit')
assert.equal(lib.engineOfSkill('deep'), 'claude-cli')
assert.equal(lib.engineOfSkill(null), 'claude-cli', 'un skill sans modèle (ou un autre) : Opus')
// Ses « Consignes en plus » : seulement ce qui est sous ce titre, sans les commentaires
assert.equal(lib.consignesOf('Intro\n\n## Consignes en plus\n<!-- aide -->\nUn exemple en Java.\n### Détail\nok\n## Autre\nnon'), 'Un exemple en Java.\n### Détail\nok')
assert.equal(lib.consignesOf('## Consignes en plus\n<!-- rien -->\n'), '')
assert.equal(lib.consignesOf('Pas de section'), '')
assert.equal(lib.parseLine('   '), null)

// Révisions espacées : bien -> boîte suivante, à revoir -> 10 min, échéances en début de journée
const now = new Date(2026, 9, 29, 20, 30).getTime(), day = 864e5
const fresh = lib.review(null, 'good', now)
assert.equal(fresh.box, 1)
assert.equal(fresh.due, new Date(2026, 9, 30).getTime(), 'vue ce soir : revient demain matin')
const again = lib.review(fresh, 'again', now)
assert.deepEqual([again.box, again.due, again.lapses, again.seen], [1, now + 10 * 60e3, 1, 2])
const easy = lib.review({ box: 2 }, 'easy', now)
assert.equal(easy.box, 4)
assert.equal(easy.due, lib.startOfDay(now + 16 * day))
assert.equal(lib.review({ box: 5 }, 'good', now).box, 5, 'la dernière boîte est un plafond')
assert.equal(lib.review({ box: 3 }, 'hard', now).box, 3)
assert.equal(lib.review({ box: 3 }, 'hard', now).due, lib.startOfDay(now + 4 * day), 'difficile : la moitié de l’attente')
assert.throws(() => lib.review(null, 'bof', now))
assert.ok(lib.isDue(null, now) && lib.isDue({ due: now }, now) && !lib.isDue({ due: now + 1 }, now))
assert.equal(lib.waitLabel(null, 'again', now), '10 min')
assert.equal(lib.waitLabel(null, 'good', now), 'demain')
assert.equal(lib.waitLabel({ box: 2 }, 'good', now), '7 j')
assert.equal(lib.cardId('  Que veut dire LIFO ? '), lib.cardId('que veut dire lifo ?'))
assert.notEqual(lib.cardId('LIFO ?'), lib.cardId('FIFO ?'))

// Preuves de travail : une ligne par carte notée ou exercice corrigé, rangée par notion, score borné à [0, 1]
assert.deepEqual(lib.evidence('carte', 'AAW\\TD - TD1\\TD - TD1.md', '1. API REST', 1, 1000),
  { at: 1000, course: 'AAW\\TD - TD1\\TD - TD1.md', notion: 'api-rest', src: 'carte', score: 1 })
assert.deepEqual([7, -1, NaN, 0.5].map(s => lib.evidence('tp', 'c', 'n', s, 1).score), [1, 0, 0, 0.5])
assert.deepEqual(lib.GRADE_SCORE, { again: 0, hard: 0.5, good: 1, easy: 1 })

// Correction : accents, casse et virgule décimale ne comptent pas, les idées clés se comptent
assert.ok(lib.checkCalcul('Était', ['etait | était'.split(' | ')[1]]))
assert.ok(lib.checkCalcul(' 3,5 ', ['3.5']))
assert.ok(lib.checkCalcul('42.0', ['42']))
assert.ok(!lib.checkCalcul('', ['0']))
assert.ok(!lib.checkCalcul('41', ['42']))
assert.deepEqual(lib.checkKeywords('La pile est LIFO, on dépile le sommet', ['LIFO', 'sommet', 'récursivité']),
  { found: ['LIFO', 'sommet'], missing: ['récursivité'], score: 2 / 3 })
assert.equal(lib.tpScore([{ points: 1 }, { points: 0.5 }, {}, { points: 0 }]), 38)
assert.equal(lib.tpScore([]), 0)
assert.deepEqual(lib.testResult(0, 'bla\n###RESULTATS###101\n', '', 3), { reussis: 2, total: 3, erreur: null })
assert.equal(lib.testResult(1, '', 'SyntaxError: invalid syntax', 1).erreur, 'SyntaxError: invalid syntax')
assert.match(lib.testResult(0, 'rien', '', 2).erreur, /aucun résultat/)

// Le script de test tourne vraiment (uv présent) : un test juste, un faux, un qui plante sans emporter les autres
const uv = ['uv.exe', 'uv'].find(n => spawnSync(n, ['--version'], { encoding: 'utf8' }).status === 0)
if (uv) {
  const file = path.join(os.tmpdir(), `incipit-test-${process.pid}.py`)
  fs.writeFileSync(file, lib.testScript('def f(x):\n    return x * 2\n', ['f(2) == 4', 'f(3) == 999', '1 / 0 == 1']))
  const r = spawnSync(uv, ['run', '--no-project', '--quiet', file], { encoding: 'utf8' })
  fs.rmSync(file, { force: true })
  assert.deepEqual(lib.testResult(r.status, r.stdout, r.stderr, 3), { reussis: 1, total: 3, erreur: null }, r.stderr)
  // Le moteur v2 lit un cours comme lib.js (mêmes identifiants de notions, mêmes mots comptés)
  const v2test = spawnSync(uv, ['run', '--script', path.join(__dirname, '..', 'src', 'modules', 'cours', 'engine', 'v2.py'), '--self-test'], { encoding: 'utf8' })
  assert.equal(v2test.status, 0, v2test.stderr)
} else console.log('  (uv absent : le script de test n’a pas été lancé)')

// Réglages : rien n'est écrit sans avoir été vérifié
assert.equal(lib.validSetting('moteur', 'gratuit'), 'gratuit')
assert.equal(lib.validSetting('moteur', 'rm -rf'), undefined)
assert.equal(lib.validSetting('nimKey', '  nvapi-abcDEF123456  '), 'nvapi-abcDEF123456')
for (const bad of ['sk-ant-xyz1234567890', 'nvapi-a b', 'nvapi-', 42]) assert.equal(lib.validSetting('nimKey', bad), undefined, String(bad))
assert.equal(lib.validSetting('nimModel', 'meta/llama-3.3-70b-instruct'), 'meta/llama-3.3-70b-instruct')
assert.equal(lib.validSetting('nimModel', 'a b'), undefined)
assert.equal(lib.validSetting('longueur', 'detaille'), 'detaille')
const absDest = path.join(path.resolve(path.sep), 'Users', 'x', 'Cours') // un chemin absolu de ce système (C:\Users\x\Cours, /Users/x/Cours)
assert.equal(lib.validSetting('destination', absDest), absDest)
for (const bad of ['Cours', '', 42, `${path.resolve(path.sep)}${'a'.repeat(400)}`]) assert.equal(lib.validSetting('destination', bad), undefined, `destination ${String(bad).slice(0, 20)}`)
assert.equal(lib.validSetting('__proto__', 'x'), undefined)
assert.deepEqual(lib.jobOptions({ cours: true, tp: 'oui', questions: 99, focus: '  les piles  ', niveau: '' }),
  { cours: true, sujet: false, fiche: false, tp: false, cartes: false, niveau: 'comme le cours', focus: 'les piles', questions: 0 })
assert.deepEqual(lib.byPreference(['z', 'moonshotai/kimi-k3', 'a', 'nvidia/nemotron-3-ultra-550b-a55b'], lib.PREFERENCE_NIM),
  ['nvidia/nemotron-3-ultra-550b-a55b', 'moonshotai/kimi-k3', 'a', 'z'])

// Clés Gemini : une ou plusieurs (virgules, espaces, lignes), rangées une par ligne ; une clé mal formée refuse le tout
const K1 = 'AIzaSyA-1234567890abcdefghijklmnopqrs', K2 = 'AIzaSyB-1234567890abcdefghijklmnopqrs'
assert.equal(lib.validSetting('geminiKey', K1), K1)
assert.equal(lib.validSetting('geminiKey', `${K1}, ${K2}`), `${K1}\n${K2}`)
assert.equal(lib.validSetting('geminiKey', `${K1}\n${K2} ${K1}`), `${K1}\n${K2}\n${K1}`)
assert.equal(lib.validSetting('geminiKey', `${K1} court`), undefined)
assert.equal(lib.validSetting('geminiKey', ''), undefined)

// Les moteurs : Claude (abonnement ou clé), Gemini, OpenAI, OpenRouter, NVIDIA NIM, chacun avec son prix et son modèle
assert.deepEqual(Object.keys(lib.MOTEURS).sort(), ['anthropic', 'claude-cli', 'gemini', 'gemini-pro', 'gratuit', 'openai', 'openrouter'])
// Gemini payant : sa clé à part de celle du palier gratuit, ses modèles Pro
assert.equal(lib.MOTEURS['gemini-pro'].prix, 'payant')
assert.equal(lib.validSetting('moteur', 'gemini-pro'), 'gemini-pro')
assert.equal(lib.validSetting('geminiProKey', 'AIzaSyD-1234567890abcdefghijklmnopqrs'), 'AIzaSyD-1234567890abcdefghijklmnopqrs')
assert.equal(lib.validSetting('geminiProKey', 'trop court'), undefined)
assert.equal(lib.validSetting('geminiProModel', 'gemini-2.5-pro'), 'gemini-2.5-pro')
assert.equal(lib.MODELE_PAR_DEFAUT["gemini-pro"], "gemini-4-carbon")
assert.ok(lib.PREFERENCE_GEMINI_PRO.includes("gemini-4-argon") && lib.PREFERENCE_GEMINI.every(m => lib.PREFERENCE_GEMINI_PRO.includes(m)))
assert.ok(!lib.PREFERENCE_GEMINI.includes("gemini-4-carbon")) // payant seulement : pas dans la liste gratuite
assert.ok(Object.values(lib.MOTEURS).every(m => ['abonnement', 'payant', 'gratuit'].includes(m.prix) && m.nom && m.sous))
assert.equal(lib.validSetting('moteur', 'openrouter'), 'openrouter')
assert.equal(lib.validSetting('moteur', 'anthropic'), 'anthropic')
assert.equal(lib.validSetting('moteur', 'inconnu'), undefined)
assert.equal(lib.validSetting('claudeModel', 'sonnet'), 'sonnet')
assert.equal(lib.validSetting('claudeModel', 'gpt'), undefined)
assert.equal(lib.validSetting('anthropicModel', 'claude-opus-5-5'), 'claude-opus-5-5')
assert.equal(lib.validSetting('openrouterModel', 'deepseek/deepseek-chat-v3-0324:free'), 'deepseek/deepseek-chat-v3-0324:free')
assert.equal(lib.validSetting('openaiModel', 'mauvais nom'), undefined)
assert.equal(lib.validSetting('openrouterModel', ''), '') // vide : le modèle par défaut du moteur
// Les clés : la forme de chacune, jamais une autre
assert.equal(lib.validSetting('anthropicKey', 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz'), 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz')
assert.equal(lib.validSetting('anthropicKey', 'sk-abcdefghijklmnopqrstuvwxyz'), undefined)
assert.equal(lib.validSetting('openrouterKey', 'sk-or-v1-abcdefghijklmnopqrstuvwxyz'), 'sk-or-v1-abcdefghijklmnopqrstuvwxyz')
assert.equal(lib.validSetting('openrouterKey', 'sk-ant-abcdefghijklmnopqrstuvwxyz'), undefined)
assert.equal(lib.validSetting('openaiKey', 'sk-proj-abcdefghijklmnopqrstuvwxyz'), 'sk-proj-abcdefghijklmnopqrstuvwxyz')
assert.equal(lib.validSetting('openaiKey', 'pas une cle'), undefined)
// Le modèle Claude choisi voyage jusqu'au moteur ; quota presque plein : NIM prend le relais, ou le même modèle quand même
assert.deepEqual(lib.planFor('claude-cli', false, true, 'sonnet'), { moteur: 'claude-cli', modele: 'sonnet', note: '' })
assert.match(lib.planFor('claude-cli', true, false, 'haiku').note, /Haiku quand même/)
assert.deepEqual(lib.planFor('openrouter', true, true, 'sonnet'), { moteur: 'openrouter', modele: null, note: '' })

console.log('cours : tous les tests passent')

// Cours (Incipit) : les calculs du module, sans Electron, partagés par main.js et tests/cours.test.js.
// Noms et emplacements des cours (mêmes règles qu'Incipit : un cours se retrouve là où il a été créé), lecture des lignes
// du moteur Python, révisions espacées des cartes, correction des exercices, réglages acceptés.
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

// Le vocabulaire du moteur (engine/generator.py) : à garder d'accord avec lui
const TYPES = { CM: 'Cours magistral', TD: 'Travaux dirigés', TP: 'Travaux pratiques' }
const MOTEURS = {
  'claude-cli': { nom: 'Claude', sous: 'ton abonnement Claude Code · le meilleur', prix: 'abonnement' },
  anthropic: { nom: 'Claude (API)', sous: 'une clé Anthropic, payant à l’usage : sans abonnement', prix: 'payant' },
  gemini: { nom: 'Gemini', sous: 'gratuit avec une clé Google (payant au-delà du quota)', prix: 'gratuit' },
  'gemini-pro': { nom: 'Gemini (payant)', sous: 'une clé Google avec facturation : les modèles Pro, sans limite du palier gratuit', prix: 'payant' },
  openai: { nom: 'OpenAI', sous: 'une clé OpenAI, payant à l’usage', prix: 'payant' },
  openrouter: { nom: 'OpenRouter', sous: 'une clé, des centaines de modèles, dont des gratuits', prix: 'gratuit' },
  gratuit: { nom: 'NVIDIA NIM', sous: 'gratuit, avec ta clé NVIDIA', prix: 'gratuit' },
}
// Les modèles proposés pour chaque moteur (une liste courte : les clés ouvrent bien plus, le champ accepte n'importe quel nom)
const MODELES_CLAUDE = [['opus', 'Opus · le meilleur'], ['sonnet', 'Sonnet · équilibré'], ['haiku', 'Haiku · rapide']]
const PREFERENCE_ANTHROPIC = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']
// Avec une clé payante : tous les modèles texte de Gemini (ai.google.dev/gemini-api/docs/models, 18/11/2026), les plus forts
// d'abord. Gemini 4 Carbon et Argon et 3.1 Pro ne répondent qu'à une clé payante ; 2.5 Flash et 2.5 Pro sont dépréciés
// (redirigés le 1er décembre 2026). Images, voix, vidéo et embeddings ne servent pas à écrire un cours.
const PREFERENCE_GEMINI_PRO = ['gemini-4-carbon', 'gemini-4-argon', 'gemini-3.1-pro-preview', 'gemini-4-hydrogen', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-flash-latest', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']
const PREFERENCE_OPENAI = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini']
const PREFERENCE_OPENROUTER = ['deepseek/deepseek-chat-v3-0324:free', 'meta-llama/llama-3.3-70b-instruct:free', 'google/gemini-2.0-flash-exp:free', 'anthropic/claude-sonnet-4.5', 'openai/gpt-4o']
// Le modèle par défaut de chaque moteur à clé (comme dans engine/generator.py)
const MODELE_PAR_DEFAUT = { claude: 'opus', 'gemini-pro': 'gemini-4-carbon', anthropic: 'claude-sonnet-5-5', openai: 'gpt-4o', openrouter: 'deepseek/deepseek-chat-v3-0324:free' }
const TRANSCRIPTEURS = [['auto', 'Automatique (NVIDIA)'], ['nemotron-omni', 'NVIDIA Nemotron Omni · recommandé'],
  ['kimi-k3', 'NVIDIA Kimi K3'], ['gemini', 'Google Gemini'], ['ocr', 'NVIDIA OCR · texte imprimé']]
const PREFERENCE_NIM = ['nvidia/nemotron-3-ultra-550b-a55b', 'deepseek-ai/deepseek-v4-pro-0813', 'moonshotai/kimi-k3',
  'nvidia/llama-3.1-nemotron-ultra-253b-v1', 'mistralai/mistral-large-2-instruct', 'nvidia/nemotron-3-super-120b-a12b',
  'deepseek-ai/deepseek-v4-flash-0731', 'moonshotai/kimi-k2.6', 'nvidia/nemotron-4-340b-instruct']
const PREFERENCE_GEMINI = ['gemini-4-hydrogen', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']
const LONGUEURS = { court: 'Court', normal: 'Normal', detaille: 'Détaillé' }
const LANGUES = { fr: 'Français', en: 'English' }
const EXT_IMG = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic'])
const MAX_OCTETS_FICHIER = 100_000 // au-delà, le moteur tronque une source texte
const FIN_DE_COURS = ['vocabulaire à retenir', 'récap', 'auto-test', 'sources', "l'essentiel", 'pour aller plus loin'] // tirées du cours entier : pas réécrites seules

// ---------- Noms et emplacements (app.py et engine.py d'Incipit) ----------

// Nom saisi -> nom de dossier sûr, sans accent : tout ce qui n'est pas ASCII après décomposition saute, comme en Python
function slug(nom) {
  const s = String(nom).normalize('NFKD').replace(/[^\x00-\x7f]/g, '').replace(/[^\w\s-]/g, '').trim().toLowerCase()
  return s.replace(/[\s_-]+/g, '-') || 'cours'
}
// Nom de cours -> nom de fichier : accents gardés, caractères interdits par Windows retirés
function nomNote(nom) {
  const s = String(nom).replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').replace(/^[ .]+|[ .]+$/g, '')
  return s || 'Cours'
}
const getMatiere = v => String(v ?? '').trim() ? nomNote(String(v).trim()) : 'Divers'
const getTitre = v => v ? nomNote(v) : 'Chapitre 1'
const getType = v => { const t = String(v ?? '').trim().toUpperCase(); return t in TYPES ? t : 'CM' }

// Dossier de travail d'un cours (ses sources déposées, le cache des photos lues), dans les données de l'appli
const workDir = (work, m, t, ti) => path.join(work, slug(getMatiere(m)), `${getType(t).toLowerCase()}-${slug(getTitre(ti))}`)
const sourcesDir = (work, m, t, ti) => path.join(workDir(work, m, t, ti), 'sources')
// La note du cours : dans son propre dossier au sein de la matière ; un cours écrit à plat (anciennes versions) reste lu
// là où il est, sinon il ne serait plus retrouvé et un doublon naîtrait à côté
function courseFile(dest, m, t, ti, exists = fs.existsSync) {
  const dir = path.join(dest, getMatiere(m)), nom = `${getType(t)} - ${getTitre(ti)}`
  const flat = path.join(dir, `${nom}.md`)
  return exists(flat) ? flat : path.join(dir, nom, `${nom}.md`)
}
// Les photos recopiées à côté du cours, pour qu'Obsidian et le PDF les affichent
const imagesDir = (course, ti) => path.join(path.dirname(course), '_img', slug(getTitre(ti)))
// Ce qui accompagne un cours : PDF, fiche, sujet retravaillé, cartes, et les annexes du TP rangées dans .tp/
function companions(course) {
  const dir = path.dirname(course), stem = path.basename(course, '.md'), at = s => path.join(dir, stem + s), tp = s => path.join(dir, '.tp', stem + s)
  return { pdf: at('.pdf'), fiche: at('_fiche.md'), fichePdf: at('_fiche.pdf'), sujet: at('_sujet.md'), sujetPdf: at('_sujet.pdf'),
    cartes: at('_cartes.md'), cartesJson: tp('_cartes.json'), exercices: tp('_exercices.json'), lanceur: at('_TP.bat') }
}
// Un fichier de cours : « CM - Titre.md », jamais ses compagnons
const COURSE = /^(CM|TD|TP) - (.+)\.md$/
const isCourseFile = name => COURSE.test(name) && !/_(fiche|sujet|cartes)\.md$/i.test(name)
// Matière, type et titre d'un cours retrouvés depuis son chemin (la matière est le premier dossier sous la destination)
function identity(dest, course) {
  const rel = path.relative(dest, course).split(path.sep), m = COURSE.exec(path.basename(course))
  return m && rel.length >= 2 ? { matiere: rel[0], type: m[1], titre: m[2] } : null
}
// child est-il dans parent (lui-même exclu) ? Un chemin venu du panneau ne doit désigner que ce qu'on lui permet
const isInside = (parent, child) => {
  const r = path.relative(path.resolve(parent), path.resolve(child))
  return !!r && !r.startsWith('..') && !path.isAbsolute(r)
}
// dir/name, ou name-1, name-2… si le nom est pris : déposer deux fois « photo.jpg » ne fait rien disparaître
function freeName(dir, name, exists = fs.existsSync) {
  const ext = path.extname(name), stem = path.basename(name, ext)
  let out = name
  for (let i = 1; exists(path.join(dir, out)); i++) out = `${stem}-${i}${ext}`
  return out
}
// Ce que le moteur fera d'un fichier déposé
function kindOf(name) {
  const ext = path.extname(name).toLowerCase()
  return EXT_IMG.has(ext) ? 'photo' : ext === '.pdf' ? 'pdf' : ext === '.url' ? 'lien' : 'texte'
}
// Un lien collé : http(s) seulement, sans espace (il finit dans un raccourci .url que le moteur lit)
function linkFile(url) {
  let u
  try { u = new URL(String(url).trim()) } catch { return null }
  if (!/^https?:$/.test(u.protocol) || !u.host || /\s/.test(String(url).trim())) return null
  return { name: `${slug(`${u.host}${u.pathname}`.replace(/[./]/g, ' ')).slice(0, 60)}.url`, text: `[InternetShortcut]\nURL=${u.href}\n` }
}

// ---------- En-tête et sections d'un cours ----------

// Le frontmatter YAML (des « clé: valeur » à plat, écrit par le moteur) et le corps
function frontmatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md)
  if (!m) return { meta: {}, body: md }
  const meta = {}
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return { meta, body: md.slice(m[0].length) }
}
// Les sections ## et ### du cours, dans l'ordre (un # dans un bloc de code n'est pas un titre) ; fin : section de fin
function sectionsOf(md) {
  const out = []
  let code = false
  for (const line of md.split(/\r?\n/)) {
    if (line.trimStart().startsWith('```')) { code = !code; continue }
    const m = !code && /^(#{2,3})\s+(.+?)\s*$/.exec(line)
    if (m) out.push({ level: m[1].length, title: m[2], fin: FIN_DE_COURS.includes(plain(m[2])) })
  }
  return out
}
// Un schéma (bloc ```schema, ou sa description gardée en commentaire) n'est pas du texte : il ne compte pas dans les mots.
// La même règle qu'engine/v2.py (SCHEMAS)
const SCHEMAS = /^```schema[\s\S]*?^```[ \t]*$|^<!--\s*schema[\s\S]*?^-->[ \t]*$/gm
const words = s => (String(s).replace(SCHEMAS, '').match(/\S+/g) ?? []).length

// ---------- Cours v2 : trois couches (L'essentiel, les notions, Pour aller plus loin) ----------
// Les mêmes règles qu'engine/v2.py : à garder d'accord avec lui (identifiants de notions, mots comptés)

// Plafonds de mots des couches 1 et 2, selon la longueur réglée
const CAPS = { court: 1500, normal: 3000, detaille: 5000 }
// Un titre comparé sans casse, apostrophe droite ou courbe
function plain(titre) { return String(titre).trim().toLowerCase().replace(/’/g, "'") }
// Titre de notion -> identifiant stable : le numéro de tête saute (« 3.2 Clés étrangères » -> cles-etrangeres)
function notionId(titre) {
  const s = slug(String(titre).replace(/^\s*\d+(\.\d+)*[.)]?\s*/, ''))
  return s === 'cours' ? 'notion' : s
}
// Les titres ## du corps, avec leur ligne (un # dans un bloc de code n'est pas un titre)
function h2Of(lines) {
  const out = []
  let code = false
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith('```')) { code = !code; return }
    const m = !code && /^##\s+(.+?)\s*$/.exec(line)
    if (m) out.push({ i, titre: m[1], nom: plain(m[1]) })
  })
  return out
}
// Les trois couches et les titres des notions, ou null si la forme n'est pas suivie (pas d'essentiel, aucune notion)
function layout(md) {
  const lines = frontmatter(String(md)).body.split(/\r?\n/), h = h2Of(lines)
  const e = h.findIndex(x => x.nom === "l'essentiel")
  if (e < 0) return null
  const after = h.slice(e + 1), isEnd = x => x.nom === 'pour aller plus loin' || x.nom === 'sources'
  const end = after.find(isEnd), heads = after.filter(x => !end || x.i < end.i)
  if (!heads.length) return null
  const plus = after.find(x => x.nom === 'pour aller plus loin'), src = after.find(x => x.nom === 'sources' && (!plus || x.i > plus.i))
  const cut = (a, b) => lines.slice(a, b).join('\n')
  return { heads, layers: { essentiel: cut(h[e].i + 1, heads[0].i), cours: cut(heads[0].i, end ? end.i : lines.length),
    plus: plus ? cut(plus.i + 1, src ? src.i : lines.length) : '' } }
}
const layersOf = md => layout(md)?.layers ?? null
// Les notions d'un cours v2 : ses titres ## de la couche 2, sans numéro ; deux titres identiques -> -2, -3
function notionsOf(md) {
  const seen = {}
  return (layout(md)?.heads ?? []).map(x => {
    const id = notionId(x.titre), n = seen[id] = (seen[id] ?? 0) + 1
    return { id: n > 1 ? `${id}-${n}` : id, titre: x.titre.replace(/^\s*\d+(\.\d+)*[.)]?\s*/, '') || x.titre }
  })
}
// Les mots qui comptent pour le plafond : couches 1 et 2 (un cours v1 : tout le corps)
function countedWords(md) {
  const l = layersOf(md)
  return l ? words(l.essentiel) + words(l.cours) : words(frontmatter(String(md)).body)
}
const formatOf = md => frontmatter(String(md)).meta.format === '2' ? 2 : 1
// Une preuve de travail (preuves.jsonl) : une carte notée ou un exercice corrigé, rangé par notion. course : chemin
// relatif à la destination ; score de 0 à 1. C'est de là que se calculera l'avis « prêt / pas prêt ».
const GRADE_SCORE = { again: 0, hard: 0.5, good: 1, easy: 1 }
const evidence = (src, course, notionTitre, score, now = Date.now()) =>
  ({ at: now, course, notion: notionId(notionTitre), src, score: Math.min(1, Math.max(0, Number(score) || 0)) })
// Qui écrit vraiment : le skill « cours » impose Opus ou NIM. Quota Claude presque plein : NIM à la place d'Opus si sa
// clé est là (sinon Opus quand même, et on le dit). -> { moteur, modele (null : celui du moteur), note }
function planFor(moteur, low, nimOk, claudeModel = 'opus') {
  if (moteur !== 'claude-cli') return { moteur, modele: null, note: '' }
  if (!low) return { moteur, modele: claudeModel, note: '' }
  const nom = claudeModel[0].toUpperCase() + claudeModel.slice(1)
  return nimOk ? { moteur: 'gratuit', modele: null, note: 'Quota Claude presque plein : ce cours est écrit avec NVIDIA NIM' }
    : { moteur, modele: claudeModel, note: `Quota Claude presque plein et pas de clé NVIDIA : écrit avec ${nom} quand même` }
}
// La progression dans un cours, venue du site (lecteur-ui.js) : des identifiants courts, des scores entre 0 et 1, rien
// d'autre ; gardée par lecteur.js dans lecteur-progression.json
function cleanProgress(d, now = Date.now()) {
  const id = v => typeof v === 'string' && v.length > 0 && v.length <= 200
  const quiz = Object.fromEntries(Object.entries(d?.quiz && typeof d.quiz === 'object' && !Array.isArray(d.quiz) ? d.quiz : {})
    .filter(([k, v]) => id(k) && typeof v === 'number' && v >= 0 && v <= 1).slice(0, 200))
  return { done: [...new Set(Array.isArray(d?.done) ? d.done.filter(id) : [])].slice(0, 500), quiz, at: id(d?.at) ? d.at : null,
    total: Number.isInteger(d?.total) && d.total >= 0 && d.total < 10000 ? d.total : 0, t: now }
}
// Les étapes d'une génération, dites simplement (le panneau les coche une à une) : [clé, libellé]
// kind : cours | supports | reecrire ; o : les options de la génération
function planOf(kind, o = {}) {
  const sup = [o.fiche && 'fiche', o.cartes && 'flash cards', o.tp && 'TP noté'].filter(Boolean)
  const supLabel = sup.length ? (sup.length > 1 ? `${sup.slice(0, -1).join(', ')} et ${sup.at(-1)}` : sup[0]).replace(/^./, c => c.toUpperCase()) : ''
  if (kind === 'reecrire') return [['ecrit', 'Réécriture de la partie'], ['pdf', 'Schémas et PDF']]
  if (kind === 'supports') return sup.length ? [['supports', supLabel]] : []
  return [['lecture', 'Lecture des sources'], o.cours && ['ecrit', 'Rédaction du cours'], o.cours && ['pdf', 'Schémas et PDF'],
    o.sujet && ['sujet', 'Sujet retravaillé'], sup.length && ['supports', supLabel]].filter(Boolean)
}
// Le skill « cours » (%APPDATA%\Hitodama\skills\cours.md) : son modèle -> le moteur, ses « Consignes en plus » -> le texte
// ajouté à la méthode (commentaires HTML retirés : ils expliquent, ils ne commandent pas)
const engineOfSkill = mode => (mode === 'nim' ? 'gratuit' : 'claude-cli')
function consignesOf(body) {
  const m = String(body ?? '').match(/^##\s+Consignes en plus\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m)
  return m ? m[1].replace(/<!--[\s\S]*?-->/g, '').trim().slice(0, 4000) : ''
}

// ---------- Ce que dit le moteur ----------

// Une ligne de generator.py / exercices.py : « [42] texte » avance la barre, « @{…} » est l'activité de l'IA,
// « . texte » le journal ; le reste (uv, trace d'erreur) part au journal tel quel
function parseLine(line) {
  const l = String(line).trim()
  if (!l) return null
  if (l.startsWith('@{')) try { return { type: 'event', data: JSON.parse(l.slice(1)) } } catch {}
  const p = /^\[(\d{1,3})\]\s*(.+)$/.exec(l)
  if (p) return { type: 'phase', text: accents(p[2].replace(/\s{2,}/g, ' ')), pct: Math.min(100, +p[1]) }
  return { type: 'log', text: accents(l.startsWith('. ') ? l.slice(2) : l.slice(0, 400)) }
}
// Le moteur écrit sans accents (ses consignes sont en ASCII) : les mots qui reviennent dans ses lignes les retrouvent
const ACCENTS = { Redaction: 'Rédaction', redaction: 'rédaction', Reecriture: 'Réécriture', reecriture: 'réécriture', reecrite: 'réécrite',
  ecrites: 'écrites', ecrite: 'écrite', ecrits: 'écrits', ecrit: 'écrit', deja: 'déjà', tronque: 'tronqué', tronquee: 'tronquée', ignore: 'ignoré',
  Generation: 'Génération', generation: 'génération', genere: 'généré', echec: 'échec', abandonnee: 'abandonnée', reponse: 'réponse',
  coupee: 'coupée', recap: 'récap', redige: 'rédigé', assemble: 'assemblé', reperee: 'repérée', reperees: 'repérées',
  epuise: 'épuisé', refuse: 'refusé', reussi: 'réussi', copiee: 'copiée', copiees: 'copiées', detail: 'détail', decoupe: 'découpe',
  reflexion: 'réflexion', Recap: 'Récap' }
const accents = s => s.replace(/[A-Za-z]+/g, w => ACCENTS[w] ?? w)

// ---------- Révisions espacées (boîtes de Leitner) ----------
// Une carte neuve est en boîte 0. Bien : boîte suivante ; facile : deux de plus ; difficile : même boîte, attente
// moitié ; à revoir : boîte 1, revue dans 10 minutes. Les échéances tombent en début de journée : une carte vue hier
// soir revient ce matin, pas ce soir.
const WAIT_DAYS = [0, 1, 3, 7, 16, 35]
const GRADES = ['again', 'hard', 'good', 'easy']
const DAY = 864e5
const startOfDay = t => new Date(t).setHours(0, 0, 0, 0)
function review(state, grade, now = Date.now()) {
  if (!GRADES.includes(grade)) throw new Error(`Note inconnue : ${grade}`)
  let box = state?.box ?? 0, due
  if (grade === 'again') { box = 1; due = now + 10 * 60e3 }
  else {
    if (grade === 'hard') box = Math.max(1, box)
    else box = Math.min(WAIT_DAYS.length - 1, box + (grade === 'easy' ? 2 : 1))
    const days = grade === 'hard' ? Math.max(1, Math.round(WAIT_DAYS[box] / 2)) : WAIT_DAYS[box]
    due = startOfDay(now + days * DAY)
  }
  return { box, due, seen: (state?.seen ?? 0) + 1, lapses: (state?.lapses ?? 0) + (grade === 'again' ? 1 : 0), last: now }
}
const isDue = (state, now = Date.now()) => !state || state.due <= now
// Dans combien de temps une note ramènerait la carte, pour l'écrire sous son bouton
function waitLabel(state, grade, now = Date.now()) {
  const ms = review(state, grade, now).due - now
  if (ms < 3600e3) return `${Math.max(1, Math.round(ms / 60e3))} min`
  const days = Math.round((startOfDay(now + ms) - startOfDay(now)) / DAY)
  return days <= 1 ? 'demain' : `${days} j`
}
// L'identité d'une carte : sa question (une carte réécrite repart de zéro)
const cardId = recto => crypto.createHash('sha1').update(String(recto).trim().toLowerCase()).digest('hex').slice(0, 12)

// ---------- Correction des exercices du TP (comme l'interface d'Incipit) ----------

const normalize = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
// Un nombre écrit à la française (3,5) se compare comme 3.5
const num = s => { const n = parseFloat(String(s).trim().replace(',', '.')); return Number.isNaN(n) ? null : n }
function checkCalcul(answer, accepted) {
  const said = normalize(answer)
  if (!said) return false
  return accepted.some(r => normalize(r) === said || (num(r) !== null && num(answer) !== null && Math.abs(num(r) - num(answer)) < 1e-6))
}
function checkKeywords(answer, keywords) {
  const said = normalize(answer)
  const found = keywords.filter(k => said.includes(normalize(k)))
  return { found, missing: keywords.filter(k => !found.includes(k)), score: keywords.length ? found.length / keywords.length : 0 }
}
// Le score d'un TP : la moyenne sur tous ses exercices, faits ou non (un TP à moitié fait n'affiche pas un score gonflé)
const tpScore = list => list.length ? Math.round(list.reduce((a, e) => a + (e.points ?? 0), 0) / list.length * 100) : 0
// Le code de l'étudiant suivi de ses tests, chacun protégé : un test qui plante compte faux sans faire perdre les autres
const TEST_MARK = '###RESULTATS###'
function testScript(code, tests) {
  const checks = tests.map(t => `try:\n    __RESULTATS__.append(bool(${t}))\nexcept Exception:\n    __RESULTATS__.append(False)\n`).join('\n')
  return `${code}\n\n__RESULTATS__ = []\n${checks}\nprint(${JSON.stringify(TEST_MARK)} + ''.join('1' if r else '0' for r in __RESULTATS__))\n`
}
function testResult(code, stdout, stderr, total) {
  if (code !== 0) return { reussis: 0, total, erreur: (stderr || stdout || 'Erreur inconnue.').slice(-500) }
  const line = String(stdout).split(/\r?\n/).find(l => l.startsWith(TEST_MARK))
  if (!line) return { reussis: 0, total, erreur: 'Sortie inattendue : aucun résultat lisible.' }
  return { reussis: [...line.slice(TEST_MARK.length)].filter(c => c === '1').length, total, erreur: null }
}

// ---------- Réglages du module (config.json → cours) ----------
// La valeur acceptée, nettoyée, ou undefined : rien n'est écrit sans être vérifié
const MODEL = /^[\w.:/-]{1,120}$/
const SETTINGS = {
  moteur: v => v in MOTEURS ? v : undefined,
  nimKey: v => typeof v === 'string' && /^nvapi-[\w-]{10,200}$/.test(v.trim()) ? v.trim() : undefined,
  // Une ou plusieurs clés Gemini (une par ligne ou séparées par des virgules) : la première sert au moteur
  geminiKey: v => { const ks = typeof v === 'string' ? v.split(/[\s,;]+/).filter(Boolean) : []; return ks.length && ks.length <= 8 && ks.every(k => /^[\w-]{20,200}$/.test(k)) ? ks.join('\n') : undefined },
  // Les clés des fournisseurs à clé (chiffrées dans config.json) et le modèle de chaque moteur
  anthropicKey: v => typeof v === 'string' && /^sk-ant-[\w-]{20,400}$/.test(v.trim()) ? v.trim() : undefined,
  geminiProKey: v => typeof v === 'string' && /^[\w-]{20,200}$/.test(v.trim()) ? v.trim() : undefined,
  geminiProModel: v => typeof v === 'string' && (v === '' || MODEL.test(v)) ? v : undefined,
  openaiKey: v => typeof v === 'string' && /^sk-[\w-]{20,400}$/.test(v.trim()) ? v.trim() : undefined,
  openrouterKey: v => typeof v === 'string' && /^sk-or-[\w-]{20,400}$/.test(v.trim()) ? v.trim() : undefined,
  claudeModel: v => MODELES_CLAUDE.some(([k]) => k === v) ? v : undefined,
  anthropicModel: v => typeof v === 'string' && (v === '' || MODEL.test(v)) ? v : undefined,
  openaiModel: v => typeof v === 'string' && (v === '' || MODEL.test(v)) ? v : undefined,
  openrouterModel: v => typeof v === 'string' && (v === '' || MODEL.test(v)) ? v : undefined,
  nimModel: v => typeof v === 'string' && (v === '' || MODEL.test(v)) ? v : undefined,
  geminiModel: v => typeof v === 'string' && (v === '' || MODEL.test(v)) ? v : undefined,
  transcripteur: v => TRANSCRIPTEURS.some(([k]) => k === v) ? v : undefined,
  longueur: v => v in LONGUEURS ? v : undefined,
  langue: v => v in LANGUES ? v : undefined,
  destination: v => typeof v === 'string' && v.length <= 400 && path.isAbsolute(v) ? v : undefined,
  format: v => v === '1' || v === '2' ? v : undefined,
}
const validSetting = (key, value) => Object.hasOwn(SETTINGS, key) ? SETTINGS[key](value) : undefined
// Options d'une génération venues du panneau, bornées
function jobOptions(o = {}) {
  const b = v => v === true
  const questions = Number.isInteger(o.questions) && o.questions >= 1 && o.questions <= 30 ? o.questions : 0
  const text = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : ''
  return { cours: b(o.cours), sujet: b(o.sujet), fiche: b(o.fiche), tp: b(o.tp), cartes: b(o.cartes),
    niveau: text(o.niveau, 60) || 'comme le cours', focus: text(o.focus, 200), questions }
}
// Les modèles d'une liste, les connus d'abord dans l'ordre de préférence, puis le reste par ordre alphabétique
const byPreference = (names, pref) => [...names].sort((a, b) => {
  const ra = pref.indexOf(a), rb = pref.indexOf(b)
  return (ra < 0 ? pref.length : ra) - (rb < 0 ? pref.length : rb) || a.localeCompare(b)
})

module.exports = {
  TYPES, MOTEURS, TRANSCRIPTEURS, PREFERENCE_NIM, PREFERENCE_GEMINI, MODELES_CLAUDE, PREFERENCE_ANTHROPIC, PREFERENCE_GEMINI_PRO, PREFERENCE_OPENAI, PREFERENCE_OPENROUTER, MODELE_PAR_DEFAUT, LONGUEURS, LANGUES, MAX_OCTETS_FICHIER, FIN_DE_COURS, GRADES,
  slug, nomNote, getMatiere, getTitre, getType, workDir, sourcesDir, courseFile, imagesDir, companions, isCourseFile, identity,
  isInside, freeName, kindOf, linkFile, frontmatter, sectionsOf, words, parseLine, accents,
  review, isDue, waitLabel, cardId, startOfDay, normalize, checkCalcul, checkKeywords, tpScore, testScript, testResult,
  validSetting, jobOptions, byPreference,
  CAPS, notionId, layersOf, notionsOf, countedWords, formatOf, planFor, planOf, cleanProgress, engineOfSkill, consignesOf, GRADE_SCORE, evidence,
}

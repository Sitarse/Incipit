const { app, dialog, nativeImage, net, shell } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const lib = require('./lib')
const partage = require('./partage')
const startRunner = require('./runner')
const startVendor = require('./vendor')
const usage = require('../../app/usage')
const skills = require('../../ai/skills')

// Cours, partie Node d'Incipit (github.com/Sitarse/Incipit). Les photos d'un cours, ses PDF de diapos, des
// notes ou des liens deviennent un cours rédigé (Markdown pour Obsidian, et son PDF), avec fiche de révision, TP noté et
// flash cards. Le moteur d'Incipit est dans engine/ (generator.py, md2pdf.py, exercices.py), lancé par uv ; ce module
// remplace son interface : sources déposées, générations suivies en direct et arrêtables (runner.js), réglages (clé
// NVIDIA chiffrée dans config.json, jamais écrite ailleurs), TP et révisions espacées des cartes.

// Python ne lit pas dans l'archive asar de la version installée : le moteur y est désarchivé (package.json → asarUnpack)
const ENGINE = path.join(__dirname, 'engine').replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
const platform = require('../../app/platform')
// Claude Code et uv selon le système (app/platform.js) : uv, d'abord celui livré avec l'appli (resources/uv).
// Claude Code est cherché à chaque usage : il se met à jour tout seul et remplace son binaire (absent quelques secondes)
const claudeBin = () => platform.findClaude()
const MAX_FILE = 300 * 1024 * 1024
const findUv = () => platform.findUv()
const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fallback } }
const filesIn = dir => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name).sort() } catch { return [] } }

module.exports = ({ handle: register, send, configPath, readConfig, win }) => {
  // Chaque canal du panneau, gardé aussi pour le site (lecteur.js) qui en appelle une partie
  const handlers = {}
  const handle = (channel, fn) => { handlers[channel] = fn; register(channel, fn) }
  const DATA = path.join(app.getPath('userData'), 'cours')
  const WORK = path.join(DATA, 'workspace'), DRAFT = path.join(WORK, '_brouillon', 'sources')
  const JOURNAL = path.join(DATA, 'journal'), REVIEWS = path.join(DATA, 'revisions.json'), PROOFS = path.join(DATA, 'preuves.jsonl')
  // La série du jour (comme Duolingo, serie.js) : le panneau, l'îlot et le site la montrent
  const serie = require('./serie')(DATA)
  // Jamais écrit : les clés passent par l'environnement du moteur (INCIPIT_…), le temps d'une génération
  const NO_KEYS = path.join(DATA, 'pas-de-cles.env')
  const vendor = startVendor(path.join(DATA, 'vendor'), DATA)
  const cfg = () => readConfig(configPath)
  const opts = () => cfg().cours ?? {}
  const dest = () => opts().destination || path.join(app.getPath('documents'), 'Cours')
  let uv = findUv()
  const uvPath = () => (uv && fs.existsSync(uv) ? uv : (uv = findUv()))

  // ---------- Moteurs et réglages ----------

  // Ce qui manque à chaque moteur pour tourner (null : prêt)
  // Une destination choisie qui n'existe plus (dossier partagé absent, renommé) : rien n'est recréé ailleurs
  const destMissing = () => !!opts().destination && !fs.existsSync(dest())
  const keyProblem = (key, where) => key ? null : key === null ? 'Ta clé est illisible : recolle-la (Avancé).' : `Ajoute ta clé ${where} dans les réglages des cours (Avancé).`
  function problems() {
    const c = cfg(), noUv = uvPath() ? null : `uv est introuvable : installe-le (${platform.uvInstallHint()}), puis relance Incipit.`
    if (destMissing()) return Object.fromEntries(Object.keys(lib.MOTEURS).map(k => [k, `Le dossier de tes cours est introuvable : ${dest()}.`]))
    return {
      'claude-cli': noUv ?? (claudeBin() ? null : 'Claude Code est introuvable sur ce PC.'),
      gratuit: noUv ?? (c.cours?.nimKey ? null : c.cours?.nimKey === null ? 'Ta clé NVIDIA est illisible : recolle-la.' : 'Ajoute ta clé NVIDIA (gratuite) dans les réglages du module.'),
      gemini: noUv ?? (c.ai?.key ? null : 'Ajoute ta clé Gemini dans les réglages des cours (Avancé).'),
      anthropic: noUv ?? keyProblem(c.cours?.anthropicKey, 'Anthropic (console.anthropic.com)'),
      openai: noUv ?? keyProblem(c.cours?.openaiKey, 'OpenAI (platform.openai.com)'),
      'gemini-pro': noUv ?? keyProblem(c.cours?.geminiProKey, 'Gemini payante (aistudio.google.com/apikey, facturation activée)'),
      openrouter: noUv ?? keyProblem(c.cours?.openrouterKey, 'OpenRouter (openrouter.ai/keys)'),
    }
  }
  // Le skill « cours » (skills.js ; Hitodama en a, Incipit seul n'en a pas) : c'est lui qui dit qui écrit (Opus ou NIM) et ce qu'on ajoute à la méthode.
  // Effacé par l'utilisateur : le réglage du module reprend la main, comme avant.
  function skillCours() {
    try {
      const k = skills.folder() && skills.read('cours')
      return k?.run === 'cours' ? { moteur: lib.engineOfSkill(k.mode), consignes: lib.consignesOf(k.body) } : null
    } catch (err) { console.error('Cours (skill) :', err.message); return null }
  }
  const engine = () => skillCours()?.moteur ?? (opts().moteur in lib.MOTEURS ? opts().moteur : claudeBin() ? 'claude-cli' : opts().nimKey ? 'gratuit' : 'claude-cli')
  function settingsView() {
    const o = opts(), pb = problems(), c = cfg()
    return {
      moteur: engine(), skill: !!skillCours(), moteurs: Object.entries(lib.MOTEURS).map(([code, m]) => ({ code, ...m, souci: pb[code] })),
      nimKeySet: !!o.nimKey, nimKeyBad: o.nimKey === null, geminiKeySet: !!c.ai?.key,
      nimModel: o.nimModel || lib.PREFERENCE_NIM[0], nimModels: lib.PREFERENCE_NIM, geminiModel: o.geminiModel || lib.PREFERENCE_GEMINI[0], geminiModels: lib.PREFERENCE_GEMINI,
      // Les fournisseurs à clé : sa clé est-elle là, et le modèle choisi (la liste courte proposée)
      keys: { 'gemini-pro': !!o.geminiProKey, anthropic: !!o.anthropicKey, openai: !!o.openaiKey, openrouter: !!o.openrouterKey },
      keysBad: { 'gemini-pro': o.geminiProKey === null, anthropic: o.anthropicKey === null, openai: o.openaiKey === null, openrouter: o.openrouterKey === null },
      claudeModel: o.claudeModel || lib.MODELE_PAR_DEFAUT.claude, claudeModels: lib.MODELES_CLAUDE,
      anthropicModel: o.anthropicModel || lib.MODELE_PAR_DEFAUT.anthropic, anthropicModels: lib.PREFERENCE_ANTHROPIC,
      geminiProModel: o.geminiProModel || lib.MODELE_PAR_DEFAUT['gemini-pro'], geminiProModels: lib.PREFERENCE_GEMINI_PRO,
      openaiModel: o.openaiModel || lib.MODELE_PAR_DEFAUT.openai, openaiModels: lib.PREFERENCE_OPENAI,
      openrouterModel: o.openrouterModel || lib.MODELE_PAR_DEFAUT.openrouter, openrouterModels: lib.PREFERENCE_OPENROUTER,
      transcripteur: o.transcripteur || 'auto', transcripteurs: lib.TRANSCRIPTEURS,
      longueur: o.longueur in lib.LONGUEURS ? o.longueur : 'normal', format: o.format === '2' ? '2' : '1', langue: o.langue in lib.LANGUES ? o.langue : 'fr',
      destination: dest(), destinationMissing: destMissing(), uv: uvPath(), claude: claudeBin(), vendor: vendor.ready(),
      obsidian: obsidianInstalled(), obsidianVault: !!obsidianVault(dest()),
    }
  }
  // L'environnement du moteur : nos réglages préfixés INCIPIT_ (ceux d'avant, posés par un autre outil, sont retirés)
  function engineEnv() {
    const c = cfg(), o = c.cours ?? {}
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('INCIPIT_')))
    Object.assign(env, { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', UV_NO_PROGRESS: '1' })
    const put = (k, v) => { if (v) env[`INCIPIT_${k}`] = String(v) }
    put('NVIDIA_API_KEY', o.nimKey); put('GEMINI_API_KEY', String(c.ai?.key ?? '').split(/[\s,;]+/)[0]) // le moteur Python n'en prend qu'une : la première
    put('NIM_MODELE', o.nimModel); put('GEMINI_MODELE', o.geminiModel)
    put('GEMINI_PAID_API_KEY', o.geminiProKey); put('GEMINI_PRO_MODELE', o.geminiProModel); put('ANTHROPIC_API_KEY', o.anthropicKey); put('OPENAI_API_KEY', o.openaiKey); put('OPENROUTER_API_KEY', o.openrouterKey)
    put('ANTHROPIC_MODELE', o.anthropicModel); put('OPENAI_MODELE', o.openaiModel); put('OPENROUTER_MODELE', o.openrouterModel); put('CLAUDE_MODELE', o.claudeModel)
    put('TRANSCRIPTEUR', o.transcripteur); put('CLAUDE', claudeBin()); put('VENDOR', vendor.ready() ? path.join(DATA, 'vendor') : null)
    put('CONSIGNES', skillCours()?.consignes)
    return env
  }

  // ---------- Bibliothèque : les cours écrits dans la destination ----------

  const reviews = () => readJson(REVIEWS, {})
  function saveReviews(r) {
    fs.mkdirSync(DATA, { recursive: true })
    fs.writeFileSync(`${REVIEWS}.tmp`, JSON.stringify(r))
    fs.renameSync(`${REVIEWS}.tmp`, REVIEWS)
  }
  // Le journal des preuves de travail : une ligne par carte notée ou exercice corrigé (jamais d'erreur vers le panneau)
  function prove(src, course, notionTitre, score) {
    const line = `${JSON.stringify(lib.evidence(src, path.relative(dest(), course), notionTitre, score))}\n`
    fs.mkdir(DATA, { recursive: true }, () => fs.appendFile(PROOFS, line, err => err && console.error('Cours (preuve) :', err.message)))
  }
  // Les cartes d'un cours, avec leur état de révision
  function cardsOf(course, all = reviews()) {
    const key = path.relative(dest(), course), list = readJson(lib.companions(course).cartesJson, [])
    if (!Array.isArray(list)) return []
    return list.filter(c => c && typeof c.recto === 'string' && typeof c.verso === 'string').map(c => {
      const id = lib.cardId(c.recto)
      return { id, notion: String(c.notion ?? ''), recto: c.recto, verso: c.verso, state: all[key]?.[id] ?? null }
    })
  }
  function courseInfo(file) {
    const st = fs.statSync(file), { meta } = lib.frontmatter(fs.readFileSync(file, 'utf8').slice(0, 1200))
    const id = lib.identity(dest(), file), c = lib.companions(file), ex = p => fs.existsSync(p)
    return { path: file, matiere: id.matiere, type: id.type, titre: meta.titre || id.titre, at: st.mtimeMs, moteur: meta.moteur ?? '',
      pdf: ex(c.pdf), fiche: ex(c.fiche), sujet: ex(c.sujet), tp: ex(c.exercices), cartes: ex(c.cartesJson) }
  }
  function library() {
    const root = dest(), courses = []
    const dirs = d => { try { return fs.readdirSync(d, { withFileTypes: true }) } catch { return [] } }
    for (const m of dirs(root)) {
      if (!m.isDirectory() || /^[._]/.test(m.name)) continue
      const mdir = path.join(root, m.name)
      for (const e of dirs(mdir)) {
        const files = e.isDirectory() && !/^[._]/.test(e.name) ? filesIn(path.join(mdir, e.name)).map(f => path.join(mdir, e.name, f))
          : e.isFile() ? [path.join(mdir, e.name)] : []
        for (const f of files) if (lib.isCourseFile(path.basename(f))) try { courses.push(courseInfo(f)) } catch {}
      }
    }
    courses.sort((a, b) => b.at - a.at)
    const all = reviews(), now = Date.now()
    for (const c of courses) c.due = c.cartes ? cardsOf(c.path, all).filter(k => lib.isDue(k.state, now)).length : 0
    // Où tu en es dans chaque cours (le site : lecteur.js), et le dernier ouvert : « Reprendre la lecture »
    const progress = readJson(path.join(DATA, 'lecteur-progression.json'), {})
    for (const c of courses) { const p = progress?.[c.path]; c.prog = p?.total ? { done: Array.isArray(p.done) ? p.done.length : 0, total: p.total } : null }
    const seen = readJson(path.join(DATA, 'lecteur-last.json'), null), last = courses.find(c => c.path === seen?.path)
    return { root, courses, due: courses.reduce((n, c) => n + c.due, 0), matieres: [...new Set(courses.map(c => c.matiere))].sort((a, b) => a.localeCompare(b, 'fr')),
      last: last ? { path: last.path, titre: last.titre, matiere: last.matiere, type: last.type, at: Number(seen.at) || now } : null }
  }
  // Un cours désigné par le panneau : seulement un fichier de cours de la destination
  function courseAt(p) {
    if (typeof p !== 'string' || !path.isAbsolute(p) || !lib.isInside(dest(), p) || !lib.isCourseFile(path.basename(p)) || !fs.existsSync(p)) return null
    return lib.identity(dest(), p) ? p : null
  }

  // ---------- Sources : le brouillon du cours en préparation, ou celles d'un cours déjà écrit ----------

  function sourcesOf(target) {
    if (target === 'draft') return DRAFT
    const c = courseAt(target?.course), id = c && lib.identity(dest(), c)
    return id ? lib.sourcesDir(WORK, id.matiere, id.type, id.titre) : null
  }
  const targetOf = t => t === 'draft' ? 'draft' : t
  function listSources(target) {
    const dir = sourcesOf(target)
    if (!dir) return []
    return filesIn(dir).map(name => {
      const p = path.join(dir, name), size = fs.statSync(p).size, kind = lib.kindOf(name)
      const info = { name, size, kind }
      if (kind === 'lien') info.url = /^URL=(\S+)/m.exec(fs.readFileSync(p, 'utf8'))?.[1] ?? ''
      if (kind === 'texte') {
        const fd = fs.openSync(p, 'r'), head = Buffer.alloc(8192), n = fs.readSync(fd, head, 0, 8192, 0)
        fs.closeSync(fd)
        if (head.subarray(0, n).includes(0)) info.warn = 'Fichier binaire : il sera ignoré'
        else if (size > lib.MAX_OCTETS_FICHIER) info.warn = `Trop long : seuls les ${Math.round(lib.MAX_OCTETS_FICHIER / 1000)} premiers Ko seront lus`
      }
      return info
    })
  }
  // Fichiers (ou dossiers : leurs fichiers) déposés, copiés dans les sources ; jamais déplacés depuis leur place d'origine
  function addPaths(target, paths) {
    const dir = sourcesOf(target)
    if (!dir || !Array.isArray(paths)) return 0
    fs.mkdirSync(dir, { recursive: true })
    let n = 0
    const add = p => {
      const st = fs.statSync(p)
      if (!st.isFile() || st.size > MAX_FILE || lib.isInside(dir, p)) return
      fs.copyFileSync(p, path.join(dir, lib.freeName(dir, path.basename(p))))
      n++
    }
    for (const p of paths.slice(0, 200)) {
      if (typeof p !== 'string' || !path.isAbsolute(p)) continue
      try {
        if (fs.statSync(p).isDirectory()) for (const f of filesIn(p).slice(0, 200)) add(path.join(p, f))
        else add(p)
      } catch (err) { console.error('Cours (source) :', err.message) }
    }
    return n
  }
  // Un nouveau cours s'écrit depuis le brouillon ; une fois écrit, le brouillon devient ses sources (même nom pris :
  // suffixé, rien n'est écrasé), avec les photos déjà lues. Une génération ratée laisse donc le brouillon intact.
  function adoptDraft(sources) {
    fs.mkdirSync(sources, { recursive: true })
    for (const name of filesIn(DRAFT)) fs.renameSync(path.join(DRAFT, name), path.join(sources, lib.freeName(sources, name)))
    const read = path.join(path.dirname(DRAFT), '.transcriptions'), keep = path.join(path.dirname(sources), '.transcriptions')
    fs.mkdirSync(keep, { recursive: true })
    for (const name of filesIn(read)) if (!fs.existsSync(path.join(keep, name))) fs.renameSync(path.join(read, name), path.join(keep, name))
    fs.rmSync(path.dirname(DRAFT), { recursive: true, force: true })
  }
  // Les photos recopiées à côté du cours ; leurs liens relatifs à la racine du coffre Obsidian (sinon au dossier du cours)
  function copyImages(sources, course, titre) {
    const photos = filesIn(sources).filter(n => lib.kindOf(n) === 'photo')
    if (!photos.length) return []
    const dir = lib.imagesDir(course, titre), base = vaultRoot(dir) ?? path.dirname(course)
    fs.mkdirSync(dir, { recursive: true })
    return photos.map(n => { fs.copyFileSync(path.join(sources, n), path.join(dir, n)); return path.relative(base, path.join(dir, n)).split(path.sep).join('/') })
  }
  function vaultRoot(from) {
    for (let d = from; ; d = path.dirname(d)) {
      if (fs.existsSync(path.join(d, '.obsidian'))) return d
      if (path.dirname(d) === d) return null
    }
  }
  // Obsidian : installé (son dossier de réglages existe), et le coffre qu'il connaît autour d'un fichier. Il n'ouvre une
  // note par lien obsidian:// que dans un coffre déjà ouvert une fois chez lui.
  const OBSIDIAN = platform.obsidianConfig()
  const obsidianInstalled = () => fs.existsSync(path.dirname(OBSIDIAN))
  const obsidianVault = file => Object.values(readJson(OBSIDIAN, {})?.vaults ?? {}).map(v => v?.path)
    .find(v => typeof v === 'string' && (lib.isInside(v, file) || path.resolve(v) === path.resolve(file))) ?? null
  // La destination devient un coffre Obsidian (jamais écrasé : complété) avec la couleur « important » des PDF
  function ensureVault(dir) {
    const snippets = path.join(dir, '.obsidian', 'snippets'), css = path.join(snippets, 'fabrique-couleurs.css'), look = path.join(dir, '.obsidian', 'appearance.json')
    fs.mkdirSync(snippets, { recursive: true })
    if (!fs.existsSync(css)) fs.writeFileSync(css, '/* Fabrique -- ==surlignage== = rouge important, comme dans le PDF genere */\n.markdown-source-view.mod-cm6 .cm-highlight,\n.markdown-rendered mark {\n  background-color: #fdeced;\n  color: #b3261e;\n  border-radius: 4px;\n  padding: 0 .2em;\n}\n')
    const a = readJson(look, {})
    const on = Array.isArray(a.enabledCssSnippets) ? a.enabledCssSnippets : []
    if (!on.includes('fabrique-couleurs')) fs.writeFileSync(look, JSON.stringify({ ...a, enabledCssSnippets: [...on, 'fabrique-couleurs'] }, null, 2))
  }

  // Une génération avance : le panneau et le site le voient tous les deux
  let lecteur = null
  const sendAll = (channel, value) => { send(channel, value); if (channel === 'run') lecteur?.push('run', value) }
  const runner = startRunner({ send: sendAll, engine: ENGINE, uvPath, engineEnv, settingsView, dest, work: WORK, draft: DRAFT, journal: JOURNAL, noKeys: NO_KEYS,
    ensureVault, copyImages, adoptDraft, onUsage: (m, u) => usage.record(m, u, 'cours'), low: () => usage.low(), nimOk: () => !!opts().nimKey })
  setTimeout(vendor.ensure, 60e3)

  // Le lecteur : une grande fenêtre pour lire un cours, ses diapos à côté (lecteur.js)
  lecteur = require('./lecteur')({ engine: ENGINE, uvPath, engineEnv, data: DATA, library, courseAt, companions: lib.companions, claude: claudeBin, serie,
    call: (channel, ...args) => handlers[channel]?.(...args),
    vendor: () => vendor.ready() ? pathToFileURL(path.join(DATA, 'vendor')).href : null })


  // ---------- Canaux du panneau (window.api.mod('cours')) ----------

  handle('state', () => ({ library: library(), settings: settingsView(), run: runner.view() }))
  handle('library', () => library())
  handle('set', (key, value) => {
    const v = lib.validSetting(key, value)
    if (v === undefined) return { error: key === 'nimKey' ? 'Une clé NVIDIA commence par nvapi- et tient sur une ligne.' : key === 'geminiKey' ? 'Cette clé Gemini n’a pas la bonne forme (AIza…).' : 'Valeur refusée.' }
    // Qui rédige : écrit dans le skill « cours » quand il existe (une seule vérité, visible aussi dans l'onglet Skills)
    if (key === 'moteur' && skillCours()) {
      if (v === 'gemini') return { error: 'Le skill cours écrit avec Opus ou NVIDIA NIM.' }
      skills.setMeta('cours', 'modele', v === 'gratuit' ? 'nim' : 'opus')
      return { settings: settingsView() }
    }
    // La clé Gemini est celle de l'appli (ai.key), pas une option des cours
    if (key === 'geminiKey') readConfig.update(configPath, c => { c.ai = { ...c.ai, key: v } })
    else readConfig.update(configPath, c => { c.cours = { ...c.cours, [key]: v } })
    return { settings: settingsView() }
  })
  handle('pickDest', async () => {
    const r = await dialog.showOpenDialog({ title: 'Dossier de tes cours', defaultPath: dest(), properties: ['openDirectory', 'createDirectory'] })
    if (r.canceled || !r.filePaths[0]) return null
    readConfig.update(configPath, c => { c.cours = { ...c.cours, destination: r.filePaths[0] } })
    return { settings: settingsView(), library: library() }
  })
  // Le catalogue NVIDIA ouvert par la clé (et sa vérification : une clé refusée se voit tout de suite)
  handle('catalog', async () => {
    const key = opts().nimKey
    if (!key) return { error: 'Ajoute d’abord ta clé NVIDIA.' }
    try {
      const res = await net.fetch('https://integrate.api.nvidia.com/v1/models', { headers: { Authorization: `Bearer ${key}` } })
      if (res.status === 401 || res.status === 403) return { error: 'NVIDIA refuse cette clé.' }
      if (!res.ok) return { error: `NVIDIA a répondu ${res.status}.` }
      const ids = ((await res.json()).data ?? []).map(m => m?.id).filter(id => typeof id === 'string')
      return { models: lib.byPreference([...new Set(ids)], lib.PREFERENCE_NIM) }
    } catch { return { error: 'NVIDIA est injoignable pour le moment.' } }
  })

  // Le catalogue OpenRouter : ses modèles gratuits d'abord (prix nul), puis les autres ; il ne demande pas de clé
  handle('catalogOr', async () => {
    try {
      const res = await net.fetch('https://openrouter.ai/api/v1/models')
      if (!res.ok) return { error: `OpenRouter a répondu ${res.status}.` }
      const all = ((await res.json()).data ?? []).filter(m => typeof m?.id === 'string')
      const free = id => all.find(m => m.id === id)?.pricing?.prompt === '0'
      const ids = all.map(m => m.id)
      return { models: [...ids.filter(free).sort(), ...ids.filter(id => !free(id)).sort()], free: ids.filter(free).length }
    } catch { return { error: 'OpenRouter est injoignable pour le moment.' } }
  })

  handle('course', p => {
    const course = courseAt(p)
    if (!course) return { error: 'Ce cours est introuvable (déplacé ou supprimé ?).' }
    const md = fs.readFileSync(course, 'utf8'), { meta } = lib.frontmatter(md)
    return { ...courseInfo(course), words: lib.words(md), sources: meta.sources ?? '', date: meta.date ?? '',
      format: lib.formatOf(md), notions: lib.notionsOf(md), counted: lib.countedWords(md), cap: lib.CAPS[settingsView().longueur],
      sections: lib.sectionsOf(md).filter(s => !s.fin), cards: cardsOf(course).length, sourceFiles: listSources({ course }) }
  })
  handle('sources', t => listSources(targetOf(t)))
  handle('addPaths', (t, paths) => ({ added: addPaths(targetOf(t), paths) }))
  handle('pickFiles', async t => {
    const r = await dialog.showOpenDialog({ title: 'Sources du cours', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Photos, PDF, notes et code', extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif', 'bmp', 'pdf', 'md', 'txt', 'py', 'c', 'cpp', 'java', 'js', 'ts', 'html', 'css', 'sql', 'json', 'csv', 'tex'] },
        { name: 'Tous les fichiers', extensions: ['*'] }] })
    return { added: r.canceled ? 0 : addPaths(targetOf(t), r.filePaths) }
  })
  handle('addLink', (t, url) => {
    const dir = sourcesOf(targetOf(t)), f = lib.linkFile(url)
    if (!dir || !f) return { error: 'Lien invalide : colle une adresse qui commence par http:// ou https://.' }
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, lib.freeName(dir, f.name)), f.text)
    return { ok: true }
  })
  handle('removeSource', (t, name) => {
    const dir = sourcesOf(targetOf(t))
    if (!dir || typeof name !== 'string' || path.basename(name) !== name) return false
    fs.rmSync(path.join(dir, name), { force: true })
    return true
  })
  handle('clearDraft', () => { fs.rmSync(path.dirname(DRAFT), { recursive: true, force: true }); return true })
  // Vignette d'une photo déposée (le panneau n'affiche pas de fichiers locaux, seulement des images data:)
  handle('thumb', async (t, name) => {
    const dir = sourcesOf(targetOf(t))
    if (!dir || typeof name !== 'string' || path.basename(name) !== name || lib.kindOf(name) !== 'photo') return null
    const file = path.join(dir, name)
    let img = await nativeImage.createThumbnailFromPath(file, { width: 96, height: 96 }).catch(() => null)
    if (!img || img.isEmpty()) img = nativeImage.createFromPath(file).resize({ width: 96 })
    return img.isEmpty() ? null : img.toDataURL()
  })

  // Lancer : un nouveau cours (depuis le brouillon), ou un cours déjà écrit à régénérer, compléter, réécrire
  handle('generate', req => {
    const o = lib.jobOptions(req?.options), souci = runner.blocked()
    if (souci) return { error: souci }
    if (!o.cours && !o.sujet && !o.fiche && !o.tp && !o.cartes) return { error: 'Choisis au moins une chose à générer.' }
    let who, draft = false
    if (req?.course) {
      const c = courseAt(req.course)
      if (!c) return { error: 'Ce cours est introuvable.' }
      who = lib.identity(dest(), c)
    } else {
      if (!String(req?.titre ?? '').trim()) return { error: 'Donne un titre au cours (par exemple « CM3 · Les piles »).' }
      who = { matiere: lib.getMatiere(req?.matiere), type: lib.getType(req?.type), titre: lib.getTitre(String(req.titre).trim()) }
      draft = !!filesIn(DRAFT).length
    }
    // Un nom déjà connu : ses sources et le brouillon s'additionnent
    const own = lib.sourcesDir(WORK, who.matiere, who.type, who.titre), known = filesIn(own)
    if (draft && known.length) { adoptDraft(own); draft = false }
    if ((o.cours || o.sujet) && !draft && !filesIn(own).length) return { error: 'Ajoute au moins une source : photo, PDF, notes ou lien.' }
    if (!o.cours && !fs.existsSync(lib.courseFile(dest(), who.matiere, who.type, who.titre)) && (o.fiche || o.tp || o.cartes))
      return { error: 'Le cours n’existe pas encore : coche « Cours » pour l’écrire d’abord.' }
    usage.getQuota() // relu en fond s'il est vieux : la génération suivante saura si le quota est presque plein
    return runner.start({ kind: o.cours || o.sujet ? 'cours' : 'supports', who, options: o, draft }, `${who.type} - ${who.titre}`)
  })
  handle('rewrite', req => {
    const c = courseAt(req?.course), section = typeof req?.section === 'string' ? req.section.trim() : ''
    if (!c || !section || section.length > 300) return { error: 'Section introuvable.' }
    if (!lib.sectionsOf(fs.readFileSync(c, 'utf8')).some(s => s.title === section && !s.fin)) return { error: 'Cette section n’existe plus dans le cours.' }
    const consigne = typeof req.consigne === 'string' ? req.consigne.trim().slice(0, 1500) : ''
    return runner.start({ kind: 'reecrire', who: lib.identity(dest(), c), options: lib.jobOptions({}), section, consigne }, section)
  })
  handle('cancel', () => runner.cancel())
  handle('dismiss', () => { runner.dismiss(); return true })

  // Ouvrir : le PDF, la note (Obsidian s'il connaît le coffre), un support, un dossier, l'appel d'une génération
  handle('open', async (what, p) => {
    const openPath = async f => !(await shell.openPath(f))
    if (what === 'trace') return typeof p === 'string' && lib.isInside(JOURNAL, p) && fs.existsSync(p) ? openPath(p) : false
    if (what === 'dest') { if (destMissing()) return false; fs.mkdirSync(dest(), { recursive: true }); return openPath(dest()) }
    if (what === 'sources') { const dir = sourcesOf(p === 'draft' ? 'draft' : { course: p }); if (!dir) return false; fs.mkdirSync(dir, { recursive: true }); return openPath(dir) }
    const course = courseAt(p)
    if (!course) return false
    const c = lib.companions(course)
    if (what === 'folder') { shell.showItemInFolder(course); return true }
    if (what === 'lire') return lecteur.open(course)
    if (what === 'export') return exportIncipit(course)
    if (what === 'obsidian') {
      ensureVault(dest())
      if (!obsidianVault(course)) return { hint: `Obsidian ne connaît pas encore ce dossier : dans Obsidian, « Ouvrir un dossier comme coffre », choisis ${dest()}, puis réessaie.` }
      return shell.openExternal(`obsidian://open?path=${encodeURIComponent(course)}`).then(() => true, () => false)
    }
    const f = { pdf: c.pdf, fiche: fs.existsSync(c.fichePdf) ? c.fichePdf : c.fiche, sujet: fs.existsSync(c.sujetPdf) ? c.sujetPdf : c.sujet, cartes: c.cartes, md: course }[what]
    return f && fs.existsSync(f) ? openPath(f) : false
  })

  // ---------- Partage : un cours en un fichier .incipit (partage.js), que Incipit lit et écrit aussi ----------

  async function exportIncipit(course) {
    const who = lib.identity(dest(), course)
    const r = await dialog.showSaveDialog({ title: `Exporter « ${who.titre} »`, filters: [{ name: 'Cours Incipit', extensions: ['incipit'] }],
      defaultPath: path.join(app.getPath('downloads'), `${who.type} - ${who.titre}${partage.EXT}`) })
    if (r.canceled || !r.filePath) return true
    try { fs.writeFileSync(r.filePath, partage.pack(course, who, app.getName().toLowerCase())) } catch (err) {
      console.error('Export .incipit :', err)
      return { hint: err.code ? 'L’export a échoué : le fichier n’a pas pu être écrit.' : err.message }
    }
    shell.showItemInFolder(r.filePath)
    return true
  }
  // Les .incipit de cette liste : lus, montrés (ce qu'ils contiennent, et si un cours du même nom serait remplacé), puis
  // posés dans le dossier des cours si tu confirmes. -> { imported: [{ path, titre }], error }
  async function importIncipit(files) {
    const imported = []
    for (const file of files.filter(partage.isIncipit)) {
      try {
        if (destMissing()) throw new Error(`Le dossier de tes cours est introuvable : ${dest()}.`)
        if (!fs.statSync(file).isFile() || fs.statSync(file).size > MAX_FILE) throw new Error('Fichier introuvable ou trop gros.')
        const un = partage.unpack(fs.readFileSync(file)), there = partage.existing(dest(), un.who), go = there ? 'Remplacer' : 'Importer'
        const detail = [there && 'Ce cours existe déjà chez toi : il sera remplacé.',
          un.tp && 'Il contient un TP dont le code s’exécute sur ton PC : n’importe que des cours de gens en qui tu as confiance.'].filter(Boolean).join('\n\n')
        const ask = await dialog.showMessageBox({ type: 'question', title: 'Importer un cours', noLink: true, buttons: [go, 'Annuler'], defaultId: 1, cancelId: 1,
          message: `${go} « ${un.who.type} - ${un.who.titre} » (${un.who.matiere}) ?`, detail: detail || undefined })
        if (ask.response !== 0) continue
        const out = partage.install(dest(), un, !!there)
        imported.push({ path: out.course, titre: un.who.titre })
      } catch (err) {
        console.error('Import .incipit :', err)
        return { imported, error: err.code ? 'L’import a échoué : fichier illisible ou dossier fermé.' : err.message }
      }
    }
    if (imported.length) send('library', library())
    return { imported }
  }
  handle('import', async paths => {
    let files = Array.isArray(paths) ? paths.filter(p => typeof p === 'string') : []
    if (!files.length) {
      const r = await dialog.showOpenDialog({ title: 'Importer un cours', filters: [{ name: 'Cours Incipit', extensions: ['incipit'] }], properties: ['openFile', 'multiSelections'] })
      if (r.canceled) return { imported: [] }
      files = r.filePaths
    }
    return { ...await importIncipit(files), library: library() }
  })
  // Un .incipit de la ligne de commande (double-clic : l'Explorateur lance l'appli avec son chemin) : importé, puis le cours
  // s'ouvre dans le site ; rend s'il y en avait un
  const openArgs = argv => {
    const files = argv.filter(partage.isIncipit).map(f => path.resolve(f))
    if (files.length) importIncipit(files).then(r => { if (r.imported[0]) lecteur.open(r.imported[0].path) })
    return files.length > 0
  }
  // ---------- TP : les exercices du cours, corrigés ici ----------

  const exercisesOf = course => { const l = course && readJson(lib.companions(course).exercices, null); return Array.isArray(l) ? l : null }
  handle('tp', p => {
    const list = exercisesOf(courseAt(p))
    if (!list) return { error: 'Aucun TP pour ce cours : génère-le d’abord.' }
    // i : sa place dans le fichier, celle que tpCheck relit (les entrées illisibles sont sautées)
    return { exercices: list.map((e, i) => ({ e, i })).filter(({ e }) => e && typeof e.enonce === 'string').map(({ e, i }) => ({ i, notion: String(e.notion ?? ''),
      palier: String(e.palier ?? e.difficulte ?? ''), type: ['code', 'calcul', 'qualitatif'].includes(e.type) ? e.type : 'qualitatif', enonce: e.enonce,
      indice: String(e.indice ?? ''), solution: String(e.solution ?? ''), stub: String(e.stub ?? ''), tests: Array.isArray(e.tests) ? e.tests.length : 0 })) }
  })
  // Corriger une réponse : une valeur attendue (calcul), des idées clés (qualitatif), ou le code de l'étudiant qui tourne
  // contre ses tests, dans un Python à part, 10 s au plus. { self: true } : rien de sûr à comparer, il se note lui-même.
  handle('tpCheck', async (p, index, answer) => {
    const list = exercisesOf(courseAt(p)), exo = list && Number.isInteger(index) ? list[index] : null
    if (!exo || typeof answer !== 'string' || answer.length > 50000) return { erreur: 'Exercice introuvable.' }
    const strings = v => Array.isArray(v) ? v.map(String).filter(Boolean) : []
    if (exo.type === 'calcul' && strings(exo.reponses).length) return { ok: lib.checkCalcul(answer, strings(exo.reponses)) }
    if (exo.type === 'qualitatif' && strings(exo.mots_cles).length) return lib.checkKeywords(answer, strings(exo.mots_cles))
    const tests = strings(exo.tests)
    if (exo.type !== 'code' || !tests.length) return { self: true }
    if (!uvPath()) return { reussis: 0, total: tests.length, erreur: 'uv est introuvable.' }
    const file = path.join(os.tmpdir(), `incipit-tp-${process.pid}-${Date.now()}.py`)
    fs.writeFileSync(file, lib.testScript(answer, tests))
    return new Promise(resolve => {
      const child = spawn(uvPath(), ['run', '--no-project', '--quiet', file], { ...platform.spawnOptions(), env: { ...process.env, PYTHONUTF8: '1' } })
      let out = '', err = ''
      const end = r => { clearTimeout(timer); resolve(r); setTimeout(() => fs.rm(file, { force: true }, () => {}), 2000) }
      const timer = setTimeout(() => { runner.killTree(child.pid); end({ reussis: 0, total: tests.length, erreur: 'Le code met trop de temps (boucle infinie ?).' }) }, 10e3)
      child.stdout.setEncoding('utf8').on('data', d => { out += d })
      child.stderr.setEncoding('utf8').on('data', d => { err += d })
      child.on('close', c => end(lib.testResult(c, out, err, tests.length)))
      child.on('error', e => end({ reussis: 0, total: tests.length, erreur: e.message }))
    })
  })

  // ---------- Flash cards : révisions espacées ----------

  const forPanel = (c, course, now) => ({ ...c, course, due: lib.isDue(c.state, now), fresh: !c.state,
    waits: Object.fromEntries(lib.GRADES.map(g => [g, lib.waitLabel(c.state, g, now)])) })
  handle('cards', p => {
    const course = courseAt(p)
    if (!course) return { error: 'Ce cours est introuvable.' }
    const now = Date.now()
    return { cards: cardsOf(course).map(c => forPanel(c, course, now)) }
  })
  // Les cartes à revoir aujourd'hui, tous cours confondus (les échéances les plus anciennes d'abord, les neuves ensuite)
  handle('dueCards', () => {
    const now = Date.now(), all = reviews(), out = []
    for (const c of library().courses) if (c.cartes)
      for (const k of cardsOf(c.path, all)) if (lib.isDue(k.state, now)) out.push({ ...forPanel(k, c.path, now), courseTitle: c.titre, matiere: c.matiere })
    out.sort((a, b) => (a.state?.due ?? Infinity) - (b.state?.due ?? Infinity))
    return { cards: out.slice(0, 300) }
  })
  handle('review', (p, id, grade) => {
    const course = courseAt(p)
    if (!course || typeof id !== 'string' || !lib.GRADES.includes(grade)) return false
    const card = cardsOf(course).find(c => c.id === id)
    if (!card) return false
    const all = reviews(), key = path.relative(dest(), course)
    all[key] = { ...all[key], [id]: lib.review(card.state, grade) }
    saveReviews(all)
    prove('carte', course, card.notion, lib.GRADE_SCORE[grade])
    serie.record('cards')
    return true
  })
  handle('serie', () => serie.state())
  // Un exercice du TP corrigé (revise.js) : sa note de 0 à 1 rejoint les preuves
  handle('tpResult', (p, index, points) => {
    const course = courseAt(p), exo = Number.isInteger(index) ? exercisesOf(course)?.[index] : null
    if (!exo || typeof points !== 'number' || Number.isNaN(points)) return false
    prove('tp', course, String(exo.notion ?? ''), points)
    return true
  })

  win.webContents.on('did-finish-load', () => runner.publish(true))
  // Pour le reste de l'appli : ce qui tourne, et l'ouverture d'un .incipit (main.js)
  return { status: () => runner.view(), partage: { openArgs } }
}

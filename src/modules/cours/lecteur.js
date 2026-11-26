const { BrowserWindow, ipcMain, shell } = require('electron')
const { execFile } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { VIEWERS } = require('../../ai/companion')
const { specsOf } = require('./schemas-cours')
const { cleanProgress, cleanQuestions } = require('./lib')
const IDE = require('./ide')
const { LANGS: IDE_LANGS } = require('./ide-langs')

// Le lecteur de cours : une grande fenêtre (lecteur.html) qui lit tes cours écrits, chaque partie avec ses diapos
// à côté, et le tuteur sur le passage lu. engine/lecteur.py prépare un cours (texte rendu, parties, sources de chacune) ;
// le résultat est gardé dans DATA/lecteur tant que le cours et le script ne changent pas.
// ctx : engine, uvPath, engineEnv, data, library, courseAt, companions (main.js)
module.exports = ctx => {
  const CACHE = path.join(ctx.data, 'lecteur'), SCRIPT = path.join(ctx.engine, 'lecteur.py')
  // La progression dans chaque cours (lecteur-progression.json) : un enregistrement par cours, vérifié avant d'être gardé
  const PROGRESS = path.join(ctx.data, 'lecteur-progression.json')
  // Les questions posées au tuteur sur un passage, avec sa réponse (lecteur-questions.js) : une liste par cours
  const QUESTIONS = path.join(ctx.data, 'lecteur-questions.json')
  // Le temps d'étude, par jour (lecteur-stats.js l'affiche) : 30 s à chaque signe du site, pas plus d'un toutes les 25 s
  const ACTIVITY = path.join(ctx.data, 'lecteur-activite.json')
  let lastTick = 0
  const readAll = f => { try { const v = JSON.parse(fs.readFileSync(f, 'utf8')); return v && typeof v === 'object' ? v : {} } catch { return {} } }
  const readProgress = () => readAll(PROGRESS)
  function writeAll(f, all) {
    fs.mkdirSync(ctx.data, { recursive: true })
    fs.writeFileSync(`${f}.tmp`, JSON.stringify(all))
    fs.renameSync(`${f}.tmp`, f)
  }
  let win = null, wanted = null, wantedChap = null
  // L'IDE des cours (ide.js) : la console et le pas à pas, montrés dans cette fenêtre
  const ide = IDE({ data: ctx.data, push: ev => { if (win && !win.isDestroyed()) win.webContents.send('lecteur-ide', ev) } })
  // « Pour aller plus loin » : des vidéos et des pages web pour un chapitre, cherchées à la demande (ressources.js)
  const res = require('./ressources')({ data: ctx.data, claude: ctx.claude })
  const pending = new Map() // un cours en préparation : une seule fois, même demandé deux fois

  function prepare(course) {
    const st = fs.statSync(course), key = crypto.createHash('sha1').update(course).digest('hex').slice(0, 16)
    const file = path.join(CACHE, `${key}.json`), stamp = `${st.mtimeMs}:${fs.statSync(SCRIPT).mtimeMs}`
    try { const c = JSON.parse(fs.readFileSync(file, 'utf8')); if (c.stamp === stamp) return Promise.resolve(c.data) } catch {}
    if (pending.has(course)) return pending.get(course)
    const p = new Promise((resolve, reject) => {
      const uv = ctx.uvPath()
      if (!uv) return reject(new Error(`uv est introuvable : installe-le (${require('../../app/platform').uvInstallHint()}).`))
      execFile(uv, ['run', '--script', SCRIPT, course], { cwd: ctx.engine, env: ctx.engineEnv(), windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 180_000 },
        (err, out, errOut) => {
          if (err) return reject(new Error(String(errOut || err.message).trim().split(/\r?\n/).pop()))
          try {
            const data = JSON.parse(out)
            fs.mkdirSync(CACHE, { recursive: true })
            fs.writeFileSync(file, JSON.stringify({ stamp, data }))
            resolve(data)
          } catch (e) { reject(e) }
        })
    }).finally(() => pending.delete(course))
    pending.set(course, p)
    return p
  }

  // Les matières et leurs cours, pour la barre de gauche
  function shelf() {
    const lib = ctx.library(), by = new Map()
    for (const c of lib.courses) by.set(c.matiere, [...(by.get(c.matiere) ?? []), { path: c.path, type: c.type, titre: c.titre, cartes: c.cartes, due: c.due, pdf: c.pdf, fiche: c.fiche, tp: c.tp }])
    const ord = { CM: 0, TD: 1, TP: 2 }
    return [...by].sort(([a], [b]) => a.localeCompare(b, 'fr')).map(([nom, cours]) => ({ nom,
      cours: cours.sort((a, b) => ord[a.type] - ord[b.type] || a.titre.localeCompare(b.titre, 'fr', { numeric: true })) }))
  }

  const mine = e => win && !win.isDestroyed() && e.sender === win.webContents
  ipcMain.handle('lecteur', async (e, op, arg) => {
    if (!mine(e)) return null
    if (op === 'start') { const w = wanted, c = wantedChap; wanted = wantedChap = null; return { shelf: shelf(), course: w, chap: c, vendor: ctx.vendor() } }
    if (op === 'shelf') return shelf()
    if (op === 'course') {
      const course = ctx.courseAt(arg)
      if (!course) return { error: 'Ce cours est introuvable (déplacé ou supprimé ?).' }
      // le dernier cours lu : le panneau propose de reprendre là
      fs.writeFile(path.join(ctx.data, 'lecteur-last.json'), JSON.stringify({ path: course, at: Date.now() }), () => {})
      // les schémas dessinés (leur description en commentaire dans le .md) : le lecteur les redessine, pas à pas
      try { return { path: course, ...(await prepare(course)), schemas: specsOf(fs.readFileSync(course, 'utf8')) } } catch (err) { return { error: `Lecture impossible : ${err.message}` } }
    }
    if (op === 'pdf') { const c = ctx.courseAt(arg), f = c && ctx.companions(c).pdf; return !!f && fs.existsSync(f) && !(await shell.openPath(f)) }
    // Le site fait tout ce que faisait la page d'un cours dans le panneau : seulement ces canaux du module (main.js)
    if (op === 'mod' && SITE.has(arg?.channel) && Array.isArray(arg.args)) {
      try { return await ctx.call(arg.channel, ...arg.args) } catch (err) { console.error('Lecteur :', err); return { error: 'Ça n’a pas marché.' } }
    }
    if (op === 'res') {
      const a = arg ?? {}, course = ctx.courseAt(a.path), chap = typeof a.chap === 'string' && a.chap.length <= 200 ? a.chap : null
      if (!course || !chap) return null
      const s = v => (typeof v === 'string' ? v.slice(0, 4000) : '')
      if (a.op === 'get') return { data: res.get(course, chap), searching: res.searching(course, chap) }
      if (a.op === 'clear') return res.clear(course, chap)
      if (a.op === 'find') {
        try { return { data: await res.search({ course, chap, matiere: s(a.matiere), coursTitre: s(a.coursTitre), titre: s(a.titre), texte: s(a.texte) }) } }
        catch (err) { console.error('Ressources :', err.message); return { error: err.message } }
      }
      return null
    }
    // La série (serie.js) : la lire ; un chapitre ou un quiz terminé dans le site compte pour aujourd'hui
    if (op === 'serie') {
      if (arg === 'chap' || arg === 'quiz') ctx.serie.record(arg)
      return ctx.serie.state()
    }
    if (op === 'ide') {
      const a = arg ?? {}, ok = typeof a.lang === 'string' && a.lang in IDE_LANGS
      const code = typeof a.code === 'string' && a.code.length <= 200_000 ? a.code : null
      if (a.op === 'langs') return ide.langs()
      if (a.op === 'rescan') return ide.rescan()
      if (a.op === 'stop') return ide.stop()
      if (a.op === 'input') return typeof a.text === 'string' && ide.input(a.text)
      if (a.op === 'install' && ok) return ide.install(a.lang)
      if (a.op === 'installdbg') return ide.installDbg()
      if ((a.op === 'run' || a.op === 'trace') && ok && code !== null) {
        // files : les autres fichiers d'un exemple C/C++ (Purse.h…), vérifiés par ide.js (cleanFiles)
        try { return await (a.op === 'run' ? ide.run({ lang: a.lang, code, files: a.files }) : ide.trace({ lang: a.lang, code, files: a.files, stdin: typeof a.stdin === 'string' ? a.stdin : '' })) }
        catch (err) { console.error('IDE :', err); return { error: err.message } }
      }
      return null
    }
    // Où l'on en est d'un cours (les chapitres et quiz finis, le dernier ouvert) : lu, ou écrit par le site
    if (op === 'progress') {
      const course = ctx.courseAt(arg?.path)
      if (!course) return null
      const all = readProgress()
      if (arg.data === undefined) return all[course] ?? null
      all[course] = cleanProgress(arg.data)
      writeAll(PROGRESS, all)
      return true
    }
    if (op === 'questions') {
      const course = ctx.courseAt(arg?.path)
      if (!course) return null
      const all = readAll(QUESTIONS)
      if (arg.data === undefined) return Array.isArray(all[course]) ? all[course] : []
      all[course] = cleanQuestions(arg.data)
      writeAll(QUESTIONS, all)
      return true
    }
    if (op === 'tick') {
      const now = Date.now()
      if (now - lastTick < 25e3) return false
      lastTick = now
      let days = {}
      try { const v = JSON.parse(fs.readFileSync(ACTIVITY, 'utf8')); if (v && typeof v === 'object') days = v } catch {}
      const d = new Date(now), k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      days[k] = Math.min(86400, (Number(days[k]) || 0) + 30)
      fs.writeFileSync(`${ACTIVITY}.tmp`, JSON.stringify(days)); fs.renameSync(`${ACTIVITY}.tmp`, ACTIVITY)
      return true
    }
    if (op === 'stats') {
      const all = Object.values(readProgress()), quiz = all.flatMap(v => Object.values(v.quiz ?? {})).filter(n => typeof n === 'number' && n >= 0 && n <= 1)
      let days = {}
      try { days = JSON.parse(fs.readFileSync(ACTIVITY, 'utf8')) ?? {} } catch {}
      return { done: all.reduce((a, v) => a + (v.done?.length ?? 0), 0), total: all.reduce((a, v) => a + (v.total ?? 0), 0), quiz, days }
    }
    if (op === 'progresses') return Object.fromEntries(Object.entries(readProgress()).map(([p, v]) => [p, { done: v.done.length, total: v.total }]))
    // La fiche d'un cours, rendue comme le cours (formules, encadrés, schémas)
    if (op === 'fiche') {
      const c = ctx.courseAt(arg), f = c && ctx.companions(c).fiche
      if (!f || !fs.existsSync(f)) return { none: true }
      try { return { ...(await prepare(f)), schemas: specsOf(fs.readFileSync(f, 'utf8')) } } catch (err) { return { error: `Lecture impossible : ${err.message}` } }
    }
    return null
  })
  // La génération en cours, montrée aussi dans le site (une partie réécrite, un support créé)
  const push = (c, v) => { if (win && !win.isDestroyed()) win.webContents.send(`lecteur-${c}`, v) }

  // chap : le titre du chapitre où ouvrir (une source citée), sinon là où tu en étais
  function open(course, chap = null) {
    if (win && !win.isDestroyed()) {
      win.webContents.send('lecteur-open', course, chap)
      if (win.isMinimized()) win.restore()
      return win.show(), win.focus(), true
    }
    wanted = course; wantedChap = chap
    win = new BrowserWindow({ width: 1600, height: 1000, minWidth: 1100, minHeight: 700, show: false, backgroundColor: '#111110',
      title: 'Cours', icon: path.join(__dirname, '..', '..', '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'logo.png'), autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'lecteur-preload.js') } })
    win.removeMenu()
    VIEWERS.add(win)
    win.on('closed', () => { VIEWERS.delete(win); win = null; ide.stop() })
    // un lien du cours (une source citée) part dans le navigateur, jamais dans cette fenêtre
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' } })
    win.webContents.on('will-navigate', (ev, url) => { ev.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url) })
    win.once('ready-to-show', () => { win.maximize(); win.show() })
    win.loadFile(path.join(__dirname, 'lecteur.html'))
    return true
  }

  // res : la recherche de vidéos et de pages ; ide : l'IDE du site
  return { open, push, res }
}
// Les canaux du module que le site peut appeler (jamais les réglages ni les clés)
const SITE = new Set(['course', 'sources', 'pickFiles', 'addLink', 'removeSource', 'generate', 'rewrite', 'cancel', 'dismiss', 'open',
  'tp', 'tpCheck', 'tpResult', 'cards', 'review', 'state'])

// « Pour aller plus loin » : des vidéos YouTube et des pages web qui expliquent exactement un chapitre, trouvées à la
// demande (un bouton dans « Sources » du lecteur), jamais pendant la génération. Trois temps :
// 1. Claude (Sonnet, avec la recherche web du CLI) cherche et ouvre les pages : il ne donne que des adresses trouvées ;
// 2. Hitodama vérifie chaque adresse (une page qui ne répond pas part) et lit les chapitres de chaque vidéo sur YouTube
//    (sa description), sans quota ;
// 3. Claude (Haiku, sans outil, presque rien) choisit dans ces chapitres le moment qui traite le chapitre du cours.
// Le résultat est gardé dans DATA/ressources (un fichier par chapitre) : un chapitre ne se cherche qu'une fois.
// ctx : data, claude (le chemin du CLI ou null)
const { spawn } = require('node:child_process')
const { net } = require('electron')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const TIMEOUT = 4 * 60e3
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const SCHEMA = { type: 'object', required: ['ressources'], properties: { ressources: { type: 'array', maxItems: 7, items: { type: 'object', required: ['type', 'titre', 'url', 'pourquoi'], properties: {
  type: { enum: ['video', 'site'] }, titre: { type: 'string' }, url: { type: 'string' }, auteur: { type: 'string' }, langue: { type: 'string', description: 'fr, en…' },
  debut: { type: 'string', description: 'm:ss ou h:mm:ss du passage exact, si tu l’as lu ; sinon vide' },
  pourquoi: { type: 'string', description: 'une phrase pour l’étudiant : ce que la ressource apporte à ce chapitre' } } } } } }
const PICK = { type: 'object', required: ['choix'], properties: { choix: { type: 'array', items: { type: 'object', required: ['video', 'chapitre'], properties: {
  video: { type: 'string' }, chapitre: { type: 'integer', description: 'le numéro du chapitre de la vidéo qui traite le sujet, -1 si aucun' } } } } } }

// ---------- Pur (testé dans tests/ressources.test.js) ----------
const ytId = u => String(u ?? '').match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/)?.[1] ?? null
// « 1:02:03 », « 7:55 » -> secondes ; null si ce n'est pas un temps
function seconds(t) {
  const m = String(t ?? '').trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/)
  return m ? (+(m[1] ?? 0)) * 3600 + +m[2] * 60 + +m[3] : null
}
const clock = s => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}` }
// Les chapitres d'une vidéo, écrits dans sa description (« 0:00 Intro », « 3:17 - try et catch ») : au moins 3, dans l'ordre
function chaptersOf(desc) {
  const out = []
  for (const l of String(desc ?? '').split('\n')) {
    const m = l.match(/^\s*[[(]?((?:\d+:)?\d{1,2}:\d{2})[\])]?\s*[-–—:|•]?\s*(.{2,120})$/)
    const s = m && seconds(m[1])
    if (s !== null && s !== undefined && (!out.length || s > out.at(-1).s)) out.push({ s, titre: m[2].trim() })
  }
  return out.length >= 3 && out[0].s <= 15 ? out : []
}
// Une ressource propre : une adresse http(s) ; une vidéo YouTube réécrite en lien court, avec son moment
function clean(r) {
  let url
  try { url = new URL(String(r?.url ?? '').trim()) } catch { return null }
  if (!/^https?:$/.test(url.protocol)) return null
  const id = ytId(url.href), type = id ? 'video' : r.type === 'video' ? 'video' : 'site'
  const s = seconds(r.debut)
  return { type, id, url: id ? `https://www.youtube.com/watch?v=${id}` : url.href, titre: String(r.titre ?? '').slice(0, 160).trim() || url.hostname,
    auteur: String(r.auteur ?? '').slice(0, 80).trim(), langue: String(r.langue ?? '').slice(0, 5).toLowerCase(), pourquoi: String(r.pourquoi ?? '').slice(0, 400).trim(),
    debut: s, site: url.hostname.replace(/^www\./, '') }
}
const withTime = (url, s) => (s ? `${url}${url.includes('?') ? '&' : '?'}t=${s}s` : url)

module.exports = ctx => {
  const DIR = path.join(ctx.data, 'ressources')
  const fileOf = (course, chap) => path.join(DIR, `${crypto.createHash('sha1').update(`${course}\n${chap}`).digest('hex').slice(0, 20)}.json`)
  const busy = new Map() // un chapitre en recherche : une seule fois, même demandé deux fois

  function get(course, chap) { try { return JSON.parse(fs.readFileSync(fileOf(course, chap), 'utf8')) } catch { return null } }
  function clear(course, chap) { fs.rmSync(fileOf(course, chap), { force: true }); return true }

  // Le CLI claude, une question, une réponse JSON (--json-schema) ; le texte part par l'entrée standard
  function ask(model, tools, schema, prompt) {
    return new Promise((resolve, reject) => {
      if (!ctx.claude) return reject(new Error('Claude Code est introuvable sur ce PC.'))
      const env = { ...process.env }
      for (const k of ['ANTHROPIC_BASE_URL', 'CLAUDECODE', 'ELECTRON_RUN_AS_NODE']) delete env[k]
      const args = ['-p', '--model', model, '--setting-sources', '', '--output-format', 'json', '--json-schema', JSON.stringify(schema), '--tools', tools.join(',')]
      if (tools.length) args.push('--allowed-tools', tools.join(','))
      const p = spawn(ctx.claude, args, { env, windowsHide: true })
      let out = '', err = ''
      const timer = setTimeout(() => { p.kill(); reject(new Error('La recherche a pris trop de temps.')) }, TIMEOUT)
      p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { err += d })
      p.on('error', e => { clearTimeout(timer); reject(e) })
      p.on('close', () => {
        clearTimeout(timer)
        try {
          const j = JSON.parse(out)
          if (j.is_error) return reject(new Error(String(j.result || 'Claude a refusé la demande.').slice(0, 300)))
          resolve(j.structured_output ?? JSON.parse(j.result))
        } catch { reject(new Error((err || out || 'Réponse illisible.').trim().split('\n').pop().slice(0, 300))) }
      })
      p.stdin.on('error', () => {})
      p.stdin.end(prompt)
    })
  }
  const get$ = (url, ms = 15e3) => net.fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8', Cookie: 'SOCS=CAI; CONSENT=YES+1' }, signal: AbortSignal.timeout(ms) })
  // Une page qui répond (une adresse inventée ou morte part) ; une vidéo : son titre, sa chaîne et ses chapitres
  async function check(r) {
    try {
      if (r.id) {
        const oe = await get$(`https://www.youtube.com/oembed?url=${encodeURIComponent(r.url)}&format=json`)
        if (!oe.ok) return null
        const o = await oe.json()
        r.titre = o.title || r.titre; r.auteur = o.author_name || r.auteur
        r.image = `https://i.ytimg.com/vi/${r.id}/mqdefault.jpg`
        const html = await (await get$(`${r.url}&hl=fr`)).text()
        const m = html.match(/"shortDescription":"((?:\\.|[^"\\])*)"/)
        r.chapitres = m ? chaptersOf(JSON.parse(`"${m[1]}"`)) : []
        const len = +(html.match(/"lengthSeconds":"(\d+)"/)?.[1] ?? 0)
        if (len) r.duree = clock(len)
        return r
      }
      const res = await get$(r.url)
      return res.ok ? r : null
    } catch { return null }
  }

  async function find({ course, chap, matiere, coursTitre, titre, texte }) {
    const prompt = `Cours de master en informatique, matière « ${matiere} », cours « ${coursTitre} ». Chapitre : « ${titre} ».
Ce que dit le chapitre (extrait) :
${String(texte).slice(0, 2500)}

Trouve par recherche web 2 ou 3 vidéos YouTube et 2 ou 3 pages web (cours, documentation, tutoriel) qui expliquent EXACTEMENT ce chapitre, en français de préférence, sinon en anglais. Ouvre chaque page web pour vérifier qu'elle traite bien ce point ; une page qui en parle à peine ne compte pas. YouTube ne se laisse pas ouvrir : pour une vidéo, son titre et sa description dans les résultats de recherche suffisent (cherche par exemple « site:youtube.com » + le sujet) ; Hitodama vérifie ensuite qu'elle existe et lit ses chapitres pour trouver le bon moment. Donne bien des vidéos. Chaque ressource porte sur la même notion ET le même langage que le chapitre (pour un chapitre en C++, une vidéo sur Java ou Python ne compte pas). Ne donne jamais une adresse que tu n'as pas trouvée dans une recherche. Pour une vidéo, « debut » seulement si tu as lu le moment exact. « pourquoi » : une phrase courte pour l'étudiant, ce que la ressource apporte à ce chapitre (sans parler de ta recherche).`
    const raw = await ask('sonnet', ['WebSearch', 'WebFetch'], SCHEMA, prompt)
    const seen = new Set()
    const list = (raw?.ressources ?? []).map(clean).filter(r => r && !seen.has(r.url) && seen.add(r.url))
    const ok = (await Promise.all(list.map(check))).filter(Boolean)
    // le moment de chaque vidéo : choisi par Haiku dans ses chapitres, quand Sonnet ne l'a pas lu
    const todo = ok.filter(r => r.type === 'video' && r.debut === null && r.chapitres?.length)
    if (todo.length) {
      const q = `Chapitre d'un cours : « ${titre} ». Ce qu'il dit : ${String(texte).slice(0, 800)}\n\nPour chaque vidéo, donne le numéro du chapitre de la vidéo qui explique ce sujet (-1 si aucun ne convient) :\n`
        + todo.map(r => `Vidéo ${r.id} « ${r.titre} » :\n${r.chapitres.map((c, i) => `  ${i}. ${clock(c.s)} ${c.titre}`).join('\n')}`).join('\n\n')
      try {
        const pick = await ask('haiku', [], PICK, q)
        for (const c of pick?.choix ?? []) { const r = todo.find(x => x.id === c.video), ch = r?.chapitres[c.chapitre]; if (ch) { r.debut = ch.s; r.passage = ch.titre } }
      } catch (err) { console.error('Ressources (moment des vidéos) :', err.message) }
    }
    for (const r of ok) { if (r.debut) r.lien = withTime(r.url, r.debut); else r.lien = r.url; if (r.debut) r.debutTexte = clock(r.debut) }
    const out = { at: Date.now(), titre, ressources: ok, retirees: list.length - ok.length }
    fs.mkdirSync(DIR, { recursive: true })
    fs.writeFileSync(fileOf(course, chap), JSON.stringify(out))
    return out
  }
  function search(req) {
    const key = `${req.course}\n${req.chap}`
    if (!busy.has(key)) busy.set(key, find(req).finally(() => busy.delete(key)))
    return busy.get(key)
  }
  return { get, clear, search, searching: (course, chap) => busy.has(`${course}\n${chap}`) }
}
Object.assign(module.exports, { ytId, seconds, clock, chaptersOf, clean, withTime })

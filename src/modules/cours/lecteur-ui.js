// Le site d'un cours, côté page (lecteur.html), à la manière d'OpenClassrooms : le cours (rendu par engine/lecteur.py)
// est découpé en parties (##) et en chapitres (###), un chapitre par page. Chacun se termine par « J'ai terminé ce
// chapitre et je passe au suivant » : il se coche dans la table des matières et le suivant s'ouvre. Chaque partie finit
// par un quiz (les exercices du TP de la partie, sinon ses flash cards). En bas, de quoi réviser : la fiche, les flash
// cards, le TP (lecteur-plus.js). À droite, les diapos du prof liées au chapitre, ou Hito.
const L = window.lecteur
const $ = s => document.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)]
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const store = (k, v) => { try { v === undefined ? localStorage.removeItem(`lecteur.${k}`) : localStorage.setItem(`lecteur.${k}`, JSON.stringify(v)) } catch {} }
const read = (k, d) => { try { const v = localStorage.getItem(`lecteur.${k}`); return v === null ? d : JSON.parse(v) } catch { return d } }
const S = { shelf: [], cur: null, items: [], groups: [], at: -1, prog: null, tp: [], cards: [], vendor: null, vf: null, vp: 1 }
const main = $('#main'), chapEl = $('#chap')
const sansNum = t => String(t ?? '').replace(/^\s*\d+(\.\d+)*[.)]?\s+/, '')
const FIN = /vocabulaire|r[ée]cap|auto-test|^sources$|l['’]essentiel|pour aller plus loin/i
const norm = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’']/g, "'").trim()
const slug = t => norm(sansNum(t)).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x'
const inline = s => s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, '$1<i>$2</i>')
const ICON = { check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>', next: '<svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
  go: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>' }

// ---------- thème, table des matières, colonne de droite ----------
const setTheme = t => { document.documentElement.dataset.theme = t; store('theme', t) }
setTheme(read('theme', 'dark'))
$('#theme').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark')
const setToc = on => { $('#app').classList.toggle('notoc', !on); $('#tocOpen').hidden = on; store('toc', on) }
setToc(read('toc', true))
$('#tocClose').onclick = () => setToc(false)
$('#tocOpen').onclick = () => setToc(true)
// Le tiroir de droite (diapos du prof, ou Hito) : ouvert par la barre flottante, fermé par ✕ ; seulement dans un cours
function setSide(k) {
  S.side = k
  store('drawer', k)
  const on = !!k && !!S.cur
  $('#app').classList.toggle('drawer', on); $('#side').hidden = !on
  $$('.side-tabs [data-side]').forEach(b => b.classList.toggle('on', b.dataset.side === k))
  $$('#rail [data-rail]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.rail === k)))
  $('#sideSrc').hidden = k !== 'src'; $('#sideHito').hidden = k !== 'hito'
}
S.side = read('drawer', null)
$('.side-tabs').onclick = e => { const b = e.target.closest('[data-side]'); if (b) setSide(b.dataset.side) }
$('#sideClose').onclick = () => setSide(null)
$('#rail').onclick = e => {
  const b = e.target.closest('[data-rail]')
  if (!b || b.disabled) return
  if (b.dataset.rail === 'quiz') { const q = quizOf(S.items[S.at]); if (q) go(q.i); return }
  setSide(S.side === b.dataset.rail ? null : b.dataset.rail)
}
$('#logo').onclick = () => showHome()
$('#pdfBtn').onclick = () => S.cur && L.call('pdf', S.cur.path)
const findCourse = p => { for (const m of S.shelf) for (const c of m.cours) if (c.path === p) return { m, c }; return null }
// Le quiz de la partie du chapitre ouvert (pour « Exercice »)
const quizOf = it => it && it.part ? S.items.find(x => x.kind === 'quiz' && x.part === it.part && (!it.part.flat || x.num === it.num)) ?? null : null
// En haut : cours › partie › chapitre
const CHEV = '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>'
function setCrumbs(...parts) { $('#crumbs').innerHTML = parts.filter(Boolean).map(p => `<span>${esc(p)}</span>`).join(CHEV) }
const initials = m => { const w = String(m ?? '').split(/\s+/).filter(x => /^\p{L}/u.test(x) && x.length > 2 || /^[A-Z]{2,}$/.test(x)); return (w.length > 1 ? w.slice(0, 3).map(x => x[0]).join('') : (w[0] ?? m ?? '?').slice(0, 3)).toUpperCase() }

// ---------- Mes cours : tous les cours, par matière, avec où tu en es ----------
async function showHome() {
  S.cur = null; S.items = []; S.groups = []; S.at = -1
  closePane(true); chapEl.hidden = true; $('#empty').hidden = true
  setCrumbs('Mes cours'); $('#prog').hidden = true; $('#pdfBtn').hidden = true
  $('#foot').hidden = true; $('#rail').hidden = true; $('#tocCourse').hidden = true; $('#level').hidden = true; $('#tocLab').textContent = 'Mes cours'
  setSide(S.side)
  const progs = await L.call('progresses') ?? {}
  $('#tocList').innerHTML = S.shelf.map(m => `<div class="tp-part rev"><span class="pt"><small>${esc(m.nom)}</small></span></div>`
    + m.cours.map(c => `<button class="ti" data-open="${esc(c.path)}"><span class="t"><span class="ty">${esc(c.type)}</span>${esc(c.titre)}</span></button>`).join('')).join('')
  const pane = $('#pane')
  pane.hidden = false; pane.className = 'pane home'
  pane.innerHTML = `<div id="serieHero"></div><h1>Mes cours</h1><p class="meta">Un cours se lit chapitre par chapitre ; chaque partie finit par un quiz.</p>`
    + (S.shelf.map(m => `<div class="subj">${esc(m.nom)}</div>` + m.cours.map(c => {
      const pr = progs[c.path], pct = pr?.total ? Math.round((100 * pr.done) / pr.total) : 0
      return `<button class="crow" data-open="${esc(c.path)}"><span class="ty">${esc(c.type)}</span><span><b>${esc(c.titre)}</b><small>${c.due ? `${c.due} flash cards à revoir` : c.cartes ? 'flash cards à jour' : ''}</small></span>
        <span class="pg-c">${pr?.total ? `${pr.done} / ${pr.total} chapitres` : 'pas encore commencé'}<i data-pct="${pct}"></i></span>${ICON.go}</button>`
    }).join('')).join('') || '<p class="meta">Aucun cours écrit pour l’instant : crée-en un dans la fenêtre d’Incipit.</p>')
  for (const b of $$('[data-pct]', pane)) b.style.setProperty('--p', `${b.dataset.pct}%`)
  renderSide(null)
  if (typeof paintSerie === 'function') paintSerie() // la grande carte de la série (lecteur-serie.js)
}
main.addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b && !S.cur) openCourse(b.dataset.open) })
$('#tocList').addEventListener('click', e => {
  const b = e.target.closest('button')
  if (!b) return
  if (b.dataset.open) openCourse(b.dataset.open)
  else if (b.dataset.i) go(+b.dataset.i)
})

// ---------- Un cours : ses parties, ses chapitres, ses quiz, de quoi réviser ----------
async function openCourse(p, at) {
  const where = findCourse(p)
  closePane(true); chapEl.hidden = true
  $('#empty').hidden = false; $('#empty').textContent = 'Préparation du cours… (la première fois, quelques secondes)'
  const [d, prog, tp, cards] = await Promise.all([L.call('course', p), L.call('progress', { path: p }), L.mod('tp', p), L.mod('cards', p)])
  if (!d || d.error) { $('#empty').textContent = d?.error ?? 'Lecture impossible.'; return }
  S.cur = { ...d, matiere: where?.m.nom ?? d.meta.matiere ?? '', titre: d.meta.titre || where?.c.titre || '', type: where?.c.type ?? d.meta.type ?? '', info: where?.c ?? {} }
  S.prog = { done: [], quiz: {}, at: null, ...(prog ?? {}) }
  S.tp = Array.isArray(tp?.exercices) ? tp.exercices : []
  S.cards = Array.isArray(cards?.cards) ? cards.cards : []
  buildItems(d)
  { const t = [...String(d.html).matchAll(/class="language-([\w+#-]+)"/g)].map(m => m[1].toLowerCase()).filter(x => !/^(text|txt|none|plain|mermaid|markdown|md|json|cmake)$/.test(x)); S.lang = t.sort((a, b) => t.filter(x => x === b).length - t.filter(x => x === a).length)[0] ?? '' }
  setCrumbs(S.cur.titre)
  $('#pdfBtn').hidden = !S.cur.info.pdf; $('#prog').hidden = false; $('#empty').hidden = true
  $('#rail').hidden = false; $('#tocLab').textContent = 'Mon parcours'; setSide(S.side)
  const i = S.items.findIndex(x => x.id === (at ?? S.prog.at))
  go(i >= 0 ? i : 0)
}
// Le HTML du cours, coupé à ses titres : ## une partie, ### un chapitre ; sans ###, chaque ## est un chapitre
function buildItems(d) {
  const tpl = document.createElement('template')
  tpl.innerHTML = d.html
  const nodes = [...tpl.content.childNodes].filter(n => n.nodeType === 1 || n.textContent.trim())
  const heads = d.parts ?? [], deep = heads.some(h => h.niveau === 3 && !FIN.test(sansNum(h.titre)))
  const intro = [], parts = [], fin = []
  let h = 0, part = null, chap = null, inFin = false
  for (const n of nodes) {
    if (n.tagName === 'H1') continue
    if (n.tagName === 'H2' || n.tagName === 'H3') {
      const ref = heads[h++] ?? { titre: n.textContent, refs: [] }, titre = ref.titre, refs = ref.refs ?? []
      if (n.tagName === 'H2') {
        inFin = FIN.test(sansNum(titre))
        if (inFin) { chap = { kind: 'rev', title: sansNum(titre), raw: titre, nodes: [], refs: [] }; fin.push(chap); part = null; continue }
        if (deep) { part = { title: sansNum(titre), raw: titre, num: parts.length + 1, chaps: [], intro: [], refs }; parts.push(part); chap = null; continue }
        if (!parts.length) parts.push({ title: 'Le cours', raw: '', num: 1, chaps: [], intro: [], refs: [], flat: true })
        part = parts[0]; chap = { kind: 'chap', title: sansNum(titre), raw: titre, nodes: [], refs }; part.chaps.push(chap); continue
      }
      if (inFin || !part) { (chap ? chap.nodes : intro).push(n); continue } // un ### dans une partie de fin : il en fait partie
      chap = { kind: 'chap', title: sansNum(titre), raw: titre, nodes: part.chaps.length ? [] : [...part.intro], refs: refs.length ? refs : part.refs }
      part.chaps.push(chap); continue
    }
    ;(chap ? chap.nodes : part ? part.intro : intro).push(n)
  }
  for (const p of parts) if (!p.chaps.length) p.chaps.push({ kind: 'chap', title: p.title, raw: p.raw, nodes: p.intro, refs: p.refs })
  // Les exercices du TP et les flash cards, rangés par notion : le quiz de la partie (ou du chapitre, sans ###)
  const of = (list, t) => list.filter(x => { const a = norm(sansNum(x.notion)), b = norm(t); return a && b && (a === b || a.startsWith(b) || b.startsWith(a)) })
  const items = [], groups = []
  let gn = 0 // les chapitres sont numérotés de bout en bout, d'une partie à l'autre
  const add = (g, it) => { it.i = items.length; items.push(it); g.items.push(it.i) }
  const g0 = { small: 'Pour bien commencer', items: [] }
  groups.push(g0)
  add(g0, { kind: 'intro', id: 'intro', title: 'Tirez un maximum de ce cours', nodes: intro, refs: [] })
  const ess = fin.find(c => /essentiel/i.test(c.title))
  if (ess) add(g0, { ...ess, kind: 'chap', id: 'essentiel', title: 'L’essentiel en une page', group: g0 })
  for (const p of parts) {
    const g = { small: p.flat ? 'Le cours' : `Partie ${p.num}`, title: p.flat ? null : p.title, items: [] }
    groups.push(g)
    const quizOf = (title, base) => {
      const ex = of(S.tp, title), cs = ex.length ? [] : of(S.cards, title)
      if (ex.length || cs.length) add(g, { kind: 'quiz', pane: 'quiz', id: `q-${slug(title)}`, title: `Quiz : ${title}`, quiz: { ex, cards: cs }, part: p, num: base })
    }
    p.chaps.forEach((c, k) => { add(g, { ...c, id: `c-${slug(c.raw || c.title)}`, part: p, num: k + 1, gnum: ++gn }); if (p.flat) quizOf(c.title, k + 1) })
    if (!p.flat) quizOf(p.title)
  }
  const gR = { small: 'Pour réviser', title: 'Fiche, flash cards et TP', rev: true, items: [] }
  groups.push(gR)
  const info = S.cur.info, due = S.cards.filter(c => c.due).length
  add(gR, { kind: 'rev', pane: 'fiche', id: 'r-fiche', title: 'Fiche', tail: info.fiche || S.cur.meta?.format === '2' ? '' : 'à créer' })
  add(gR, { kind: 'rev', pane: 'cartes', id: 'r-cartes', title: 'Flash cards', tail: S.cards.length ? (due ? `${due} à revoir` : 'à jour') : 'à créer' })
  add(gR, { kind: 'rev', pane: 'tp', id: 'r-tp', title: 'TP noté', tail: S.tp.length ? `${S.tp.length} exercices` : 'à créer' })
  for (const c of fin) if (c !== ess && c.nodes.length) add(gR, { ...c, id: `r-${slug(c.title)}` })
  add(gR, { kind: 'rev', pane: 'stats', id: 'r-stats', title: 'Mes statistiques' }) // lecteur-stats.js
  add(gR, { kind: 'rev', pane: 'gerer', id: 'r-gerer', title: 'Sources et régénérer' })
  S.items = items; S.groups = groups
  S.prog.total = items.filter(counts).length
}
const counts = it => it && ['intro', 'chap', 'quiz'].includes(it.kind)
const isDone = it => !!it && S.prog?.done.includes(it.id)
const nextCount = i => { for (let j = i + 1; j < S.items.length; j++) if (counts(S.items[j])) return S.items[j]; return null }
const prevItem = i => S.items[i - 1] ?? null
let saveTimer = 0
function saveProg() { clearTimeout(saveTimer); const p = S.cur?.path, data = S.prog; saveTimer = setTimeout(() => p && L.call('progress', { path: p, data }), 300) }
function markDone(it, score) {
  if (!counts(it)) return
  // la série du jour (lecteur-serie.js) : un chapitre fini pour la première fois, un quiz fini (même refait)
  const fresh = !S.prog.done.includes(it.id)
  if (typeof serieEvent === 'function') { if (it.kind === 'quiz' && score !== undefined) serieEvent('quiz'); else if (it.kind === 'chap' && fresh) serieEvent('chap') }
  if (fresh) S.prog.done.push(it.id)
  if (score !== undefined) S.prog.quiz[it.id] = score
  saveProg(); renderToc(); renderProgress()
}

// ---------- Aller à un chapitre, un quiz ou un panneau de révision ----------
function go(i) {
  const it = S.items[i]
  if (!it) return
  S.at = i; S.prog.at = it.id; saveProg()
  renderToc(); renderProgress(); renderSide(it)
  setCrumbs(S.cur.titre, ...crumbOf(it))
  $('#railQuiz').disabled = !quizOf(it) || it.kind === 'quiz'
  if (it.pane) { chapEl.hidden = true; $('#foot').hidden = true; showPane(it.pane, it) } else renderChapter(it)
  main.scrollTop = 0
}
const kickOf = it => it.kind === 'intro' || it.id === 'essentiel' ? 'Pour bien commencer' : it.kind === 'rev' ? 'Pour réviser'
  : it.part?.flat ? `${it.kind === 'quiz' ? 'Quiz du chapitre' : 'Chapitre'} ${it.num}` : `Partie ${it.part?.num} · ${it.kind === 'quiz' ? 'Quiz' : `Chapitre ${it.gnum}`}`
// Le fil d'Ariane (après le titre du cours) : partie, chapitre
const crumbOf = it => it.kind === 'intro' || it.id === 'essentiel' ? ['Pour bien commencer'] : it.kind === 'rev' ? ['Pour réviser', it.title]
  : it.part?.flat ? [it.kind === 'quiz' ? `Quiz du chapitre ${it.num}` : `Chapitre ${it.num}`] : [`Partie ${it.part?.num}`, it.kind === 'quiz' ? 'Quiz' : `Chapitre ${it.gnum}`]
function renderChapter(it) {
  closePane(true)
  const done = isDone(it)
  chapEl.hidden = false
  chapEl.innerHTML = `<div class="kick">${esc(kickOf(it))}</div><h1>${esc(it.title)}</h1>
    <div class="chap-acts">${done ? `<span class="done-tag">${ICON.check}Chapitre terminé</span>` : ''}${it.raw ? '<button data-act="rewrite">Réécrire ce chapitre</button>' : ''}</div>
    <form class="rw" id="rw" hidden><b>Ce que tu veux changer (facultatif)</b><textarea id="rwIn" maxlength="1500" rows="3" placeholder="Plus simple, plus d’exemples, un schéma, moins long…"></textarea>
      <span class="rw-acts"><button type="button" class="icon" data-act="rwNo">Annuler</button><button class="cta">Réécrire ce chapitre</button></span></form>
    ${it.kind === 'intro' ? welcome() : ''}<div class="body" id="body"></div>`
  const body = $('#body')
  body.append(...it.nodes.map(n => n.cloneNode(true)))
  drawSchemas(body, S.cur.schemas ?? {})
  codeBlocks(body)
  vocabDecorate(body) // lecteur-vocab.js : le vocabulaire en vert
  enrich(body)
  paintFoot(it)
}
function welcome() {
  const ch = S.items.filter(x => x.kind === 'chap' && x.id !== 'essentiel').length, qz = S.items.filter(x => x.kind === 'quiz').length
  const parts = S.groups.filter(g => g.title && !g.rev).length, slides = Object.values(S.cur.files ?? {}).reduce((n, f) => n + (f.unite === 'diapo' ? f.pages.length : 0), 0)
  const fact = (n, w) => n ? `<span><b>${n}</b><small>${w}</small></span>` : ''
  return `${typeof progressHtml === 'function' ? progressHtml() : ''}<section class="welcome"><h2>Bienvenue dans ce cours</h2>
    <div class="facts">${fact(parts, parts > 1 ? 'parties' : 'partie')}${fact(ch, ch > 1 ? 'chapitres' : 'chapitre')}${fact(qz, 'quiz')}${fact(slides, 'diapos du prof')}${fact(S.cards.length, 'flash cards')}</div>
    <ol><li>Lis un chapitre, puis clique « Chapitre suivant » en bas : il se coche dans le parcours et le suivant s’ouvre.</li>
      <li>${qz ? 'Chaque partie se termine par un quiz corrigé : il valide la partie.' : 'Crée le TP noté (en bas du parcours) : chaque partie aura son quiz.'}</li>
      <li>À droite, la barre flottante ouvre les sources du chapitre (diapos du prof, tes notes, tes liens, des vidéos et des sites pour aller plus loin) ou le tuteur : surligne un passage pour lui poser une question.</li>
      <li>Pour réviser : la fiche, les flash cards et le TP, en bas du parcours.</li></ol></section>`
}
chapEl.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'), it = S.items[S.at]
  const cp = e.target.closest('.copy')
  if (cp) {
    const txt = $$('.l', cp.closest('.code')).map(l => l.textContent).join('\n')
    navigator.clipboard?.writeText(txt).then(() => { const o = cp.lastChild.textContent; cp.lastChild.textContent = 'Copié'; setTimeout(() => { cp.lastChild.textContent = o }, 1400) }, () => {})
    return
  }
  if (b?.dataset.act === 'rewrite') { $('#rw').hidden = false; return $('#rwIn').focus() }
  if (b?.dataset.act === 'rwNo') { $('#rw').hidden = true; return }
  const s = e.target.closest('[data-sch]'), fig = e.target.closest('.sch-fig')
  if (s && fig) { const st = SCH.get(fig); st.step = Math.max(0, Math.min(st.n - 1, st.step + Number(s.dataset.sch))); paintSchema(fig) }
  else if (e.target.closest('.sch-draw') && fig) zoomSchema(fig)
})
chapEl.addEventListener('submit', e => {
  e.preventDefault()
  const it = S.items[S.at]
  $('#rw').hidden = true
  rewrite(it.raw, $('#rwIn').value.trim()) // lecteur-plus.js
})
ICON.play = '<svg viewBox="0 0 24 24"><path d="m7 4 13 8-13 8z"/></svg>'
function renderToc() {
  $('#tocList').innerHTML = S.groups.map(g => {
    const cs = g.items.filter(i => counts(S.items[i])), d = cs.filter(i => isDone(S.items[i])).length
    const state = cs.length && d === cs.length ? `<span class="ok">${ICON.check}</span>` : g.title && !g.rev && cs.length ? `<em>${d}/${cs.length}</em>` : ''
    const head = `<div class="tp-part${g.rev || !g.title ? ' rev' : ''}"><span class="pt"><small>${esc(g.small)}</small>${g.title && !g.rev ? `<b>${esc(g.title)}</b>` : ''}</span>${state}</div>`
    return head + g.items.map(i => {
      const it = S.items[i], done = isDone(it), on = i === S.at
      const mark = done ? ICON.check : on ? ICON.play : ''
      const label = it.kind === 'chap' && it.gnum ? `${it.gnum}. ${esc(it.title)}` : esc(it.title)
      return `<button class="ti" data-i="${i}" data-kind="${it.kind}" data-on="${on}" data-done="${done}"><span class="t">${label}${it.tail ? `<span class="tail">${esc(it.tail)}</span>` : ''}</span><i class="c">${mark}</i></button>`
    }).join('')
  }).join('')
  $('.ti[data-on=true]')?.scrollIntoView({ block: 'nearest' })
}
function renderProgress() {
  const all = S.items.filter(counts), n = all.filter(isDone).length, pct = all.length ? Math.round((100 * n) / all.length) : 0
  $('#progBar').style.setProperty('--p', `${pct}%`)
  $('#progT').textContent = `${pct} %`
  $('#prog').title = `${n} sur ${all.length} chapitres et quiz terminés`
  // la carte du cours, en haut du parcours
  const card = $('#tocCourse')
  card.hidden = false
  card.innerHTML = `<span class="badge">${esc(initials(S.cur.matiere))}</span><b>${esc(S.cur.titre)}</b><small>${n} / ${all.length} chapitres</small><span class="bar"><i style="--p:${pct}%"></i></span>`
  // ton niveau : la moyenne de tes quiz (rien d'inventé : sans quiz fait, le cours ne sait pas encore)
  const sc = Object.values(S.prog?.quiz ?? {}).filter(v => typeof v === 'number'), avg = sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null
  const lv = $('#level')
  lv.hidden = false
  lv.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg><small>Ton niveau</small><b>${avg === null ? 'Pas encore évalué' : avg < 0.5 ? 'Débutant' : avg < 0.8 ? 'Intermédiaire' : 'Avancé'}</b><span class="bar"><i style="--p:${Math.round((avg ?? 0) * 100)}%"></i></span>`
  lv.title = avg === null ? 'Fais un quiz pour connaître ton niveau' : `Moyenne de tes quiz : ${Math.round(avg * 100)} %`
}

// ---------- En bas : chapitre précédent / suivant (le suivant coche le chapitre) ----------
function paintFoot(it) {
  const f = $('#foot')
  f.hidden = !counts(it)
  if (f.hidden) return
  const next = nextCount(it.i), prev = prevItem(it.i)
  $('#footPrev').disabled = !prev
  $('#footPrev span').textContent = prev?.kind === 'quiz' ? 'Quiz précédent' : 'Chapitre précédent'
  $('#footNext span').textContent = next ? (next.kind === 'quiz' ? 'Passer au quiz' : 'Chapitre suivant') : 'Terminer le cours'
}
$('#footPrev').onclick = () => { const it = S.items[S.at]; if (it && it.i > 0) go(it.i - 1) }
$('#footNext').onclick = () => {
  const it = S.items[S.at]
  if (!it) return
  markDone(it)
  const next = nextCount(it.i)
  next ? go(next.i) : showPane('fin', it)
}

// ---------- À droite : les sources du chapitre (diapos, tes notes, tes liens, pour aller plus loin) : lecteur-sources.js ----------

// ---------- Formules (KaTeX) et schémas Mermaid d'avant : gardés sur ce PC par le module (vendor.js) ----------
const loaded = new Map()
// Mermaid et KaTeX se posent dans window, sauf si un chargeur AMD (celui de Monaco, lecteur-ide.js) est là : ils s'y
// enregistrent alors comme module anonyme et plantent. Le temps de leur chargement, le chargeur se cache.
const script = src => loaded.get(src) ?? loaded.set(src, new Promise((res, rej) => {
  const s = document.createElement('script'), amd = window.define?.amd
  if (amd) window.define.amd = undefined
  const back = () => { if (amd && window.define) window.define.amd = amd }
  s.src = src; s.onload = () => { back(); res() }; s.onerror = () => { back(); rej() }
  document.head.append(s)
})).get(src)
async function enrich(body) {
  if (!S.vendor) return
  try {
    if (/\$/.test(body.textContent)) {
      if (!$('#katexCss')) document.head.insertAdjacentHTML('beforeend', `<link id="katexCss" rel="stylesheet" href="${S.vendor}/katex/katex.min.css">`)
      await script(`${S.vendor}/katex/katex.min.js`); await script(`${S.vendor}/katex/contrib/auto-render.min.js`)
      window.renderMathInElement?.(body, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false })
    }
    const graphs = $$('pre.mermaid', body)
    if (graphs.length) {
      await script(`${S.vendor}/mermaid.min.js`)
      // les anciens schémas aux couleurs des nouveaux (ajouts1.png) : boîtes indigo, traits bleutés
      const dark = document.documentElement.dataset.theme === 'dark'
      window.mermaid.initialize({ startOnLoad: false, theme: 'base', fontFamily: '"Geist Variable", "Segoe UI", sans-serif', themeVariables: dark
        ? { background: '#161722', primaryColor: '#23204f', primaryTextColor: '#f0eeff', primaryBorderColor: '#6a5cf0', lineColor: '#8ea0ff', textColor: '#cfcbef', secondaryColor: '#1a1930', tertiaryColor: '#1a1930', clusterBkg: '#1a1930', clusterBorder: '#2e2b55', edgeLabelBackground: '#161722', titleColor: '#f0eeff' }
        : { background: '#ffffff', primaryColor: '#eeebff', primaryTextColor: '#1e1b2e', primaryBorderColor: '#7b6cf0', lineColor: '#5468dc', textColor: '#3d3a55', secondaryColor: '#f3f1fc', tertiaryColor: '#f3f1fc', clusterBkg: '#f3f1fc', clusterBorder: '#dcd8f2', edgeLabelBackground: '#ffffff', titleColor: '#1e1b2e' } })
      const ok = []
      for (const g of graphs) {
        // réparé d'abord (mermaid-fix.js : libellés entre guillemets, sans les couleurs pastel du cours) ; si Mermaid le refuse
        // quand même, le texte d'origine ; illisible : il reste du texte
        const raw = g.textContent, fixed = window.MermaidFix.fix(raw)
        if (await window.mermaid.parse(fixed, { suppressErrors: true })) { g.textContent = fixed; ok.push(g) }
        else if (await window.mermaid.parse(raw, { suppressErrors: true })) ok.push(g)
        else g.classList.replace('mermaid', 'graph-ko')
      }
      if (ok.length) await window.mermaid.run({ nodes: ok, suppressErrors: true })
    }
  } catch (err) { console.error('Lecteur (formules, schémas) :', err?.message ?? err) }
}

// ---------- Les schémas (schemas/) : redessinés depuis leur description gardée dans le cours, pas à pas ----------
const SCH = new WeakMap()
function drawSchemas(body, specs) {
  if (!window.Schemas) return
  for (const img of $$('img', body)) {
    const m = decodeURIComponent(img.getAttribute('src') ?? '').match(/\/schemas\/(s-\w+)\.svg$/), spec = m && specs[m[1]]
    if (!spec) continue
    try {
      const first = window.Schemas.render(spec, { theme: 'css', step: 0 }), fig = document.createElement('figure')
      fig.className = 'sch-fig'
      SCH.set(fig, { spec, step: 0, n: first.steps, caps: first.captions })
      ;(img.closest('figure') ?? img).replaceWith(fig)
      paintSchema(fig)
    } catch (err) { console.error('Schéma :', err) }
  }
}
function paintSchema(fig) {
  const st = SCH.get(fig), r = window.Schemas.render(st.spec, { theme: 'css', step: st.n > 1 ? st.step : null })
  fig.innerHTML = `<div class="sch-draw" title="Agrandir">${r.svg}</div>`
    + (st.n > 1 ? `<figcaption class="sch-steps"><button data-sch="-1" ${st.step ? '' : 'disabled'} aria-label="Étape précédente">‹</button><span class="mono">Étape ${st.step + 1} / ${st.n}</span><button data-sch="1" ${st.step < st.n - 1 ? '' : 'disabled'} aria-label="Étape suivante">›</button><span class="sch-cap">${esc(st.caps[st.step] ?? '')}</span></figcaption>` : '')
}
function zoomSchema(fig) {
  const svg = fig.querySelector('svg'), z = $('#schZoom')
  if (!svg) return
  z.innerHTML = svg.outerHTML
  z.firstElementChild.style.width = `${Math.min((+svg.getAttribute('width') || 600) * 2, innerWidth - 112)}px`
  z.hidden = false
}
$('#schZoom').onclick = () => { $('#schZoom').hidden = true }

// ---------- La visionneuse : tout le cours du prof ----------
function viewer(f, p) {
  const F = S.cur?.files?.[f]
  if (!F) return
  const fileChanged = S.vf !== f || $('#viewer').hidden
  S.vf = f; S.vp = Math.max(1, Math.min(F.pages.length, p))
  $('#viewer').hidden = false
  $('#vwFiles').innerHTML = Object.entries(S.cur.files).map(([k, x]) => `<button data-f="${esc(k)}" class="${k === f ? 'on' : ''}">${esc(x.nom)}</button>`).join('')
  const cited = new Set(S.items.flatMap(it => (it.refs ?? []).filter(r => r.f === f).map(r => r.p)))
  if (fileChanged) $('#vwGrid').innerHTML = F.pages.map((pg, i) => `<button data-p="${i + 1}" class="${cited.has(i + 1) ? 'lie' : ''}"><img loading="lazy" src="${pg.url}" alt=""><b>${i + 1}</b></button>`).join('')
  $$('#vwGrid button').forEach(b => b.classList.toggle('cur', +b.dataset.p === S.vp))
  $('#vwGrid button.cur')?.scrollIntoView({ block: 'nearest' })
  $('#vwImg').src = F.pages[S.vp - 1].url
  $('#vwPos').textContent = `${F.unite[0].toUpperCase()}${F.unite.slice(1)} ${S.vp} / ${F.pages.length}`
  $('#vwPrev').disabled = S.vp <= 1; $('#vwNext').disabled = S.vp >= F.pages.length
  const used = S.items.filter(it => (it.refs ?? []).some(r => r.f === f && r.p === S.vp))
  $('#vwUsed').innerHTML = used.length ? used.map(it => `<button data-go="${it.i}">${esc(it.title)}</button>`).join('') : '<span>Pas liée à un chapitre.</span>'
}
const closeViewer = () => { $('#viewer').hidden = true }
$('#vwClose').onclick = closeViewer
$('#vwPrev').onclick = () => viewer(S.vf, S.vp - 1)
$('#vwNext').onclick = () => viewer(S.vf, S.vp + 1)
$('#vwFiles').onclick = e => { const b = e.target.closest('[data-f]'); if (b) viewer(b.dataset.f, 1) }
$('#vwGrid').onclick = e => { const b = e.target.closest('[data-p]'); if (b) viewer(S.vf, +b.dataset.p) }
$('#vwUsed').onclick = e => { const b = e.target.closest('[data-go]'); if (b) { closeViewer(); go(+b.dataset.go) } }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#schZoom').hidden) { $('#schZoom').hidden = true; return }
  if ($('#viewer').hidden) return
  if (e.key === 'Escape') closeViewer()
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); viewer(S.vf, S.vp + 1) }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); viewer(S.vf, S.vp - 1) }
})

// ---------- Hito, sur le chapitre ouvert ----------
function md(src) {
  let html = '', list = false
  for (const l of esc(src).split('\n')) {
    const li = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)/)
    if (li) { if (!list) { html += '<ul>'; list = true } html += `<li>${inline(li[1])}</li>`; continue }
    if (list) { html += '</ul>'; list = false }
    if (l.trim()) html += `<p>${inline(l.replace(/^#+\s*/, ''))}</p>`
  }
  return html + (list ? '</ul>' : '')
}
const msgs = $('#hMsgs')
const toBottom = () => { msgs.scrollTop = msgs.scrollHeight }
let waiting = null
const mineIds = new Map()
function ask(q, quote = '') {
  const it = S.items[S.at]
  if (!S.cur || !it || waiting) return
  setSide('hito')
  const text = ($('#body') ?? $('#pane'))?.innerText ?? ''
  const ctx = { module: { name: 'Cours', text: `Site du cours : ${S.cur.matiere} · ${S.cur.type} ${S.cur.titre}\nPage ouverte : ${it.title}\n${quote ? 'Passage surligné par l’étudiant' : 'Texte de la page'} :\n${quote || text}`.slice(0, 3000) } }
  $('.h-hint', msgs)?.remove()
  msgs.insertAdjacentHTML('beforeend', `<div class="m me">${quote ? `<q>« ${esc(quote.slice(0, 140))}${quote.length > 140 ? '…' : ''} »</q>` : ''}${esc(q)}</div>`)
  toBottom()
  waiting = q
  L.ask(q, ctx).then(ok => { if (!ok) { waiting = null; msgs.insertAdjacentHTML('beforeend', '<div class="m hi err">Demande refusée (trop longue ?).</div>') } })
}
L.onHito(d => {
  if (d.type === 'start' && waiting && d.text === waiting) {
    waiting = null
    msgs.insertAdjacentHTML('beforeend', '<div class="m hi"><span class="st">Le tuteur réfléchit…</span></div>')
    mineIds.set(d.id, { el: msgs.lastElementChild, text: '' })
    return toBottom()
  }
  const m = mineIds.get(d.id)
  if (!m) return
  if (d.type === 'status') { if (!m.text) m.el.innerHTML = `<span class="st">${esc(d.text)}</span>` }
  else if (d.type === 'delta') { m.text += d.text ?? ''; m.el.innerHTML = md(m.text) }
  else if (d.type === 'done') {
    mineIds.delete(d.id)
    if (d.cancelled) m.el.innerHTML = '<span class="st">Arrêté.</span>'
    else if (d.error) { m.el.classList.add('err'); m.el.textContent = d.error }
    else m.el.innerHTML = md(d.text || m.text)
  } else return
  toBottom()
})
$('#hActs').onclick = e => { const b = e.target.closest('[data-q]'); if (b) ask(b.dataset.q) }
const box = $('#hBox')
box.addEventListener('input', () => { box.style.height = 'auto'; box.style.height = `${box.scrollHeight}px` })
box.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.shiftKey) return
  e.preventDefault()
  const q = box.value.trim()
  if (q && !waiting) { ask(q.slice(0, 1500)); box.value = ''; box.style.height = 'auto' }
})
// surligner un passage : « Demander au tuteur »
const pop = $('#selpop')
let selText = ''
document.addEventListener('mouseup', e => {
  if (e.target.closest('#selpop')) return
  const sel = getSelection(), t = sel?.toString().trim() ?? ''
  if (t.length < 3 || !sel.anchorNode || !main.contains(sel.anchorNode)) { pop.hidden = true; return }
  const r = sel.getRangeAt(0).getBoundingClientRect()
  selText = t.slice(0, 1500)
  Object.assign(pop.style, { left: `${r.left + r.width / 2}px`, top: `${r.top - 8}px` })
  pop.hidden = false
})
$('#selAsk').onclick = () => { pop.hidden = true; ask('Explique-moi ce passage.', selText); getSelection()?.removeAllRanges() }
main.addEventListener('scroll', () => { pop.hidden = true }, { passive: true })

// ---------- départ : une fois lecteur-plus.js chargé aussi (il fait les quiz, la fiche, les cartes…) ----------
L.onOpen(p => openCourse(p))
addEventListener('DOMContentLoaded', async () => {
  const st = await L.call('start')
  S.shelf = st?.shelf ?? []; S.vendor = st?.vendor ?? null
  const p = st?.course
  if (p && findCourse(p)) openCourse(p); else showHome()
})

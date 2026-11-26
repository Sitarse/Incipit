// À droite, après le tuteur, « Questions » : ce que tu as demandé au tuteur sur un passage du cours, et sa réponse, gardés comme
// les commentaires d'un Google Doc. Le passage reste surligné (discrètement) dans le chapitre : un clic dessus ouvre son
// commentaire ; un clic sur le commentaire ramène au passage. Gardé par cours (lecteur.js : lecteur-questions.json).
// Le passage est retrouvé par son texte, sans les espaces (la sélection et la page ne les comptent pas pareil) ; s'il
// revient plusieurs fois dans le chapitre, c'est celui le plus près de l'endroit surligné à l'époque.
// Utilise ce que lecteur-ui.js définit : $, $$, esc, md, S, L, go, setSide, chapEl, main.
const QS = { path: null, list: [], ready: Promise.resolve(), on: null, scroll: false, painted: null }
const QS_ASK = 'Explique-moi ce passage.' // la question du bouton « Demander au tuteur » : pas la peine de la répéter
const QS_SKIP = 'svg, button, .katex-mathml, .ide-box, .code-h' // dessins, boutons, éditeurs : pas du texte du cours
const qsSqueeze = t => String(t ?? '').replace(/\s+/g, '')

// Les questions du cours ouvert, lues une fois
function qsLoad() {
  const p = S.cur?.path ?? null
  if (p !== QS.path) {
    QS.path = p; QS.list = []
    QS.ready = p ? L.call('questions', { path: p }).then(l => { if (QS.path === p) QS.list = Array.isArray(l) ? l : [] }) : Promise.resolve()
  }
  return QS.ready
}
// Le texte visible d'une page (celui qu'une sélection copie) sans ses espaces, et pour chaque lettre où elle est : [nœud, position]
const qsOk = n => { const p = n.parentElement; return !!p && !p.closest(QS_SKIP) && p.checkVisibility() }
function qsMap(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (qsOk(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) })
  let s = ''
  const at = []
  for (let n; (n = w.nextNode());) for (let i = 0; i < n.data.length; i++) if (!/\s/.test(n.data[i])) { s += n.data[i]; at.push([n, i]) }
  return { s, at }
}
// Toutes les places du passage dans le texte
function qsFind(s, quote) {
  const q = qsSqueeze(quote), out = []
  if (q) for (let i = s.indexOf(q); i >= 0; i = s.indexOf(q, i + 1)) out.push(i)
  return out
}

// Une question sur un passage (lecteur-ui.js, « Demander au tuteur ») : où est le passage surligné, dans quel chapitre
function qsDraft(quote, range, it) {
  let pos = -1
  const body = $('#body')
  if (body && range) {
    const { s, at } = qsMap(body)
    try { pos = qsFind(s, quote).find(i => range.comparePoint(at[i][0], at[i][1]) === 0) ?? -1 } catch {}
  }
  return { path: S.cur.path, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), chap: it.id, titre: it.title, quote, q: QS_ASK, pos, at: Date.now() }
}
// Le tuteur a répondu : la question est gardée, le passage surligné tout de suite
async function qsSave(n, a) {
  if (!n || !a?.trim()) return
  const { path, ...note } = n
  if (path !== QS.path) { const l = await L.call('questions', { path }); return L.call('questions', { path, data: [...(Array.isArray(l) ? l : []), { ...note, a }] }) }
  await QS.ready
  QS.list.push({ ...note, a })
  L.call('questions', { path, data: QS.list })
  const it = S.items[S.at], body = $('#body')
  if (it?.id === note.chap && body) qsMark(body, note)
  qsSide(it)
}

// ---------- dans le chapitre : les passages surlignés ----------
// Appelé quand le chapitre est rendu, formules comprises (leur rendu change le texte de la page)
async function qsPaint(body, it) {
  await qsLoad()
  if (!body.isConnected || S.items[S.at] !== it) return
  for (const n of QS.list) if (n.chap === it.id) qsMark(body, n)
  QS.painted = body
  qsSide(it)
  if (QS.scroll) { QS.scroll = false; qsFocus(QS.on) }
}
// Une marque par morceau de texte : le passage peut couvrir du gras, un lien, plusieurs paragraphes. Tout le texte
// entre ses deux bouts, espaces compris (sinon des trous entre les morceaux), sauf les blancs entre deux blocs
const QS_INLINE = 'p, td, th, h1, h2, h3, h4, h5, h6, b, strong, i, em, a, code, span, mark, sub, sup'
function qsMark(body, n) {
  const { s, at } = qsMap(body), all = qsFind(s, n.quote), len = qsSqueeze(n.quote).length
  if (!all.length) return
  const i = all.reduce((b, x) => (Math.abs(x - n.pos) < Math.abs(b - n.pos) ? x : b))
  const [n0, o0] = at[i], [n1, o1] = at[i + len - 1], r = document.createRange(), nodes = []
  r.setStart(n0, o0); r.setEnd(n1, o1 + 1)
  const w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
  for (let t; (t = w.nextNode());) if (r.intersectsNode(t) && qsOk(t) && (t.data.trim() || t.parentElement.matches(QS_INLINE))) nodes.push(t)
  for (const t of nodes) {
    const x = document.createRange(), m = document.createElement('mark')
    x.setStart(t, t === n0 ? o0 : 0); x.setEnd(t, t === n1 ? o1 + 1 : t.length)
    if (x.collapsed) continue
    m.className = `qs-hl${n.id === QS.on ? ' on' : ''}`; m.dataset.qs = n.id
    x.surroundContents(m)
  }
}
const qsMarks = id => $$(`mark.qs-hl[data-qs="${CSS.escape(id)}"]`, chapEl)
chapEl.addEventListener('click', e => {
  const m = e.target.closest('mark.qs-hl')
  if (!m || e.target.closest('a, button') || getSelection()?.toString()) return
  setSide('qs'); qsFocus(m.dataset.qs, false)
})

// ---------- à droite : les commentaires ----------
const qsDate = t => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
function qsSide(it) {
  const box = $('#sideQs'), btn = $('#railQs')
  if (S.cur && QS.path !== S.cur.path) qsLoad().then(() => { if (S.items[S.at] === it) qsSide(it) })
  const mine = QS.path === S.cur?.path ? QS.list : []
  const here = mine.filter(n => n.chap === it?.id), others = mine.filter(n => n.chap !== it?.id)
  if (here.length) btn.dataset.n = here.length; else delete btn.dataset.n
  // « passage plus dans le chapitre » : seulement une fois les surlignages posés (un chapitre réécrit depuis)
  const painted = !it?.pane && !!$('#body') && QS.painted === $('#body')
  const card = n => `<article class="qs-card${n.id === QS.on ? ' on' : ''}" data-qs="${esc(n.id)}"><q>${esc(n.quote.slice(0, 300))}</q>
    ${n.q && n.q !== QS_ASK ? `<p class="qs-ask">${esc(n.q)}</p>` : ''}<div class="qs-a">${md(n.a)}</div>
    <footer><span>Tuteur · ${qsDate(n.at)}</span>${painted && !qsMarks(n.id).length ? '<em>passage plus dans le chapitre</em>' : ''}<button data-del title="Retirer ce commentaire">Retirer</button></footer></article>`
  let h = here.length ? here.map(card).join('')
    : '<p class="none">Surligne un passage du cours puis « Demander au tuteur » : sa réponse restera ici, et le passage restera surligné.</p>'
  if (others.length) {
    h += `<div class="lab">Dans les autres chapitres · ${others.length}</div>`
    h += others.map(n => { const i = S.items.findIndex(x => x.id === n.chap); return i < 0 ? card(n) : `<button class="qs-row" data-qs="${esc(n.id)}" data-i="${i}"><small>${esc(S.items[i].title)}</small><span>${esc(n.quote)}</span></button>` }).join('')
  }
  box.innerHTML = h
}
// Un commentaire choisi : il s'ouvre en entier, son passage s'allume et vient sous les yeux
function qsFocus(id, toMark = true) {
  QS.on = id
  for (const c of $$('#sideQs .qs-card')) c.classList.toggle('on', c.dataset.qs === id)
  for (const m of $$('mark.qs-hl', chapEl)) m.classList.toggle('on', m.dataset.qs === id)
  if (toMark) qsMarks(id)[0]?.scrollIntoView({ block: 'center' })
  $(`#sideQs .qs-card[data-qs="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' })
}
$('#sideQs').onclick = e => {
  const c = e.target.closest('[data-qs]')
  if (!c) return
  const id = c.dataset.qs
  if (e.target.closest('[data-del]')) {
    QS.list = QS.list.filter(n => n.id !== id)
    L.call('questions', { path: QS.path, data: QS.list })
    for (const m of qsMarks(id)) { const p = m.parentNode; m.replaceWith(...m.childNodes); p.normalize() }
    if (QS.on === id) QS.on = null
    return qsSide(S.items[S.at])
  }
  if (c.dataset.i) { QS.on = id; QS.scroll = true; return go(+c.dataset.i) }
  if (!getSelection()?.toString()) qsFocus(id)
}

// Le vocabulaire d'un cours, en vert. Un mot du vocabulaire, dans le texte, est un lien vers sa ligne du tableau
// « Vocabulaire à retenir » (engine/md2pdf.py : #voc-<mot>) ; dans le tableau, le mot renvoie au chapitre qui l'introduit
// (#<titre du chapitre>). Ici :
// - le mot est vert dans le texte, et sa définition s'affiche au survol (une bulle) ;
// - un clic mène à sa ligne du tableau, surlignée, avec « Revenir au cours » qui rend à l'endroit du mot ;
// - dans le tableau, un clic sur le mot mène au chapitre où il est expliqué.
// Utilise ce que lecteur-ui.js définit : $, $$, esc, S, go, chapEl, main.
const VOC = { key: null, terms: new Map(), anchors: new Map(), from: null }
// La même ancre que engine/md2pdf.py (_slug_heading) : un titre, sans accents, sans ponctuation, en minuscules
const slugH = t => String(t ?? '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/[\s_]+/g, '-') || 'section'
const vocabItem = () => S.items.find(it => it.kind === 'rev' && /vocabulaire/i.test(it.title))

// Les mots du tableau (id, mot, définition, « où ça sert ») et les ancres des chapitres, une fois par cours
function vocabIndex() {
  const key = `${S.cur?.path}|${S.items.length}`
  if (VOC.key === key) return
  VOC.key = key; VOC.terms.clear(); VOC.anchors.clear()
  const vi = vocabItem()
  for (const n of vi?.nodes ?? []) for (const td of n.querySelectorAll ? n.querySelectorAll('td[id^="voc-"]') : []) {
    const cells = [...td.parentElement.children], def = cells[1]?.cloneNode(true)
    def?.querySelectorAll('.retour').forEach(a => a.remove())
    VOC.terms.set(td.id, { term: td.textContent.replace('↩', '').trim(), def: def?.innerHTML ?? '', where: cells[2]?.textContent.trim() ?? '' })
  }
  for (const it of S.items) {
    if (it.kind !== 'chap' || !it.raw) continue
    if (!VOC.anchors.has(slugH(it.raw))) VOC.anchors.set(slugH(it.raw), it.i)
    const p = it.part
    if (p?.raw && !VOC.anchors.has(slugH(p.raw))) VOC.anchors.set(slugH(p.raw), it.i) // un titre de partie : son 1er chapitre
  }
}

// Appelé par renderChapter (lecteur-ui.js) sur le texte d'une page : les mots en vert, les liens du tableau actifs
function vocabDecorate(body) {
  hideTip() // une page qui change : le mot survolé n'existe plus, sa bulle ne se ferme pas toute seule
  vocabIndex()
  for (const a of $$('a.lien-interne', body)) {
    const id = (a.getAttribute('href') ?? '').slice(1)
    if (VOC.terms.has(id)) { a.classList.add('voc'); a.dataset.voc = id } else if (VOC.anchors.has(id)) a.dataset.go = String(VOC.anchors.get(id))
  }
  for (const td of $$('td[id^="voc-"]', body)) td.closest('table')?.classList.add('voc-table')
}

// ---------- La bulle de définition, au survol d'un mot ----------
let tip = null
function showTip(a) {
  const t = VOC.terms.get(a.dataset.voc)
  if (!t) return
  tip ??= document.body.appendChild(Object.assign(document.createElement('div'), { className: 'voc-tip', hidden: true }))
  tip.innerHTML = `<b>${esc(t.term)}</b><div class="vt-def">${t.def}</div>${t.where ? `<small>Sert pour : ${esc(t.where)}</small>` : ''}<em>Clique pour voir sa ligne du vocabulaire</em>`
  tip.hidden = false
  const r = a.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight
  const x = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)), below = r.bottom + 10 + h < innerHeight
  Object.assign(tip.style, { left: `${x}px`, top: `${below ? r.bottom + 10 : r.top - h - 10}px` })
}
const hideTip = () => { if (tip) tip.hidden = true }
chapEl.addEventListener('mouseover', e => { const a = e.target.closest('a.voc'); if (a) showTip(a) })
chapEl.addEventListener('mouseout', e => { if (e.target.closest('a.voc')) hideTip() })
main.addEventListener('scroll', hideTip, { passive: true })

// ---------- Les clics : au tableau, et le retour ----------
const flash = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 2600) }
function jumpVoc(id) {
  const vi = vocabItem()
  if (!vi) return
  VOC.from = { i: S.at, id }
  hideTip(); go(vi.i)
  requestAnimationFrame(() => {
    const td = $('#body')?.querySelector(`#${CSS.escape(id)}`)
    if (td) { const tr = td.closest('tr'); tr.scrollIntoView({ block: 'center' }); flash(tr, 'voc-hit') }
    const from = S.items[VOC.from?.i]
    if (from) $('.chap-acts')?.insertAdjacentHTML('beforeend', `<button class="voc-back" data-voc-back>← Revenir à « ${esc(from.title.slice(0, 40))} »</button>`)
  })
}
chapEl.addEventListener('click', e => {
  const v = e.target.closest('a.voc')
  if (v) { e.preventDefault(); return jumpVoc(v.dataset.voc) }
  const g = e.target.closest('a[data-go]')
  if (g) { e.preventDefault(); return go(+g.dataset.go) }
  if (e.target.closest('[data-voc-back]') && VOC.from) {
    const { i, id } = VOC.from
    VOC.from = null; go(i)
    requestAnimationFrame(() => { const a = $('#body')?.querySelector(`a.voc[data-voc="${CSS.escape(id)}"]`); if (a) { a.scrollIntoView({ block: 'center' }); flash(a, 'voc-flash') } })
  }
})

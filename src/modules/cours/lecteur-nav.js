// Le site d'un cours (suite de lecteur-ui.js) : les blocs de code (fenêtre, numéros de ligne, couleurs, Copier), la loupe
// (un cours, une matière) et tous tes cours sous l'avatar. Utilise ce que lecteur-ui.js définit ($, esc, S, L, norm…).
// ---------- Les blocs de code : fenêtre, numéros de ligne, couleurs ----------
const KW = new Set(('if else for while do switch case default break continue return class struct enum union namespace using template typename typedef public private protected virtual override final static const constexpr volatile '
  + 'new delete try catch throw throws finally import from as def lambda function var let async await extends implements interface package void int long short char float double bool boolean string true false null nullptr '
  + 'None True False this self sizeof in is not and or elif except raise with yield pass include define noexcept auto').split(' '))
const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\b\d[\w.]*\b)|([A-Za-z_]\w*)/g
function colorize(code, lang) {
  const hashComment = /^(py|python|sh|bash|shell|yaml|yml|rb|ruby|php)$/.test(lang), out = []
  let last = 0, m
  const push = (cls, t) => { if (t) out.push([cls, t]) }
  TOKEN.lastIndex = 0
  while ((m = TOKEN.exec(code))) {
    push('', code.slice(last, m.index)); last = TOKEN.lastIndex
    const [t, com, str, num, id] = m
    if (com) push(com[0] === '#' && !hashComment ? 'k' : 'c', t) // #include, #define : directives ; ailleurs, un commentaire
    else if (str) push('s', t)
    else if (num) push('n', t)
    else if (KW.has(id)) push('k', t)
    else if (code[last] === '(') push('f', t)
    else if (/^[A-Z]/.test(id) || code.slice(Math.max(0, m.index - 2), m.index) === '::') push('t', t)
    else push('', t)
  }
  push('', code.slice(last))
  // chaque ligne dans son <span class="l"> ; un jeton sur plusieurs lignes (commentaire /* */) est coupé par ligne
  const lines = ['']
  for (const [cls, t] of out) t.split('\n').forEach((piece, i) => {
    if (i) lines.push('')
    if (piece) lines[lines.length - 1] += cls ? `<span class="tk-${cls}">${esc(piece)}</span>` : esc(piece)
  })
  while (lines.length > 1 && !lines.at(-1)) lines.pop()
  return lines.map(l => `<span class="l">${l || ' '}</span>`).join('')
}
const COPY = '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>'
// Un bloc sans langage : deviné d'après son code ; du code sans indice prend la langue la plus présente du cours ;
// une sortie de programme, du texte : rien (il reste un simple bloc)
function guessLang(code, dominant) {
  const c = String(code)
  if (/<\?php|^\s*\$\w+\s*=|\becho\s/m.test(c)) return 'php'
  if (/System\.out\.|public\s+static\s+void\s+main|\bString\[\]/.test(c)) return 'java'
  if (/Console\.Write|using\s+System\b|\bstatic\s+void\s+Main\b/.test(c)) return 'csharp'
  if (/#\s*include|std::|\bcout\b|\bcin\b|\bnullptr\b|template\s*<|::~?\w+\s*\(/.test(c)) return 'cpp'
  if (/^\s*(def |import |from \w+ import |print\()/m.test(c) && !/[;{}]\s*$/m.test(c)) return 'python'
  if (/console\.log|=>|\b(let|const)\s+\w+\s*=|function\s*\w*\s*\(/.test(c)) return 'javascript'
  return /[;{}]\s*$/m.test(c) && /[=(]/.test(c) ? dominant || null : null
}
function codeBlocks(body) {
  const blocks = $$('pre', body).filter(pre => pre.querySelector(':scope > code') && !pre.classList.contains('mermaid') && !pre.classList.contains('graph-ko'))
  const tagOf = pre => (pre.querySelector(':scope > code').className.match(/language-([\w+#-]+)/)?.[1] ?? '').toLowerCase()
  // la langue du cours : le langage le plus étiqueté dans ce chapitre (sinon dans tout le cours)
  const tags = blocks.map(tagOf).filter(t => t && !/^(text|txt|none|plain|output|sortie|console|markdown|md|json|cmake|ya?ml)$/.test(t))
  const dominant = tags.sort((a, b) => tags.filter(x => x === b).length - tags.filter(x => x === a).length)[0] ?? S.lang ?? ''
  for (const pre of blocks) {
    const code = pre.querySelector(':scope > code'), tag = tagOf(pre)
    const lang = tag || guessLang(code.textContent, dominant) || ''
    const wrap = document.createElement('div')
    wrap.className = 'code'
    wrap.dataset.lang = lang
    wrap.innerHTML = `<div class="code-h"><i></i><i></i><i></i>${lang ? `<span class="lang">${esc(lang)}</span>` : ''}<button class="copy" type="button">${COPY}<span>Copier</span></button></div><pre><code>${colorize(code.textContent, lang)}</code></pre>`
    pre.replaceWith(wrap)
  }
  if (typeof ideUpgrade === 'function') ideUpgrade(body) // lecteur-ide.js : chaque exemple de code devient un IDE sur place
}

// ---------- La loupe (un cours, une matière) et tous tes cours (sous l'avatar) ----------
const allCourses = () => S.shelf.flatMap(m => m.cours.map(c => ({ ...c, matiere: m.nom })))
const pctOf = (progs, c) => { const p = progs[c.path]; return p?.total ? `${Math.round((100 * p.done) / p.total)} %` : '' }
const rowOf = (c, progs, on = false) => `<button class="spot-row${on ? ' on' : ''}" data-go-course="${esc(c.path)}"><span><b>${esc(c.titre)}</b><small>${esc(c.matiere)} · ${esc(c.type)}</small></span><em>${pctOf(progs, c)}</em></button>`
let spotProgs = {}, spotSel = 0
const spot = $('#spot'), spotIn = $('#spotIn'), spotList = $('#spotList'), menu = $('#menu')
function paintSpot() {
  const words = norm(spotIn.value).split(/\s+/).filter(Boolean)
  const hits = allCourses().filter(c => { const h = norm(`${c.matiere} ${c.type} ${c.titre}`); return words.every(w => h.includes(w)) })
  spotSel = Math.min(spotSel, Math.max(0, hits.length - 1))
  spotList.innerHTML = hits.length ? hits.map((c, i) => rowOf(c, spotProgs, i === spotSel)).join('') : '<p class="spot-none">Aucun cours ni aucune matière ne correspond.</p>'
}
async function openSpot() {
  menu.hidden = true; spot.hidden = false; spotIn.value = ''; spotSel = 0
  spotProgs = await L.call('progresses') ?? {}
  paintSpot(); spotIn.focus()
}
const closeSpot = () => { spot.hidden = true }
function openCourseFromList(p) { closeSpot(); menu.hidden = true; if (p !== S.cur?.path) openCourse(p) }
$('#searchBtn').onclick = openSpot
spotIn.oninput = () => { spotSel = 0; paintSpot() }
spot.addEventListener('click', e => { const b = e.target.closest('[data-go-course]'); if (b) openCourseFromList(b.dataset.goCourse); else if (e.target === spot) closeSpot() })
spotIn.addEventListener('keydown', e => {
  const rows = $$('.spot-row', spotList)
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); spotSel = (spotSel + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % (rows.length || 1); paintSpot(); $('.spot-row.on', spotList)?.scrollIntoView({ block: 'nearest' }) }
  else if (e.key === 'Enter' && rows[spotSel]) openCourseFromList(rows[spotSel].dataset.goCourse)
})
$('#avatarBtn').onclick = async e => {
  e.stopPropagation()
  if (!menu.hidden) { menu.hidden = true; return }
  const progs = await L.call('progresses') ?? {}
  menu.innerHTML = S.shelf.map(m => `<div class="subj">${esc(m.nom)}</div>` + m.cours.map(c => rowOf({ ...c, matiere: m.nom }, progs, c.path === S.cur?.path)).join('')).join('')
    || '<p class="spot-none">Aucun cours écrit pour l’instant.</p>'
  menu.hidden = false
}
menu.addEventListener('click', e => { const b = e.target.closest('[data-go-course]'); if (b) openCourseFromList(b.dataset.goCourse) })
document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('#menu')) menu.hidden = true })
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); spot.hidden ? openSpot() : closeSpot() }
  else if (e.key === 'Escape') { if (!spot.hidden) closeSpot(); else if (!menu.hidden) menu.hidden = true }
})


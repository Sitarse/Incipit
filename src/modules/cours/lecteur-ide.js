// L'IDE dans le cours (lecteur.html) : chaque exemple de code d'un langage connu devient, dans la colonne du chapitre,
// un petit IDE : l'éditeur (Monaco, celui de VS Code), « Exécuter » et « Pas à pas », puis sous l'exemple la console
// (xterm.js : la sortie en direct, la saisie au clavier) et la pile (les appels et leurs variables, ligne par ligne).
// La barre flottante ouvre le même IDE à droite, vide, pour écrire ton propre code. Le travail est fait par ide.js.
// Utilise ce que lecteur-ui.js définit : $, $$, esc, script, L, chapEl.
const IDE = { langs: null, alias: new Map(), mon: null, loading: null, boxes: new Set(), active: null, panel: null }
const NM = '../../../node_modules'
const ICO = {
  play: '<svg viewBox="0 0 24 24"><path d="m7 4 13 8-13 8z"/></svg>',
  steps: '<svg viewBox="0 0 24 24"><path d="M4 6h10M4 12h16M4 18h7"/><circle cx="19" cy="6" r="2"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>',
  reset: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
}
const ideLangOf = tag => IDE.alias.get(String(tag ?? '').toLowerCase()) ?? null
const langInfo = id => IDE.langs?.find(l => l.id === id)

// ---------- Les langages de ce PC (ide.js) ----------
async function ideLangs(fresh = false) {
  IDE.langs = await L.ide({ op: fresh ? 'rescan' : 'langs' }) ?? []
  IDE.alias = new Map(IDE.langs.flatMap(l => l.alias.map(a => [a, l.id])))
  ideUpgrade(document)
  for (const b of IDE.boxes) paintBar(b)
}

// ---------- Monaco et xterm, chargés la première fois ----------
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
const themeName = () => document.documentElement.dataset.theme === 'light' ? 'hito-light' : 'hito-dark'
const termTheme = () => document.documentElement.dataset.theme === 'light'
  ? { background: '#ffffff', foreground: '#1e1b2e', cursor: '#6246d4', selectionBackground: '#d9d2ff' }
  : { background: '#0f0f15', foreground: '#e7e4ec', cursor: '#a995ff', selectionBackground: '#3a3170' }
function loadLibs() {
  return IDE.loading ??= (async () => {
    document.head.insertAdjacentHTML('beforeend', `<link rel="stylesheet" href="${NM}/@xterm/xterm/css/xterm.css">`)
    // xterm avant le chargeur de Monaco : sans « define » présent, ses fichiers posent leur objet dans window
    await script(`${NM}/@xterm/xterm/lib/xterm.js`); await script(`${NM}/@xterm/addon-fit/lib/addon-fit.js`)
    await script(`${NM}/monaco-editor/min/vs/loader.js`)
    // ponytail: menus internes de l'éditeur en anglais : la traduction du paquet (nls.messages.fr.js.js, double
    // extension) ne se charge pas avec ce chargeur ; la renommer à l'installation si ça gêne
    window.require.config({ paths: { vs: `${NM}/monaco-editor/min/vs` } })
    await new Promise((res, rej) => window.require(['vs/editor/editor.main'], res, rej))
    // les scripts chargés ensuite (Mermaid, KaTeX) se posent dans window, pas dans le chargeur de Monaco
    if (window.define) delete window.define.amd
    IDE.mon = window.monaco
    for (const dark of [true, false]) IDE.mon.editor.defineTheme(dark ? 'hito-dark' : 'hito-light', { base: dark ? 'vs-dark' : 'vs', inherit: true, rules: [], colors: dark
      ? { 'editor.background': '#161722', 'editor.lineHighlightBackground': '#1e1e2c', 'editorLineNumber.foreground': '#5f5d72', 'editorLineNumber.activeForeground': '#b2b0c0', 'editorGutter.background': '#161722' }
      : { 'editor.background': '#ffffff', 'editor.lineHighlightBackground': '#f3f1fb' } })
  })()
}
new MutationObserver(() => {
  if (!IDE.mon) return
  IDE.mon.editor.setTheme(themeName())
  for (const b of IDE.boxes) if (b.term) b.term.options.theme = termTheme()
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

// ---------- Un IDE : sa barre, son éditeur, sa console, sa pile ----------
const shell = panel => `<div class="ib-h"><i></i><i></i><i></i><select class="ib-lang" aria-label="Langage"></select><span class="ib-v"></span><span class="ib-sp"></span>
    <button class="ib-btn pri" data-b="run" title="Compiler et lancer (Ctrl+Entrée)">${ICO.play}<span>Exécuter</span></button>
    <button class="ib-btn danger" data-b="stop" hidden>${ICO.stop}<span>Arrêter</span></button>
    <button class="ib-btn" data-b="trace" title="La pile d’appels et les variables, ligne par ligne (F10)">${ICO.steps}<span>Pas à pas</span></button>
    <button class="ib-ic" data-b="reset" title="Revenir au code du cours" aria-label="Revenir au code du cours">${ICO.reset}</button>
    <button class="ib-ic" data-b="copy" title="Copier le code" aria-label="Copier le code">${ICO.copy}</button>
    ${panel ? `<button class="ib-ic" data-b="close" title="Fermer l’IDE" aria-label="Fermer l’IDE">${ICO.close}</button>` : ''}</div>
  <div class="ib-miss" hidden></div>
  <div class="ib-ed"></div>
  <div class="ib-low"${panel ? '' : ' hidden'}>
    <div class="ib-tabs"><button data-tab="console" class="on">Console</button><button data-tab="pile">Pile</button><span class="ib-sp"></span><span class="ib-state"></span></div>
    <div class="ib-term"></div>
    <div class="ib-pile" hidden>
      <div class="ib-pile-top"><label class="ib-in"><span>Saisie du programme</span><textarea rows="2" placeholder="ce que le programme lira (cin, input), une valeur par ligne"></textarea></label>
        <div class="ib-nav" hidden><button data-b="prev" aria-label="Pas précédent">‹</button><input type="range" min="0" value="0"><button data-b="next" aria-label="Pas suivant">›</button><span class="ib-pos"></span></div></div>
      <div class="ib-pile-body"></div>
    </div>
  </div>`
function makeBox(root, lang, code, panel = false) {
  const b = { root, lang, orig: code, panel, ed: null, term: null, fit: null, steps: [], at: 0, deco: null, running: false, started: 0, line: '', error: null }
  root.classList.add('ide-box'); if (panel) root.classList.add('ide-panel')
  const staticCode = panel ? '' : root.querySelector('pre')?.outerHTML ?? ''
  root.innerHTML = shell(panel)
  // en attendant Monaco : le code coloré, déjà lisible
  if (staticCode) root.querySelector('.ib-ed').innerHTML = staticCode
  root._box = b
  IDE.boxes.add(b)
  paintBar(b)
  clearTrace(b)
  loadLibs().then(() => mount(b)).catch(err => { console.error('IDE :', err); stateOf(b, 'L’éditeur ne s’est pas chargé.') })
  return b
}
function mount(b) {
  if (!b.root.isConnected || b.ed) return
  const host = b.root.querySelector('.ib-ed')
  host.innerHTML = ''
  b.ed = IDE.mon.editor.create(host, { value: b.orig, language: monacoOf(b.lang), theme: themeName(), automaticLayout: true, minimap: { enabled: false }, fontSize: 15,
    fontFamily: css('--mono') || 'Consolas', lineHeight: 24, scrollBeyondLastLine: false, tabSize: 4, padding: { top: 12, bottom: 12 }, renderLineHighlight: b.panel ? 'all' : 'none',
    glyphMargin: true, fixedOverflowWidgets: true, scrollbar: { alwaysConsumeMouseWheel: false }, overviewRulerLanes: 0, lineNumbersMinChars: 3 })
  b.ed.addCommand(IDE.mon.KeyMod.CtrlCmd | IDE.mon.KeyCode.Enter, () => run(b))
  b.ed.addCommand(IDE.mon.KeyCode.F10, () => trace(b))
  // dans le cours : l'éditeur prend la hauteur de son code (pas de barre de défilement pour un exemple)
  if (!b.panel) {
    const fitH = () => { host.style.height = `${Math.min(560, Math.max(72, b.ed.getContentHeight()))}px`; b.ed.layout() }
    b.ed.onDidContentSizeChange(fitH); fitH()
  }
}
const monacoOf = id => langInfo(id)?.monaco ?? 'plaintext'
function ensureTerm(b) {
  if (b.term || !window.Terminal) return
  b.term = new window.Terminal({ convertEol: true, cursorBlink: true, fontFamily: css('--mono') || 'Consolas', fontSize: 14, lineHeight: 1.25, scrollback: 5000, theme: termTheme() })
  b.fit = new window.FitAddon.FitAddon()
  b.term.loadAddon(b.fit)
  b.term.open(b.root.querySelector('.ib-term'))
  b.term.onData(d => typed(b, d))
  new ResizeObserver(() => { try { b.fit.fit() } catch {} }).observe(b.root.querySelector('.ib-term'))
}
const stateOf = (b, t) => { const s = b.root.querySelector('.ib-state'); if (s) s.textContent = t }

// ---------- La barre : le langage, ce qui manque ----------
function paintBar(b) {
  if (!IDE.langs) return
  const sel = b.root.querySelector('.ib-lang'), l = langInfo(b.lang), miss = b.root.querySelector('.ib-miss')
  sel.innerHTML = IDE.langs.map(x => `<option value="${x.id}" ${x.id === b.lang ? 'selected' : ''}>${esc(x.nom)}${x.ok ? '' : ' (à installer)'}</option>`).join('')
  b.root.querySelector('.ib-v').textContent = l?.ok ? l.version : ''
  const step = b.root.querySelector('[data-b=trace]')
  step.disabled = !l?.pile || !l.ok
  step.title = l?.pile ? 'La pile d’appels et les variables, ligne par ligne (F10)' : 'Le pas à pas existe pour C, C++ et Python'
  b.root.querySelector('[data-b=run]').disabled = !l?.ok
  // un compilateur ancien : dit une fois, sur le premier exemple de ce langage dans la page (pas sur chacun)
  const first = [...IDE.boxes].find(o => o.lang === b.lang && o.root.isConnected && !o.panel) === b || b.panel
  miss.hidden = !(l && (!l.ok || (l.vieux && first)))
  if (!miss.hidden) miss.innerHTML = !l.ok
    ? `<span><b>${esc(l.nom)} n’est pas installé sur ce PC.</b> ${l.winget ? `Incipit peut l’installer avec winget (${esc(l.winget)}).` : l.hint ? `Dans un terminal : <code>${esc(l.hint)}</code>` : ''}</span>${l.winget ? `<button class="ib-btn pri" data-inst="${l.id}">Installer ${esc(l.nom)}</button>` : ''}<button class="ib-btn" data-rescan>Je l’ai installé</button>`
    : `<span><b>Ton compilateur est ancien</b> (${esc(l.version)}) : le C++ récent (C++17, C++20) peut ne pas compiler.${l.hint ? ` Mets-le à jour : <code>${esc(l.hint)}</code>` : ''}</span>${l.winget ? `<button class="ib-btn" data-inst="${l.id}">Installer le GCC récent</button>` : ''}`
}
const setRunning = (b, on) => { b.running = on; b.root.querySelector('[data-b=stop]').hidden = !on; b.root.querySelector('[data-b=run]').hidden = on }
function showLow(b, tab) {
  b.root.querySelector('.ib-low').hidden = false
  b.tab = tab
  $$('.ib-tabs [data-tab]', b.root).forEach(x => x.classList.toggle('on', x.dataset.tab === tab))
  b.root.querySelector('.ib-term').hidden = tab !== 'console'; b.root.querySelector('.ib-pile').hidden = tab !== 'pile'
  if (tab === 'console') { ensureTerm(b); setTimeout(() => { try { b.fit.fit() } catch {} }) }
}
// Un seul programme tourne à la fois (ide.js) : lancer ici arrête celui d'un autre exemple
function take(b) { for (const o of IDE.boxes) if (o !== b && o.running) setRunning(o, false); IDE.active = b; b.started = Date.now() }

// ---------- Exécuter : la console en direct ----------
const markers = (b, diag) => b.ed && IDE.mon.editor.setModelMarkers(b.ed.getModel(), 'ide', (diag ?? []).map(d => ({ startLineNumber: d.line, startColumn: d.col, endLineNumber: d.line,
  endColumn: 1000, message: d.message, severity: d.severity === 'warning' ? IDE.mon.MarkerSeverity.Warning : IDE.mon.MarkerSeverity.Error })))
const codeOf = b => b.ed ? b.ed.getValue() : b.orig
async function run(b) {
  if (!langInfo(b.lang)?.ok || !IDE.mon) return
  clearTrace(b); markers(b, []); showLow(b, 'console')
  b.term.reset(); b.line = ''
  take(b); setRunning(b, true)
  const r = await L.ide({ op: 'run', lang: b.lang, code: codeOf(b) })
  if (!r || r.error || r.missing) { setRunning(b, false); b.term.write(`\x1b[31m${r?.missing ? 'Ce langage n’est pas installé.' : r?.error ?? 'Ça n’a pas marché.'}\x1b[0m\r\n`); return }
  if (r.wrapped) b.term.write('\x1b[2m(l’exemple est complété automatiquement : un main autour, les #include)\x1b[0m\r\n')
  b.term.focus()
}
const C = { err: '\x1b[38;2;244;114;122m', sys: '\x1b[38;2;140;138;158m', ok: '\x1b[38;2;76;195;138m', off: '\x1b[0m' }
L.onIde(ev => {
  const b = IDE.active
  if (!b || !b.term || ev.id < b.started) return
  if (ev.t === 'out') b.term.write(ev.data)
  else if (ev.t === 'err') b.term.write(C.err + ev.data + C.off)
  else if (ev.t === 'sys') b.term.write(C.sys + ev.data + C.off)
  else if (ev.t === 'diag') markers(b, ev.diag)
  else if (ev.t === 'exit') {
    setRunning(b, false)
    const s = ((Date.now() - b.started) / 1000).toFixed(1).replace('.', ',')
    if (ev.phase === 'install') {
      b.term.write(`\r\n${ev.code === 0 ? `${C.ok}Installé.` : `${C.err}L’installation a échoué (code ${ev.code}).`}${C.off}\r\n`)
      if (ev.langs) { IDE.langs = ev.langs; IDE.alias = new Map(IDE.langs.flatMap(l => l.alias.map(a => [a, l.id]))); for (const o of IDE.boxes) paintBar(o) }
      return
    }
    markers(b, ev.diag)
    if (ev.phase === 'build') b.term.write(`\r\n${C.err}La compilation a échoué${ev.diag?.length ? ` : ${ev.diag.length} erreur${ev.diag.length > 1 ? 's' : ''}, soulignée${ev.diag.length > 1 ? 's' : ''} dans le code` : ''}.${C.off}\r\n`)
    else b.term.write(`\r\n${ev.stopped ? `${C.sys}Arrêté` : ev.code === 0 ? `${C.ok}Terminé` : `${C.err}Terminé avec le code ${ev.code}`} · ${s} s${C.off}\r\n`)
  }
})
// La saisie : la ligne tapée s'affiche, part au programme avec Entrée ; Ctrl+C arrête
function typed(b, d) {
  if (!b.running || IDE.active !== b) return
  for (const ch of d.replace(/\r\n/g, '\r')) {
    if (ch === '\r' || ch === '\n') { b.term.write('\r\n'); L.ide({ op: 'input', text: `${b.line}\n` }); b.line = '' }
    else if (ch === '\x7f' || ch === '\b') { if (b.line) { b.line = b.line.slice(0, -1); b.term.write('\b \b') } }
    else if (ch === '\x03') { b.term.write('^C\r\n'); L.ide({ op: 'stop' }) }
    else if (ch >= ' ') { b.line += ch; b.term.write(ch) }
  }
}

// ---------- Pas à pas : la pile, ligne par ligne ----------
function clearTrace(b) {
  b.steps = []; b.at = 0; b.deco?.clear()
  b.root.querySelector('.ib-pile-body').innerHTML = '<p class="ib-hint">« Pas à pas » exécute le programme ligne par ligne : tu vois les fonctions appelées (la pile) et la valeur de chaque variable. Si le programme lit une saisie, écris-la au-dessus avant.</p>'
  b.root.querySelector('.ib-nav').hidden = true
}
async function trace(b) {
  const l = langInfo(b.lang)
  if (!IDE.mon || !l?.ok || !l.pile) return
  markers(b, []); showLow(b, 'pile'); clearTrace(b)
  b.root.querySelector('.ib-pile-body').innerHTML = '<p class="ib-hint"><span class="spin"></span> Compilation et pas à pas…</p>'
  take(b); setRunning(b, true)
  const r = await L.ide({ op: 'trace', lang: b.lang, code: codeOf(b), stdin: b.root.querySelector('.ib-in textarea').value })
  setRunning(b, false)
  markers(b, r?.diag)
  if (!r || r.missing || (!r.steps?.length && r.error)) {
    b.root.querySelector('.ib-pile-body').innerHTML = `<div class="ib-err"><b>${esc(r?.missing ? 'Ce langage n’est pas installé.' : r?.error ?? 'Le pas à pas a échoué.')}</b>${r?.build ? `<pre>${esc(r.build.slice(-3000))}</pre>` : ''}</div>`
    return
  }
  b.steps = r.steps; b.error = r.error
  b.root.querySelector('.ib-nav').hidden = false
  b.root.querySelector('.ib-nav input').max = String(b.steps.length - 1)
  showStep(b, 0)
}
function showStep(b, k) {
  const n = b.steps.length
  if (!n) return
  b.at = Math.max(0, Math.min(n - 1, k))
  const s = b.steps[b.at], prev = b.steps[b.at - 1], end = s.event === 'end'
  b.root.querySelector('.ib-nav input').value = String(b.at)
  b.root.querySelector('.ib-pos').textContent = end ? `Fin · ${n - 1} pas` : `Pas ${b.at + 1} / ${n - 1} · ligne ${s.line}`
  b.root.querySelector('[data-b=prev]').disabled = b.at === 0; b.root.querySelector('[data-b=next]').disabled = b.at === n - 1
  // la ligne en cours, dans l'éditeur
  b.deco?.clear()
  if (!end && b.ed) {
    b.deco = b.ed.createDecorationsCollection([{ range: new IDE.mon.Range(s.line, 1, s.line, 1), options: { isWholeLine: true, className: 'ide-cur', glyphMarginClassName: 'ide-cur-g' } }])
    b.ed.revealLineInCenterIfOutsideViewport(s.line)
  }
  // la pile : l'appel en cours en haut ; les variables qui viennent de changer, marquées
  const before = new Map((prev?.stack ?? []).map((f, i, a) => [`${a.length - i}:${f.func}`, f.vars]))
  const frames = s.stack.map((f, i) => {
    const old = before.get(`${s.stack.length - i}:${f.func}`) ?? {}
    const vars = Object.entries(f.vars ?? {})
    return `<div class="ide-fr${i ? '' : ' ide-fr-top'}"><div class="ide-fr-h"><b>${esc(f.func)}()</b><span>ligne ${f.line}</span></div>${vars.length
      ? `<table>${vars.map(([k, v]) => `<tr class="${old[k] !== undefined && old[k] !== v ? 'chg' : old[k] === undefined && prev ? 'new' : ''}"><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`
      : '<p class="ide-none">pas de variable</p>'}</div>`
  }).join('')
  const note = s.exc ? `<div class="ide-exc">Exception levée : <b>${esc(s.exc)}</b></div>` : s.ret !== undefined && s.event === 'return' ? `<div class="ide-ret">${esc(s.stack[0]?.func ?? '')}() renvoie <b>${esc(s.ret)}</b></div>` : ''
  b.root.querySelector('.ib-pile-body').innerHTML = `${end ? `<div class="${b.error ? 'ide-exc' : 'ide-ret'}">${esc(b.error ?? 'Le programme est terminé.')}</div>` : ''}${note}
    <div class="ide-cols"><div><div class="lab">Pile d’appels</div>${frames || '<p class="ide-none">vide</p>'}</div>
    <div><div class="lab">Console à ce pas</div><pre class="ide-out">${esc(s.out ?? '') || '<span class="ide-none">rien d’affiché</span>'}</pre></div></div>`
}

// ---------- Les clics, pour tous les IDE ----------
document.addEventListener('click', async e => {
  const root = e.target.closest('.ide-box'), b = root?._box
  if (!b) return
  const t = e.target.closest('[data-b],[data-tab],[data-inst],[data-rescan]')
  if (!t) return
  if (t.dataset.tab) return showLow(b, t.dataset.tab)
  if (t.dataset.rescan !== undefined) { stateOf(b, 'Recherche…'); await ideLangs(true); stateOf(b, ''); return }
  if (t.dataset.inst) { showLow(b, 'console'); b.term?.reset(); take(b); t.disabled = true; const r = await L.ide({ op: 'install', lang: t.dataset.inst }); if (r?.error) b.term?.write(`\x1b[31m${r.error}\x1b[0m\r\n`); return }
  const act = t.dataset.b
  if (act === 'run') run(b)
  else if (act === 'trace') trace(b)
  else if (act === 'stop') L.ide({ op: 'stop' })
  else if (act === 'reset') { b.ed?.setValue(b.orig); clearTrace(b); markers(b, []) }
  else if (act === 'copy') { navigator.clipboard?.writeText(codeOf(b)); t.classList.add('done'); setTimeout(() => t.classList.remove('done'), 1200) }
  else if (act === 'prev') showStep(b, b.at - 1)
  else if (act === 'next') showStep(b, b.at + 1)
  else if (act === 'close') closePanel()
})
document.addEventListener('input', e => { const root = e.target.closest('.ib-nav'); if (root) showStep(root.closest('.ide-box')._box, +e.target.value) })
document.addEventListener('change', e => {
  if (!e.target.matches('.ib-lang')) return
  const b = e.target.closest('.ide-box')._box
  b.lang = e.target.value
  if (b.ed) IDE.mon.editor.setModelLanguage(b.ed.getModel(), monacoOf(b.lang))
  clearTrace(b); paintBar(b)
})

// ---------- Dans le cours : chaque exemple de code d'un langage connu devient un IDE (appelé par codeBlocks) ----------
function ideUpgrade(scope) {
  // les IDE d'un chapitre quitté : leur éditeur est libéré
  for (const b of [...IDE.boxes]) if (!b.root.isConnected) { b.ed?.dispose(); b.term?.dispose(); IDE.boxes.delete(b); if (IDE.active === b) IDE.active = null }
  if (!IDE.langs) return // les langages arrivent : ideLangs() repasse ensuite
  for (const wrap of $$('.code[data-lang]', scope === document ? $('#body') ?? document : scope)) {
    const id = ideLangOf(wrap.dataset.lang)
    if (!id || wrap._box || wrap.closest('.pn-codewin')) continue
    const code = $$('.l', wrap).map(l => l.textContent).join('\n').replace(/ /g, ' ')
    // un extrait (une signature, un squelette avec « ... ») ne se lance pas seul : il reste un bloc de code, sans IDE
    if (!window.IdeLangs.runnable(id, code)) {
      if (!wrap.dataset.frag) { wrap.dataset.frag = '1'; wrap.querySelector('.code-h .copy')?.insertAdjacentHTML('beforebegin', '<span class="frag">extrait · ne se lance pas seul</span>') }
      continue
    }
    wrap.classList.remove('code')
    makeBox(wrap, id, code)
  }
}

// ---------- L'IDE vide, à droite (la barre flottante) : le langage le plus présent dans le chapitre ----------
function closePanel() { $('#app').classList.remove('ide-on'); $('#ide').hidden = true; if (IDE.active === IDE.panel) L.ide({ op: 'stop' }) }
$('#railIde').onclick = async () => {
  if (!$('#ide').hidden) return closePanel()
  if (!IDE.langs) await ideLangs()
  $('#app').classList.add('ide-on'); $('#ide').hidden = false
  if (!IDE.panel) {
    const tags = [...IDE.boxes].map(b => b.lang)
    const lang = tags.sort((a, c) => tags.filter(x => x === c).length - tags.filter(x => x === a).length)[0] ?? 'cpp'
    IDE.panel = makeBox($('#ide'), lang, '', true)
  }
  await loadLibs(); mount(IDE.panel); IDE.panel.ed?.layout(); IDE.panel.ed?.focus(); showLow(IDE.panel, IDE.panel.tab ?? 'console')
}
ideLangs()

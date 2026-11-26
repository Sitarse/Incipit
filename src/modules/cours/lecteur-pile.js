// L'onglet Pile du pas à pas (lecteur-ide.js) : à chaque pas, la mémoire du programme dessinée comme les schémas des
// cours (ide-mem.js → schemas/pile-memoire.js) : les appels empilés, le tas, les flèches, ce qui vient de changer ; la
// légende du pas ; la console à ce pas. Si le dessin échoue : le tableau texte des appels, jamais un onglet vide.
// Utilise $, $$, esc, chapEl (lecteur-ui.js), zoomSchema (lecteur-ui.js), IDE (lecteur-ide.js) : au moment de l'appel.
const consoleAt = s => `<div class="ide-con"><div class="lab">Console à ce pas</div><pre class="ide-out">${esc(s.out ?? '') || '<span class="ide-none">rien d’affiché</span>'}</pre></div>`
const endNote = (b, txt) => `<div class="${b.error ? 'ide-exc' : 'ide-ret'}">${esc(b.error ?? txt)}</div>`

// Le pas k, dessiné
function pileShow(b, k) {
  const s = b.steps[k], body = b.root.querySelector('.ib-pile-body')
  let r
  try {
    b.spec ??= window.IdeMem.toSpec(b.steps)
    r = window.Schemas.render(b.spec, { theme: 'css', step: k, libre: true })
  } catch (err) { console.error('Pile (dessin) :', err); return pileFallback(b, k) }
  const leg = r.captions[k] ?? ''
  body.innerHTML = `${s.event === 'end' ? endNote(b, leg) : `<p class="ide-leg">${esc(leg)}</p>`}
    <div class="ide-cols"><div class="ide-sch sch-draw" title="Agrandir">${r.svg}</div>${consoleAt(s)}</div>`
  // un peu plus grand que dans le cours (le texte du schéma est petit à côté de l'éditeur), jamais plus large que sa colonne
  const svg = body.querySelector('.ide-sch svg')
  if (svg) svg.style.width = `${Math.round(r.width * 1.25)}px`
}

// Le repli : un tableau par appel (l'appel en cours en haut), les variables qui viennent de changer marquées
function pileFallback(b, k) {
  const s = b.steps[k], prev = b.steps[k - 1], T = window.IdeMem.textOf
  const fs = [...(s.frames ?? [])].reverse(), pfs = [...(prev?.frames ?? [])].reverse()
  const before = new Map(pfs.map((f, i) => [`${pfs.length - i}:${f.func}`, new Map((f.vars ?? []).map(x => [x.nom, T(x.v)]))]))
  const frames = fs.map((f, i) => {
    const old = before.get(`${fs.length - i}:${f.func}`) ?? new Map(), vars = f.vars ?? []
    return `<div class="ide-fr${i ? '' : ' ide-fr-top'}"><div class="ide-fr-h"><b>${esc(f.func)}${/\(/.test(f.func) ? '' : '()'}</b><span>ligne ${f.line}</span></div>${vars.length
      ? `<table>${vars.map(x => { const v = T(x.v); return `<tr class="${old.has(x.nom) && old.get(x.nom) !== v ? 'chg' : !old.has(x.nom) && prev ? 'new' : ''}"><td>${esc(x.nom)}</td><td>${esc(v)}</td></tr>` }).join('')}</table>`
      : '<p class="ide-none">pas de variable</p>'}</div>`
  }).join('')
  const note = s.exc ? `<div class="ide-exc">Exception levée : <b>${esc(s.exc)}</b></div>` : s.ret !== undefined && s.event === 'return' ? `<div class="ide-ret">${esc(fs[0]?.func ?? '')}() renvoie <b>${esc(s.ret)}</b></div>` : ''
  b.root.querySelector('.ib-pile-body').innerHTML = `${s.event === 'end' ? endNote(b, 'Le programme est terminé.') : ''}${note}
    <div class="ide-cols"><div class="ide-sch"><div class="lab">Pile d’appels</div>${frames || '<p class="ide-none">vide</p>'}</div>${consoleAt(s)}</div>`
}

// La ligne du pas : dans l'éditeur de l'exemple ; dans un autre fichier envoyé avec lui (Purse.cpp), dans le bloc de ce
// fichier sur la page, mis sous les yeux. s = null : enlève le surlignage.
function pileLine(b, s) {
  b.deco?.clear(); b.deco = null
  b.unmark?.(); b.unmark = null
  if (!s || s.event === 'end') return
  const far = s.file && b.sent && s.file in b.sent && $$('[data-file]', chapEl).find(el => el.dataset.file === s.file && el !== b.root)
  if (!far) {
    if (!b.ed) return
    b.deco = b.ed.createDecorationsCollection([{ range: new IDE.mon.Range(s.line, 1, s.line, 1), options: { isWholeLine: true, className: 'ide-cur', glyphMarginClassName: 'ide-cur-g' } }])
    return b.ed.revealLineInCenterIfOutsideViewport(s.line)
  }
  const ed = far._box?.ed
  if (ed) {
    const d = ed.createDecorationsCollection([{ range: new IDE.mon.Range(s.line, 1, s.line, 1), options: { isWholeLine: true, className: 'ide-cur', glyphMarginClassName: 'ide-cur-g' } }])
    ed.revealLineInCenterIfOutsideViewport(s.line)
    b.unmark = () => d.clear()
  } else {
    const l = $$('.l', far)[s.line - 1]
    l?.classList.add('ide-cur')
    b.unmark = () => l?.classList.remove('ide-cur')
  }
  far.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

// Clic sur le dessin : agrandi, comme les schémas des cours
document.addEventListener('click', e => { const d = e.target.closest('.ib-pile .sch-draw'); if (d) zoomSchema(d) })

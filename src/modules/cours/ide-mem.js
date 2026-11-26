// L'onglet Pile de l'IDE : les pas d'un programme suivi (le format commun des traceurs, ide.js) deviennent un schéma
// « memoire » (schemas/pile-memoire.js) : les cadres empilés avec leurs variables, les globales, le tas, les flèches des
// pointeurs et des références ; ce qui vient de changer en avant ; une légende par pas. Pur : tests/ide-mem.test.js.
//
// Un pas : { line, file, event: 'line'|'return'|'exception'|'end', out, frames: [{ func, line, file, vars: [{ nom, v }] }]
//   (main d'abord), heap: { id: { classe, kind, champs: [{ nom, v }], total?, etat?: 'libere'|'fuite' } }, statics?, ret?, exc? }
// Une valeur v : { t } | { ref, at? } | { sref: [cadre, nom, case?] } | { nul: true } | { classe?, champs } | { inv }
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.IdeMem = factory()
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX = { cadres: 6, vars: 12, objets: 12, champs: 8, texte: 28, niveaux: 3 }
  const INV = { pendant: 'pendant', libere: 'libéré', 'non-init': '?' }
  const cut = s => { const t = String(s ?? ''); return t.length > MAX.texte ? `${t.slice(0, MAX.texte - 1)}…` : t }
  const nameOf = f => (!f ? '' : /\(/.test(f.func) || f.func === 'programme' ? f.func : `${f.func}()`)

  // Une valeur en texte (le tableau de repli, les légendes)
  function textOf(v) {
    if (!v) return ''
    if ('t' in v) return v.t
    if (v.nul) return 'null'
    if (v.ref !== undefined) return `→ ${v.ref}${v.at ? `[${v.at}]` : ''}`
    if (v.sref) return `→ ${v.sref[1]}${v.sref[2] ? `[${v.sref[2]}]` : ''}`
    if (v.inv) return INV[v.inv] ?? '?'
    if (v.champs) return `{${v.champs.map(c => `${c.nom} = ${textOf(c.v)}`).join(', ')}}`
    return ''
  }

  // Les objets montrés à un pas : ceux qu'on atteint depuis les variables (3 niveaux), et les libérés et fuites du pas
  function shown(step) {
    const heap = step.heap ?? {}, seen = [], add = (id, d) => {
      if (!heap[id] || seen.includes(id) || d > MAX.niveaux) return
      seen.push(id)
      for (const c of heap[id].champs ?? []) walk(c.v, d + 1)
    }
    const walk = (v, d) => { if (!v) return; if (v.ref !== undefined) add(v.ref, d); for (const c of v.champs ?? []) walk(c.v, d) }
    for (const f of step.frames ?? []) for (const x of f.vars ?? []) walk(x.v, 1)
    for (const x of step.statics ?? []) walk(x.v, 1)
    for (const [id, o] of Object.entries(heap)) if (o.etat && !seen.includes(id)) seen.push(id)
    return seen
  }

  // Une valeur → une variable du schéma (vis : les objets dessinés ; idx : l'indice des cadres dans le schéma)
  function conv(nom, v, vis, idx, deep = 0) {
    const out = { nom: cut(nom) }
    if (!v) return out
    if ('t' in v) out.valeur = cut(v.t)
    else if (v.nul) out.vers = null
    else if (v.ref !== undefined) { if (vis.has(v.ref)) { out.vers = v.ref; if (v.at) out.at = String(v.at) } else out.valeur = '→ …' }
    else if (v.sref) {
      const ci = v.sref[0] === -1 ? -1 : idx(v.sref[0])
      if (ci === null) out.valeur = '→ (plus bas)'
      else out.versVar = [ci, v.sref[1], ...(v.sref[2] ? [String(v.sref[2])] : [])]
    } else if (v.inv) { out.valeur = INV[v.inv] ?? '?'; out.ton = 'erreur' }
    else if (v.champs) {
      if (deep >= 1) out.valeur = cut(textOf(v))
      else {
        if (v.classe) out.valeur = cut(v.classe)
        out.champs = v.champs.slice(0, MAX.champs).map(c => conv(c.nom, c.v, vis, idx, deep + 1))
        if (v.champs.length > MAX.champs) out.champs.push({ nom: '…', valeur: `${v.champs.length - MAX.champs} de plus` })
      }
    }
    return out
  }
  const key = (f, ci) => `${ci}|${f?.func}`

  // Les pas → un seul schéma (mode libre : les places sont calculées sur tout le programme)
  function toSpec(steps) {
    return { type: 'memoire', etapes: (steps ?? []).map((s, k) => etape(s, k ? steps[k - 1] : null)) }
  }
  function etape(s, prev) {
    const frames = s.frames ?? [], drop = Math.max(0, frames.length - MAX.cadres), off = drop ? 1 : 0
    const idx = fi => (fi < drop ? null : fi - drop + off)
    const ids = shown(s), vis = new Set(ids.slice(0, MAX.objets))
    const prevF = new Map((prev?.frames ?? []).map((f, ci) => [key(f, ci), f]))
    const cadres = drop ? [{ nom: `… ${drop} appel${drop > 1 ? 's' : ''} plus bas`, variables: [] }] : []
    frames.forEach((f, fi) => {
      if (fi < drop) return
      const old = prevF.get(key(f, fi)), was = new Map((old?.vars ?? []).map(x => [x.nom, textOf(x.v)]))
      const vars = f.vars ?? []
      const variables = vars.slice(0, MAX.vars).map(x => {
        const out = conv(x.nom, x.v, vis, idx)
        if (prev && !out.ton && (!was.has(x.nom) || was.get(x.nom) !== textOf(x.v))) out.ton = 'accent'
        return out
      })
      if (vars.length > MAX.vars) variables.push({ nom: '…', valeur: `${vars.length - MAX.vars} de plus` })
      const c = { nom: nameOf(f), variables }
      if (prev && !old) c.ton = 'accent'
      cadres.push(c)
    })
    const top = cadres[cadres.length - 1]
    if (top && s.event === 'exception') top.ton = 'erreur'
    if (top && s.event === 'return' && s.ret !== undefined) top.note = cut(`→ ${s.ret}`)
    const prevHeap = prev?.heap ?? {}
    const objets = [...vis].map(id => {
      const o = s.heap[id], champs = (o.champs ?? []).slice(0, MAX.champs).map(c => {
        const out = conv(c.nom, c.v, vis, idx, 1), was = prevHeap[id]?.champs?.find(x => x.nom === c.nom)
        if (prev && prevHeap[id] && (!was || textOf(was.v) !== textOf(c.v))) out.ton = 'accent'
        return out
      })
      // total : le nombre réel d'éléments quand le traceur n'en a envoyé qu'une partie (une longue liste)
      const n = Math.max(o.total ?? 0, (o.champs ?? []).length)
      if (n > MAX.champs) champs.push({ nom: '…', valeur: `${n - MAX.champs} de plus` })
      const out = { id, classe: cut(o.classe), champs }
      if (o.etat === 'libere') { out.ton = 'discret'; out.note = 'libéré' }
      else if (o.etat === 'fuite') { out.ton = 'erreur'; out.note = 'fuite' }
      else if (prev && !prevHeap[id]) out.ton = 'accent'
      return out
    })
    if (ids.length > MAX.objets) objets.push({ id: '…', classe: `… ${ids.length - MAX.objets} autres objets`, champs: [] })
    const globales = (s.statics ?? []).slice(0, MAX.vars).map(x => conv(x.nom, x.v, vis, idx))
    return { cadres, globales, objets, legende: legend(prev, s) }
  }

  // Ce qui s'est passé entre deux pas, en une ligne
  function legend(prev, cur) {
    const fs = cur.frames ?? [], top = fs[fs.length - 1], name = nameOf(top)
    if (cur.event === 'end') {
      const n = Object.values(cur.heap ?? {}).filter(o => o.etat === 'fuite').length
      return `Le programme est terminé${n ? ` · ${n} bloc${n > 1 ? 's' : ''} jamais libéré${n > 1 ? 's' : ''}` : ''}`
    }
    if (cur.event === 'exception') return `Exception : ${cur.exc ?? ''}`.trim()
    if (cur.event === 'return') return cur.ret !== undefined ? `${name} renvoie ${cur.ret}` : `${name} se termine`
    if (!prev) return `${name} démarre`
    const pf = prev.frames ?? []
    if (fs.length > pf.length) return `${name} est appelée`
    // au retour : comparé au même appel au pas d'avant (la valeur renvoyée vient souvent d'être rangée)
    const out = fs.length < pf.length ? [`retour dans ${name}`] : [], old = new Map((pf[fs.length - 1]?.vars ?? []).map(x => [x.nom, x.v]))
    // ce que vise un pointeur : « un objet P », « t[1] », « s.x » (jamais une adresse)
    const aim = v => v.ref !== undefined ? `un objet ${cur.heap?.[v.ref]?.classe ?? ''}`.trim()
      : `${v.sref[1]}${v.sref[2] === undefined ? '' : String(v.sref[2]).split('.').map(p => /^\d+$/.test(p) ? `[${p}]` : `.${p}`).join('')}`
    for (const x of top?.vars ?? []) {
      const a = old.get(x.nom), v = x.v ?? {}, now = textOf(v), again = a === undefined ? '' : 'maintenant '
      if (a !== undefined && textOf(a) === now) continue
      // une flèche vers un objet déjà montré par une autre variable : c'est un alias
      const twin = v.ref !== undefined && (top.vars ?? []).find(y => y !== x && y.v?.ref === v.ref && old.has(y.nom))
      if (twin) out.push(`${x.nom} pointe ${again}vers le même objet que ${twin.nom}`)
      else if (v.ref !== undefined || v.sref) out.push(`${x.nom} pointe ${again}vers ${aim(v)}`)
      else if (v.nul) out.push(`${x.nom} vaut ${again}null`)
      else if (v.inv === 'non-init') out.push(`${x.nom} est déclaré sans valeur`)
      else if (v.inv === 'pendant') out.push(`${x.nom} pointe vers une variable qui n’existe plus`)
      else if (v.inv) continue // un bloc libéré : la ligne du tas le dit
      else if (a === undefined) out.push(`${x.nom} vaut ${now}`)
      else out.push(`${x.nom} passe de ${textOf(a)} à ${now}`)
    }
    // les static et les globales qui changent
    const was = new Map((prev.statics ?? []).map(x => [x.nom, textOf(x.v)]))
    for (const x of cur.statics ?? []) if (was.has(x.nom) && was.get(x.nom) !== textOf(x.v) && x.v?.ref === undefined) out.push(`${x.nom} passe de ${was.get(x.nom)} à ${textOf(x.v)}`)
    for (const [id, o] of Object.entries(cur.heap ?? {})) {
      const p = prev.heap?.[id], at = c => `${o.classe}${/^\[/.test(c.nom) ? '' : '.'}${c.nom}`
      if (o.etat === 'libere' && p?.etat !== 'libere') out.push(`un ${o.classe} est libéré`)
      else if (o.etat === 'fuite' && p?.etat !== 'fuite') out.push(`fuite : plus aucun pointeur vers ce ${o.classe}`)
      else if (p) for (const c of o.champs ?? []) {
        const w = p.champs?.find(x => x.nom === c.nom)
        if (!w) out.push(`${at(c)} ajouté : ${textOf(c.v)}`)
        else if (textOf(w.v) !== textOf(c.v)) out.push(`${at(c)} passe de ${textOf(w.v)} à ${textOf(c.v)}`)
      }
    }
    return out.length ? out.slice(0, 2).join(' · ') : `ligne ${cur.line}`
  }

  // L'explication à voix haute (lecteur-voix.js) fait suivre la mémoire : pour chaque étape (lignes de..a), le pas à
  // dessiner. lines : la ligne de chaque pas (null : la fin, ou un autre fichier). Les étapes suivent l'exécution : on
  // avance dans le tracé ; une étape montre l'état juste après ses lignes (le pas qui suit leur dernier passage). Des
  // lignes que le programme ne traverse pas (une signature, une déclaration) : l'état du moment.
  function memSteps(lines, etapes) {
    const n = lines.length, out = []
    let c = 0
    for (const e of etapes) {
      if (!n) { out.push(null); continue }
      const inside = k => lines[k] != null && lines[k] >= e.de && lines[k] <= e.a
      let k = c
      while (k < n && !inside(k)) k++
      if (k === n) { out.push(Math.min(c, n - 1)); continue }
      while (k + 1 < n && inside(k + 1)) k++
      c = Math.min(k + 1, n - 1)
      out.push(c)
    }
    return out
  }

  return { toSpec, legend, textOf, memSteps, MAX }
})

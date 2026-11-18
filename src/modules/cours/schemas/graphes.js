// Types « etats » (une machine à états : cycle de vie d'un objet, d'un processus, d'une commande) et « algorithme »
// (un vrai organigramme, quand il y a des décisions : compact, la suite principale tout droit vers le bas).
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core'))
  else factory(root.Schemas)
})(typeof self !== 'undefined' ? self : this, function (S) {
  const { FONT, SMALL, measure, wrap, widest, str, arr, norm, ton, item, rect, text, textH, path, line, bbox, fit, layers, r } = S

  // ---------------------------------------------------------------- etats
  // { type: "etats", etats: [{ id, texte?, note?, ton?, final? }], initial?: id, transitions: [{ de, vers, texte? }] }
  S.type({
    name: 'etats', alias: ['automate', 'machine-a-etats', 'state'],
    check(s, err) {
      s.etats = arr(s.etats).map(e => (e && typeof e === 'object' ? { id: str(e.id ?? e.texte, 40), texte: str(e.texte ?? e.id, 44), note: str(e.note, 48), ton: ton(e.ton), final: !!e.final } : { id: str(e, 40), texte: str(e, 44), note: '', ton: '', final: false }))
      if (s.etats.length < 2 || s.etats.length > 9) return err('etats : de 2 à 9 états')
      const ids = new Map(s.etats.map(e => [e.id, e])), find = q => ids.get(str(q, 40)) ?? s.etats.find(e => norm(e.texte) === norm(q) || norm(e.id) === norm(q))
      s.transitions = arr(s.transitions).map(t => ({ de: find(t?.de), vers: find(t?.vers), texte: str(t?.texte, 50), q: `${str(t?.de, 30)} → ${str(t?.vers, 30)}` }))
      if (!s.transitions.length || s.transitions.length > 14) err('etats : de 1 à 14 transitions')
      for (const t of s.transitions) if (!t.de || !t.vers) err(`etats : transition « ${t.q} » : état inconnu`)
      s.initial = s.initial ? find(s.initial) : s.etats[0]
      if (!s.initial) err('etats : « initial » est inconnu')
      for (const e of s.etats) if (s.finals?.includes?.(e.id)) e.final = true
    },
    render(s, ctx) {
      for (const e of s.etats) { e._l = wrap(e.texte, 150, FONT); e._n = e.note ? wrap(e.note, 150, SMALL) : []; e._w = Math.max(80, Math.max(widest(e._l, FONT), widest(e._n, SMALL)) + 30); e._h = Math.max(36, textH(e._l.length) + (e._n.length ? textH(e._n.length, SMALL) + 3 : 0) + 16) }
      const { rank, order, back } = layers(s.etats, s.transitions.map(t => [t.de, t.vers]), [s.initial])
      const colW = order.map(l => Math.max(...l.map(e => e._w))), colX = colW.reduce((a, w, i) => (a.push(i ? a[i - 1] + colW[i - 1] + 96 : 0), a), [])
      const RH = Math.max(...s.etats.map(e => e._h)) + 54, tall = Math.max(...order.map(l => l.length))
      order.forEach((l, i) => l.forEach((e, j) => { e._x = colX[i] + (colW[i] - e._w) / 2; e._y = (j + (tall - l.length) / 2) * RH }))
      const bb = bbox()
      let nb = '', lb = '', tb = ''
      for (const e of s.etats) {
        bb.add(e._x, e._y, e._w, e._h)
        nb += item(e._x, e._y, e._w, e._h, e.ton, 6) + (e.final ? rect(e._x + 3, e._y + 3, e._w - 6, e._h - 6, 's-box', 4) : '')
        const th = textH(e._l.length), nh = e._n.length ? textH(e._n.length, SMALL) + 3 : 0, top = e._y + (e._h - th - nh) / 2
        nb += text(e._x + e._w / 2, top + th / 2, e._l, { cls: e.ton && e.ton !== 'dim' ? `s-tc-${e.ton}` : 's-t1' }) + (nh ? text(e._x + e._w / 2, top + th + 3 + (nh - 3) / 2, e._n, { size: SMALL, cls: 's-t3' }) : '')
      }
      // L'état initial : un point plein et sa flèche
      const ini = s.initial, ix = ini._x - 34, iy = ini._y + ini._h / 2
      nb += `<circle cx="${r(ix)}" cy="${r(iy)}" r="5.5" class="s-ah"/>`; lb += line(`M${r(ix + 6)},${r(iy)} L${r(ini._x - 2)},${r(iy)}`, ctx); bb.add(ix - 6, iy - 6, 12, 12)
      const pair = (a, b) => s.transitions.some(t => t.de === b && t.vers === a)
      s.transitions.forEach((t, i) => {
        const A = t.de, B = t.vers, label = t.texte ? wrap(t.texte, 130, SMALL) : null
        let d, lx, ly
        if (A === B) { // une boucle sur l'état lui-même, en haut à droite
          const x0 = A._x + A._w * 0.62, y0 = A._y, x1 = A._x + A._w, y1 = A._y + A._h * 0.3
          d = `M${r(x0)},${r(y0)} C${r(x0)},${r(y0 - 34)} ${r(x1 + 34)},${r(y1)} ${r(x1 + 1.5)},${r(y1)}`; lx = x1 + 14; ly = y0 - 22
        } else if (!back.has(i) && rank.get(B) > rank.get(A)) { // en avant : droit, légèrement décalé s'il y a un retour
          const off = pair(A, B) ? -6 : 0, ya = A._y + A._h / 2 + off, yb = B._y + B._h / 2 + off, xa = A._x + A._w, xb = B._x - 2
          d = Math.abs(ya - yb) < 1 ? `M${r(xa)},${r(ya)} L${r(xb)},${r(yb)}` : `M${r(xa)},${r(ya)} C${r(xa + 40)},${r(ya)} ${r(xb - 40)},${r(yb)} ${r(xb)},${r(yb)}`
          lx = (xa + xb) / 2; ly = (ya + yb) / 2 - 10
        } else { // en arrière : par-dessus si l'on part d'en haut, sinon par-dessous ; deux retours vers un même état arrivent côte à côte
          const into = s.transitions.filter((u, j) => u.vers === B && u.de !== B && (back.has(j) || rank.get(B) <= rank.get(u.de)))
          const shift = (into.indexOf(t) - (into.length - 1) / 2) * 16
          const ma = A._y + A._h / 2, mb = B._y + B._h / 2
          const up = ma < mb - 1 || (Math.abs(ma - mb) <= 1 && into.indexOf(t) % 2 === 1)
          const xa = A._x + A._w / 2, xb = B._x + B._w / 2 + shift, ya = up ? A._y : A._y + A._h, yb = up ? B._y - 2 : B._y + B._h + 2
          const far = 40 + Math.abs(xa - xb) * 0.1, dip = up ? Math.min(ya, yb) - far : Math.max(ya, yb) + far
          d = `M${r(xa)},${r(ya)} C${r(xa)},${r(dip)} ${r(xb)},${r(dip)} ${r(xb)},${r(yb)}`; lx = (xa + xb) / 2; ly = dip + (up ? 12 : -10)
          bb.add(Math.min(xa, xb), Math.min(ya, dip), Math.abs(xa - xb), Math.abs(dip - ya))
        }
        lb += line(d, ctx)
        if (label) { const w = widest(label, SMALL), h = textH(label.length, SMALL); tb += text(lx, ly, label, { size: SMALL, cls: 's-t2', halo: true }); bb.add(lx - w / 2, ly - h / 2, w, h) }
      })
      return fit(lb + nb + tb, bb)
    },
  })

  // ---------------------------------------------------------------- algorithme
  // { type: "algorithme", debut?: "texte", noeuds: [{ id, action: "…", suite?: id } | { id, question: "…", oui: id, non: id } | { id, fin: "…" }], depart?: id }
  S.type({
    name: 'algorithme', alias: ['organigramme', 'flowchart', 'algo'],
    check(s, err) {
      s.noeuds = arr(s.noeuds).map(n => ({ id: str(n?.id, 30), kind: n?.question ? 'q' : n?.fin !== undefined ? 'f' : 'a', texte: str(n?.question ?? n?.action ?? n?.fin ?? n?.texte, 70), ton: ton(n?.ton), suite: str(n?.suite, 30), oui: str(n?.oui, 30), non: str(n?.non, 30) }))
      if (s.noeuds.length < 2 || s.noeuds.length > 12) return err('algorithme : de 2 à 12 nœuds')
      const ids = new Map(s.noeuds.map(n => [n.id, n]))
      if (ids.size !== s.noeuds.length || s.noeuds.some(n => !n.id)) err('algorithme : chaque nœud a un « id » unique')
      for (const n of s.noeuds) {
        if (!n.texte) err(`algorithme : « ${n.id} » sans texte`)
        const outs = n.kind === 'q' ? [n.oui, n.non] : n.kind === 'a' ? [n.suite].filter(Boolean) : []
        if (n.kind === 'q' && (!n.oui || !n.non)) err(`algorithme : la question « ${n.id} » a besoin de « oui » et « non »`)
        for (const o of outs) if (!ids.has(o)) err(`algorithme : « ${n.id} » mène à « ${o} », qui n'existe pas`)
      }
      s.depart = str(s.depart, 30) || s.noeuds[0].id
      if (!ids.has(s.depart)) err('algorithme : « depart » inconnu')
      s.debut = str(s.debut, 60)
    },
    render(s, ctx) {
      const ids = new Map(s.noeuds.map(n => [n.id, n]))
      const outs = n => (n.kind === 'q' ? [[n.oui, 'oui'], [n.non, 'non']] : n.suite ? [[n.suite, '']] : [])
      const nodes = [...s.noeuds], edges = []
      if (s.debut) nodes.unshift({ id: '\u0000debut', kind: 's', texte: s.debut, suite: s.depart, ton: '' })
      const all = new Map(nodes.map(n => [n.id, n]))
      for (const n of nodes) for (const [to, lab] of (n.kind === 's' ? [[n.suite, '']] : outs(n))) edges.push([n, all.get(to), lab])
      for (const n of nodes) { n._l = wrap(n.texte, n.kind === 'q' ? 170 : 190, FONT); n._w = n.kind === 'q' ? Math.max(130, widest(n._l, FONT) * 1.7 + 40) : Math.max(90, widest(n._l, FONT) + 30); n._h = n.kind === 'q' ? Math.max(58, textH(n._l.length) * 2 + 20) : Math.max(34, textH(n._l.length) + 16) }
      const start = all.get(s.debut ? '\u0000debut' : s.depart)
      const { rank, back } = layers(nodes, edges.map(e => [e[0], e[1]]), [start])
      // Colonnes : la suite la plus longue reste dans la colonne, l'autre branche part à droite
      const depth = new Map(), dep = (n, seen = new Set()) => { if (depth.has(n)) return depth.get(n); if (seen.has(n)) return 0; seen.add(n); const d = 1 + Math.max(0, ...edges.filter((e, i) => e[0] === n && !back.has(i)).map(e => dep(e[1], seen))); depth.set(n, d); return d }
      // Une branche prend la première colonne libre sur toute la hauteur qu'elle parcourt (du parent à elle) : son trait
      // ne traverse aucune boîte
      const col = new Map()
      const busy = (c, r0, r1, self) => nodes.some(m => m !== self && col.get(m) === c && rank.get(m) >= r0 && rank.get(m) <= r1)
      const visit = (n, c, from) => {
        if (col.has(n)) return
        const r0 = from ? rank.get(from) : rank.get(n)
        while (busy(c, c === (from ? col.get(from) : -1) ? rank.get(n) : r0, rank.get(n), n)) c++
        col.set(n, c)
        const nexts = edges.map((e, i) => [e, i]).filter(([e, i]) => e[0] === n && !back.has(i)).map(([e]) => e[1]).sort((a, b) => dep(b) - dep(a))
        nexts.forEach((m, k) => visit(m, col.get(n) + k, n))
      }
      visit(start, 0, null)
      nodes.forEach(n => { if (!col.has(n)) { let c = 0; while (busy(c, rank.get(n), rank.get(n), n)) c++; col.set(n, c) } })
      const cw = Math.max(...nodes.map(n => n._w)) + 56, rows = Math.max(...nodes.map(n => rank.get(n))) + 1
      const rowH = [...Array(rows)].map((_, i) => Math.max(0, ...nodes.filter(n => rank.get(n) === i).map(n => n._h)))
      const rowY = rowH.reduce((a, h, i) => (a.push(i ? a[i - 1] + rowH[i - 1] + 40 : 0), a), [])
      for (const n of nodes) { n._x = col.get(n) * cw + (cw - 56 - n._w) / 2; n._y = rowY[rank.get(n)] + (rowH[rank.get(n)] - n._h) / 2 }
      const bb = bbox(), cx = n => n._x + n._w / 2
      let nb = '', lb = '', tb = '', lane = 0
      for (const n of nodes) {
        bb.add(n._x, n._y, n._w, n._h)
        const tc = n.ton && n.ton !== 'dim' ? `s-tc-${n.ton}` : 's-t1'
        if (n.kind === 'q') { // une décision
          const x = n._x, y = n._y, w = n._w, h = n._h
          nb += `<path d="M${r(x + w / 2)},${r(y)} L${r(x + w)},${r(y + h / 2)} L${r(x + w / 2)},${r(y + h)} L${r(x)},${r(y + h / 2)} Z" class="s-dec${n.ton ? ` s-b-${n.ton}` : ''}"/>` // un losange (ajouts1.png)
        } else if (n.kind === 'f' || n.kind === 's') nb += rect(n._x, n._y, n._w, n._h, 's-term', n._h / 2) // début, fin : une pilule
        else nb += item(n._x, n._y, n._w, n._h, n.ton)
        nb += text(cx(n), n._y + n._h / 2, n._l, { cls: n.kind === 'f' || n.kind === 's' ? 's-t1' : tc, bold: n.kind === 'f' || n.kind === 's' })
      }
      edges.forEach(([a, b, lab], i) => {
        let pts, lp
        if (back.has(i) || rank.get(b) <= rank.get(a)) { // une boucle : par la gauche, en remontant
          const xl = Math.min(...nodes.map(n => n._x)) - 22 - 10 * lane++
          pts = [[a._x, a._y + a._h / 2], [xl, a._y + a._h / 2], [xl, b._y + b._h / 2], [b._x - 2, b._y + b._h / 2]]; lp = [a._x - 6, a._y + a._h / 2 - 9, 'end']
          bb.add(xl, b._y, 1, 1)
        } else if (col.get(b) === col.get(a) && nodes.some(n => col.get(n) === col.get(a) && rank.get(n) > rank.get(a) && rank.get(n) < rank.get(b))) {
          // même colonne, mais des nœuds entre les deux : par la gauche, sans les traverser
          const xl = Math.min(...nodes.map(n => n._x)) - 22 - 10 * lane++
          pts = [[a._x, a._y + a._h / 2], [xl, a._y + a._h / 2], [xl, b._y + b._h / 2], [b._x - 2, b._y + b._h / 2]]; lp = [a._x - 6, a._y + a._h / 2 - 9, 'end']
          bb.add(xl, a._y, 1, 1)
        } else if (col.get(b) === col.get(a)) { pts = [[cx(a), a._y + a._h], [cx(b), b._y - 2]]; lp = [cx(a) + 7, a._y + a._h + 11, 'start'] }
        else if (col.get(b) > col.get(a)) {
          // vers la droite : en équerre ; si une boîte barre la route sur la ligne du parent, on descend d'abord entre les colonnes
          const ra = rank.get(a), cut = nodes.some(m => m !== a && m !== b && rank.get(m) === ra && col.get(m) > col.get(a) && col.get(m) <= col.get(b))
          const xr = a._x + a._w + 16
          pts = cut ? [[a._x + a._w, a._y + a._h / 2], [xr, a._y + a._h / 2], [xr, b._y - 16], [cx(b), b._y - 16], [cx(b), b._y - 2]] : [[a._x + a._w, a._y + a._h / 2], [cx(b), a._y + a._h / 2], [cx(b), b._y - 2]]
          lp = [a._x + a._w + 6, a._y + a._h / 2 - 8, 'start']
        } else {
          // retour vers la gauche : on descend puis on rejoint ; une boîte dessous dans la colonne : par sa droite
          const below = nodes.filter(m => col.get(m) === col.get(a) && rank.get(m) > rank.get(a) && rank.get(m) < rank.get(b)), yy = b._y - 18
          if (below.length) { const xr = Math.max(a._x + a._w, ...below.map(m => m._x + m._w)) + 14; pts = [[a._x + a._w, a._y + a._h / 2], [xr, a._y + a._h / 2], [xr, yy], [cx(b), yy], [cx(b), b._y - 2]] }
          else pts = [[cx(a), a._y + a._h], [cx(a), yy], [cx(b), yy], [cx(b), b._y - 2]]
          lp = [cx(a) + 7, a._y + a._h + 11, 'start']
        }
        lb += line(path(pts, 7), ctx)
        if (lab) tb += text(lp[0], lp[1], lab, { size: SMALL, cls: 's-t3', anchor: lp[2], halo: true })
      })
      return fit(lb + nb + tb, bb)
    },
  })
  return S
})

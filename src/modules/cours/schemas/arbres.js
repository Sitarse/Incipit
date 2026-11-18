// Types « arbre » (une hiérarchie : héritage, arborescence, DOM, composants) et « dendrogramme » (classification
// ascendante hiérarchique : qui fusionne avec qui, à quelle hauteur, et les groupes qu'une coupe donne).
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core'))
  else factory(root.Schemas)
})(typeof self !== 'undefined' ? self : this, function (S) {
  const { FONT, SMALL, CAP, MONO, HUES, measure, wrap, widest, looksCode, str, arr, norm, ton, finite, numv, num, item, text, textH, path, line, bbox, fit, ticks, r } = S

  // ---------------------------------------------------------------- arbre
  // { type: "arbre", racine: { texte, note?, ton?, enfants: [ … ] }, liens?: "heritage" | "fleche" | "simple", sens?: "droite" }
  const GX = 22, GY = 46
  S.type({
    name: 'arbre', alias: ['hierarchie', 'tree', 'heritage'],
    check(s, err) {
      let n = 0, depth = 0
      const node = (v, d) => {
        if (!v || typeof v !== 'object') { if (typeof v === 'string') v = { texte: v }; else return null }
        n++; depth = Math.max(depth, d)
        return { texte: str(v.texte ?? v.nom, 44), note: str(v.note, 48), ton: ton(v.ton), enfants: arr(v.enfants).map(c => node(c, d + 1)).filter(Boolean) }
      }
      s.racine = node(s.racine ?? s.arbre, 0)
      if (!s.racine) return err('arbre : il faut « racine » : { texte, enfants }')
      if (n > 24) err('arbre : 24 nœuds au plus')
      if (depth > 6) err('arbre : 7 niveaux au plus')
      const bad = v => !v.texte || v.enfants.some(bad)
      if (bad(s.racine)) err('arbre : un nœud sans texte')
      s.liens = ['heritage', 'fleche', 'simple'].find(k => norm(s.liens ?? s.lien).startsWith(k.slice(0, 5))) ?? (s._as === 'heritage' ? 'heritage' : 'simple')
      s.sens = norm(s.sens) === 'droite' ? 'droite' : 'bas'
    },
    render(s, ctx) {
      const down = s.sens === 'bas', all = []
      const size = v => {
        const code = looksCode(v.texte), fs = code ? MONO : FONT
        v._l = wrap(v.texte, 190, fs, { mono: code, bold: true }); v._n = v.note ? wrap(v.note, 190, SMALL) : []; v._code = code; v._fs = fs
        v._w = Math.max(70, Math.max(widest(v._l, fs, { mono: code, bold: true }), widest(v._n, SMALL)) + 26)
        v._h = Math.max(32, textH(v._l.length, fs) + (v._n.length ? textH(v._n.length, SMALL) + 3 : 0) + 14)
        all.push(v); v.enfants.forEach(size)
      }
      size(s.racine)
      // a : l'axe des frères (x vers le bas, y vers la droite), b : l'axe des niveaux
      const A = v => (down ? v._w : v._h), B = v => (down ? v._h : v._w)
      const levels = []
      const lv = (v, d) => { levels[d] = Math.max(levels[d] ?? 0, B(v)); v._d = d; v.enfants.forEach(c => lv(c, d + 1)) }
      lv(s.racine, 0)
      const gb = down ? GY : GY + 18, pos = levels.reduce((acc, h, i) => (acc.push(i ? acc[i - 1] + levels[i - 1] + gb : 0), acc), [])
      const span = v => (v._s = Math.max(A(v), v.enfants.reduce((t, c) => t + span(c), 0) + GX * Math.max(0, v.enfants.length - 1)))
      span(s.racine)
      const place = (v, a0) => {
        const kids = v.enfants.reduce((t, c) => t + c._s, 0) + GX * Math.max(0, v.enfants.length - 1)
        let a = a0 + (v._s - kids) / 2
        for (const c of v.enfants) { place(c, a); a += c._s + GX }
        v._a = v.enfants.length ? (v.enfants[0]._a + v.enfants[v.enfants.length - 1]._a) / 2 : a0 + v._s / 2
        v._b = pos[v._d] + (levels[v._d] - B(v)) / 2
      }
      place(s.racine, 0)
      const xy = v => (down ? { x: v._a - v._w / 2, y: v._b } : { x: v._b, y: v._a - v._h / 2 })
      const bb = bbox()
      let lb = '', nb = ''
      for (const v of all) {
        const p = xy(v)
        bb.add(p.x, p.y, v._w, v._h)
        nb += item(p.x, p.y, v._w, v._h, v.ton)
        const tc = v.ton && v.ton !== 'dim' ? `s-tc-${v.ton}` : v.ton === 'dim' ? 's-t3' : 's-t1'
        const th = textH(v._l.length, v._fs), nh = v._n.length ? textH(v._n.length, SMALL) + 3 : 0, top = p.y + (v._h - th - nh) / 2
        nb += text(p.x + v._w / 2, top + th / 2, v._l, { cls: tc, bold: !v._code, mono: v._code, size: v._fs })
        if (nh) nb += text(p.x + v._w / 2, top + th + 3 + (nh - 3) / 2, v._n, { size: SMALL, cls: 's-t3' })
        if (!v.enfants.length) continue
        // Le « peigne » : une tige du parent, une barre, une tige par enfant. Héritage : le triangle UML sur le parent
        const pe = down ? [v._a, p.y + v._h] : [p.x + v._w, v._a], mid = down ? p.y + v._h + gb / 2 : p.x + v._w + gb / 2
        const kids = v.enfants.map(c => { const q = xy(c); return down ? [c._a, q.y] : [q.x, c._a] })
        const her = s.liens === 'heritage', fl = s.liens === 'fleche'
        if (down) {
          lb += line(`M${r(pe[0])},${r(mid)} L${r(pe[0])},${r(pe[1] + (her ? 0.5 : 0))}`, ctx, { head: her ? 'tri' : '' })
          const a0 = Math.min(pe[0], ...kids.map(k => k[0])), a1 = Math.max(pe[0], ...kids.map(k => k[0]))
          if (a1 - a0 > 0.5) lb += line(`M${r(a0)},${r(mid)} L${r(a1)},${r(mid)}`, ctx, { head: '' })
          for (const k of kids) lb += line(`M${r(k[0])},${r(mid)} L${r(k[0])},${r(k[1] - (fl ? 2 : 0))}`, ctx, { head: fl ? 'ah' : '' })
        } else {
          lb += line(`M${r(mid)},${r(pe[1])} L${r(pe[0] + (her ? 0.5 : 0))},${r(pe[1])}`, ctx, { head: her ? 'tri' : '' })
          const a0 = Math.min(pe[1], ...kids.map(k => k[1])), a1 = Math.max(pe[1], ...kids.map(k => k[1]))
          if (a1 - a0 > 0.5) lb += line(`M${r(mid)},${r(a0)} L${r(mid)},${r(a1)}`, ctx, { head: '' })
          for (const k of kids) lb += line(`M${r(mid)},${r(k[1])} L${r(k[0] - (fl ? 2 : 0))},${r(k[1])}`, ctx, { head: fl ? 'ah' : '' })
        }
      }
      return fit(lb + nb, bb)
    },
  })

  // ---------------------------------------------------------------- dendrogramme
  // { type: "dendrogramme", feuilles: ["1", "2", …], fusions: [{ groupes: ["2", "4"], hauteur: 1 }, { groupes: ["2,4", "3"], hauteur: 2.5 }],
  //   coupe?: 3, axe?: "distance" } — un groupe se nomme par ses feuilles, séparées par des virgules
  S.type({
    name: 'dendrogramme', alias: ['cah', 'dendrogram'],
    check(s, err) {
      s.feuilles = arr(s.feuilles).map(f => str(f, 16))
      if (s.feuilles.length < 2 || s.feuilles.length > 20) return err('dendrogramme : de 2 à 20 feuilles')
      if (new Set(s.feuilles).size !== s.feuilles.length || s.feuilles.some(f => !f)) return err('dendrogramme : des feuilles vides ou en double')
      const key = set => [...set].sort().join('\u0000')
      const groups = new Map(s.feuilles.map(f => [key([f]), { id: f, leaves: [f], h: 0 }]))
      const resolve = g => {
        const names = Array.isArray(g) ? g.map(x => str(x, 16)) : String(g ?? '').split(/[,;+\s]+/).map(x => x.trim()).filter(Boolean)
        return groups.get(key(new Set(names)))
      }
      s._f = []
      for (const [i, f] of arr(s.fusions).entries()) {
        const g = Array.isArray(f) ? f.slice(0, 2) : arr(f?.groupes), h = Array.isArray(f) ? f[2] : f?.hauteur
        const a = resolve(g[0]), b = resolve(g[1])
        if (!a || !b || a === b) { err(`dendrogramme : fusion ${i + 1} : groupes « ${str(g[0], 30)} » et « ${str(g[1], 30)} » introuvables (déjà fusionnés ?)`); continue }
        if (!finite(h) || numv(h) < 0) { err(`dendrogramme : fusion ${i + 1} : « hauteur » doit être un nombre`); continue }
        const m = { a, b, h: numv(h), leaves: [...a.leaves, ...b.leaves] }
        groups.delete(key(a.leaves)); groups.delete(key(b.leaves)); groups.set(key(m.leaves), m)
        s._f.push(m)
      }
      if (!s._f.length) err('dendrogramme : il faut au moins une fusion { groupes: [a, b], hauteur }')
      s._roots = [...groups.values()]
      s.coupe = finite(s.coupe) ? numv(s.coupe) : null
      s.axe = str(s.axe ?? 'distance', 30)
    },
    render(s, ctx) {
      const order = []
      const walk = g => (g.a ? (walk(g.a), walk(g.b)) : order.push(g.id))
      s._roots.forEach(walk)
      const dx = Math.max(44, ...s.feuilles.map(f => measure(f, FONT) + 18)), PH = 230
      const top = Math.max(...s._f.map(f => f.h), s.coupe ?? 0) * 1.08 || 1
      const { values } = ticks(0, top, 4), Y = h => PH - (h / top) * PH
      const xOf = new Map(order.map((f, i) => [f, 40 + i * dx]))
      const gx = g => (g.a ? (g._x ??= (gx(g.a) + gx(g.b)) / 2) : xOf.get(g.id))
      const gh = g => (g.a ? g.h : 0)
      // Les groupes que la coupe donne : chacun sa teinte sous la coupe
      const hue = new Map()
      if (s.coupe != null) {
        let k = 0
        const mark = (g, c) => { if (c == null && gh(g) <= s.coupe) c = HUES[k++ % HUES.length]; if (c) hue.set(g, c); if (g.a) { mark(g.a, c); mark(g.b, c) } }
        s._roots.forEach(g => mark(g, null))
        s._k = k
      }
      const bb = bbox().add(0, -8, 40 + (order.length - 1) * dx + 40, PH + 40)
      let b = ''
      for (const v of values) { const y = Y(v); b += `<path d="M30,${r(y)} H${r(40 + (order.length - 1) * dx + 20)}" class="s-hair"/>` + text(24, y, num(v), { anchor: 'end', size: SMALL, cls: 's-t3' }) }
      b += text(0, -14, s.axe, { anchor: 'start', size: SMALL, cls: 's-t3' })
      bb.add(0, -22, measure(s.axe, SMALL), 12)
      for (const f of s._f) {
        const xa = gx(f.a), xb = gx(f.b), yf = Y(f.h), c = hue.get(f)
        b += `<path d="M${r(xa)},${r(Y(gh(f.a)))} V${r(yf)} H${r(xb)} V${r(Y(gh(f.b)))}" class="${c ? `s-ln-${c}` : 's-ln'}"/>`
      }
      for (const f of order) {
        const x = xOf.get(f), c = [...hue.entries()].find(([k]) => !k.a && k.id === f)?.[1]
        b += `<circle cx="${r(x)}" cy="${PH}" r="2.5" class="${c ? `s-f-${c}` : 's-ah'}"/>` + text(x, PH + 16, f, { cls: 's-t1' })
      }
      if (s.coupe != null) {
        const y = Y(s.coupe), x1 = 40 + (order.length - 1) * dx + 20, lab = `coupe : ${s._k} groupe${s._k > 1 ? 's' : ''}`
        b += `<path d="M30,${r(y)} H${r(x1)}" class="s-ln-err s-dash"/>` + text(x1 + 6, y, lab, { anchor: 'start', size: SMALL, cls: 's-tc-err' })
        bb.add(x1 + 6, y - 8, measure(lab, SMALL), 16)
      }
      return fit(b, bb)
    },
  })
  return S
})

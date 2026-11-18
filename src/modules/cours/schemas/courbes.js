// Type « courbe » : des lois (normale, binomiale…), des points, un histogramme, une droite, des barres ; une aire
// coloriée sous la courbe (une probabilité), des repères (moyenne, seuil). Les nombres s'écrivent à la française.
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core'))
  else factory(root.Schemas)
})(typeof self !== 'undefined' ? self : this, function (S) {
  const { FONT, SMALL, HUES, measure, wrap, widest, str, arr, norm, finite, numv, num, text, textH, line, bbox, fit, ticks, r } = S
  const PW = 540, PH = 250
  const n = v => (finite(v) ? numv(v) : undefined)
  const lnFact = k => { let s = 0; for (let i = 2; i <= k; i++) s += Math.log(i); return s }
  const pdf = {
    normale: (x, p) => Math.exp(-((x - p.m) ** 2) / (2 * p.s ** 2)) / (p.s * Math.sqrt(2 * Math.PI)),
    uniforme: (x, p) => (x >= p.a && x <= p.b ? 1 / (p.b - p.a) : 0),
    exponentielle: (x, p) => (x < 0 ? 0 : p.l * Math.exp(-p.l * x)),
  }
  const pmf = {
    binomiale: (k, p) => Math.exp(lnFact(p.n) - lnFact(k) - lnFact(p.n - k) + k * Math.log(p.p || 1e-300) + (p.n - k) * Math.log(1 - p.p || 1e-300)),
    poisson: (k, p) => Math.exp(-p.l + k * Math.log(p.l) - lnFact(k)),
  }

  // { type: "courbe", axes?: { x?, y?, xmin?, xmax?, ymin?, ymax? }, series: [
  //     { loi: "normale", moyenne, ecart_type } | { loi: "binomiale", n, p } | { loi: "poisson", lambda } | { loi: "uniforme", a, b }
  //   | { loi: "exponentielle", lambda } | { points: [[x, y], …], trace?: "ligne" | "points" | "barres" | "escalier" }
  //   | { histogramme: { bornes: [0, 10, 20], effectifs: [3, 7] } } | { droite: { pente, origine } }
  //   | { barres: { categories: ["A", "B"], valeurs: [3, 5] } } ] (texte? : son nom dans la légende),
  //   zones?: [{ de?, a?, texte?, serie? }], reperes?: [{ x? | y?, texte? }] }
  S.type({
    name: 'courbe', alias: ['graphique', 'loi', 'fonction', 'histogramme', 'nuage'],
    check(s, err) {
      const ax = s.axes ?? {}
      s.axes = { x: str(ax.x, 50), y: str(ax.y, 40), xmin: n(ax.xmin), xmax: n(ax.xmax), ymin: n(ax.ymin), ymax: n(ax.ymax) }
      s.series = arr(s.series ?? s.serie).slice(0, 5).map((v, i) => {
        const o = { texte: str(v?.texte ?? v?.nom, 40) }, loi = norm(v?.loi)
        if (loi.startsWith('normal')) Object.assign(o, { k: 'pdf', f: 'normale', m: n(v.moyenne ?? v.mu), s: n(v.ecart_type ?? v.sigma) })
        else if (loi.startsWith('unif')) Object.assign(o, { k: 'pdf', f: 'uniforme', a: n(v.a), b: n(v.b) })
        else if (loi.startsWith('expo')) Object.assign(o, { k: 'pdf', f: 'exponentielle', l: n(v.lambda) })
        else if (loi.startsWith('binom')) Object.assign(o, { k: 'pmf', f: 'binomiale', n: n(v.n), p: n(v.p) })
        else if (loi.startsWith('poisson')) Object.assign(o, { k: 'pmf', f: 'poisson', l: n(v.lambda) })
        else if (v?.points) Object.assign(o, { k: 'pts', pts: arr(v.points).map(p => [n(arr(p)[0]), n(arr(p)[1])]), trace: ['ligne', 'points', 'barres', 'escalier'].find(t => norm(v.trace).startsWith(t.slice(0, 4))) ?? 'ligne' })
        else if (v?.histogramme) Object.assign(o, { k: 'hist', bornes: arr(v.histogramme.bornes).map(n), eff: arr(v.histogramme.effectifs).map(n), densite: !!v.histogramme.densite })
        else if (v?.droite) Object.assign(o, { k: 'droite', a: n(v.droite.pente), b: n(v.droite.origine) })
        else if (v?.barres) Object.assign(o, { k: 'bar', cats: arr(v.barres.categories).map(c => str(c, 24)), vals: arr(v.barres.valeurs).map(n) })
        else { err(`courbe : série ${i + 1} : loi, points, histogramme, droite ou barres ?`); return o }
        const bad = Object.entries(o).some(([key, val]) => val === undefined && key !== 'texte')
          || (o.k === 'pts' && (!o.pts.length || o.pts.some(p => p.includes(undefined)))) || (o.f === 'normale' && !(o.s > 0)) || (o.f === 'binomiale' && !(o.n >= 1 && o.n <= 200 && o.p >= 0 && o.p <= 1))
          || (o.f === 'uniforme' && !(o.b > o.a)) || ((o.f === 'exponentielle' || o.f === 'poisson') && !(o.l > 0))
          || (o.k === 'hist' && (o.bornes.length !== o.eff.length + 1 || o.bornes.concat(o.eff).includes(undefined) || o.bornes.some((b, j) => j && b <= o.bornes[j - 1])))
          || (o.k === 'bar' && (!o.cats.length || o.cats.length !== o.vals.length || o.vals.includes(undefined)))
        if (bad) err(`courbe : série ${i + 1} (${o.f ?? o.k}) : paramètres manquants ou faux`)
        return o
      })
      if (!s.series.length) return err('courbe : il faut « series »')
      if (s.series.some(o => o.k === 'bar') && s.series.length > 1) err('courbe : des barres par catégorie se dessinent seules')
      s.zones = arr(s.zones).slice(0, 3).map(z => ({ de: n(z?.de), a: n(z?.a), texte: str(z?.texte, 60), serie: Math.max(0, Math.min(s.series.length - 1, (n(z?.serie) ?? 1) - 1)) }))
      s.reperes = arr(s.reperes).slice(0, 6).map(p => ({ x: n(p?.x), y: n(p?.y), texte: str(p?.texte, 40) })).filter(p => p.x !== undefined || p.y !== undefined)
    },
    render(s, ctx) {
      const bar = s.series[0].k === 'bar'
      // Les bornes naturelles de chaque série, puis celles demandées
      let x0 = Infinity, x1 = -Infinity, y1 = 0, y0 = 0
      const grow = (a, b, c, d = 0) => { x0 = Math.min(x0, a); x1 = Math.max(x1, b); y1 = Math.max(y1, c); y0 = Math.min(y0, d) }
      for (const o of s.series) {
        if (o.f === 'normale') grow(o.m - 3.6 * o.s, o.m + 3.6 * o.s, pdf.normale(o.m, o))
        else if (o.f === 'uniforme') { const pad = (o.b - o.a) * 0.25; grow(o.a - pad, o.b + pad, 1 / (o.b - o.a)) }
        else if (o.f === 'exponentielle') grow(0, 5 / o.l, o.l)
        else if (o.f === 'binomiale') { o.ks = [...Array(o.n + 1).keys()]; grow(-0.6, o.n + 0.6, Math.max(...o.ks.map(k => pmf.binomiale(k, o)))) }
        else if (o.f === 'poisson') { const kmax = Math.ceil(o.l + 4 * Math.sqrt(o.l) + 2); o.ks = [...Array(kmax + 1).keys()]; grow(-0.6, kmax + 0.6, Math.max(...o.ks.map(k => pmf.poisson(k, o)))) }
        else if (o.k === 'pts') { const xs = o.pts.map(p => p[0]), ys = o.pts.map(p => p[1]); grow(Math.min(...xs), Math.max(...xs), Math.max(...ys), Math.min(0, ...ys)) }
        else if (o.k === 'hist') { const w = o.bornes.slice(1).map((b, j) => b - o.bornes[j]); o.hs = o.eff.map((e, j) => (o.densite ? e / w[j] : e)); grow(o.bornes[0], o.bornes[o.bornes.length - 1], Math.max(...o.hs)) }
        else if (o.k === 'bar') grow(0, o.cats.length, Math.max(...o.vals), Math.min(0, ...o.vals))
      }
      for (const o of s.series) if (o.k === 'droite') { if (!Number.isFinite(x0)) grow(0, 10, 0); grow(x0, x1, Math.max(o.a * x0 + o.b, o.a * x1 + o.b), Math.min(0, o.a * x0 + o.b, o.a * x1 + o.b)) }
      for (const p of s.reperes) if (p.x !== undefined) grow(Math.min(x0, p.x), Math.max(x1, p.x), y1)
      if (s.series.some(o => o.k === 'pts') && x1 > x0) { const pad = (x1 - x0) * 0.06; x0 -= pad; x1 += pad; y1 += (y1 - y0) * 0.06 }
      x0 = s.axes.xmin ?? x0; x1 = s.axes.xmax ?? x1; y0 = s.axes.ymin ?? y0; y1 = (s.axes.ymax ?? y1 * 1.12) || 1
      if (!(x1 > x0)) x1 = x0 + 1
      const X = x => ((x - x0) / (x1 - x0)) * PW, Y = y => PH - ((y - y0) / (y1 - y0)) * PH
      const tx = bar ? null : ticks(x0, x1, 6), ty = ticks(y0, y1, 4)
      const bb = bbox().add(0, 0, PW, PH)
      let g = '', a = '', sb = '', ov = ''
      // Grille et axes
      for (const v of ty.values) if (v >= y0 && v <= y1) { g += `<path d="M0,${r(Y(v))} H${PW}" class="s-hair"/>`; ov += text(-8, Y(v), num(v), { anchor: 'end', size: SMALL, cls: 's-t3' }); bb.add(-8 - measure(num(v), SMALL), Y(v) - 7, 1, 14) }
      if (tx) for (const v of tx.values) if (v >= x0 - 1e-9 && v <= x1 + 1e-9) { ov += `<path d="M${r(X(v))},${PH} v4" class="s-axis"/>` + text(X(v), PH + 15, num(v), { size: SMALL, cls: 's-t3' }); bb.add(X(v) - 16, PH, 32, 22) }
      g += `<path d="M0,${r(Y(Math.max(y0, Math.min(y1, 0))))} H${PW}" class="s-axis"/><path d="M0,0 V${PH}" class="s-axis"/>`
      const curve = (o, from = x0, to = x1, N = 180) => { const pts = []; for (let i = 0; i <= N; i++) { const x = from + ((to - from) * i) / N; pts.push([X(x), Y(pdf[o.f](x, o))]) } return pts }
      const pl = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${r(p[0])},${r(p[1])}`).join(' ')
      // Les aires coloriées (sous une loi continue ; sur les barres d'une loi discrète, les barres dedans)
      const inZone = (o, k) => s.zones.some(z => s.series[z.serie] === o && (z.de === undefined || k >= z.de) && (z.a === undefined || k <= z.a))
      s.zones.forEach((z, zi) => {
        const o = s.series[z.serie], c = HUES[s.series.indexOf(o) % HUES.length]
        const from = Math.max(x0, z.de ?? x0), to = Math.min(x1, z.a ?? x1)
        if (o.k === 'pdf' && to > from) {
          const pts = curve(o, from, to, 90)
          a += `<path d="${pl(pts)} L${r(X(to))},${r(Y(0))} L${r(X(from))},${r(Y(0))} Z" class="s-area-${c}"/>`
          for (const xb of [z.de, z.a]) if (xb !== undefined && xb > x0 && xb < x1) a += `<path d="M${r(X(xb))},${r(Y(0))} V${r(Y(pdf[o.f](xb, o)))}" class="s-ln-${c}"/>`
        }
        if (z.texte) {
          // Dans l'aire si elle a la place (le texte coupé à sa largeur), sinon au-dessus de la courbe
          const xm = (from + to) / 2, yTop = o.k === 'pdf' ? Y(pdf[o.f](xm, o)) : Y(y1 * 0.8), aw = X(to) - X(from)
          let ls = wrap(z.texte, Math.max(84, aw - 14), SMALL, { bold: true }), w = widest(ls, SMALL, { bold: true }), h = textH(ls.length, SMALL)
          const inside = o.k === 'pdf' && w <= aw - 8 && h <= (Y(0) - yTop) * 0.62
          if (!inside) { ls = wrap(z.texte, 190, SMALL, { bold: true }); w = widest(ls, SMALL, { bold: true }); h = textH(ls.length, SMALL) }
          const peak = o.k === 'pdf' ? Math.min(...curve(o, Math.max(x0, xm - (x1 - x0) * 0.12), Math.min(x1, xm + (x1 - x0) * 0.12), 24).map(p => p[1])) : yTop
          const ly = inside ? (yTop + Y(0)) / 2 + 4 : Math.max(h / 2 - 30, peak - 14 - h / 2 - zi * (h + 4))
          ov += text(X(xm), ly, ls, { size: SMALL, cls: `s-tc-${c}`, halo: true, bold: true }); bb.add(X(xm) - w / 2, ly - h / 2, w, h)
        }
      })
      // Les séries
      s.series.forEach((o, i) => {
        const c = HUES[i % HUES.length]
        if (o.k === 'pdf') sb += `<path d="${pl(curve(o))}" class="s-ln-${c}"/>`
        else if (o.k === 'pmf') { const bw = Math.min(16, (PW / (x1 - x0)) * 0.55); for (const k of o.ks) { if (k < x0 || k > x1) continue; const y = Y(pmf[o.f](k, o)), hit = inZone(o, k); sb += `<rect x="${r(X(k) - bw / 2)}" y="${r(y)}" width="${r(bw)}" height="${r(Math.max(0, Y(0) - y))}" rx="1" class="${hit ? `s-area-${c} s-b-${c}` : 's-box'}"/>` } }
        else if (o.k === 'hist') o.hs.forEach((h, j) => { const xa = X(o.bornes[j]), xb = X(o.bornes[j + 1]), hit = inZone(o, (o.bornes[j] + o.bornes[j + 1]) / 2); sb += `<rect x="${r(xa)}" y="${r(Y(h))}" width="${r(xb - xa)}" height="${r(Y(0) - Y(h))}" class="${hit ? `s-area-${c} s-b-${c}` : 's-box'}"/>` })
        else if (o.k === 'droite') sb += `<path d="M${r(X(x0))},${r(Y(o.a * x0 + o.b))} L${r(X(x1))},${r(Y(o.a * x1 + o.b))}" class="s-ln-${c}"/>`
        else if (o.k === 'pts') {
          const P = o.pts.map(p => [X(p[0]), Y(p[1])])
          if (o.trace === 'ligne') sb += `<path d="${pl(P)}" class="s-ln-${c}"/>`
          if (o.trace === 'escalier') sb += `<path d="${P.map((p, j) => (j ? `H${r(p[0])} V${r(p[1])}` : `M${r(p[0])},${r(p[1])}`)).join(' ')}" class="s-ln-${c}"/>`
          if (o.trace === 'barres') { const bw = Math.min(18, (PW / Math.max(2, P.length)) * 0.5); P.forEach(p => { sb += `<rect x="${r(p[0] - bw / 2)}" y="${r(Math.min(p[1], Y(0)))}" width="${r(bw)}" height="${r(Math.abs(Y(0) - p[1]))}" rx="1" class="s-area-${c} s-b-${c}"/>` }) }
          if (o.trace === 'points' || o.trace === 'ligne') P.forEach(p => { sb += `<circle cx="${r(p[0])}" cy="${r(p[1])}" r="${o.trace === 'points' ? 3.2 : 2.4}" class="s-f-${c}"/>` })
        } else if (o.k === 'bar') {
          const bw = (PW / o.cats.length) * 0.56
          o.cats.forEach((cat, j) => {
            const xc = X(j + 0.5), y = Y(o.vals[j])
            sb += `<rect x="${r(xc - bw / 2)}" y="${r(Math.min(y, Y(0)))}" width="${r(bw)}" height="${r(Math.abs(Y(0) - y))}" rx="2" class="s-area-${c} s-b-${c}"/>`
            const ls = wrap(cat, PW / o.cats.length - 6, SMALL)
            ov += text(xc, PH + 8 + textH(ls.length, SMALL) / 2, ls, { size: SMALL, cls: 's-t2' }) + text(xc, Math.min(y, Y(0)) - 9, num(o.vals[j]), { size: SMALL, cls: 's-t1' })
            bb.add(xc - bw, PH, bw * 2, 12 + textH(ls.length, SMALL))
          })
        }
      })
      // Les repères : un trait discret et son nom
      for (const p of s.reperes) {
        if (p.x !== undefined && p.x >= x0 && p.x <= x1) { ov += `<path d="M${r(X(p.x))},${PH} V-4" class="s-ln s-dash" style="stroke:var(--s-t3)"/>`; if (p.texte) { ov += text(X(p.x), -12, p.texte, { size: SMALL, cls: 's-t1', halo: true }); bb.add(X(p.x) - measure(p.texte, SMALL) / 2, -20, measure(p.texte, SMALL), 14) } }
        if (p.y !== undefined && p.y >= y0 && p.y <= y1) { ov += `<path d="M0,${r(Y(p.y))} H${PW}" class="s-ln s-dash" style="stroke:var(--s-t3)"/>`; if (p.texte) { ov += text(PW + 6, Y(p.y), p.texte, { anchor: 'start', size: SMALL, cls: 's-t1' }); bb.add(PW + 6, Y(p.y) - 7, measure(p.texte, SMALL), 14) } }
      }
      // Noms des axes, légende
      if (s.axes.y) { ov += text(0, -26, s.axes.y, { anchor: 'start', size: SMALL, cls: 's-t3' }); bb.add(0, -34, measure(s.axes.y, SMALL), 14) }
      if (s.axes.x) { ov += text(PW, PH + 34, s.axes.x, { anchor: 'end', size: SMALL, cls: 's-t3' }); bb.add(PW - measure(s.axes.x, SMALL), PH + 26, measure(s.axes.x, SMALL), 14) }
      const named = s.series.filter(o => o.texte)
      if (named.length && !bar) named.forEach((o, j) => {
        const c = HUES[s.series.indexOf(o) % HUES.length], y = 8 + j * 18, w = measure(o.texte, SMALL)
        ov += `<path d="M${r(PW - w - 30)},${y} h16" class="s-ln-${c}"/>` + text(PW - w - 8, y, o.texte, { anchor: 'start', size: SMALL, cls: 's-t2', halo: true })
      })
      return fit(g + a + sb + ov, bb)
    },
  })
  return S
})

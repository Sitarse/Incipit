// Type « cycle » : un processus qui a une forme — la cascade (des marches), le cycle en V (descente, remontée et ce
// qui vérifie quoi), la boucle (PDCA, itérations), la spirale (Boehm), la frise (des phases sur une durée).
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core'))
  else factory(root.Schemas)
})(typeof self !== 'undefined' ? self : this, function (S) {
  const { FONT, SMALL, CAP, measure, wrap, widest, str, arr, norm, ton, finite, numv, num, item, text, textH, path, line, bbox, fit, r } = S
  const FORMES = ['cascade', 'v', 'boucle', 'spirale', 'frise']
  const phase = v => (v && typeof v === 'object' ? { texte: str(v.texte ?? v.nom, 48), note: str(v.note, 48), ton: ton(v.ton), duree: finite(v.duree) ? numv(v.duree) : undefined } : { texte: str(v, 48), note: '', ton: '' })
  // Une boîte de phase : texte coupé à maxW, note dessous
  const sized = (p, maxW = 170) => { p._l = wrap(p.texte, maxW, FONT); p._n = p.note ? wrap(p.note, maxW, SMALL) : []; p._w = Math.max(widest(p._l, FONT), widest(p._n, SMALL)) + 28; p._h = Math.max(34, textH(p._l.length) + (p._n.length ? textH(p._n.length, SMALL) + 3 : 0) + 14); return p }
  function drawPhase(p, x, y, w, h) {
    const tc = p.ton && p.ton !== 'dim' ? `s-tc-${p.ton}` : p.ton === 'dim' ? 's-t3' : 's-t1'
    const th = textH(p._l.length), nh = p._n.length ? textH(p._n.length, SMALL) + 3 : 0, top = y + (h - th - nh) / 2
    return item(x, y, w, h, p.ton) + text(x + w / 2, top + th / 2, p._l, { cls: tc }) + (nh ? text(x + w / 2, top + th + 3 + (nh - 3) / 2, p._n, { size: SMALL, cls: 's-t3' }) : '')
  }

  // { type: "cycle", forme: "cascade", phases: ["Besoins", …], retours?: true }
  // { type: "cycle", forme: "v", paires: [["Besoins", "Recette", "plan de recette"?], …], bas?: "Codage", titres?: ["Conception", "Validation"], lien? }
  // { type: "cycle", forme: "boucle", phases: ["Planifier", "Faire", "Vérifier", "Agir"], centre? }
  // { type: "cycle", forme: "spirale", quadrants: [4 noms, dans le sens des aiguilles d'une montre depuis le haut à gauche], tours?: 3, jalons?: ["Prototype 1", …] }
  // { type: "cycle", forme: "frise", phases: [{ texte, duree? }], unite?: "semaines", jalons?: [{ a: 6, texte }] }
  S.type({
    name: 'cycle', alias: ['processus', 'cycle-de-vie', 'cascade', 'cycle-en-v', 'spirale', 'frise', 'boucle'],
    check(s, err) {
      const f = norm(s.forme ?? s._as).replace(/^cycle-en-/, '').replace(/^cycle-de-vie$/, '')
      s.forme = FORMES.find(k => f === k || f.startsWith(k)) ?? (s.paires ? 'v' : s.quadrants ? 'spirale' : null)
      if (!s.forme) return err(`cycle : « forme » parmi ${FORMES.join(', ')}`)
      if (s.forme === 'v') {
        s.paires = arr(s.paires).map(p => (Array.isArray(p) ? { g: phase(p[0]), d: phase(p[1]), lien: str(p[2], 40) } : { g: phase(p?.gauche), d: phase(p?.droite), lien: str(p?.lien, 40) }))
        if (s.paires.length < 2 || s.paires.length > 5) return err('cycle en V : de 2 à 5 « paires » [gauche, droite]')
        if (s.paires.some(p => !p.g.texte || !p.d.texte)) err('cycle en V : une paire incomplète')
        s.bas = s.bas ? phase(s.bas) : null; s.lien = str(s.lien, 40); s.titres = arr(s.titres).map(t => str(t, 30))
      } else if (s.forme === 'spirale') {
        s.quadrants = arr(s.quadrants).map(q => str(q, 60))
        if (s.quadrants.length !== 4 || s.quadrants.some(q => !q)) return err('spirale : il faut 4 « quadrants »')
        s.tours = Math.max(1, Math.min(4, Math.round(finite(s.tours) ? numv(s.tours) : 3))); s.jalons = arr(s.jalons).slice(0, s.tours).map(j => str(j, 30))
      } else {
        s.phases = arr(s.phases).map(phase)
        const [lo, hi] = s.forme === 'frise' ? [2, 10] : s.forme === 'boucle' ? [3, 8] : [2, 8]
        if (s.phases.length < lo || s.phases.length > hi) return err(`cycle ${s.forme} : de ${lo} à ${hi} « phases »`)
        if (s.phases.some(p => !p.texte)) err(`cycle ${s.forme} : une phase sans texte`)
        s.retours = !!s.retours; s.centre = str(s.centre, 40); s.unite = str(s.unite, 20)
        s.jalons = arr(s.jalons).slice(0, 6).map(j => ({ a: finite(j?.a) ? numv(j.a) : undefined, texte: str(j?.texte, 30) })).filter(j => j.a !== undefined)
        if (s.forme === 'frise' && s.phases.some(p => p.duree !== undefined) && s.phases.some(p => !(p.duree > 0))) err('frise : une « duree » pour chaque phase, ou pour aucune')
      }
    },
    render(s, ctx) { return F[s.forme](s, ctx) },
  })

  const F = {
    cascade(s, ctx) {
      const ps = s.phases.map(p => sized(p)), w = Math.max(...ps.map(p => p._w)), h = Math.max(...ps.map(p => p._h)), dx = w * 0.7, dy = h + 20
      const bb = bbox()
      let b = '', l = ''
      ps.forEach((p, i) => {
        const x = i * dx, y = i * dy
        b += drawPhase(p, x, y, w, h); bb.add(x, y, w, h)
        if (i < ps.length - 1) {
          l += line(path([[x + w, y + h / 2], [x + dx + w / 2, y + h / 2], [x + dx + w / 2, y + dy - 2]], 7), ctx)
          if (s.retours) l += line(path([[x + dx, y + dy + h / 2 + 6], [x + w / 2, y + dy + h / 2 + 6], [x + w / 2, y + h + 2]], 7), ctx, { dash: true, head: 'open' })
        }
      })
      return fit(l + b, bb)
    },
    v(s, ctx) {
      const all = s.paires.flatMap(p => [p.g, p.d]).concat(s.bas ? [s.bas] : []).map(p => sized(p, 150))
      const w = Math.max(...all.map(p => p._w)), h = Math.max(...all.map(p => p._h)), n = s.paires.length, dy = h + 24
      // Serré pour tenir dans la colonne du PDF : un niveau décale d'un peu moins d'une demi-boîte, et l'écart de la
      // paire du bas (la plus serrée) laisse tout juste la place à son nom
      const dx = Math.max(0.3 * w + 18, 0.42 * w), G = Math.max(70, widest(wrap(s.paires[n - 1].lien || s.lien, 130, SMALL), SMALL) + 24)
      const W = 2 * w + 2 * (n - 1) * dx + G, bb = bbox()
      const L = i => ({ x: i * dx, y: i * dy }), R = i => ({ x: W - w - i * dx, y: i * dy })
      let b = '', l = '', t = ''
      s.paires.forEach((p, i) => {
        const a = L(i), c = R(i)
        b += drawPhase(p.g, a.x, a.y, w, h) + drawPhase(p.d, c.x, c.y, w, h); bb.add(a.x, a.y, w, h).add(c.x, c.y, w, h)
        // Ce qui vérifie quoi : un trait horizontal en pointillés, son nom au-dessus
        const lien = p.lien || s.lien
        l += line(`M${r(a.x + w + 4)},${r(a.y + h / 2)} L${r(c.x - 4)},${r(c.y + h / 2)}`, ctx, { dash: true, head: '' })
        if (lien) { const ls = wrap(lien, Math.min(150, c.x - a.x - w - 14), SMALL); t += text((a.x + w + c.x) / 2, a.y + h / 2 - 6 - textH(ls.length, SMALL) / 2, ls, { size: SMALL, cls: 's-t3', halo: true }) }
        if (i < n - 1) {
          const a2 = L(i + 1), c2 = R(i + 1)
          l += line(path([[a.x + w * 0.3, a.y + h], [a.x + w * 0.3, a2.y + h / 2], [a2.x - 2, a2.y + h / 2]], 7), ctx)
          l += line(path([[c2.x + w, c2.y + h / 2], [c.x + w * 0.7, c2.y + h / 2], [c.x + w * 0.7, c.y + h + 2]], 7), ctx)
        }
      })
      const a = L(n - 1), c = R(n - 1)
      if (s.bas) {
        const bx = (W - w) / 2, by = n * dy
        b += drawPhase(s.bas, bx, by, w, h); bb.add(bx, by, w, h)
        l += line(path([[a.x + w * 0.3, a.y + h], [a.x + w * 0.3, by + h / 2], [bx - 2, by + h / 2]], 7), ctx)
        l += line(path([[bx + w, by + h / 2], [c.x + w * 0.7, by + h / 2], [c.x + w * 0.7, c.y + h + 2]], 7), ctx)
      }
      if (s.titres[0]) { t += text(0, -14, s.titres[0].toUpperCase(), { anchor: 'start', size: CAP, caps: true, mono: true, cls: 's-t3' }); bb.add(0, -22, 10, 10) }
      if (s.titres[1]) t += text(W, -14, s.titres[1].toUpperCase(), { anchor: 'end', size: CAP, caps: true, mono: true, cls: 's-t3' })
      return fit(l + b + t, bb)
    },
    boucle(s, ctx) {
      const ps = s.phases.map(p => sized(p, 140)), n = ps.length, w = Math.max(...ps.map(p => p._w)), h = Math.max(...ps.map(p => p._h))
      const R = Math.max(120, (n * (w + 30)) / (2 * Math.PI)), bb = bbox()
      const at = i => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [R * Math.cos(a), R * Math.sin(a), a] }
      let b = '', l = ''
      const half = Math.atan2(Math.hypot(w, h) / 2 + 6, R) // l'angle couvert par une demi-boîte
      ps.forEach((p, i) => {
        const [x, y] = at(i)
        b += drawPhase(p, x - w / 2, y - h / 2, w, h); bb.add(x - w / 2, y - h / 2, w, h)
        const a0 = at(i)[2] + half, a1 = at(i + 1)[2] - half
        if (a1 > a0) l += line(`M${r(R * Math.cos(a0))},${r(R * Math.sin(a0))} A${r(R)},${r(R)} 0 0 1 ${r(R * Math.cos(a1))},${r(R * Math.sin(a1))}`, ctx)
      })
      if (s.centre) b += text(0, 0, wrap(s.centre, R * 0.9, FONT), { cls: 's-t3' })
      return fit(l + b, bb)
    },
    spirale(s, ctx) {
      const R = 175, r0 = 16, turns = s.tours, k = (R - r0) / (turns * 2 * Math.PI), bb = bbox().add(-R - 10, -R - 10, 2 * R + 20, 2 * R + 20)
      let b = `<path d="M${-R},0 H${R} M0,${-R} V${R}" class="s-hair"/>`
      const pts = []
      for (let i = 0; i <= turns * 120; i++) { const t = (i / 120) * 2 * Math.PI, rr = r0 + k * t, a = Math.PI + t; pts.push(`${i ? 'L' : 'M'}${r(rr * Math.cos(a))},${r(rr * Math.sin(a))}`) }
      b += line(pts.join(' '), ctx, { ton: 'acc' })
      for (let j = 1; j <= turns; j++) {
        const rr = r0 + k * j * 2 * Math.PI, lab = s.jalons[j - 1]
        b += `<circle cx="${r(-rr)}" cy="0" r="3" class="s-f-acc"/>`
        // un jalon sur deux au-dessus de l'axe : deux voisins ne se chevauchent pas
        if (lab) b += text(-rr, j % 2 ? -11 : 14, lab, { size: SMALL, cls: 's-t2', halo: true })
      }
      const corner = [[-R, -R, 'start'], [R, -R, 'end'], [R, R, 'end'], [-R, R, 'start']]
      s.quadrants.forEach((q, i) => {
        const [x, y, anchor] = corner[i], ls = wrap(q, 150, FONT), hh = textH(ls.length)
        const yy = y < 0 ? y + hh / 2 : y - hh / 2
        b += text(x, yy, ls, { anchor, cls: 's-t1' }) + text(x + (anchor === 'start' ? 0 : 0), yy - hh / 2 - 9, `${i + 1}`, { anchor, size: CAP, mono: true, cls: 's-t3' })
        bb.add(anchor === 'start' ? x : x - 150, yy - hh / 2 - 18, 150, hh + 18)
      })
      return fit(b, bb)
    },
    frise(s, ctx) {
      const ps = s.phases.map(p => sized(p, 150)), TW = Math.max(640, ps.reduce((t, p) => t + p._w + 6, 0)), h = Math.max(...ps.map(p => p._h))
      const durs = ps.every(p => p.duree > 0), tot = durs ? ps.reduce((t, p) => t + p.duree, 0) : ps.length
      const X = v => (v / tot) * TW, bb = bbox().add(0, 0, TW, h + 40)
      let b = `<path d="M0,${r(h + 12)} H${r(TW)}" class="s-axis"/>`, acc = 0
      const marks = [] // [x, texte, ancrage] des graduations
      ps.forEach((p, i) => {
        const x = X(acc), w = X(durs ? p.duree : 1) - 4
        if (p._w <= w + 4) b += drawPhase(p, x + 2, 0, w, h)
        else { const t = p._l.join(' '), tw = measure(t, SMALL); b += item(x + 2, 0, w, h, p.ton) + text(x + 2 + w / 2, -12, t, { size: SMALL, cls: 's-t1' }); bb.add(x + 2 + w / 2 - tw / 2, -20, tw, 12) }
        b += `<path d="M${r(x)},${r(h + 8)} v8" class="s-axis"/>`
        marks.push([x, num(acc), 'middle'])
        acc += durs ? p.duree : 1
        if (i === ps.length - 1) { b += `<path d="M${r(TW)},${r(h + 8)} v8" class="s-axis"/>`; marks.push([TW, `${num(acc)}${s.unite ? ` ${s.unite}` : ''}`, 'end']) }
      })
      // Une graduation qui chevaucherait la suivante se tait (la dernière, avec l'unité, parle toujours)
      if (durs) {
        let left = Infinity
        for (const [x, t, anchor] of marks.reverse()) {
          const w = measure(t, SMALL), x0 = anchor === 'end' ? x - w : x - w / 2
          if (x0 + w + 6 > left) continue
          b += text(x, h + 26, t, { size: SMALL, cls: 's-t3', anchor }); left = x0
        }
      }
      for (const j of s.jalons) {
        const x = X(Math.max(0, Math.min(tot, j.a)))
        b += `<path d="M${r(x)},${r(h + 6)} l6,6 l-6,6 l-6,-6 z" class="s-f-err"/>` + text(x, h + 44, j.texte, { size: SMALL, cls: 's-tc-err', halo: true })
        bb.add(x - 60, h + 36, 120, 16)
      }
      return fit(b, bb)
    },
  }
  return S
})

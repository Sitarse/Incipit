// Type « zones » : des zones titrées (un moteur, un serveur, une file d'attente…) qui contiennent des éléments, et des
// flèches qui disent ce qui passe de l'un à l'autre. Le schéma du moteur JavaScript de laConsole, en calme. Il peut se
// construire pas à pas (« etapes » : ce qui apparaît à chaque étape).
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core'))
  else factory(root.Schemas)
})(typeof self !== 'undefined' ? self : this, function (S) {
  const { FONT, SMALL, CAP, MONO, measure, wrap, widest, looksCode, str, arr, norm, ton, item, rect, text, textH, icon, hasIcon, path, line, bbox, fit } = S
  const HEAD = 32, PAD = 12, EG = 8, EGL = 40, HG = 72, VG = 60, MAXT = 200

  // { type: "zones", zones: [{ id?, titre?, icone?, sens?: "ligne", elements: ["fetch", { id?, texte, icone?, note?, ton? }] }],
  //   liens?: [{ de, vers, texte?, ton?, pointille?, double? }], disposition?: [["a", "b"], ["", "c"]],
  //   etapes?: [{ montrer: [ids], legende? }] }
  S.type({
    name: 'zones', alias: ['architecture', 'flux', 'blocs'],
    check(s, err) {
      s.zones = arr(s.zones).map((z, i) => ({ id: str(z?.id ?? z?.titre ?? `zone${i + 1}`, 40), titre: str(z?.titre, 40), icone: str(z?.icone, 24),
        sens: norm(z?.sens) === 'ligne' ? 'ligne' : 'colonne', elements: arr(z?.elements).map(e => (e && typeof e === 'object'
          ? { id: str(e.id ?? e.texte ?? e.nom, 48), texte: str(e.texte ?? e.nom, 60), icone: str(e.icone, 24), note: str(e.note, 60), ton: ton(e.ton) }
          : { id: str(e, 48), texte: str(e, 60), icone: '', note: '', ton: '' })) }))
      if (!s.zones.length) return err('zones : il faut au moins une zone')
      if (s.zones.length > 6) err('zones : 6 zones au plus')
      const els = s.zones.flatMap(z => z.elements)
      if (s.zones.some(z => z.elements.length > 8) || els.length > 24) err('zones : 8 éléments par zone, 24 en tout au plus')
      if (s.zones.some(z => !z.elements.length && !z.titre)) err('zones : une zone sans titre ni élément')
      if (els.some(e => !e.texte)) err('zones : un élément sans texte')
      // Un nom désigne une zone ou un élément : par son id, son texte, ou son texte sans accents ni majuscules
      const find = q => {
        const k = str(q, 60), n = norm(k)
        return s.zones.find(z => z.id === k) ?? els.find(e => e.id === k) ?? els.find(e => e.texte === k) ?? s.zones.find(z => z.titre === k)
          ?? els.find(e => norm(e.texte) === n) ?? s.zones.find(z => norm(z.titre) === n || norm(z.id) === n)
      }
      s._find = find
      s.liens = arr(s.liens).map(l => ({ de: find(l?.de), vers: find(l?.vers), dq: str(l?.de, 40), vq: str(l?.vers, 40), texte: str(l?.texte, 60), ton: ton(l?.ton), dash: !!(l?.pointille ?? l?.pointilles), double: !!l?.double }))
      if (s.liens.length > 12) err('zones : 12 liens au plus')
      for (const l of s.liens) if (!l.de || !l.vers) err(`zones : lien « ${l.dq} → ${l.vq} » : ${!l.de ? l.dq : l.vq} n'existe pas`)
      if (s.disposition) {
        s.disposition = arr(s.disposition).map(row => arr(row).map(id => (id ? s.zones.find(z => z.id === str(id, 40) || norm(z.titre) === norm(id)) ?? null : null)))
        const placed = s.disposition.flat().filter(Boolean)
        if (placed.length !== s.zones.length || new Set(placed).size !== placed.length) err('zones : « disposition » doit placer chaque zone une fois')
      }
      s.etapes = arr(s.etapes).map(e => ({ montrer: arr(e?.montrer).map(find), q: arr(e?.montrer), legende: str(e?.legende, 160) }))
      if (s.etapes.length > 8) err('zones : 8 étapes au plus')
      s.etapes.forEach((e, i) => e.montrer.forEach((m, j) => { if (!m) err(`zones : étape ${i + 1} : « ${str(e.q[j], 40)} » n'existe pas`) }))
    },
    steps: s => s.etapes.length || 1,
    captions: s => s.etapes.map(e => e.legende),
    render(s, ctx) {
      const code = e => looksCode(e.texte)
      // Ce qui est visible à cette étape : tout pour l'image fixe ; ce qui est montré jusqu'ici pour le lecteur
      const shown = new Set()
      if (ctx.step == null || !s.etapes.length) s.zones.forEach(z => { shown.add(z); z.elements.forEach(e => shown.add(e)) })
      else for (const e of s.etapes.slice(0, ctx.step + 1)) for (const m of e.montrer) { shown.add(m); if (m.elements) m.elements.forEach(x => shown.add(x)) }
      const zoneOf = new Map(s.zones.flatMap(z => z.elements.map(e => [e, z])))
      const inner = new Set(s.liens.filter(l => zoneOf.get(l.de) && zoneOf.get(l.de) === zoneOf.get(l.vers)).map(l => zoneOf.get(l.de)))
      // Tailles : éléments, puis zones
      for (const z of s.zones) {
        for (const e of z.elements) {
          const size = code(e) ? MONO : FONT, lines = wrap(e.texte, MAXT, size, { mono: code(e) }), nl = e.note ? wrap(e.note, MAXT, SMALL) : []
          const ic = hasIcon(e.icone) ? 24 : 0
          e._l = lines; e._n = nl; e._size = size
          e._w = Math.max(64, ic + Math.max(widest(lines, size, { mono: code(e) }), widest(nl, SMALL)) + 28)
          e._h = Math.max(32, textH(lines.length, size) + (nl.length ? textH(nl.length, SMALL) + 4 : 0) + 16)
        }
        const g = inner.has(z) ? EGL : EG, ws = z.elements.map(e => e._w), hs = z.elements.map(e => e._h)
        if (z.sens === 'colonne') { const w = Math.max(0, ...ws); z.elements.forEach(e => { e._w = w }) }
        const cw = z.sens === 'ligne' ? ws.reduce((a, b) => a + b, 0) + g * Math.max(0, ws.length - 1) : Math.max(0, ...ws)
        const ch = z.sens === 'ligne' ? Math.max(0, ...hs) : hs.reduce((a, b) => a + b, 0) + g * Math.max(0, hs.length - 1)
        const head = z.titre || hasIcon(z.icone) ? HEAD : PAD
        const hw = (hasIcon(z.icone) ? 24 : 0) + measure(z.titre.toUpperCase(), CAP, { caps: true, mono: true })
        z._w = Math.max(cw, hw) + 2 * PAD; z._h = head + ch + (z.elements.length ? PAD : 0); z._head = head; z._g = g
      }
      // La grille : la disposition donnée, sinon trois zones par ligne au plus
      const grid = s.disposition ?? (n => { const per = n <= 3 ? n : n === 4 ? 2 : 3, out = []; s.zones.forEach((z, i) => (out[Math.floor(i / per)] ??= []).push(z)); return out })(s.zones.length)
      const cols = Math.max(...grid.map(r => r.length)), colW = Array(cols).fill(0), rowH = grid.map(() => 0)
      grid.forEach((row, i) => row.forEach((z, j) => { if (z) { colW[j] = Math.max(colW[j], z._w); rowH[i] = Math.max(rowH[i], z._h) } }))
      let y = 0
      grid.forEach((row, i) => {
        let x = 0
        row.forEach((z, j) => { if (z) { z._x = x + (colW[j] - z._w) / 2; z._y = y } x += colW[j] + HG })
        y += rowH[i] + VG
      })
      // Les éléments dans leur zone
      for (const z of s.zones) {
        let x = z._x + PAD, yy = z._y + z._head
        for (const e of z.elements) {
          e._x = z.sens === 'colonne' ? z._x + (z._w - e._w) / 2 : x; e._y = yy
          if (z.sens === 'ligne') x += e._w + z._g; else yy += e._h + z._g
        }
      }
      const box = o => ({ x: o._x, y: o._y, w: o._w, h: o._h })
      const bb = bbox()
      let zb = '', eb = '', lb = '', tb = ''
      for (const z of s.zones) {
        if (!shown.has(z) && !z.elements.some(e => shown.has(e))) continue
        bb.add(z._x, z._y, z._w, z._h)
        zb += rect(z._x, z._y, z._w, z._h, 's-zone', 6)
        const ic = hasIcon(z.icone)
        if (ic) zb += icon(z.icone, z._x + PAD, z._y + 9, 15)
        if (z.titre) zb += text(z._x + PAD + (ic ? 22 : 0), z._y + 17, z.titre.toUpperCase(), { anchor: 'start', size: CAP, caps: true, mono: true, cls: 's-t3' })
        for (const e of z.elements) {
          if (!shown.has(e)) continue
          const ic2 = hasIcon(e.icone) ? 24 : 0, tc = e.ton === 'dim' ? 's-t3' : 's-t1'
          eb += item(e._x, e._y, e._w, e._h, e.ton)
          if (ic2) eb += icon(e.icone, e._x + 11, e._y + e._h / 2 - 8, 16, e.ton && e.ton !== 'dim' ? `s-ic-${e.ton}` : 's-ic')
          const cx = e._x + ic2 / 2 + e._w / 2, th = textH(e._l.length, e._size), nh = e._n.length ? textH(e._n.length, SMALL) + 4 : 0
          const top = e._y + (e._h - th - nh) / 2
          eb += text(cx, top + th / 2, e._l, { cls: tc, mono: code(e), size: e._size })
          if (nh) eb += text(cx, top + th + 4 + (nh - 4) / 2, e._n, { size: SMALL, cls: e.ton && e.ton !== 'dim' ? `s-tc-${e.ton}` : 's-t3' })
        }
      }
      // Les liens : par le côté qui fait face, en équerre ; entre deux éléments d'une même zone, en ligne droite s'ils
      // se suivent, sinon par la droite de la zone
      const visible = o => shown.has(o) || (o.elements && o.elements.some(e => shown.has(e)))
      let lane = 0
      for (const l of s.liens) {
        if (!visible(l.de) || !visible(l.vers)) continue
        const A = box(l.de), B = box(l.vers), z = zoneOf.get(l.de)
        const ax = A.x + A.w / 2, ay = A.y + A.h / 2, bx = B.x + B.w / 2, by = B.y + B.h / 2
        const ox = A.x < B.x + B.w && B.x < A.x + A.w, oy = A.y < B.y + B.h && B.y < A.y + A.h
        let pts, lab
        const same = z && z === zoneOf.get(l.vers), adj = same && Math.abs(z.elements.indexOf(l.de) - z.elements.indexOf(l.vers)) === 1
        if (same && !adj) {
          const xr = z._x + z._w + 16 + 10 * (lane++ % 3)
          pts = [[A.x + A.w, ay], [xr, ay], [xr, by], [B.x + B.w, by]]; lab = [xr, (ay + by) / 2, 'v']
        } else if (!ox && (oy || Math.abs(bx - ax) >= Math.abs(by - ay))) {
          const sx = bx > ax ? A.x + A.w : A.x, ex = bx > ax ? B.x : B.x + B.w
          if (oy) { const yy = (Math.max(A.y, B.y) + Math.min(A.y + A.h, B.y + B.h)) / 2; pts = [[sx, yy], [ex, yy]]; lab = [(sx + ex) / 2, yy, 'h'] }
          else { const mx = (sx + ex) / 2; pts = [[sx, ay], [mx, ay], [mx, by], [ex, by]]; lab = [mx, (ay + by) / 2, 'v'] }
        } else {
          const sy = by > ay ? A.y + A.h : A.y, ey = by > ay ? B.y : B.y + B.h
          if (ox) { const xx = (Math.max(A.x, B.x) + Math.min(A.x + A.w, B.x + B.w)) / 2; pts = [[xx, sy], [xx, ey]]; lab = [xx, (sy + ey) / 2, 'v'] }
          else { const my = (sy + ey) / 2; pts = [[ax, sy], [ax, my], [bx, my], [bx, ey]]; lab = [(ax + bx) / 2, my, 'h'] }
        }
        // Les pointes ne touchent pas tout à fait les boîtes
        const shorten = (p, q, d) => { const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [q[0] - ((q[0] - p[0]) / L) * d, q[1] - ((q[1] - p[1]) / L) * d] }
        pts[pts.length - 1] = shorten(pts[pts.length - 2], pts[pts.length - 1], 2)
        if (l.double) pts[0] = shorten(pts[1], pts[0], 2)
        pts.forEach(p => bb.add(p[0], p[1]))
        lb += line(path(pts, 8), ctx, { ton: l.ton, dash: l.dash, start: l.double ? `ah${l.ton && l.ton !== 'dim' ? `-${l.ton}` : ''}` : undefined })
        if (l.texte) {
          const ls = wrap(l.texte, lab[2] === 'v' ? 150 : 170, SMALL), w = widest(ls, SMALL), h = textH(ls.length, SMALL)
          const tc = l.ton && l.ton !== 'dim' ? `s-tc-${l.ton}` : 's-t3'
          if (lab[2] === 'h') { tb += text(lab[0], lab[1] - 6 - h / 2, ls, { size: SMALL, cls: tc, halo: true }); bb.add(lab[0] - w / 2, lab[1] - 8 - h, w, h) }
          else { tb += text(lab[0] + 8, lab[1], ls, { size: SMALL, cls: tc, anchor: 'start', halo: true }); bb.add(lab[0] + 8, lab[1] - h / 2, w, h) }
        }
      }
      return fit(zb + lb + eb + tb, bb)
    },
  })
  return S
})

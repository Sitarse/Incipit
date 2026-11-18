// Types « pile » (une pile qui se remplit et se vide, étape par étape) et « memoire » (variables de la pile, objets du
// tas, et les flèches des références, à la manière de Python Tutor).
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core'))
  else factory(root.Schemas)
})(typeof self !== 'undefined' ? self : this, function (S) {
  const { FONT, SMALL, CAP, MONO, measure, wrap, widest, looksCode, str, arr, ton, item, rect, text, textH, path, line, r } = S
  const capsW = t => measure(String(t).toUpperCase(), CAP, { caps: true })

  // ---------------------------------------------------------------- pile
  // { type: "pile", nom?: "Pile d'appels", etapes: [{ pile: ["main()", { texte, note?, ton? }] (du bas vers le haut),
  //   legende?, sortie? (ce que le programme affiche) }] }
  const FH = 30, FG = 6
  S.type({
    name: 'pile', alias: ['stack', 'pile-appels'],
    check(s, err) {
      if (!s.etapes && s.pile) s.etapes = [{ pile: s.pile, legende: s.legende, sortie: s.sortie }]
      s.etapes = arr(s.etapes)
      if (!s.etapes.length) return err('pile : il faut « etapes » (ou « pile »)')
      if (s.etapes.length > 6) return err('pile : 6 étapes au plus')
      s.nom = str(s.nom ?? 'Pile', 30)
      s.etapes.forEach((e, i) => {
        const p = arr(e?.pile)
        if (p.length > 8) err(`pile : 8 cadres au plus (étape ${i + 1})`)
        e.pile = p.map(f => (f && typeof f === 'object' ? { texte: str(f.texte ?? f.nom, 40), note: str(f.note, 32), ton: ton(f.ton) } : { texte: str(f, 40), note: '', ton: '' }))
        if (e.pile.some(f => !f.texte)) err(`pile : un cadre sans texte (étape ${i + 1})`)
        e.legende = str(e.legende, 160); e.sortie = str(e.sortie, 60)
      })
    },
    steps: s => s.etapes.length,
    captions: s => s.etapes.map(e => e.legende),
    render(s, ctx) {
      const all = s.etapes.flatMap(e => e.pile), code = all.some(f => looksCode(f.texte))
      const tw = f => measure(f.texte, code ? MONO : FONT, { mono: code }) + (f.note ? 14 + measure(f.note, SMALL) : 0)
      const fw = Math.max(132, Math.ceil(Math.max(...all.map(tw), 0) + 30))
      const cap = Math.max(1, ...s.etapes.map(e => e.pile.length)), inner = cap * (FH + FG) + FG
      const cw = fw + 16 // la pile : ouverte en haut, deux parois et un fond
      const stack = (e, x, y) => {
        let b = path([[x, y], [x, y + inner], [x + cw, y + inner], [x + cw, y]], 3).replace(/^/, '<path d="') + '" class="s-axis"/>'
        e.pile.forEach((f, i) => {
          const fy = y + inner - (i + 1) * (FH + FG), fx = x + 8, t = f.ton
          b += item(fx, fy, fw, FH, t)
          const tc = t === 'dim' ? 's-t3' : 's-t1'
          if (f.note) {
            b += text(fx + 14, fy + FH / 2, f.texte, { anchor: 'start', cls: tc, mono: code, size: code ? MONO : FONT })
            b += text(fx + fw - 10, fy + FH / 2, f.note, { anchor: 'end', size: SMALL, cls: t && t !== 'dim' ? `s-tc-${t}` : 's-t3' })
          } else b += text(fx + fw / 2, fy + FH / 2, f.texte, { cls: tc, mono: code, size: code ? MONO : FONT })
        })
        return b
      }
      const out = (e, x, y, w) => (e.sortie ? text(x, y + 9, `› ${e.sortie}`, { anchor: 'start', mono: true, size: MONO - 1, cls: 's-t1' }) : '')
      // Une étape (le lecteur) : le nom au-dessus, la pile, ce qu'affiche le programme dessous
      if (ctx.step != null || s.etapes.length === 1) {
        const e = s.etapes[ctx.step ?? 0]
        let b = text(0, 6, s.nom.toUpperCase(), { anchor: 'start', size: CAP, caps: true, mono: true, cls: 's-t3' })
        b += stack(e, 0, 20)
        const h = 20 + inner + (e.sortie ? 26 : 0)
        b += e.sortie ? out(e, 0, 20 + inner + 10) : ''
        return { w: Math.max(cw, e.sortie ? measure(`› ${e.sortie}`, MONO - 1, { mono: true }) : 0), h, body: b }
      }
      // L'image fixe : toutes les étapes côte à côte, numérotées, la légende sous chacune
      const n = s.etapes.length, perRow = n <= 4 ? n : Math.ceil(n / 2), colW = Math.max(cw, 150), gap = 44
      const legs = s.etapes.map(e => wrap(e.legende, colW, SMALL)), legH = Math.max(...legs.map(l => (l[0] ? textH(l.length, SMALL) : 0)))
      const outH = s.etapes.some(e => e.sortie) ? 24 : 0, rowH = 22 + inner + 12 + legH + outH + 10
      let b = ''
      s.etapes.forEach((e, i) => {
        const row = Math.floor(i / perRow), col = i % perRow, x = col * (colW + gap), y = row * (rowH + 18)
        const sx = x + (colW - cw) / 2
        b += text(sx, y + 6, `${i + 1}`, { anchor: 'start', size: CAP, mono: true, cls: 's-t3' }) + (i === 0 ? text(sx + 14, y + 6, s.nom.toUpperCase(), { anchor: 'start', size: CAP, caps: true, mono: true, cls: 's-t3' }) : '')
        b += stack(e, sx, y + 20)
        if (legs[i][0]) b += text(x + colW / 2, y + 20 + inner + 12 + textH(legs[i].length, SMALL) / 2, legs[i], { size: SMALL, cls: 's-t2' })
        if (e.sortie) b += out(e, sx, y + 20 + inner + 12 + legH + 4)
        if (col < perRow - 1 && i < n - 1) {
          const ax = x + colW + 10, ay = y + 20 + inner / 2
          b += line(`M${r(ax)},${r(ay)} L${r(ax + gap - 20)},${r(ay)}`, ctx)
        }
      })
      const rows = Math.ceil(n / perRow)
      return { w: perRow * colW + (perRow - 1) * gap, h: rows * rowH + (rows - 1) * 18, body: b }
    },
  })

  // ---------------------------------------------------------------- memoire
  // { type: "memoire", zones?: ["Pile", "Tas"], cadre?: "main()", etapes: [{ variables: [{ nom, valeur? | vers?: id, ton? }],
  //   objets: [{ id, classe?, champs?: [["solde", "10"], { nom, valeur? | vers? }], ton? }], legende? }] }
  const RH = 28, RG = 6, OH = 26, FRH = 22
  S.type({
    name: 'memoire', alias: ['memory', 'pile-tas', 'tas'],
    check(s, err) {
      if (!s.etapes && (s.variables || s.objets)) s.etapes = [{ variables: s.variables, objets: s.objets, legende: s.legende }]
      s.etapes = arr(s.etapes)
      if (!s.etapes.length) return err('memoire : il faut « etapes » (ou « variables » et « objets »)')
      if (s.etapes.length > 8) return err('memoire : 8 étapes au plus')
      const z = arr(s.zones)
      s.zones = [str(z[0] ?? 'Pile', 24), str(z[1] ?? 'Tas', 24)]
      s.cadre = str(s.cadre, 40)
      const ref = v => (v && typeof v === 'object' ? v : null)
      s.etapes.forEach((e, i) => {
        e.legende = str(e.legende, 160)
        e.objets = arr(e.objets).map(o => ({ id: str(o?.id ?? o?.nom, 24), classe: str(o?.classe ?? o?.type, 32), ton: ton(o?.ton),
          champs: arr(o?.champs).map(c => (Array.isArray(c) ? { nom: str(c[0], 24), valeur: str(c[1], 28) } : { nom: str(ref(c)?.nom, 24), valeur: str(ref(c)?.valeur, 28), vers: ref(c)?.vers === undefined ? undefined : ref(c).vers === null ? null : str(ref(c).vers, 24) })) }))
        e.variables = arr(e.variables).map(v => ({ nom: str(v?.nom, 24), valeur: str(v?.valeur, 28), ton: ton(v?.ton), vers: v?.vers === undefined ? undefined : v.vers === null ? null : str(v.vers, 24) }))
        const ids = new Set(e.objets.map(o => o.id))
        if (e.variables.length > 10 || e.objets.length > 6) err(`memoire : 10 variables et 6 objets au plus (étape ${i + 1})`)
        if (e.objets.some(o => !o.id)) err(`memoire : un objet sans « id » (étape ${i + 1})`)
        if (e.objets.some(o => o.champs.length > 6)) err('memoire : 6 champs au plus par objet')
        for (const v of [...e.variables, ...e.objets.flatMap(o => o.champs)]) {
          if (!v.nom) err(`memoire : une variable ou un champ sans nom (étape ${i + 1})`)
          if (v.vers && !ids.has(v.vers)) err(`memoire : « ${v.nom} » pointe vers « ${v.vers} », absent des objets de l'étape ${i + 1}`)
        }
      })
    },
    steps: s => s.etapes.length,
    captions: s => s.etapes.map(e => e.legende),
    render(s, ctx) {
      const e = s.etapes[ctx.step ?? s.etapes.length - 1]
      // Places fixes d'une étape à l'autre : une variable, un objet gardent leur ligne (rien ne saute en avançant)
      const vOrder = [], oOrder = []
      for (const st of s.etapes) {
        for (const v of st.variables) if (!vOrder.includes(v.nom)) vOrder.push(v.nom)
        for (const v of st.variables) if (v.vers && !oOrder.includes(v.vers)) oOrder.push(v.vers)
        for (const o of st.objets) if (!oOrder.includes(o.id)) oOrder.push(o.id)
      }
      const vals = s.etapes.flatMap(st => st.variables), objs = s.etapes.flatMap(st => st.objets)
      const nameW = Math.max(28, ...vals.map(v => measure(v.nom, MONO, { mono: true })))
      const cellW = Math.max(40, ...vals.map(v => (v.vers !== undefined ? (v.vers === null ? measure('null', MONO, { mono: true }) : 10) : measure(v.valeur, MONO, { mono: true })))) + 18
      const top = 30 + (s.cadre ? 26 : 0), pileW = Math.max(16 + nameW + 10 + cellW + 16, capsW(s.zones[0]) + 32)
      const pileH = top + vOrder.length * (RH + RG) + 10
      const fieldW = c => measure(c.nom, MONO, { mono: true }) + 10 + (c.vers !== undefined ? 22 : measure(c.valeur, MONO, { mono: true }) + 10)
      const objW = Math.max(120, ...objs.map(o => Math.max(measure(o.classe || o.id, FONT, { bold: true }) + 24, ...o.champs.map(c => fieldW(c) + 24))))
      const objH = id => { const hs = objs.filter(o => o.id === id).map(o => OH + o.champs.length * FRH + (o.champs.length ? 8 : 0)); return Math.max(OH, ...hs) }
      const tx = pileW + 76, tasW = objW + 40 + (objs.some(o => o.champs.some(c => c.vers)) ? 28 : 0)
      const oy = {}
      let y = 30
      for (const id of oOrder) { oy[id] = y; y += objH(id) + 16 }
      const tasH = Math.max(y + 2, pileH), H = Math.max(pileH, tasH)
      let b = rect(0, 0, pileW, H, 's-zone', 6) + rect(tx, 0, tasW, H, 's-zone', 6)
      b += text(14, 16, s.zones[0].toUpperCase(), { anchor: 'start', size: CAP, caps: true, mono: true, cls: 's-t3' })
      b += text(tx + 14, 16, s.zones[1].toUpperCase(), { anchor: 'start', size: CAP, caps: true, mono: true, cls: 's-t3' })
      if (s.cadre) b += text(16, 40, s.cadre, { anchor: 'start', size: SMALL, mono: true, cls: 's-t2' })
      // Les objets d'abord (les flèches passent dessus)
      const at = {}
      for (const o of e.objets) {
        const ox = tx + 20, y0 = oy[o.id], h = OH + o.champs.length * FRH + (o.champs.length ? 8 : 0)
        at[o.id] = { x: ox, y: y0, h }
        b += item(ox, y0, objW, h, o.ton)
        b += text(ox + 12, y0 + OH / 2, o.classe || o.id, { anchor: 'start', bold: true, cls: o.ton && o.ton !== 'dim' ? `s-tc-${o.ton}` : o.ton === 'dim' ? 's-t3' : 's-t1' })
        if (o.champs.length) b += `<path d="M${r(ox)},${r(y0 + OH)} H${r(ox + objW)}" class="s-hair"/>`
        o.champs.forEach((c, j) => {
          const fy = y0 + OH + 4 + j * FRH + FRH / 2
          b += text(ox + 12, fy, c.nom, { anchor: 'start', mono: true, size: MONO - 0.5, cls: 's-t3' })
          if (c.vers === undefined) b += text(ox + objW - 12, fy, c.valeur, { anchor: 'end', mono: true, size: MONO - 0.5, cls: 's-t1' })
          else if (c.vers === null) b += text(ox + objW - 12, fy, 'null', { anchor: 'end', mono: true, size: MONO - 0.5, cls: 's-t3' })
          else b += `<circle cx="${r(ox + objW - 16)}" cy="${r(fy)}" r="3.5" class="s-f-acc"/>`
        })
      }
      // Les variables, et leurs flèches vers le tas
      let lane = 0
      for (const v of e.variables) {
        const i = vOrder.indexOf(v.nom), ry = top + i * (RH + RG), cx = 16 + nameW + 10
        const tc = v.ton && v.ton !== 'dim' ? `s-tc-${v.ton}` : v.ton === 'dim' ? 's-t3' : 's-t1'
        b += text(16 + nameW, ry + RH / 2, v.nom, { anchor: 'end', mono: true, size: MONO, cls: tc })
        b += item(cx, ry, cellW, RH, v.ton && v.ton !== 'dim' ? v.ton : '', 3)
        if (v.vers === undefined) b += text(cx + cellW / 2, ry + RH / 2, v.valeur, { mono: true, size: MONO, cls: 's-t1' })
        else if (v.vers === null) b += text(cx + cellW / 2, ry + RH / 2, 'null', { mono: true, size: MONO, cls: 's-t3' })
        else {
          const dx = cx + cellW / 2, dy = ry + RH / 2, t = at[v.vers], ex = t.x, ey = t.y + OH / 2
          b += `<circle cx="${r(dx)}" cy="${r(dy)}" r="3.5" class="${v.ton && v.ton !== 'dim' ? `s-f-${v.ton}` : 's-f-acc'}"/>`
          const k = Math.max(40, (ex - dx) * 0.45)
          b += line(`M${r(dx + 4)},${r(dy)} C${r(dx + k)},${r(dy)} ${r(ex - k)},${r(ey)} ${r(ex - 1)},${r(ey)}`, ctx, { ton: v.ton && v.ton !== 'dim' ? v.ton : 'acc' })
        }
      }
      // Un champ qui pointe vers un autre objet : par la droite du tas
      for (const o of e.objets) o.champs.forEach((c, j) => {
        if (!c.vers) return
        const s0 = at[o.id], t = at[c.vers], fy = s0.y + OH + 4 + j * FRH + FRH / 2, xr = tx + 20 + objW
        const lx = xr + 14 + 9 * (lane++ % 3), ty = t.y + OH / 2
        b += line(path([[xr - 12, fy], [lx, fy], [lx, ty], [xr + 1, ty]], 6), ctx, { ton: 'acc' })
      })
      return { w: tx + tasW, h: H, body: b }
    },
  })
  return S
})

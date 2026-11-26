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
  // { type: "memoire", zones?: ["Pile", "Tas"], cadre?: "main()", etapes: [{
  //     cadres?: [{ nom, variables, note?, ton? }] (du bas, main, vers le haut, l'appel en cours) — ou variables (un seul cadre),
  //     globales?: [variable], objets: [{ id, classe?, champs?: [["solde", "10"], variable], note?, ton? }], legende? }] }
  // variable : { nom, valeur? | vers?: id | null, at?: case visée de l'objet, versVar?: [cadre, nom, case?] (cadre -1 :
  //   les globales), champs?: [variable] (une valeur posée là : struct, tableau local), note?, ton? }
  // À la manière de Python Tutor : la pile à gauche (les globales au-dessus), le tas à droite, les flèches des références.
  const RH = 28, RG = 6, OH = 26, FRH = 22, HDR = 26, CG = 8, IND = 14
  const refId = v => (v === undefined ? undefined : v === null ? null : str(v, 24))
  function normVar(v, depth = 0) {
    const o = Array.isArray(v) ? { nom: v[0], valeur: v[1] } : v && typeof v === 'object' ? v : { nom: v }
    const vv = Array.isArray(o.versVar) ? [Number.isInteger(o.versVar[0]) ? o.versVar[0] : 0, str(o.versVar[1], 24), o.versVar[2] == null ? '' : str(o.versVar[2], 24)] : undefined
    return { nom: str(o.nom, 24), valeur: str(o.valeur, 28), vers: refId(o.vers), at: o.at == null ? '' : str(o.at, 24), versVar: vv, note: str(o.note, 24),
      ton: ton(o.ton), champs: depth < 2 && Array.isArray(o.champs) ? o.champs.map(c => normVar(c, depth + 1)) : [] }
  }
  // Les lignes d'une liste de variables : une par variable et par case (indentée)
  const rowsOf = (vs, pre = '', d = 0) => vs.flatMap(v => [{ v, key: pre + v.nom, d }, ...rowsOf(v.champs, `${pre}${v.nom}.`, d + 1)])
  S.type({
    name: 'memoire', alias: ['memory', 'pile-tas', 'tas'],
    check(s, err, opts = {}) {
      if (!s.etapes && (s.variables || s.objets || s.cadres)) s.etapes = [{ variables: s.variables, cadres: s.cadres, globales: s.globales, objets: s.objets, legende: s.legende }]
      s.etapes = arr(s.etapes)
      if (!s.etapes.length) return err('memoire : il faut « etapes » (ou « variables » et « objets »)')
      if (!opts.libre && s.etapes.length > 8) return err('memoire : 8 étapes au plus')
      const z = arr(s.zones)
      s.zones = [str(z[0] ?? 'Pile', 24), str(z[1] ?? 'Tas', 24)]
      s.cadre = str(s.cadre, 40)
      s.boites = s.etapes.some(e => Array.isArray(e?.cadres)) // des cadres donnés : chacun dans sa boîte
      s.etapes = s.etapes.map((e, i) => {
        const cadres = Array.isArray(e?.cadres) ? e.cadres.map(c => ({ nom: str(c?.nom, 40), note: str(c?.note, 32), ton: ton(c?.ton), variables: arr(c?.variables).map(v => normVar(v)) }))
          : [{ nom: s.cadre, note: '', ton: '', variables: arr(e?.variables).map(v => normVar(v)) }]
        const st = { cadres, globales: arr(e?.globales).map(v => normVar(v)), legende: str(e?.legende, 160),
          objets: arr(e?.objets).map(o => ({ id: str(o?.id ?? o?.nom, 24), classe: str(o?.classe ?? o?.type, 32), note: str(o?.note, 24), ton: ton(o?.ton), champs: arr(o?.champs).map(c => normVar(c, 2)) })) }
        const ids = new Set(st.objets.map(o => o.id)), nv = cadres.reduce((n, c) => n + c.variables.length, 0) + st.globales.length
        if (!opts.libre && (nv > 10 || st.objets.length > 6)) err(`memoire : 10 variables et 6 objets au plus (étape ${i + 1})`)
        if (st.objets.some(o => !o.id)) err(`memoire : un objet sans « id » (étape ${i + 1})`)
        if (!opts.libre && st.objets.some(o => o.champs.length > 6)) err('memoire : 6 champs au plus par objet')
        for (const r of [...rowsOf([...cadres.flatMap(c => c.variables), ...st.globales]), ...st.objets.flatMap(o => rowsOf(o.champs))]) {
          const v = r.v
          if (!v.nom) err(`memoire : une variable ou un champ sans nom (étape ${i + 1})`)
          if (v.vers && !ids.has(v.vers)) err(`memoire : « ${v.nom} » pointe vers « ${v.vers} », absent des objets de l'étape ${i + 1}`)
          if (v.versVar) {
            const [ci, nom] = v.versVar, list = ci === -1 ? st.globales : cadres[ci]?.variables
            if (!list?.some(x => x.nom === nom)) err(`memoire : « ${v.nom} » pointe vers la variable « ${nom} », absente de l'étape ${i + 1}`)
          }
        }
        return st
      })
    },
    steps: s => s.etapes.length,
    captions: s => s.etapes.map(e => e.legende),
    render(s, ctx) {
      const e = s.etapes[ctx.step ?? s.etapes.length - 1], M = { mono: true }
      // Places fixes sur tout le programme : la ligne d'une variable dans son cadre (cadre = son rang et son nom), l'ordre
      // des objets ; la pile est posée sur son fond (main ne bouge pas, les appels s'empilent au-dessus)
      const order = new Map(), oOrder = []
      const push = (fk, rows) => { const o = order.get(fk) ?? order.set(fk, []).get(fk); for (const r of rows) if (!o.includes(r.key)) o.push(r.key) }
      for (const st of s.etapes) {
        st.cadres.forEach((c, ci) => push(`${ci}|${c.nom}`, rowsOf(c.variables)))
        push('G', rowsOf(st.globales))
        for (const o of st.objets) if (!oOrder.includes(o.id)) oOrder.push(o.id)
      }
      const allRows = s.etapes.flatMap(st => [...st.cadres.flatMap(c => rowsOf(c.variables)), ...rowsOf(st.globales)])
      const nameW = Math.max(28, ...allRows.map(r => measure(r.v.nom, MONO, M) + r.d * IND))
      const cellOf = v => (v.vers !== undefined || v.versVar ? (v.vers === null ? measure('null', MONO, M) : 10) : measure(v.valeur, MONO, M))
      const cellW = Math.max(40, ...allRows.map(r => cellOf(r.v))) + 18
      const noteW = Math.max(0, ...allRows.map(r => (r.v.note ? measure(r.v.note, SMALL) + 12 : 0)))
      const headW = Math.max(0, ...s.etapes.flatMap(st => st.cadres.map(c => measure(c.nom, SMALL, M) + (c.note ? measure(c.note, SMALL) + 20 : 0))))
      const gRows = order.get('G').length, hasG = gRows > 0
      const pileW = Math.max(16 + nameW + 10 + cellW + noteW + 16, capsW(s.zones[0]) + 32, headW + 44, hasG ? capsW('Globales') + 32 : 0)
      const frameH = (ci, c) => (c.nom ? HDR : 6) + order.get(`${ci}|${c.nom}`).length * (RH + RG) + 4
      const pileOf = st => st.cadres.reduce((h, c, ci) => h + frameH(ci, c), 0) + Math.max(0, st.cadres.length - 1) * CG
      const gH = hasG ? 30 + gRows * (RH + RG) + 6 : 0, pTop = hasG ? gH + 12 : 0
      const maxPile = Math.max(...s.etapes.map(pileOf)), leftH = pTop + 30 + maxPile + 10
      // Le tas
      const objs = s.etapes.flatMap(st => st.objets), objRows = o => o.champs.length
      const fieldW = c => measure(c.nom, MONO, M) + 10 + (c.vers !== undefined ? 22 : measure(c.valeur, MONO, M) + 10)
      const objW = Math.max(120, ...objs.map(o => Math.max(measure(o.classe || o.id, FONT, { bold: true }) + 24 + (o.note ? measure(o.note, SMALL) + 16 : 0), ...o.champs.map(c => fieldW(c) + 24))))
      const objH = o => OH + objRows(o) * FRH + (objRows(o) ? 8 : 0)
      const tasOf = st => oOrder.filter(id => st.objets.some(o => o.id === id)).reduce((y, id) => y + objH(st.objets.find(o => o.id === id)) + 16, 30)
      const tx = pileW + 76, tasW = objW + 40 + (objs.some(o => o.champs.some(c => c.vers)) ? 28 : 0)
      const H = Math.max(leftH, Math.max(...s.etapes.map(tasOf)) + 2)
      const cap = (x, y, t) => text(x, y, t.toUpperCase(), { anchor: 'start', size: CAP, caps: true, mono: true, cls: 's-t3' })
      const tc = t => (t && t !== 'dim' ? `s-tc-${t}` : t === 'dim' ? 's-t3' : 's-t1')
      let b = ''
      if (hasG) b += rect(0, 0, pileW, gH, 's-zone', 6) + cap(14, 16, 'Globales')
      b += rect(0, pTop, pileW, H - pTop, 's-zone', 6) + cap(14, pTop + 16, s.zones[0])
      b += rect(tx, 0, tasW, H, 's-zone', 6) + cap(tx + 14, 16, s.zones[1])
      // Les objets d'abord (les flèches passent dessus), serrés dans l'ordre où ils sont apparus
      const at = {}
      let oy = 30
      for (const id of oOrder) {
        const o = e.objets.find(x => x.id === id)
        if (!o) continue
        const ox = tx + 20, h = objH(o)
        at[o.id] = { x: ox, y: oy, h, rows: o.champs.map(c => c.nom) }
        b += item(ox, oy, objW, h, o.ton)
        b += text(ox + 12, oy + OH / 2, o.classe || o.id, { anchor: 'start', bold: true, cls: tc(o.ton) })
        if (o.note) b += text(ox + objW - 10, oy + OH / 2, o.note, { anchor: 'end', size: SMALL, cls: o.ton && o.ton !== 'dim' ? `s-tc-${o.ton}` : 's-t3' })
        if (o.champs.length) b += `<path d="M${r(ox)},${r(oy + OH)} H${r(ox + objW)}" class="s-hair"/>`
        o.champs.forEach((c, j) => {
          const fy = oy + OH + 4 + j * FRH + FRH / 2
          b += text(ox + 12, fy, c.nom, { anchor: 'start', mono: true, size: MONO - 0.5, cls: 's-t3' })
          // un champ « accent » dans une boîte qui ne l'est pas : une pastille pleine derrière sa valeur (le texte clair
          // de l'accent serait invisible sur le fond de la boîte)
          if (c.vers === undefined && c.ton === 'acc' && o.ton !== 'acc') {
            const w = measure(c.valeur, MONO - 0.5, { mono: true })
            b += rect(ox + objW - 18 - w, fy - FRH / 2 + 2, w + 12, FRH - 4, 's-box s-b-acc', 3)
          }
          if (c.vers === undefined) b += text(ox + objW - 12, fy, c.valeur, { anchor: 'end', mono: true, size: MONO - 0.5, cls: c.ton ? tc(c.ton) : 's-t1' })
          else if (c.vers === null) b += text(ox + objW - 12, fy, 'null', { anchor: 'end', mono: true, size: MONO - 0.5, cls: 's-t3' })
          else b += `<circle cx="${r(ox + objW - 16)}" cy="${r(fy)}" r="3.5" class="s-f-acc"/>`
        })
        oy += h + 16
      }
      const fieldY = (id, k) => { const t = at[id], j = k ? t.rows.findIndex(n => n === k || n === `[${k}]`) : -1; return j < 0 ? t.y + OH / 2 : t.y + OH + 4 + j * FRH + FRH / 2 }
      // La pile : les cadres du fond (main) vers le haut ; les globales au-dessus
      const cells = {}, arrows = []
      const cx = 16 + nameW + 10
      const drawRows = (rows, fk, y0, prefix) => {
        rows.forEach((r0, i) => {
          const v = r0.v, ry = y0 + i * (RH + RG)
          cells[`${prefix}|${r0.key}`] = { y: ry + RH / 2 }
          // le nom est hors de la case : en « accent », écrit fort (la couleur claire de l'accent est faite pour le dedans)
          b += text(16 + nameW, ry + RH / 2, v.nom, { anchor: 'end', mono: true, size: r0.d ? MONO - 0.5 : MONO, bold: v.ton === 'acc', cls: v.ton === 'acc' ? 's-t1' : r0.d && !v.ton ? 's-t2' : tc(v.ton) })
          const box = v.vers !== undefined || v.versVar || v.valeur
          if (box) b += item(cx, ry, cellW, RH, v.ton && v.ton !== 'dim' ? v.ton : '', 3)
          if (v.note) b += text(cx + cellW + 8, ry + RH / 2, v.note, { anchor: 'start', size: SMALL, cls: v.ton && v.ton !== 'dim' ? `s-tc-${v.ton}` : 's-t3' })
          if (v.vers === null) b += text(cx + cellW / 2, ry + RH / 2, 'null', { mono: true, size: MONO, cls: 's-t3' })
          else if (v.vers !== undefined || v.versVar) arrows.push({ v, x: cx + cellW / 2, y: ry + RH / 2 })
          else if (v.valeur) b += text(cx + cellW / 2, ry + RH / 2, v.valeur, { mono: true, size: MONO, cls: 's-t1' })
        })
      }
      const place = (vs, keys) => { const m = new Map(rowsOf(vs).map(x => [x.key, x])); return keys.map(k => m.get(k) ?? { v: null, key: k }) }
      const drawPlaced = (vs, keys, y0, prefix) => {
        // une ligne gardée pour une variable absente à ce pas : vide (rien ne saute)
        const rows = place(vs, keys)
        rows.forEach((r0, i) => { if (r0.v) drawRows([r0], null, y0 + i * (RH + RG), prefix) })
      }
      if (hasG) drawPlaced(e.globales, order.get('G'), 30, 'G')
      let bottom = pTop + 30 + maxPile
      e.cadres.forEach((c, ci) => {
        const h = frameH(ci, c), fy = bottom - h
        if (s.boites) {
          b += rect(8, fy, pileW - 16, h, c.ton === 'dim' ? 's-hair s-dimbox' : 's-hair', 6)
          if (c.ton && c.ton !== 'dim') b += `<rect x="9" y="${r(fy + 4)}" width="2.5" height="${r(Math.max(2, h - 8))}" rx="1" class="s-f-${c.ton}"/>`
        }
        if (c.nom) {
          b += text(16, fy + HDR / 2 + 1, c.nom, { anchor: 'start', size: SMALL, mono: true, cls: c.ton && c.ton !== 'dim' ? `s-tc-${c.ton}` : 's-t2' })
          if (c.note) b += text(pileW - 18, fy + HDR / 2 + 1, c.note, { anchor: 'end', size: SMALL, cls: c.ton && c.ton !== 'dim' ? `s-tc-${c.ton}` : 's-t3' })
        }
        drawPlaced(c.variables, order.get(`${ci}|${c.nom}`), fy + (c.nom ? HDR : 6), `F${ci}`)
        bottom = fy - CG
      })
      // Les flèches : vers le tas (une case visée : at), ou vers une autre variable de la pile par le couloir du milieu
      let lane = 0
      for (const a of arrows) {
        const v = a.v, t = v.ton && v.ton !== 'dim' ? v.ton : 'acc'
        // dans une case pleine (accent), le point de départ est clair
        b += `<circle cx="${r(a.x)}" cy="${r(a.y)}" r="3.5" class="${v.ton === 'acc' ? 's-tc-acc' : `s-f-${t}`}"/>`
        if (v.vers) {
          const o = at[v.vers]
          if (!o) continue
          const ex = o.x, ey = fieldY(v.vers, v.at), k = Math.max(40, (ex - a.x) * 0.45)
          b += line(`M${r(a.x + 4)},${r(a.y)} C${r(a.x + k)},${r(a.y)} ${r(ex - k)},${r(ey)} ${r(ex - 1)},${r(ey)}`, ctx, { ton: t })
        } else if (v.versVar) {
          const [ci, nom, k] = v.versVar, pre = ci === -1 ? 'G' : `F${ci}`
          const target = (k && (cells[`${pre}|${nom}.${k}`] ?? cells[`${pre}|${nom}.[${k}]`])) || cells[`${pre}|${nom}`]
          if (!target) continue
          const lx = pileW + 10 + 8 * (lane++ % 5)
          b += line(path([[a.x + 4, a.y], [lx, a.y], [lx, target.y], [cx + cellW + 1, target.y]], 6), ctx, { ton: t })
        }
      }
      // Un champ qui pointe vers un autre objet : par la droite du tas
      for (const o of e.objets) o.champs.forEach((c, j) => {
        if (!c.vers || !at[c.vers]) return
        const s0 = at[o.id], fy = s0.y + OH + 4 + j * FRH + FRH / 2, xr = tx + 20 + objW
        const lx = xr + 14 + 9 * (lane++ % 3), ty = fieldY(c.vers, c.at)
        b += line(path([[xr - 12, fy], [lx, fy], [lx, ty], [xr + 1, ty]], 6), ctx, { ton: 'acc' })
      })
      return { w: tx + tasW, h: H, body: b }
    },
  })
  return S
})

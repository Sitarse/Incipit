// Types « tables » (le modèle relationnel : des tables, leurs colonnes, quelques lignes, les relations 1-N), « carte »
// (une carte mentale : une idée au centre, ses branches de part et d'autre) et « tableau » (des cases contiguës avec
// leurs indices ; une file FIFO ; une pile LIFO). D'après ajouts1.png et ajouts2.png.
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core'))
  else factory(root.Schemas)
})(typeof self !== 'undefined' ? self : this, function (S) {
  const { FONT, SMALL, CAP, MONO, measure, wrap, widest, looksCode, str, arr, norm, ton, item, rect, text, textH, line, path, bbox, fit, r } = S

  // ---------- tables ----------
  // { type: "tables", tables: [{ nom: "Utilisateurs", colonnes: ["id (PK)", "nom", "email"], lignes?: [["1", "Alice", "alice@mail.com"]] }],
  //   relations?: [{ de: "Commandes", vers: "Utilisateurs", cardinalites?: ["N", "1"], texte? }] }
  const ROW = 30, HEAD = 36, CPAD = 14
  S.type({
    name: 'tables', alias: ['relationnel', 'modele-relationnel', 'bdd', 'base-de-donnees', 'mld', 'mcd', 'entites'],
    check(s, err) {
      s.tables = arr(s.tables).map(t => ({ nom: str(t?.nom ?? t?.titre, 40), colonnes: arr(t?.colonnes).map(c => str(c, 40)).filter(Boolean),
        lignes: arr(t?.lignes).slice(0, 5).map(l => arr(l).map(v => str(v, 30))), ton: ton(t?.ton) }))
      if (s.tables.length < 1 || s.tables.length > 4) return err('tables : de 1 à 4 « tables »')
      for (const t of s.tables) {
        if (!t.nom) err('tables : une table sans « nom »')
        if (!t.colonnes.length || t.colonnes.length > 8) err(`tables : ${t.nom} : de 1 à 8 « colonnes »`)
        if (t.lignes.some(l => l.length !== t.colonnes.length)) err(`tables : ${t.nom} : chaque ligne a autant de valeurs que de colonnes`)
      }
      const find = q => s.tables.find(t => norm(t.nom) === norm(String(q ?? '').split('.')[0]))
      s.relations = arr(s.relations).slice(0, 4).map(l => ({ de: find(l?.de), vers: find(l?.vers), q: [str(l?.de, 40), str(l?.vers, 40)],
        card: arr(l?.cardinalites).map(c => str(c, 6)), texte: str(l?.texte, 30) }))
      for (const l of s.relations) if (!l.de || !l.vers || l.de === l.vers) err(`tables : relation « ${l.q[0]} → ${l.q[1]} » : il faut deux tables du schéma`)
    },
    render(s, ctx) {
      const bb = bbox(), G = 90
      let b = '', l = '', x = 0
      const at = new Map()
      for (const t of s.tables) {
        const grid = t.lignes.length > 0
        // grille (colonnes en en-tête, lignes dessous) ou liste des colonnes, une par ligne
        const colW = grid ? t.colonnes.map((c, i) => Math.max(measure(c, SMALL, { bold: true }), ...t.lignes.map(v => measure(v[i], SMALL))) + 2 * CPAD) : []
        const w = Math.max(measure(t.nom, FONT, { bold: true }) + 2 * CPAD, grid ? colW.reduce((a, v) => a + v, 0) : Math.max(...t.colonnes.map(c => measure(c, FONT))) + 2 * CPAD + 10)
        if (grid) { const extra = w - colW.reduce((a, v) => a + v, 0); colW[colW.length - 1] += extra }
        const h = HEAD + (grid ? ROW * (t.lignes.length + 1) : ROW * t.colonnes.length + 8)
        b += item(x, 0, w, h, t.ton === 'acc' ? '' : t.ton) + `<path d="M${r(x)},${r(HEAD)} V8 Q${r(x)},0 ${r(x + 8)},0 H${r(x + w - 8)} Q${r(x + w)},0 ${r(x + w)},8 V${r(HEAD)} Z" class="s-head"/>`
          + `<path d="M${r(x)},${r(HEAD)} H${r(x + w)}" class="s-cell"/>` + text(x + CPAD, HEAD / 2, t.nom, { anchor: 'start', bold: true, cls: 's-t1' })
        if (grid) {
          let cx = x
          t.colonnes.forEach((c, i) => {
            b += text(cx + CPAD, HEAD + ROW / 2, c, { anchor: 'start', size: SMALL, cls: 's-t2', bold: true })
            t.lignes.forEach((v, k) => { b += text(cx + CPAD, HEAD + ROW * (k + 1.5), v[i], { anchor: 'start', size: SMALL, cls: 's-t2' }) })
            if (i) b += `<path d="M${r(cx)},${r(HEAD)} V${r(h)}" class="s-cell"/>`
            cx += colW[i]
          })
          for (let k = 1; k <= t.lignes.length; k++) b += `<path d="M${r(x)},${r(HEAD + ROW * k)} H${r(x + w)}" class="s-cell"/>`
        } else t.colonnes.forEach((c, i) => { b += text(x + CPAD, HEAD + 4 + ROW * (i + 0.5), c, { anchor: 'start', cls: /\((pk|fk)\)|^#|clé/i.test(c) ? 's-t1' : 's-t2' }) })
        at.set(t, { x, w, h }); bb.add(x, 0, w, h)
        x += w + G
      }
      // les relations : un trait en équerre d'un bord à l'autre, la cardinalité à chaque bout
      s.relations.forEach((rel, k) => {
        let a = at.get(rel.de), c = at.get(rel.vers), [ca, cc] = [rel.card[0] ?? '', rel.card[1] ?? '']
        if (a.x > c.x) { [a, c] = [c, a]; [ca, cc] = [cc, ca] }
        const y = HEAD / 2 + 4 + k * 10, x0 = a.x + a.w, x1 = c.x, mid = (x0 + x1) / 2
        l += line(path([[x0, y + 14], [mid - 10, y + 14], [mid - 10, y + 4], [mid + 10, y + 4], [mid + 10, y + 14], [x1, y + 14]], 5), ctx, { head: '' })
        if (ca) l += text(x0 + 10, y + 2, ca, { size: SMALL, cls: 's-t1', anchor: 'start' })
        if (cc) l += text(x1 - 10, y + 2, cc, { size: SMALL, cls: 's-t1', anchor: 'end' })
        if (rel.texte) l += text(mid, y + 30, rel.texte, { size: SMALL, cls: 's-t3' })
      })
      return fit(b + l, bb)
    },
  })

  // ---------- carte ----------
  // { type: "carte", centre: "Les exceptions", branches: ["Déclenchement (throw)", { texte: "Types", note: "standard, custom" }, …] }
  S.type({
    name: 'carte', alias: ['carte-mentale', 'mindmap', 'mind-map', 'idees'],
    check(s, err) {
      s.centre = str(s.centre ?? s.titre, 50)
      s.branches = arr(s.branches).map(b => (b && typeof b === 'object' ? { texte: str(b.texte ?? b.nom, 50), note: str(b.note, 50), ton: ton(b.ton) } : { texte: str(b, 50), note: '', ton: '' }))
      if (!s.centre) err('carte : il faut un « centre »')
      if (s.branches.length < 2 || s.branches.length > 8) err('carte : de 2 à 8 « branches »')
      if (s.branches.some(b => !b.texte)) err('carte : une branche sans texte')
    },
    render(s, ctx) {
      const size = b => { b._l = wrap(b.texte, 170, FONT); b._n = b.note ? wrap(`(${b.note})`, 170, SMALL) : []; b._w = Math.max(widest(b._l, FONT), widest(b._n, SMALL)) + 32; b._h = textH(b._l.length) + (b._n.length ? textH(b._n.length, SMALL) + 2 : 0) + 22; return b }
      const bs = s.branches.map(size), left = bs.filter((_, i) => i % 2), right = bs.filter((_, i) => !(i % 2))
      const cl = wrap(s.centre, 180, FONT + 2, { bold: true }), cw = widest(cl, FONT + 2, { bold: true }) + 44, ch = textH(cl.length, FONT + 2) + 26
      const GAP = 26, H = side => side.reduce((a, b) => a + b._h, 0) + GAP * Math.max(0, side.length - 1)
      const TH = Math.max(H(left), H(right), ch), dx = 90, bb = bbox()
      const cx = Math.max(0, ...left.map(b => b._w)) + dx, cy = TH / 2
      let b = item(cx, cy - ch / 2, cw, ch, 'acc') + text(cx + cw / 2, cy, cl, { size: FONT + 2, bold: true, cls: 's-tc-acc' }), l = ''
      bb.add(cx, cy - ch / 2, cw, ch)
      const place = (side, toRight) => {
        let y = (TH - H(side)) / 2
        for (const n of side) {
          const x = toRight ? cx + cw + dx : cx - dx - n._w, ny = y + n._h / 2
          const tc = n.ton && n.ton !== 'dim' && n.ton !== 'acc' ? `s-tc-${n.ton}` : 's-t1', th = textH(n._l.length)
          b += item(x, y, n._w, n._h, n.ton === 'acc' ? '' : n.ton) + text(x + n._w / 2, y + 11 + th / 2, n._l, { cls: tc })
          if (n._n.length) b += text(x + n._w / 2, y + 13 + th + textH(n._n.length, SMALL) / 2, n._n, { size: SMALL, cls: 's-t3' })
          // une courbe douce du centre à la branche
          const x0 = toRight ? cx + cw : cx, x1 = toRight ? x - 2 : x + n._w + 2, k = (x1 - x0) * 0.55
          l += line(`M${r(x0)},${r(cy)} C${r(x0 + k)},${r(cy)} ${r(x1 - k)},${r(ny)} ${r(x1)},${r(ny)}`, ctx)
          bb.add(x, y, n._w, n._h)
          y += n._h + GAP
        }
      }
      place(right, true); place(left, false)
      return fit(l + b, bb)
    },
  })

  // ---------- tableau ----------
  // { type: "tableau", forme?: "tableau" | "file" | "lifo", cases: ["a", "b", "c", "d"], legende?: "Tableau", indices?: true,
  //   note?: "Un tableau est une collection d'éléments contigus en mémoire." }
  S.type({
    name: 'tableau', alias: ['array', 'cases', 'file', 'fifo', 'lifo', 'pile-file', 'queue'],
    check(s, err) {
      const f = norm(s.forme ?? s._as)
      s.forme = /fifo|file|queue/.test(f) ? 'file' : /lifo/.test(f) ? 'lifo' : 'tableau'
      s.cases = arr(s.cases ?? s.elements).map(c => (c && typeof c === 'object' ? { texte: str(c.texte, 24), ton: ton(c.ton) } : { texte: str(c, 24), ton: '' }))
      if (s.cases.length < 1 || s.cases.length > 12) err('tableau : de 1 à 12 « cases »')
      s.legende = str(s.legende, 40); s.note = str(s.note, 140); s.indices = s.indices ?? s.forme === 'tableau'
      s.debut = str(s.debut ?? s.entree, 24); s.fin = str(s.fin ?? s.sortie, 24)
    },
    render(s, ctx) {
      const bb = bbox(), code = s.cases.some(c => looksCode(c.texte)), sz = code ? MONO : FONT
      const cw = Math.max(44, ...s.cases.map(c => measure(c.texte, sz, { mono: code }) + 24)), ch = 44
      let b = ''
      const cell = (c, x, y, w, h) => item(x, y, w, h, c.ton) + text(x + w / 2, y + h / 2, c.texte, { cls: c.ton === 'acc' ? 's-tc-acc' : 's-t1', mono: code, size: sz })
      if (s.forme === 'lifo') {
        // une pile : le sommet en haut ; on empile et on dépile par le haut
        const w = Math.max(cw, 150), gap = 6, n = s.cases.length
        s.cases.forEach((c, i) => { b += cell(c, 0, i * (ch + gap), w, ch) })
        const top = s.debut || 'Dernier entré, premier sorti'
        b += line(`M${r(w + 30)},-8 V${r(ch / 2)}`, ctx) + line(`M${r(w + 54)},${r(ch / 2)} V-8`, ctx)
        b += text(w + 42, -20, top, { size: SMALL, cls: 's-t2' })
        if (s.fin) b += text(w / 2, n * (ch + gap) + 10, s.fin, { size: SMALL, cls: 's-t3' })
        bb.add(0, -30, w + 60 + Math.max(0, measure(top, SMALL) / 2 - 30), n * (ch + gap) + 24)
      } else {
        const n = s.cases.length, W = n * cw
        s.cases.forEach((c, i) => {
          b += cell(c, i * cw, 0, cw, ch)
          if (s.indices) b += text(i * cw + cw / 2, -16, String(i), { size: SMALL, cls: 's-t3', mono: true })
        })
        bb.add(0, s.indices ? -26 : 0, W, ch)
        if (s.forme === 'file') {
          b += line(`M-42,${r(ch / 2)} H-6`, ctx) + line(`M${r(W + 6)},${r(ch / 2)} H${r(W + 42)}`, ctx)
          b += text(-24, ch + 18, s.debut || 'Entrée', { size: SMALL, cls: 's-t2' }) + text(W + 24, ch + 18, s.fin || 'Sortie', { size: SMALL, cls: 's-t2' })
          bb.add(-60, 0, W + 120, ch + 28)
        }
        if (s.legende) {
          b += line(`M0,${r(ch + 20)} H${r(W)}`, ctx, { start: 'ah' }) + text(W / 2, ch + 40, s.legende, { cls: 's-t2' })
          bb.add(0, ch, W, 50)
        }
      }
      if (s.note) {
        const nl = wrap(s.note, 220, SMALL), x = bb.x1 + 34, y0 = bb.y0, hh = bb.y1 - bb.y0
        b += `<path d="M${r(x - 16)},${r(y0)} V${r(y0 + hh)}" class="s-cell"/>` + text(x, y0 + hh / 2, nl, { size: SMALL, cls: 's-t2', anchor: 'start' })
        bb.add(x, y0, widest(nl, SMALL), hh)
      }
      return fit(b, bb)
    },
  })
  return S
})

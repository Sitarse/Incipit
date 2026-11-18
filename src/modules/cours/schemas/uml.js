// Types UML : « classes » (diagramme de classes : attributs, méthodes, héritage, associations, composition),
// « cas » (cas d'utilisation : acteurs, système, include / extend) et « sequence » (qui envoie quoi à qui, dans l'ordre ;
// pas à pas dans le lecteur, un message par étape).
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core'))
  else factory(root.Schemas)
})(typeof self !== 'undefined' ? self : this, function (S) {
  const { FONT, SMALL, CAP, MONO, measure, wrap, widest, str, arr, norm, ton, item, rect, text, textH, icon, hasIcon, path, line, bbox, fit, layers, exitPoint, r } = S
  const RELS = { heritage: 'heritage', generalisation: 'heritage', extends: 'heritage', implementation: 'implementation', realisation: 'implementation', implements: 'implementation',
    association: 'association', composition: 'composition', agregation: 'agregation', aggregation: 'agregation', dependance: 'dependance', dependency: 'dependance', utilise: 'dependance' }

  // ---------------------------------------------------------------- classes
  // { type: "classes", classes: [{ id?, nom, attributs?: ["- solde : int"], methodes?: ["+ retirer(m : int)"], abstraite?, interface? }],
  //   relations?: [{ de, vers, type: "heritage" | "implementation" | "association" | "composition" | "agregation" | "dependance",
  //   texte?, cardinalites?: ["1", "0..*"], fleche? }] } — composition et agrégation : « de » est le tout (le losange)
  const ROW = 17
  S.type({
    name: 'classes', alias: ['uml', 'diagramme-de-classes', 'classe'],
    check(s, err) {
      s.classes = arr(s.classes).map(c => ({ id: str(c?.id ?? c?.nom, 40), nom: str(c?.nom ?? c?.id, 40), at: arr(c?.attributs).map(a => str(a, 48)).slice(0, 8), me: arr(c?.methodes).map(m => str(m, 52)).slice(0, 8),
        abs: !!(c?.abstraite ?? c?.abstract), itf: !!c?.interface, ton: ton(c?.ton) }))
      if (!s.classes.length || s.classes.length > 9) return err('classes : de 1 à 9 classes')
      if (s.classes.some(c => !c.nom)) err('classes : une classe sans « nom »')
      const find = q => s.classes.find(c => c.id === str(q, 40)) ?? s.classes.find(c => norm(c.nom) === norm(q))
      s.relations = arr(s.relations).map(x => ({ de: find(x?.de), vers: find(x?.vers), type: RELS[norm(x?.type)] ?? 'association', texte: str(x?.texte, 30), card: arr(x?.cardinalites).map(c => str(c, 8)), fleche: !!x?.fleche, q: `${str(x?.de, 30)} → ${str(x?.vers, 30)}` }))
      if (s.relations.length > 14) err('classes : 14 relations au plus')
      for (const x of s.relations) if (!x.de || !x.vers || x.de === x.vers) err(`classes : relation « ${x.q} » : classe inconnue`)
    },
    render(s, ctx) {
      for (const c of s.classes) {
        const head = (c.itf ? 1 : 0) + 1
        c._w = Math.max(110, measure(c.nom, FONT, { bold: true }) + 28, ...c.at.concat(c.me).map(t => measure(t, MONO - 1, { mono: true }) + 22))
        c._hh = 10 + head * 16; c._h = c._hh + (c.at.length ? c.at.length * ROW + 10 : 8) + (c.me.length ? c.me.length * ROW + 10 : 8)
      }
      // Rangs : un parent au-dessus de ses enfants ; une classe sans héritage se range avec celle qu'elle touche
      const inh = s.relations.filter(x => x.type === 'heritage' || x.type === 'implementation')
      const { rank } = layers(s.classes, inh.map(x => [x.vers, x.de]))
      const linked = c => s.relations.find(x => (x.de === c || x.vers === c) && !inh.includes(x))
      for (const c of s.classes) if (!inh.some(x => x.de === c || x.vers === c) && linked(c)) { const o = linked(c).de === c ? linked(c).vers : linked(c).de; rank.set(c, rank.get(o)) }
      // Dans une ligne, deux classes liées côte à côte (une de chaque côté s'il le faut), et assez d'écart pour écrire
      // le nom de leur relation et ses cardinalités
      const rel = (a, b) => s.relations.find(x => !inh.includes(x) && ((x.de === a && x.vers === b) || (x.de === b && x.vers === a)))
      const rows = []
      for (const c of s.classes) {
        const row = (rows[rank.get(c)] ??= []), p = row.find(o => rel(o, c))
        if (!p) { row.push(c); continue }
        const i = row.indexOf(p)
        row.splice(i + 1 === row.length || !rel(row[i + 1], p) ? i + 1 : i, 0, c)
      }
      const gapOf = (a, b) => { const x = rel(a, b); return x ? Math.max(96, measure(x.texte, SMALL) + 48, measure(x.card.join('   '), SMALL) + 64) : 60 }
      const rowH = rows.map(l => Math.max(...(l ?? []).map(c => c._h))), totalW = l => l.reduce((t, c, i) => t + c._w + (i ? gapOf(l[i - 1], c) : 0), 0)
      const W = Math.max(...rows.map(l => totalW(l ?? [])))
      let y = 0
      rows.forEach((l, i) => { if (!l) return; let x = (W - totalW(l)) / 2; l.forEach((c, j) => { if (j) x += gapOf(l[j - 1], c); c._x = x; c._y = y; x += c._w }); y += rowH[i] + 70 })
      const bb = bbox()
      let nb = '', lb = '', tb = ''
      for (const c of s.classes) {
        bb.add(c._x, c._y, c._w, c._h)
        nb += item(c._x, c._y, c._w, c._h, c.ton, 2)
        if (c.itf) nb += text(c._x + c._w / 2, c._y + 13, '«interface»', { size: SMALL, cls: 's-t3' })
        nb += text(c._x + c._w / 2, c._y + c._hh - 13, c.nom, { bold: true, italic: c.abs, cls: c.ton && c.ton !== 'dim' ? `s-tc-${c.ton}` : 's-t1' })
        let yy = c._y + c._hh
        for (const part of [c.at, c.me]) {
          nb += `<path d="M${r(c._x)},${r(yy)} H${r(c._x + c._w)}" class="s-hair"/>`
          part.forEach((t, j) => { nb += text(c._x + 11, yy + 5 + j * ROW + ROW / 2, t, { anchor: 'start', mono: true, size: MONO - 1, cls: 's-t2' }) })
          yy += part.length ? part.length * ROW + 10 : 8
        }
      }
      // Héritage : un peigne par parent, le triangle sur le parent
      const parents = [...new Set(inh.map(x => `${x.vers.id}\u0000${x.type}`))]
      for (const key of parents) {
        const [pid, ty] = key.split('\u0000'), p = s.classes.find(c => c.id === pid), kids = inh.filter(x => x.vers === p && x.type === ty).map(x => x.de)
        const by = Math.min(...kids.map(k => k._y)) - 26, px = p._x + p._w / 2, dash = ty === 'implementation'
        lb += line(`M${r(px)},${r(by)} L${r(px)},${r(p._y + p._h + 0.5)}`, ctx, { head: 'tri', dash })
        const xs = kids.map(k => k._x + k._w / 2).concat(px)
        if (Math.max(...xs) - Math.min(...xs) > 0.5) lb += line(`M${r(Math.min(...xs))},${r(by)} L${r(Math.max(...xs))},${r(by)}`, ctx, { head: '', dash })
        for (const k of kids) lb += line(`M${r(k._x + k._w / 2)},${r(by)} L${r(k._x + k._w / 2)},${r(k._y)}`, ctx, { head: '', dash })
      }
      // Les autres relations : en ligne droite d'un bord à l'autre
      for (const x of s.relations.filter(y => !inh.includes(y))) {
        const A = { x: x.de._x, y: x.de._y, w: x.de._w, h: x.de._h }, B = { x: x.vers._x, y: x.vers._y, w: x.vers._w, h: x.vers._h }
        const [ax, ay] = exitPoint(A, B.x + B.w / 2, B.y + B.h / 2), [bx, by] = exitPoint(B, A.x + A.w / 2, A.y + A.h / 2)
        const start = x.type === 'composition' ? 'diaf' : x.type === 'agregation' ? 'dia' : undefined
        const head = x.type === 'dependance' ? 'open' : x.fleche ? 'ah' : ''
        lb += line(`M${r(ax)},${r(ay)} L${r(bx)},${r(by)}`, ctx, { head, start, dash: x.type === 'dependance' })
        const L = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L, uy = (by - ay) / L, nx = -uy, ny = ux
        if (x.texte) tb += text((ax + bx) / 2 + nx * 10, (ay + by) / 2 + ny * 10, x.texte, { size: SMALL, cls: 's-t2', halo: true, italic: true })
        // les cardinalités de l'autre côté du trait que le nom : rien ne se chevauche sur une association courte
        if (x.card[0]) tb += text(ax + ux * 16 - nx * 11, ay + uy * 16 - ny * 11, x.card[0], { size: SMALL, cls: 's-t3', halo: true })
        if (x.card[1]) tb += text(bx - ux * 16 - nx * 11, by - uy * 16 - ny * 11, x.card[1], { size: SMALL, cls: 's-t3', halo: true })
      }
      return fit(lb + nb + tb, bb)
    },
  })

  // ---------------------------------------------------------------- cas
  // { type: "cas", systeme?: "Application", acteurs: [{ id?, texte, cote?: "droite" }], cas: [{ id?, texte }],
  //   liens: [{ de, vers, type?: "include" | "extend" }] }
  S.type({
    name: 'cas', alias: ['cas-utilisation', 'use-case', 'usecase'],
    check(s, err) {
      const it = (v, max) => (v && typeof v === 'object' ? { id: str(v.id ?? v.texte, 40), texte: str(v.texte ?? v.id, max), droite: norm(v.cote) === 'droite' } : { id: str(v, 40), texte: str(v, max), droite: false })
      s.acteurs = arr(s.acteurs).map(a => it(a, 28)); s.cas = arr(s.cas).map(c => it(c, 60)); s.systeme = str(s.systeme, 40)
      if (!s.acteurs.length || s.acteurs.length > 6 || !s.cas.length || s.cas.length > 10) return err('cas : de 1 à 6 acteurs et de 1 à 10 cas')
      const all = [...s.acteurs, ...s.cas], find = q => all.find(x => x.id === str(q, 40)) ?? all.find(x => norm(x.texte) === norm(q))
      s.liens = arr(s.liens).map(l => ({ de: find(l?.de), vers: find(l?.vers), type: ['include', 'extend'].find(t => norm(l?.type).startsWith(t.slice(0, 4))) ?? '', q: `${str(l?.de, 30)} → ${str(l?.vers, 30)}` }))
      for (const l of s.liens) if (!l.de || !l.vers) err(`cas : lien « ${l.q} » : inconnu`)
    },
    render(s, ctx) {
      const two = s.cas.length > 5, per = two ? Math.ceil(s.cas.length / 2) : s.cas.length
      for (const c of s.cas) { c._l = wrap(c.texte, 150, FONT); c._rx = Math.max(62, widest(c._l, FONT) / 2 + 24); c._ry = Math.max(20, textH(c._l.length) / 2 + 10) }
      const colW = Math.max(...s.cas.map(c => c._rx * 2)), sysX = 150, gap = 18
      let yy = 44
      s.cas.forEach((c, i) => { const col = two && i >= per ? 1 : 0; if (i === per && two) yy = 44; c._x = sysX + 30 + col * (colW + 40) + colW / 2; c._y = yy + c._ry; yy += 2 * c._ry + gap })
      const sysW = 60 + colW * (two ? 2 : 1) + (two ? 40 : 0), sysH = Math.max(...s.cas.map(c => c._y + c._ry)) + 24
      const bb = bbox().add(0, 0, sysX * 2 + sysW, sysH)
      let b = rect(sysX, 0, sysW, sysH, 's-zone', 6)
      if (s.systeme) b += text(sysX + 14, 18, s.systeme.toUpperCase(), { anchor: 'start', size: CAP, caps: true, mono: true, cls: 's-t3' })
      let lb = '', tb = ''
      const linkedY = a => { const ys = s.liens.filter(l => l.de === a || l.vers === a).map(l => (l.de === a ? l.vers : l.de)._y).filter(Number.isFinite); return ys.length ? ys.reduce((t, v) => t + v, 0) / ys.length : sysH / 2 }
      const sides = [s.acteurs.filter(a => !a.droite), s.acteurs.filter(a => a.droite)]
      sides.forEach((list, side) => {
        list.map(a => [a, linkedY(a)]).sort((p, q) => p[1] - q[1]).forEach(([a, y], k, arr2) => {
          a._x = side ? sysX + sysW + 70 : sysX - 70; a._y = Math.max(y, k ? arr2[k - 1][0]._y + 78 : 30)
        })
      })
      for (const a of s.acteurs) { // le bonhomme UML
        const x = a._x, y = a._y
        b += `<g class="s-ln"><circle cx="${r(x)}" cy="${r(y - 22)}" r="7"/><path d="M${r(x)},${r(y - 15)} V${r(y + 6)} M${r(x - 12)},${r(y - 7)} H${r(x + 12)} M${r(x)},${r(y + 6)} L${r(x - 10)},${r(y + 20)} M${r(x)},${r(y + 6)} L${r(x + 10)},${r(y + 20)}"/></g>`
        const ls = wrap(a.texte, 110, SMALL); b += text(x, y + 30 + textH(ls.length, SMALL) / 2, ls, { size: SMALL, cls: 's-t1' }); bb.add(x - 55, y - 30, 110, 66 + textH(ls.length, SMALL))
      }
      for (const c of s.cas) b += `<ellipse cx="${r(c._x)}" cy="${r(c._y)}" rx="${r(c._rx)}" ry="${r(c._ry)}" class="s-box"/>` + text(c._x, c._y, c._l, { cls: 's-t1' })
      const edge = (c, tx, ty) => { const a = Math.atan2((ty - c._y) / c._ry, (tx - c._x) / c._rx); return [c._x + c._rx * Math.cos(a), c._y + c._ry * Math.sin(a)] }
      let bend = 0
      const placed = []
      for (const l of s.liens) {
        const A = l.de, B = l.vers, isCase = x => s.cas.includes(x)
        if (!l.type) { // acteur — cas : un trait simple
          const act = isCase(A) ? B : A, c = isCase(A) ? A : B, [ex, ey] = edge(c, act._x, act._y - 4)
          lb += line(`M${r(act._x + (act._x < c._x ? 16 : -16))},${r(act._y - 4)} L${r(ex)},${r(ey)}`, ctx, { head: '' })
          continue
        }
        const [ax, ay] = edge(A, B._x, B._y), [bx, by] = edge(B, A._x, A._y)
        const sameCol = Math.abs(A._x - B._x) < 1
        let d, lx, ly
        if (sameCol) { // par la droite de la colonne ; chaque lien de plus s'écarte un peu plus
          const xo = A._x + Math.max(A._rx, B._rx) + 30 + 26 * (bend++), xa = A._x + A._rx * 0.9, xb = B._x + B._rx * 0.9 + 2, ya2 = A._y - A._ry * 0.35, yb2 = B._y + (B._y > A._y ? -1 : 1) * B._ry * 0.4
          d = `M${r(xa)},${r(ya2)} C${r(xo)},${r(ya2)} ${r(xo)},${r(yb2)} ${r(xb)},${r(yb2)}`; lx = xa + 0.75 * (xo - xa) + 4; ly = (ya2 + yb2) / 2; bb.add(xo, ly, 70, 1)
        }
        else { d = `M${r(ax)},${r(ay)} L${r(bx)},${r(by)}`; lx = (ax + bx) / 2; ly = (ay + by) / 2 - 8 }
        lb += line(d, ctx, { dash: true, head: 'open' })
        // une étiquette qui en recouvrirait une autre descend d'une ligne
        const lab = `«${l.type}»`, lw = measure(lab, SMALL), x0 = sameCol ? lx : lx - lw / 2
        while (placed.some(p => x0 < p[0] + p[2] && p[0] < x0 + lw && Math.abs(ly - p[1]) < 14)) ly += 14
        placed.push([x0, ly, lw])
        tb += text(lx, ly, lab, { size: SMALL, cls: 's-t3', halo: true, anchor: sameCol ? 'start' : 'middle' })
      }
      return fit(b + lb + tb, bb)
    },
  })

  // ---------------------------------------------------------------- sequence
  // { type: "sequence", acteurs: [{ id?, texte, icone? }], messages: [{ de, vers, texte, retour?, legende? } | { note, sur: id | [id, id] }] }
  S.type({
    name: 'sequence', alias: ['diagramme-de-sequence', 'echanges', 'messages'],
    check(s, err) {
      s.acteurs = arr(s.acteurs).map(a => (a && typeof a === 'object' ? { id: str(a.id ?? a.texte, 30), texte: str(a.texte ?? a.id, 30), icone: str(a.icone, 24) } : { id: str(a, 30), texte: str(a, 30), icone: '' }))
      if (s.acteurs.length < 2 || s.acteurs.length > 6) return err('sequence : de 2 à 6 acteurs')
      const find = q => s.acteurs.find(a => a.id === str(q, 30)) ?? s.acteurs.find(a => norm(a.texte) === norm(q))
      s.messages = arr(s.messages).map(m => (m?.note ? { note: str(m.note, 90), sur: arr(m.sur).map(find) } : { de: find(m?.de), vers: find(m?.vers), texte: str(m?.texte, 60), retour: !!m?.retour, legende: str(m?.legende, 160), q: `${str(m?.de, 20)} → ${str(m?.vers, 20)}` }))
      if (!s.messages.length || s.messages.length > 14) err('sequence : de 1 à 14 messages')
      for (const m of s.messages) { if (m.note !== undefined ? !m.sur.length || m.sur.some(x => !x) : !m.de || !m.vers) err(`sequence : « ${m.q ?? m.note} » : acteur inconnu`) }
    },
    steps: s => s.messages.length,
    captions: s => s.messages.map(m => m.legende ?? ''),
    render(s, ctx) {
      const n = s.acteurs.length, upto = ctx.step == null ? s.messages.length : ctx.step + 1
      // Écart entre deux lignes de vie : de quoi écrire le plus long message qui passe entre elles
      const gap = Array(n - 1).fill(150)
      for (const m of s.messages) {
        if (m.note !== undefined || m.de === m.vers) continue
        const i = s.acteurs.indexOf(m.de), j = s.acteurs.indexOf(m.vers), lo = Math.min(i, j), hi = Math.max(i, j)
        const need = Math.min(260, measure(m.texte, SMALL) + 34) / (hi - lo)
        for (let k = lo; k < hi; k++) gap[k] = Math.max(gap[k], need)
      }
      for (const a of s.acteurs) a._w = Math.max(90, measure(a.texte, FONT) + (hasIcon(a.icone) ? 22 : 0) + 26)
      const xs = s.acteurs.reduce((acc, a, i) => (acc.push(i ? acc[i - 1] + gap[i - 1] : a._w / 2), acc), [])
      // Une ligne par message ; une note prend la hauteur de son texte
      const top = 52, ys = []
      let yy = top
      for (const m of s.messages) {
        if (m.note !== undefined) { const ix = m.sur.map(a => xs[s.acteurs.indexOf(a)]); m._x0 = Math.min(...ix) - 100; m._x1 = Math.max(...ix) + 100; m._l = wrap(m.note, m._x1 - m._x0 - 16, SMALL); m._h = textH(m._l.length, SMALL) + 12 }
        ys.push(yy + (m.note !== undefined ? m._h / 2 + 4 : 16)); yy += m.note !== undefined ? m._h + 14 : 38
      }
      const bottom = yy + 10
      const bb = bbox().add(0, 0, xs[n - 1] + s.acteurs[n - 1]._w / 2, bottom + 8)
      let b = '', lb = ''
      s.acteurs.forEach((a, i) => {
        const x = xs[i], ic = hasIcon(a.icone) ? 22 : 0
        b += item(x - a._w / 2, 0, a._w, 34, '') + (ic ? icon(a.icone, x - a._w / 2 + 10, 9, 16) : '') + text(x + ic / 2, 17, a.texte, { cls: 's-t1' })
        lb += `<path d="M${r(x)},34 V${r(bottom)}" class="s-hair s-dash"/>`
        bb.add(x - a._w / 2, 0, a._w, 34)
      })
      let k = 0
      s.messages.slice(0, upto).forEach((m, idx) => {
        const y = ys[idx]
        if (m.note !== undefined) {
          b += rect(m._x0, y - m._h / 2, m._x1 - m._x0, m._h, 's-zone', 2) + rect(m._x0, y - m._h / 2, m._x1 - m._x0, m._h, 's-hair', 2) + text((m._x0 + m._x1) / 2, y, m._l, { size: SMALL, cls: 's-t2' })
          bb.add(m._x0, y - m._h / 2, m._x1 - m._x0, m._h)
          return
        }
        k++
        const xa = xs[s.acteurs.indexOf(m.de)], xb = xs[s.acteurs.indexOf(m.vers)], last = ctx.step != null && idx === upto - 1
        const t = last ? 'acc' : '', lab = `${k}. ${m.texte}`
        if (m.de === m.vers) {
          lb += line(path([[xa, y - 6], [xa + 32, y - 6], [xa + 32, y + 8], [xa + 2, y + 8]], 5), ctx, { ton: t, dash: m.retour, head: m.retour ? 'open' : undefined })
          b += text(xa + 40, y + 1, lab, { anchor: 'start', size: SMALL, cls: t ? 's-tc-acc' : 's-t1', halo: true }); bb.add(xa + 40, y - 7, measure(lab, SMALL), 14)
        } else {
          const dir = Math.sign(xb - xa)
          lb += line(`M${r(xa)},${r(y)} L${r(xb - dir * 2)},${r(y)}`, ctx, { ton: t, dash: m.retour, head: m.retour ? 'open' : undefined })
          b += text((xa + xb) / 2, y - 9, lab, { size: SMALL, cls: t ? 's-tc-acc' : m.retour ? 's-t2' : 's-t1', halo: true })
        }
      })
      return fit(lb + b, bb)
    },
  })
  return S
})

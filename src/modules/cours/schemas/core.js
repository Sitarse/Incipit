// Les schémas des cours : quelques lignes écrites par l'IA (un bloc ```schema en JSON) deviennent un dessin SVG
// propre, le même partout : dans le lecteur (pas à pas, thème clair ou sombre), dans le PDF et dans Obsidian (image
// fixe). L'IA choisit le type et le remplit ; la mise en page, les couleurs et la lisibilité sont faites ici, jamais
// par elle. Pur : ni DOM ni réseau ni dépendance ; tourne dans Node (runner.js, tests) comme dans le lecteur
// (window.Schemas). Les types sont dans les fichiers voisins (pile-memoire.js, zones.js…), chargés après celui-ci.
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.Schemas = factory()
})(typeof self !== 'undefined' ? self : this, function () {
  const S = { types: {}, alias: {}, icons: {}, iconAlias: {} }

  // ---------- Texte : largeurs mesurées (Geist et Segoe UI, la plus large des deux), coupure en lignes ----------
  // Avancées en millièmes d'em pour U+0020..U+007E, puis quelques caractères du français et des maths. Calculées avec
  // fontTools sur geist-latin-wght-normal.woff2 et segoeui.ttf / segoeuib.ttf : un texte tient dans sa boîte que le
  // lecteur affiche Geist ou que le PDF retombe sur Segoe UI.
  const WA = [274, 284, 392, 591, 629, 818, 800, 230, 302, 302, 430, 684, 217, 419, 217, 480, 663, 539, 619, 613, 615, 626, 593, 539, 604, 593, 297, 297, 684, 684, 684, 559, 955, 668, 680, 703, 701, 603, 590, 700, 713, 270, 597, 640, 580, 898, 748, 754, 650, 754, 672, 640, 552, 689, 667, 945, 606, 576, 570, 347, 455, 347, 684, 557, 268, 551, 595, 546, 595, 561, 395, 594, 581, 244, 260, 590, 267, 877, 581, 586, 595, 595, 379, 520, 392, 575, 536, 819, 585, 537, 537, 389, 264, 389, 684]
  const WB = [276, 327, 493, 592, 660, 867, 850, 293, 369, 369, 455, 707, 271, 440, 271, 504, 696, 575, 650, 644, 646, 657, 623, 575, 634, 623, 312, 312, 707, 707, 707, 587, 954, 703, 714, 738, 737, 633, 619, 735, 766, 317, 627, 672, 609, 957, 790, 776, 683, 770, 706, 672, 586, 723, 700, 1005, 655, 607, 607, 369, 478, 369, 707, 585, 314, 579, 625, 573, 625, 589, 415, 624, 610, 284, 284, 619, 284, 921, 610, 611, 625, 625, 398, 546, 412, 605, 563, 860, 614, 564, 564, 408, 326, 408, 707]
  const XC = 'àâäçéèêëîïôöùûüÿœæÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒÆ«»’‘“”–—…•·×÷±≤≥≠≈→←↑↓↔∞πσμλαβγδΣΔΦΩθ∩√°€²³½¼¾'
  const XW = [551, 551, 551, 546, 561, 561, 561, 561, 244, 244, 586, 586, 575, 575, 575, 537, 958, 919, 668, 668, 668, 703, 603, 603, 603, 603, 270, 270, 754, 754, 689, 689, 689, 553, 1088, 972, 533, 537, 229, 229, 377, 377, 591, 1000, 733, 406, 217, 684, 684, 684, 685, 685, 685, 685, 863, 863, 712, 712, 862, 817, 627, 575, 577, 498, 614, 548, 519, 584, 516, 645, 754, 755, 586, 702, 650, 404, 727, 366, 366, 931, 906, 952]
  const XMAP = new Map([...XC].map((c, i) => [c, XW[i]]))
  const FONT = 13, SMALL = 11.5, CAP = 10.5, MONO = 12.5

  // Largeur d'un texte en px. caps : petites capitales espacées (.08em, les titres de zones)
  function measure(t, size = FONT, o = {}) {
    const s = String(t ?? '')
    if (o.mono) return [...s].length * 0.61 * size
    let w = 0
    for (const c of s) {
      const k = c.codePointAt(0)
      if (k >= 32 && k < 127) w += (o.bold ? WB : WA)[k - 32]
      else if (k === 0xa0 || k === 0x202f || k === 0x2009) w += 274
      else w += (XMAP.get(c) ?? 640) * (o.bold ? 1.05 : 1)
    }
    return (w * size) / 1000 + (o.caps ? [...s].length * 0.08 * size : 0)
  }
  // Coupe en lignes de maxW au plus ; un mot trop long est coupé avec un tiret
  function wrap(t, maxW, size = FONT, o = {}) {
    const lines = []
    let cur = ''
    for (const w of String(t ?? '').split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${w}` : w
      if (!cur || measure(next, size, o) <= maxW) cur = next
      else { lines.push(cur); cur = w }
      while (measure(cur, size, o) > maxW && cur.length > 2) {
        let i = cur.length - 1
        while (i > 1 && measure(`${cur.slice(0, i)}-`, size, o) > maxW) i--
        lines.push(`${cur.slice(0, i)}-`); cur = cur.slice(i)
      }
    }
    if (cur) lines.push(cur)
    return lines.length ? lines : ['']
  }
  const widest = (lines, size, o) => Math.max(0, ...lines.map(l => measure(l, size, o)))
  // Du code (appel, affectation, crochets) s'écrit en chasse fixe
  const looksCode = t => /[(){};=[\]<>]|::|->|^[#~@$]|^\w+\.\w+/.test(String(t ?? ''))

  // ---------- Petits outils ----------
  const r = v => Math.round(v * 10) / 10
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const norm = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
  const str = (v, max = 80) => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s.length > max ? `${s.slice(0, max - 1)}…` : s }
  const arr = v => (Array.isArray(v) ? v : v == null ? [] : [v])
  const finite = v => (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(',', '.'))))
  const numv = v => (typeof v === 'number' ? v : Number(String(v).replace(',', '.')))
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0).toString(36) }
  // Un nombre à la française : 39,5 ; 24 500
  const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 })
  const num = (v, d) => (Number.isFinite(v) ? (d == null ? fr : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d })).format(v) : '')

  // Le ton d'un élément : un repère de couleur, jamais un aplat
  const TONS = { accent: 'acc', important: 'acc', actif: 'acc', courant: 'acc', erreur: 'err', danger: 'err', echec: 'err', exception: 'err', ok: 'ok', succes: 'ok', valide: 'ok', discret: 'dim', efface: 'dim', detruit: 'dim', inactif: 'dim', libere: 'dim' }
  const ton = v => TONS[norm(v)] ?? ''

  // ---------- Dessin ----------
  const rect = (x, y, w, h, cls = 's-box', rx = 8) => `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" rx="${rx}" class="${cls}"/>`
  // Une boîte d'élément, avec son repère de ton : bord coloré et trait à gauche ; « discret » : pointillés, pâle
  // L'important (« accent ») : une boîte pleine, son texte clair (ajouts1.png)
  function item(x, y, w, h, t = '', rx = 8) {
    if (t === 'dim') return rect(x, y, w, h, 's-box s-dimbox', rx)
    if (!t) return rect(x, y, w, h, 's-box', rx)
    if (t === 'acc') return rect(x, y, w, h, 's-box s-b-acc', rx)
    return rect(x, y, w, h, `s-box s-b-${t}`, rx) + `<rect x="${r(x + 1)}" y="${r(y + 4)}" width="2.5" height="${r(Math.max(2, h - 8))}" rx="1" class="s-f-${t}"/>`
  }
  // Un bloc de lignes ; y = son milieu vertical
  function text(x, yMid, lines, o = {}) {
    const size = o.size ?? FONT, step = size * (o.lh ?? 1.32), ls = arr(lines)
    const y0 = yMid - ((ls.length - 1) * step) / 2 + size * 0.36
    const cls = [o.cls ?? 's-t2', o.mono && 's-mono', o.caps && 's-caps', o.halo && 's-halo'].filter(Boolean).join(' ')
    const at = `class="${cls}" font-size="${r(size)}"${o.bold ? ' font-weight="600"' : ''}${o.italic ? ' font-style="italic"' : ''} text-anchor="${o.anchor ?? 'middle'}"`
    if (ls.length === 1) return `<text x="${r(x)}" y="${r(y0)}" ${at}>${esc(ls[0])}</text>`
    return `<text ${at}>${ls.map((l, i) => `<tspan x="${r(x)}" y="${r(y0 + i * step)}">${esc(l)}</tspan>`).join('')}</text>`
  }
  const textH = (n, size = FONT, lh = 1.32) => (n - 1) * size * lh + size * 1.1
  function icon(name, x, y, size = 16, cls = 's-ic') {
    const k = S.icons[name] ? name : S.iconAlias[norm(name)]
    if (!k || !S.icons[k]) return ''
    return `<g transform="translate(${r(x)},${r(y)}) scale(${r(size / 24 * 1000) / 1000})" class="${cls}">${S.icons[k]}</g>`
  }
  const hasIcon = name => !!(name && (S.icons[name] || S.iconAlias[norm(name)]))
  // Une ligne brisée aux coins arrondis (connecteurs orthogonaux)
  function path(pts, radius = 6) {
    const p = pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 0.01)
    let d = `M${r(p[0][0])},${r(p[0][1])}`
    for (let i = 1; i < p.length - 1; i++) {
      const [x0, y0] = p[i - 1], [x1, y1] = p[i], [x2, y2] = p[i + 1]
      const d1 = Math.hypot(x1 - x0, y1 - y0), d2 = Math.hypot(x2 - x1, y2 - y1), k = Math.min(radius, d1 / 2, d2 / 2)
      d += ` L${r(x1 - ((x1 - x0) / d1) * k)},${r(y1 - ((y1 - y0) / d1) * k)} Q${r(x1)},${r(y1)} ${r(x1 + ((x2 - x1) / d2) * k)},${r(y1 + ((y2 - y1) / d2) * k)}`
    }
    const last = p[p.length - 1]
    return `${d} L${r(last[0])},${r(last[1])}`
  }
  // Un trait, avec sa pointe : ah (pleine), open (ouverte : retour), tri (héritage), dia / diaf (agrégation, composition)
  function line(d, ctx, o = {}) {
    const t = o.ton && o.ton !== 'dim' ? `-${o.ton}` : ''
    const cls = `s-ln${t}${o.dash || o.ton === 'dim' ? ' s-dash' : ''}`
    const end = o.head === undefined ? `ah${t}` : o.head, start = o.start
    return `<path d="${d}" class="${cls}"${end ? ` marker-end="url(#${ctx.uid}-${end})"` : ''}${start ? ` marker-start="url(#${ctx.uid}-${start})"` : ''}/>`
  }
  // La boîte englobante de ce qui est dessiné (étiquettes comprises) : le dessin est recalé dessus
  function bbox() {
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity,
      add(x, y, w = 0, h = 0) { b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x + w); b.y1 = Math.max(b.y1, y + h); return b } }
    return b
  }
  const fit = (body, b) => (Number.isFinite(b.x0) ? { w: b.x1 - b.x0, h: b.y1 - b.y0, body: `<g transform="translate(${r(-b.x0)},${r(-b.y0)})">${body}</g>` } : { w: 10, h: 10, body })
  // Graduations « rondes » (1, 2, 5 × 10^k) entre a et b
  function ticks(a, b, n = 5) {
    const span = b - a || 1, raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p
    const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p, out = []
    for (let v = Math.ceil(a / step - 1e-9) * step; v <= b + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Math.round(v / step) * step)
    return { step, values: out }
  }
  // Les rangs d'un graphe orienté (pour les états, les algorithmes, les classes) : arcs retour repérés par un parcours
  // en profondeur depuis les départs, rang = plus long chemin sans eux, ordre dans un rang par barycentre des voisins.
  // nodes : ids ; edges : [[de, vers]] -> { rank: Map, order: [[ids]], back: Set(index d'arc) }
  function layers(nodes, edges, starts = []) {
    const out = new Map(nodes.map(n => [n, []])), back = new Set(), state = new Map(), seen = []
    edges.forEach(([a, b], i) => out.get(a)?.push([b, i]))
    const dfs = v => { state.set(v, 1); seen.push(v); for (const [w, i] of out.get(v) ?? []) { if (state.get(w) === 1) back.add(i); else if (!state.has(w)) dfs(w) } state.set(v, 2) }
    for (const s of [...starts, ...nodes]) if (!state.has(s)) dfs(s)
    const rank = new Map(nodes.map(n => [n, 0])), indeg = new Map(nodes.map(n => [n, 0]))
    edges.forEach(([, b], i) => { if (!back.has(i) && indeg.has(b)) indeg.set(b, indeg.get(b) + 1) })
    const q = nodes.filter(n => indeg.get(n) === 0)
    while (q.length) {
      const v = q.shift()
      for (const [w, i] of out.get(v) ?? []) {
        if (back.has(i)) continue
        rank.set(w, Math.max(rank.get(w), rank.get(v) + 1))
        indeg.set(w, indeg.get(w) - 1)
        if (!indeg.get(w)) q.push(w)
      }
    }
    const order = []
    for (const v of seen) (order[rank.get(v)] ??= []).push(v)
    const fwd = edges.filter((_, i) => !back.has(i))
    const pos = () => new Map(order.flatMap(l => (l ?? []).map((v, i) => [v, i])))
    for (let sweep = 0; sweep < 4; sweep++) {
      const p = pos()
      for (const l of order) {
        if (!l) continue
        const bc = v => { const nb = fwd.filter(([a, b]) => (sweep % 2 ? a === v : b === v)).map(([a, b]) => p.get(sweep % 2 ? b : a)); return nb.length ? nb.reduce((s, x) => s + x, 0) / nb.length : p.get(v) }
        l.sort((a, c) => bc(a) - bc(c))
      }
    }
    return { rank, order: order.map(l => l ?? []), back }
  }
  // Le point où le segment du centre de la boîte vers (tx, ty) sort de la boîte
  function exitPoint(b, tx, ty) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = tx - cx, dy = ty - cy
    if (!dx && !dy) return [cx, cy]
    const k = Math.min(dx ? (b.w / 2) / Math.abs(dx) : Infinity, dy ? (b.h / 2) / Math.abs(dy) : Infinity)
    return [cx + dx * k, cy + dy * k]
  }
  function defs(uid) {
    const m = (id, body, w = 8, h = 8, rx = 7.6, ry = 4) => `<marker id="${uid}-${id}" viewBox="0 0 ${w} ${h}" refX="${rx}" refY="${ry}" markerWidth="${w}" markerHeight="${h}" markerUnits="userSpaceOnUse" orient="auto-start-reverse">${body}</marker>`
    const head = c => `<path d="M0,0.6 L8,4 L0,7.4 z" class="${c}"/>`
    return `<defs>${m('ah', head('s-ah'))}${m('ah-acc', head('s-ah-acc'))}${m('ah-err', head('s-ah-err'))}${m('ah-ok', head('s-ah-ok'))}`
      + `${m('open', '<path d="M0.6,0.8 L7.6,4 L0.6,7.2" class="s-ln"/>')}${m('tri', '<path d="M1,1 L12,6.5 L1,12 z" class="s-tri"/>', 13, 13, 12, 6.5)}`
      + `${m('dia', '<path d="M1,6 L7.5,1.5 L14,6 L7.5,10.5 z" class="s-dia"/>', 15, 12, 14, 6)}${m('diaf', '<path d="M1,6 L7.5,1.5 L14,6 L7.5,10.5 z" class="s-diaf"/>', 15, 12, 14, 6)}</defs>`
  }

  // ---------- Couleurs : des variables ; le lecteur donne les siennes (clair, sombre), l'image fixe celles du PDF ----------
  const RULES = '.sch{font-family:"Geist Variable","Geist","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;stroke:none}.sch text{stroke:none}'
    + '.sch text{fill:var(--s-t2)}.sch .s-t1{fill:var(--s-t1)}.sch .s-t2{fill:var(--s-t2)}.sch .s-t3{fill:var(--s-t3)}'
    + '.sch .s-mono{font-family:"Geist Mono Variable","Geist Mono","Cascadia Mono",Consolas,monospace}.sch .s-caps{letter-spacing:.08em}'
    + '.sch .s-bg{fill:var(--s-bg)}.sch .s-zone{fill:var(--s-surf);stroke:var(--s-line);stroke-width:1}'
    + '.sch .s-box{fill:var(--s-item);stroke:var(--s-line2);stroke-width:1.2}.sch .s-dec{fill:var(--s-surf);stroke:var(--s-dec,var(--s-line2));stroke-width:1.4}.sch .s-term{fill:var(--s-surf);stroke:var(--s-line2);stroke-width:1.4}.sch .s-dimbox{fill:none;stroke-dasharray:3 3;opacity:.7}'
    + '.sch .s-plain{fill:var(--s-item);stroke:none}.sch .s-hair{fill:none;stroke:var(--s-line);stroke-width:1}.sch .s-axis{fill:none;stroke:var(--s-line2);stroke-width:1}'
    + '.sch .s-ln{fill:none;stroke:var(--s-ln,var(--s-t2));stroke-width:1.4}.sch .s-dash{stroke-dasharray:4 3}.sch .s-ah{fill:var(--s-ln,var(--s-t2))}'
    + '.sch .s-tri,.sch .s-dia{fill:var(--s-item);stroke:var(--s-t2);stroke-width:1.3}.sch .s-diaf{fill:var(--s-t2)}'
    + '.sch .s-ic{fill:none;stroke:var(--s-t3);stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}'
    + '.sch .s-b-acc{fill:var(--s-accbox,var(--s-item))}.sch .s-head{fill:var(--s-accbox,var(--s-item));fill-opacity:.55}.sch .s-cell{fill:none;stroke:var(--s-line);stroke-width:1}'
    + '.sch .s-halo{paint-order:stroke;stroke:var(--s-bg);stroke-width:5px;stroke-linejoin:round}.sch .s-dim{opacity:.5}'
    + ['acc', 'err', 'ok', 'k1', 'k3'].map(k => `.sch .s-b-${k}{stroke:var(--s-${k})}.sch .s-f-${k}{fill:var(--s-${k})}.sch .s-tc-${k}{fill:var(--s-${k}${k === 'acc' ? 't,var(--s-acc)' : ''})}`
      + `.sch .s-ln-${k}{fill:none;stroke:var(--s-${k});stroke-width:1.6}.sch .s-ah-${k}{fill:var(--s-${k})}.sch .s-area-${k}{fill:var(--s-${k});fill-opacity:.16}`
      + `.sch .s-ic-${k}{fill:none;stroke:var(--s-${k});stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}`).join('')
  // L'image fixe : la page du PDF (encre presque noire, filets beiges, la rouille des pièges) et des teintes OKLCH
  // L .5 C .095 converties en hex (un lecteur d'images qui ignore oklch() les affiche quand même)
  // Rangées sous l'id du dessin : une image fixe posée dans une page (un <style> de SVG vaut pour toute la page) ne
  // repeint pas les dessins voisins aux couleurs du lecteur
  const PAPER = id => `#${id}{--s-bg:#fbfaf8;--s-surf:#f3f2ee;--s-item:#ffffff;--s-line:#dfddd7;--s-line2:#b8b6af;--s-t1:#1b1b1a;--s-t2:#3b3a37;--s-t3:#6a6a66;`
    + '--s-acc:#4a3bb8;--s-accbox:#e6e2fb;--s-acct:#2f2390;--s-ln:#3b3a37;--s-ok:#2e734b;--s-k1:#8c5329;--s-k3:#6c5691;--s-err:#a33a1f}'
  const HUES = ['acc', 'ok', 'k1', 'k3', 'err'] // l'ordre des séries d'une courbe, des groupes d'un dendrogramme

  // ---------- Lecture d'un bloc ```schema (JSON, avec un peu de tolérance) ----------
  function parse(src) {
    const t = String(src ?? '').replace(/^﻿/, '').trim()
    try { return JSON.parse(t) } catch {}
    try { return JSON.parse(t.replace(/^\s*\/\/[^\n]*$/gm, '').replace(/,\s*([}\]])/g, '$1')) } catch (e) { throw new Error(`JSON illisible (${e.message})`) }
  }

  // Un type : { name, alias, check(spec, err), steps?(spec), captions?(spec), render(spec, ctx) -> { w, h, body } }
  function type(def) { S.types[def.name] = def; for (const a of def.alias ?? []) S.alias[a] = def.name; return def }
  // opts.libre : sans les limites de taille faites pour les schémas écrits par l'IA (l'IDE dessine un vrai programme)
  function validate(spec, opts = {}) {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return { ok: false, errors: ['un schéma est un objet JSON { "type": … }'] }
    const k = norm(spec.type), T = S.types[S.alias[k] ?? k]
    if (!T) return { ok: false, errors: [`type inconnu « ${str(spec.type, 30)} » (connus : ${Object.keys(S.types).join(', ')})`] }
    const out = JSON.parse(JSON.stringify(spec)), errors = []
    out.type = T.name; out._as = k // le nom écrit par l'IA (« cascade », « heritage »…) : certains types s'en servent
    out.titre = str(out.titre, 120)
    try { T.check(out, m => errors.push(m), { libre: !!opts.libre }) } catch (e) { errors.push(e.message) }
    return errors.length ? { ok: false, errors } : { ok: true, spec: out }
  }
  // spec -> { svg, width, height, steps, captions }. opts : step (0…n-1, sinon l'image fixe), theme 'paper' (image
  // fixe, ses couleurs dedans) ou 'css' (le lecteur donne les couleurs), uid (identifiants des pointes de flèche), libre
  function render(spec, opts = {}) {
    const v = validate(spec, opts)
    if (!v.ok) throw new Error(v.errors.join(' ; '))
    const T = S.types[v.spec.type], n = Math.max(1, T.steps?.(v.spec) ?? 1)
    const step = opts.step == null ? null : Math.max(0, Math.min(n - 1, Math.round(opts.step)))
    // l'image fixe et le dessin du lecteur ont chacun leurs identifiants : posés dans la même page, ni leurs couleurs
    // ni leurs pointes de flèche ne se mélangent
    const paper = opts.theme !== 'css', uid = `${opts.uid ?? `s${hash(JSON.stringify(v.spec))}`}${paper ? 'p' : ''}`
    const out = T.render(v.spec, { uid, step, steps: n, paper })
    const pad = 14, W = Math.ceil(out.w + 2 * pad), H = Math.ceil(out.h + 2 * pad)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" id="${uid}" class="sch" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(v.spec.titre || T.name)}">`
      + `<style>${paper ? PAPER(uid) : ''}${RULES}</style>${defs(uid)}${paper ? `<rect width="${W}" height="${H}" rx="6" class="s-bg"/>` : ''}`
      + `<g transform="translate(${pad},${pad})">${out.body}</g></svg>`
    if (/NaN|Infinity|undefined/.test(svg.replace(/aria-label="[^"]*"/, ''))) throw new Error(`dessin raté (${T.name}) : une valeur manque`)
    return { svg, width: W, height: H, steps: n, captions: (T.captions?.(v.spec) ?? []).map(c => str(c, 200)) }
  }

  Object.assign(S, { FONT, SMALL, CAP, MONO, HUES, measure, wrap, widest, looksCode, r, esc, norm, str, arr, finite, numv, num, hash, ton,
    rect, item, text, textH, icon, hasIcon, path, line, bbox, fit, ticks, layers, exitPoint, parse, type, validate, render })
  return S
})

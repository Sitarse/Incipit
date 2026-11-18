// Le site d'un cours : « Mes statistiques » et « Votre progression » (ajouts1.png). Rien d'inventé : la maîtrise est la
// moyenne de tes quiz, les chapitres viennent de ta progression, le temps d'étude est compté par le site lui-même
// (30 s par 30 s, fenêtre visible, un cours ouvert : lecteur.js le garde par jour). Utilise lecteur-ui.js et lecteur-plus.js.

// ---------- Le temps d'étude ----------
setInterval(() => { if (S.cur && document.visibilityState === 'visible' && document.hasFocus()) L.call('tick') }, 30e3)

// ---------- Votre progression : les parties du cours en étapes, et la prochaine chose à faire ----------
const CHECK = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>'
function progressHtml() {
  const parts = S.groups.filter(g => g.title && !g.rev)
  if (!parts.length) return ''
  const stateOf = g => { const cs = g.items.filter(i => counts(S.items[i])), d = cs.filter(i => isDone(S.items[i])).length; return cs.length && d === cs.length ? 'done' : d ? 'cur' : 'todo' }
  const states = parts.map(stateOf), cur = states.findIndex(s => s !== 'done')
  const next = S.items.find(it => counts(it) && !isDone(it) && it.kind !== 'intro')
  return `<section class="steps-card"><div class="lab">Mon parcours</div><h2>Votre progression</h2>
    <ol class="steps">${parts.map((g, i) => { const st = states[i] === 'done' ? 'done' : i === cur ? 'cur' : 'todo'; return `<li data-st="${st}"><span class="dot">${st === 'done' ? CHECK : i + 1}</span><span class="nm">${esc(g.title)}</span></li>` }).join('')}</ol>
    ${next ? `<div class="next-step"><svg viewBox="0 0 24 24"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg><span><b>Prochaine étape</b><small>${esc(next.title)}</small></span><button class="btn-p sm" data-act="goNext" data-i="${next.i}">Continuer →</button></div>` : ''}</section>`
}
chapEl.addEventListener('click', e => { const b = e.target.closest('[data-act="goNext"]'); if (b) go(+b.dataset.i) })

// ---------- Mes statistiques ----------
const DAY = 864e5
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
// Les minutes de chaque semaine (lundi → dimanche), les 5 dernières
function weeks(days, now = Date.now()) {
  const d = new Date(now), monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime()
  return [4, 3, 2, 1, 0].map(k => {
    const start = monday - k * 7 * DAY
    let s = 0
    for (let j = 0; j < 7; j++) s += days[dayKey(start + j * DAY)] ?? 0
    return { label: new Date(start).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), min: Math.round(s / 60) }
  })
}
const hm = sec => { const m = Math.round(sec / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` }
function donut(p) {
  const R = 52, C = 2 * Math.PI * R, v = p === null ? 0 : Math.max(0, Math.min(1, p))
  return `<svg class="donut" viewBox="0 0 128 128"><circle cx="64" cy="64" r="${R}" class="dn-bg"/><circle cx="64" cy="64" r="${R}" class="dn-v" stroke-dasharray="${(C * v).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 64 64)"/>
    <text x="64" y="72" text-anchor="middle">${p === null ? '—' : `${Math.round(v * 100)}%`}</text></svg>`
}
function lineChart(ws) {
  const W = 560, H = 190, L0 = 44, B = H - 28, max = Math.max(40, ...ws.map(w => w.min)), top = Math.ceil(max / 40) * 40 // des quarts ronds (10, 20…)
  const X = i => L0 + (i * (W - L0 - 16)) / (ws.length - 1), Y = v => 12 + (B - 12) * (1 - v / top)
  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => `<path d="M${L0},${Y(top * f).toFixed(1)} H${W - 16}" class="ch-grid"/><text x="${L0 - 8}" y="${(Y(top * f) + 4).toFixed(1)}" text-anchor="end">${Math.round(top * f)}</text>`).join('')
  const pts = ws.map((w, i) => `${X(i).toFixed(1)},${Y(w.min).toFixed(1)}`)
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${grid}<polyline points="${pts.join(' ')}" class="ch-line"/>${ws.map((w, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(w.min).toFixed(1)}" r="4.5" class="ch-dot"/><text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(w.label)}</text>`).join('')}</svg>`
}
LOAD.stats = async () => {
  const st = await L.call('stats') ?? {}, days = st.days ?? {}, q = st.quiz ?? []
  const avg = q.length ? q.reduce((a, b) => a + b, 0) / q.length : null
  const total = Object.values(days).reduce((a, b) => a + b, 0), ws = weeks(days)
  const TROPHY = '<svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>'
  const CLOCK = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  const FLAME = '<svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>'
  paint(pnHead('Pour réviser', 'Mes statistiques', 'Tous tes cours. Le temps d’étude est compté depuis le 17 novembre 2026, quand le site est ouvert sur un cours.')
    + `<div id="serieHero"></div><div class="stats"><div class="st-mastery">${donut(avg)}<b>Maîtrise globale</b><small>${avg === null ? 'fais un quiz pour la mesurer' : `moyenne de ${q.length} quiz`}</small></div>
      <div class="st-chart"><div class="lab">Minutes d’étude par semaine</div>${lineChart(ws)}</div></div>
    <div class="st-tiles"><div class="st-tile">${TROPHY}<span><b>${st.done ?? 0}</b><small>Chapitres terminés</small></span></div>
      <div class="st-tile">${CLOCK}<span><b>${hm(total)}</b><small>Temps d’étude</small></span></div>
      <div class="st-tile">${FLAME}<span><b>${SER.s?.best ?? 0}</b><small>Record de série</small></span></div></div>`)
  paintSerie() // la série elle-même : la grande carte en haut (lecteur-serie.js)
}

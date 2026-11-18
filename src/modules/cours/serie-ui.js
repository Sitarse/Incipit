// La série du jour dans Hitodama (comme Duolingo ; les comptes : serie.js, par le canal « serie » de main.js) :
// - en haut à droite du panneau, la flamme et le nombre de jours (orange : objectif du jour fait ; éteinte sinon ;
//   rouge avec le décompte à partir de 21 h) ; un clic ouvre l'onglet Cours ;
// - dans l'onglet Cours, en tête d'« Aujourd'hui », la grande carte : la série, la semaine, ce qu'il reste à faire ;
// - à partir de 21 h, objectif pas fait : l'îlot garde une barre rouge avec le décompte jusqu'à minuit, et une grosse
//   alerte sonne à 21 h, 22 h, 23 h, 23 h 30, 23 h 45 et 23 h 55 ;
// - l'objectif atteint : une alerte de fête sous l'îlot, une fois par jour.
const SERIE = (() => {
  const api = window.api.mod('cours')
  const EVENING = 21, SLOTS = [[21, 0], [22, 0], [23, 0], [23, 30], [23, 45], [23, 55]]
  const FLAME = 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z'
  const TICK = 'M20 6 9 17l-5-5'
  let s = null, wasDone = null, loading = false
  const jours = n => `${n} jour${n > 1 ? 's' : ''}`
  const leftMs = () => { const m = new Date(); m.setHours(24, 0, 0, 0); return m - Date.now() }
  const hms = ms => { const t = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(t / 3600)}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}` }
  const evening = () => new Date().getHours() >= EVENING
  const risk = () => !!s && !s.done && evening()
  const read = (k, d) => { try { return JSON.parse(localStorage[`serie.${k}`]) ?? d } catch { return d } }
  const write = (k, v) => { try { localStorage[`serie.${k}`] = JSON.stringify(v) } catch {} }

  async function load() {
    if (loading) return
    loading = true
    try {
      const v = await api.invoke('serie')
      if (!v || typeof v.streak !== 'number') return
      const before = wasDone
      s = v; wasDone = v.done
      paint()
      if (before === false && v.done && read('fete', '') !== v.today) { write('fete', v.today); party() }
    } catch (err) { console.error('Série :', err) } finally { loading = false }
  }

  // ---------- En haut à droite du panneau ----------
  function chip() {
    const hdr = $('.hdr')
    if (!hdr) return null
    let c = hdr.querySelector('.hdr-serie')
    if (!c) { c = document.createElement('button'); c.className = 'hdr-serie'; c.dataset.cn = 'serieOpen'; hdr.append(c) }
    return c
  }
  function paintChip() {
    const c = chip()
    if (!c || !s) return
    const st = s.done ? 'done' : risk() ? 'risk' : 'todo'
    c.dataset.state = st
    c.innerHTML = `${svg(FLAME)}<b>${s.streak}</b>${st === 'risk' ? `<em>${hms(leftMs())}</em>` : st === 'done' ? `<i>${svg(TICK)}</i>` : ''}`
    c.title = s.done ? `Série de ${jours(s.streak)} : objectif du jour fait` : `Objectif du jour pas encore fait${s.prev ? ` : ta série de ${jours(s.prev)} s’éteint à minuit` : ''}`
    fitChip(c, st)
  }
  // sa largeur : la musique de l'en-tête se pose juste avant. Mesurée panneau ouvert ; fermé (rien à mesurer), estimée
  function fitChip(c = $('.hdr-serie'), st = c?.dataset.state) {
    if (!c || !s) return
    const w = c.offsetWidth ? c.offsetWidth + 8 : 19 + 17 + 5 + String(s.streak).length * 10 + (st === 'risk' ? 72 : st === 'done' ? 22 : 0) + 8
    if ($('.hdr').style.getPropertyValue('--serie-w') !== `${w}px`) $('.hdr').style.setProperty('--serie-w', `${w}px`)
  }

  // ---------- La grande carte, en tête d'« Aujourd'hui » (cours.js l'appelle) ----------
  function block() {
    if (!s) return ''
    const st = s.done ? 'done' : risk() ? 'risk' : 'todo', p = s.progress, g = s.goal
    const week = s.week.map(d => `<span class="sr-d${d.done ? ' ok' : ''}${d.today ? ' now' : ''}${d.future ? ' fut' : ''}"><i>${d.done ? svg(TICK) : ''}</i><small>${d.label}</small></span>`).join('')
    const it = (n, of, l) => `<span class="${n >= of ? 'ok' : ''}"><b>${Math.min(n, of)}/${of}</b> ${l}</span>`
    const line = s.done ? `<b class="sr-ok">Objectif du jour fait</b><small>Demain : ${jours(s.streak + 1)}</small>`
      : st === 'risk' ? `<b class="sr-risk">Plus que <em class="sr-left">${hms(leftMs())}</em></b><small>${s.prev ? `Ta série de ${jours(s.prev)} s’éteint à minuit` : 'avant minuit pour lancer ta série'}</small>`
      : `<b>Pas encore fait aujourd’hui</b><small>${s.prev ? `Ta série de ${jours(s.prev)} est en jeu` : s.lost ? `Série de ${jours(s.lost)} perdue hier` : 'Lance ta série aujourd’hui'}</small>`
    return `<div class="cn-block sr" data-state="${st}"><div class="sr-top"><span class="sr-fire">${svg(FLAME)}<b>${s.streak}</b></span><span class="sr-line">${line}</span></div>
      <div class="sr-week">${week}</div>
      ${s.done ? '' : `<div class="sr-goal">${it(p.chap, g.chap, 'chapitre')}<i>ou</i>${it(p.quiz, g.quiz, 'quiz')}<i>ou</i>${it(p.cards, g.cards, 'cartes')}<i>ou</i>${it(p.min, g.min, 'min')}</div>`}</div>`
  }

  // ---------- L'îlot : la barre du soir ----------
  function timing() {
    if (!risk()) return null
    const l = leftMs()
    return { label: s.prev ? `Série de ${s.prev} j : s’éteint` : 'Objectif du jour', text: hms(l), p: Math.max(0, Math.min(1, l / (3 * 3600e3))) }
  }

  // ---------- Les alertes : le soir, puis la fête ----------
  function due(now = new Date()) {
    const day = s?.today, seen = read('vus', { day: '', slots: [] })
    const list = seen.day === day ? seen.slots : []
    const passed = SLOTS.map(([h, m]) => `${h}:${m}`).filter((k, i) => now.getHours() * 60 + now.getMinutes() >= SLOTS[i][0] * 60 + SLOTS[i][1])
    const fresh = passed.filter(k => !list.includes(k))
    if (!fresh.length) return false
    write('vus', { day, slots: passed }) // celles déjà passées ne sonnent plus : seulement la dernière
    return true
  }
  function alarmHtml() {
    const l = leftMs(), h = Math.floor(l / 3600e3), m = Math.floor((l % 3600e3) / 60e3)
    const when = h ? `${h} h ${pad(m)}` : `${m} min`
    return `<div class="sa" data-state="risk"><i class="sa-fire">${svg(FLAME)}</i>
      <span><b>${s.prev ? `Ta série de ${jours(s.prev)} s’éteint dans ${when}` : `Objectif du jour pas fait : ${when} avant minuit`}</b>
      <small>1 chapitre, 1 quiz, 10 flash cards ou 15 min de lecture. Clique pour t’y mettre.</small></span><em class="sa-left">${hms(l)}</em></div>`
  }
  const partyHtml = () => `<div class="sa" data-state="done"><i class="sa-fire">${svg(FLAME)}</i>
      <span><b>${s.streak > 1 ? `${jours(s.streak)} de série !` : 'Ta série commence !'}</b><small>Objectif du jour atteint${s.streak >= s.best && s.streak > 1 ? ' · c’est ton record' : ''}. Reviens demain.</small></span><em class="sa-n">${s.streak}</em></div>`
  function alarm() { showAlert({ kind: 'serie', ms: 30e3, html: alarmHtml() }); window.api.sound('timer') }
  function party() { showAlert({ kind: 'serie', ms: 12e3, html: partyHtml() }); window.api.sound('event') }

  function paint() {
    paintChip()
    zone.dataset.serie = risk() ? 'risk' : ''
    if (tabOf(tab) === 'cours' && state === 'open') IC.render?.()
  }
  // chaque seconde : le décompte ; une alerte du soir quand l'îlot est au repos ; à minuit, un nouveau jour
  let day = new Date().getDate()
  function tick() {
    if (new Date().getDate() !== day) { day = new Date().getDate(); load(); return }
    if (!s) return
    if (risk()) {
      const t = hms(leftMs())
      for (const el of [$('.hdr-serie em'), $('.sr-left'), $('.sa-left')]) if (el) el.textContent = t
      if (resting() && due()) alarm()
    }
    if (($('.hdr-serie')?.dataset.state === 'risk') !== risk()) paint() // 21 h vient de passer
    if (state === 'open') fitChip()
  }

  IC.actions.serieOpen = () => setTab('cours')
  defineModule({
    id: 'cours-serie',
    render: () => load(), // toutes les 30 s et à chaque nouvel agenda
    tick,
    timing,
    open: () => load(),
    brief: async () => { await load(); return s ? (s.prev ? `Ta série est de ${jours(s.prev)} : garde-la aujourd’hui.` : 'Fais ton objectif de cours aujourd’hui pour lancer une série.') : null },
    status: () => s ? `Série de cours : ${jours(s.streak)}, objectif du jour ${s.done ? 'fait' : 'pas encore fait'}` : null,
  })
  // un clic sur l'alerte de la série : le panneau s'ouvre sur l'onglet Cours
  alertEl.addEventListener('click', () => { if (zone.dataset.alert === 'serie') { setTab('cours') } }, true)
  load()
  // set : remplace l'état (essais seulement) ; html : les deux alertes, pour les vérifier sans les montrer
  return { block, load, get: () => s, set: v => { s = v; paint() }, timing, html: { alarm: alarmHtml, party: partyHtml } }
})()

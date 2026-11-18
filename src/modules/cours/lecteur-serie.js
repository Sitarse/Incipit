// La série du jour dans le site (comme Duolingo ; les comptes : serie.js) :
// - en haut à droite, la flamme et le nombre de jours : orange quand l'objectif du jour est fait, éteinte sinon ;
// - sur « Mes cours » et « Mes statistiques », la grande carte : la série, la semaine, ce qu'il reste à faire aujourd'hui ;
// - à partir de 21 h, objectif pas fait : un bandeau rouge en haut de la page, avec le décompte jusqu'à minuit ;
// - l'objectif atteint : une grande fête, une fois par jour.
// Utilise ce que lecteur-ui.js définit : $, $$, esc, S, L, go, counts, isDone, store, read.
const SER = { s: null, at: 0, wasDone: null }
const EVENING = 21
const FLAME = '<svg viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>'
const TICK = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>'
const hms = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
const leftNow = () => { const m = new Date(); m.setHours(24, 0, 0, 0); return m - Date.now() }
const evening = () => new Date().getHours() >= EVENING
const jours = n => `${n} jour${n > 1 ? 's' : ''}`

// ---------- Les données : relues toutes les 30 s, et juste après un chapitre, un quiz, une carte ----------
async function serieLoad(ev) {
  const s = await L.call('serie', ev)
  if (!s || typeof s.streak !== 'number') return
  const before = SER.wasDone
  SER.s = s; SER.at = Date.now(); SER.wasDone = s.done
  paintSerie()
  // l'objectif vient d'être atteint : la fête (une fois par jour)
  if (before === false && s.done && read('serieFete', '') !== s.today) { store('serieFete', s.today); celebrate(s) }
}
function serieEvent(kind) { serieLoad(kind) }
setInterval(() => serieLoad(), 30e3)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') serieLoad() })
// une carte révisée dans le site : relue un peu après (le panneau des cartes l'a enregistrée dans main.js)
document.addEventListener('click', e => { if (e.target.closest('[data-pn="grade"], [data-pn="qValid"], [data-pn="known"]')) setTimeout(() => serieLoad(), 600) })

// ---------- Ce qu'il reste à faire aujourd'hui ----------
function goalHtml(s) {
  const p = s.progress, g = s.goal
  const item = (n, of, label) => `<span class="sg-it${n >= of ? ' ok' : ''}"><b>${Math.min(n, of)}/${of}</b>${label}</span>`
  return `<div class="sg">${item(p.chap, g.chap, 'chapitre')}<i>ou</i>${item(p.quiz, g.quiz, 'quiz')}<i>ou</i>${item(p.cards, g.cards, 'flash cards')}<i>ou</i>${item(p.min, g.min, 'min de lecture')}</div>`
}
// La prochaine chose à faire dans le cours ouvert : le premier chapitre ou quiz pas encore fini
const nextTodo = () => S.cur ? S.items.find(it => counts(it) && it.kind !== 'intro' && !isDone(it)) : null

// ---------- En haut à droite ----------
function paintChip(s) {
  const c = $('#serieChip')
  if (!c) return
  const risk = !s.done && evening()
  c.dataset.state = s.done ? 'done' : risk ? 'risk' : 'todo'
  c.innerHTML = `${FLAME}<b>${s.streak}</b>${s.done ? `<i class="sc-ok">${TICK}</i>` : risk ? `<em data-left>${hms(leftNow())}</em>` : '<em>à faire</em>'}`
  c.title = s.done ? `Série de ${jours(s.streak)} : l’objectif du jour est fait` : `Objectif du jour pas encore fait${s.prev ? ` : ta série de ${jours(s.prev)} s’éteint à minuit` : ''}`
}

// ---------- La grande carte (accueil, statistiques) ----------
function heroHtml(s) {
  const risk = !s.done && evening(), todo = nextTodo()
  const week = s.week.map(d => `<span class="sw${d.done ? ' ok' : ''}${d.today ? ' now' : ''}${d.future ? ' fut' : ''}"><i>${d.done ? TICK : ''}</i><small>${d.label}</small></span>`).join('')
  const msg = s.done ? `<b class="sh-ok">${TICK}Objectif du jour atteint</b><span>Reviens demain pour passer à ${jours(s.streak + 1)}.</span>`
    : risk ? `<b class="sh-risk">Il reste <em data-left>${hms(leftNow())}</em> avant minuit</b><span>${s.prev ? `Ta série de ${jours(s.prev)} s’éteint si tu ne fais rien ce soir.` : 'Fais ton objectif ce soir pour lancer une série.'}</span>`
    : `<b>Objectif du jour : pas encore fait</b><span>${s.prev ? `Ta série de ${jours(s.prev)} est en jeu aujourd’hui.` : s.lost ? `Tu as perdu ta série de ${jours(s.lost)} hier. Recommence aujourd’hui.` : 'Fais-le aujourd’hui pour lancer ta série.'}</span>`
  return `<section class="sh" data-state="${s.done ? 'done' : risk ? 'risk' : 'todo'}">
    <div class="sh-fire">${FLAME}<b>${s.streak}</b><small>${s.streak > 1 ? 'jours de série' : 'jour de série'}</small></div>
    <div class="sh-main"><div class="sh-msg">${msg}</div>
      <div class="sh-week">${week}</div>
      ${s.done ? '' : goalHtml(s)}
      <div class="sh-foot"><small>Record : ${jours(s.best)} · ${s.total} jour${s.total > 1 ? 's' : ''} d’étude en tout</small>${!s.done && todo ? `<button class="btn-p sm" data-serie-go="${todo.i}">${todo.kind === 'quiz' ? 'Faire le quiz' : 'Continuer le cours'} →</button>` : ''}</div></div></section>`
}
function paintHero(s) { for (const h of $$('#serieHero')) h.innerHTML = heroHtml(s) }

// ---------- À partir de 21 h, objectif pas fait : le bandeau rouge ----------
function paintBanner(s) {
  const b = $('#serieBanner')
  if (!b) return
  b.hidden = s.done || !evening()
  if (b.hidden) return
  const todo = nextTodo()
  b.innerHTML = `${FLAME}<span><b>${s.prev ? `Ta série de ${jours(s.prev)} s’éteint à minuit` : 'Ton objectif du jour n’est pas fait'}</b><small>1 chapitre, 1 quiz, 10 flash cards ou 15 min de lecture suffisent</small></span>
    <strong data-left>${hms(leftNow())}</strong>${todo ? `<button data-serie-go="${todo.i}">${todo.kind === 'quiz' ? 'Faire le quiz' : 'Continuer le cours'} →</button>` : ''}`
}

function paintSerie() {
  const s = SER.s
  if (!s) return
  paintChip(s); paintHero(s); paintBanner(s)
}
// le décompte, chaque seconde ; à minuit, tout est relu (un nouveau jour)
let lastDay = new Date().getDate()
setInterval(() => {
  if (new Date().getDate() !== lastDay) { lastDay = new Date().getDate(); return serieLoad() }
  if (SER.s && !SER.s.done && evening()) { const t = hms(leftNow()); for (const el of $$('[data-left]')) el.textContent = t; if ($('#serieBanner')?.hidden || $('#serieChip')?.dataset.state !== 'risk') paintSerie() }
}, 1000)

// ---------- La fête : l'objectif du jour est atteint ----------
function celebrate(s) {
  const o = document.createElement('div')
  o.className = 'serie-fete'
  o.innerHTML = `<div class="sf-box"><div class="sf-fire">${FLAME}</div><b class="sf-n">${s.streak}</b><span class="sf-t">${s.streak > 1 ? 'jours de série !' : 'jour de série !'}</span>
    <p>${s.streak > 1 ? `Objectif du jour atteint : ta série passe à ${jours(s.streak)}.` : 'Objectif du jour atteint : ta série commence.'}${s.streak >= s.best && s.streak > 1 ? ' C’est ton record.' : ''}</p>
    <div class="sh-week">${s.week.map(d => `<span class="sw${d.done ? ' ok' : ''}${d.today ? ' now' : ''}${d.future ? ' fut' : ''}"><i>${d.done ? TICK : ''}</i><small>${d.label}</small></span>`).join('')}</div>
    <button class="btn-p">Continuer</button></div>`
  document.body.append(o)
  const close = () => o.remove()
  o.addEventListener('click', e => { if (e.target === o || e.target.closest('button')) close() })
  setTimeout(close, 9000)
}

// ---------- Les clics ----------
document.addEventListener('click', e => {
  const g = e.target.closest('[data-serie-go]')
  if (g) { go(+g.dataset.serieGo); return }
  if (e.target.closest('#serieChip') && S.cur) { const st = S.items.find(x => x.id === 'r-stats'); if (st) go(st.i) }
  else if (e.target.closest('#serieChip')) showHome()
})
serieLoad()

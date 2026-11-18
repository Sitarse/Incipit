// La série (comme Duolingo) : un jour compte quand l'objectif du jour est atteint, avec au choix
// 1 chapitre ou 1 quiz terminé dans le site, 10 flash cards révisées (le panneau ou le site), 15 min de lecture.
// La série, c'est le nombre de jours d'affilée ; elle s'éteint à minuit si l'objectif du jour n'est pas fait.
// Gardé dans DATA/serie.json (chapitres, quiz, cartes par jour) ; le temps de lecture vient de lecteur-activite.json
// (le site le compte, lecteur.js). Partie pure (dayKey, doneDay, compute) testée dans tests/serie.test.js.
const fs = require('node:fs')
const path = require('node:path')

const GOAL = { chap: 1, quiz: 1, cards: 10, min: 15 }
const DAY = 864e5
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
// Le même jour, n jours plus tôt (midi : pas de piège au changement d'heure)
const shift = (t, n) => { const d = new Date(t); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d.getTime() }
const doneDay = d => !!d && ((d.chap ?? 0) >= GOAL.chap || (d.quiz ?? 0) >= GOAL.quiz || (d.cards ?? 0) >= GOAL.cards || (d.sec ?? 0) >= GOAL.min * 60)
// La série qui finit le jour t (inclus) : combien de jours faits d'affilée en remontant
function runEnding(days, t) { let n = 0; while (doneDay(days[dayKey(shift(t, -n))])) n++; return n }

// days : { 'AAAA-MM-JJ': { chap, quiz, cards, sec } } -> tout ce que les écrans affichent
function compute(days, now = Date.now()) {
  const today = days[dayKey(now)] ?? {}, done = doneDay(today)
  const prev = runEnding(days, shift(now, -1)) // la série jusqu'à hier
  const streak = prev + (done ? 1 : 0)
  // perdue hier : avant-hier était fait, hier non ; on le dit tant qu'aujourd'hui n'est pas fait
  const lost = !done && !prev ? runEnding(days, shift(now, -2)) : 0
  // le record : la plus longue série, mesurée depuis chaque jour qui en termine une
  let best = streak
  for (const k of Object.keys(days)) {
    const t = new Date(`${k}T12:00:00`).getTime()
    if (doneDay(days[k]) && !doneDay(days[dayKey(shift(t, 1))])) best = Math.max(best, runEnding(days, t))
  }
  // la semaine en cours, du lundi au dimanche
  const d = new Date(now), monday = shift(now, -((d.getDay() + 6) % 7))
  const week = [...Array(7)].map((_, i) => { const t = shift(monday, i), k = dayKey(t); return { key: k, label: 'LMMJVSD'[i], done: doneDay(days[k]), today: k === dayKey(now), future: t > shift(now, 0) } })
  const midnight = new Date(now); midnight.setHours(24, 0, 0, 0)
  return {
    today: dayKey(now), done, streak, prev, lost, best, week, goal: GOAL,
    progress: { chap: today.chap ?? 0, quiz: today.quiz ?? 0, cards: today.cards ?? 0, min: Math.floor((today.sec ?? 0) / 60) },
    left: midnight.getTime() - now, // le temps qui reste avant minuit, en ms
    total: Object.values(days).filter(doneDay).length,
  }
}

module.exports = data => {
  const FILE = path.join(data, 'serie.json'), ACTIVITY = path.join(data, 'lecteur-activite.json')
  const readJson = f => { try { const v = JSON.parse(fs.readFileSync(f, 'utf8')); return v && typeof v === 'object' ? v : {} } catch { return {} } }
  function days() {
    const own = readJson(FILE), sec = readJson(ACTIVITY), out = {}
    for (const [k, v] of Object.entries(own)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && v && typeof v === 'object') out[k] = { chap: +v.chap || 0, quiz: +v.quiz || 0, cards: +v.cards || 0 }
    for (const [k, v] of Object.entries(sec)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(+v)) (out[k] ??= {}).sec = +v
    return out
  }
  // Un chapitre, un quiz terminé, une carte révisée : compté pour aujourd'hui
  function record(kind, n = 1) {
    if (!['chap', 'quiz', 'cards'].includes(kind)) return false
    const all = readJson(FILE), k = dayKey(Date.now())
    all[k] = { ...all[k], [kind]: (+all[k]?.[kind] || 0) + Math.max(1, Math.min(50, Math.round(n) || 1)) }
    fs.mkdirSync(data, { recursive: true })
    fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(all)); fs.renameSync(`${FILE}.tmp`, FILE)
    return true
  }
  return { record, state: () => compute(days()) }
}
Object.assign(module.exports, { GOAL, dayKey, doneDay, compute })

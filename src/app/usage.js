const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// Ce que Hito consomme : les jetons de chaque réponse de Claude (journal usage.jsonl, des nombres seulement, jamais ce
// qui a été dit) et ton quota Claude Pro (fenêtres de 5 h et de la semaine, ce que lit /usage dans Claude Code, avec
// sa connexion). Repris de Kryon (stats.ts, kryon.ts : claudeTotals/usage), MIT © 2026 CryoforgeNexus.
// Différence avec Kryon : son coût en dollars ne dit rien sur un abonnement ; ici c'est le quota qui compte, et Jev
// s'en sert pour rester sur Haiku quand il est presque plein (low()).

// Jetons d'une réponse (le champ usage du résultat de Claude Code : cette réponse seule). in : neufs ; write : écrits
// dans le cache (un peu plus chers que neufs : toute la conversation, quand le modèle change) ; cached : relus du cache,
// dix fois moins chers ; out : écrits par le modèle. Pur : testé dans tests/usage.test.js.
function tokensOf(u) {
  if (!u || typeof u !== 'object') return null
  return { in: u.input_tokens ?? 0, write: u.cache_creation_input_tokens ?? 0, cached: u.cache_read_input_tokens ?? 0, out: u.output_tokens ?? 0 }
}

// Le total d'une liste de lignes du journal, celles d'aujourd'hui (heure locale) ; src : seulement celles-là
// (« routine » : les routines IA, routines-ia.js)
function sumToday(rows, now = Date.now(), src = null) {
  const d = new Date(now), start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return rows.filter(r => r.at >= start && (!src || r.src === src)).reduce((s, r) => ({ runs: s.runs + 1, in: s.in + r.in, write: s.write + (r.write ?? 0), cached: s.cached + r.cached, out: s.out + r.out }),
    { runs: 0, in: 0, write: 0, cached: 0, out: 0 })
}

// Quota presque plein (85 % de la fenêtre de 5 h ou de la semaine) : Jev ne monte plus vers Sonnet ou Opus
const LOW = 85
const isLow = q => !!q && (q.five >= LOW || q.week >= LOW)

let file = null, rows = null
function open(f) { file = f; rows = null }
function load() {
  if (rows) return rows
  rows = []
  try {
    // ponytail: tout le fichier est relu une fois au lancement ; à couper par mois s'il devient gros (~60 octets la ligne)
    for (const l of fs.readFileSync(file, 'utf8').split('\n')) try { const r = JSON.parse(l); if (r.at) rows.push(r) } catch {}
  } catch {}
  return rows
}
// Une réponse de Claude : model (haiku, sonnet, opus), usage (le champ du résultat), src (« routine » ou rien). Rend ses jetons
function record(model, u, src = null) {
  const t = tokensOf(u)
  if (!t || !file) return null
  const r = { at: Date.now(), model, ...t, ...(src ? { src } : {}) }
  load().push(r)
  fs.appendFile(file, `${JSON.stringify(r)}\n`, err => err && console.error('Conso :', err.message))
  return t
}
const today = (src = null) => sumToday(load(), Date.now(), src)

// Ton quota Claude Pro, relu au plus toutes les 5 min ; null tant qu'on ne le connaît pas (pas connecté, hors ligne)
const QUOTA_MS = 5 * 60e3
let quota = null, quotaAt = 0, asking = null
const credentials = () => path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), '.credentials.json')
async function fetchQuota() {
  const token = JSON.parse(fs.readFileSync(credentials(), 'utf8')).claudeAiOauth?.accessToken
  if (!token) return null
  const r = await fetch('https://api.anthropic.com/api/oauth/usage', {
    headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' }, signal: AbortSignal.timeout(10e3) })
  if (!r.ok) return null
  const d = await r.json(), at = s => (s ? Date.parse(s) || 0 : 0)
  return { five: d.five_hour?.utilization ?? 0, fiveReset: at(d.five_hour?.resets_at), week: d.seven_day?.utilization ?? 0, weekReset: at(d.seven_day?.resets_at) }
}
// Rend le dernier connu tout de suite et le relit en fond s'il est vieux ; fresh : attendre la relecture
function getQuota(fresh = false) {
  if (Date.now() - quotaAt > QUOTA_MS && !asking) {
    // Raté (hors ligne, connexion expirée) : on réessaie aussi dans 5 min, pas à chaque demande
    asking = fetchQuota().then(q => { if (q) quota = q }).catch(() => {}).finally(() => { asking = null; quotaAt = Date.now() })
  }
  return fresh && asking ? asking.then(() => quota) : Promise.resolve(quota)
}
const low = () => isLow(quota)

module.exports = { tokensOf, sumToday, isLow, LOW, open, record, today, getQuota, low }

// Ce que le module Cours trouvait dans le panneau de Hitodama (ui/core.js) : de petits outils et les crochets d'un module.
// Ici l'onglet Cours est toute la fenêtre, donc « ouvert » et « au repos » ont un sens fixe.
const zone = document.getElementById('zone')
const $ = s => zone.querySelector(s)
const alertEl = $('.alert')
let state = 'open', tab = 'cours', dragging = false
const shown = new Set(), queue = []

// window.api.mod('cours') : le module l'appelle avec son nom, la fenêtre n'en connaît qu'un
const fr = (t, o) => new Date(t).toLocaleString('fr-FR', o)
const pad = n => String(n).padStart(2, '0')
const startOfDay = t => new Date(t).setHours(0, 0, 0, 0)
const esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)
const cap = s => s[0].toUpperCase() + s.slice(1)
const svg = (d, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`
const I = { cross: 'M18 6 6 18M6 6l12 12' }
const emptyState = (icon, title, text, action = '', extra = '') =>
  `<div class="empty-state"><i class="es-icon">${svg(icon)}</i><b>${title}</b><span>${text}</span>${extra}${action}</div>`
const isField = el => el?.matches?.('input:not([type=range]):not([type=checkbox]), textarea')
const setHtml = (el, html) => { if (el.innerHTML !== html) el.innerHTML = html }
const fade = l => l?.classList.toggle('more', l.scrollTop + l.clientHeight < l.scrollHeight - 1)

// Un seul onglet : il n'y a rien à changer, et la fenêtre est toujours ouverte (jamais « au repos », comme l'îlot)
const tabOf = t => t
const setTab = () => {}
const resting = () => true
const soulFeel = () => {} // l'âme de Hito s'éclairait ici
const openSettingsAt = () => IC.actions.settings?.() // la clé Gemini se règle dans les réglages des cours

// Les modules s'enregistrent (defineModule) : on garde leurs crochets, on appelle ceux qui servent ici
const MODULES = new Map()
const defineModule = m => { MODULES.set(m.id, m); m.open?.() }
setInterval(() => { for (const m of MODULES.values()) { try { m.tick?.() } catch (err) { console.error(err) } } }, 1000)
setInterval(() => { for (const m of MODULES.values()) { try { m.render?.() } catch (err) { console.error(err) } } }, 30e3)

// Une alerte (la série le soir, ou la fête quand l'objectif est atteint) : un bandeau en haut, qui se referme seul ou au clic
let alertTimer
function showAlert({ html, kind = '', ms = 12e3 }) {
  clearTimeout(alertTimer)
  alertEl.innerHTML = html
  zone.dataset.alert = kind
  alertEl.dataset.on = 'true'
  alertTimer = setTimeout(hideAlert, ms)
}
function hideAlert() { alertEl.dataset.on = 'false'; zone.dataset.alert = '' }
alertEl.addEventListener('click', hideAlert)

// Les clics d'un module (son crochet clicks : [[sélecteur, (élément, cible, événement) => …]]), du plus précis au plus large
zone.addEventListener('click', e => {
  for (const m of MODULES.values()) for (const [sel, fn] of m.clicks ?? []) {
    const el = e.target.closest(sel)
    if (!el || !zone.contains(el)) continue
    try { fn(el, e.target, e) } catch (err) { console.error(`Module ${m.id} (clic ${sel}) :`, err) }
    return
  }
})

// Un lien du texte (data-url) s'ouvre dans le navigateur
document.addEventListener('click', e => { const b = e.target.closest('[data-url]'); if (b) window.api.openUrl(b.dataset.url) })

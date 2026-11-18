// Cours (Incipit) : réviser les cartes du jour dans le panneau, par-dessus l'onglet. Révisions espacées : chaque note
// espace la prochaine fois (à revoir dans 10 min, demain, dans 3 jours, une semaine…). Le TP noté, la fiche et les cartes
// d'un seul cours sont dans le site (lecteur-ui.js).
;(() => {
  const { api, S, views, actions, btn, render, say } = IC
  const GRADES = [['again', 'À revoir'], ['hard', 'Difficile'], ['good', 'Bien'], ['easy', 'Facile']]
  // Les cartes sont écrites en Markdown : `code` et **gras** s'affichent comme tels (le reste reste du texte)
  const inline = s => esc(s).replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
  const head = (title, k) => `<div class="cn-ed-head"><span class="cn-ed-h">${title}</span>${k && !k.done && !k.empty ? `<span class="cn-bar"><i data-pct="${Math.round(100 * k.i / k.list.length)}"></i></span>` : ''}
    ${btn('cardsClose', '', { icon: I.cross, cls: 'cn-x', title: 'Fermer' })}</div>`

  // all : toutes les cartes dues, tous cours confondus ; everything : même celles qui ne sont pas dues
  async function cardsStart(all = true, everything = false, course = null) {
    const r = all ? await api.invoke('dueCards') : await api.invoke('cards', course)
    if (r?.error) return say(r.error, true)
    const list = (r?.cards ?? []).filter(c => everything || c.due)
    if (!list.length) return say('Aucune carte à revoir pour le moment.')
    S.cards = { list, i: 0, flipped: false, again: new Set(), stats: { again: 0, hard: 0, good: 0, easy: 0 }, all, course }
    S.ed = 'cards'
    render(true)
  }
  views.cards = () => {
    const k = S.cards
    if (!k) return head('Réviser')
    if (k.done) {
      const n = Object.values(k.stats).reduce((a, b) => a + b, 0)
      return head(`Réviser · fini`) + `<div class="cn-done"><div><b>${n} carte${n > 1 ? 's' : ''} revue${n > 1 ? 's' : ''}</b>
        <p>${k.stats.good + k.stats.easy} sues · ${k.stats.hard} difficiles · ${k.stats.again} à revoir. Elles reviendront juste avant que tu les oublies.</p>
        ${btn('cardsClose', 'Terminer', { cls: 'cn-pri' })}</div></div>`
    }
    const c = k.list[k.i]
    return head(`Réviser · ${k.i + 1} / ${k.list.length}`, k) + `<div class="cn-cardzone">
        <button class="cn-card" data-cn="flip" data-flipped="${k.flipped}">
          <span class="cn-k">${esc([k.all ? c.matiere : '', c.notion.replace(/^\d+(\.\d+)*[.)]?\s+/, '')].filter(Boolean).join(' · '))}${c.fresh ? ' · nouvelle' : ''}</span>
          <span class="cn-recto">${inline(c.recto)}</span>
          ${k.flipped ? `<i class="cn-rule"></i><span class="cn-verso">${inline(c.verso)}</span>` : '<small class="cn-tap">Réfléchis, puis clique pour voir la réponse</small>'}
        </button></div>
      <div class="cn-grades">${k.flipped
        ? GRADES.map(([g, l]) => `<button class="cn-grade" data-cn="grade" data-g="${g}"><b>${l}</b><small>${esc(c.waits?.[g] ?? '')}</small></button>`).join('')
        : btn('flip', 'Voir la réponse', { cls: 'cn-pri' })}</div>`
  }
  async function grade(g) {
    const k = S.cards, c = k.list[k.i]
    k.stats[g]++
    await api.invoke('review', c.course, c.id, g)
    // À revoir : elle repasse en fin de séance (une fois), comme on le ferait avec un paquet de cartes
    if (g === 'again' && !k.again.has(c.id)) { k.again.add(c.id); k.list.push({ ...c, fresh: false }) }
    k.flipped = false
    if (++k.i >= k.list.length) k.done = true
    render(true)
  }

  Object.assign(actions, {
    dueStart: () => cardsStart(true),
    flip: () => { if (S.cards && !S.cards.done) { S.cards.flipped = !S.cards.flipped; render(true) } },
    grade: el => grade(el.dataset.g),
    cardsClose: async () => {
      S.cards = null; S.ed = null
      S.library = await api.invoke('library') ?? S.library
      render(true)
    },
  })

  // Pour Hito : la carte sous les yeux (sa réponse seulement une fois retournée)
  IC.context = () => {
    if (S.ed !== 'cards' || !S.cards?.list || S.cards.done) return null
    const c = S.cards.list[S.cards.i]
    return `Carte de révision (${c.notion}) : ${c.recto}` + (S.cards.flipped ? `\nRéponse : ${c.verso}` : '')
  }
})()

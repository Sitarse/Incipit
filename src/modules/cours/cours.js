// Cours (Incipit) dans le panneau, dans la DA de l'Agenda. À gauche « Aujourd'hui » : la génération en cours, les
// cartes à réviser, la lecture à reprendre. À droite tes cours par matière : un clic ouvre le site (le lecteur,
// lecteur.js), qui a tout le cours avec ses supports. Créer un cours, réviser et les réglages passent par-dessus
// l'onglet, comme l'éditeur d'événement de l'Agenda. Les cartes : revise.js ; partie Node : main.js.
const IC = (() => {
  const api = window.api.mod('cours')
  const page = $('.page.cours'), todayEl = $('.cn-today'), rightEl = $('.cn-right'), edEl = $('.cn-ed')
  const P = {
    plus: 'M12 5v14M5 12h14', photo: 'M4 5h16v14H4zM9 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M4.5 17.5l4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5',
    pdf: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h2a1.5 1.5 0 0 1 0 3H8v-5', texte: 'M5 3h10l4 4v14H5zM15 3v4h4M8 11h8M8 15h8M8 19h5',
    lien: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
    warn: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z', check: 'M20 6 9 17l-5-5',
    upload: 'M12 15V3M7 8l5-5 5 5M5 21h14', folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z',
    book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14ZM20 17v4H6.5a2.5 2.5 0 0 1 0-5',
    cartes: 'M8 3h10a2 2 0 0 1 2 2v12M4 8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2ZM7 11h6M7 15h4',
    spark: 'M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6-4.6-1.9 4.6-1.9ZM19 15l.9 2.1 2.1.9-2.1.9L19 21l-.9-2.1L16 18l2.1-.9Z',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', stop: 'M7 7h10v10H7z',
    cap: 'M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0zM22 10v6M6 12.5V16a6 3 0 0 0 12 0v-3.5',
    sliders: 'M4 7h9M17 7h3M15 5v4M4 17h3M11 17h9M9 15v4', back: 'm15 18-6-6 6-6', next: 'm9 18 6-6-6-6', down: 'm6 9 6 6 6-6',
  }
  const TYPES = ['CM', 'TD', 'TP']
  // Ce qu'on crée en plus du cours (le sujet retravaillé : seulement pour un TD ou un TP)
  const EXTRAS = [['fiche', 'Fiche'], ['cartes', 'Flash cards'], ['tp', 'TP noté'], ['sujet', 'Sujet retravaillé']]
  const LENGTHS = { court: 'Court', normal: 'Normal', detaille: 'Détaillé' }
  const store = (k, v) => { try { localStorage[`cours.${k}`] = JSON.stringify(v) } catch {} }
  const stored = (k, d) => { try { return JSON.parse(localStorage[`cours.${k}`]) ?? d } catch { return d } }

  const S = {
    view: 'home', // à droite : home (tes cours) ou run (la génération)
    ed: null, // par-dessus l'onglet : new, settings, cards (revise.js)
    library: { courses: [], due: 0, matieres: [], last: null }, settings: null, run: null, details: null,
    draft: { matiere: stored('matiere', ''), type: stored('type', 'CM'), titre: stored('titre', ''), options: { fiche: true, cartes: true, ...stored('extras', {}) },
      files: [], link: false, other: false },
    notice: null, catalog: null, catalogOr: null, pick: null, adv: false, thumbs: new Map(),
  }
  const views = {} // overlays : nom -> () => HTML (revise.js y ajoute cards)
  const actions = {} // data-cn -> (élément) => …

  // ---------- Petits outils ----------
  const sizeText = n => n < 1024 ? `${n} o` : n < 1048576 ? `${Math.round(n / 1024)} Ko` : `${(n / 1048576).toFixed(1).replace('.', ',')} Mo`
  const dayText = t => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  const durText = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}` }
  const kchars = n => n >= 1000 ? `${Math.round(n / 100) / 10} k car.`.replace('.', ',') : `${n} car.`
  const ago = t => { const d = Math.round((startOfDay(Date.now()) - startOfDay(t)) / 864e5); return d <= 0 ? 'ouvert aujourd’hui' : d === 1 ? 'ouvert hier' : `ouvert il y a ${d} jours` }
  const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`
  const btn = (ic, label, { icon, cls = 'cn-sec', data = '', title = '', disabled = false } = {}) =>
    `<button class="${cls}" data-cn="${ic}" ${data} ${title ? `title="${esc(title)}" aria-label="${esc(title)}"` : ''} ${disabled ? 'disabled' : ''}>${icon ? svg(icon) : ''}${label ? `<span>${label}</span>` : ''}</button>`
  const engine = () => S.settings?.moteurs.find(m => m.code === S.settings.moteur)
  // Qui écrit, avec son modèle : « Claude Opus », « Claude (API) · claude-sonnet-5-5 »…
  const engineLabel = () => {
    const s = S.settings, e = engine()
    if (!e) return ''
    if (e.code === 'claude-cli') return `Claude ${s.claudeModel[0].toUpperCase()}${s.claudeModel.slice(1)}`
    const model = { 'gemini-pro': s.geminiProModel, anthropic: s.anthropicModel, openai: s.openaiModel, openrouter: s.openrouterModel, gemini: s.geminiModel }[e.code]
    return model ? `${e.nom} · ${model}` : e.nom
  }
  const say = (text, bad = false) => { S.notice = { text, bad, at: Date.now() }; render(true) }
  const notice = () => S.notice && Date.now() - S.notice.at < 8000 ? S.notice : null
  const editingIn = el => el.contains(document.activeElement) && isField(document.activeElement)
  // La sécurité du panneau interdit style="…" : les barres prennent leur longueur ici
  const bars = el => { for (const b of el.querySelectorAll('[data-pct]')) b.style.setProperty('--p', `${Math.max(0, Math.min(100, +b.dataset.pct))}%`) }

  // ---------- Rendu ----------
  let pending = false
  function render(force = false) { renderToday(); renderRight(); renderEd(force) }
  function renderEd(force = false) {
    if (!force && S.ed && editingIn(edEl)) { pending = true; return }
    pending = false
    edEl.hidden = !S.ed
    setHtml(edEl, S.ed ? (views[S.ed]?.() ?? '') : '')
    bars(edEl)
    if (S.ed === 'new') loadThumbs()
  }
  page.addEventListener('focusout', () => setTimeout(() => { if (pending && !editingIn(edEl)) renderEd() }))

  // À gauche : ce qu'il y a à faire aujourd'hui
  function renderToday() {
    const r = S.run, lib = S.library, blocks = []
    if (typeof SERIE !== 'undefined') { const b = SERIE.block(); if (b) blocks.push(b) } // la série du jour (serie-ui.js)
    if (r) blocks.push(runBlock(r))
    const by = new Map()
    for (const c of lib.courses) if (c.due) by.set(c.matiere, (by.get(c.matiere) ?? 0) + c.due)
    const split = [...by].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${esc(m)} ${n}`).join(' · ')
    blocks.push(`<div class="cn-block"><span class="cn-k">À réviser</span><div class="cn-big" data-zero="${!lib.due}"><b>${lib.due}</b><span>${lib.due > 1 ? 'cartes' : 'carte'}</span></div>
      ${r ? '' : `<small>${lib.due ? split : 'Tes cartes reviendront d’elles-mêmes, au bon moment.'}</small>`}
      ${lib.due ? btn('dueStart', 'Réviser', { icon: P.cartes, cls: 'cn-pri' }) : ''}</div>`)
    const l = lib.last
    if (!r && l) blocks.push(`<div class="cn-block"><span class="cn-k">Reprendre la lecture</span><button class="cn-resume" data-cn="read" data-path="${esc(l.path)}" title="Ouvrir le cours">
      <span><b>${esc(l.titre)}</b><small>${esc(l.matiere)} · ${esc(l.type)} · ${ago(l.at)}</small></span><i>${svg(P.book)}</i></button></div>`)
    else if (!r && lib.courses.length) blocks.push('<p class="cn-tip">Un clic sur un cours l’ouvre dans une grande fenêtre : le cours, ses diapos, sa fiche, ses flash cards et son TP.</p>')
    setHtml(todayEl, `<div class="cn-colh"><b>Aujourd’hui</b><small>${fr(Date.now(), { weekday: 'short', day: 'numeric', month: 'short' })}</small></div>${blocks.join('')}`)
    bars(todayEl)
  }
  function runBlock(r) {
    const live = r.status === 'run', done = r.status === 'done'
    const head = live ? 'En cours' : done ? 'C’est prêt' : r.status === 'stopped' ? 'Arrêté' : 'Échec'
    const sub = live ? `${esc(r.phase)} · ${durText(Date.now() - r.started)}` : done ? `${r.kind === 'reecrire' ? 'Partie réécrite' : r.kind === 'supports' ? 'Supports prêts' : 'Cours écrit'} en ${durText(r.ended - r.started)}`
      : r.status === 'stopped' ? 'Les photos déjà lues sont gardées' : esc(r.error ?? 'Quelque chose a raté')
    return `<div class="cn-block cn-runb" data-cn="showRun" data-status="${r.status}" role="button" tabindex="0" title="Voir les étapes">
      <span class="cn-k">${head}</span><span class="cn-live"><i class="cn-dot"></i><b>${esc(r.who?.titre ?? r.label)}</b><em>${live ? `${r.pct ?? 0} %` : ''}</em></span>
      <span class="cn-bar"><i data-pct="${done ? 100 : r.pct ?? 0}"></i></span><small>${sub}</small>
      ${done && r.course ? `<span class="cn-acts">${btn('read', 'Lire', { icon: P.book, cls: 'cn-pri', data: `data-path="${esc(r.course)}"` })}${btn('dismiss', 'Fermer', { cls: 'cn-sec' })}</span>` : ''}</div>`
  }

  // À droite : tes cours, ou la génération
  function renderRight() {
    setHtml(rightEl, S.view === 'run' && S.run ? runView(S.run) : homeView())
    bars(rightEl)
    fade(rightEl.querySelector('.cn-list')) // un fondu en bas tant qu'il reste des cours plus bas
    const log = rightEl.querySelector('.cn-calls, .cn-logs')
    if (log && S.run?.status === 'run') log.scrollTop = log.scrollHeight
  }
  const tools = () => `<span class="cn-tools"><button class="cn-add" data-cn="newOpen">${svg(P.plus)}Nouveau cours</button>${btn('settings', '', { icon: P.sliders, cls: 'cn-ic', title: 'Réglages des cours' })}</span>`
  function homeView() {
    const list = S.library.courses, groups = new Map()
    for (const c of list) (groups.get(c.matiere) ?? groups.set(c.matiere, []).get(c.matiere)).push(c)
    const ord = { CM: 0, TD: 1, TP: 2 }
    const rows = [...groups].sort(([a], [b]) => a.localeCompare(b, 'fr')).map(([m, cs]) => `<div class="cn-mat">${esc(m)}</div>` + cs
      .sort((a, b) => ord[a.type] - ord[b.type] || a.titre.localeCompare(b.titre, 'fr', { numeric: true })).map(c => {
        const sup = [c.fiche && 'fiche', c.cartes && 'flash cards', c.tp && 'TP'].filter(Boolean).join(', ')
        const prog = c.prog ? (c.prog.done >= c.prog.total ? 'terminé' : `${c.prog.done} / ${c.prog.total} chapitres`) : dayText(c.at)
        return `<button class="cn-row" data-cn="read" data-path="${esc(c.path)}" title="Ouvrir ${esc(c.titre)}"><i class="cn-ty">${c.type}</i>
          <span><b>${esc(c.titre)}</b><small>${prog}${sup ? ` · ${sup}` : ''}</small></span>${c.due ? `<em class="cn-tag">${c.due} à revoir</em>` : '<span></span>'}${svg(P.next)}</button>`
      }).join('')).join('')
    return `<div class="cn-colh"><b>Mes cours</b><small>${list.length ? `${list.length} cours` : ''}</small>${tools()}</div>`
      + (list.length ? `<div class="cn-list">${rows}</div>`
        : emptyState(P.cap, 'Aucun cours pour l’instant', 'Glisse les diapos du prof ou tes photos du tableau : Incipit en fait un cours.', btn('newOpen', 'Nouveau cours', { icon: P.plus, cls: 'cn-pri' })))
  }
  function runView(r) {
    const live = r.status === 'run', calls = r.calls ?? [], plan = r.plan ?? [], at = r.at ?? 0
    const state = i => i < at || r.status === 'done' ? 'ok' : i === at ? (r.status === 'error' ? 'ko' : live ? 'run' : 'wait') : 'wait'
    const steps = `<div class="cn-steps">${plan.map(([, label], i) => `<div class="cn-step" data-s="${state(i)}"><i>${state(i) === 'ok' ? svg(P.check) : state(i) === 'ko' ? svg(I.cross) : ''}</i><span>${esc(label)}</span></div>`).join('')}</div>`
    const details = S.details === 'logs'
      ? `<div class="cn-logs">${(r.logs ?? []).map(l => `<p data-tone="${l.tone}">${esc(l.text)}</p>`).join('') || '<p>…</p>'}</div>`
      : `<div class="cn-calls">${calls.map(c => `<div class="cn-call" data-status="${c.status}">
          <i class="cn-st">${c.status === 'ok' ? svg(P.check) : c.status === 'ko' ? svg(I.cross) : '<i class="spin"></i>'}</i>
          <span class="cn-call-main"><b>${esc(c.etape)}</b><small>${esc(c.qui || [c.moteur, c.modele].filter(Boolean).join(' · '))} · envoyé ${kchars(c.envoye ?? 0)}${c.mots ? ` · ${c.status === 'run' ? 'reçoit' : 'reçu'} ${c.mots} mots` : ''}${c.duree ? ` · ${c.duree} s` : ''}</small>
            ${c.erreur ? `<em>${esc(c.erreur)}</em>` : ''}${c.fin && c.status === 'run' ? `<code>${esc(c.fin.slice(-260))}</code>` : ''}</span>
          ${c.trace ? btn('trace', '', { icon: P.eye, cls: 'cn-ic', data: `data-p="${esc(c.trace)}"`, title: 'La demande et la réponse complètes' }) : ''}</div>`).join('')
        || `<p class="cn-wait">${live ? 'Préparation de Python et lecture des sources…' : 'Aucun appel.'}</p>`}</div>`
    const foot = `<div class="cn-foot">${S.details
      ? `<span class="cn-seg cn-grow">${[['calls', `Appels à l’IA (${calls.length})`], ['logs', 'Journal']].map(([k, l]) => `<button data-cn="details" data-v="${k}" data-on="${S.details === k}">${l}</button>`).join('')}</span>${btn('details', 'Étapes', { cls: 'cn-sec cn-small', data: 'data-v=""' })}`
      : `<button class="cn-link-btn cn-grow" data-cn="details" data-v="calls">Détails des appels à l’IA</button>`}
      ${live ? btn('stop', 'Arrêter', { icon: P.stop, cls: 'cn-sec cn-danger' }) : btn('dismiss', 'Fermer', { cls: 'cn-sec' })}
      ${r.status === 'done' && r.course ? btn('read', 'Lire le cours', { icon: P.book, cls: 'cn-pri', data: `data-path="${esc(r.course)}"` }) : ''}</div>`
    return `<div class="cn-colh"><button class="cn-back" data-cn="home">${svg(P.back)}Mes cours</button>${tools()}</div>
      <div class="cn-kick">${[r.who?.matiere, r.who?.type, r.moteur].filter(Boolean).map(esc).join(' · ')}</div><div class="cn-title">${esc(r.who?.titre ?? r.label)}</div>
      ${S.details ? details : `<div class="cn-phase" data-status="${r.status}"><b>${esc(r.phase)}</b><em>${r.status === 'done' ? 100 : r.pct ?? 0} %</em></div>
        <span class="cn-bar" data-status="${r.status}"><i data-pct="${r.status === 'done' ? 100 : r.pct ?? 0}"></i></span>${steps}
        ${r.status === 'error' ? `<p class="cn-err">${esc(r.error ?? 'Échec')}</p>` : r.status === 'stopped' ? '<p class="cn-err">Arrêté. Les photos déjà lues sont gardées : relancer ne les repaiera pas.</p>' : ''}`}
      ${foot}`
  }

  // ---------- Par-dessus : un nouveau cours ----------
  const fileChips = files => files.map(f => {
    const thumb = S.thumbs.get(f.name)
    return `<span class="cn-file" data-kind="${f.kind}" data-warn="${!!f.warn}" title="${esc(f.warn || (f.url ?? f.name))}">
      ${thumb ? `<img src="${thumb}" alt="">` : `<i>${svg(f.warn ? P.warn : P[f.kind] ?? P.texte)}</i>`}
      <span><b>${esc(f.kind === 'lien' && f.url ? f.url.replace(/^https?:\/\//, '') : f.name)}</b><small>${f.warn ? esc(f.warn) : `${{ photo: 'photo', pdf: 'PDF', lien: 'lien', texte: 'texte' }[f.kind] ?? f.kind} · ${sizeText(f.size)}`}</small></span>
      <button data-cn="rmSource" data-name="${esc(f.name)}" aria-label="Retirer" title="Retirer">${svg(I.cross)}</button></span>`
  }).join('')
  const shelfFiles = () => (typeof shelf !== 'undefined' && Array.isArray(shelf) ? shelf : [])
    .filter(f => /\.(jpe?g|png|webp|heic|gif|bmp|pdf|md|txt|py|c|cpp|java|js|ts|html|css|sql|json|csv|tex)$/i.test(f.name)).slice(0, 6)
  const extrasFor = type => EXTRAS.filter(([k]) => k !== 'sujet' || type !== 'CM')
  // Ce qui empêche de lancer, dit dans le pied (null : prêt)
  function blocker() {
    const d = S.draft
    if (S.run?.status === 'run') return 'Une génération tourne déjà : attends qu’elle finisse.'
    if (engine()?.souci) return engine().souci
    if (!d.files.length) return 'Ajoute au moins une source : diapos, photos, notes ou lien.'
    if (!d.titre.trim()) return 'Donne un titre au cours.'
    return null
  }
  function newFoot() {
    const d = S.draft, n = notice(), b = blocker()
    const exists = S.library.courses.some(c => c.matiere === (d.matiere.trim() || 'Divers') && c.type === d.type && c.titre === d.titre.trim())
    const hint = n ? `<span class="cn-hint" data-bad="${n.bad}" data-good="${!n.bad}">${esc(n.text)}</span>`
      : b ? `<span class="cn-hint">${esc(b)}</span>`
      : exists ? '<span class="cn-hint" data-warn="true">Un cours de ce nom existe : il sera remplacé (l’ancien est gardé).</span>'
      : `<span class="cn-hint">${plural(d.files.length, 'source')} · ${esc(d.matiere.trim() || 'Divers')} · ${d.type}</span>`
    return `${hint}${btn('edClose', 'Annuler')}${btn('generate', 'Générer le cours', { icon: P.spark, cls: 'cn-pri', disabled: !!b })}`
  }
  views.new = () => {
    const d = S.draft, e = engine(), mats = [...S.library.matieres]
    if (d.matiere.trim() && !mats.includes(d.matiere.trim())) mats.push(d.matiere.trim())
    const sh = shelfFiles()
    return `<div class="cn-ed-head"><span class="cn-ed-h">Nouveau cours</span>
        <button class="cn-engine" data-cn="settings" title="Changer qui écrit les cours"><i data-ok="${!e?.souci}"></i>Écrit par ${esc(engineLabel())}</button>${btn('edClose', '', { icon: I.cross, cls: 'cn-x', title: 'Fermer' })}</div>
      <input class="cn-titlein" data-field="titre" value="${esc(d.titre)}" placeholder="Titre du cours, par exemple CM3 · Les piles" maxlength="120" aria-label="Titre du cours" spellcheck="false">
      <div class="cn-line"><span class="cn-lab">Matière</span><span class="cn-chips">${mats.map(m => `<button class="cn-chip" data-cn="matiere" data-v="${esc(m)}" data-on="${d.matiere.trim() === m}">${esc(m)}</button>`).join('')}
        ${d.other ? `<input class="cn-chip-in" data-field="matiere" value="${esc(mats.includes(d.matiere.trim()) ? '' : d.matiere)}" placeholder="Nouvelle matière" maxlength="80" aria-label="Nouvelle matière" spellcheck="false">`
          : `<button class="cn-chip" data-cn="otherMat">${svg(P.plus)}Autre</button>`}</span>
        <span class="cn-seg">${TYPES.map(t => `<button data-cn="type" data-v="${t}" data-on="${d.type === t}">${t}</button>`).join('')}</span></div>
      <div class="cn-drop">
        <div class="cn-drop-h">${svg(P.upload)}<span><b>Glisse ici les diapos, tes photos du tableau ou tes notes</b><small>ou clique pour les choisir sur ton PC</small></span>
          ${btn('pick', 'Choisir…', { icon: P.folder, cls: 'cn-sec cn-small' })}${btn('linkShow', 'Lien', { icon: P.lien, cls: 'cn-sec cn-small' })}</div>
        ${d.link ? `<form class="cn-linkf" data-form="link"><input placeholder="https://… (une page de cours, un article, une doc)" aria-label="Lien à ajouter" spellcheck="false"><button class="cn-pri" type="submit">Ajouter</button></form>` : ''}
        ${sh.length ? `<div class="cn-shelf"><small>Sur ton étagère :</small>${sh.map(f => `<button data-cn="shelfAdd" data-p="${esc(f.path)}" title="${esc(f.path)}">${svg(P.plus)}${esc(f.name)}</button>`).join('')}</div>` : ''}
        <div class="cn-files">${fileChips(d.files)}</div></div>
      <div class="cn-line"><span class="cn-lab">Créer aussi</span><span class="cn-chips">${extrasFor(d.type).map(([k, l]) => `<button class="cn-chip" data-cn="opt" data-k="${k}" data-on="${!!d.options[k]}">${d.options[k] ? svg(P.check) : ''}${l}</button>`).join('')}</span>
        ${S.settings ? `<span class="cn-seg">${Object.entries(LENGTHS).map(([k, l]) => `<button data-cn="set" data-k="longueur" data-v="${k}" data-on="${S.settings.longueur === k}">${l}</button>`).join('')}</span>` : ''}</div>
      <div class="cn-ed-foot">${newFoot()}</div>`
  }
  const syncFoot = () => { const f = edEl.querySelector('.cn-ed-foot'); if (f && S.ed === 'new') setHtml(f, newFoot()) }

  // ---------- Par-dessus : les réglages ----------
  const choice = (key, value, list) => {
    const open = S.pick === key, cur = list.find(([k]) => k === value)?.[1] ?? value
    return `<span class="cn-pick"><button class="cn-pick-btn" data-cn="pick-open" data-k="${key}" data-on="${open}"><span>${esc(cur)}</span>${svg(P.down)}</button>
      ${open ? `<span class="cn-pick-list">${list.map(([k, l]) => `<button data-cn="set" data-k="${key}" data-v="${esc(k)}" data-on="${k === value}">${esc(l)}</button>`).join('')}</span>` : ''}</span>`
  }
  const seg = (key, value, list) => `<span class="cn-seg">${list.map(([k, l]) => `<button data-cn="set" data-k="${key}" data-v="${k}" data-on="${value === k}">${esc(l)}</button>`).join('')}</span>`
  const row = (label, ctl, note = '') => `<div class="cn-set"><span class="cn-lab">${label}</span><div>${ctl}</div>${note ? `<p>${note}</p>` : ''}</div>`
  views.settings = () => {
    const s = S.settings
    if (!s) return `<div class="cn-ed-head"><span class="cn-ed-h">Réglages des cours</span>${btn('edClose', '', { icon: I.cross, cls: 'cn-x', title: 'Fermer' })}</div>`
    const e = engine(), n = notice()
    const engines = s.moteurs.map(m => [m.code, m.nom])
    const key = (kind, label, set, bad, placeholder, note) => row(label, `<form class="cn-keyf" data-form="${kind}"><input type="password" placeholder="${set ? 'Enregistrée · colle-en une autre pour la remplacer' : bad ? 'Illisible : recolle-la' : placeholder}" aria-label="${label}" autocomplete="off"><button class="cn-sec cn-small" type="submit">Enregistrer</button></form>`, note)
    const link = (url, text) => `<button class="link" data-url="${url}">${text}</button>`
    // Un nom de modèle tapé (ou choisi dans la liste proposée) : les catalogues bougent trop pour une liste fermée
    const typed = (k, value, list) => `<form class="cn-keyf" data-form="model" data-k="${k}"><input list="dl-${k}" value="${esc(value)}" aria-label="Modèle" autocomplete="off" spellcheck="false"><datalist id="dl-${k}">${list.map(m => `<option value="${esc(m)}"></option>`).join('')}</datalist><button class="cn-sec cn-small" type="submit">Utiliser</button></form>`
    // Le modèle du moteur choisi, juste sous « Qui écrit »
    const modelRow = () => {
      if (!e) return ''
      if (e.code === 'claude-cli') return row('Modèle', choice('claudeModel', s.claudeModel, s.claudeModels), 'Opus écrit le meilleur cours ; Haiku est le plus rapide et ménage ton quota.')
      if (e.code === 'gemini') return row('Modèle', choice('geminiModel', s.geminiModel, s.geminiModels.map(m => [m, m])))
      if (e.code === 'gratuit') return row('Modèle', `${choice('nimModel', s.nimModel, (S.catalog ?? s.nimModels).map(m => [m, m]))}${s.nimKeySet ? btn('catalog', S.catalog ? 'Catalogue chargé' : 'Tester la clé', { cls: 'cn-sec cn-small', disabled: !!S.catalog }) : ''}`)
      if (e.code === 'anthropic') return row('Modèle', typed('anthropicModel', s.anthropicModel, s.anthropicModels), 'Opus 5.5 écrit le mieux, Sonnet 5.5 coûte moins, Haiku 5.5 le moins.')
      if (e.code === 'gemini-pro') return row('Modèle', typed('geminiProModel', s.geminiProModel, s.geminiProModels), 'Les modèles Pro écrivent mieux ; ils demandent une clé avec facturation activée (la clé gratuite reçoit une erreur 429).')
      if (e.code === 'openai') return row('Modèle', typed('openaiModel', s.openaiModel, s.openaiModels), 'N’importe quel modèle de ton compte OpenAI qui lit les images.')
      return row('Modèle', `${typed('openrouterModel', s.openrouterModel, S.catalogOr ?? s.openrouterModels)}${btn('catalogOr', S.catalogOr ? `${S.catalogOr.length} modèles chargés` : 'Voir les modèles gratuits', { cls: 'cn-sec cn-small', disabled: !!S.catalogOr })}`,
        'Les modèles dont le nom finit par « :free » sont gratuits (quota limité). Ils écrivent partie par partie.')
    }
    const prix = e ? { abonnement: 'Avec ton abonnement Claude Code : le meilleur, sans clé.', payant: 'Payant à l’usage : tu paies tes appels chez le fournisseur, sans abonnement.', gratuit: 'Gratuit (dans la limite du quota du fournisseur).' }[e.prix] : ''
    return `<div class="cn-ed-head"><span class="cn-ed-h">Réglages des cours</span>${n ? `<span class="cn-hint" data-bad="${n.bad}" data-good="${!n.bad}">${esc(n.text)}</span>` : ''}
        ${btn('edClose', '', { icon: I.cross, cls: 'cn-x', title: 'Fermer' })}</div>
      <div class="cn-sets">
        ${row('Qui écrit', seg('moteur', s.moteur, engines), e?.souci ? `<span class="cn-hint" data-bad="true">${esc(e.souci)}</span>` : `${esc(e?.sous ?? '')}. ${prix}`)}
        ${modelRow()}
        ${row('Longueur', seg('longueur', s.longueur, Object.entries(LENGTHS)))}
        ${row('Forme', seg('format', s.format, [['1', 'Classique'], ['2', 'Court, en trois couches']]), s.format === '2' ? 'L’essentiel sur une page, les notions une par une, le reste replié.' : '')}
        ${row('Langue', seg('langue', s.langue, [['fr', 'Français'], ['en', 'English']]))}
        ${row('Dossier des cours', `<span class="cn-path" title="${esc(s.destination)}">${esc(s.destination)}</span>${btn('pickDest', 'Changer…', { cls: 'cn-sec cn-small' })}${btn('openDest', '', { icon: P.folder, cls: 'cn-ic', title: 'Ouvrir le dossier' })}`,
          s.obsidian ? (s.obsidianVault ? 'Ouvert comme coffre dans Obsidian.' : 'Pour lire tes cours dans Obsidian : « Ouvrir un dossier comme coffre », puis ce dossier.') : '')}
        <button class="cn-adv" data-cn="adv" data-on="${S.adv}">${svg(P.next)}Avancé · clés (Anthropic, OpenAI, OpenRouter, Gemini gratuit et payant, NVIDIA), lecture des photos</button>
        ${S.adv ? key('geminiProKey', 'Clé Gemini payante', s.keys['gemini-pro'], s.keysBad['gemini-pro'], 'AIza… (projet avec facturation)', `Une clé Google dont le projet a la facturation activée : ${link('https://aistudio.google.com/apikey', 'aistudio.google.com/apikey')}. À part de la clé gratuite, qui sert au tuteur et aux photos. Chiffrée sur ce PC.`)
          + key('anthropicKey', 'Clé Anthropic', s.keys.anthropic, s.keysBad.anthropic, 'sk-ant-…', `Pour écrire avec Claude sans abonnement, payant à l’usage : ${link('https://console.anthropic.com/settings/keys', 'console.anthropic.com')}. Chiffrée sur ce PC.`)
          + key('openaiKey', 'Clé OpenAI', s.keys.openai, s.keysBad.openai, 'sk-…', `Payant à l’usage : ${link('https://platform.openai.com/api-keys', 'platform.openai.com')}. Chiffrée sur ce PC.`)
          + key('openrouterKey', 'Clé OpenRouter', s.keys.openrouter, s.keysBad.openrouter, 'sk-or-…', `Une seule clé pour des centaines de modèles, gratuits ou payants : ${link('https://openrouter.ai/keys', 'openrouter.ai/keys')}. Chiffrée sur ce PC.`)
          + key('geminiKey', 'Clé Gemini', s.geminiKeySet, false, 'AIza… (plusieurs : séparées par une virgule)', `Gratuite sur ${link('https://aistudio.google.com/apikey', 'aistudio.google.com/apikey')}. Avec plusieurs clés, la première écrit les cours ; le tuteur passe à la suivante quand l’une atteint son quota. Chiffrée sur ce PC.`)
          + key('nimKey', 'Clé NVIDIA', s.nimKeySet, s.nimKeyBad, 'nvapi-…', `Gratuite sur ${link('https://build.nvidia.com/settings/api-keys', 'build.nvidia.com')} (« Get API Key »). Chiffrée sur ce PC.`)
          + row('Lecture des photos', choice('transcripteur', s.transcripteur, s.transcripteurs), 'Avec NVIDIA NIM. Les autres moteurs lisent les photos eux-mêmes.')
          + row('Sur ce PC', `<span class="cn-state">${s.uv ? '✓ Python (uv)' : '✗ uv manquant'} · ${s.claude ? '✓ Claude Code' : '✗ Claude Code'} · ${s.vendor ? '✓ PDF hors ligne' : 'PDF : formules et schémas en ligne'}</span>`) : ''}
      </div>`
  }

  // ---------- Données ----------
  async function refresh() {
    const st = await api.invoke('state')
    if (!st) return
    S.library = st.library; S.settings = st.settings
    if (st.run) S.run = st.run
    await loadDraft()
    render()
  }
  async function loadDraft() { S.draft.files = await api.invoke('sources', 'draft') ?? [] }
  async function reloadSources() { await loadDraft(); renderEd(true) }
  // Vignettes des photos déposées, demandées une fois chacune
  function loadThumbs() {
    for (const f of S.draft.files) {
      if (f.kind !== 'photo' || S.thumbs.has(f.name)) continue
      S.thumbs.set(f.name, null)
      api.invoke('thumb', 'draft', f.name).then(url => { if (/^data:image\/(png|jpeg);base64,/.test(url ?? '')) { S.thumbs.set(f.name, url); renderEd() } })
    }
  }
  // Des fichiers pour le prochain cours : ils vont au brouillon, et l'éditeur s'ouvre pour qu'on le voie
  async function addFiles(files) {
    const paths = files.map(f => typeof f === 'string' ? f : window.api.filePath(f)).filter(Boolean)
    if (!paths.length) return 0
    if (!S.ed) S.ed = 'new'
    const { added } = await api.invoke('addPaths', 'draft', paths) ?? {}
    await reloadSources()
    if (!added) say('Rien n’a été ajouté : un fichier introuvable, un dossier vide ou trop lourd ?', true)
    return added
  }

  // ---------- Actions ----------
  const setDraft = (k, v) => { S.draft[k] = v; store(k, v) }
  Object.assign(actions, {
    home: () => { S.view = 'home'; S.details = null; render() },
    newOpen: () => { S.ed = 'new'; S.draft.link = false; render(true); edEl.querySelector('.cn-titlein:placeholder-shown')?.focus() },
    edClose: () => { S.ed = null; S.pick = null; render(true) },
    settings: () => { S.ed = 'settings'; S.pick = null; render(true) },
    adv: () => { S.adv = !S.adv; render(true) },
    openDest: () => api.invoke('open', 'dest'),
    read: async el => {
      const r = await api.invoke('open', 'lire', el.dataset.path)
      if (r === false) say('Ce cours est introuvable (déplacé ou supprimé ?).', true)
    },
    showRun: () => { S.view = 'run'; render() },
    details: el => { S.details = el.dataset.v || null; renderRight() },
    type: el => { setDraft('type', el.dataset.v); renderEd(true) },
    matiere: el => { setDraft('matiere', el.dataset.v); S.draft.other = false; renderEd(true) },
    otherMat: () => { S.draft.other = true; renderEd(true); edEl.querySelector('.cn-chip-in')?.focus() },
    opt: el => { const k = el.dataset.k; S.draft.options[k] = !S.draft.options[k]; store('extras', S.draft.options); renderEd(true) },
    pick: async () => { const r = await api.invoke('pickFiles', 'draft'); if (r?.added) reloadSources() },
    linkShow: () => { S.draft.link = !S.draft.link; renderEd(true); edEl.querySelector('.cn-linkf input')?.focus() },
    shelfAdd: el => addFiles([el.dataset.p]),
    rmSource: async el => { await api.invoke('removeSource', 'draft', el.dataset.name); S.thumbs.delete(el.dataset.name); reloadSources() },
    generate: () => {
      const d = S.draft, o = Object.fromEntries(EXTRAS.map(([k]) => [k, !!d.options[k] && (k !== 'sujet' || d.type !== 'CM')]))
      launch(api.invoke('generate', { matiere: d.matiere, type: d.type, titre: d.titre, options: { cours: true, ...o } }), true)
    },
    stop: () => api.invoke('cancel'),
    dismiss: async () => { await api.invoke('dismiss'); S.run = null; S.view = 'home'; S.details = null; render() },
    trace: el => api.invoke('open', 'trace', el.dataset.p),
    set: async el => {
      S.pick = null
      const r = await api.invoke('set', el.dataset.k, el.dataset.v)
      if (r?.error) return say(r.error, true)
      S.settings = r.settings
      render(true)
    },
    'pick-open': el => { S.pick = S.pick === el.dataset.k ? null : el.dataset.k; renderEd(true) },
    catalog: async () => {
      const r = await api.invoke('catalog')
      if (r?.error) return say(r.error, true)
      S.catalog = r.models; say(`Clé acceptée : ${r.models.length} modèles disponibles.`)
    },
    catalogOr: async () => {
      const r = await api.invoke('catalogOr')
      if (r?.error) return say(r.error, true)
      S.catalogOr = r.models; say(`${r.models.length} modèles, dont ${r.free} gratuits (liste déroulante du champ Modèle).`)
    },
    pickDest: async () => { const r = await api.invoke('pickDest'); if (r) { S.settings = r.settings; S.library = r.library; render(true) } },
    goGemini: () => { S.adv = true; renderEd(true) },
  })
  // fromDraft : réussi, le titre du brouillon se vide pour le cours suivant (matière et type restent)
  async function launch(promise, fromDraft = false) {
    const r = await promise
    if (r?.error) return say(r.error, true)
    S.ed = null; S.view = 'run'; S.details = null; S.fromDraft = fromDraft
    render(true)
  }

  // Saisie : le titre et la matière du cours en préparation ; les formulaires (lien, clé NVIDIA)
  edEl.addEventListener('input', e => {
    const f = e.target.dataset.field
    if (f === 'titre' || f === 'matiere') { setDraft(f, e.target.value); syncFoot() }
  })
  edEl.addEventListener('submit', async e => {
    e.preventDefault()
    const form = e.target.closest('form'), kind = form?.dataset.form, input = form?.querySelector('input')
    if (kind === 'link') {
      const r = await api.invoke('addLink', 'draft', input.value.trim())
      if (r?.error) return say(r.error, true)
      S.draft.link = false; document.activeElement?.blur(); reloadSources()
    } else if (kind === 'geminiKey' && input.value.trim()) {
      const r = await api.invoke('set', 'geminiKey', input.value.trim())
      input.value = ''; document.activeElement?.blur()
      if (r?.error) return say(r.error, true)
      S.settings = r.settings; say('Clé Gemini enregistrée, chiffrée sur ce PC.')
    } else if (kind === 'model' && /^(anthropic|openai|openrouter|geminiPro)Model$/.test(form.dataset.k)) {
      // Le nom d'un modèle tapé ou choisi dans la liste ; vide : le modèle par défaut du moteur
      const r = await api.invoke('set', form.dataset.k, input.value.trim())
      document.activeElement?.blur()
      if (r?.error) return say(r.error, true)
      S.settings = r.settings; say('Modèle enregistré.')
    } else if (['anthropicKey', 'openaiKey', 'openrouterKey', 'geminiProKey'].includes(kind) && input.value.trim()) {
      const r = await api.invoke('set', kind, input.value.trim())
      input.value = ''; document.activeElement?.blur()
      if (r?.error) return say(r.error, true)
      S.settings = r.settings; say('Clé enregistrée, chiffrée sur ce PC.')
    } else if (kind === 'nimKey' && input.value.trim()) {
      const r = await api.invoke('set', 'nimKey', input.value.trim())
      input.value = ''; document.activeElement?.blur()
      if (r?.error) return say(r.error, true)
      S.settings = r.settings; S.catalog = null; say('Clé enregistrée, chiffrée sur ce PC.')
    }
  })
  edEl.addEventListener('keydown', e => { if (e.key === 'Escape' && S.ed) { e.stopPropagation(); actions.edClose() } })

  // Glisser des fichiers sur l'onglet : ils vont au prochain cours (jamais à l'étagère)
  const hasFiles = e => e.dataTransfer?.types?.includes('Files')
  let depth = 0
  page.addEventListener('dragenter', e => { if (hasFiles(e)) { depth++; page.classList.add('cn-dragging') } })
  page.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; page.classList.remove('cn-dragging') } })
  page.addEventListener('dragover', e => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } })
  page.addEventListener('drop', e => {
    if (!hasFiles(e)) return
    e.preventDefault(); e.stopPropagation()
    depth = 0; page.classList.remove('cn-dragging')
    addFiles([...e.dataTransfer.files])
  })

  // Une génération avance (main.js) ; à la fin, l'île le dit, même panneau fermé
  api.on('run', r => {
    const was = S.run
    S.run = r
    if (r && was?.id === r.id && was.status === 'run' && r.status !== 'run') finished(r)
    if (!r && S.view === 'run') S.view = 'home'
    renderToday(); renderRight()
  })
  async function finished(r) {
    if (r.status === 'done') {
      queue.push({ title: r.kind === 'reecrire' ? 'Partie réécrite' : 'Cours prêt', sub: esc(r.who?.titre ?? r.label) })
      soulFeel('proud', 2200)
      if (S.fromDraft) { setDraft('titre', ''); S.thumbs.clear() }
    } else if (r.status === 'error') queue.push({ title: 'Génération ratée', sub: esc((r.error ?? '').slice(0, 120)) })
    S.fromDraft = false
    if (resting() && queue.length) showAlert(queue.shift())
    S.library = await api.invoke('library') ?? S.library
    await loadDraft()
    render()
  }
  // Une génération lancée depuis le site (une partie réécrite, un support) se voit aussi ici
  setInterval(() => { if (S.run?.status === 'run' && tabOf(tab) === 'cours' && state === 'open') renderToday() }, 1000)

  const dropText = () => S.draft.titre.trim() || 'nouveau cours'
  defineModule({
    id: 'cours',
    open: () => refresh(),
    // Le briefing du matin : les cartes à réviser aujourd'hui
    brief: async () => { const n = (await api.invoke('library'))?.due ?? 0; return n ? `Tu as ${n} carte${n > 1 ? 's' : ''} à réviser.` : null },
    clicks: [['[data-cn]', el => { if (!el.disabled) actions[el.dataset.cn]?.(el) }]],
    hints: ['Explique-moi ça plus simplement', 'Donne-moi un exemple concret', 'Pose-moi une question sur ce cours'],
    context: () => IC.context?.() ?? (S.ed === 'new' ? `Nouveau cours en préparation : ${S.draft.matiere || 'matière ?'} · ${S.draft.type} · ${S.draft.titre || 'sans titre'}, ${S.draft.files.length} source(s)`
      : S.view === 'run' && S.run ? `Génération en cours : ${S.run.label}, ${S.run.phase} (${S.run.pct} %)`
      : `Onglet Cours : ${S.library.courses.length} cours (${S.library.courses.map(c => `${c.matiere} · ${c.type} ${c.titre}`).join(' ; ')}), ${S.library.due} carte(s) à réviser.`),
    timing: () => S.run?.status === 'run' ? { label: 'Cours', text: `${S.run.pct ?? 0} %`, p: (S.run.pct ?? 0) / 100 } : null,
    // Un fichier lâché sur l'encoche pendant que l'onglet est ouvert va au prochain cours, pas sur l'étagère (shelf.js)
    dropLabel: () => tabOf(tab) === 'cours' ? `Il ira dans ton cours « ${dropText()} »` : null,
    takeDrop: files => {
      if (tabOf(tab) !== 'cours') return null
      addFiles(files)
      return { title: `${files.length} fichier${files.length > 1 ? 's' : ''} pour ton cours`, sub: esc(dropText()) }
    },
  })
  refresh()
  return { api, S, P, views, actions, btn, render, renderEd, say, bars }
})()

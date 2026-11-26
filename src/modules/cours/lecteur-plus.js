// Le site d'un cours, en plus des chapitres (lecteur-ui.js, dont il reprend S, L, $, go…) : le quiz qui finit chaque
// partie, la fiche, les flash cards, le TP noté, les sources et la régénération, le bilan du cours, réécrire un chapitre
// et la génération en cours. Tout passe par main.js (L.mod : les canaux du panneau que lecteur.js autorise).
const PANE = { name: null, it: null, data: null }
const paneEl = $('#pane')
const PALIERS = { 'tres facile': 'Très facile', facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile', 'tres difficile': 'Très difficile' }
// Les flash cards se notent en trois (ajouts1.png) : Difficile = à revoir bientôt, Moyenne = su avec peine, Facile = su
const GRADE_LABELS = [['again', 'Difficile'], ['hard', 'Moyenne'], ['good', 'Facile']]
const pnBtn = (act, label, { pri = false, data = '', disabled = false } = {}) => `<button class="${pri ? 'cta' : 'pn-btn'}" data-pn="${act}" ${data} ${disabled ? 'disabled' : ''}>${label}</button>`
const pnHead = (kick, title, sub = '') => `<div class="kick">${esc(kick)}</div><h1>${esc(title)}</h1>${sub ? `<p class="meta">${sub}</p>` : ''}`
// Un énoncé ou une solution : texte, et entre deux ``` un bloc à chasse fixe (schéma ASCII, code)
const pnText = t => String(t ?? '').split('```').map((part, i) => !part ? '' : i % 2
  ? `<pre>${esc(part.replace(/^[a-zA-Z+#]*\n/, '').replace(/\n\s*$/, ''))}</pre>` : `<span>${inline(esc(part)).replace(/\n/g, '<br>')}</span>`).join('')
const pct = list => list.length ? Math.round(list.reduce((a, e) => a + (e.points ?? 0), 0) / list.length * 100) : 0
const paint = html => { paneEl.innerHTML = html; for (const b of paneEl.querySelectorAll('[data-pct]')) b.style.setProperty('--p', `${b.dataset.pct}%`) }
const pnEmpty = (title, text, actions = '') => `<div class="pn-empty"><b>${title}</b><p>${text}</p>${actions ? `<div class="pn-acts">${actions}</div>` : ''}</div>`
// Ce qui suit dans le cours : le bouton qui y mène
const nextBtn = (label = null) => { const n = nextCount(S.at); return n ? pnBtn('next', label ?? (n.kind === 'quiz' ? 'Passer au quiz' : `Continuer : ${esc(n.title)}`), { pri: true }) : pnBtn('fin', 'Voir le bilan du cours', { pri: true }) }

function closePane() {
  PANE.name = null; PANE.it = null; PANE.data = null
  paneEl.hidden = true; paneEl.innerHTML = ''; paneEl.className = 'pane'
}
async function showPane(name, it) {
  PANE.name = name; PANE.it = it; PANE.data = null
  paneEl.className = 'pane'; paneEl.hidden = false; $('#empty').hidden = true
  paint('<p class="pn-muted">Chargement…</p>')
  try { await LOAD[name](it) } catch (err) { console.error('Site :', err); paint(pnEmpty('Ça n’a pas marché', esc(err?.message ?? ''))) }
}
// Créer un support qui manque : une génération, suivie en haut à droite
const makeBtn = (k, label) => pnBtn('make', label, { pri: true, data: `data-k="${k}"`, disabled: RUN?.status === 'run' })

const LOAD = {
  // Le quiz de la partie : ses exercices du TP (corrigés tout seuls), sinon ses flash cards (tu te notes)
  async quiz(it) {
    const q = it.quiz
    if (q.ex.length) PANE.data = { mode: 'tp', i: 0, list: q.ex.map(e => ({ ...e, answer: e.type === 'code' ? e.stub : '', points: undefined, feedback: null, showIndice: false, showSolution: false, self: false })) }
    else {
      const pool = [...new Set(S.cards.map(c => c.verso).filter(Boolean))]
      PANE.data = { mode: 'cards', i: 0, flipped: false, list: q.cards.map(c => ({ ...c, known: undefined, pick: null, opts: choices(c.verso, pool) })) }
    }
    renderQuiz()
  },
  // La fiche : la page de la veille de l'examen (un cours en trois couches l'a déjà : « L'essentiel »)
  async fiche(it) {
    const c = S.cur, ess = S.items.find(x => x.id === 'essentiel')
    if (c.meta?.format === '2' && ess) return paint(pnHead('Pour réviser', 'Fiche') + pnEmpty('La fiche, c’est « L’essentiel »', 'Ce cours est écrit en trois couches : l’essentiel tient sur une page, au début.', pnBtn('goI', 'Ouvrir L’essentiel', { pri: true, data: `data-i="${ess.i}"` })))
    const d = await L.call('fiche', c.path)
    if (d?.none) return paint(pnHead('Pour réviser', 'Fiche') + pnEmpty('Pas encore de fiche', 'Une page pour la veille de l’examen : les définitions, les formules et les pièges du cours.', makeBtn('fiche', 'Créer la fiche')))
    if (d?.error) return paint(pnHead('Pour réviser', 'Fiche') + pnEmpty('Lecture impossible', esc(d.error)))
    paint(pnHead('Pour réviser', 'Fiche', 'Une page pour la veille de l’examen') + '<div class="body" id="pnBody"></div>')
    const body = $('#pnBody')
    body.innerHTML = d.html
    body.querySelector(':scope > h1')?.remove()
    drawSchemas(body, d.schemas ?? {})
    enrich(body)
  },
  // Les flash cards du cours : celles à revoir d'abord ; à jour, on peut tout revoir
  async cartes() {
    const r = await L.mod('cards', S.cur.path), all = r?.cards ?? []
    if (!all.length) return paint(pnHead('Pour réviser', 'Flash cards') + pnEmpty('Pas encore de flash cards', 'Des questions-réponses sur le cours, qui reviennent juste avant que tu les oublies.', makeBtn('cartes', 'Créer les flash cards')))
    const due = all.filter(c => c.due)
    PANE.data = { all, list: due.length ? due : null, i: 0, flipped: false, again: new Set(), stats: { again: 0, hard: 0, good: 0, easy: 0 } }
    renderCards()
  },
  // Le TP noté en entier : un exercice à la fois, du plus simple au plus dur
  async tp() {
    if (!S.tp.length) { PANE.data = { make: true, questions: Number(read('tpQ', 5)) || 5 }; return renderTp() }
    PANE.data = { mode: 'tp', i: 0, recap: false, list: S.tp.map(e => ({ ...e, answer: e.type === 'code' ? e.stub : '', points: undefined, feedback: null, showIndice: false, showSolution: false, self: false })) }
    renderTp()
  },
  // Le cours lui-même : ses fichiers, ses sources, le régénérer
  async gerer() {
    const files = await L.mod('sources', { course: S.cur.path }) ?? [], c = S.cur.info ?? {}, busy = RUN?.status === 'run'
    const KIND = { photo: 'photo', pdf: 'PDF', lien: 'lien', texte: 'texte' }
    paint(pnHead('Pour réviser', 'Sources et régénérer', [S.cur.matiere, S.cur.type].filter(Boolean).map(esc).join(' · '))
      + `<div class="pn-acts">${c.pdf ? pnBtn('open', 'Ouvrir le PDF', { data: 'data-what="pdf"' }) : ''}${pnBtn('open', 'Ouvrir dans Obsidian', { data: 'data-what="obsidian"' })}${pnBtn('open', 'Afficher le dossier', { data: 'data-what="folder"' })}${pnBtn('open', 'Exporter (.incipit)', { data: 'data-what="export"' })}</div>
      <h2 class="pn-h2">Sources <span>${files.length}</span></h2>
      <div class="pn-files">${files.map(f => `<div class="pn-file"><span><b>${esc(f.kind === 'lien' && f.url ? f.url : f.name)}</b><small>${KIND[f.kind] ?? f.kind}${f.warn ? ` · ${esc(f.warn)}` : ''}</small></span>${pnBtn('rmSource', 'Retirer', { data: `data-name="${esc(f.name)}"` })}</div>`).join('') || '<p class="pn-muted">Aucune source gardée pour ce cours.</p>'}</div>
      <div class="pn-acts">${pnBtn('addFiles', 'Ajouter des fichiers…')}<form class="pn-link" id="pnLink"><input placeholder="https://… une page à ajouter aux sources" aria-label="Lien" spellcheck="false"><button class="pn-btn" type="submit">Ajouter le lien</button></form></div>
      <h2 class="pn-h2">Régénérer</h2>
      <p class="pn-muted">Réécrit tout le cours depuis ses sources, avec les règles d’aujourd’hui (schémas compris). L’ancienne version est gardée dans .versions.</p>
      <div class="pn-acts">${pnBtn('regen', 'Régénérer le cours', { pri: true, disabled: busy || !files.length })}${[['fiche', 'la fiche'], ['cartes', 'les flash cards'], ['tp', 'le TP noté']].filter(([k]) => !c[k]).map(([k, l]) => pnBtn('make', `Créer ${l}`, { data: `data-k="${k}"`, disabled: busy })).join('')}</div>`)
  },
  // Le bilan, une fois le dernier chapitre fini
  async fin() {
    const all = S.items.filter(counts), n = all.filter(isDone).length, qs = Object.values(S.prog.quiz ?? {}), avg = qs.length ? Math.round(qs.reduce((a, b) => a + b, 0) / qs.length * 100) : null
    const due = S.cards.filter(c => c.due).length
    paint(pnHead('Bilan', n === all.length ? 'Bravo, tu as fini ce cours' : 'Où tu en es dans ce cours')
      + `<div class="facts pn-facts"><span><b>${n} / ${all.length}</b><small>chapitres et quiz</small></span>${avg !== null ? `<span><b>${avg} %</b><small>au quiz, en moyenne</small></span>` : ''}${S.cards.length ? `<span><b>${due}</b><small>flash cards à revoir</small></span>` : ''}</div>
      <p class="pn-muted">Pour t’en souvenir le jour de l’examen : les flash cards reviennent juste avant que tu oublies, la fiche tient sur une page.</p>
      <div class="pn-acts">${pnBtn('goId', S.cards.length ? (due ? `Réviser les ${due} flash cards` : 'Revoir les flash cards') : 'Créer les flash cards', { pri: true, data: 'data-id="r-cartes"' })}${pnBtn('goId', 'Ouvrir la fiche', { data: 'data-id="r-fiche"' })}${pnBtn('home', 'Retour à mes cours')}</div>`)
  },
}

// ---------- Le quiz d'une partie ----------
// Les choix d'une question : sa réponse et jusqu'à trois réponses d'autres cartes du cours, mélangées ; moins de deux
// autres réponses : pas de QCM, la carte se retourne comme avant
function choices(good, pool) {
  const others = pool.filter(v => v !== good).sort(() => Math.random() - 0.5).slice(0, 3)
  return others.length < 2 ? null : [good, ...others].sort(() => Math.random() - 0.5)
}
function renderQuiz() {
  const q = PANE.data, it = PANE.it
  if (q.mode === 'tp') return renderTp(true)
  const done = q.i >= q.list.length
  if (done) {
    const score = q.list.filter(c => c.known).length / q.list.length
    return paint(pnHead(kickOf(it), it.title) + `<div class="pn-recap"><b>${Math.round(score * 100)} %</b><p>${score >= .7 ? 'Partie validée.' : 'Relis les chapitres de cette partie, puis refais le quiz.'} Les cartes ratées reviendront dans tes révisions.</p></div>
      <div class="pn-acts">${nextBtn()}${pnBtn('quizAgain', 'Refaire le quiz')}</div>`)
  }
  const c = q.list[q.i]
  if (c.opts) {
    const checked = c.known !== undefined
    return paint(pnHead(kickOf(it), it.title, `Question ${q.i + 1} sur ${q.list.length}`) + `<span class="pn-bar"><i data-pct="${Math.round(100 * q.i / q.list.length)}"></i></span>
      <p class="qq">${inline(esc(c.recto))}</p>
      <div class="qos">${c.opts.map((o, k) => `<button class="qo${c.pick === k ? ' on' : ''}${checked && o === c.verso ? ' ok' : ''}${checked && c.pick === k && o !== c.verso ? ' ko' : ''}" data-pn="qPick" data-o="${k}" ${checked ? 'disabled' : ''}><i></i><span>${inline(esc(o))}</span></button>`).join('')}</div>
      ${checked ? `<p class="pn-fb" data-ok="${c.known}">${c.known ? 'Juste !' : 'Pas tout à fait : la bonne réponse est en vert.'}</p>` : ''}
      <div class="pn-acts">${q.i ? pnBtn('qPrev', '‹ Question précédente') : ''}<span class="pn-grow"></span>${checked ? pnBtn('qNext', q.i === q.list.length - 1 ? 'Voir le résultat →' : 'Question suivante →', { pri: true }) : pnBtn('qValid', 'Valider →', { pri: true, disabled: c.pick === null })}</div>`)
  }
  paint(pnHead(kickOf(it), it.title, `Question ${q.i + 1} sur ${q.list.length} · réfléchis, puis regarde la réponse`) + `<span class="pn-bar"><i data-pct="${Math.round(100 * q.i / q.list.length)}"></i></span>
    <button class="pn-card" data-pn="flip"><span class="pn-recto">${inline(esc(c.recto))}</span>
      ${q.flipped ? `<i class="pn-rule"></i><span class="pn-verso">${inline(esc(c.verso))}</span>` : '<small>Clique pour voir la réponse</small>'}</button>
    <div class="pn-acts">${q.flipped ? pnBtn('known', 'Je savais', { pri: true, data: 'data-v="1"' }) + pnBtn('known', 'Je ne savais pas', { data: 'data-v="0"' }) : pnBtn('flip', 'Voir la réponse', { pri: true })}</div>`)
}
async function quizValid() {
  const q = PANE.data, c = q.list[q.i]
  if (c.pick === null || c.known !== undefined) return
  c.known = c.opts[c.pick] === c.verso
  await L.mod('review', c.course, c.id, c.known ? 'good' : 'again') // le quiz nourrit aussi les révisions
  renderQuiz()
}
function quizNext() {
  const q = PANE.data
  q.i++
  if (q.i >= q.list.length) markDone(PANE.it, q.list.filter(x => x.known).length / q.list.length)
  renderQuiz()
}
async function quizKnown(v) {
  const q = PANE.data, c = q.list[q.i]
  c.known = v === '1'
  await L.mod('review', c.course, c.id, c.known ? 'good' : 'again') // le quiz nourrit aussi les révisions
  q.i++; q.flipped = false
  if (q.i >= q.list.length) markDone(PANE.it, q.list.filter(x => x.known).length / q.list.length)
  renderQuiz()
}

// ---------- Flash cards ----------
const ICONS3 = { again: '<svg viewBox="0 0 24 24"><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/></svg>',
  hard: '<svg viewBox="0 0 24 24"><path d="M12 2 2 9l10 13L22 9z"/></svg>', good: '<svg viewBox="0 0 24 24"><path d="M2 12a10 10 0 1 0 3-7.1"/><path d="m8 12 3 3 5-6"/></svg>' }
function renderCards() {
  const k = PANE.data
  if (!k.list) return paint(pnHead('Pour réviser', 'Flash cards') + pnEmpty('Rien à revoir aujourd’hui', `Tes ${k.all.length} cartes reviendront d’elles-mêmes quand ce sera le moment.`, pnBtn('cardsAll', 'Tout revoir quand même')))
  if (k.done) {
    const n = Object.values(k.stats).reduce((a, b) => a + b, 0)
    return paint(pnHead('Pour réviser', 'Flash cards') + pnEmpty(`${n} carte${n > 1 ? 's' : ''} revue${n > 1 ? 's' : ''}`,
      `${k.stats.good + k.stats.easy} sues · ${k.stats.hard} difficiles · ${k.stats.again} à revoir. Elles reviendront juste avant que tu les oublies.`, pnBtn('goId', 'Ouvrir la fiche', { data: 'data-id="r-fiche"' })))
  }
  const card = k.list[k.i]
  paint(pnHead('Pour réviser', 'Flash cards', `Carte ${k.i + 1} sur ${k.list.length}`) + `<span class="pn-bar"><i data-pct="${Math.round(100 * k.i / k.list.length)}"></i></span>
    <div class="fc"><button class="fc-arrow" data-pn="cardPrev" aria-label="Carte précédente" ${k.i ? '' : 'disabled'}>‹</button>
    <button class="pn-card" data-pn="flip"><span class="lab">${esc(sansNum(card.notion))}${card.fresh ? ' · nouvelle' : ''}</span>
      <span class="pn-recto">${inline(esc(card.recto))}</span>
      ${k.flipped ? `<i class="pn-rule"></i><span class="pn-verso">${inline(esc(card.verso))}</span>` : '<small>Réfléchis, puis clique pour voir la réponse</small>'}</button>
    <button class="fc-arrow" data-pn="cardSkip" aria-label="Carte suivante" ${k.i < k.list.length - 1 ? '' : 'disabled'}>›</button></div>
    <div class="pn-grades">${k.flipped ? GRADE_LABELS.map(([g, l]) => `<button class="pn-grade" data-pn="grade" data-g="${g}"><b>${ICONS3[g]}${l}</b><small>${esc(card.waits?.[g] ?? '')}</small></button>`).join('')
      : pnBtn('flip', 'Voir la réponse', { pri: true })}</div>`)
}
async function gradeCard(g) {
  const k = PANE.data, c = k.list[k.i]
  k.stats[g]++
  await L.mod('review', c.course, c.id, g)
  if (g === 'again' && !k.again.has(c.id)) { k.again.add(c.id); k.list.push({ ...c, fresh: false }) }
  k.flipped = false
  if (++k.i >= k.list.length) k.done = true
  renderCards()
}

// ---------- TP noté (en entier, ou les exercices d'une partie pour son quiz) ----------
function renderTp(quiz = false) {
  const t = PANE.data, it = PANE.it
  if (t.make) return paint(pnHead('Pour réviser', 'TP noté') + pnEmpty('Pas encore de TP noté', 'Des exercices du plus simple au plus dur, corrigés tout seuls : une valeur attendue, des idées clés, ou ton code lancé contre ses tests. Chaque partie aura aussi son quiz.',
    `<span class="seg">${[5, 8, 12].map(n => `<button data-pn="tpQ" data-v="${n}" class="${t.questions === n ? 'on' : ''}">${n} exercices</button>`).join('')}</span>
     <input class="pn-in" id="tpFocus" placeholder="Sur un point précis ? (facultatif)" maxlength="200">${pnBtn('makeTp', 'Créer le TP', { pri: true, disabled: RUN?.status === 'run' })}`))
  const score = pct(t.list), kick = quiz ? kickOf(it) : 'Pour réviser', title = quiz ? it.title : 'TP noté'
  if (t.recap) {
    const by = key => Object.entries(t.list.reduce((m, e) => { const k = e[key] || '—'; (m[k] ??= []).push(e); return m }, {}))
    const rows = (list, label) => list.map(([k, l]) => `<div class="pn-rrow"><span>${esc(label(k))}</span><i data-pct="${pct(l)}"></i><b>${pct(l)} %</b></div>`).join('')
    const verdict = score >= 90 ? 'Acquis, jusqu’aux détails.' : score >= 70 ? 'L’essentiel est là : reprends les exercices ratés.' : score >= 40 ? 'Les bases tiennent, le fond reste à travailler.' : 'Relis les chapitres avant de recommencer.'
    const order = Object.keys(PALIERS)
    return paint(pnHead(kick, title, 'Bilan') + `<div class="pn-recap"><b>${score} %</b><p>${verdict}</p></div>
      <h2 class="pn-h2">Par palier</h2>${rows(by('palier').sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)), k => PALIERS[k] ?? k)}
      ${quiz ? '' : `<h2 class="pn-h2">Par notion</h2>${rows(by('notion'), k => sansNum(k))}`}
      <div class="pn-acts">${quiz ? nextBtn() : ''}${pnBtn('tpRestart', 'Recommencer')}</div>`)
  }
  const e = t.list[t.i], last = t.i === t.list.length - 1
  const field = e.type === 'code' ? `<div class="code pn-codewin"><div class="code-h"><i></i><i></i><i></i><span class="lang">ton code</span><button class="copy" type="button" data-pn="tpReset">Réinitialiser</button></div><textarea class="pn-answer code" id="tpAns" spellcheck="false" aria-label="Ton code">${esc(e.answer)}</textarea></div>`
    : e.type === 'calcul' ? `<input class="pn-answer" id="tpAns" value="${esc(e.answer)}" placeholder="Ta réponse…" autocomplete="off" aria-label="Ta réponse">`
    : `<textarea class="pn-answer" id="tpAns" placeholder="Ta réponse…" aria-label="Ta réponse">${esc(e.answer)}</textarea>`
  paint(pnHead(kick, title, `Exercice ${t.i + 1} sur ${t.list.length} · ${score} %`) + `<span class="pn-bar"><i data-pct="${Math.round(100 * t.i / t.list.length)}"></i></span>
    <div class="pn-ex"><div class="lab"><span class="pn-palier">${esc(PALIERS[e.palier] ?? e.palier)}</span>${quiz ? '' : esc(sansNum(e.notion))}</div>
      <div class="pn-enonce">${pnText(e.enonce)}</div>${field}
      ${e.feedback ? `<p class="pn-fb" data-ok="${e.feedback.ok}">${esc(e.feedback.text)}</p>` : ''}
      ${e.self ? `<div class="pn-acts"><span class="pn-muted">Corrige-toi : as-tu eu juste ?</span>${[[1, 'Juste'], [0.5, 'À moitié'], [0, 'Faux']].map(([v, l]) => pnBtn('tpSelf', l, { data: `data-v="${v}"` })).join('')}</div>` : ''}
      ${e.showIndice ? `<div class="pn-box"><b>Indice</b>${pnText(e.indice)}</div>` : ''}
      ${e.showSolution ? `<div class="pn-box sol"><b>Solution</b>${pnText(e.solution)}</div>` : ''}</div>
    <div class="pn-acts">${t.i ? pnBtn('tpPrev', '‹ Précédent') : ''}${e.showIndice || !String(e.indice ?? '').trim() ? '' : pnBtn('tpHint', 'Indice')}${e.showSolution || !String(e.solution ?? '').trim() ? '' : pnBtn('tpSol', 'Solution')}
      <span class="pn-grow"></span>${pnBtn('tpCheck', e.type === 'code' ? 'Tester mon code →' : 'Vérifier', { disabled: t.busy, pri: e.type === 'code' })}${pnBtn('tpNext', last ? 'Voir le résultat' : 'Suivant ›', { pri: true })}</div>`)
}
const reTp = () => PANE.name === 'quiz' ? renderQuiz() : renderTp()
const proofOf = e => { L.mod('tpResult', S.cur.path, e.i, e.points) } // chaque exercice noté laisse une preuve de travail
async function tpCheck() {
  const t = PANE.data, e = t.list[t.i]
  e.answer = $('#tpAns')?.value ?? e.answer
  e.self = false; t.busy = true
  if (e.type === 'code') { e.feedback = { ok: null, text: 'Exécution des tests…' }; reTp() }
  const r = await L.mod('tpCheck', S.cur.path, e.i, e.answer) ?? { erreur: 'Correction impossible.' }
  t.busy = false
  if (r.self) { e.showSolution = true; e.self = true; e.feedback = null }
  else if (r.erreur) { e.points = 0; e.feedback = { ok: false, text: `Erreur : ${r.erreur}` } }
  else if ('reussis' in r) { e.points = r.total ? r.reussis / r.total : 0; e.feedback = { ok: r.reussis === r.total, text: `${r.reussis} / ${r.total} test(s) réussi(s)` } }
  else if ('ok' in r) { e.points = r.ok ? 1 : 0; e.feedback = { ok: r.ok, text: r.ok ? 'Juste !' : 'Pas tout à fait : regarde l’indice, ou la solution.' } }
  else { e.points = r.score; e.feedback = { ok: !r.missing.length, text: `${r.found.length} / ${r.found.length + r.missing.length} idée(s) attendue(s) repérée(s)${r.missing.length ? ` · il manque : ${r.missing.join(', ')}` : ''}` } }
  if (!r.self) proofOf(e)
  reTp()
}

// ---------- Les clics dans un panneau ----------
const keepAnswer = () => { const t = PANE.data; if (t?.mode === 'tp' && t.list && !t.recap) t.list[t.i].answer = $('#tpAns')?.value ?? t.list[t.i].answer }
const ACT = {
  next: () => { const n = nextCount(S.at); if (n) go(n.i); else showPane('fin', PANE.it) },
  fin: () => showPane('fin', PANE.it),
  home: () => showHome(),
  goI: el => go(+el.dataset.i),
  goId: el => { const it = S.items.find(x => x.id === el.dataset.id); if (it) go(it.i) },
  flip: () => { const k = PANE.data; if (!k?.list || k.done) return; k.flipped = !k.flipped; PANE.name === 'quiz' ? renderQuiz() : renderCards() },
  known: el => quizKnown(el.dataset.v),
  qPick: el => { const c = PANE.data.list[PANE.data.i]; if (c.known === undefined) { c.pick = +el.dataset.o; renderQuiz() } },
  qValid: () => quizValid(),
  qNext: () => quizNext(),
  qPrev: () => { PANE.data.i = Math.max(0, PANE.data.i - 1); renderQuiz() },
  cardPrev: () => { const k = PANE.data; k.i = Math.max(0, k.i - 1); k.flipped = false; renderCards() },
  cardSkip: () => { const k = PANE.data; k.i = Math.min(k.list.length - 1, k.i + 1); k.flipped = false; renderCards() },
  tpReset: () => { const e = PANE.data.list[PANE.data.i]; e.answer = e.stub ?? ''; e.feedback = null; reTp() },
  quizAgain: () => showPane('quiz', PANE.it),
  grade: el => gradeCard(el.dataset.g),
  cardsAll: () => { const k = PANE.data; Object.assign(k, { list: [...k.all], i: 0, flipped: false, done: false }); renderCards() },
  tpQ: el => { PANE.data.questions = +el.dataset.v; store('tpQ', PANE.data.questions); renderTp() },
  makeTp: () => make({ tp: true, questions: PANE.data.questions, focus: $('#tpFocus')?.value.trim() ?? '' }),
  make: el => make({ [el.dataset.k]: true }),
  tpCheck,
  tpHint: () => { keepAnswer(); PANE.data.list[PANE.data.i].showIndice = true; reTp() },
  // Voir la solution avant d'avoir répondu : l'exercice compte zéro (sinon le score ne voudrait plus rien dire)
  tpSol: () => { keepAnswer(); const e = PANE.data.list[PANE.data.i]; e.showSolution = true; if (e.points === undefined) { e.points = 0; proofOf(e) } reTp() },
  tpSelf: el => { const e = PANE.data.list[PANE.data.i]; e.points = +el.dataset.v; e.self = false; proofOf(e); e.feedback = { ok: e.points === 1, text: `Compté : ${el.textContent.trim().toLowerCase()}` }; reTp() },
  tpPrev: () => { keepAnswer(); PANE.data.i = Math.max(0, PANE.data.i - 1); reTp() },
  tpNext: () => {
    keepAnswer()
    const t = PANE.data
    if (t.i < t.list.length - 1) t.i++
    else { t.recap = true; if (PANE.name === 'quiz') markDone(PANE.it, pct(t.list) / 100) }
    reTp()
  },
  tpRestart: () => { for (const e of PANE.data.list) Object.assign(e, { answer: e.type === 'code' ? e.stub : '', points: undefined, feedback: null, showIndice: false, showSolution: false, self: false }); Object.assign(PANE.data, { i: 0, recap: false }); reTp() },
  open: async el => { const r = await L.mod('open', el.dataset.what, S.cur.path); if (r?.hint) toast(r.hint); else if (r === false) toast('Fichier introuvable.') },
  addFiles: async () => { const r = await L.mod('pickFiles', { course: S.cur.path }); if (r?.added) LOAD.gerer() },
  rmSource: async el => { await L.mod('removeSource', { course: S.cur.path }, el.dataset.name); LOAD.gerer() },
  regen: () => start(L.mod('generate', { course: S.cur.path, options: { cours: true } }), 'Régénération lancée : suis-la en haut à droite.'),
}
paneEl.addEventListener('click', e => {
  const b = e.target.closest('[data-pn]')
  if (b && !b.disabled) return ACT[b.dataset.pn]?.(b)
  const s = e.target.closest('[data-sch]'), fig = e.target.closest('.sch-fig')
  if (s && fig) { const st = SCH.get(fig); st.step = Math.max(0, Math.min(st.n - 1, st.step + Number(s.dataset.sch))); paintSchema(fig) }
  else if (e.target.closest('.sch-draw') && fig) zoomSchema(fig)
})
paneEl.addEventListener('submit', async e => {
  e.preventDefault()
  if (e.target.id !== 'pnLink') return
  const url = e.target.querySelector('input').value.trim(), r = await L.mod('addLink', { course: S.cur.path }, url)
  if (r?.error) toast(r.error); else LOAD.gerer()
})
async function start(promise, text) { const r = await promise; if (r?.error) toast(r.error); else { toast(text); RUN = { ...(RUN ?? {}), status: 'run', course: S.cur?.path }; renderJob() } }
const make = o => start(L.mod('generate', { course: S.cur.path, options: { ...o, questions: o.questions ?? 5 } }), 'C’est lancé : suis la création en haut à droite.')
// Réécrire un chapitre (son titre ## ou ###) : rien d'autre du cours ne bouge
function rewrite(section, consigne) {
  if (!section) return
  if (FIN.test(sansNum(section))) return toast('Cette partie se tire du cours entier : régénère plutôt le cours.')
  start(L.mod('rewrite', { course: S.cur.path, section, consigne }), 'Réécriture lancée : le chapitre se mettra à jour tout seul.')
}

// ---------- La génération en cours, en haut à droite ; finie, le cours se recharge au même endroit ----------
let RUN = null, stopAsk = 0
function renderJob() {
  const j = $('#job'), r = RUN, mine = r?.course && r.course === S.cur?.path
  const recent = r && r.status !== 'run' && mine && Date.now() - (r.ended ?? 0) < 8000
  j.hidden = !(r?.status === 'run' || recent)
  if (j.hidden) return
  j.dataset.status = r.status
  j.innerHTML = r.status === 'run' ? (Date.now() - stopAsk < 3000 ? 'Arrêter ?' : `<i class="spin"></i>${esc(r.phase ?? 'En cours')} · ${r.pct ?? 0} %`) : r.status === 'done' ? 'Prêt' : 'Échec'
  j.title = r.status === 'run' ? `${r.label ?? ''} : deux clics pour arrêter` : r.error ?? ''
}
$('#job').onclick = async () => {
  if (RUN?.status !== 'run') return
  if (Date.now() - stopAsk < 3000) { stopAsk = 0; await L.mod('cancel'); return }
  stopAsk = Date.now(); renderJob(); setTimeout(renderJob, 3100)
}
L.onRun(async r => {
  const was = RUN
  RUN = r
  renderJob()
  if (!r || !was || was.status !== 'run' || r.status === 'run' || r.course !== S.cur?.path) return
  setTimeout(renderJob, 8100)
  if (r.status !== 'done') return toast(r.status === 'error' ? `Échec : ${r.error ?? ''}` : 'Arrêté.')
  toast(r.kind === 'reecrire' ? 'Chapitre réécrit.' : r.kind === 'cours' ? 'Cours régénéré.' : 'C’est prêt.')
  const sh = await L.call('shelf')
  if (Array.isArray(sh)) S.shelf = sh
  openCourse(S.cur.path, S.items[S.at]?.id)
})
L.mod('state').then(st => { RUN = st?.run ?? null; renderJob() })

function toast(text) {
  const t = $('#toast')
  t.textContent = text; t.hidden = false
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true }, 4500)
}

// À droite du chapitre, « Sources » : tout ce qui sert ce chapitre, à un seul endroit.
// - les diapos du prof liées au chapitre (engine/lecteur.py) ;
// - tes notes : les photos montrées dans ce chapitre, et toutes celles du cours ;
// - tes liens : les pages ajoutées aux sources du cours ;
// - pour aller plus loin : des vidéos YouTube (au bon moment) et des pages web qui expliquent exactement ce chapitre,
//   cherchées à la demande (ressources.js), gardées ensuite.
// Utilise ce que lecteur-ui.js définit : $, $$, esc, S, L, viewer.
const SRC = { links: new Map(), wait: new Set() }
const pageOf = r => S.cur?.files?.[r.f]?.pages?.[r.p - 1]
const fileName = u => decodeURIComponent(String(u ?? '').split(/[?#]/)[0]).split(/[\\/]/).pop().toLowerCase()
const SICON = {
  play: '<svg viewBox="0 0 24 24"><path d="m7 4 13 8-13 8z"/></svg>',
  web: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
}

// Le texte du chapitre ouvert (pour la recherche) et ses photos
const textOf = it => (it?.nodes ?? []).map(n => n.textContent).join('\n').replace(/\s+\n/g, '\n').trim()
function photosOf(it) {
  const F = S.cur?.files?.photos
  if (!F) return []
  const names = new Map(F.pages.map((pg, i) => [fileName(pg.url), i + 1]))
  const out = []
  for (const n of it?.nodes ?? []) for (const img of n.querySelectorAll ? [...(n.matches?.('img') ? [n] : []), ...n.querySelectorAll('img')] : []) {
    const p = names.get(fileName(img.getAttribute('src')))
    if (p && !out.includes(p)) out.push(p)
  }
  return out
}
const card = (f, p, small) => { const pg = pageOf({ f, p }), F = S.cur.files[f]; return pg ? `<button class="slide" data-f="${esc(f)}" data-p="${p}"><span class="media" data-bg="${esc(pg.url)}"></span><p>${esc(pg.titre || `${F.unite} ${p}`)}</p><small>${esc(small)}</small></button>` : '' }

function renderSide(it) {
  const box = $('#sideSrc')
  if (!S.cur) { $('#sideSrcBtn').textContent = 'Sources'; box.innerHTML = '<p class="none">Ouvre un cours : ses sources s’afficheront ici, à côté de chaque chapitre.</p>'; return }
  const files = S.cur.files ?? {}, refs = (it?.refs?.length ? it.refs : it?.part?.refs ?? []).filter(r => r.f !== 'photos')
  const diapos = Object.keys(files).filter(k => files[k].unite === 'diapo'), photos = photosOf(it), allPhotos = files.photos?.pages.length ?? 0
  const links = SRC.links.get(S.cur.path) ?? []
  const chapter = it && (it.kind === 'chap' || it.kind === 'intro') && it.nodes?.length
  let h = ''
  // 1. les diapos du prof
  h += `<section class="src-sec"><div class="lab">Diapos du prof${refs.length ? ` · ${refs.length}` : ''}</div>`
  h += refs.length ? refs.map(r => card(r.f, r.p, `${files[r.f]?.nom ?? ''} · ${files[r.f]?.unite ?? ''} ${r.p} · voir en grand`)).join('')
    : `<p class="none">${diapos.length ? 'Aucune diapo n’est liée à ce chapitre.' : 'Pas de diapo du prof gardée pour ce cours.'}</p>`
  if (diapos.length) h += '<button class="src-more" data-all="diapo">Parcourir tout le cours du prof</button>'
  h += '</section>'
  // 2. tes notes (photos)
  if (allPhotos) {
    h += `<section class="src-sec"><div class="lab">Tes notes${photos.length ? ` · ${photos.length}` : ''}</div>`
    h += photos.length ? photos.map(p => card('photos', p, `photo ${p} · voir en grand`)).join('') : '<p class="none">Aucune de tes photos n’est montrée dans ce chapitre.</p>'
    h += `<button class="src-more" data-all="photo">Voir toutes tes photos (${allPhotos})</button></section>`
  }
  // 3. tes liens (les sources du cours)
  if (links.length) h += `<section class="src-sec"><div class="lab">Tes liens · ${links.length}</div>${links.map(l => `<a class="src-link" href="${esc(l.url)}" target="_blank">${SICON.link}<span><b>${esc(l.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 80))}</b><small>ajouté aux sources du cours</small></span></a>`).join('')}</section>`
  // 4. pour aller plus loin
  if (chapter) h += `<section class="src-sec" id="srcWeb"><div class="lab">Pour aller plus loin</div><p class="none">…</p></section>`
  $('#sideSrcBtn').textContent = 'Sources'
  box.innerHTML = h
  for (const m of $$('#sideSrc [data-bg]')) m.style.backgroundImage = `url("${m.dataset.bg}")`
  if (!SRC.links.has(S.cur.path)) loadLinks(S.cur.path, it)
  if (chapter) loadWeb(it)
}
async function loadLinks(p, it) {
  SRC.links.set(p, [])
  const list = await L.mod('sources', { course: p }) ?? []
  SRC.links.set(p, list.filter(f => f.kind === 'lien' && /^https?:\/\//.test(f.url ?? '')).map(f => ({ url: f.url })))
  if (S.cur?.path === p && SRC.links.get(p).length && S.items[S.at] === it) renderSide(it)
}

// ---------- Pour aller plus loin ----------
const keyOf = it => ({ path: S.cur.path, chap: it.id })
async function loadWeb(it) {
  const r = await L.call('res', { op: 'get', ...keyOf(it) })
  if (S.items[S.at] !== it) return
  paintWeb(it, r?.data, r?.searching || SRC.wait.has(`${S.cur.path}\n${it.id}`))
}
function paintWeb(it, data, searching, error) {
  const sec = $('#srcWeb')
  if (!sec || S.items[S.at] !== it) return
  const head = '<div class="lab">Pour aller plus loin</div>'
  if (searching) { sec.innerHTML = `${head}<p class="src-wait"><span class="spin"></span>Recherche de vidéos et de pages sur ce chapitre… (environ une minute ; tu peux continuer à lire)</p>`; return }
  const btn = (label, cls = 'pri') => `<button class="ib-btn ${cls}" data-web="find">${SICON.search}<span>${label}</span></button>`
  if (!data) {
    sec.innerHTML = `${head}${error ? `<p class="src-err">${esc(error)}</p>` : ''}<p class="none">Des vidéos YouTube (au bon moment) et des pages web qui expliquent exactement ce chapitre, trouvées et vérifiées par Claude.</p>
      <div class="src-acts">${btn('Trouver des ressources')}<small>≈ 1 min · utilise ton quota Claude</small></div>`
    return
  }
  const vids = data.ressources.filter(r => r.type === 'video'), sites = data.ressources.filter(r => r.type !== 'video')
  const lang = r => r.langue && r.langue !== 'fr' ? `<em class="src-lang">${esc(r.langue.toUpperCase())}</em>` : ''
  const video = r => `<div class="src-vid"><a href="${esc(r.lien)}" target="_blank" class="src-thumb" style="background-image:url('${esc(r.image ?? '')}')">${SICON.play}${r.debutTexte ? `<span class="src-at">à ${esc(r.debutTexte)}</span>` : r.duree ? `<span class="src-at dim">${esc(r.duree)}</span>` : ''}</a>
      <div class="src-vt"><a href="${esc(r.lien)}" target="_blank"><b>${esc(r.titre)}</b></a><small>${esc(r.auteur)}${lang(r)}</small>${r.passage ? `<small class="src-pass">Le passage : « ${esc(r.passage)} »</small>` : ''}<p>${esc(r.pourquoi)}</p>
      ${r.chapitres?.length > 1 ? `<details><summary>Chapitres de la vidéo (${r.chapitres.length})</summary>${r.chapitres.map(c => `<a href="${esc(`${r.url}&t=${c.s}s`)}" target="_blank" class="${c.s === r.debut ? 'on' : ''}"><span>${esc(clockOf(c.s))}</span>${esc(c.titre)}</a>`).join('')}</details>` : ''}</div></div>`
  const site = r => `<a class="src-link" href="${esc(r.lien)}" target="_blank">${SICON.web}<span><b>${esc(r.titre)}</b><small>${esc(r.site)}${lang(r)}</small><p>${esc(r.pourquoi)}</p></span></a>`
  sec.innerHTML = `${head}${vids.length ? `<div class="src-sub">Vidéos</div>${vids.map(video).join('')}` : ''}${sites.length ? `<div class="src-sub">Sites</div>${sites.map(site).join('')}` : ''}
    ${!data.ressources.length ? '<p class="none">Rien de fiable trouvé pour ce chapitre.</p>' : ''}
    <div class="src-acts">${btn('Chercher à nouveau', '')}<small>trouvé le ${new Date(data.at).toLocaleDateString('fr-FR')}${data.retirees ? ` · ${data.retirees} lien${data.retirees > 1 ? 's' : ''} mort${data.retirees > 1 ? 's' : ''} retiré${data.retirees > 1 ? 's' : ''}` : ''}</small></div>`
}
const clockOf = s => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}` }
async function findWeb(it) {
  const k = `${S.cur.path}\n${it.id}`, cur = S.cur
  if (SRC.wait.has(k)) return
  SRC.wait.add(k); paintWeb(it, null, true)
  const r = await L.call('res', { op: 'find', ...keyOf(it), matiere: cur.matiere, coursTitre: cur.titre, titre: it.title, texte: textOf(it) })
  SRC.wait.delete(k)
  if (S.cur === cur) paintWeb(it, r?.data, false, r?.error ?? (r ? null : 'La recherche n’a pas pu se faire.'))
}

$('#sideSrc').onclick = e => {
  const s = e.target.closest('.slide')
  if (s) return viewer(s.dataset.f, +s.dataset.p)
  const all = e.target.closest('[data-all]')
  if (all) { const f = all.dataset.all === 'photo' ? 'photos' : Object.keys(S.cur.files).find(k => S.cur.files[k].unite === 'diapo'); if (f) viewer(f, 1); return }
  const w = e.target.closest('[data-web="find"]'), it = S.items[S.at]
  if (w && it) findWeb(it)
}

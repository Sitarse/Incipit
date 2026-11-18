const { execFile, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const lib = require('./lib')
const platform = require('../../app/platform')
const schemas = require('./schemas-cours')

// Cours : les générations, une à la fois. Chaque étape lance un script du moteur (engine/) par uv et lit sa sortie ligne
// par ligne : l'avancement (la barre), le journal, et l'activité de l'IA (chaque appel : étape, modèle, ce qui part et
// revient, durée, échec ; la demande et la réponse complètes dans le journal de la génération). Arrêtable à tout moment.
const LOGS = 300, CALLS = 120, RUNS_KEPT = 8
const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-')
// Arrête un processus et tous ceux qu'il a lancés (uv → python → claude.exe)
const killTree = pid => platform.killTree(pid)
class Stop extends Error {}

// ctx : send, engine (dossier du moteur), uvPath, engineEnv, settingsView, dest, work, draft, journal, noKeys,
// ensureVault, copyImages, adoptDraft (main.js)
module.exports = ctx => {
  let run = null, publishTimer = null
  const view = () => run && { id: run.id, kind: run.kind, label: run.label, course: run.course, status: run.status, phase: run.phase, pct: run.pct,
    logs: run.logs, calls: run.calls, started: run.started, ended: run.ended, error: run.error, result: run.result, trace: run.trace,
    who: run.who, moteur: run.moteur, plan: run.plan, at: run.at }
  // Les étapes en clair (lib.planOf) : la génération en est à celle-ci, jamais en arrière
  const mark = key => { const i = run.plan.findIndex(s => s[0] === key); if (i > run.at) { run.at = i; publish() } }
  const publish = (now = false) => {
    if (now) { clearTimeout(publishTimer); publishTimer = null; return ctx.send('run', view()) }
    publishTimer ??= setTimeout(() => { publishTimer = null; ctx.send('run', view()) }, 150)
  }
  const log = (text, tone = '') => { run.logs.push({ t: Date.now(), text, tone }); if (run.logs.length > LOGS) run.logs.splice(0, run.logs.length - LOGS); publish() }
  // La barre d'une génération en plusieurs étapes : chaque étape remplit sa part
  const phase = (text, pct) => {
    run.phase = text; run.pct = Math.round(run.base + (run.span * Math.min(100, pct)) / 100)
    // generator.py : jusqu'à 70 il lit les sources (photos, PDF), au-delà il rédige
    if (run.writing && pct >= 70) mark('ecrit')
    publish()
  }

  function onEvent(e) {
    if (e.t === 'jetons') return void ctx.onUsage?.(e.modele, e.usage)
    const id = `${run.step}-${e.id}`
    if (e.t === 'appel') {
      run.calls.push({ id, etape: e.etape, moteur: e.moteur, modele: e.modele, envoye: e.envoye, photo: e.photo, status: 'run', t: Date.now() })
      if (run.calls.length > CALLS) run.calls.splice(0, run.calls.length - CALLS)
    } else {
      const c = run.calls.find(x => x.id === id)
      if (!c) return
      if (e.t === 'flux') Object.assign(c, { mots: e.mots, fin: e.fin })
      if (e.t === 'fini') Object.assign(c, { status: 'ok', recu: e.recu, mots: e.mots, duree: e.duree, qui: e.qui, trace: e.trace, fin: undefined })
      if (e.t === 'echec') Object.assign(c, { status: 'ko', erreur: e.erreur, duree: e.duree, trace: e.trace, fin: undefined })
      // exercices.py n'écrit pas d'avancement : chaque support terminé fait avancer la barre
      if (e.t !== 'flux' && run.supports) phase(run.phase, 5 + 90 * run.calls.filter(x => x.id.startsWith(`${run.step}-`) && x.status !== 'run').length / run.supports)
    }
    publish()
  }

  // Un script du moteur ; rend son code de sortie et la dernière ligne de journal (la raison d'un échec)
  function step(script, args) {
    run.step++
    // Le journal des appels de l'IA : un dossier par étape, sinon deux scripts y numéroteraient leurs appels pareil
    const trace = script === 'md2pdf.py' ? [] : ['--trace', path.join(run.trace, `${String(run.step).padStart(2, '0')} ${script.replace(/\.py$/, '')}`)]
    return new Promise(resolve => {
      const child = spawn(ctx.uvPath(), ['run', '--script', path.join(ctx.engine, script), ...args, ...trace], { cwd: ctx.engine, env: ctx.engineEnv(), ...platform.spawnOptions() })
      run.child = child
      let rest = '', tail = ''
      const take = chunk => {
        rest += chunk
        const lines = rest.split(/\r?\n/)
        rest = lines.pop()
        for (const l of lines) {
          const p = lib.parseLine(l)
          if (!p) continue
          if (p.type === 'event') onEvent(p.data)
          else if (p.type === 'phase') phase(p.text, p.pct)
          else { log(p.text); tail = p.text }
        }
      }
      child.stdout.setEncoding('utf8').on('data', take)
      child.stderr.setEncoding('utf8').on('data', take)
      child.on('error', err => { log(`Lancement impossible : ${err.message}`, 'bad'); resolve({ code: -1, tail: err.message }) })
      child.on('close', code => { if (rest) take('\n'); run.child = null; resolve({ code, tail }) })
    })
  }
  async function pdf(md) {
    const out = md.replace(/\.md$/i, '.pdf')
    const { code } = await step('md2pdf.py', [md, out])
    if (code === 0 && fs.existsSync(out)) { log(`PDF : ${path.basename(out)}`); return out }
    log(`PDF non généré${fs.existsSync(out) ? ' : est-il ouvert dans une autre appli ?' : ''}`, 'bad')
    return null
  }
  // Les blocs ```schema écrits par l'IA deviennent des dessins (schemas-cours.js) ; un schéma faux est retiré, et dit
  function draw(md, titre) {
    try {
      const r = schemas.apply(md, titre, lib)
      if (r.drawn) log(`${r.drawn} schéma${r.drawn > 1 ? 's' : ''} dessiné${r.drawn > 1 ? 's' : ''}`)
      for (const d of r.dropped) log(`Schéma écarté (${d.titre}) : ${d.raison}`, 'bad')
    } catch (err) { log(`Schémas non dessinés : ${err.message}`, 'bad'); console.error('Cours (schémas) :', err) }
  }
  const check = ({ code, tail }, what) => {
    if (run.cancelled) throw new Stop()
    if (code !== 0) throw new Error(`${what} a échoué${tail ? ` : ${tail}` : ''}`)
  }

  // job : { kind: 'cours' | 'reecrire' | 'supports', who: { matiere, type, titre }, options, section, consigne, draft }
  // draft : un nouveau cours s'écrit depuis le brouillon, qui ne devient ses sources qu'une fois le cours écrit
  async function pipeline(job) {
    const { matiere, type, titre } = job.who, o = job.options, s = ctx.settingsView(), dest = ctx.dest()
    // Le skill « cours » : Opus ou NIM ; quota Claude presque plein : NIM, pour le cours comme pour ses supports
    const plan = lib.planFor(s.moteur, !!ctx.low?.(), !!ctx.nimOk?.(), s.claudeModel), moteur = plan.moteur, force = plan.modele ? ['--modele', plan.modele] : []
    if (plan.note) log(plan.note)
    run.moteur = moteur === 'claude-cli' ? `Claude ${(plan.modele || 'opus').replace(/^./, c => c.toUpperCase())}` : lib.MOTEURS[moteur]?.nom ?? moteur
    const own = lib.sourcesDir(ctx.work, matiere, type, titre), sources = job.draft ? ctx.draft : own, course = lib.courseFile(dest, matiere, type, titre)
    const common = ['--sources', sources, '--sortie', course, '--matiere', lib.getMatiere(matiere), '--type', lib.getType(type), '--titre', lib.getTitre(titre),
      '--moteur', moteur, '--cle-env', ctx.noKeys, '--langue', s.langue, '--longueur', s.longueur, '--format', s.format, ...force]
    const steps = (job.kind === 'reecrire' ? 1 : (o.cours ? 1 : 0) + (o.sujet ? 1 : 0)) + (o.fiche || o.tp || o.cartes ? 1 : 0)
    let done = 0
    const next = () => { run.base = Math.round((100 * done) / steps); run.span = 100 / steps; done++ }
    run.course = course
    if (job.kind === 'reecrire') {
      next()
      phase(`Réécriture de « ${job.section} »`, 2)
      check(await step('generator.py', [...common, '--reecrire', job.section, '--consigne', job.consigne]), 'La réécriture')
      mark('pdf')
      draw(course, titre)
      phase('Mise en page du PDF', 96)
      run.result.pdf = await pdf(course)
      return
    }
    if (o.cours || o.sujet) {
      ctx.ensureVault(dest)
      const liens = ctx.copyImages(sources, course, titre)
      if (liens.length) log(`${liens.length} photo(s) copiée(s) à côté du cours`)
      for (const sujet of [false, true]) {
        if (!(sujet ? o.sujet : o.cours)) continue
        next()
        if (sujet) mark('sujet')
        run.writing = !sujet
        phase(sujet ? 'Préparation du sujet' : 'Préparation du cours', 2)
        check(await step('generator.py', [...common, ...liens.flatMap(l => ['--lien', l]), ...(sujet ? ['--sujet'] : [])]), sujet ? 'Le sujet' : 'Le cours')
        run.writing = false
        if (!sujet) mark('pdf')
        const md = sujet ? lib.companions(course).sujet : course
        if (!fs.existsSync(md)) throw new Error('Rien n’a été écrit.')
        if (job.draft) { ctx.adoptDraft(own); job.draft = false; common[1] = own }
        draw(md, titre)
        phase('Mise en page du PDF', 96)
        const out = await pdf(md)
        if (!sujet) run.result.pdf = out
        else run.result.files.push(md)
      }
    }
    if (o.fiche || o.tp || o.cartes) {
      if (!fs.existsSync(course)) throw new Error('Le cours n’existe pas encore : génère-le d’abord.')
      // Un cours v2 porte déjà sa fiche : sa première page
      if (o.fiche && lib.formatOf(fs.readFileSync(course, 'utf8')) === 2) {
        o.fiche = false
        log('La fiche est la première page du cours (L’essentiel)')
        if (!o.tp && !o.cartes) return
      }
      next()
      mark('supports')
      run.supports = [o.tp, o.fiche, o.cartes].filter(Boolean).length
      phase(['Exercices', 'fiche', 'cartes'].filter((_, i) => [o.tp, o.fiche, o.cartes][i]).join(', ').replace(/^./, c => c.toUpperCase()), 3)
      check(await step('exercices.py', ['--source', course, '--niveau', o.niveau, '--moteur', moteur, '--cle-env', ctx.noKeys, '--langue', s.langue,
        '--uv', ctx.uvPath(), ...force, ...(o.tp ? [] : ['--no-tp']), ...(o.fiche ? [] : ['--no-fiche']), ...(o.cartes ? ['--cartes'] : []),
        ...(o.focus ? ['--focus', o.focus] : []), ...(o.questions ? ['--questions', String(o.questions)] : [])]), 'Les supports')
      run.supports = 0
      if (o.fiche && fs.existsSync(lib.companions(course).fiche)) { phase('Mise en page de la fiche', 96); await pdf(lib.companions(course).fiche) }
    }
  }

  // Ce qui empêche de lancer maintenant (null : rien), vérifié avant de toucher aux fichiers
  function blocked() {
    if (run?.status === 'run') return 'Une génération est déjà en cours : attends qu’elle finisse, ou arrête-la.'
    const s = ctx.settingsView()
    return s.moteurs.find(m => m.code === s.moteur)?.souci ?? null
  }
  function start(job, label) {
    const souci = blocked()
    if (souci) return { error: souci }
    fs.mkdirSync(ctx.journal, { recursive: true })
    for (const old of fs.readdirSync(ctx.journal).sort().slice(0, -RUNS_KEPT)) fs.rmSync(path.join(ctx.journal, old), { recursive: true, force: true })
    run = { id: Date.now(), kind: job.kind, label, course: null, status: 'run', phase: 'Préparation', pct: 0, base: 0, span: 100, step: 0, supports: 0,
      who: job.who, moteur: '', plan: lib.planOf(job.kind, job.options), at: 0, writing: false,
      logs: [], calls: [], started: Date.now(), ended: null, error: null, result: { pdf: null, files: [] }, trace: path.join(ctx.journal, stamp()), cancelled: false, child: null }
    publish(true)
    pipeline(job).then(() => {
      run.status = 'done'; run.pct = 100; run.phase = 'Terminé'; run.at = run.plan.length
    }, err => {
      run.status = err instanceof Stop ? 'stopped' : 'error'
      run.phase = err instanceof Stop ? 'Arrêté' : 'Échec'
      if (!(err instanceof Stop)) { run.error = err.message; log(err.message, 'bad'); console.error('Cours :', err.message) }
    }).finally(() => { run.ended = Date.now(); publish(true) })
    return { ok: true }
  }
  async function cancel() {
    if (run?.status !== 'run') return false
    run.cancelled = true
    log('Arrêt demandé…')
    if (run.child?.pid) await killTree(run.child.pid)
    return true
  }
  // Le panneau a vu la fin : on oublie la génération terminée
  function dismiss() { if (run?.status !== 'run') run = null; publish(true) }

  return { start, blocked, cancel, dismiss, view, publish, running: () => run?.status === 'run', killTree }
}

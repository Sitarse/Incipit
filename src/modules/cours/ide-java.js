// Le pas à pas Java de l'IDE des cours (ide.js) : HitoTrace.java (ide-trace-java/) pilote la JVM par JDI et écrit les
// pas au format commun (ide-mem.js). Il est compilé une fois dans DATA/ide/javatrace, recompilé si son code change.
// Le programme de l'élève est déjà compilé (javac -d . dans son dossier) quand traceJava est appelé.
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const platform = require('../../app/platform')

// Lance un programme, rend sa sortie (le pas à pas peut être arrêté : o.track garde le processus pour stop())
function exec(cmd, args, { cwd, env, ms, track, kill } = {}) {
  return new Promise(res => {
    let p
    try { p = spawn(cmd, args, { cwd, env, ...platform.spawnOptions() }) } catch (err) { return res({ code: -1, out: '', err: err.message }) }
    track?.(p)
    let out = '', err = ''
    p.stdout.on('data', d => { out += d.toString('utf8') }); p.stderr.on('data', d => { err += d.toString('utf8') })
    p.on('error', e => { err += e.message })
    // au bout du temps : tout l'arbre (HitoTrace et la JVM du programme qu'il a lancée), sinon le seul processus
    const timer = ms && setTimeout(() => { kill ? kill() : p.kill(); res({ code: -1, out, err: 'temps' }) }, ms)
    p.on('close', code => { clearTimeout(timer); res({ code, out, err }) })
  })
}

// o : { home (DATA/ide), clamp(ligne du programme), track(proc), killTree, ms, max }
async function traceJava(job, inFile, o) {
  const dir = path.join(o.home, 'javatrace'), copy = path.join(dir, 'HitoTrace.java')
  const src = fs.readFileSync(path.join(__dirname, 'ide-trace-java', 'HitoTrace.java'))
  if (!fs.existsSync(path.join(dir, 'HitoTrace.class')) || !fs.existsSync(copy) || !src.equals(fs.readFileSync(copy))) {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(copy, src)
    const c = await exec(job.t.bin, ['--add-modules', 'jdk.jdi', '-encoding', 'UTF-8', '-d', dir, copy], { env: job.env, ms: 120e3 })
    if (c.code !== 0) { fs.rmSync(copy, { force: true }); return { error: `Le pas à pas Java demande un JDK complet (le module jdk.jdi) : ${(c.err || c.out).trim().split('\n')[0]}`, steps: [] } }
  }
  const r = await exec(job.t.java, ['--add-modules', 'jdk.jdi', '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', dir, 'HitoTrace', job.dir, job.w.main, inFile, String(o.max)],
    { cwd: job.dir, env: job.env, ms: o.ms, track: o.track, kill: o.killTree })
  if (r.err === 'temps') { return { error: `Arrêté au bout de ${o.ms / 1000} s.`, steps: [] } }
  let d
  try { d = JSON.parse(r.out) } catch { return { error: (r.err || 'Le pas à pas Java a échoué.').trim().split('\n').slice(-3).join('\n'), steps: [] } }
  // un bout de code complété (une classe Main autour) : les lignes ramenées au bout de code, les cadres du code ajouté
  // retirés, ses classes sans le « Main. » devant, l'appel du haut nommé « programme » comme en Python
  const w = job.w, mine = f => f === job.file, line = (f, l) => mine(f) ? o.clamp(l) : l
  const strip = s => w.wrapped ? String(s).replace(/^Main\./, '') : s
  const fix = v => { if (v?.champs) v.champs.forEach(c => fix(c.v)); if (v?.classe) v.classe = strip(v.classe); return v }
  for (const s of d.steps) {
    if (w.wrapped && w.offset) s.frames = s.frames.filter(f => !(mine(f.file) && f.line <= w.offset))
    if (w.wrapped && !/\bmain\s*\(/.test(w.code.split('\n').slice(w.offset).join('\n')) && /^(?:main|Main)$/.test(s.frames[0]?.func ?? '')) s.frames[0].func = 'programme'
    for (const f of s.frames) { f.line = line(f.file, f.line); f.vars.forEach(x => fix(x.v)) }
    for (const ob of Object.values(s.heap)) fix(ob)
    for (const x of s.statics ?? []) { x.nom = strip(x.nom); fix(x.v) }
    s.line = line(s.file, s.line)
  }
  return { steps: d.steps, error: d.error, diag: [] }
}

module.exports = { traceJava }

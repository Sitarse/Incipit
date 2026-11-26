// Le pas à pas C# de l'IDE des cours (ide.js) : netcoredbg (Samsung, licence MIT, interface GDB/MI) téléchargé à la
// demande (version épinglée, empreinte SHA-256 vérifiée) dans DATA/ide/netcoredbg, piloté par le même pilote MI que gdb.
// À chaque ligne de Program.cs, la « photo de la mémoire » au format commun (ide-mem.js). netcoredbg n'a pas
// d'adresses : l'identité d'un objet est son GetHashCode() (celui d'object tant que la classe ne le redéfinit pas).
// Les valeurs se lisent par -var-create (il n'a pas -data-evaluate-expression).
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, execFile } = require('node:child_process')
const platform = require('../../app/platform')
const { miSession, notYet } = require('./ide-gdb')

const NCDBG = { version: '3.2.0-1092', url: 'https://github.com/Samsung/netcoredbg/releases/download/3.2.0-1092/netcoredbg-win64.zip',
  sha256: '3c410a45fa502415203a94fcb88654af65bf8e3dac158a5527a722e7a6b9274a' }
const MAX = { niveaux: 3, objets: 30, cases: 12 }
// Ajouté au projet : l'entrée et la sortie du programme dans des fichiers pendant le pas à pas (sans effet sinon)
const HITO_IN = `static class HitoIo {
  [System.Runtime.CompilerServices.ModuleInitializer]
  internal static void Init() {
    var i = System.Environment.GetEnvironmentVariable("HITO_IN"); var o = System.Environment.GetEnvironmentVariable("HITO_OUT");
    if (i != null && System.IO.File.Exists(i)) System.Console.SetIn(new System.IO.StreamReader(i));
    if (o != null) System.Console.SetOut(new System.IO.StreamWriter(o) { AutoFlush = true });
  }
}
`
const run = (cmd, args, o = {}) => new Promise(r => execFile(cmd, args, { windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...o }, (e, out, err) => r({ code: e ? e.code ?? -1 : 0, out: `${out}${err}` })))
const debuggerOf = home => { const f = path.join(home, 'netcoredbg', 'netcoredbg.exe'); return fs.existsSync(f) ? f : null }

// ---------- L'installation, après un clic : l'archive de GitHub, son empreinte, extraite par le tar de Windows ----------
async function installCsDebugger(home) {
  try {
    const r = await fetch(NCDBG.url)
    if (!r.ok) return { ok: false, error: `Téléchargement refusé (${r.status}).` }
    const buf = Buffer.from(await r.arrayBuffer())
    if (crypto.createHash('sha256').update(buf).digest('hex') !== NCDBG.sha256) return { ok: false, error: 'Le fichier téléchargé n’a pas l’empreinte attendue : installation annulée.' }
    fs.mkdirSync(home, { recursive: true })
    const zip = path.join(home, 'netcoredbg.zip')
    fs.writeFileSync(zip, buf)
    fs.rmSync(path.join(home, 'netcoredbg'), { recursive: true, force: true })
    const x = await run(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', home])
    fs.rmSync(zip, { force: true })
    return debuggerOf(home) ? { ok: true, version: NCDBG.version } : { ok: false, error: `L’archive ne s’est pas ouverte : ${x.out.trim().slice(0, 200)}` }
  } catch (err) { return { ok: false, error: err.message } }
}

// Le nom d'un appel : Program.<Main>$ (les instructions du haut) → programme ; une fonction locale g__Carre|0_0 → Carre
function csName(f) {
  const n = String(f ?? '').replace(/\(.*$/, '')
  if (/<Main>\$$/.test(n)) return 'programme'
  if (/\.\.ctor$/.test(n)) return n.replace(/\.\.ctor$/, '') // le constructeur : le nom de la classe
  if (/\.\.cctor$/.test(n)) return `${n.replace(/\.\.cctor$/, '')} (static)`
  return n.match(/g__(\w+)\|/)?.[1] ?? n.replace(/^Program\./, '')
}
// Les champs static des classes du fichier : « Classe.champ »
function staticsOf(code) {
  const res = []
  let cls = null
  for (const l of String(code).split('\n')) {
    cls = l.match(/\b(?:class|struct|record)\s+(\w+)/)?.[1] ?? cls
    for (const m of l.matchAll(/\bstatic\s+(?!void\b|class\b|async\b)(?:readonly\s+)?[\w<>[\],.?]+\s+(\w+)\s*(?:=|;)/g)) if (cls) res.push(`${cls}.${m[1]}`)
  }
  return [...new Set(res)]
}
const shortType = t => String(t ?? '').replace(/System\.Collections\.Generic\.|System\./g, '')

// o : { home (DATA/ide), clamp(ligne), track(proc), killTree, ms, max }
async function traceCs(job, inFile, o) {
  const dbg = debuggerOf(o.home)
  if (!dbg) return { error: 'Le pas à pas C# demande le débogueur netcoredbg : bouton « Installer le débogueur C# ».', steps: [] }
  fs.writeFileSync(path.join(job.dir, 'HitoIo.cs'), HITO_IN)
  const b = await run(job.t.bin, ['build', '-c', 'Debug', '-nologo', '-v', 'q'], { cwd: job.dir, env: job.env, timeout: 120e3 })
  if (b.code !== 0) return { error: 'La compilation a échoué.', build: b.out, steps: [] }
  const dll = path.join(job.dir, 'bin', 'Debug', `net${job.t.net}.0`, 'Programme.dll'), outFile = path.join(job.dir, 'sortie.txt')
  fs.rmSync(outFile, { force: true })
  const g = spawn(dbg, ['--interpreter=mi', '--', job.t.bin, dll], { cwd: job.dir, ...platform.spawnOptions(), env: { ...job.env, HITO_IN: inFile, HITO_OUT: outFile } })
  o.track(g)
  g.stdin.on('error', () => {})
  const { send, nextStop, close } = miSession(g)
  const readOut = () => { try { return fs.readFileSync(outFile, 'utf8') } catch { return '' } }
  const statics = staticsOf(job.w.code), steps = [], valueType = new Map()
  let error = null, thread = '1'

  // ---------- Une valeur : -var-create (le cadre choisi par --frame), ses enfants ----------
  async function snapshot() {
    const heap = {}, made = []
    const create = async (e, fr) => {
      // netcoredbg : les options après l'expression (avant, il les prend pour le nom et l'expression)
      const r = await send(`-var-create - * "${String(e).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}" --thread ${thread} --frame ${fr}`)
      if (r.cls !== 'done') return null
      made.push(r.data.name)
      return r.data
    }
    const children = async name => ((await send(`-var-list-children --all-values ${name}`)).data.children ?? []).map(c => c.child ?? c)
    async function val(e, v, fr, d) {
      const text = String(v?.value ?? '')
      if (text === 'null') return { nul: true }
      if (!text.startsWith('{')) return { t: text }
      const T = v.type ?? ''
      if (/^System\.Text\.StringBuilder$/.test(T)) { const s = await create(`${e}.ToString()`, fr); return { t: s?.value ?? '""' } }
      if (!valueType.has(T)) valueType.set(T, (await create(`${e}.GetType().IsValueType`, fr))?.value === 'true')
      const isStruct = valueType.get(T)
      const id = isStruct ? null : (await create(`${e}.GetHashCode()`, fr))?.value
      if (!isStruct && (heap[id] || d > MAX.niveaux || Object.keys(heap).length >= MAX.objets)) return { ref: id }
      const ob = { classe: shortType(T), kind: 'objet', champs: [] }
      if (!isStruct) heap[id] = ob
      const item = async (expr, nom) => { const c = await create(expr, fr); return { nom, v: c ? await val(expr, c, fr, d + 1) : { t: '?' } } }
      if (/\[[\d,]*\]$/.test(T)) { // un tableau : ses cases
        ob.kind = 'tableau'
        const cs = (await children(v.name)).filter(c => /^\[\d+\]$/.test(c.exp))
        for (const c of cs.slice(0, MAX.cases)) ob.champs.push({ nom: c.exp, v: await val(`${e}${c.exp}`, c, fr, d + 1) })
        if (Number(v.numchild) > MAX.cases) ob.total = Number(v.numchild)
        ob.classe = `${shortType(T).replace(/\[\]$/, '')}[${v.numchild}]`
      } else if (/^System\.Collections\.Generic\.List</.test(T)) {
        ob.kind = 'liste'
        const n = Number((await create(`${e}.Count`, fr))?.value ?? 0)
        for (let i = 0; i < Math.min(n, MAX.cases); i++) ob.champs.push(await item(`${e}[${i}]`, `[${i}]`))
        if (n > MAX.cases) ob.total = n
      } else if (/^System\.Collections\.Generic\.Dictionary</.test(T)) {
        ob.kind = 'dict'
        const n = Number((await create(`${e}._count`, fr))?.value ?? 0)
        for (let i = 0; i < Math.min(n, MAX.cases); i++) {
          const k = await create(`${e}._entries[${i}].key`, fr)
          if (k) ob.champs.push(await item(`${e}._entries[${i}].value`, k.value))
        }
        if (n > MAX.cases) ob.total = n
      } else if (!/^System\./.test(T)) { // un objet de l'élève : ses champs (les privés aussi, sans les champs cachés des propriétés)
        const walk = async (name, base) => {
          for (const c of await children(name)) {
            if (c.exp === 'Static members') continue
            if (c.exp === 'Non-Public members') { await walk(c.name, base); continue }
            if (/k__BackingField$/.test(c.exp)) continue
            ob.champs.push({ nom: c.exp, v: await val(`${base}.${c.exp}`, c, fr, d + 1) })
          }
        }
        await walk(v.name, e)
      }
      return isStruct ? { classe: ob.classe, champs: ob.champs } : { ref: id }
    }
    const fr = await send(`-stack-list-frames --thread ${thread}`)
    const mine = (fr.data.stack ?? []).map(x => x.frame).filter(f => path.basename(String(f.file ?? '')) === job.file)
    const frames = []
    for (const f of [...mine].reverse()) {
      const vars = []
      const lv = await send(`-stack-list-variables --thread ${thread} --frame ${f.level} --all-values`)
      for (const x of lv.data.variables ?? []) {
        if (x.name.startsWith('$') || (x.name === 'args' && /<Main>\$|\.Main\(/.test(f.func))) continue
        // comme en C : une variable dont la ligne de déclaration n'a pas encore tourné n'est pas montrée
        if (notYet(job.w.code, Number(f.line), x.name, /<Main>\$/.test(f.func) ? 0 : undefined)) continue
        const v = String(x.value ?? '').startsWith('{') ? await create(x.name, f.level) : { value: x.value }
        vars.push({ nom: x.name, v: v ? await val(x.name, v, f.level, 1) : { t: String(x.value) } })
      }
      frames.push({ func: csName(f.func), line: o.clamp(Number(f.line)), file: job.file, vars })
    }
    const st = []
    for (const s of statics) { const v = await create(s, mine[0]?.level ?? 0); if (v) st.push({ nom: s, v: await val(s, v, mine[0]?.level ?? 0, 1) }) }
    for (const n of made.reverse()) await send(`-var-delete ${n}`)
    if (!frames.length) return
    const top = frames.at(-1), prev = steps.at(-1)
    // netcoredbg s'arrête à chaque instruction d'une ligne (« { a = s; b++; } ») : rien de changé, pas de nouveau pas
    if (prev && prev.line === top.line && JSON.stringify([prev.frames, prev.heap, prev.statics]) === JSON.stringify([frames, heap, st])) return
    steps.push({ line: top.line, file: job.file, event: 'line', frames, heap, statics: st, out: readOut() })
  }

  const work = (async () => {
    if ((await send('-exec-run')).cls === 'error') throw new Error('Le programme ne démarre pas sous netcoredbg.')
    let stop = await nextStop(), guard = 0
    while (guard++ < o.max * 4) {
      const reason = String(stop.data.reason ?? '')
      thread = stop.data['thread-id'] ?? thread
      if (/^exited/.test(reason)) { const c = Number(stop.data['exit-code'] ?? 0); if (c) error ??= `Le programme s'est terminé avec le code ${c}.`; break }
      if (/exception/.test(reason)) {
        error = [stop.data['exception-name'], stop.data['exception-message'] ?? stop.data.exception].filter(Boolean).join(': ') || 'Exception'
        await snapshot()
        if (steps.length) Object.assign(steps.at(-1), { event: 'exception', exc: error })
        await send('-exec-continue'); stop = await nextStop(); continue
      }
      if (path.basename(String(stop.data.frame?.file ?? '')) !== job.file) { await send('-exec-step'); stop = await nextStop(); continue }
      await snapshot()
      if (steps.length >= o.max) { error = `Arrêté après ${o.max} pas (boucle trop longue ?).`; break }
      await send('-exec-step')
      stop = await nextStop()
    }
  })()
  const timeout = new Promise(res => setTimeout(() => res('temps'), o.ms))
  const r = await Promise.race([work.then(() => 'ok', err => { error = err.message; return 'ko' }), timeout])
  if (r === 'temps') error = `Arrêté au bout de ${o.ms / 1000} s.`
  close()
  setTimeout(() => o.killTree(), 500)
  const last = steps.at(-1)
  steps.push({ line: last?.line ?? 1, file: job.file, event: 'end', frames: last?.frames ?? [], heap: last?.heap ?? {}, statics: last?.statics ?? [], out: readOut() })
  return { steps, error, diag: [] }
}

module.exports = { traceCs, installCsDebugger, debuggerOf, csName, staticsOf, NCDBG }

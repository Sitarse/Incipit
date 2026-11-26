// L'IDE des cours, côté application : trouve les compilateurs de ce PC (même installés après le lancement),
// compile et lance un bout de code (sa console en direct, l'entrée au clavier), le suit pas à pas (la pile : gdb pour
// C/C++, ide-trace.py pour Python) et installe un langage manquant avec winget. Les langages : ide-langs.js.
// ctx : data (le dossier cours des données de l'appli), push(événement) vers la fenêtre du lecteur.
const { execFile, spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { LANGS, WINLIBS, installHint, wrap, javaFile, diagnostics, cleanFiles } = require('./ide-langs')
const { traceC } = require('./ide-gdb')
const { traceJava } = require('./ide-java')
const { traceJs } = require('./ide-js')
const { traceCs, installCsDebugger, debuggerOf } = require('./ide-cs')
const platform = require('../../app/platform')
const { IS_WIN } = platform
// Le programme compilé : programme.exe sous Windows, programme ailleurs
const BIN = platform.exe('programme')

const RUN_MS = 5 * 60e3, BUILD_MS = 120e3, TRACE_MS = 60e3, MAX_STEPS = 400
// Sortie sans tampon (les « Entrez un nombre : » s'affichent avant la saisie) et, pour le pas à pas, entrée et sortie
// dans des fichiers : ajouté à chaque programme C/C++ par -include, sans changer ses lignes. En C++, std est ouvert :
// les diapos écrivent cout, cin, endl sans std:: ni le using qui va avec
const IO_H = `#include <stdio.h>
#include <stdlib.h>
#ifdef __cplusplus
namespace std {}
using namespace std;
#endif
static void __attribute__((constructor)) hito_ide_io(void) {
  const char *i = getenv("HITO_IN"), *o = getenv("HITO_OUT");
  if (i) freopen(i, "r", stdin);
  if (o) freopen(o, "w", stdout);
  setvbuf(stdout, NULL, _IONBF, 0);
}
`

module.exports = ctx => {
  const HOME = path.join(ctx.data, 'ide'), RUNS = path.join(os.tmpdir(), 'incipit-ide')
  const ioH = path.join(HOME, 'ide-io.h'), tracePy = path.join(HOME, 'ide-trace.py'), allocC = path.join(HOME, 'ide-alloc.c')
  function setup() {
    fs.mkdirSync(HOME, { recursive: true })
    if (!fs.existsSync(ioH) || fs.readFileSync(ioH, 'utf8') !== IO_H) fs.writeFileSync(ioH, IO_H)
    // python ne lit pas dans l'archive de l'appli : le traceur est recopié à côté
    for (const [n, to] of [['ide-trace.py', tracePy], ['ide-alloc.c', allocC]]) {
      const src = fs.readFileSync(path.join(__dirname, n))
      if (!fs.existsSync(to) || !src.equals(fs.readFileSync(to))) fs.writeFileSync(to, src)
    }
  }

  // ---------- Où sont les outils : le PATH du registre (relu : un langage installé tout à l'heure compte) ----------
  const reg = key => new Promise(r => execFile('reg', ['query', key, '/v', 'Path'], { windowsHide: true }, (e, out) => r(e ? '' : out.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i)?.[1]?.trim() ?? '')))
  const expand = s => s.replace(/%([^%]+)%/g, (_, v) => process.env[v] ?? '')
  async function dirs() {
    // macOS et Linux : le PATH de l'appli, plus les dossiers où Homebrew, cargo, nvm… posent leurs outils (app/platform.js)
    if (!IS_WIN) return [...new Set([...platform.pathDirs(), ...platform.extraDirs()])]
    const [user, machine] = await Promise.all([reg('HKCU\\Environment'), reg('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment')])
    // WinLibs (le GCC récent de winget) d'abord : il passe devant le vieux MinGW
    const pk = path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages')
    let winlibs = []
    try { winlibs = fs.readdirSync(pk).filter(d => d.startsWith(WINLIBS)).flatMap(d => ['mingw64', 'mingw32'].map(m => path.join(pk, d, m, 'bin'))) } catch {}
    const git = ['ProgramFiles', 'ProgramW6432'].map(v => process.env[v] && path.join(process.env[v], 'Git', 'bin')).filter(Boolean)
    return [...new Set([...winlibs, ...expand(user).split(';'), ...expand(machine).split(';'), ...(process.env.PATH ?? '').split(';'), ...git].map(d => d.trim()).filter(Boolean))]
  }
  function which(name, list) {
    if (!IS_WIN) return platform.findIn(name, list)
    for (const d of list) {
      if (/\\WindowsApps\\?$/i.test(d)) continue // les faux python / bash du Store
      if (name === 'bash' && /\\System32\\?$/i.test(d)) continue // le bash de WSL
      for (const ext of ['.exe', '.cmd']) { const f = path.join(d, name + ext); if (fs.existsSync(f)) return f }
    }
    return null
  }
  const version = (cmd, args) => new Promise(r => execFile(cmd, args, { windowsHide: true, timeout: 15e3 }, (e, out, err) => r(e ? '' : `${out}${err}`.trim().split(/\r?\n/)[0])))
  let found = null // { lang: { ok, bin, … } }, refait après une installation
  async function scan() {
    const list = await dirs(), res = {}
    for (const [id, l] of Object.entries(LANGS)) {
      if (id === 'javascript') { res[id] = { ok: true, bin: process.execPath, version: `Node ${process.versions.node} (intégré)` }; continue }
      let bin = null
      for (const t of l.tools) if ((bin = which(t, list))) break
      const r = { ok: !!bin, bin }
      if (bin && (id === 'cpp' || id === 'c')) { const g = path.join(path.dirname(bin), platform.exe('gdb')); r.gdb = fs.existsSync(g) ? g : null }
      if (bin && id === 'java') { const j = path.join(path.dirname(bin), platform.exe('java')); r.java = fs.existsSync(j) ? j : null; r.ok = !!r.java }
      if (bin && id === 'python') r.py = IS_WIN && path.basename(bin).toLowerCase().startsWith('py.')
      res[id] = r
    }
    await Promise.all(Object.entries(res).filter(([id, r]) => r.ok && id !== 'javascript').map(async ([id, r]) => {
      r.version = await version(r.bin, id === 'csharp' ? ['--version'] : id === 'go' ? ['version'] : id === 'python' && r.py ? ['-3', '--version'] : ['--version'])
      // hors Windows, un outil qui ne répond pas à --version n'est pas utilisable (le faux javac / python3 de macOS sans outils de développement)
      if (!IS_WIN && !r.version) r.ok = false
      if (id === 'csharp') { r.net = Number.parseInt(r.version, 10) || 0; r.ok = r.ok && r.net >= 6 }
      if ((id === 'cpp' || id === 'c') && r.version) r.gccMajor = Number(r.version.match(/(\d+)\.\d+\.\d+/)?.[1] ?? 0)
    }))
    found = res
    return res
  }
  const tool = async id => (found ?? await scan())[id]
  const langs = async () => {
    const f = found ?? await scan()
    return Object.entries(LANGS).map(([id, l]) => ({ id, nom: l.nom, monaco: l.monaco, alias: l.alias, pile: l.pile && (id !== 'cpp' && id !== 'c' || !!f[id]?.gdb) && (id !== 'csharp' || IS_WIN), // le débogueur C# (netcoredbg) n'est livré que pour Windows
      ok: !!f[id]?.ok, version: f[id]?.version ?? '', winget: IS_WIN ? l.winget : null, hint: IS_WIN ? null : installHint(id, process.platform),
      vieux: (id === 'cpp' || id === 'c') && f[id]?.ok && f[id].gccMajor < 9,
      // C# : le pas à pas demande netcoredbg, téléchargé après un clic (installDbg)
      debugger: id !== 'csharp' || !!debuggerOf(HOME) }))
  }

  // ---------- Préparer un programme : son dossier, son fichier, comment le compiler et le lancer ----------
  const cleanEnv = extra => {
    const env = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', ...extra }
    for (const k of ['ELECTRON_RUN_AS_NODE', 'ANTHROPIC_BASE_URL', 'CLAUDECODE']) if (!(k in (extra ?? {}))) delete env[k]
    return env
  }
  async function prepare(lang, code, { debug = false, files = null } = {}) {
    const t = await tool(lang), l = LANGS[lang]
    if (!t?.ok) return { missing: true }
    setup()
    const w = wrap(lang, code)
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    let dir = path.join(RUNS, id), file = lang === 'java' ? javaFile(w.code) : l.file
    // le dossier du programme précédent part ; encore tenu (un programme qui se ferme) : il partira la fois suivante
    for (const d of fs.existsSync(RUNS) ? fs.readdirSync(RUNS) : []) { try { fs.rmSync(path.join(RUNS, d), { recursive: true, force: true }) } catch {} }
    fs.mkdirSync(dir, { recursive: true })
    let build = null, run, env = cleanEnv()
    const std = lang === 'cpp' ? (t.gccMajor >= 7 ? '-std=gnu++17' : '-std=gnu++14') : '-std=gnu11'
    if (lang === 'cpp' || lang === 'c') {
      // les autres fichiers de l'exemple (Purse.h, Purse.cpp) : à côté ; les sources compilées avec
      const extra = cleanFiles(files, file)
      for (const [n, c] of Object.entries(extra)) fs.writeFileSync(path.join(dir, n), c)
      const srcs = Object.keys(extra).filter(n => /\.(?:c|cc|cpp|cxx)$/i.test(n))
      build = [t.bin, [std, '-g', '-O0', '-fno-inline', '-fdiagnostics-color=never', '-include', ioH, file, ...srcs, '-o', BIN]]
      run = [path.join(dir, BIN), []]
      // le vieux MinGW trouve ses DLL à côté de gcc : son dossier passe devant (Windows seulement)
      if (IS_WIN) env.PATH = `${path.dirname(t.bin)};${env.PATH}`
    } else if (lang === 'python') run = [t.bin, [...(t.py ? ['-3'] : []), '-u', file]]
    else if (lang === 'javascript') { run = [t.bin, [file]]; env = cleanEnv({ ELECTRON_RUN_AS_NODE: '1' }) }
    else if (lang === 'typescript') run = [t.bin, ['run', '--quiet', '--allow-read', file]]
    else if (lang === 'java') {
      // javac puis java : « java Main.java » refuse un package, plusieurs classes, une classe qui n'est pas la première
      build = [t.bin, ['-encoding', 'UTF-8', '-g', '-d', '.', file]]
      run = w.main ? [t.java, ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', '-cp', '.', w.main]] : null
    }
    else if (lang === 'csharp') {
      // un projet gardé (la compilation suivante va plus vite), le fichier y est remplacé
      dir = path.join(HOME, `cs-net${t.net}`)
      fs.mkdirSync(dir, { recursive: true })
      const proj = `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net${t.net}.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>disable</Nullable><AllowUnsafeBlocks>true</AllowUnsafeBlocks><AssemblyName>Programme</AssemblyName></PropertyGroup></Project>`
      const pf = path.join(dir, 'Programme.csproj')
      if (!fs.existsSync(pf) || fs.readFileSync(pf, 'utf8') !== proj) fs.writeFileSync(pf, proj)
      run = [t.bin, ['run', '--project', pf]]
    } else if (lang === 'rust') { build = [t.bin, ['-g', file, '-o', BIN]]; run = [path.join(dir, BIN), []] }
    else if (lang === 'go') run = [t.bin, ['run', file]]
    else run = [t.bin, [file]] // PHP, Ruby, Bash
    fs.writeFileSync(path.join(dir, file), w.code)
    return { t, w, dir, file, build, run, env, lines: String(code).split('\n').length, debug, extra: lang === 'cpp' || lang === 'c' ? cleanFiles(files, file) : {} }
  }

  // ---------- Lancer : la console en direct ----------
  let cur = null // le programme en cours : { id, proc }
  const killTree = p => { if (p?.pid && p.exitCode === null) platform.killTree(p.pid) }
  function stop() { if (cur) { killTree(cur.proc); cur.stopped = true } return true }
  function spawnStream(id, [cmd, args], { cwd, env, ms, input }) {
    return new Promise(resolve => {
      let p
      try { p = spawn(cmd, args, { cwd, env, ...platform.spawnOptions() }) } catch (err) { ctx.push({ id, t: 'err', data: `${err.message}\n` }); return resolve({ code: -1, all: err.message }) }
      cur = { id, proc: p }
      p.stdin.on('error', () => {}) // une saisie envoyée juste quand le programme se ferme (EPIPE) : ignorée, pas un plantage
      let all = ''
      const dec = { out: new TextDecoder(), err: new TextDecoder() }
      const on = k => b => { const s = dec[k].decode(b, { stream: true }); all += s; if (!input) ctx.push({ id, t: k, data: s }) }
      p.stdout.on('data', on('out')); p.stderr.on('data', on('err'))
      p.on('error', err => { all += err.message; ctx.push({ id, t: 'err', data: `${err.message}\n` }) })
      const timer = setTimeout(() => { ctx.push({ id, t: 'sys', data: `\nArrêté au bout de ${Math.round(ms / 1000)} s.\n` }); killTree(p) }, ms)
      p.on('close', code => { clearTimeout(timer); if (cur?.proc === p) cur.done = true; resolve({ code, all, stopped: cur?.proc === p && cur.stopped }) })
      if (input !== undefined) p.stdin.end(input)
    })
  }
  async function run({ lang, code, files }) {
    stop()
    const job = await prepare(lang, code, { files })
    if (job.missing) return { missing: true }
    const id = Date.now()
    ;(async () => {
      if (job.build) {
        ctx.push({ id, t: 'sys', data: `Compilation (${job.t.version || path.basename(job.t.bin)})…\n` })
        const b = await spawnStream(id, job.build, { cwd: job.dir, env: job.env, ms: BUILD_MS })
        const diag = diagnostics(b.all, job.file, job.w.offset)
        if (b.code !== 0) return ctx.push({ id, t: 'exit', code: b.code, phase: 'build', diag })
        if (diag.length) ctx.push({ id, t: 'diag', diag })
      }
      // une classe Java sans main : elle compile, il n'y a rien à lancer
      if (!job.run) { ctx.push({ id, t: 'sys', data: 'Compilé sans erreur. Pas de main : rien à lancer.\n' }); return ctx.push({ id, t: 'exit', code: 0, phase: 'run', diag: [] }) }
      ctx.push({ id, t: 'sys', data: job.build ? 'Exécution\n' : `Exécution (${job.t.version || path.basename(job.run[0])})\n` })
      const r = await spawnStream(id, job.run, { cwd: job.dir, env: job.env, ms: RUN_MS })
      ctx.push({ id, t: 'exit', code: r.code, stopped: r.stopped, phase: 'run', diag: diagnostics(r.all, job.file, job.w.offset) })
    })().catch(err => ctx.push({ id, t: 'exit', code: -1, error: err.message }))
    return { id, wrapped: job.w.wrapped }
  }
  function input(text) {
    const p = cur?.proc
    if (!p || p.exitCode !== null || cur.done) return false
    p.stdin.write(String(text).slice(0, 100_000))
    return true
  }

  // ---------- Pas à pas : la pile d'appels et les variables à chaque ligne ----------
  async function trace({ lang, code, stdin = '', files }) {
    stop()
    const job = await prepare(lang, code, { debug: true, files })
    if (job.missing) return { missing: true }
    const inFile = path.join(job.dir, 'entree.txt')
    fs.writeFileSync(inFile, String(stdin).slice(0, 100_000))
    const clamp = l => Math.max(1, Math.min(job.lines, l - job.w.offset))
    if (lang === 'python') {
      const r = await new Promise(res => execFile(job.run[0], [...job.run[1].filter(a => a === '-3'), tracePy, job.file, inFile],
        { cwd: job.dir, env: job.env, windowsHide: true, timeout: TRACE_MS, maxBuffer: 64 * 1024 * 1024 }, (err, out, errOut) => res({ err, out, errOut })))
      try {
        const d = JSON.parse(r.out)
        return { steps: d.steps.map(s => ({ ...s, line: clamp(s.line), frames: s.frames.map(f => ({ ...f, line: clamp(f.line) })) })), error: d.error, diag: diagnostics(d.error ? `File "${job.file}", line ${d.steps.at(-2)?.line ?? 1}\n${d.error}` : '', job.file) }
      } catch { return { error: (r.errOut || r.err?.message || 'Le pas à pas a échoué.').trim().split('\n').slice(-3).join('\n'), diag: diagnostics(r.errOut ?? '', job.file) } }
    }
    const track = p => { cur = { id: 0, proc: p } }
    if (lang === 'java') {
      const b = await spawnStream(0, job.build, { cwd: job.dir, env: job.env, ms: BUILD_MS, input: '' })
      if (b.code !== 0) return { error: 'La compilation a échoué.', build: b.all, diag: diagnostics(b.all, job.file, job.w.offset) }
      if (!job.w.main) return { error: 'Compilé sans erreur. Pas de main : rien à suivre.' }
      return traceJava(job, inFile, { home: HOME, clamp, track, killTree: () => killTree(cur?.proc), ms: TRACE_MS, max: MAX_STEPS })
    }
    if (lang === 'csharp') return traceCs(job, inFile, { home: HOME, clamp, track, killTree: () => killTree(cur?.proc), ms: TRACE_MS, max: MAX_STEPS })
    if (lang === 'javascript') return traceJs(job, inFile, { clamp, track, killTree: () => killTree(cur?.proc), ms: TRACE_MS, max: MAX_STEPS })
    if (lang !== 'cpp' && lang !== 'c') return { error: 'Le pas à pas existe pour C, C++, Python, Java, JavaScript et C#.' }
    if (!job.t.gdb) return { error: 'gdb (le débogueur) manque à côté de ton compilateur : installe le GCC récent (bouton Installer).' }
    // la table des blocs du tas (ide-alloc.c) : compilée avec, malloc et free du programme enveloppés
    const [cc, args] = job.build, o = args.indexOf('-o')
    const build = [cc, [...args.slice(0, o), allocC, '-Wl,--wrap=malloc,--wrap=calloc,--wrap=realloc,--wrap=free', ...args.slice(o)]]
    const b = await spawnStream(0, build, { cwd: job.dir, env: job.env, ms: BUILD_MS, input: '' })
    if (b.code !== 0) return { error: 'La compilation a échoué.', build: b.all, diag: diagnostics(b.all, job.file, job.w.offset) }
    return traceC(job, inFile, { files: { [job.file]: job.w.code, ...job.extra }, clamp, cpp: lang === 'cpp', ms: TRACE_MS, max: MAX_STEPS,
      track: p => { cur = { id: 0, proc: p } }, killTree })
  }

  // ---------- Installer un langage (winget) : la progression dans la console ----------
  async function install(lang) {
    const l = LANGS[lang]
    // Hors Windows : pas de winget, et un sudo à saisir : la commande est donnée, à taper dans un terminal
    if (!IS_WIN) { const hint = installHint(lang, process.platform); return { error: hint ? `Installe ${l?.nom} dans un terminal : ${hint}` : 'Rien à installer pour ce langage.' } }
    if (!l?.winget) return { error: 'Rien à installer pour ce langage.' }
    stop()
    const id = Date.now()
    ctx.push({ id, t: 'sys', data: `Installation de ${l.nom} (winget ${l.winget})… Windows peut te demander une autorisation.\n` })
    spawnStream(id, ['winget', ['install', '--id', l.winget, '-e', '--silent', '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity']], { cwd: os.homedir(), env: cleanEnv(), ms: 30 * 60e3 })
      .then(async r => { found = null; await scan(); ctx.push({ id, t: 'exit', code: r.code, phase: 'install', langs: await langs() }) })
    return { id }
  }

  // ---------- Le débogueur C# (netcoredbg), après un clic : la progression dans la console ----------
  async function installDbg() {
    const id = Date.now()
    ctx.push({ id, t: 'sys', data: 'Téléchargement du débogueur C# (netcoredbg, Samsung, licence MIT, 3,5 Mo) depuis GitHub…\n' })
    const r = await installCsDebugger(HOME)
    if (!r.ok) ctx.push({ id, t: 'err', data: `${r.error}\n` })
    ctx.push({ id, t: 'exit', code: r.ok ? 0 : 1, phase: 'install', langs: await langs() })
    return { id }
  }

  return { langs, rescan: async () => { found = null; await scan(); return langs() }, run, input, stop, trace, install, installDbg }
}

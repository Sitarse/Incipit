// Le pas à pas JavaScript de l'IDE des cours (ide.js) : le programme tourne dans le Node de l'appli avec l'inspecteur
// (--inspect-brk : le protocole de Chrome DevTools), piloté par WebSocket. À chaque arrêt dans le fichier de l'élève, la
// « photo de la mémoire » au format commun (ide-mem.js) : les appels, leurs variables (portées locales et de bloc), les
// objets par une identité rangée dans un WeakMap du programme, tableaux, Map et Set par leur contenu.
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const platform = require('../../app/platform')

const MAX = { niveaux: 3, objets: 30, cases: 12 }
const HIDE = new Set(['require', 'module', 'exports', '__dirname', '__filename'])
const INLINE = new Set(['date', 'regexp', 'error', 'promise', 'proxy', 'weakmap', 'weakset', 'typedarray', 'arraybuffer', 'dataview', 'generator', 'iterator', 'wasmvalue'])
// chargé avant le programme : console.log écrit tout de suite (le programme est arrêté entre deux pas, rien ne doit
// rester en attente dans un tampon)
const PRE = `const fs = require('fs'), util = require('util')
for (const k of ['log', 'info', 'debug']) console[k] = function () { fs.writeSync(1, util.format.apply(null, arguments) + '\\n') }
for (const k of ['warn', 'error']) console[k] = function () { fs.writeSync(2, util.format.apply(null, arguments) + '\\n') }
`
const ID = `function () { const k = Symbol.for('hito.ids'), m = globalThis[k] ??= { w: new WeakMap(), n: 0 }; let id = m.w.get(this); if (!id) { id = ++m.n; m.w.set(this, id) } return id }`
const MAP = `function () { const t = k => typeof k === 'string' ? JSON.stringify(k) : k && typeof k === 'object' ? (k.constructor?.name ?? 'Object') : String(k); return { keys: Array.from(this.keys()).slice(0, ${MAX.cases}).map(t), size: this.size } }`
const VALUES = `function () { return Array.from(this.values()).slice(0, ${MAX.cases}) }`

// o : { clamp(ligne), track(proc), killTree, ms, max }
function traceJs(job, inFile, o) {
  return new Promise(resolve => {
    const pre = path.join(job.dir, 'hito-pre.js')
    fs.writeFileSync(pre, PRE)
    const p = spawn(job.run[0], ['--inspect-brk=127.0.0.1:0', '-r', pre, job.file], { cwd: job.dir, env: job.env, ...platform.spawnOptions() })
    o.track(p)
    p.stdin.on('error', () => {})
    p.stdin.end(fs.readFileSync(inFile))
    let out = '', err = '', ws = null, done = false, error = null, exitCode = null
    const steps = [], pauses = [], scripts = new Map(), mine = new RegExp(`[\\\\/]${job.file.replace('.', '\\.')}$`)
    // callFrame.url est vide dans les Node récents : l'adresse du script vient de Debugger.scriptParsed
    const ours = cf => mine.test(scripts.get(cf?.location?.scriptId) ?? cf?.url ?? '')
    let pauseWait = null
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      try { ws?.close() } catch {}
      setTimeout(() => o.killTree(), 300)
      const last = steps.at(-1)
      if (!error && exitCode) error = `Le programme s'est terminé avec le code ${exitCode}.`
      steps.push({ line: last?.line ?? 1, file: job.file, event: 'end', frames: last?.frames ?? [], heap: last?.heap ?? {}, out })
      resolve({ steps, error, diag: [] })
    }
    const timer = setTimeout(() => { error = `Arrêté au bout de ${o.ms / 1000} s.`; finish() }, o.ms)
    const nextPause = () => pauses.length ? Promise.resolve(pauses.shift()) : new Promise(r => { pauseWait = r })
    const ended = () => { if (pauseWait) { pauseWait(null); pauseWait = null } else pauses.push(null) }
    p.stdout.on('data', d => { out += d.toString('utf8') })
    // Node arrêté avant que l'inspecteur réponde : fini tout de suite, avec ce qu'il a écrit
    p.on('close', code => { exitCode = code; ended(); if (!ws) { error ??= err.split('\n').filter(l => l.trim() && !/Debugger|inspector|For help/i.test(l)).slice(-3).join('\n') || null; finish() } })
    p.stderr.on('data', d => {
      err += d.toString('utf8')
      const url = !ws && err.match(/ws:\/\/[^\s]+/)?.[0]
      if (url) connect(url)
      if (/Waiting for the debugger to disconnect/.test(err)) ended()
    })

    function connect(url) {
      ws = new WebSocket(url)
      let id = 0
      const wait = new Map()
      const call = (method, params = {}) => new Promise(r => { if (done) return r({}); const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
      ws.onmessage = e => {
        const m = JSON.parse(e.data)
        if (m.id) { wait.get(m.id)?.(m); wait.delete(m.id) }
        else if (m.method === 'Debugger.paused') { if (pauseWait) { pauseWait(m.params); pauseWait = null } else pauses.push(m.params) }
        else if (m.method === 'Debugger.scriptParsed') scripts.set(m.params.scriptId, m.params.url)
        else if (m.method === 'Runtime.executionContextDestroyed') ended()
      }
      ws.onclose = () => ended()
      ws.onopen = () => run(call).catch(e => { error = e.message }).finally(finish)
    }

    async function run(call) {
      await call('Runtime.enable'); await call('Debugger.enable')
      await call('Debugger.setBlackboxPatterns', { patterns: ['^node:', 'internal/', 'hito-pre\\.js$'] })
      await call('Debugger.setPauseOnExceptions', { state: 'uncaught' })
      // un arrêt sur chaque ligne : les fonctions rappelées plus tard (setTimeout, un événement) sont suivies aussi
      const n = Math.min(job.w.code.split('\n').length, 1500)
      for (let k = 0; k < n; k++) await call('Debugger.setBreakpointByUrl', { lineNumber: k, urlRegex: mine.source })
      await call('Runtime.runIfWaitingForDebugger')
      for (;;) {
        const ev = await nextPause()
        if (!ev || done) return
        const top = ev.callFrames[0]
        if (ev.reason === 'exception') {
          // la ligne « SyntaxError: … » (une erreur de syntaxe commence par l'emplacement du fichier), sinon la première
          const lines = String(ev.data?.description ?? ev.data?.value ?? 'exception').split('\n')
          const exc = lines.find(l => /^[A-Z]\w*(?:Error|Exception)\b/.test(l)) ?? lines[0]
          error = exc
          await snapshot(call, ev, 'exception', { exc })
          await call('Debugger.resume')
          continue
        }
        if (!ours(top)) { await call('Debugger.resume'); continue }
        const r = top.returnValue
        await snapshot(call, ev, r ? 'return' : 'line', r && r.type !== 'undefined' ? { ret: text(r) } : {})
        if (steps.length >= o.max) { error = `Arrêté après ${o.max} pas (boucle trop longue ?).`; return }
        await call('Debugger.stepInto')
      }
    }

    // ---------- Une photo de la mémoire ----------
    async function snapshot(call, ev, event, extra) {
      const heap = {}, frames = []
      const props = async objectId => (await call('Runtime.getProperties', { objectId, ownProperties: true })).result?.result ?? []
      async function val(r, d) {
        if (!r || r.type === 'undefined') return { t: 'undefined' }
        if (r.subtype === 'null') return { nul: true }
        if (r.type === 'string') return { t: JSON.stringify(r.value) }
        if (r.type !== 'object') return { t: String(r.value ?? r.description) }
        if (INLINE.has(r.subtype)) return { t: String(r.description).split('\n')[0] }
        const id = String((await call('Runtime.callFunctionOn', { objectId: r.objectId, functionDeclaration: ID, returnByValue: true })).result?.result?.value)
        if (heap[id] || d > MAX.niveaux || Object.keys(heap).length >= MAX.objets) return { ref: id }
        const o = heap[id] = { classe: r.className ?? 'Object', kind: 'objet', champs: [] }
        if (r.subtype === 'array') {
          o.kind = 'liste'
          const total = Number(String(r.description).match(/\((\d+)\)/)?.[1] ?? 0)
          for (const pr of (await props(r.objectId)).filter(x => /^\d+$/.test(x.name)).slice(0, MAX.cases)) o.champs.push({ nom: `[${pr.name}]`, v: await val(pr.value, d + 1) })
          if (total > MAX.cases) o.total = total
        } else if (r.subtype === 'map' || r.subtype === 'set') {
          o.kind = r.subtype === 'map' ? 'dict' : 'liste'
          const info = r.subtype === 'map' ? (await call('Runtime.callFunctionOn', { objectId: r.objectId, functionDeclaration: MAP, returnByValue: true })).result?.result?.value : null
          const vs = (await call('Runtime.callFunctionOn', { objectId: r.objectId, functionDeclaration: VALUES })).result?.result
          const items = vs?.objectId ? (await props(vs.objectId)).filter(x => /^\d+$/.test(x.name)) : []
          for (const [i, pr] of items.entries()) o.champs.push({ nom: info ? info.keys[i] : `[${i}]`, v: await val(pr.value, d + 1) })
          const total = info?.size ?? Number(String(r.description).match(/\((\d+)\)/)?.[1] ?? 0)
          if (total > MAX.cases) o.total = total
        } else {
          for (const pr of await props(r.objectId)) if (pr.value && !pr.symbol && pr.name !== '__proto__' && pr.value.type !== 'function') o.champs.push({ nom: pr.name, v: await val(pr.value, d + 1) })
        }
        return { ref: id }
      }
      const cfs = ev.callFrames.filter(ours).reverse()
      for (const cf of cfs) {
        const vars = []
        let wrapper = false
        for (const sc of cf.scopeChain.filter(s => ['local', 'block', 'catch'].includes(s.type)).reverse()) {
          for (const pr of await props(sc.object.objectId)) {
            if (HIDE.has(pr.name) && sc.type === 'local') { wrapper = true; continue }
            if (!pr.value || pr.value.type === 'function') continue
            vars.push({ nom: pr.name, v: await val(pr.value, 1) })
          }
        }
        // this : l'objet d'une méthode (pas celui du programme, ni l'objet global)
        if (!wrapper && cf.this?.type === 'object' && cf.this.subtype !== 'null' && !/^(?:global|Window)$/.test(cf.this.description ?? '')) vars.unshift({ nom: 'this', v: await val(cf.this, 1) })
        frames.push({ func: wrapper ? 'programme' : cf.functionName || 'fonction', line: o.clamp(cf.location.lineNumber + 1), file: job.file, vars })
      }
      if (!frames.length) return
      const top = frames.at(-1), prev = steps.at(-1)
      // V8 s'arrête parfois plusieurs fois sur la même ligne sans que rien change : un seul pas
      if (prev && event === 'line' && prev.event === 'line' && prev.line === top.line && JSON.stringify([prev.frames, prev.heap]) === JSON.stringify([frames, heap])) return
      steps.push({ line: top.line, file: job.file, event, frames, heap, out, ...extra })
    }
  })
}

// Une valeur renvoyée, en texte court
function text(r) {
  if (r.subtype === 'null') return 'null'
  if (r.type === 'string') return JSON.stringify(r.value)
  if (r.type === 'object') return r.className ?? 'Object'
  return String(r.value ?? r.description)
}

module.exports = { traceJs }

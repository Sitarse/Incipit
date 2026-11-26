// Le pas à pas C et C++ de l'IDE des cours (ide.js) : gdb piloté par son interface machine (MI). À chaque ligne du code
// de l'exemple (tous ses fichiers), la « photo de la mémoire » au format commun (ide-mem.js la dessine) : les cadres et
// leurs variables (struct et tableaux posés là, case par case), les pointeurs classés par adresse (vers une variable,
// un bloc vivant du tas, un bloc libéré, la variable d'un appel fini, rien de valide), le tas lu dans la table des
// blocs d'ide-alloc.c, les globales. std::string en texte, std::vector en liste, unique_ptr/shared_ptr en flèche.
// miSession sert aussi au C# (netcoredbg parle MI).
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const platform = require('../../app/platform')
const { parseMI, parseGdbValue } = require('./ide-langs')

const MAX = { niveaux: 3, objets: 30, cases: 12 }
const hex = n => `0x${n.toString(16)}`
const quote = s => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
const addrIn = v => { const m = String(v ?? '').match(/0x[0-9a-f]+/i); return m ? Number.parseInt(m[0], 16) : null }

// ---------- Le pilote MI : une commande → sa réponse (avec ce que gdb a écrit en texte avant), les arrêts ----------
function miSession(proc) {
  let buf = '', token = 0, text = [], stopWait = null
  const waiting = new Map(), stops = []
  proc.stdout.on('data', d => {
    buf += d.toString('utf8')
    let k
    while ((k = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, k).replace(/\r$/, ''); buf = buf.slice(k + 1)
      const r = parseMI(line)
      if (!r) continue
      if (r.type === '~') text.push(r.text)
      else if (r.type === '^' && waiting.has(r.token)) { r.out = text.join(''); text = []; waiting.get(r.token)(r); waiting.delete(r.token) }
      else if (r.type === '*' && r.cls === 'stopped') { if (stopWait) { stopWait(r); stopWait = null } else stops.push(r) }
    }
  })
  const send = cmd => new Promise(res => { const t = String(++token); waiting.set(t, res); proc.stdin.write(`${t}${cmd}\n`) })
  const nextStop = () => stops.length ? Promise.resolve(stops.shift()) : new Promise(res => { stopWait = res })
  return { send, nextStop, close: () => { try { proc.stdin.write('-gdb-exit\n') } catch {} } }
}

// ---------- Ce que dit le code source ----------
// Le nom d'une fonction : celui de gdb, sauf quand le vieux gdb de MinGW donne un symbole voisin (_fu4___ZSt3cin…) :
// alors la fonction dont la définition précède la ligne
const DEF = /^\s*(?:[\w:<>,*&~]+\s+)*?([A-Za-z_~][\w:~]*)\s*\([^;{}]*\)\s*(?:const\s*)?(?:noexcept\s*)?(?:\{.*)?$/
function defLine(lines, line) {
  for (let i = Math.min(line, lines.length) - 1; i >= 0; i--) {
    const m = lines[i].match(DEF)
    if (m && !/^(if|for|while|switch|catch|return|sizeof)$/.test(m[1])) return { i, name: m[1] }
  }
  return null
}
function funcName(gdbName, line, code) {
  const n = String(gdbName ?? '').replace(/\(.*$/, '')
  if (n && !/^_|___Z|^\?\?$/.test(n)) return n
  return defLine(code.split('\n'), line)?.name ?? (n || '?')
}
// La ligne k déclare-t-elle la variable ? (un type juste avant le nom, puis =, ;, {, (, [, une virgule ou « : »)
// ponytail: heuristique sur le texte ; une déclaration en plusieurs (« int a, b; ») ou par macro n'est pas vue
const NOT_TYPE = /(?:^|\W)(?:return|delete|throw|case|else|sizeof|new|goto)$/
function declares(line, name) {
  for (const m of String(line ?? '').matchAll(new RegExp(`\\b${name}\\b`, 'g'))) {
    const pre = line.slice(0, m.index).trimEnd(), post = line.slice(m.index + name.length).trimStart()
    if (!/[\w*&>\]]$/.test(pre) || /->$|>>$|<<$/.test(pre) || NOT_TYPE.test(pre)) continue
    if (/^(?:\[[^\]]*\]\s*)*(?:=|;|\{|\(|,|\)|:(?!:))/.test(post)) return true
  }
  return false
}
// Une variable dont la ligne de déclaration n'a pas encore tourné : gdb la montre avec ce qui traînait en mémoire ;
// on ne la montre pas (elle apparaît à sa ligne)
// from : la ligne où commence le code de l'appel quand il n'a pas d'en-tête (les instructions du haut d'un Program.cs)
function notYet(code, line, name, from) {
  const lines = code.split('\n'), d = from !== undefined ? { i: from } : defLine(lines, line)
  if (!d || name === 'this') return false
  for (let k = d.i; k < line - 1; k++) if (declares(lines[k], name)) return false
  for (let k = line - 1; k < Math.min(lines.length, line + 300); k++) if (declares(lines[k], name)) return true
  return false
}
// 3.1400000000000001 → 3.14 ; 65 'A' → 'A'
function scalar(t) {
  if (/^-?\d+\.\d{7,}(?:e[-+]?\d+)?$/i.test(t)) return String(Number(t))
  return t.match(/^-?\d+ ('(?:\\.|[^'])*')$/)?.[1] ?? t
}
// std::vector<int, std::allocator<int> > → vector<int> ; struct P → P
const shortType = t => String(t ?? '').replace(/^(?:const |struct |class )+|\s*(?:const|\*)\s*$/g, '')
  .replace(/,\s*(?:std::)?allocator<(?:[^<>]|<[^<>]*>)*>\s*/g, '').replace(/std::(?:__cxx11::)?/g, '').replace(/\s+>/g, '>').trim()
const templArg = t => { let d = 0, s = String(t).slice(String(t).indexOf('<') + 1); for (let i = 0; i < s.length; i++) { if (s[i] === '<') d++; else if (s[i] === '>' && !d--) return s.slice(0, i).trim(); else if (s[i] === ',' && !d) return s.slice(0, i).trim() } return s }
const findField = (tree, name) => { for (const f of tree?.fields ?? []) { if (f.name === name) return f.value; const deep = findField(f.value, name); if (deep) return deep } return null }
// Les globales du programme : la sortie de « info variables », les sections des fichiers de l'exemple
function globalsOf(out, names) {
  const res = []
  for (const blk of String(out).split(/\n\s*\n/)) {
    const m = blk.match(/^File (.+):\n([\s\S]*)$/)
    if (!m || !names.has(path.basename(m[1]).toLowerCase())) continue
    for (const l of m[2].split('\n')) { const v = l.trim().match(/([A-Za-z_][\w:]*)\s*(?:\[[^\]]*\]\s*)*;$/); if (v && !l.includes('(')) res.push(v[1]) }
  }
  return [...new Set(res)]
}

// ---------- Le traceur ----------
// o : { files: { nom: code } (le programme d'abord), clamp(ligne du programme), cpp, track(proc), killTree, ms, max }
function traceC(job, inFile, o) {
  const outFile = path.join(job.dir, 'sortie.txt')
  const g = spawn(job.t.gdb, ['--interpreter=mi2', '-q', '-nx', path.basename(job.run[0])], { cwd: job.dir, ...platform.spawnOptions(), env: { ...job.env, HITO_IN: inFile, HITO_OUT: outFile } })
  o.track(g)
  g.stdin.on('error', () => {})
  const { send, nextStop, close } = miSession(g)
  const names = Object.keys(o.files), lower = new Set(names.map(n => n.toLowerCase()))
  const fileOf = f => path.basename(String(f?.file ?? f?.fullname ?? ''))
  const ours = f => !!f && lower.has(fileOf(f).toLowerCase())
  const codeOf = f => o.files[names.find(n => n.toLowerCase() === fileOf(f).toLowerCase())] ?? ''
  const lineOf = f => fileOf(f).toLowerCase() === names[0].toLowerCase() ? o.clamp(Number(f.line)) : Number(f.line)
  const readOut = () => { try { return fs.readFileSync(outFile, 'utf8') } catch { return '' } }

  // gdb : une expression, son type, sa taille, son adresse (le type et la taille ne changent pas : gardés)
  const ev = async e => { const r = await send(`-data-evaluate-expression ${quote(e)}`); return r.cls === 'done' ? r.data.value : null }
  const memo = new Map()
  const once = async (k, fn) => { if (!memo.has(k)) memo.set(k, await fn()); return memo.get(k) }
  const whatis = (k, e) => once(`w|${k}|${e}`, async () => { const r = await send(`-interpreter-exec console ${quote(`whatis ${e}`)}`); return r.cls === 'done' ? r.out.match(/type = (.*)/)?.[1]?.trim() ?? null : null })
  const sizeOf = (k, e) => once(`s|${k}|${e}`, async () => { const v = await ev(`sizeof(${e})`); return v === null ? null : Number(v) })
  const addrOf = (k, e) => once(`a|${k}|${e}`, async () => addrIn(await ev(`&(${e})`)))
  let level = 0
  const select = async l => { if (l !== null && l !== level) { await send(`-stack-select-frame ${l}`); level = l } }

  // La table des blocs (ide-alloc.c) : relue seulement quand elle a changé
  let tab = null, ver = -1, blocks = [], freed = new Set()
  const mem = async (a, n) => { const r = await send(`-data-read-memory-bytes ${hex(a)} ${n}`); const c = r.data?.memory?.[0]?.contents; return r.cls === 'done' && c ? Buffer.from(c, 'hex') : null }
  async function readBlocks() {
    tab ??= { at: addrIn(await ev('&hito_tab')), off: 8, size: 24 }
    if (tab.at === null) return
    if (tab.first === undefined) { tab.first = true; tab.off = (addrIn(await ev('&hito_tab.b')) ?? tab.at + 8) - tab.at; tab.size = Number(await ev('sizeof(hito_tab.b[0])')) || 24 }
    const h = await mem(tab.at, 8)
    if (!h || h.readUInt32LE(0) === ver) return
    ver = h.readUInt32LE(0)
    const n = h.readUInt32LE(4), b = n ? await mem(tab.at + tab.off, n * tab.size) : Buffer.alloc(0)
    if (!b) return
    if (n < blocks.length) freed = new Set() // la table s'est tassée : les numéros ont changé
    blocks = Array.from({ length: n }, (_, i) => ({ i, p: Number(b.readBigUInt64LE(i * tab.size)), n: Number(b.readBigUInt64LE(i * tab.size + 8)), vivant: b.readInt32LE(i * tab.size + 16) === 1 }))
  }
  const blockAt = (a, alive) => { for (let i = blocks.length - 1; i >= 0; i--) { const b = blocks[i]; if (b.vivant === alive && a >= b.p && a < b.p + Math.max(1, b.n)) return b } return null }

  // ---------- Une valeur de gdb → une valeur du format commun ----------
  // S : le pas en cours { ranges (les variables vivantes : adresse, taille), dead (celles des appels finis), heap }
  async function value(text, expr, type, key, d, S) {
    const t = String(type ?? '').replace(/^const\s+/, '')
    if (/^std::(?:unique_ptr|shared_ptr)</.test(t)) {
      const p = findField(parseGdbValue(text), '_M_head_impl') ?? findField(parseGdbValue(text), '_M_ptr')
      return p?.kind === 'ptr' ? pointer(p.addr, `((${templArg(t)} *) ${hex(p.addr)})`, key, d, S) : { t: '{…}' }
    }
    if (/^std::(?!(?:__cxx11::)?(?:string|basic_string<char|vector<))/.test(t)) return { t: '{…}' }
    return conv(parseGdbValue(text), expr, key, d, S, t)
  }
  async function conv(tree, expr, key, d, S, type) {
    switch (tree.kind) {
      case 'str': return { t: `"${tree.text}"` }
      case 'fn': return { t: tree.text }
      case 'ref': { // une référence C++ : une flèche vers la variable, ou vers l'objet du tas (P &x = *p)
        const s = await srefAt(tree.addr, S), b = !s && blockAt(tree.addr, true)
        return s ?? (b ? heapObj(b, tree.addr, `&(${expr})`, key, d, S) : conv(tree.value, expr, key, d, S))
      }
      case 'ptr': return pointer(tree.addr, expr, key, d, S)
      case 'array': {
        const champs = []
        for (const [i, it] of tree.items.entries()) champs.push({ nom: `[${i}]`, v: i < MAX.cases ? await conv(it, `${expr}[${i}]`, key, d, S) : { t: '…' } })
        return { champs }
      }
      case 'struct': {
        if (findField(tree, '_M_dataplus')) { const p = findField(tree, '_M_p'); return { t: `"${p?.kind === 'str' ? p.text : ''}"` } } // std::string
        if (findField(tree, '_M_start')) return vector(expr, type, key, d, S) // std::vector
        const out = { champs: await fields(tree, expr, '.', key, d, S) }
        const c = shortType(tree.type ?? type)
        if (c) out.classe = c
        return out
      }
      default: return { t: scalar(tree.text) }
    }
  }
  // Les champs, ceux des classes de base à plat (comme le voit l'élève), sans le pointeur de table virtuelle
  async function fields(tree, expr, sep, key, d, S) {
    const out = []
    const walk = async st => {
      for (const f of st.fields) {
        if (f.name.startsWith('_vptr')) continue
        if (f.name.startsWith('<')) { if (f.value.kind === 'struct') await walk(f.value); continue }
        out.push({ nom: f.name, v: await conv(f.value, `${expr}${sep}${f.name}`, key, d, S) })
      }
    }
    await walk(tree)
    return out
  }
  async function vector(expr, type, key, d, S) {
    const st = parseGdbValue(await ev(`${expr}._M_impl._M_start`) ?? '')
    if (st.kind !== 'ptr' || !st.addr) return { t: '{}' }
    if (!blockAt(st.addr, true) && blockAt(st.addr, false)) return { inv: 'libere' } // détruit (fin de son bloc de code)
    const id = hex(st.addr)
    if (!S.heap[id] && d <= MAX.niveaux && Object.keys(S.heap).length < MAX.objets) {
      const n = Number(await ev(`${expr}._M_impl._M_finish - ${expr}._M_impl._M_start`)) || 0
      const o = S.heap[id] = { classe: shortType(type) || 'vector', kind: 'liste', champs: [] }
      if (n) {
        const items = parseGdbValue(await ev(`*${expr}._M_impl._M_start@${Math.min(n, MAX.cases)}`) ?? '').items ?? []
        for (const [i, it] of items.entries()) o.champs.push({ nom: `[${i}]`, v: await conv(it, `${expr}._M_impl._M_start[${i}]`, key, d + 1, S) })
      }
      if (n > MAX.cases) o.total = n
    }
    return { ref: id }
  }
  // Un pointeur : vers une variable (sref), un bloc vivant (ref, lu), un bloc libéré, un appel fini, rien de valide
  async function pointer(addr, expr, key, d, S) {
    if (!addr) return { nul: true }
    const s = await srefAt(addr, S)
    if (s) return s
    const b = blockAt(addr, true)
    if (b) return heapObj(b, addr, expr, key, d, S)
    if (blockAt(addr, false)) return { inv: 'libere' }
    if (S.dead.some(r => addr >= r.lo && addr < r.hi)) return { inv: 'pendant' }
    return { inv: 'non-init' }
  }
  async function srefAt(addr, S) {
    const r = S.ranges.find(x => addr >= x.lo && addr < x.hi)
    if (!r) return null
    const p = await pathAt(r, addr)
    return { sref: [r.fi, r.nom, ...(p !== undefined ? [p] : [])] }
  }
  // La case visée dans une variable : un indice (t[2]), un champ (s.x), les deux (t[2].x)
  async function pathAt(r, addr) {
    const off = addr - r.lo, dim = r.type.match(/\[(\d+)\]/)
    if (dim) {
      const elem = (r.hi - r.lo) / Number(dim[1]), i = Math.floor(off / elem), rest = off - i * elem
      const f = rest ? await fieldAt(r, `${r.expr}[${i}]`, r.lo + i * elem, rest) : null
      return f ? `${i}.${f}` : String(i)
    }
    return off ? (await fieldAt(r, r.expr, r.lo, off)) ?? undefined : undefined
  }
  async function fieldAt(r, expr, base, off) {
    const prev = level
    await select(r.level)
    let best = null
    const tree = parseGdbValue(await ev(expr) ?? '')
    const names = []
    const walk = st => { for (const f of st?.fields ?? []) f.name.startsWith('<') ? walk(f.value) : !f.name.startsWith('_vptr') && names.push(f.name) }
    walk(tree)
    for (const n of names) { const a = await addrOf(r.key, `(${expr}).${n}`); if (a !== null && a <= base + off && (!best || a > best.a)) best = { a, n } }
    await select(prev)
    return best?.n ?? null
  }
  // Un bloc du tas : un objet, ou un tableau (new int[4], malloc(4 * sizeof(int))) ; pointé au milieu : la case (at)
  async function heapObj(b, addr, expr, key, d, S) {
    const id = hex(b.p), sz = (await sizeOf(key, `*(${expr})`)) || 1
    let off = addr - b.p, base = expr, at, count
    // le compteur que new[] pose devant un tableau d'objets à destructeur : le pointeur vise le premier élément
    if (off > 0 && off <= 8 && (b.n - off) % sz === 0 && b.n > off) { count = (b.n - off) / sz; off = 0 }
    else { if (off > 0) { const k = Math.floor(off / sz); base = `(${expr}) - ${k}`; at = String(k) } count = Math.max(1, Math.floor(b.n / sz)) }
    const ref = at !== undefined ? { ref: id, at } : { ref: id }
    if (S.heap[id] || d > MAX.niveaux || Object.keys(S.heap).length >= MAX.objets) return ref
    const T = shortType(await whatis(key, `*(${base})`) ?? '?')
    if (T === 'void') { S.heap[id] = { classe: `${b.n} octets`, kind: 'objet', champs: [] }; return ref }
    const o = S.heap[id] = { classe: count > 1 ? `${T}[${count}]` : T, kind: count > 1 ? 'tableau' : 'objet', champs: [] }
    if (count > 1) {
      const items = parseGdbValue(await ev(`*(${base})@${Math.min(count, MAX.cases)}`) ?? '').items ?? []
      for (const [i, it] of items.entries()) o.champs.push({ nom: `[${i}]`, v: await conv(it, `(${base})[${i}]`, key, d + 1, S) })
      if (count > MAX.cases) o.total = count
    } else {
      const tree = parseGdbValue(await ev(`*(${base})`) ?? '')
      if (tree.type) o.classe = shortType(tree.type) // le type réel (un Animal* qui pointe un Chien)
      o.champs = tree.kind === 'struct' && !findField(tree, '_M_dataplus') ? await fields(tree, `(${base})`, '->', key, d + 1, S)
        : [{ nom: 'valeur', v: await conv(tree, `*(${base})`, key, d + 1, S) }]
    }
    return ref
  }

  // ---------- Une photo de la mémoire ----------
  const steps = [], seen = new Map(), known = new Map() // seen : le dernier contenu de chaque bloc montré ; known : les variables de chaque appel
  // preMain : les blocs alloués avant main (argv, le démarrage du programme, --wrap les voit aussi) : montrés s'ils sont
  // pointés, jamais comptés comme fuite ni libérés
  let globals = null, depth = 0, preMain = null
  async function snapshot(mine) {
    if (!mine.length) return
    level = 0 // après un arrêt, gdb est sur l'appel du haut
    await readBlocks()
    preMain ??= blocks.length
    globals ??= globalsOf((await send(`-interpreter-exec console ${quote('info variables')}`)).out, lower)
    const S = { ranges: [], dead: [], heap: {} }, raw = [], live = new Set()
    // 1. les variables de chaque appel, et où elles sont en mémoire
    for (const [fi, f] of mine.entries()) {
      await select(Number(f.level))
      // un appel = sa place dans la chaîne des appels : même chaîne, même cadre en mémoire (les adresses gardées valent)
      const key = mine.slice(0, fi + 1).map(x => x.func).join('/')
      live.add(key)
      const sv = await send('-stack-list-variables --simple-values'), av = await send('-stack-list-variables --all-values')
      const vals = new Map((av.data.variables ?? []).map(x => [x.name, x.value])), vars = []
      for (const x of sv.data.variables ?? []) {
        if (x.arg !== '1' && notYet(codeOf(f), Number(f.line), x.name)) continue
        const r = { nom: x.name, type: x.type ?? '', text: vals.get(x.name) ?? x.value ?? '' }
        if (!/&$/.test(r.type)) {
          const lo = await addrOf(key, x.name), size = await sizeOf(key, x.name)
          if (lo !== null && size) S.ranges.push({ lo, hi: lo + size, fi, nom: x.name, expr: x.name, key, type: r.type, level: Number(f.level) })
        }
        vars.push(r)
      }
      known.set(key, S.ranges.filter(r => r.key === key))
      raw.push({ f, key, vars })
    }
    const gl = []
    for (const nom of globals) {
      const expr = o.cpp && !nom.includes('::') ? `::${nom}` : nom, type = await whatis('G', expr) ?? ''
      const lo = await addrOf('G', expr), size = await sizeOf('G', expr)
      if (lo !== null && size) S.ranges.push({ lo, hi: lo + size, fi: -1, nom, expr, key: 'G', type, level: null })
      gl.push({ nom, expr, type })
    }
    for (const [k, rs] of known) if (!live.has(k)) S.dead.push(...rs)
    if (known.size > 64) for (const k of [...known.keys()].slice(0, known.size - 64)) known.delete(k)
    // 2. les valeurs, les pointeurs classés, le tas lu (chaque appel lu depuis son cadre)
    const frames = []
    for (const R of raw) {
      await select(Number(R.f.level))
      const vars = []
      for (const r of R.vars) vars.push({ nom: r.nom, v: await value(r.text, r.nom, r.type, R.key, 1, S) })
      frames.push({ func: funcName(R.f.func, Number(R.f.line), codeOf(R.f)), line: lineOf(R.f), file: fileOf(R.f), vars })
    }
    await select(Number(mine.at(-1).level))
    const statics = []
    for (const x of gl) statics.push({ nom: x.nom, v: await value(await ev(x.expr) ?? '', x.expr, x.type, 'G', 1, S) })
    // 3. les blocs libérés (montrés une fois) et ceux que plus rien ne pointe (pas juste au retour d'un appel :
    // la valeur renvoyée n'est pas encore rangée)
    // ponytail: les 12 plus récents seulement (une boucle qui fuit à chaque tour en accumulerait des centaines)
    let extra = 0
    for (let i = blocks.length - 1; i >= 0 && extra < MAX.cases; i--) {
      const b = blocks[i], id = hex(b.p)
      if (S.heap[id] || !seen.has(id) || b.i < preMain) continue
      if (!b.vivant && !freed.has(b.i)) { S.heap[id] = { ...seen.get(id), etat: 'libere' }; freed.add(b.i); extra++ }
      else if (b.vivant && mine.length >= depth) { S.heap[id] = { ...seen.get(id), etat: 'fuite' }; extra++ }
    }
    depth = mine.length
    for (const [id, ob] of Object.entries(S.heap)) if (!ob.etat) seen.set(id, ob)
    const top = frames.at(-1)
    steps.push({ line: top.line, file: top.file, event: 'line', frames, heap: S.heap, statics, out: readOut() })
  }
  // La fin : la mémoire telle que le programme la laisse ; ce qui est encore alloué n'a jamais été libéré
  function finalStep(atExit) {
    const last = steps.at(-1), heap = {}
    if (last && atExit) {
      for (const [id, ob] of Object.entries(last.heap)) if (!ob.etat) heap[id] = ob
      for (const b of blocks) {
        const id = hex(b.p)
        if (b.i < (preMain ?? 0)) continue
        if (b.vivant && seen.has(id)) heap[id] = { ...(heap[id] ?? seen.get(id)), etat: 'fuite' }
        else if (!b.vivant && heap[id] && !blocks.some(x => x.vivant && x.p === b.p)) heap[id] = { ...heap[id], etat: 'libere' }
      }
    }
    return { line: last?.line ?? 1, file: last?.file ?? names[0], event: 'end', frames: last?.frames ?? [], heap: atExit ? heap : last?.heap ?? {}, statics: last?.statics ?? [], out: readOut() }
  }

  // Les destructeurs de fin de bloc (string, vector, objets) : gdb repasse par la ligne de déclaration de chaque variable,
  // en arrière, dans le même appel. Pour l'élève ce n'est pas un pas : sauté (une boucle, elle, remonte à son for/while)
  function dtorLine(top, depthNow) {
    const prev = steps.at(-1), pf = prev?.frames.at(-1)
    if (!pf || prev.frames.length !== depthNow || pf.func !== funcName(top.func, Number(top.line), codeOf(top)) || pf.file !== fileOf(top)) return false
    const line = lineOf(top), text = codeOf(top).split('\n')[Number(top.line) - 1] ?? ''
    return line < pf.line && !/\b(?:for|while|do)\b/.test(text) && pf.vars.some(x => declares(text, x.nom))
  }

  const ourFrames = async () => ((await send('-stack-list-frames')).data.stack ?? []).map(x => x.frame).filter(ours).reverse() // main d'abord
  let error = null, atExit = false
  const work = (async () => {
    for (const c of ['new-console off', 'print elements 100', 'print repeats 10', 'width 0', 'print static-members off', 'print object on', 'print symbol off']) await send(`-gdb-set ${c}`)
    const bp = await send('-break-insert -f main')
    if (bp.cls === 'error') throw new Error(bp.data.msg ?? 'main introuvable')
    await send('-break-insert hito_fin')
    if ((await send('-exec-run')).cls === 'error') throw new Error('Le programme ne démarre pas sous gdb.')
    let stop = await nextStop(), guard = 0
    // arrivé dans main, un arrêt sur chaque ligne des fichiers de l'exemple : sorti dans la bibliothèque (cout, une
    // exception qui remonte), on repart jusqu'à la prochaine ligne de ce code, le catch compris
    for (const n of names) { const len = Math.min(o.files[n].split('\n').length, 1500); for (let k = 1; k <= len; k++) await send(`-break-insert ${n}:${k}`) }
    while (guard++ < o.max * 4) {
      const reason = String(stop.data.reason ?? '')
      if (/^exited/.test(reason)) { if (reason === 'exited') error = `Le programme s'est terminé avec le code ${Number.parseInt(stop.data['exit-code'], 8)}.`; break }
      if (reason === 'signal-received') { error = `Le programme a planté : ${stop.data['signal-meaning'] ?? stop.data['signal-name']}.`; await snapshot(await ourFrames()); break }
      const top = stop.data.frame
      if (top?.func === 'hito_fin') { await readBlocks(); atExit = true; await send('-exec-continue'); stop = await nextStop(); continue }
      if (!ours(top)) { await send('-exec-continue'); stop = await nextStop(); continue }
      const mine = await ourFrames()
      if (dtorLine(top, mine.length)) { await send('-exec-step'); stop = await nextStop(); continue }
      await snapshot(mine)
      if (steps.length >= o.max) { error = `Arrêté après ${o.max} pas (boucle trop longue ?).`; break }
      await send('-exec-step')
      stop = await nextStop()
    }
  })()
  const timeout = new Promise(res => setTimeout(() => res('temps'), o.ms))
  return Promise.race([work.then(() => 'ok', err => { error = err.message; return 'ko' }), timeout]).then(r => {
    if (r === 'temps') error = `Arrêté au bout de ${o.ms / 1000} s.`
    close()
    setTimeout(() => o.killTree(g), 500)
    steps.push(finalStep(atExit))
    return { steps, error, diag: [] }
  })
}

module.exports = { miSession, traceC, funcName, notYet, declares, shortType }

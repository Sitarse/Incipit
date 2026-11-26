// L'IDE des cours : les langages qu'il sait lancer, comment, et comment compléter un bout de code du cours (un fragment
// sans main) pour qu'il tourne. Pur : testé dans tests/ide.test.js. L'exécution elle-même est dans ide.js.
//
// tools : les programmes à trouver (le premier trouvé gagne) ; winget : le paquet qui l'installe ; pile : le pas à pas
// (la pile d'appels et les variables) existe pour ce langage.
const WINLIBS = 'BrechtSanders.WinLibs.POSIX.UCRT'
const LANGS = {
  cpp: { nom: 'C++', alias: ['cpp', 'c++', 'cc', 'cxx', 'hpp'], monaco: 'cpp', file: 'main.cpp', tools: ['g++'], winget: WINLIBS, pile: true },
  c: { nom: 'C', alias: ['c', 'h'], monaco: 'c', file: 'main.c', tools: ['gcc'], winget: WINLIBS, pile: true },
  python: { nom: 'Python', alias: ['python', 'py', 'python3'], monaco: 'python', file: 'main.py', tools: ['py', 'python', 'python3'], winget: 'Python.Python.3.13', pile: true },
  javascript: { nom: 'JavaScript', alias: ['javascript', 'js', 'node', 'mjs'], monaco: 'javascript', file: 'main.js', tools: [], winget: null, pile: true },
  typescript: { nom: 'TypeScript', alias: ['typescript', 'ts'], monaco: 'typescript', file: 'main.ts', tools: ['deno'], winget: 'DenoLand.Deno' },
  java: { nom: 'Java', alias: ['java'], monaco: 'java', file: 'Main.java', tools: ['javac'], winget: 'Microsoft.OpenJDK.21', pile: true },
  csharp: { nom: 'C#', alias: ['csharp', 'cs', 'c#'], monaco: 'csharp', file: 'Program.cs', tools: ['dotnet'], winget: 'Microsoft.DotNet.SDK.10', pile: true },
  php: { nom: 'PHP', alias: ['php'], monaco: 'php', file: 'main.php', tools: ['php'], winget: 'PHP.PHP.8.4' },
  go: { nom: 'Go', alias: ['go', 'golang'], monaco: 'go', file: 'main.go', tools: ['go'], winget: 'GoLang.Go' },
  rust: { nom: 'Rust', alias: ['rust', 'rs'], monaco: 'rust', file: 'main.rs', tools: ['rustc'], winget: 'Rustlang.Rust.GNU' },
  ruby: { nom: 'Ruby', alias: ['ruby', 'rb'], monaco: 'ruby', file: 'main.rb', tools: ['ruby'], winget: 'RubyInstallerTeam.Ruby.3.4' },
  bash: { nom: 'Bash', alias: ['bash', 'sh', 'shell', 'zsh'], monaco: 'shell', file: 'main.sh', tools: ['bash'], winget: 'Git.Git' },
}
// Hors Windows (pas de winget) : la commande à taper dans un terminal pour installer chaque langage. macOS : Homebrew ;
// Linux : apt (Debian, Ubuntu), les autres distributions ont les mêmes paquets sous d'autres noms.
const INSTALL = {
  cpp: { mac: 'xcode-select --install', linux: 'sudo apt install build-essential gdb' },
  c: { mac: 'xcode-select --install', linux: 'sudo apt install build-essential gdb' },
  python: { mac: 'brew install python', linux: 'sudo apt install python3' },
  typescript: { mac: 'brew install deno', linux: 'curl -fsSL https://deno.land/install.sh | sh' },
  java: { mac: 'brew install openjdk', linux: 'sudo apt install default-jdk' },
  csharp: { mac: 'brew install dotnet', linux: 'sudo apt install dotnet-sdk-8.0' },
  php: { mac: 'brew install php', linux: 'sudo apt install php-cli' },
  go: { mac: 'brew install go', linux: 'sudo apt install golang' },
  rust: { mac: 'brew install rust', linux: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh" },
  ruby: { mac: 'brew install ruby', linux: 'sudo apt install ruby' },
}
const installHint = (lang, platform) => INSTALL[lang]?.[platform === 'darwin' ? 'mac' : 'linux'] ?? null
// Les en-têtes que reçoit un fragment C++ sans #include : la liste explicite (<bits/stdc++.h> n'existe qu'avec GCC : ni sous
// macOS, qui a clang et libc++, ni avec la plupart des autres compilateurs)
const CPP_HEADERS = ['iostream', 'iomanip', 'sstream', 'fstream', 'string', 'string_view', 'vector', 'array', 'deque', 'list', 'forward_list', 'stack', 'queue',
  'map', 'set', 'unordered_map', 'unordered_set', 'algorithm', 'numeric', 'functional', 'iterator', 'utility', 'tuple', 'optional', 'variant', 'memory', 'bitset',
  'limits', 'stdexcept', 'exception', 'chrono', 'random', 'thread', 'mutex', 'atomic', 'cmath', 'cstdlib', 'cstring', 'cstdio', 'cassert', 'climits', 'cctype', 'ctime', 'cstdint']
const ALIAS = new Map(Object.entries(LANGS).flatMap(([id, l]) => l.alias.map(a => [a, id])))
const langOf = tag => ALIAS.get(String(tag ?? '').trim().toLowerCase()) ?? null

// Un fragment C/C++ : des instructions à mettre dans un main, ou des définitions (classe, fonction) auxquelles il manque
// seulement un main. Une ligne qui commence en colonne 0 par une définition décide.
const TOP_DEF = /^(?:class|struct|template|namespace|enum|union|typedef|using\s+\w+\s*=|#define)\b|^[A-Za-z_][\w:<>,\s*&]*[\s*&]~?[A-Za-z_][\w:]*\s*\([^;]*\)\s*(?:const\s*)?(?:noexcept\s*)?(?:\{|$)/m
// Ce que le programme reçoit avant le code (lignes comptées : les erreurs et la pile sont ramenées aux lignes du bout de
// code affiché). Pour C et C++, le -include ide-io.h (sortie sans tampon, entrée/sortie de fichier pour le pas à pas)
// est ajouté par ide.js à la compilation, sans ligne en plus.
function wrap(lang, code) {
  const src = String(code ?? '').replace(/\r\n?/g, '\n')
  const out = (head, tail = '') => ({ code: head + src + tail, offset: head ? head.split('\n').length - 1 : 0, wrapped: !!(head || tail) })
  if (lang === 'cpp' || lang === 'c') {
    // les diapos montrent souvent le code sans ses #include : on les ajoute, même quand il y a un main
    const inc = /#\s*include/.test(src) ? '' : lang === 'cpp' ? `${CPP_HEADERS.map(h => `#include <${h}>`).join('\n')}\nusing namespace std;\n` : '#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n'
    if (/\bmain\s*\(/.test(src)) return out(inc)
    return TOP_DEF.test(src) ? out(inc, '\nint main() { return 0; }\n') : out(`${inc}int main() {\n`, '\nreturn 0;\n}\n')
  }
  if (lang === 'java') return javaWrap(src)
  if (lang === 'php') return /^\s*<\?php/.test(src) ? out('') : out('<?php\n')
  if (lang === 'go') {
    if (/^\s*package\s/m.test(src)) return out('')
    if (/\bfunc\s+main\s*\(/.test(src)) return out('package main\n')
    return out(`package main\n${/\bfmt\./.test(src) ? 'import "fmt"\n' : ''}func main() {\n`, '\n}\n')
  }
  if (lang === 'rust') return /\bfn\s+main\s*\(/.test(src) ? out('') : out('fn main() {\n', '\n}\n')
  return out('') // Python, JS, TS, C# (instructions de premier niveau), Ruby, Bash : tels quels
}
// Le nom de fichier Java suit son type public (classe, interface, enum, record)
const javaFile = code => `${String(code).match(/public\s+(?:(?:final|abstract|sealed|non-sealed|strictfp)\s+)*(?:class|interface|enum|record)\s+(\w+)/)?.[1] ?? 'Main'}.java`

// ---------- Java : compilé par javac, lancé par java -cp . <la classe qui a le main> (ide.js) ----------
// Le code sans chaînes ni commentaires (mêmes lignes) : pour compter les accolades sans se tromper
const blank = s => s.replace(/"""[\s\S]*?"""|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\/\/[^\n]*/g, m => m.replace(/[^\n]/g, ' '))
// Les morceaux du niveau 0 : une instruction, une méthode, une classe… { a, b : leurs lignes, t : leur texte sur une ligne }
function chunks(src) {
  const lines = blank(src).split('\n'), out = []
  let depth = 0, cur = null
  lines.forEach((l, i) => {
    const t = l.trim()
    if (!cur && t) cur = { a: i }
    for (const ch of l) depth += ch === '{' ? 1 : ch === '}' ? -1 : 0
    if (cur && depth <= 0 && /[;}]$/.test(t)) { depth = 0; cur.b = i; out.push(cur); cur = null }
  })
  if (cur) { cur.b = lines.length - 1; out.push(cur) }
  for (const c of out) c.t = lines.slice(c.a, c.b + 1).join(' ').replace(/\s+/g, ' ').trim()
  return out
}
const J_MODS = String.raw`(?:@[\w.]+(?:\s*\([^)]*\))?\s+)*(?:(?:public|protected|private|static|final|abstract|sealed|non-sealed|strictfp|synchronized|native|default|transient|volatile)\s+)*`
const J_TYPE = new RegExp(String.raw`^${J_MODS}(?:class|interface|enum|record|@interface)\s+([A-Za-z_$][\w$]*)`)
const J_NOT = String.raw`(?!(?:return|throw|new|else|case|yield|var|import|package)\b)`
const J_METHOD = new RegExp(String.raw`^${J_MODS}(?:<[^>]*>\s*)?${J_NOT}[\w$.]+(?:<[^;=(]*>)?(?:\[\])*\s+[\w$]+\s*\([^;]*\)\s*(?:throws\s[^{;]*)?\{`)
const J_FIELD = new RegExp(String.raw`^${J_MODS}${J_NOT}[\w$.]+(?:<[^;=(]*>)?(?:\[\])*\s+[\w$]+\s*(?:\[\])*\s*(?:=|;|,)`)
const J_MAIN = /\bstatic\s+(?:final\s+)?void\s+main\s*\(|\bvoid\s+main\s*\(\s*\)/
function javaWrap(src) {
  const cs = chunks(src), lines = src.split('\n')
  const kind = c => /^import\s/.test(c.t) ? 'import' : /^package\s/.test(c.t) ? 'package' : J_TYPE.test(c.t) ? 'type' : J_METHOD.test(c.t) ? 'method' : J_FIELD.test(c.t) ? 'field' : 'stmt'
  for (const c of cs) c.k = kind(c)
  const noImport = !cs.some(c => c.k === 'import')
  // 1. un vrai fichier (des classes, peut-être un package) : tel quel ; la classe lancée est celle qui a le main
  if (cs.length && cs.every(c => ['import', 'package', 'type'].includes(c.k))) {
    const pkg = src.match(/^\s*package\s+([\w.]+)\s*;/m)?.[1], types = cs.filter(c => c.k === 'type')
    const m = types.find(c => /\bstatic\s/.test(c.t.match(J_MAIN)?.[0] ?? '')) ?? types.find(c => J_MAIN.test(c.t))
    const main = m ? `${pkg ? `${pkg}.` : ''}${m.t.match(J_TYPE)[1]}` : null
    // les diapos oublient souvent les import : java.util (Scanner, ArrayList…) est donné, sur la ligne du package s'il y en a un
    if (noImport && pkg) { const p = cs.find(c => c.k === 'package'); lines[p.b] += ' import java.util.*;'; return { code: lines.join('\n'), offset: 0, wrapped: true, main } }
    return { code: (noImport ? 'import java.util.*;\n' : '') + src, offset: noImport ? 1 : 0, wrapped: noImport, main }
  }
  // 2. un bout de code : les import montent avant la classe Main, le package part (lignes gardées, vides)
  const imports = []
  for (const c of cs) if (c.k === 'import' || c.k === 'package') for (let i = c.a; i <= c.b; i++) { if (c.k === 'import') imports.push(lines[i]); lines[i] = '' }
  const head = `${imports.length ? `${imports.join('\n')}\n` : 'import java.util.*;\n'}public class Main {\n`
  const finish = (h, tail) => ({ code: h + lines.join('\n') + tail, offset: h.split('\n').length - 1, wrapped: true, main: 'Main' })
  // 2a. que des instructions : dans main
  if (!cs.some(c => c.k === 'type' || c.k === 'method')) return finish(`${head}public static void main(String[] args) throws Exception {\n`, '\n}\n}\n')
  // 2b. des méthodes ou des classes avec : elles deviennent membres de Main (classes statiques), les déclarations des
  // champs, et chaque suite d'instructions un bloc { } exécuté à la création de Main, dans l'ordre du texte
  let run = null
  const close = () => { if (run) lines[run.b] += ' }'; run = null }
  for (const c of cs) {
    if (c.k === 'stmt') { if (!run) lines[c.a] = `{ ${lines[c.a]}`; run = c; continue }
    close()
    if (c.k === 'type' && !/^(?:@\S+\s+)*(?:\w+\s+)*static\s/.test(c.t)) lines[c.a] = `static ${lines[c.a]}`
  }
  close()
  // son propre main : le sien (static), ou celui de Java 25 (void main(), appelé sur un Main créé)
  const mains = cs.filter(c => c.k === 'method').map(c => c.t.match(J_MAIN)?.[0]).filter(Boolean)
  if (mains.some(m => /\bstatic\s/.test(m))) return finish(head, '\n}\n')
  const start = mains.length ? 'new Main().main();' : 'new Main();'
  return finish(`${head}public static void main(String[] args) throws Exception { ${start} }\nMain() throws Exception {}\n`, '\n}\n')
}

// Les erreurs du compilateur ou de l'exécution, ramenées aux lignes du bout de code : gcc/clang/rustc/go/javac
// (fichier:ligne[:col]: …), dotnet (fichier(ligne,col): …), Python (File "main.py", line N), PHP (on line N)
function diagnostics(text, file, offset = 0) {
  const name = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), list = [], seen = new Set()
  const add = (line, col, sev, msg) => {
    const l = Number(line) - offset
    if (!(l >= 1)) return
    const key = `${l}:${msg}`
    if (seen.has(key)) return
    seen.add(key); list.push({ line: l, col: Number(col) || 1, severity: /warn|avert/i.test(sev) ? 'warning' : 'error', message: String(msg).trim().slice(0, 400) })
  }
  for (const m of text.matchAll(new RegExp(String.raw`(?:^|[\\/\s])${name}:(\d+)(?::(\d+))?:\s*(fatal error|error|warning|erreur|avertissement)?\s*:?\s*(.+)`, 'gim'))) add(m[1], m[2], m[3] ?? 'error', m[4])
  for (const m of text.matchAll(new RegExp(String.raw`${name}\((\d+),(\d+)\):\s*(error|warning)\s*([^:]*):\s*(.+?)(?:\s\[[^\]]*\])?$`, 'gim'))) add(m[1], m[2], m[3], `${m[4]} ${m[5]}`)
  for (const m of text.matchAll(new RegExp(String.raw`File "[^"]*${name}", line (\d+)`, 'g'))) {
    const last = text.trim().split('\n').pop()
    add(m[1], 1, 'error', last)
  }
  for (const m of text.matchAll(/(?:error|warning):\s*(.+)\n\s*-->\s*[^:]*:(\d+):(\d+)/g)) add(m[2], m[3], 'error', m[1]) // rustc
  for (const m of text.matchAll(/(Parse error|Fatal error|Warning):\s*(.+?) in \S+ on line (\d+)/g)) add(m[3], 1, m[1], m[2]) // PHP
  return list
}

// ---------- gdb/MI : une réponse comme ^done,stack=[frame={level="0",func="main",line="5"}] devient un objet ----------
function parseMI(s) {
  let i = 0
  const str = () => {
    let v = ''
    i++ // "
    while (i < s.length && s[i] !== '"') {
      if (s[i] === '\\') { i++; const c = s[i]; v += c === 'n' ? '\n' : c === 't' ? '\t' : c === 'r' ? '' : c } else v += s[i]
      i++
    }
    i++
    return v
  }
  const value = () => s[i] === '"' ? str() : s[i] === '{' ? tuple() : s[i] === '[' ? list() : ''
  const key = () => { const st = i; while (i < s.length && s[i] !== '=' && s[i] !== ',' && s[i] !== ']' && s[i] !== '}') i++; return s.slice(st, i) }
  function tuple() {
    const o = {}
    i++
    while (i < s.length && s[i] !== '}') { const k = key(); i++; o[k] = value(); if (s[i] === ',') i++ }
    i++
    return o
  }
  function list() {
    const a = []
    i++
    while (i < s.length && s[i] !== ']') {
      if (s[i] === '"' || s[i] === '{' || s[i] === '[') a.push(value())
      else { const k = key(); if (s[i] === '=') { i++; a.push({ [k]: value() }) } }
      if (s[i] === ',') i++
    }
    i++
    return a
  }
  // le début : ^done / *stopped, puis ,clé=valeur…
  const m = s.match(/^(\d*)([\^*+=~@&])([\w-]*)/)
  if (!m) return null
  i = m[0].length
  const res = { token: m[1], type: m[2], cls: m[3], data: {} }
  if (m[2] === '~' || m[2] === '@' || m[2] === '&') { i = 1 + m[1].length; res.text = str(); return res }
  while (s[i] === ',') { i++; const k = key(); i++; res.data[k] = value() }
  return res
}

// ---------- Une valeur telle que gdb l'écrit, en arbre (le pas à pas C/C++ dessine la mémoire avec) ----------
// { kind: 'struct', fields: [{ name, value }] } (les classes de base : « <Animal> »), 'array' (items, les « <repeats n
// times> » dépliés), 'ptr' (addr), 'str' (text, addr? : un char* ou un tableau de char), 'ref' (addr, value : une
// référence C++), 'fn' (text : un pointeur de fonction), 'scalar' (text, tel quel : 5, true, 65 'A', 3.14).
const REPEAT_MAX = 200
function parseGdbValue(text) {
  const s = String(text ?? '').trim()
  let i = 0
  const ws = () => { while (s[i] === ' ' || s[i] === '\n') i++ }
  const quoted = () => { const q = s[i]; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++ } i++ }
  // un morceau : jusqu'à la virgule ou l'accolade du niveau, sans couper une chaîne ni un « <…> »
  function atom() {
    const st = i
    let depth = 0
    while (i < s.length) {
      const c = s[i]
      if (c === '"' || c === "'") { quoted(); continue }
      if (c === '<') depth++
      else if (c === '>' && depth) depth--
      else if (!depth && (c === ',' || c === '}')) break
      i++
    }
    return s.slice(st, i).trim()
  }
  function leaf(t) {
    let m
    if ((m = t.match(/^@(0x[0-9a-f]+):\s*([\s\S]*)$/i))) return { kind: 'ref', addr: Number.parseInt(m[1], 16), value: parseGdbValue(m[2]) }
    if ((m = t.match(/^(0x[0-9a-f]+)(?:\s+<[^>]*>)?$/i))) return { kind: 'ptr', addr: Number.parseInt(m[1], 16) }
    if ((m = t.match(/^(?:(0x[0-9a-f]+)\s+)?"((?:\\.|[^"\\])*)"(\.\.\.)?/i))) {
      const out = { kind: 'str', text: m[2].replace(/\\(["\\])/g, '$1') + (m[3] ? '…' : '') } // \\ et \" de gdb : le vrai caractère
      if (m[1]) out.addr = Number.parseInt(m[1], 16)
      return out
    }
    return { kind: 'scalar', text: t }
  }
  let rep = 0 // le « <repeats n times> » qui suivait la dernière feuille lue
  function value() {
    ws()
    // « (Chien *) 0x… », « (Chien) {…} » : le type réel (print object on), gardé dans type
    const cast = s.slice(i).match(/^\(((?:[^()]|\([^()]*\))+)\)\s+(?=[{@"'0-9-])/)
    if (cast) { i += cast[0].length; const v = value(); v.type = cast[1].trim(); return v }
    if (s[i] !== '{') {
      const t = atom(), m = t.match(/\s*<repeats (\d+) times>$/)
      rep = m ? +m[1] : 0
      return leaf(m ? t.slice(0, m.index) : t)
    }
    // {int (int)} 0x401460 <carre(int)> : un pointeur de fonction
    const fn = s.slice(i).match(/^\{[^{}=]*\}\s+(0x[0-9a-f]+)(?:\s+<([^>]*)>)?/i)
    if (fn) { i += fn[0].length; return { kind: 'fn', text: fn[2] ?? fn[1], addr: Number.parseInt(fn[1], 16) } }
    i++
    const fields = [], items = []
    while (i < s.length) {
      ws()
      if (s[i] === '}') { i++; break }
      if (s[i] === ',') { i++; continue }
      const name = s.slice(i).match(/^(<[^=]*?>|[A-Za-z_][\w.:$]*)\s=\s/)
      if (name) { i += name[0].length; fields.push({ name: name[1], value: value() }); continue }
      if (s.startsWith('<No data fields>', i)) { i += 16; continue }
      rep = 0
      const v = value()
      ws()
      const after = s.slice(i).match(/^<repeats (\d+) times>/) // après un groupe : {x = 0} <repeats 3 times>
      if (after) { i += after[0].length; rep = +after[1] }
      for (let k = 0; k < Math.min(rep || 1, REPEAT_MAX) && items.length < REPEAT_MAX; k++) items.push(v)
    }
    rep = 0 // celui d'une feuille du groupe ne vaut pas pour le groupe
    return fields.length || !items.length && /<No data fields>/.test(s) ? { kind: 'struct', fields } : { kind: 'array', items }
  }
  // une valeur seule ; un tableau de char s'écrit « "Bob", '\000' <repeats 16 times> » : la chaîne du début
  if (s[0] !== '{' && s[0] !== '(') { const t = atom(); return leaf(t.replace(/\s*<repeats \d+ times>$/, '')) }
  return value()
}

// Une valeur affichée dans la pile : courte, sur une ligne
const shortVal = v => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t.length > 160 ? `${t.slice(0, 157)}…` : t }

// Un exemple de cours qui se lance, ou un extrait qui s'illustre seulement : une signature (« T top(); »), un squelette
// avec « ... », un « catch » sans son « try », une méthode d'une classe qu'on ne voit pas ne tournent pas seuls : pas d'IDE.
const DECL = [
  /^(?:template\s*<[^>]*>\s*)?(?!return\b|throw\b|delete\b|new\b|co_return\b|yield\b|await\b)(?:[\w:<>,*&~[\]]+\s+)+\*?&?~?[\w:]+\s*\([^)]*\)\s*(?:const|noexcept|override|final|throw\s*\([^)]*\)|\s)*(?:=\s*(?:0|default|delete))?\s*;$/,
  /^(?:class|struct|enum|union|interface)\s+\w+\s*;$/, /^(?:public|private|protected)\s*:$/,
  /^#\s*include\b.*$/, /^(?:using|import|package)\s.*;$/,
]
function runnable(lang, code) {
  const hash = /^(python|bash|ruby|php)$/.test(lang)
  let src = String(code ?? '').replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '')
  src = src.replace(/"(?:\\.|[^"\\\n])*"/g, '""').replace(hash ? /#[^\n]*/g : /(^|[^:])\/\/[^\n]*/g, '$1')
  const lines = src.split('\n').map(l => l.trim()).filter(Boolean)
  if (!lines.length) return false
  if (/\{\s*(?:\.\.\.|…)\s*\}|\(\s*(?:\.\.\.|…)\s*\)|^(?:\.\.\.|…)$/m.test(lines.join('\n'))) return false // « ... » : un morceau
  if (/^(?:\}\s*)?(?:catch|finally|else|case|default)\b|^\}/.test(lines[0])) return false // commence au milieu d'une structure
  if (/^(?:c|cpp|java|csharp)$/.test(lang)) {
    if (lines.every(l => DECL.some(re => re.test(l)))) return false // que des déclarations : rien à exécuter
    // la définition d'une méthode (Pile<T>::pop() { … }) dont la classe n'est pas dans l'exemple
    const m = src.match(/^\s*(?:template\s*<[^>]*>\s*)?(?:[\w:<>,*&~]+\s+)*(\w+)(?:<[^>]*>)?::~?\w+\s*\([^)]*\)[^;{]*\{/m)
    if (m && m[1] !== 'std' && !new RegExp(`\\b(?:class|struct)\\s+${m[1]}\\b`).test(src)) return false
  }
  return true
}

// Un exemple C/C++ en plusieurs fichiers (#include "Purse.h") : les autres fichiers du chapitre, envoyés par la page.
// Seulement des noms simples d'en-têtes et de sources, pas celui du programme lui-même ; sinon rien.
function cleanFiles(files, mainFile) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) return {}
  const ok = Object.entries(files).filter(([n, c]) => /^[\w-]{1,60}\.(?:h|hh|hpp|hxx|c|cc|cpp|cxx)$/i.test(n) && n.toLowerCase() !== String(mainFile).toLowerCase()
    && typeof c === 'string' && c.length <= 200_000)
  return Object.fromEntries(ok.slice(0, 20).map(([n, c]) => [n, c.replace(/\r\n?/g, '\n')]))
}

const API = { LANGS, WINLIBS, INSTALL, installHint, langOf, wrap, javaFile, diagnostics, parseMI, parseGdbValue, shortVal, runnable, cleanFiles }
if (typeof module === 'object' && module.exports) module.exports = API
else window.IdeLangs = API // la page du lecteur (lecteur-ide.js)

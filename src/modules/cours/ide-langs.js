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
  javascript: { nom: 'JavaScript', alias: ['javascript', 'js', 'node', 'mjs'], monaco: 'javascript', file: 'main.js', tools: [], winget: null },
  typescript: { nom: 'TypeScript', alias: ['typescript', 'ts'], monaco: 'typescript', file: 'main.ts', tools: ['deno'], winget: 'DenoLand.Deno' },
  java: { nom: 'Java', alias: ['java'], monaco: 'java', file: 'Main.java', tools: ['javac'], winget: 'Microsoft.OpenJDK.21' },
  csharp: { nom: 'C#', alias: ['csharp', 'cs', 'c#'], monaco: 'csharp', file: 'Program.cs', tools: ['dotnet'], winget: 'Microsoft.DotNet.SDK.10' },
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
  if (lang === 'java') {
    if (/\bclass\s+\w+/.test(src)) return out('')
    const imp = /^\s*import\s/m.test(src) ? '' : 'import java.util.*;\n'
    return out(`${imp}public class Main {\npublic static void main(String[] args) throws Exception {\n`, '\n}\n}\n')
  }
  if (lang === 'php') return /^\s*<\?php/.test(src) ? out('') : out('<?php\n')
  if (lang === 'go') {
    if (/^\s*package\s/m.test(src)) return out('')
    if (/\bfunc\s+main\s*\(/.test(src)) return out('package main\n')
    return out(`package main\n${/\bfmt\./.test(src) ? 'import "fmt"\n' : ''}func main() {\n`, '\n}\n')
  }
  if (lang === 'rust') return /\bfn\s+main\s*\(/.test(src) ? out('') : out('fn main() {\n', '\n}\n')
  return out('') // Python, JS, TS, C# (instructions de premier niveau), Ruby, Bash : tels quels
}
// Le nom de fichier Java suit sa classe publique
const javaFile = code => `${String(code).match(/public\s+(?:final\s+|abstract\s+)*class\s+(\w+)/)?.[1] ?? 'Main'}.java`

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
  for (const m of text.matchAll(new RegExp(String.raw`(?:^|[\\/\s])${name}:(\d+)(?::(\d+))?:\s*(fatal error|error|warning|erreur|avertissement)?:?\s*(.+)`, 'gim'))) add(m[1], m[2], m[3] ?? 'error', m[4])
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

// Une valeur affichée dans la pile : courte, sur une ligne
const shortVal = v => { const t = String(v ?? '').replace(/\s+/g, ' ').trim(); return t.length > 160 ? `${t.slice(0, 157)}…` : t }

// Un exemple de cours qui se lance, ou un extrait qui s'illustre seulement : une signature (« T top(); »), un squelette
// avec « ... », un « catch » sans son « try », une méthode d'une classe qu'on ne voit pas ne tournent pas seuls : pas d'IDE.
const DECL = [
  /^(?:template\s*<[^>]*>\s*)?(?!return\b|throw\b|delete\b|new\b|co_return\b|yield\b|await\b)(?:[\w:<>,*&~[\]]+\s+)+\*?&?~?[\w:]+\s*\([^)]*\)\s*(?:const|noexcept|override|final|\s)*(?:=\s*(?:0|default|delete))?\s*;$/,
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

const API = { LANGS, WINLIBS, INSTALL, installHint, langOf, wrap, javaFile, diagnostics, parseMI, shortVal, runnable }
if (typeof module === 'object' && module.exports) module.exports = API
else window.IdeLangs = API // la page du lecteur (lecteur-ide.js)

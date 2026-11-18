const { execFile } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// Ce qui change d'un système à l'autre, au même endroit : où trouver uv et Claude Code, quel PATH donner aux outils,
// comment arrêter un programme et tous ceux qu'il a lancés, où Obsidian range ses réglages. Chaque fonction prend le
// système, le dossier perso et l'environnement en paramètres (leurs valeurs d'ici par défaut) : les tests (tests/platform.test.js)
// vérifient donc Windows, macOS et Linux depuis n'importe lequel des trois.
const IS_WIN = process.platform === 'win32'
const IS_MAC = process.platform === 'darwin'
const pathOf = platform => (platform === 'win32' ? path.win32 : path.posix)
const exe = (name, platform = process.platform) => (platform === 'win32' ? `${name}.exe` : name)

// Une appli lancée depuis le Finder ou un lanceur de bureau n'a pas le PATH du terminal (juste /usr/bin:/bin) : Homebrew,
// uv, Claude Code, cargo, go… y seraient introuvables. On y ajoute les dossiers où ils s'installent.
function extraDirs(platform = process.platform, home = os.homedir()) {
  if (platform === 'win32') return []
  const p = pathOf(platform), h = (...a) => p.join(home, ...a)
  const common = [h('.local', 'bin'), h('.cargo', 'bin'), h('.claude', 'local'), h('.deno', 'bin'), h('.npm-global', 'bin'), h('go', 'bin'), h('.bun', 'bin'), '/usr/local/bin', '/usr/local/go/bin']
  return platform === 'darwin'
    ? ['/opt/homebrew/bin', '/opt/homebrew/sbin', ...common, '/opt/local/bin']
    : [...common, '/snap/bin', '/home/linuxbrew/.linuxbrew/bin']
}
// Le PATH à donner aux programmes lancés : le sien, puis ces dossiers (sans doublon)
function pathWith(current = process.env.PATH ?? '', platform = process.platform, home = os.homedir()) {
  const sep = platform === 'win32' ? ';' : ':'
  const have = current.split(sep).filter(Boolean)
  return [...have, ...extraDirs(platform, home).filter(d => !have.includes(d))].join(sep)
}

const isExec = (file, platform = process.platform) => {
  try {
    const st = fs.statSync(file)
    return st.isFile() && (platform === 'win32' || (st.mode & 0o111) !== 0)
  } catch { return false }
}
// Le premier exécutable `name` dans ces dossiers ; sous Windows avec .exe ou .cmd
function findIn(name, dirs, { platform = process.platform, exists = isExec } = {}) {
  const p = pathOf(platform), exts = platform === 'win32' ? ['.exe', '.cmd'] : ['']
  for (const d of dirs) {
    if (!d) continue
    for (const ext of exts) { const f = p.join(d, name + ext); if (exists(f, platform)) return f }
  }
  return null
}
const pathDirs = (env = process.env, platform = process.platform) => (env.PATH ?? env.Path ?? '').split(platform === 'win32' ? ';' : ':').filter(Boolean)

// uv : celui livré avec l'appli (resources/uv), puis le PATH, puis là où ses installateurs le posent
function findUv({ platform = process.platform, env = process.env, home = os.homedir(), resources = process.resourcesPath, exists = isExec, list = dir => { try { return fs.readdirSync(dir) } catch { return [] } } } = {}) {
  const p = pathOf(platform), local = env.LOCALAPPDATA ?? ''
  const dirs = [resources && p.join(resources, 'uv'), ...pathDirs(env, platform), ...extraDirs(platform, home)]
  if (platform === 'win32') {
    dirs.push(p.join(home, '.local', 'bin'), p.join(home, '.cargo', 'bin'), p.join(local, 'Microsoft', 'WinGet', 'Links'))
    const packages = p.join(local, 'Microsoft', 'WinGet', 'Packages')
    for (const d of list(packages)) if (/^astral-sh\.uv_/i.test(d)) dirs.push(p.join(packages, d))
  }
  return findIn('uv', dirs, { platform, exists })
}
// Claude Code : l'installeur natif (~/.local/bin), le paquet npm (Windows : %APPDATA%\npm), Homebrew, ou le PATH
function findClaude({ platform = process.platform, env = process.env, home = os.homedir(), exists = isExec, list = dir => { try { return fs.readdirSync(dir) } catch { return [] } } } = {}) {
  const p = pathOf(platform)
  if (platform === 'win32') {
    return [p.join(home, '.local', 'bin', 'claude.exe'), p.join(env.APPDATA ?? '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')].find(f => exists(f, platform)) ?? null
  }
  // nvm : une version de Node par dossier, chacune avec ses paquets globaux
  const nvm = p.join(home, '.nvm', 'versions', 'node'), nvmBins = list(nvm).map(v => p.join(nvm, v, 'bin'))
  return findIn('claude', [...pathDirs(env, platform), ...extraDirs(platform, home), ...nvmBins], { platform, exists })
}

// Arrête un programme et tout ce qu'il a lancé (uv → python → claude). Windows : taskkill. Ailleurs : le programme a été
// lancé dans son propre groupe (detached : voir spawnOptions), on arrête le groupe entier.
function killTree(pid, { platform = process.platform, kill = process.kill.bind(process), run = execFile } = {}) {
  if (!pid) return Promise.resolve()
  if (platform === 'win32') return new Promise(r => run('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true }, () => r()))
  for (const target of [-pid, pid]) { try { kill(target, 'SIGKILL'); break } catch {} }
  return Promise.resolve()
}
// Les options communes de lancement : pas de fenêtre de console sous Windows ; ailleurs son propre groupe de processus
const spawnOptions = (platform = process.platform) => (platform === 'win32' ? { windowsHide: true } : { detached: true })

// Les réglages d'Obsidian (la liste de ses coffres)
function obsidianConfig({ platform = process.platform, env = process.env, home = os.homedir() } = {}) {
  const p = pathOf(platform)
  if (platform === 'win32') return p.join(env.APPDATA ?? '', 'obsidian', 'obsidian.json')
  if (platform === 'darwin') return p.join(home, 'Library', 'Application Support', 'obsidian', 'obsidian.json')
  return p.join(env.XDG_CONFIG_HOME || p.join(home, '.config'), 'obsidian', 'obsidian.json')
}

// Comment installer uv, dit pour ce système
const uvInstallHint = (platform = process.platform) => (platform === 'win32' ? 'winget install astral-sh.uv'
  : platform === 'darwin' ? 'brew install uv  (ou : curl -LsSf https://astral.sh/uv/install.sh | sh)' : 'curl -LsSf https://astral.sh/uv/install.sh | sh')

module.exports = { IS_WIN, IS_MAC, exe, extraDirs, pathWith, findIn, findUv, findClaude, killTree, spawnOptions, obsidianConfig, uvInstallHint, pathDirs, isExec }

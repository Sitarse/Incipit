// Ce qui change d'un système à l'autre (src/app/platform.js) : vérifié pour Windows, macOS et Linux depuis n'importe lequel
const assert = require('node:assert/strict')
const P = require('../src/app/platform')

// --- noms et PATH
assert.equal(P.exe('uv', 'win32'), 'uv.exe')
assert.equal(P.exe('uv', 'linux'), 'uv')
assert.equal(P.exe('programme', 'darwin'), 'programme')
assert.deepEqual(P.extraDirs('win32', 'C:\\Users\\a'), [])
const mac = P.extraDirs('darwin', '/Users/a'), lin = P.extraDirs('linux', '/home/a')
assert.ok(mac.includes('/opt/homebrew/bin') && mac.includes('/Users/a/.local/bin') && mac.includes('/usr/local/bin'))
assert.ok(lin.includes('/home/a/.cargo/bin') && lin.includes('/snap/bin') && !lin.includes('/opt/homebrew/bin'))
// le PATH d'une appli lancée depuis le Finder gagne Homebrew et les dossiers perso, sans doublon, sans perdre le sien
const p = P.pathWith('/usr/bin:/bin:/usr/local/bin', 'darwin', '/Users/a').split(':')
assert.deepEqual(p.slice(0, 3), ['/usr/bin', '/bin', '/usr/local/bin'])
assert.ok(p.includes('/opt/homebrew/bin') && p.includes('/Users/a/.cargo/bin'))
assert.equal(p.filter(d => d === '/usr/local/bin').length, 1)
assert.equal(P.pathWith('C:\\Windows;C:\\bin', 'win32', 'C:\\Users\\a'), 'C:\\Windows;C:\\bin') // Windows : rien d'ajouté

// --- uv
const has = set => f => set.has(f)
assert.equal(P.findUv({ platform: 'darwin', env: { PATH: '/usr/bin:/bin' }, home: '/Users/a', resources: '/Applications/Incipit.app/Contents/Resources',
  exists: has(new Set(['/Applications/Incipit.app/Contents/Resources/uv/uv', '/opt/homebrew/bin/uv'])) }), '/Applications/Incipit.app/Contents/Resources/uv/uv') // celui de l'appli d'abord
assert.equal(P.findUv({ platform: 'darwin', env: { PATH: '/usr/bin' }, home: '/Users/a', resources: '/x', exists: has(new Set(['/opt/homebrew/bin/uv'])) }), '/opt/homebrew/bin/uv') // Homebrew, hors PATH
assert.equal(P.findUv({ platform: 'linux', env: { PATH: '/usr/bin' }, home: '/home/a', resources: '/x', exists: has(new Set(['/home/a/.local/bin/uv'])) }), '/home/a/.local/bin/uv')
assert.equal(P.findUv({ platform: 'linux', env: { PATH: '/usr/bin' }, home: '/home/a', resources: '/x', exists: () => false }), null)
assert.equal(P.findUv({ platform: 'win32', env: { PATH: 'C:\\Windows', LOCALAPPDATA: 'C:\\L' }, home: 'C:\\Users\\a', resources: undefined,
  list: () => ['astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe'], exists: has(new Set(['C:\\L\\Microsoft\\WinGet\\Packages\\astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe\\uv.exe'])) }),
'C:\\L\\Microsoft\\WinGet\\Packages\\astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe\\uv.exe')

// --- Claude Code
assert.equal(P.findClaude({ platform: 'linux', env: { PATH: '/usr/bin' }, home: '/home/a', exists: has(new Set(['/home/a/.local/bin/claude'])) }), '/home/a/.local/bin/claude')
assert.equal(P.findClaude({ platform: 'darwin', env: { PATH: '/usr/bin' }, home: '/Users/a', exists: has(new Set(['/opt/homebrew/bin/claude'])) }), '/opt/homebrew/bin/claude')
assert.equal(P.findClaude({ platform: 'linux', env: { PATH: '/usr/bin' }, home: '/home/a', list: () => ['v22.1.0'], exists: has(new Set(['/home/a/.nvm/versions/node/v22.1.0/bin/claude'])) }), '/home/a/.nvm/versions/node/v22.1.0/bin/claude')
assert.equal(P.findClaude({ platform: 'win32', env: { APPDATA: 'C:\\A' }, home: 'C:\\Users\\a', exists: has(new Set(['C:\\Users\\a\\.local\\bin\\claude.exe'])) }), 'C:\\Users\\a\\.local\\bin\\claude.exe')
assert.equal(P.findClaude({ platform: 'linux', env: { PATH: '' }, home: '/home/a', exists: () => false }), null)

// --- arrêter un programme et ses enfants
const calls = []
P.killTree(4242, { platform: 'linux', kill: (pid, sig) => calls.push([pid, sig]) })
assert.deepEqual(calls, [[-4242, 'SIGKILL']]) // le groupe entier
const fallback = []
P.killTree(7, { platform: 'darwin', kill: (pid, sig) => { fallback.push(pid); if (pid < 0) throw new Error('ESRCH') } })
assert.deepEqual(fallback, [-7, 7]) // pas de groupe : le programme seul
let ran = null
P.killTree(9, { platform: 'win32', run: (cmd, args, opts, cb) => { ran = [cmd, args]; cb() } }).then(() => assert.deepEqual(ran, ['taskkill', ['/pid', '9', '/t', '/f']]))
assert.deepEqual(P.spawnOptions('win32'), { windowsHide: true })
assert.deepEqual(P.spawnOptions('linux'), { detached: true })

// --- Obsidian, uv à installer
assert.equal(P.obsidianConfig({ platform: 'win32', env: { APPDATA: 'C:\\A' }, home: 'C:\\Users\\a' }), 'C:\\A\\obsidian\\obsidian.json')
assert.equal(P.obsidianConfig({ platform: 'darwin', env: {}, home: '/Users/a' }), '/Users/a/Library/Application Support/obsidian/obsidian.json')
assert.equal(P.obsidianConfig({ platform: 'linux', env: {}, home: '/home/a' }), '/home/a/.config/obsidian/obsidian.json')
assert.equal(P.obsidianConfig({ platform: 'linux', env: { XDG_CONFIG_HOME: '/cfg' }, home: '/home/a' }), '/cfg/obsidian/obsidian.json')
assert.match(P.uvInstallHint('win32'), /winget/)
assert.match(P.uvInstallHint('darwin'), /brew/)
assert.match(P.uvInstallHint('linux'), /astral\.sh/)

console.log('platform : tous les tests passent')

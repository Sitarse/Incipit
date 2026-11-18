const { BrowserWindow, ipcMain } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const ai = require('./ai')
const readConfig = require('../app/config')

// Le tuteur du lecteur de cours (le tiroir « Tuteur » à droite d'un chapitre) : tu lui poses une question sur la page
// ouverte ou sur un passage surligné, il répond en direct. C'est ce que Hito faisait dans Hitodama ; ici, sans Hito :
// Claude Code (ton abonnement, Haiku) si tu l'as installé, sinon Gemini avec ta clé (Réglages).
// Le lecteur (lecteur.js) y enregistre sa fenêtre : c'est elle qui reçoit les réponses.
const VIEWERS = new Set()

const platform = require('../app/platform')
const BIN = platform.findClaude()
const SYSTEM = 'Tu es le tuteur d’un étudiant qui lit son cours dans Incipit. Tu réponds en français, au tutoiement, de façon claire, concrète et courte (quelques phrases ou une courte liste), en t’appuyant sur la page qu’il lit. Tu peux utiliser des listes à puces. Si on te demande de le tester, pose une seule question, attends sa réponse, puis corrige-le. Tu n’inventes pas ce que le cours ne dit pas : tu le dis.'
const TURN_MS = 3 * 60e3

function start({ configPath }) {
  let seq = 0, current = null
  const send = data => { for (const w of VIEWERS) if (!w.isDestroyed()) w.webContents.send('companion', data) }

  // Claude Code, une demande à la fois : le texte arrive en morceaux (flux JSON), sans outils ni réglages de l'utilisateur
  function viaClaude(prompt, onText, ac) {
    return new Promise((resolve, reject) => {
      if (!BIN) return reject(new Error('Claude Code est introuvable.'))
      const c = spawn(BIN, ['-p', '--safe-mode', '--setting-sources', 'project', '--model', 'haiku', '--effort', 'low', '--system-prompt', SYSTEM,
        '--tools', '', '--permission-prompts', 'none', '--no-session-persistence', '--output-format', 'stream-json', '--include-partial-messages', '--verbose'],
      { cwd: os.tmpdir(), ...platform.spawnOptions(), stdio: ['pipe', 'pipe', 'pipe'] })
      let out = '', text = '', err = ''
      const kill = () => { if (c.pid) platform.killTree(c.pid) }
      ac.signal.addEventListener('abort', kill)
      const timer = setTimeout(() => { kill(); reject(new Error('Claude met trop de temps à répondre.')) }, TURN_MS)
      c.stdout.setEncoding('utf8')
      c.stdout.on('data', chunk => {
        out += chunk
        for (let nl; (nl = out.indexOf('\n')) >= 0;) {
          const line = out.slice(0, nl)
          out = out.slice(nl + 1)
          let o
          try { o = JSON.parse(line) } catch { continue }
          const d = o.event?.delta
          if (d?.type === 'text_delta') { text += d.text; onText(d.text) }
          else if (o.type === 'result' && (o.is_error || o.subtype !== 'success')) err = String(o.result ?? '').slice(0, 200)
        }
      })
      c.stderr.on('data', d => { err = (err + d).slice(-300) })
      c.on('error', e => { clearTimeout(timer); reject(e) })
      c.on('close', () => { clearTimeout(timer); ac.signal.aborted ? reject(new Error('Annulé.')) : text.trim() ? resolve(text) : reject(new Error(err.trim() || 'Claude n’a rien répondu.')) })
      c.stdin.on('error', () => {})
      c.stdin.end(prompt)
    })
  }

  async function run(question, context) {
    const id = ++seq, ac = new AbortController()
    current = { cancel: () => ac.abort() }
    send({ type: 'start', id, text: question })
    const prompt = `${context ? `${context}\n\n` : ''}Question de l'étudiant : ${question}`.slice(0, 8000)
    const onText = part => send({ type: 'delta', id, text: part })
    try {
      let text
      try { text = await viaClaude(prompt, onText, ac) } catch (err) {
        if (ac.signal.aborted) throw err
        // Pas de Claude Code (ou limite atteinte) : Gemini, si la clé est là
        if (!ai.splitKeys(readConfig(configPath).ai?.key).length) throw new Error(`${err.message} Installe Claude Code, ou ajoute une clé Gemini dans les réglages des cours.`)
        send({ type: 'status', id, text: 'Je passe par Gemini…' })
        text = await ai.stream(configPath, { system: SYSTEM, contents: [{ role: 'user', parts: [{ text: prompt }] }] }, onText, ac.signal)
      }
      send({ type: 'done', id, text })
    } catch (err) {
      send(ac.signal.aborted ? { type: 'done', id, cancelled: true } : { type: 'done', id, error: err.message })
    } finally { current = null }
  }

  ipcMain.handle('companion-ask', (e, text, ctx) => {
    if (!BrowserWindow.fromWebContents(e.sender) || !VIEWERS.has(BrowserWindow.fromWebContents(e.sender))) return false
    if (typeof text !== 'string' || !text.trim() || text.length > 4000) return false
    run(text.trim(), typeof ctx?.module?.text === 'string' ? ctx.module.text.slice(0, 3000) : '')
    return true
  })
  ipcMain.on('companion-cancel', () => current?.cancel())
}

module.exports = { VIEWERS, start }

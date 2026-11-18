const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

// Incipit : tes photos de cours, PDF de diapos et notes deviennent un cours rédigé. Une appli à part entière : cette
// fenêtre, le module Cours (src/modules/cours : sa partie Node, le moteur Python lancé par uv, le lecteur) et le tuteur du
// lecteur (src/ai/companion.js). Tes données : %APPDATA%\Incipit (réglages, clés chiffrées, brouillons, journal) ;
// les cours eux-mêmes vont dans Documents\Cours, ou le dossier que tu choisis.
app.setName('Incipit')
const platform = require('./app/platform')
// macOS et Linux : une appli lancée du Finder ou d'un lanceur de bureau n'a pas le PATH du terminal (Homebrew, uv, Claude Code
// y seraient introuvables) : on y ajoute les dossiers où ils s'installent
if (!platform.IS_WIN) process.env.PATH = platform.pathWith()
// Linux : l'AppImage ne peut pas installer le bac à sable de Chromium (et Ubuntu 24.04 interdit celui des utilisateurs) :
// sans ce réglage il refuse de démarrer. INCIPIT_NO_SANDBOX=1 : même chose à la main (l'intégration continue, les conteneurs)
if (process.platform === 'linux' && (process.env.APPIMAGE || process.env.INCIPIT_NO_SANDBOX)) app.commandLine.appendSwitch('no-sandbox')
// INCIPIT_DATA : un autre dossier de données (les essais, pour ne pas toucher aux tiennes)
if (process.env.INCIPIT_DATA) app.setPath('userData', path.resolve(process.env.INCIPIT_DATA))
const SMOKE = process.env.INCIPIT_SMOKE // essai de démarrage : dossier où poser une capture, puis quitter

let win = null

function createWindow() {
  const configPath = path.join(app.getPath('userData'), 'config.json')
  const readConfig = require('./app/config')
  win = new BrowserWindow({
    width: 1240, height: 800, minWidth: 980, minHeight: 640, show: !SMOKE, backgroundColor: '#0B0B0C', title: 'Incipit',
    icon: path.join(__dirname, '..', 'assets', platform.IS_WIN ? 'icon.ico' : 'logo.png'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'renderer', 'preload.js'), ...(SMOKE ? { offscreen: true } : {}) },
  })
  // macOS : sans menu, ni copier-coller ni Cmd+Q ; un menu minimal. Windows et Linux : pas de barre de menu
  Menu.setApplicationMenu(platform.IS_MAC ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null)
  if (!platform.IS_MAC) win.removeMenu()
  // Un lien (une source citée, un site) part dans le navigateur, jamais dans cette fenêtre
  const external = url => /^https?:\/\//i.test(url) && shell.openExternal(url)
  win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' } })
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); external(url) } })

  // Ce que le module Cours attend de son hôte : handle(canal, fn), send(canal, donnée), le fichier de réglages et la fenêtre
  const mine = e => !win.isDestroyed() && e.sender === win.webContents
  const ns = c => `mod:cours:${c}`
  require('./modules/cours/main')({
    handle: (c, fn) => ipcMain.handle(ns(c), (e, ...a) => mine(e) ? fn(...a) : null),
    send: (c, data) => !win.isDestroyed() && win.webContents.send(ns(c), data),
    configPath, readConfig, win,
  })
  require('./ai/companion').start({ configPath })
  ipcMain.on('open-url', (e, url) => mine(e) && typeof url === 'string' && /^https:\/\/\S+$/i.test(url) && shell.openExternal(url))
  ipcMain.on('sound', () => {}) // les alertes de série sonnaient dans Hitodama ; ici, un bandeau suffit

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  if (SMOKE) {
    // Essai : la page chargée, on attend qu'elle se dessine, on note les erreurs de la console, on prend une capture
    const errors = []
    win.webContents.on('console-message', (_, level, message, line, source) => { if (level >= 2) errors.push(`${path.basename(source)}:${line} ${message}`) })
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      fs.mkdirSync(SMOKE, { recursive: true })
      const probe = await win.webContents.executeJavaScript(`JSON.stringify({ cn: !!document.querySelector('.cn'), today: document.querySelector('.cn-today')?.innerText.length ?? 0,
        right: document.querySelector('.cn-right')?.innerText.length ?? 0, api: typeof window.api })`)
      fs.writeFileSync(path.join(SMOKE, 'etat.json'), JSON.stringify({ probe: JSON.parse(probe), errors }, null, 2))
      fs.writeFileSync(path.join(SMOKE, 'ecran.png'), (await win.webContents.capturePage()).toPNG())
      if (process.env.INCIPIT_SMOKE_MENU) {
        // Le choix du moteur et du modèle dans la colonne de gauche : ouvert, un autre moteur, puis un modèle de celui-là
        const click = sel => win.webContents.executeJavaScript(`(() => { const b = document.querySelector('${sel}'); b?.click(); return !!b })()`)
        const wait = ms => new Promise(r => setTimeout(r, ms))
        const shot = async name => fs.writeFileSync(path.join(SMOKE, name), (await win.webContents.capturePage()).toPNG())
        const steps = [['menu', '[data-cn=menu]'], ['moteur', '[data-cn=set][data-k=moteur][data-v=gemini-pro]'], ['modele', '[data-cn=set][data-k=geminiProModel][data-v=gemini-4-argon]']]
        fs.writeFileSync(path.join(SMOKE, 'menu.txt'), '')
        for (const [name, sel] of steps) { fs.appendFileSync(path.join(SMOKE, 'menu.txt'), `${name} ${await click(sel)}\n`); await wait(700); await shot(`menu-${name}.png`) }
        const choix = await win.webContents.executeJavaScript(`document.querySelector('.cn-quick-btn b')?.textContent`)
        fs.appendFileSync(path.join(SMOKE, 'menu.txt'), `choix : ${choix}\n`)
      }
      if (process.env.INCIPIT_SMOKE_REGLAGES) {
        // Les réglages des cours, le volet « Avancé » ouvert (clés NVIDIA et Gemini)
        const click = sel => win.webContents.executeJavaScript(`(() => { const b = document.querySelector('${sel}'); b?.click(); return !!b })()`)
        fs.writeFileSync(path.join(SMOKE, 'clics.txt'), `settings ${await click('[data-cn=settings]')}`)
        await new Promise(r => setTimeout(r, 600))
        fs.appendFileSync(path.join(SMOKE, 'clics.txt'), `\nadv ${await click('[data-cn=adv]')}`)
        // INCIPIT_SMOKE_MOTEUR=openrouter : le moteur choisi avant la capture (son modèle s'affiche sous « Qui écrit »)
        if (process.env.INCIPIT_SMOKE_MOTEUR) {
          await new Promise(r => setTimeout(r, 400))
          fs.appendFileSync(path.join(SMOKE, 'clics.txt'), `\nmoteur ${await click(`[data-cn=set][data-k=moteur][data-v=${process.env.INCIPIT_SMOKE_MOTEUR}]`)}`)
          await new Promise(r => setTimeout(r, 600))
        }
        await new Promise(r => setTimeout(r, 600))
        fs.writeFileSync(path.join(SMOKE, 'reglages.png'), (await win.webContents.capturePage()).toPNG())
      }
      if (!process.env.INCIPIT_SMOKE_LECTEUR) return app.exit(0)
      // Le lecteur : le premier cours de la bibliothèque s'ouvre dans sa grande fenêtre ; on attend qu'il se dessine
      await win.webContents.executeJavaScript(`window.api.mod().invoke('library').then(l => window.api.mod().invoke('open', 'lire', l.courses[0].path))`)
      setTimeout(async () => {
        const reader = BrowserWindow.getAllWindows().find(w => w !== win)
        if (!reader) { fs.writeFileSync(path.join(SMOKE, 'lecteur.txt'), 'aucune fenêtre de lecteur'); return app.exit(1) }
        const errs = []
        fs.writeFileSync(path.join(SMOKE, 'lecteur.png'), (await reader.webContents.capturePage()).toPNG())
        // Le tuteur (un seul tout petit appel à Claude) : la réponse qui arrive dans le lecteur, ou son erreur
        if (process.env.INCIPIT_SMOKE_TUTEUR) {
          const r = await reader.webContents.executeJavaScript(`new Promise(res => { let t = ''; window.lecteur.onHito(d => { if (d.type === 'delta') t += d.text; if (d.type === 'done') res(JSON.stringify({ text: d.text || t, error: d.error })) });
            window.lecteur.ask('Réponds juste « bonjour ».', { module: { text: 'Test.' } }) })`)
          errs.push(`tuteur : ${r}`)
        }
        fs.writeFileSync(path.join(SMOKE, 'lecteur.txt'), `${reader.getTitle()}\n${errs.join('\n')}`)
        app.exit(0)
      }, 20000)
    }, 3500))
  }
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  // Relancé alors qu'il tourne déjà (le lanceur Incipit.exe) : sa fenêtre revient devant
  app.on('second-instance', () => { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus() } })
  app.whenReady().then(() => {
    if (platform.IS_MAC) app.dock?.setIcon(path.join(__dirname, '..', 'assets', 'logo.png')) // lancé sans paquet .app (npm start)
    createWindow()
  })
  app.on('window-all-closed', () => app.quit())
}

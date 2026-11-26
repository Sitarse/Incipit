const { contextBridge, ipcRenderer } = require('electron')

// Le lecteur de cours (lecteur.html) : ses demandes à lecteur.js, et le tuteur (mêmes canaux que le panneau)
contextBridge.exposeInMainWorld('lecteur', {
  call: (op, arg) => ipcRenderer.invoke('lecteur', op, arg),
  // Ce que le panneau sait faire d'un cours (main.js : TP, cartes, sources, générer, réécrire…), demandé depuis le site
  mod: (channel, ...args) => ipcRenderer.invoke('lecteur', 'mod', { channel, args }),
  onRun: fn => ipcRenderer.on('lecteur-run', (_, r) => fn(r)),
  onOpen: fn => ipcRenderer.on('lecteur-open', (_, p, chap) => fn(p, chap)),
  // L'IDE : lancer, pas à pas, installer (lecteur.js → ide.js) ; la console arrive par onIde
  ide: a => ipcRenderer.invoke('lecteur', 'ide', a),
  onIde: fn => ipcRenderer.on('lecteur-ide', (_, d) => fn(d)),
  ask: (text, ctx) => ipcRenderer.invoke('companion-ask', text, ctx, false),
  cancel: () => ipcRenderer.send('companion-cancel'),
  onHito: fn => ipcRenderer.on('companion', (_, d) => fn(d)),
})

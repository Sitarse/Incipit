const { contextBridge, ipcRenderer, webUtils } = require('electron')

// Ce que la page d'Incipit peut demander à l'appli : les canaux du module Cours (mod:cours:…), le chemin d'un fichier
// lâché sur la fenêtre, les liens https. Rien d'autre.
const channel = c => { if (!/^[\w-]{1,40}$/.test(c)) throw new Error('Canal invalide'); return `mod:cours:${c}` }
contextBridge.exposeInMainWorld('api', {
  mod: () => ({
    send: (c, ...a) => ipcRenderer.send(channel(c), ...a),
    invoke: (c, ...a) => ipcRenderer.invoke(channel(c), ...a),
    on: (c, cb) => ipcRenderer.on(channel(c), (_, data) => cb(data)),
  }),
  filePath: file => webUtils.getPathForFile(file),
  openUrl: url => ipcRenderer.send('open-url', url),
  sound: kind => ipcRenderer.send('sound', kind),
})

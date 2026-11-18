const { net } = require('electron')
const { execFile } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

// Cours : KaTeX (formules) et Mermaid (schémas) gardés sur ce PC. md2pdf.py les prend dans ce dossier (INCIPIT_VENDOR)
// plutôt que sur le CDN : sans internet, le PDF d'un cours sortait sans ses formules ni ses schémas. Téléchargés une
// fois, en arrière-plan ; tant qu'ils manquent, le PDF les prend en ligne, comme avant.
const FILES = ['katex/katex.min.css', 'katex/katex.min.js', 'katex/contrib/auto-render.min.js', 'mermaid.min.js']

module.exports = (dir, work) => {
  const ready = () => FILES.every(f => fs.existsSync(path.join(dir, f)))
  async function fetchTo(url, file) {
    const res = await net.fetch(url)
    if (!res.ok) throw new Error(`${url} : ${res.status}`)
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  }
  async function ensure() {
    if (ready()) return
    const tmp = path.join(work, 'vendor-tmp')
    try {
      fs.rmSync(tmp, { recursive: true, force: true })
      fs.mkdirSync(tmp, { recursive: true })
      await fetchTo('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js', path.join(tmp, 'mermaid.min.js'))
      // KaTeX avec ses polices : le paquet npm entier, déballé par le tar de Windows
      const latest = await (await net.fetch('https://registry.npmjs.org/katex/latest')).json()
      if (!/^https:\/\/registry\.npmjs\.org\/katex\/-\/katex-[\d.]+\.tgz$/.test(latest?.dist?.tarball ?? '')) throw new Error('paquet KaTeX introuvable')
      await fetchTo(latest.dist.tarball, path.join(tmp, 'katex.tgz'))
      await new Promise((res, rej) => execFile('tar', ['-xzf', 'katex.tgz', 'package/dist'], { cwd: tmp, windowsHide: true }, err => err ? rej(err) : res()))
      fs.renameSync(path.join(tmp, 'package', 'dist'), path.join(tmp, 'katex'))
      for (const junk of ['package', 'katex.tgz']) fs.rmSync(path.join(tmp, junk), { recursive: true, force: true })
      fs.rmSync(dir, { recursive: true, force: true })
      fs.renameSync(tmp, dir)
    } catch (err) {
      fs.rmSync(tmp, { recursive: true, force: true })
      console.error('Cours (KaTeX, Mermaid) :', err.message)
    }
  }
  return { ready, ensure }
}

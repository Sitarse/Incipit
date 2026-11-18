// macOS, après l'emballage (electron-builder : afterPack) : signature « ad hoc » de l'appli. Sans certificat Apple (payant),
// une appli Apple Silicon non signée est refusée (« endommagée ») ; avec une signature ad hoc elle s'ouvre par clic droit →
// Ouvrir la première fois. Ailleurs, ne fait rien.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  console.log(`signature ad hoc : ${app}`)
}

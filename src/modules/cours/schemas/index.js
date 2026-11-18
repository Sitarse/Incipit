// Les schémas pour Node (runner.js, tests) : le cœur et tous les types. Le lecteur charge les mêmes fichiers par des
// balises <script>, dans cet ordre (lecteur.html).
const FILES = ['core', 'icones', 'pile-memoire', 'zones', 'arbres', 'courbes', 'processus', 'graphes', 'uml', 'donnees']
const S = require('./core')
for (const f of FILES.slice(1)) { try { require(`./${f}`) } catch (err) { if (err.code !== 'MODULE_NOT_FOUND' || !String(err.message).includes(`${f}`)) throw err } }
module.exports = Object.assign(S, { FILES })

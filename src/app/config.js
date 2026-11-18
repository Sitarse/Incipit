const { safeStorage } = require('electron')
const fs = require('node:fs')

const PREFIX = 'enc:'
const encrypt = s => PREFIX + safeStorage.encryptString(s).toString('base64')
// null si illisible (config.json copié sur un autre PC, dossier de données de l'app supprimé…)
const decrypt = s => {
  if (!s?.startsWith(PREFIX)) return s
  try { return safeStorage.decryptString(Buffer.from(s.slice(PREFIX.length), 'base64')) } catch { return null }
}

const raw = file => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}

// Données chiffrées, en plus des liens d'agenda et des mots de passe des boîtes mail : [section, champ]
// (cours.nimKey : la clé NVIDIA du module Cours ; connaissances : les cookies Instagram et la clé ScrapeCreators)
const SECRETS = [['gmail', 'appPassword'], ['notion', 'token'], ['ai', 'key'], ['travel', 'home'], ['cours', 'nimKey'],
  ['cours', 'anthropicKey'], ['cours', 'openaiKey'], ['cours', 'openrouterKey'], ['cours', 'geminiProKey'],
  ['connaissances', 'igSession'], ['connaissances', 'igCsrf'], ['connaissances', 'scrapeKey']]
// Le mot de passe de chaque boîte mail (mail.accounts), passé par f
const mailPasswords = (cfg, f) => Array.isArray(cfg.mail?.accounts)
  ? { ...cfg.mail, accounts: cfg.mail.accounts.map(a => a?.password ? { ...a, password: f(a.password) } : a) } : cfg.mail

// Chiffre les secrets encore en clair
function lock(cfg) {
  if (!safeStorage.isEncryptionAvailable()) return cfg
  const l = v => typeof v === 'string' && v && !v.startsWith(PREFIX) ? encrypt(v) : v
  const out = { ...cfg }
  if (cfg.icalUrls) out.icalUrls = cfg.icalUrls.map(l)
  for (const [a, b] of SECRETS) if (cfg[a]?.[b]) out[a] = { ...out[a], [b]: l(cfg[a][b]) } // out : une section peut en avoir plusieurs
  if (cfg.mail) out.mail = mailPasswords(cfg, l)
  return out
}

// Écriture atomique : un arrêt brutal ne laisse jamais un config.json à moitié écrit
function save(file, cfg) {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(cfg, null, 2) + '\n')
  fs.renameSync(`${file}.tmp`, file)
}

// Lit config.json. Les secrets y sont chiffrés avec DPAPI de Windows : seul ton compte Windows, sur ce PC,
// peut les relire. Collés en clair, ils sont chiffrés sur place au chargement suivant.
function read(file) {
  const cfg = raw(file), locked = lock(cfg)
  if (JSON.stringify(locked) !== JSON.stringify(cfg)) save(file, locked)
  const out = { ...cfg, icalUrls: (cfg.icalUrls ?? []).map(decrypt) }
  for (const [a, b] of SECRETS) out[a] = { ...out[a], [b]: decrypt(cfg[a]?.[b]) }
  if (cfg.mail) out.mail = mailPasswords(cfg, decrypt)
  return out
}

// Modifie config.json : edit reçoit la config brute (secrets encore chiffrés) et la change sur place ;
// les nouveaux secrets en clair sont chiffrés avant l'écriture.
function update(file, edit) {
  const cfg = raw(file)
  edit(cfg)
  save(file, lock(cfg))
}

module.exports = read
module.exports.update = update

const readConfig = require('../app/config')

// Gemini (clé gratuite de Google AI Studio, chiffrée dans config.json -> ai.key).
// NOTCH_AI_BASE ne sert qu'aux tests (faux serveur local).
const BASE = process.env.NOTCH_AI_BASE || 'https://generativelanguage.googleapis.com/v1beta'
const MODELS = ['gemini-flash-latest', 'gemini-3.8-flash'] // le second si le premier n'est pas disponible
// Le modèle choisi dans Réglages (ai.model) passe devant ; les deux d'origine restent en secours s'il n'existe pas
const modelsOf = ai => [...new Set([ai.model, ...MODELS].filter(Boolean))]
// ai.key peut contenir plusieurs clés (une par ligne, ou séparées par des virgules) : la suivante prend le relais quand
// l'une a atteint son quota. Pur : testé dans tests/brain.test.js
const splitKeys = v => typeof v === 'string' ? [...new Set(v.split(/[\s,;]+/).filter(Boolean))] : []
const S = (type, extra = {}) => ({ type, ...extra })

class AiError extends Error {}

function setup(configPath) {
  const { ai } = readConfig(configPath)
  if (ai.key === null) throw new AiError('Clé Gemini chiffrée illisible : recolle-la dans Réglages → IA.')
  const keys = splitKeys(ai.key)
  if (!keys.length) throw new AiError('Ajoute ta clé Gemini gratuite dans Réglages → IA.')
  return { keys, models: modelsOf(ai) }
}
const post = (key, url, body, signal) => fetch(url, { method: 'POST', body: JSON.stringify(body), signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key } })
  .catch(err => { throw signal?.aborted ? err : new AiError('Gemini injoignable : vérifie ta connexion.') })
// Une clé qui ne passe plus (quota, refusée) : on essaie la suivante, sinon on rend l'échec de la dernière
async function call(keys, url, body, signal) {
  let res
  for (const key of keys) {
    res = await post(key, url, body, signal)
    if (!(res.status === 429 || res.status === 403) || key === keys.at(-1)) break
  }
  return res
}
const modelName = configPath => modelsOf(readConfig(configPath).ai)[0]
async function refused(res) {
  const msg = (await res.json().catch(() => ({}))).error?.message ?? ''
  return new AiError(/api key/i.test(msg) || res.status === 403 ? 'Clé Gemini refusée : vérifie-la dans Réglages → IA.'
    : res.status === 429 ? 'Quota gratuit de Gemini atteint pour l’instant : réessaie dans une minute.'
    : `Gemini : ${msg || res.status}`)
}

// parts : [{ text }, { inline_data: { mime_type, data } }] ; schema : réponse JSON attendue (sinon texte) ; signal : pour abandonner
async function ask(configPath, parts, { system, schema, temperature = 0.3, signal } = {}) {
  const { keys, models } = setup(configPath)
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature, ...(schema && { responseMimeType: 'application/json', responseSchema: schema }) },
    ...(system && { systemInstruction: { parts: [{ text: system }] } }),
  }
  for (const model of models) {
    const res = await call(keys, `${BASE}/models/${model}:generateContent`, body, signal)
    if (res.status === 404) continue
    if (!res.ok) throw await refused(res)
    const json = await res.json().catch(() => ({}))
    const text = (json.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('').trim()
    if (!text) throw new AiError('Gemini n’a rien répondu, réessaie.')
    if (!schema) return text
    try { return JSON.parse(text) } catch { throw new AiError('Réponse de Gemini illisible, réessaie.') }
  }
  throw new AiError('Aucun modèle Gemini disponible avec ces clés.')
}

const audio = wav => ({ inline_data: { mime_type: 'audio/wav', data: wav } })

// Dictée : la parole brute devient un texte propre, prêt à coller
const dictate = (configPath, wav) => ask(configPath, [
  { text: 'Transcris ce message dicté. Garde la langue parlée. Supprime les hésitations (euh, ben), les faux départs et les répétitions ; applique les corrections faites à voix haute (« non, plutôt… », « je veux dire… ») ; ponctue correctement. Réponds uniquement avec le texte final, sans guillemets ni commentaire. Si rien n’est dit, réponds par une chaîne vide.' },
  audio(wav),
], { temperature: 0.1 })

// Cliquer ce que l'accessibilité de Windows ne nomme pas (click.js) : l'élément repéré sur la capture d'une fenêtre,
// sa boîte de 0 à 1000 ([haut, gauche, bas, droite], comme Gemini les donne)
const locate = (configPath, png, target) => ask(configPath, [
  { text: `Capture d’une fenêtre de l’ordinateur de l’utilisateur. Il veut cliquer sur : « ${String(target).slice(0, 200)} ». Trouve l’élément cliquable qui correspond (bouton, icône, lien, onglet, case, champ). Réponds en JSON : found (false s’il n’est pas sur la capture), label (son texte, ou ce qu’il représente, en français, quelques mots), box_2d = [ymin, xmin, ymax, xmax] de l’élément, de 0 à 1000.` },
  { inline_data: { mime_type: 'image/png', data: png } },
], { temperature: 0, schema: { type: 'OBJECT', properties: { found: S('BOOLEAN'), label: S('STRING'), box_2d: S('ARRAY', { items: S('INTEGER') }) }, required: ['found', 'label', 'box_2d'] } })

// Question sur une zone de l'écran entourée
const askImage = (configPath, png, question) => ask(configPath, [
  { text: question || 'Explique ce que montre cette partie de mon écran.' },
  { inline_data: { mime_type: 'image/png', data: png } },
], { system: 'Tu réponds en français, au tutoiement, de façon claire et concise (quelques phrases ou une courte liste). Tu peux utiliser **gras** et des listes à puces.' })

// Tri des mails affichés : catégorie, résumé d'une ligne, désabonnement conseillé
const TRIAGE_SCHEMA = S('ARRAY', { items: S('OBJECT', {
  properties: { uid: S('INTEGER'), category: S('STRING', { enum: ['important', 'perso', 'notification', 'newsletter', 'promo'] }), summary: S('STRING'), unsubscribe: S('BOOLEAN') },
  required: ['uid', 'category', 'summary', 'unsubscribe'],
}) })
const triage = (configPath, mails) => ask(configPath, [{ text: `Trie ces mails d'un étudiant. Pour chacun : category (important = fac, administratif, sécurité de compte, message personnel attendant une réponse ; perso = message d'une personne ; notification = info automatique utile ; newsletter ; promo), summary = une ligne de 12 mots maximum en français, unsubscribe = true seulement pour une newsletter ou une promo visiblement inutile.\n\n${mails.map(m => `#${m.uid} | De : ${m.from} | Objet : ${m.subject}\n${m.snippet}`).join('\n\n')}` }],
{ schema: TRIAGE_SCHEMA, temperature: 0.1 })

// Le relais du compagnon quand Claude n'est pas disponible (limite atteinte, plus connecté) : la réponse en flux, qui
// suit le même protocole (contents : la conversation, rôles user et model). onText reçoit chaque morceau.
async function stream(configPath, { system, contents }, onText, signal) {
  const { keys, models } = setup(configPath)
  const body = { contents, systemInstruction: { parts: [{ text: system }] }, generationConfig: { temperature: 0.4 } }
  for (const model of models) {
    const res = await call(keys, `${BASE}/models/${model}:streamGenerateContent?alt=sse`, body, signal)
    if (res.status === 404) continue
    if (!res.ok) throw await refused(res)
    const decoder = new TextDecoder()
    let text = '', rest = ''
    for await (const chunk of res.body) {
      const r = sseParts(rest + decoder.decode(chunk, { stream: true }))
      rest = r.rest
      for (const p of r.parts) { text += p; onText(p) }
    }
    if (!text.trim()) throw new AiError('Gemini n’a rien répondu, réessaie.')
    return text
  }
  throw new AiError('Aucun modèle Gemini disponible avec ces clés.')
}
// Les morceaux de texte des événements SSE complets ; rest : la fin, pas encore complète. Pur : testé dans tests/brain.test.js
function sseParts(buf) {
  const events = buf.split(/\r?\n\r?\n/), rest = events.pop(), parts = []
  for (const ev of events) for (const line of ev.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue
    try { for (const p of JSON.parse(line.slice(5)).candidates?.[0]?.content?.parts ?? []) if (p.text && !p.thought) parts.push(p.text) } catch {}
  }
  return { parts, rest }
}

module.exports = { ask, stream, sseParts, splitKeys, modelName, dictate, askImage, locate, triage, AiError }

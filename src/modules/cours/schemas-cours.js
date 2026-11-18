const fs = require('node:fs')
const path = require('node:path')
const S = require('./schemas')

// Après la rédaction : chaque bloc ```schema du cours devient un dessin (schemas/) rangé à côté du cours, en SVG pour le
// PDF et Obsidian. Dans le .md, le bloc est remplacé par sa description gardée en commentaire (invisible dans Obsidian,
// relue par le lecteur pour le pas à pas et par une réécriture pour la modifier) et le lien de l'image :
//   <!-- schema s-1x2y3z4
//   {"type":"pile",…}
//   -->
//   ![[_img/cours-7/schemas/s-1x2y3z4.svg]]
// Un schéma faux (JSON illisible, type inconnu, élément introuvable) est retiré avec sa légende, et la raison est
// rendue : un mauvais schéma ne s'affiche jamais. Les images que plus rien n'utilise sont effacées.

const FENCE = /^(\s*)(`{3,}|~{3,})\s*([\w-]*)/
const COMMENT = /^<!--\s*schema\s+([\w-]+)\s*$/
const vaultRoot = from => { for (let d = from; ; d = path.dirname(d)) { if (fs.existsSync(path.join(d, '.obsidian'))) return d; if (path.dirname(d) === d) return null } }
// Le JSON d'un commentaire HTML ne doit pas contenir « -- » : - le remplace, JSON.parse le rend tel quel
const commentJson = spec => JSON.stringify(spec).replace(/--/g, '-\\u002d')
const nameOf = spec => `s-${S.hash(JSON.stringify(spec))}`
const caption = l => /^\s*(\*[^*].*\*|_[^_].*_)\s*$/.test(l ?? '')

// md, dossier des images, base des liens -> { md, used: Set(fichiers), drawn, kept, dropped: [{ titre, raison }] }
function transform(md, dir, base, write = (f, svg) => fs.writeFileSync(f, svg)) {
  const lines = String(md).split(/\r?\n/), out = [], used = new Set(), dropped = []
  let drawn = 0, kept = 0
  const link = file => path.relative(base, path.join(dir, file)).split(path.sep).join('/')
  const draw = spec => {
    const name = nameOf(spec), file = `${name}.svg`
    if (!fs.existsSync(path.join(dir, file))) { fs.mkdirSync(dir, { recursive: true }); write(path.join(dir, file), S.render(spec).svg) }
    used.add(file)
    return [`<!-- schema ${name}`, commentJson(spec), '-->', `![[${link(file)}]]`]
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], f = l.match(FENCE)
    if (f && f[3].toLowerCase() === 'schema') { // un bloc écrit par l'IA
      let j = i + 1
      while (j < lines.length && !new RegExp(`^\\s*${f[2][0] === '`' ? '`' : '~'}{${f[2].length},}\\s*$`).test(lines[j])) j++
      const src = lines.slice(i + 1, j).join('\n')
      i = j
      let spec = null, why = ''
      try { spec = S.parse(src); const v = S.validate(spec); if (!v.ok) why = v.errors.slice(0, 3).join(' ; ') } catch (e) { why = e.message }
      if (!why) { try { out.push(...draw(spec)); drawn++; continue } catch (e) { why = e.message } }
      dropped.push({ titre: S.str(spec?.type ?? '?', 30), raison: why })
      if (caption(lines[i + 1])) i++ // sa légende part avec lui
      continue
    }
    if (f) { // un autre bloc de code : recopié tel quel, y compris un faux commentaire dedans
      let j = i + 1
      while (j < lines.length && !lines[j].trim().startsWith(f[2])) j++
      out.push(...lines.slice(i, j + 1)); i = j
      continue
    }
    const c = l.match(COMMENT)
    if (c) { // un schéma déjà dessiné : son image existe-t-elle encore, et suit-elle bien ?
      let j = i + 1
      while (j < lines.length && lines[j].trim() !== '-->') j++
      const src = lines.slice(i + 1, j).join('\n'), next = lines[j + 1] ?? ''
      let spec = null
      try { spec = S.parse(src); if (!S.validate(spec).ok) spec = null } catch { spec = null }
      if (!spec) { out.push(...lines.slice(i, j + 1)); i = j; continue } // modifié à la main et cassé : on n'y touche pas
      out.push(...draw(spec)); kept++
      i = /^!\[\[[^\]]*schemas\/s-[\w]+\.svg[^\]]*\]\]\s*$/.test(next.trim()) ? j + 1 : j
      continue
    }
    out.push(l)
  }
  // les fins de ligne du fichier sont gardées (le moteur écrit en CRLF sous Windows)
  return { md: out.join(/\r\n/.test(md) ? '\r\n' : '\n'), used, drawn, kept, dropped }
}

// Le cours sur disque : dessine, réécrit le .md s'il a changé, efface les images orphelines
function apply(course, titreDuCours, lib) {
  const dir = path.join(lib.imagesDir(course, titreDuCours), 'schemas')
  const base = vaultRoot(path.dirname(course)) ?? path.dirname(course)
  const before = fs.readFileSync(course, 'utf8')
  const r = transform(before, dir, base)
  if (r.md !== before) { fs.writeFileSync(`${course}.tmp`, r.md); fs.renameSync(`${course}.tmp`, course) }
  try { for (const f of fs.readdirSync(dir)) if (/^s-[\w]+\.svg$/.test(f) && !r.used.has(f)) fs.rmSync(path.join(dir, f), { force: true }) } catch {}
  return { drawn: r.drawn, kept: r.kept, dropped: r.dropped }
}

// Les descriptions gardées dans un cours (le lecteur) : { nom de l'image : spec }
function specsOf(md) {
  const out = {}, re = /^<!--\s*schema\s+([\w-]+)\s*\r?\n([\s\S]*?)\r?\n-->/gm
  for (const m of String(md).matchAll(re)) { try { out[m[1]] = S.parse(m[2]) } catch {} }
  return out
}

module.exports = { transform, apply, specsOf, nameOf, commentJson }

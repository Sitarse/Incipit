// Les schémas Mermaid des anciens cours : l'IA y écrivait des libellés avec des parenthèses, des crochets ou des accolades
// (« Individus(n lignes) », « films[] », « {{1},{2}} ») que Mermaid refuse tant qu'ils ne sont pas entre guillemets. Ce module
// les met tous entre guillemets : il lit chaque nœud (identifiant, forme, libellé) en comptant les parenthèses ouvertes et
// fermées du libellé, ce qu'une expression régulière ne sait pas faire. Pur : testé dans tests/mermaid-fix.test.js ; la
// page du lecteur le charge aussi (window.MermaidFix), lecteur-ui.js l'utilise avant de dessiner.
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.MermaidFix = factory()
})(typeof self !== 'undefined' ? self : this, function () {
  // [ouverture, fermeture] des formes d'un nœud, les plus longues d'abord (« (( » avant « ( »)
  const SHAPES = [['(((', ')))'], ['((', '))'], ['([', '])'], ['[[', ']]'], ['[(', ')]'], ['{{', '}}'], ['[/', '/]'], ['[\\', '\\]'], ['[/', '\\]'], ['[\\', '/]'], ['[', ']'], ['(', ')'], ['{', '}'], ['>', ']']]
  const OPEN = '([{', CLOSE = ')]}'
  const SKIP = /^\s*(?:%%|style\b|classDef\b|class\b|linkStyle\b|click\b|direction\b|subgraph\b|end\b|accTitle|accDescr|title\b)/i
  const DIAGRAM = /^\s*(?:flowchart|graph)\b/i

  // Où finit le libellé qui commence en i : la fermeture de la forme, hors des parenthèses du libellé lui-même
  function labelEnd(s, i, close) {
    let depth = 0
    for (let j = i; j < s.length; j++) {
      if (s[j] === '\n') return -1 // un libellé tient sur une ligne
      if (depth === 0 && s.startsWith(close, j)) return j
      if (OPEN.includes(s[j])) depth++
      else if (CLOSE.includes(s[j]) && depth > 0) depth--
    }
    return -1
  }
  const quote = t => `"${t.replace(/"/g, "'").replace(/\\n/g, '<br>')}"`

  function fixLine(line) {
    if (SKIP.test(line) && !/^\s*subgraph\b/i.test(line)) return line
    let out = '', i = 0
    while (i < line.length) {
      const m = /^[A-Za-z_][\w-]*/.exec(line.slice(i))
      const prev = line[i - 1]
      if (m && !(prev && /[\w"']/.test(prev))) {
        out += m[0]; i += m[0].length
        // l'identifiant est suivi d'une forme : on lit son libellé
        const shape = SHAPES.find(([o]) => line.startsWith(o, i))
        if (!shape || (shape[0] === '>' && !/^>[^>\s]/.test(line.slice(i)))) continue
        const [o, c] = shape, start = i + o.length, end = labelEnd(line, start, c)
        if (end < 0) continue
        const label = line.slice(start, end)
        out += o + (/^\s*"/.test(label) ? label : quote(label)) + c
        i = end + c.length
        continue
      }
      // le texte d'un lien « -- texte --> » : entre guillemets lui aussi s'il a des signes qui gênent
      const e = /^(--|==|-\.)\s+([^"|>\n]*?[()[\]{}][^"|>\n]*?)\s+(-->|==>|-\.->|---)/.exec(line.slice(i))
      if (e) { out += `${e[1]} ${quote(e[2])} ${e[3]}`; i += e[0].length; continue }
      out += line[i++]
    }
    return out
  }

  // Les couleurs écrites par l'IA (« style A fill:#f9f », « classDef ») : des fonds pastel que le texte clair du thème sombre
  // rend illisibles. Le thème du lecteur choisit les couleurs : ces lignes partent.
  const COLORS = /^\s*(?:style|classDef|linkStyle)\b/i

  // Un schéma Mermaid réparé ; les autres types de diagramme (séquence, classes…) ne sont pas touchés
  function fix(src) {
    const text = String(src ?? '')
    const lines = text.split('\n')
    const head = lines.findIndex(l => l.trim() && !/^\s*%%/.test(l))
    if (head < 0 || !DIAGRAM.test(lines[head])) return text
    return lines.filter((l, k) => k <= head || !COLORS.test(l)).map((l, k) => (k <= head ? l : fixLine(l))).join('\n')
  }
  return { fix }
})

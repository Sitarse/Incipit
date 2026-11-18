// La réparation des anciens schémas Mermaid (modules/cours/mermaid-fix.js) : chaque libellé entre guillemets, les
// parenthèses, crochets et accolades du libellé comptés, ce qui est déjà correct intact. Que Mermaid accepte le résultat
// est vérifié dans l'appli (les 34 blocs des cours) ; ici, la forme du texte.
const assert = require('node:assert/strict')
const { fix } = require('../src/modules/cours/mermaid-fix')

const eq = (src, want) => assert.equal(fix(src), want, `\n${src}`)
// 1. Les cas des vrais cours
eq('flowchart LR\n  A[Individus(n lignes)] --> B[Tableau x(j,i)]', 'flowchart LR\n  A["Individus(n lignes)"] --> B["Tableau x(j,i)"]')
eq('flowchart LR\n  A[App.jsx\\nÉtat: films[], search] --> B[Liste]', 'flowchart LR\n  A["App.jsx<br>État: films[], search"] --> B["Liste"]')
eq('flowchart TD\n  A[Individus isolés\\nP₀ = {{1},{2},{3}}] --> B[Fin]', 'flowchart TD\n  A["Individus isolés<br>P₀ = {{1},{2},{3}}"] --> B["Fin"]')
eq('flowchart LR\n  C --> D[(movies.json\\nFichier local)]', 'flowchart LR\n  C --> D[("movies.json<br>Fichier local")]')
eq('flowchart TD\n  D{Centres stables ?}\n  D -- Non --> B', 'flowchart TD\n  D{"Centres stables ?"}\n  D -- Non --> B')
eq('flowchart LR\n  B -- Oui (p = 0,9) --> C[Compteur +1]', 'flowchart LR\n  B -- "Oui (p = 0,9)" --> C["Compteur +1"]')
eq('flowchart LR\n  A((Début)) --> B([Fin])', 'flowchart LR\n  A(("Début")) --> B(["Fin"])')
// 2. Les couleurs pastel du cours partent (le thème choisit), le reste ne bouge pas
eq('flowchart TD\n  A[x] --> B[y]\n  style A fill:#f9f,stroke:#333\n  classDef c fill:#bbf\n  linkStyle 0 stroke:red', 'flowchart TD\n  A["x"] --> B["y"]')
const ok = 'flowchart LR\n  subgraph Nav["Frontend (React, port 5173)"]\n    A["déjà"] --> B\n  end'
eq(ok, ok)
const seq = 'sequenceDiagram\n  A->>B: salut(x)'
eq(seq, seq)
eq('', ''); eq('flowchart LR', 'flowchart LR')
// 3. Un libellé jamais refermé ne plante pas
assert.doesNotThrow(() => fix('flowchart LR\n  A[ouvert --> B'))
// 4. Idempotent : réparer deux fois donne la même chose
const once = fix('flowchart LR\n  A[Individus(n lignes)] --> B[x{y}]')
assert.equal(fix(once), once)
console.log('mermaid-fix : ok')

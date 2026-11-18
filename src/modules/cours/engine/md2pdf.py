#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["markdown-it-py>=3"]
# ///
"""Convertit un cours .md (syntaxe Obsidian) en PDF typographie.

    uv run md2pdf.py "C:\\...\\Cours\\Analyse\\CM - Chapitre 3.md"

Rend les maths (KaTeX), les schemas Mermaid, les callouts Obsidian et les
images ![[...]], le surlignage ==...== et les liens internes cliquables.
Mise en page de manuel, faite pour l'ecran : une colonne etroite, numeros de
titre en marge, encadres sans fond, une seule couleur. L'impression est faite par Chrome, pas de LaTeX a installer.
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path
from urllib.parse import quote

from markdown_it import MarkdownIt

# KaTeX et Mermaid viennent du CDN : sans internet, le PDF sortait sans formules
# ni schemas. INCIPIT_VENDOR : un dossier ou l'appli qui nous lance (Hitodama)
# en garde une copie -- prise en priorite, le CDN reste le repli.
CDN = {
    "katex/katex.min.css": "https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css",
    "katex/katex.min.js": "https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js",
    "katex/contrib/auto-render.min.js":
        "https://cdn.jsdelivr.net/npm/katex@0.16/dist/contrib/auto-render.min.js",
    "mermaid.min.js": "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js",
}


def ressource(nom: str) -> str:
    """L'adresse d'une bibliotheque du rendu : la copie locale si elle existe."""
    if (dossier := os.environ.get("INCIPIT_VENDOR")) and (local := Path(dossier) / nom).is_file():
        return local.resolve().as_uri()
    return CDN[nom]

# Cherches dans l'ordre, apres un which() sur les noms de commande (cf.
# trouver_navigateur) : le PDF sort d'un Chrome/Edge headless, quel que soit
# le systeme.
COMMANDES_NAVIGATEUR = [
    "chrome", "google-chrome", "google-chrome-stable", "chromium",
    "chromium-browser", "msedge", "microsoft-edge",
]
NAVIGATEURS = [
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
    Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    Path("/Applications/Chromium.app/Contents/MacOS/Chromium"),
    Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
    Path("/usr/bin/google-chrome"),
    Path("/usr/bin/chromium"),
    Path("/usr/bin/chromium-browser"),
    Path("/snap/bin/chromium"),
]

# types de callout Obsidian -> classe CSS (tout le reste retombe sur "note")
CALLOUTS = {
    "note": "note", "info": "note", "abstract": "note", "summary": "note",
    "tip": "tip", "hint": "tip", "success": "tip", "check": "tip", "done": "tip",
    "warning": "warn", "caution": "warn", "attention": "warn",
    "danger": "danger", "error": "danger", "bug": "danger", "failure": "danger",
    "question": "quest", "help": "quest", "faq": "quest",
    "example": "ex", "quote": "ex", "cite": "ex",
    # Types propres au cours. Sans eux, `> [!definition]` retombait sur "note"
    # et repartait en bleu generique : le LLM ecrivait la bonne intention, le
    # PDF l'aplatissait.
    "definition": "def", "def": "def", "concept": "def",
    "rappel": "rappel", "recall": "rappel", "prerequis": "rappel",
    "theoreme": "theo", "theorem": "theo", "propriete": "theo",
    "lemme": "theo", "corollaire": "theo", "contraposee": "theo",
    "demonstration": "demo", "demo": "demo", "proof": "demo", "preuve": "demo",
    "loi": "loi", "axiome": "loi", "principe": "loi",
}

EXT_IMG = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg"}

# Marqueur des formules mises de cote. Alphanumerique pur et sans caractere nul :
# CommonMark impose de remplacer U+0000 par U+FFFD, ce qui detruirait le marqueur.
JETON = "zmathz"


# ---------------------------------------------------------------- utilitaires

def trouver_navigateur() -> Path:
    # which() d'abord : c'est le seul moyen de trouver un Chrome installe
    # ailleurs que dans les emplacements connus (Linux surtout).
    for nom in COMMANDES_NAVIGATEUR:
        if trouve := shutil.which(nom):
            return Path(trouve)
    for p in NAVIGATEURS:
        if p.is_file():
            return p
    sys.exit("Ni Chrome ni Edge trouve : impossible de produire le PDF.")


def racine_vault(depart: Path) -> Path | None:
    """Remonte l'arborescence jusqu'au dossier contenant .obsidian."""
    for d in [depart, *depart.parents]:
        if (d / ".obsidian").is_dir():
            return d
    return None


def entete(texte: str) -> tuple[dict[str, str], str]:
    """Separe le frontmatter YAML du corps. Parseur volontairement minimal :
    le frontmatter genere ne contient que des `cle: valeur` a plat."""
    if not texte.startswith("---"):
        return {}, texte
    fin = texte.find("\n---", 3)
    if fin == -1:
        return {}, texte
    meta = {}
    for ligne in texte[3:fin].splitlines():
        if ":" in ligne and not ligne.lstrip().startswith("#"):
            cle, _, val = ligne.partition(":")
            meta[cle.strip()] = val.strip().strip("\"'")
    return meta, texte[fin + 4:].lstrip("\n")


# ------------------------------------------------------------ pre-traitements

def proteger_maths(texte: str) -> tuple[str, list[str]]:
    """Sort les formules du flux Markdown avant conversion.

    Sans ca, `$a_1 + b_2$` voit ses underscores manges par l'italique Markdown.
    On remet les formules telles quelles dans le HTML, KaTeX fait le reste.
    """
    gardees: list[str] = []

    def remplacer(m: re.Match) -> str:
        gardees.append(m.group(0))
        return f"{JETON}{len(gardees) - 1}z"

    # blocs $$...$$ d'abord, sinon le motif en ligne les decoupe
    texte = re.sub(r"\$\$.+?\$\$", remplacer, texte, flags=re.S)
    texte = re.sub(r"(?<!\\)\$(?!\s)(?:[^$\n]|\\\$)+?(?<!\s)\$", remplacer, texte)
    return texte, gardees


def restaurer_maths(html: str, gardees: list[str]) -> str:
    for i, formule in enumerate(gardees):
        html = html.replace(f"{JETON}{i}z", formule)
    return html


def convertir_callouts(texte: str) -> str:
    """`> [!note] Titre` + lignes `>` -> <div class="callout ...">.

    Les lignes vides autour du contenu sont indispensables : elles ferment le
    bloc HTML pour que Markdown continue de traiter l'interieur.
    """
    sortie: list[str] = []
    lignes = texte.splitlines()
    i = 0
    while i < len(lignes):
        m = re.match(r"^>\s*\[!(\w+)\]([+-]?)\s*(.*)$", lignes[i])
        if not m:
            sortie.append(lignes[i])
            i += 1
            continue
        # group(2) est le `+`/`-` de pliage d'Obsidian : sans interet sur un PDF,
        # ou tout est deja deplie. Capture quand meme pour ne pas le laisser
        # deborder dans le titre.
        genre, titre = m.group(1).lower(), m.group(3).strip()
        classe = CALLOUTS.get(genre, "note")
        i += 1
        corps: list[str] = []
        while i < len(lignes) and lignes[i].startswith(">"):
            corps.append(re.sub(r"^>\s?", "", lignes[i]))
            i += 1
        sortie += [f'<div class="callout c-{classe}">',
                   f'<div class="callout-titre">{titre or genre.capitalize()}</div>',
                   "", *corps, "", "</div>", ""]
    return "\n".join(sortie)


def resoudre_images(texte: str, source: Path) -> str:
    """`![[image.png]]` et `![[image.png|400]]` -> <img> pointant sur le fichier.

    Chrome charge le HTML depuis un dossier temporaire : il faut des chemins
    absolus en file:// pour que les images s'affichent.
    """
    racine = racine_vault(source)

    def cible(nom: str) -> Path | None:
        for base in filter(None, (racine, source.parent)):
            direct = base / nom
            if direct.is_file():
                return direct
        # lien court (`![[photo.jpg]]`) : on cherche le fichier par son nom
        for base in (racine, source.parent):
            if base:
                for trouve in base.rglob(Path(nom).name):
                    if trouve.is_file():
                        return trouve
        return None

    def remplacer(m: re.Match) -> str:
        nom, _, largeur = m.group(1).partition("|")
        nom = nom.strip()
        chemin = cible(nom)
        if not chemin:
            return f'<span class="manquant">[image introuvable : {nom}]</span>'
        if chemin.suffix.lower() not in EXT_IMG:  # ex. un PDF joint
            return f'<span class="manquant">[{chemin.name}]</span>'
        url = "file:///" + quote(str(chemin).replace("\\", "/"))
        style = f' style="max-width:{largeur.strip()}px"' if largeur.strip().isdigit() else ""
        # la ligne vide ferme le bloc HTML : sinon la legende ecrite juste
        # dessous resterait du texte brut, etoiles comprises
        return f'<figure><img src="{url}"{style} alt=""></figure>\n'

    texte = re.sub(r"!\[\[([^\]]+)\]\]", remplacer, texte)
    # liens internes Obsidian [[#heading|texte]] -> ancres HTML cliquables
    titres = _titres(texte)
    vocab = termes_vocabulaire(texte)
    deja: set[str] = set()   # porte l'ancre de retour d'une pastille a l'autre
    texte = re.sub(r"(?<!!)(\*{0,2})\[\[#?([^\]|]+)(?:\|([^\]]+))?\]\]\1",
                  lambda m: _lien_interne(m.group(1), m.group(2), m.group(3),
                                          titres, vocab, deja),
                  texte)
    # liens Markdown standards [texte](#heading) -> ancres HTML cliquables (Gemini, etc.)
    return re.sub(r"(?<!!)(\*{0,2})\[([^\]]+)\]\(#([^\)]+)\)\1",
                  lambda m: _lien_interne(m.group(1), m.group(3), m.group(2),
                                          titres, vocab, deja),
                  texte)


def _slug_heading(titre: str) -> str:
    """Transforme un titre en ancre compatible HTML (même logique que markdown-it)."""
    import unicodedata
    s = unicodedata.normalize("NFKD", titre).encode("ascii", "ignore").decode()
    s = re.sub(r"[^\w\s-]", "", s).strip().lower()
    return re.sub(r"[\s_]+", "-", s) or "section"


def _titres(texte: str) -> list[str]:
    """Les ancres reellement presentes dans le document."""
    return [_slug_heading(m.group(1))
            for m in re.finditer(r"^#{1,4}\s+(.+?)\s*$", texte, flags=re.M)]


def _ancre(cible: str, titres: list[str]) -> str:
    """Le slug du titre vise. Un lien vers « Vocabulaire a retenir » doit
    continuer de tomber juste quand le titre s'appelle « 9. Vocabulaire a
    retenir » : sinon le clic ne fait rien, ce qui est pire qu'un lien absent."""
    s = _slug_heading(cible)
    if s in titres:
        return s
    return next((t for t in titres if t.endswith("-" + s)), s)


def termes_vocabulaire(texte: str) -> set[str]:
    """Les slugs des termes de la 1re colonne du tableau « Vocabulaire a retenir ».

    Sert a faire tomber le clic sur la LIGNE du mot plutot qu'en tete de
    section : autrement le lecteur atterrit sur la premiere page du tableau et
    doit chercher son terme a la main, ce qui vide le lien de son interet.
    """
    m = re.search(r"^#{1,4}\s+[^\n]*vocabulaire[^\n]*$", texte, flags=re.M | re.I)
    if not m:
        return set()
    bloc = texte[m.end():]
    suite = re.search(r"^#{1,4}\s+", bloc, flags=re.M)
    if suite:
        bloc = bloc[:suite.start()]
    lignes = [l.strip() for l in bloc.splitlines() if l.strip().startswith("|")]
    sep = next((i for i, l in enumerate(lignes)
                if set(l.replace("|", "").strip()) <= set("-: ")), None)
    if sep is None:
        return set()
    slugs = set()
    for ligne in lignes[sep + 1:]:
        terme = _texte_terme(re.split(r"(?<!\\)\|", ligne)[1:-1] or [""])
        if terme:
            slugs.add(_slug_heading(terme))
    return slugs


def _texte_terme(cellules: list[str]) -> str:
    """Le mot affiche dans la 1re cellule du tableau de vocabulaire.

    Cette cellule est en general un lien retour vers la partie ou le terme est
    introduit : c'est le libelle qu'il faut retenir, pas la cible du lien.
    """
    c = re.sub(r"[*`]", "", cellules[0] if cellules else "").strip()
    lien = re.fullmatch(r"\[\[[^\]]*?\\?\|([^\]]+)\]\]", c)
    return (lien.group(1) if lien else c).strip()


def _lien_interne(gras: str, cible: str, texte: str | None,
                  titres: list[str] | None = None,
                  vocab: set[str] | None = None,
                  deja: set[str] | None = None) -> str:
    """[[#heading|texte]] -> <a href="#slug" class="lien-interne">texte</a>.

    Vise « voc-<terme> » quand le mot existe dans le tableau de vocabulaire,
    sinon retombe sur l'ancre de la section (un lien approximatif vaut mieux
    qu'un lien mort).

    La premiere pastille d'un terme recoit en plus id="ref-<terme>" : c'est
    l'adresse exacte ou le tableau saura renvoyer le lecteur, sa phrase et non
    le debut de la section. Les pastilles suivantes ne la reprennent pas -- deux
    fois le meme id et le retour tomberait toujours sur la premiere.
    """
    affiche = texte or cible
    contenu = f"{gras}{affiche}{gras}" if gras else affiche
    terme = _slug_heading(re.sub(r"[*`]", "", affiche))
    marque = ""
    if vocab and terme in vocab and "vocabulaire" in _slug_heading(cible):
        ancre = f"voc-{terme}"
        if deja is not None and terme not in deja:
            deja.add(terme)
            marque = f' id="ref-{terme}"'
    else:
        ancre = _ancre(cible, titres or [])
    return f'<a href="#{ancre}"{marque} class="lien-interne">{contenu}</a>'


def ancrer_vocabulaire(html: str, vocab: set[str]) -> str:
    """Pose id="voc-<terme>" sur la cellule de chaque terme du tableau, et y
    ajoute la fleche qui ramene a l'endroit precis d'ou l'on a clique.

    C'est le trajet retour du meme aller : un PDF n'a pas de bouton « page
    precedente », mais chaque terme n'est cliquable qu'une fois dans le corps,
    donc la destination du retour est connue d'avance. La fleche n'est posee que
    si le corps porte vraiment l'ancre -- un terme du tableau jamais lie dans la
    page donnerait sinon une fleche morte.
    """
    if not vocab:
        return html
    revenir = set(re.findall(r'id="ref-([^"]+)"', html))

    def cellule(m: re.Match) -> str:
        # markdown-it pose un style d'alignement sur les td : le motif doit
        # tolerer des attributs, sinon aucune ancre n'est posee.
        slug = _slug_heading(re.sub(r"<[^<]+?>", "", m.group(2)))
        if slug not in vocab:
            return m.group(0)
        fleche = (f'<a href="#ref-{slug}" class="retour" '
                  f'title="Revenir au mot dans le cours">↩</a>'
                  if slug in revenir else "")
        return f'<td{m.group(1)} id="voc-{slug}">{m.group(2)}{fleche}</td>'

    return re.sub(r"<td([^<]*?)>(.*?)</td>", cellule, html, flags=re.S)


def convertir_surlignage(texte: str) -> str:
    """`==texte==` (surlignage Obsidian) -> <mark>, la couleur qui dit « ca, par coeur ».

    Les blocs de code sont sautes : `A ==> B` dans un schema Mermaid n'est pas
    un surlignage, et le convertir casserait le schema.
    """
    dans_bloc = False
    sortie = []
    for ligne in texte.splitlines():
        if ligne.lstrip().startswith("```"):
            dans_bloc = not dans_bloc
        elif not dans_bloc:
            ligne = re.sub(r"==(?![=>\s])(.+?)(?<![\s=])==", r"<mark>\1</mark>", ligne)
        sortie.append(ligne)
    return "\n".join(sortie)


def indenter_parties(html: str) -> str:
    """Isole le corps de chaque partie `##` dans un conteneur `.corps`.

    Purement structurel (aucun style propre) : ca sert de portee au CSS qui
    cible par ex. la premiere colonne du tableau de vocabulaire sans deborder
    sur les sections suivantes, dans un document sans imbrication HTML reelle
    entre un h2 et le prochain.
    """
    morceaux = re.split(r"(?=<h2[ >])", html)
    sortie = []
    for m in morceaux:
        if m.startswith("<h2") and "</h2>" in m:
            fin = m.index("</h2>") + 5
            m = f'{m[:fin]}<div class="corps">{m[fin:]}</div>'
        sortie.append(m)
    return "".join(sortie)


def numeroter(html: str) -> str:
    """Le numero d'un titre (« 2. », « 2.3 ») passe dans un <span class="num"> :
    le CSS le sort dans la marge de gauche, le titre lui-meme reste aligne sur le
    texte. Un titre sans numero n'est pas touche."""
    return re.sub(r'(<h[23]\b[^>]*>\s*)(\d+(?:\.\d+)*)[.)]?\s+(?=\S)',
                  r'\1<span class="num">\2</span>', html)


# ------------------------------------------------------------------ rendu HTML

def en_html(markdown: str) -> str:
    md = MarkdownIt("commonmark", {"html": True, "typographer": True})
    md.enable(["table", "strikethrough", "smartquotes", "replacements"])

    # add_render_rule lie la fonction au renderer : d'ou le `self` en premier
    def fence(self, tokens, idx, options, env):
        tok = tokens[idx]
        langue = (tok.info or "").strip().split()[0] if tok.info.strip() else ""
        if langue == "mermaid":
            return f'<pre class="mermaid">{tok.content}</pre>\n'
        classe = f' class="language-{langue}"' if langue else ""
        contenu = (tok.content.replace("&", "&amp;")
                   .replace("<", "&lt;").replace(">", "&gt;"))
        return f"<pre><code{classe}>{contenu}</code></pre>\n"

    md.add_render_rule("fence", fence)

    # les headings portent un id : les ancres internes [[#...]] y pointent
    def heading_open(self, tokens, idx, options, env):
        tok = tokens[idx]
        niveau = tok.tag  # h1, h2, h3, h4
        # le contenu texte est dans le token suivant (inline)
        contenu = tokens[idx + 1].content if idx + 1 < len(tokens) else ""
        slug = _slug_heading(contenu)
        return f'<{niveau} id="{slug}">\n'

    md.add_render_rule("heading_open", heading_open)
    return md.render(markdown)


CSS = r"""
/* Mise en page « manuel imprime », pensee pour etre lue a l ecran : une colonne
   etroite (70 a 75 signes par ligne), de grandes marges, une police de lecture,
   et presque pas de couleur. Ce qui structure la page, c est la typographie
   (taille, graisse, filets fins, numeros en marge), pas des aplats ni des
   encadres colores.

   Polices presentes d origine sur Windows (Sitka est dessinee pour la lecture a
   l ecran) avec des replis ailleurs : rien n est embarque ni telecharge. */
@page { size: A4; margin: 21mm 27mm 22mm 15mm; }

:root {
  --texte: "Sitka Text", Sitka, Charter, "Bitstream Charter", Cambria, Georgia, serif;
  --titre: "Sitka Heading", "Sitka Text", Sitka, Charter, Cambria, Georgia, serif;
  --sans: "Segoe UI Variable Text", "Segoe UI", Inter, system-ui, "Helvetica Neue", Arial, sans-serif;
  --mono: "Cascadia Mono", "Cascadia Code", Consolas, "DejaVu Sans Mono", monospace;
  --encre: #1b1b1a;         /* le texte : presque noir, moins dur que #000 a l ecran */
  --gris: #6a6a66;          /* legendes, numeros, etiquettes */
  --filet: #d6d5cf;         /* filets fins */
  --accent: #a33a1f;        /* la seule couleur : numeros de partie, pieges, liens */
  --papier: #f6f5f1;        /* fond du code */
}

html { font-size: 11.5pt; }
body {
  font-family: var(--texte); color: var(--encre); background: #fff; margin: 0;
  padding-left: 18mm;      /* la marge ou sortent les numeros de titre (cf. .num) */
  line-height: 1.58; text-align: left; hyphens: none;
  font-variant-numeric: oldstyle-nums proportional-nums;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
p { margin: 0 0 .78em; orphans: 3; widows: 3; }

/* ---- en-tete du cours : a gauche, sans couleur -- matiere, titre, une ligne ---- */
.titre-bloc { margin: 0 0 11mm; padding: 0 0 5mm; border-bottom: .9pt solid var(--encre); }
.titre-bloc .matiere { font-family: var(--sans); font-size: .76rem; font-weight: 600;
                       letter-spacing: .02em; color: var(--gris); margin-bottom: .55em; }
.titre-bloc h1 { font-family: var(--titre); font-size: 2.25rem; font-weight: 600;
                 line-height: 1.14; letter-spacing: -.005em; margin: 0 0 .32em; }
.titre-bloc .meta { font-family: var(--sans); font-size: .76rem; color: var(--gris); }
body > h1 { display: none; }   /* le bloc de titre le porte deja */

/* ---- titres : en serif, noirs ; leur numero sort dans la marge de gauche ---- */
h1, h2, h3, h4 { font-family: var(--titre); color: var(--encre); text-align: left;
                 break-after: avoid; page-break-after: avoid; position: relative;
                 font-variant-numeric: lining-nums; }
h2 { font-size: 1.62rem; font-weight: 600; line-height: 1.2; margin: 2.5em 0 .7em;
     padding-top: .55em; border-top: .6pt solid var(--filet); }
h2:first-of-type { margin-top: 0; border-top: 0; padding-top: 0; }
h3 { font-size: 1.2rem; font-weight: 600; line-height: 1.28; margin: 1.9em 0 .5em; }
h4 { font-family: var(--sans); font-size: .9rem; font-weight: 650; margin: 1.5em 0 .35em; }
.num { position: absolute; right: 100%; margin-right: 4.2mm; white-space: nowrap;
       font-weight: 400; }
h2 .num { color: var(--accent); }
h3 .num { color: var(--gris); font-size: .86em; top: .14em; }

/* conteneur structurel, sans habillage propre : cf. indenter_parties() */
.corps { margin: 0 0 1em; }

/* ---- dans le fil du texte : le gras appuie, l italique nuance, rien ne colore.
   Le surlignage ==...== est un coup de surligneur, comme sur une copie. ---- */
strong { font-weight: 700; }
em { font-style: italic; }
mark { color: inherit; background: linear-gradient(transparent 58%, #ffe37a 58%, #ffe37a 94%, transparent 94%);
       padding: 0 .08em; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
mark strong, mark a { color: inherit; }
a { color: var(--accent); text-decoration: none; }
/* un mot de vocabulaire renvoie a sa definition : pointille discret, pas de pastille */
a.lien-interne { color: inherit; border-bottom: .7pt dotted var(--gris); }
a.lien-interne strong { color: inherit; }
a.retour { color: var(--gris); font-family: var(--sans); font-size: .8em; margin-left: .45em; }

/* ---- encadres (callouts Obsidian) : ni fond ni coins arrondis. Un filet a
   gauche et une etiquette ; trois poids seulement.
     fort   : ce qu on apprend mot pour mot (definition, theoreme, loi)
     cadre  : a retenir
     leger  : exemple, complement, rappel, question, demonstration
   Le piege garde la seule couleur de la page. ---- */
.callout { margin: 1.25em 0; padding: .05em 0 .05em 1.05em; border-left: 1.2pt solid var(--filet);
           break-inside: avoid; page-break-inside: avoid; }
.callout > :last-child { margin-bottom: 0; }
.callout-titre { font-family: var(--sans); font-size: .78rem; font-weight: 650;
                 color: var(--gris); margin-bottom: .3em; letter-spacing: .01em; }
.c-note, .c-ex, .c-rappel, .c-quest, .c-demo { font-size: .955em; }
.c-def, .c-theo, .c-loi { border-left: 2.4pt solid var(--encre); }
.c-def .callout-titre, .c-theo .callout-titre, .c-loi .callout-titre { color: var(--encre); }
.c-tip { border: .8pt solid var(--encre); padding: .7em 1em .75em; }
.c-tip .callout-titre { color: var(--encre); }
.c-danger, .c-warn { border-left: 2.4pt solid var(--accent); }
.c-danger .callout-titre, .c-warn .callout-titre { color: var(--accent); }
.c-rappel { border-left-style: dashed; }
/* la demonstration se ferme par le carre de fin (convention mathematique) */
.c-demo > :last-child::after { content: " \220E"; }
.c-loi p { font-style: italic; }

/* le terme du tableau de vocabulaire : en gras, c est tout */
[id$="vocabulaire-a-retenir"] + .corps td:first-child { font-weight: 700; }
td a.lien-interne { border-bottom: 0; }

/* ---- listes ---- */
ul, ol { margin: .55em 0 .95em; padding-left: 1.35em; }
li { margin-bottom: .34em; padding-left: .15em; }
li > ul, li > ol { margin: .32em 0 .1em; }
ul li::marker { color: var(--gris); }
ol li::marker { color: var(--gris); font-variant-numeric: lining-nums tabular-nums; }

/* une citation du prof : en italique, en retrait */
blockquote { margin: 1.2em 0; padding: 0 0 0 1.05em; border-left: 1.2pt solid var(--filet);
             font-style: italic; }
blockquote > :last-child { margin-bottom: 0; }

/* ---- tableaux : trois filets horizontaux, aucun vertical, pas de zebrures ---- */
table { border-collapse: collapse; width: 100%; margin: 1.4em 0; font-family: var(--sans);
        font-size: .82rem; line-height: 1.45; font-variant-numeric: lining-nums tabular-nums;
        border-top: 1pt solid var(--encre); border-bottom: 1pt solid var(--encre);
        break-inside: avoid; page-break-inside: avoid; }
th, td { padding: .5em .9em .5em 0; text-align: left; vertical-align: top; }
th:last-child, td:last-child { padding-right: 0; }
thead th { font-weight: 650; border-bottom: .6pt solid var(--encre); }
tbody td { border-bottom: .4pt solid #e9e8e3; }
tbody tr:last-child td { border-bottom: 0; }

/* ---- code ---- */
pre { background: var(--papier); border-radius: 2pt; padding: .8em 1em; margin: 1.2em 0;
      overflow-x: auto; font-size: .78rem; line-height: 1.5; white-space: pre-wrap;
      break-inside: avoid; page-break-inside: avoid; }
code { font-family: var(--mono); font-size: .86em; font-variant-numeric: normal; }
pre code { font-size: 1em; }
p code, li code, td code { background: var(--papier); border-radius: 2pt; padding: .08em .28em; }

/* ---- figures et schemas : pas de cadre, une legende en petit ---- */
figure { margin: 1.5em 0; text-align: center; break-inside: avoid; page-break-inside: avoid; }
img { max-width: 100%; max-height: 150mm; height: auto; }
figcaption, figure + p, .mermaid + p { font-family: var(--sans); font-size: .78rem; color: var(--gris);
                         text-align: center; }
figure + p, .mermaid + p { margin: -.6em 0 1.5em; }
figure + p em, .mermaid + p em { font-style: normal; }
.mermaid { background: none; padding: 0; text-align: center; margin: 1.6em 0; break-inside: avoid; page-break-inside: avoid; }
.manquant { color: var(--accent); font-family: var(--sans); font-size: .8rem; }

/* ---- auto-test : deplie a l impression, sinon les reponses disparaissent ---- */
details { margin: 1em 0; padding: 0 0 0 1.05em; border-left: 1.2pt solid var(--filet);
          break-inside: avoid; }
summary { font-family: var(--sans); font-size: .82rem; font-weight: 650; margin-bottom: .3em;
          list-style: none; }

hr { border: 0; border-top: .6pt solid var(--filet); width: 22%; margin: 2.2em auto; }
.katex { font-size: 1.02em; }
.katex-display { margin: 1em 0; }
"""


def page(corps: str, meta: dict[str, str], titre_secours: str) -> str:
    titre = meta.get("titre") or titre_secours
    matiere = meta.get("matiere", "")
    type_ = meta.get("type", "")
    quand = meta.get("date") or date.today().isoformat()
    ligne = " · ".join(x for x in (type_, quand, meta.get("sources", "")) if x)

    bloc = ['<div class="titre-bloc">']
    if matiere:
        bloc.append(f'<div class="matiere">{matiere}</div>')
    bloc.append(f"<h1>{titre}</h1>")
    if ligne:
        bloc.append(f'<div class="meta">{ligne}</div>')
    bloc.append("</div>")

    # Pied de page : le numero ; en-tete (sauf la premiere page) : matiere et titre,
    # pour savoir ou l'on est quand on fait defiler un long PDF
    courant = " · ".join(x for x in (matiere, titre) if x).replace("\\", "\\\\").replace('"', '\\"')
    marges = ('@page { @bottom-center { content: counter(page); font: 8.5pt "Segoe UI", system-ui, '
              'sans-serif; color: #6a6a66; } @top-right { content: "' + courant + '"; '
              'font: 8pt "Segoe UI", system-ui, sans-serif; color: #8a8a85; } }\n'
              "@page :first { @top-right { content: none; } }")

    return f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>{titre}</title>
<link rel="stylesheet" href="{ressource('katex/katex.min.css')}">
<style>{CSS}
{marges}</style></head>
<body>
{"".join(bloc)}
{corps}
<script src="{ressource('katex/katex.min.js')}"></script>
<script src="{ressource('katex/contrib/auto-render.min.js')}"></script>
<script src="{ressource('mermaid.min.js')}"></script>
<script>
  document.querySelectorAll('details').forEach(d => d.open = true);
  if (window.mermaid) {{
    mermaid.initialize({{ startOnLoad: true, theme: 'base',
                          themeVariables: {{ fontFamily: '"Segoe UI", Inter, system-ui, sans-serif', fontSize: '13px',
                            primaryColor: '#ffffff', primaryBorderColor: '#1b1b1a', primaryTextColor: '#1b1b1a',
                            lineColor: '#6a6a66', secondaryColor: '#f6f5f1', tertiaryColor: '#f6f5f1',
                            edgeLabelBackground: '#ffffff', clusterBkg: '#fbfaf8', clusterBorder: '#d6d5cf' }} }});
  }}
  if (window.renderMathInElement) {{
    renderMathInElement(document.body, {{
      delimiters: [ {{left:'$$', right:'$$', display:true}},
                    {{left:'$',  right:'$',  display:false}} ],
      throwOnError: false
    }});
  }}
</script>
</body></html>"""


# ----------------------------------------------------------------- conversion

def convertir(source: Path, sortie: Path | None = None) -> Path:
    sortie = sortie or source.with_suffix(".pdf")
    brut = source.read_text(encoding="utf-8")

    meta, corps = entete(brut)
    vocab = termes_vocabulaire(corps)
    corps = resoudre_images(corps, source)
    corps = convertir_callouts(corps)
    corps = convertir_surlignage(corps)
    corps, maths = proteger_maths(corps)
    html = numeroter(indenter_parties(restaurer_maths(en_html(corps), maths)))
    html = ancrer_vocabulaire(html, vocab)

    with tempfile.TemporaryDirectory() as tmp:
        page_html = Path(tmp) / "cours.html"
        page_html.write_text(page(html, meta, source.stem), encoding="utf-8")
        cmd = [str(trouver_navigateur()), "--headless=new", "--disable-gpu",
               "--no-pdf-header-footer", "--run-all-compositor-stages-before-draw",
               # laisse a Mermaid et KaTeX le temps de rendre avant l'impression
               "--virtual-time-budget=20000",
               f"--print-to-pdf={sortie}", page_html.as_uri()]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if not sortie.is_file():
        sys.exit(f"Chrome n'a rien produit.\n{r.stderr[-1500:]}")
    return sortie


def _self_test() -> None:
    import tempfile

    meta, corps = entete("---\nmatiere: Algo\ntype: CM\n---\n\nBonjour")
    assert meta == {"matiere": "Algo", "type": "CM"}, meta
    assert corps == "Bonjour", repr(corps)
    assert entete("Pas de frontmatter")[0] == {}

    t, gardees = proteger_maths("soit $a_1 + b_2$ puis $$\\int_0^1 x\\,dx$$")
    assert "$" not in t and len(gardees) == 2, (t, gardees)
    assert restaurer_maths(t, gardees) == "soit $a_1 + b_2$ puis $$\\int_0^1 x\\,dx$$"

    c = convertir_callouts("> [!warning] Attention\n> corps\n\nsuite")
    assert 'class="callout c-warn"' in c and "corps" in c and "suite" in c, c
    assert 'class="callout c-note"' in convertir_callouts("> [!inconnu] X\n> y")

    # types propres au cours : chacun doit sortir sur sa propre classe, sinon il
    # repart en bleu "note" sans que rien ne le signale
    for genre, classe in (("definition", "def"), ("rappel", "rappel"),
                          ("theoreme", "theo"), ("demonstration", "demo"),
                          ("axiome", "loi")):
        rendu = convertir_callouts(f"> [!{genre}] T\n> corps")
        assert f'class="callout c-{classe}"' in rendu, (genre, rendu)

    # surlignage : converti dans le texte, laisse tel quel dans un bloc de code
    assert convertir_surlignage("le ==coeur== du sujet") == "le <mark>coeur</mark> du sujet"
    assert "==>" in convertir_surlignage("```mermaid\nA ==> B ==> C\n```")
    assert "<mark>" not in convertir_surlignage("a == b")

    # le corps d'une partie ## est isole dans un conteneur structurel sans
    # habillage propre -- une simple portee pour le CSS (tableau de vocabulaire)
    ind = indenter_parties('<h2 id="x">T</h2>\n<p>a</p>')
    assert ind == '<h2 id="x">T</h2><div class="corps">\n<p>a</p></div>', ind
    assert indenter_parties("<p>sans titre</p>") == "<p>sans titre</p>"
    # le numero d'un titre sort dans la marge ; un titre sans numero, ou une annee, reste tel quel
    assert numeroter('<h2 id="a">\n2. Les piles</h2>') == '<h2 id="a">\n<span class="num">2</span>Les piles</h2>'
    assert numeroter('<h3 id="b">2.3 LIFO</h3>') == '<h3 id="b"><span class="num">2.3</span>LIFO</h3>'
    assert numeroter('<h2 id="c">Sources</h2>') == '<h2 id="c">Sources</h2>'
    assert numeroter('<h4 id="d">1. Etape</h4>') == '<h4 id="d">1. Etape</h4>'
    deux = indenter_parties('<h2 id="a">1. Intro</h2><p>x</p>'
                            '<h2 id="b">Vocabulaire a retenir</h2><p>y</p>')
    assert deux.count('<div class="corps">') == 2, deux

    assert "<table>" in en_html("| a | b |\n|---|---|\n| 1 | 2 |")
    # une legende ecrite sous l'image reste du Markdown, pas du texte brut
    with tempfile.TemporaryDirectory() as tmp:
        img = Path(tmp) / "schema.png"
        img.write_bytes(b"")
        note = Path(tmp) / "n.md"
        note.touch()
        r = resoudre_images("![[schema.png]]\n*la legende*", note)
        assert "</figure>\n\n*la legende*" in r, r
        assert "<em>la legende</em>" in en_html(r), en_html(r)

    assert '<pre class="mermaid">' in en_html("```mermaid\ngraph TD\nA-->B\n```")

    # les headings portent un id
    html = en_html("## Vocabulaire à retenir\n\nTexte.")
    assert 'id="vocabulaire-a-retenir"' in html, html

    # slugs de heading
    assert _slug_heading("Vocabulaire à retenir") == "vocabulaire-a-retenir"
    assert _slug_heading("4.2 Le modèle en V") == "42-le-modele-en-v"
    assert _slug_heading("") == "section"

    # liens internes Obsidian -> ancres HTML
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "test.md"
        src.touch()
        r = resoudre_images("Le **[[#Vocabulaire à retenir|cahier des charges]]**", src)
        assert 'class="lien-interne"' in r, r
        assert 'href="#vocabulaire-a-retenir"' in r, r
        assert "cahier des charges" in r, r
        # un titre numerote reste atteignable : sinon 19 liens morts par cours
        num = resoudre_images("## 9. Vocabulaire à retenir\n\n"
                              "voir [[#Vocabulaire à retenir|le terme]]", src)
        assert 'href="#9-vocabulaire-a-retenir"' in num, num

        # lien sans texte alternatif
        r2 = resoudre_images("voir [[#Le modèle en V]]", src)
        assert 'href="#le-modele-en-v"' in r2, r2

        # quand le terme figure au tableau, le clic vise sa LIGNE et non la
        # tete de section -- sinon le lecteur doit chercher son mot a la main
        # la 1re colonne est un lien retour vers la partie : c'est le libelle
        # affiche qui fait le terme, pas la cible du lien
        doc = ("Le [[#Vocabulaire à retenir|oracle de test]] sert a ca.\n\n"
               "## Vocabulaire à retenir\n\n"
               "| Terme | Définition |\n| :--- | :--- |\n"
               "| **[[#3. Validation\\|Oracle de test]]** | Le resultat attendu. |\n")
        assert termes_vocabulaire(doc) == {"oracle-de-test"}, termes_vocabulaire(doc)
        assert 'href="#voc-oracle-de-test"' in resoudre_images(doc, src)
        # terme absent du tableau : on retombe sur la section, pas de lien mort
        absent = resoudre_images("[[#Vocabulaire à retenir|inconnu]]\n\n" + doc, src)
        assert 'href="#vocabulaire-a-retenir"' in absent, absent

        # test lien Markdown standard (ex: Gemini)
        std_md = resoudre_images("Le [oracle de test](#vocabulaire-a-retenir) blabla\n\n" + doc, src)
        assert 'href="#voc-oracle-de-test"' in std_md, std_md

        # le trajet retour : seule la 1re pastille porte l'ancre, sinon le
        # tableau renverrait toujours sur elle quel que soit le clic d'origine
        deux = resoudre_images(doc.replace("sert a ca.",
                                           "sert a ca, et l'[[#Vocabulaire à "
                                           "retenir|oracle de test]] aussi."), src)
        assert deux.count('id="ref-oracle-de-test"') == 1, deux
        # la 1re colonne vise une section, pas le tableau : pas d'ancre de retour
        assert 'id="ref-oracle-de-test" class="lien-interne">**Oracle' not in deux

    # l'ancre est posee sur la cellule du terme, attributs d'alignement compris
    tab = ancrer_vocabulaire('<td style="text-align:left">Oracle de test</td>'
                             "<td>Le resultat.</td>", {"oracle-de-test"})
    assert tab.startswith('<td style="text-align:left" id="voc-oracle-de-test">'), tab
    assert tab.endswith("<td>Le resultat.</td>"), tab
    assert ancrer_vocabulaire("<td>x</td>", set()) == "<td>x</td>"

    # la fleche de retour n'apparait que si le corps porte l'ancre visee
    avec = ancrer_vocabulaire('<p><a id="ref-oracle-de-test" class="lien-interne">'
                              "oracle de test</a></p><td>Oracle de test</td>",
                              {"oracle-de-test"})
    assert 'href="#ref-oracle-de-test" class="retour"' in avec, avec
    assert "↩" in avec
    # sans ancre dans le corps, pas de fleche morte
    assert "retour" not in tab, tab

    # copie locale de KaTeX/Mermaid prise avant le CDN, le CDN sinon
    with tempfile.TemporaryDirectory() as tmp:
        vrai = os.environ.get("INCIPIT_VENDOR")
        os.environ["INCIPIT_VENDOR"] = tmp
        try:
            assert ressource("mermaid.min.js").startswith("https://cdn.jsdelivr.net/")
            (Path(tmp) / "mermaid.min.js").write_text("//", encoding="utf-8")
            assert ressource("mermaid.min.js").startswith("file:///"), ressource("mermaid.min.js")
            assert 'src="file:///' in page("<p>x</p>", {}, "T")
        finally:
            os.environ.pop("INCIPIT_VENDOR")
            if vrai is not None:
                os.environ["INCIPIT_VENDOR"] = vrai

    assert trouver_navigateur().is_file()
    print("self-test OK :", trouver_navigateur().name)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    if "--self-test" in sys.argv:
        _self_test()
    elif not args:
        sys.exit(__doc__)
    else:
        src = Path(args[0]).resolve()
        if not src.is_file():
            sys.exit(f"Introuvable : {src}")
        dst = Path(args[1]).resolve() if len(args) > 1 else None
        print(convertir(src, dst))

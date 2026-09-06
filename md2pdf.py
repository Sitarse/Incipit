#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["markdown-it-py>=3"]
# ///
"""Convertit un cours .md (syntaxe Obsidian) en PDF typographie.

    uv run md2pdf.py "C:\\...\\Cours\\Analyse\\CM - Chapitre 3.md"

Rend les maths (KaTeX), les schemas Mermaid, les callouts Obsidian et les
images ![[...]], le surlignage ==...== et les liens internes cliquables.
Mise en page aeree facon diapo : titres de partie en banniere, corps en retrait,
vocabulaire en couleur. L'impression est faite par Chrome, pas de LaTeX a installer.
"""

import re
import shutil
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path
from urllib.parse import quote

from markdown_it import MarkdownIt

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
    return re.sub(r"(?<!!)(\*{0,2})\[\[#?([^\]|]+)(?:\|([^\]]+))?\]\]\1",
                  lambda m: _lien_interne(m.group(1), m.group(2), m.group(3),
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
@page { size: A4; margin: 14mm 13mm 15mm; }

/* Deux familles presentes d origine sur Windows et macOS : aucune police
   n est embarquee ni telechargee, le PDF sort donc identique hors ligne
   (KaTeX et Mermaid sont deja au CDN, la typographie n a pas a l etre aussi).
   Le serif porte les titres (h1/h2) pour un rendu plus « livre » que le sans
   uniforme d avant ; il reste aussi utilise pour le raisonnement pas-a-pas
   (.c-demo). Le sans porte le corps et les sous-titres (h3/h4).

   Palette a deux tons fixes, pas de rotation par partie -- calquee sur le
   design de reference (CM -CM1 gratuit.pdf), avec un bleu nuit plus sobre que
   le violet en accent principal, et l or reserve aux mots de vocabulaire pour
   ne pas entrer en collision avec cet accent. */
:root {
  --sans: "Segoe UI", Inter, system-ui, "Helvetica Neue", Arial, sans-serif;
  --serif: Georgia, Cambria, "Times New Roman", Times, serif;
  --bleu: #1d4ed8;          /* accent principal (bordures, liens, filets) */
  --bleu-fort: #1e3a8a;     /* meme gamme, plus soutenu (aplats, texte fort) */
  --bleu-tendre: #eaf1fe;   /* fond pastel des bandeaux et de l encart neutre */
  --or: #92400e;            /* mots de vocabulaire : texte */
  --or-fond: #fef3c7;       /* mots de vocabulaire : fond de la pastille */
  --or-trait: #d97706;      /* mots de vocabulaire : soulignement */
}

html { font-size: 11pt; }
body {
  font-family: var(--sans);
  line-height: 1.66; color: #1f2430; margin: 0; background: #fff;
  text-align: left; hyphens: none;          /* lecture en diagonale, pas en pave */
 }
p { margin: 0 0 .8em; orphans: 3; widows: 3; }

/* La hierarchie de titres est en serif (h1-h3) : plus lisible et moins tasse
   que le sans-serif gras a crenage negatif d avant. h4 reste en sans, c est
   une etiquette et non un titre. */
h1, h2, h3 { font-family: var(--serif); font-weight: 700; text-align: left;
             break-after: avoid; page-break-after: avoid; }
h4 { font-family: var(--sans); font-weight: 700; text-align: left;
     break-after: avoid; page-break-after: avoid; }

.callout-titre { font-family: var(--sans); }

/* ---- page de garde : centree, sobre -- kicker, titre, meta, filet ---- */
.titre-bloc { text-align: center; padding: 6mm 6mm 8mm; margin: 0 0 9mm;
              border-bottom: 2.5pt solid var(--bleu); }
.titre-bloc .matiere { display: block; text-transform: uppercase;
                       letter-spacing: .16em; font-size: .72rem; font-weight: 800;
                       color: var(--bleu); margin-bottom: 1em; }
.titre-bloc h1 { font-size: 1.9rem; font-weight: 700; color: var(--bleu-fort);
                 margin: 0 0 .4em; line-height: 1.22; text-align: center; }
.titre-bloc .meta { font-size: .8rem; color: #6b7280; }

/* ---- titres : la partie ## est un bandeau tendre a filet, pas un aplat plein
   -- l accent se repere au coup d oeil sans ecraser la page de couleur. ---- */
h2 { font-size: 1.25rem; margin: 2.3em 0 .8em; background: var(--bleu-tendre);
     color: var(--bleu-fort); padding: .65em .9em; border-left: 5pt solid var(--bleu);
     border-radius: 3pt 9pt 9pt 3pt; }
h2:first-of-type { margin-top: 0; }

body > h1 { display: none; }   /* le bloc de titre le porte deja */

/* conteneur structurel, sans habillage propre : cf. indenter_parties() */
.corps { margin: 0 0 1.1em; }

h3 { font-size: 1.12rem; color: var(--bleu-fort); margin: 1.8em 0 .55em;
     padding-bottom: .3em; border-bottom: 1pt solid #E5E7EB; }
h4 { font-size: .78rem; color: #4B5563; margin: 1.4em 0 .35em;
     text-transform: uppercase; letter-spacing: .09em; }

/* ---- le code couleur semantique : un marqueur, un role, une couleur fixe.
   Regle de sobriete : dans le fil du texte, une seule chose colore a la fois
   (le surlignage rouge OU la pastille de vocabulaire). Le gras reste noir :
   c est le poids qui appuie, pas la couleur -- sinon chaque paragraphe vire
   au sapin de Noel et plus rien ne ressort. ---- */
/* rouge = important : la regle, le resultat, ce qui tombe a l examen */
mark { color: #B91C1C; background: #FEE2E2; font-weight: 650; border-radius: 4pt;
       padding: .08em .3em; box-decoration-break: clone;
       -webkit-box-decoration-break: clone; }
mark strong, mark a { color: inherit; }
strong { color: #111827; font-weight: 700; }
/* gris = la nuance, l aparte, la legende */
em { color: #6b7280; }
a { color: var(--bleu); text-decoration: none; }
/* le mot de vocabulaire : pastille or, soulignee -- jamais confondue avec le
   bleu de l accent puisque c est justement ce qu elle ne doit pas etre. */
a.lien-interne { color: var(--or); background: var(--or-fond); font-weight: 650;
                 border-radius: 5pt; padding: .06em .35em; border-bottom: 0;
                 text-decoration: underline; text-decoration-color: var(--or-trait);
                 text-underline-offset: 2px; }
a.lien-interne strong { color: inherit; }

/* la fleche de retour du tableau : volontairement discrete et sans pastille --
   elle ne doit pas se lire comme un mot de vocabulaire de plus, juste offrir une
   cible cliquable au pouce. Un demi-cadratin la decolle du terme. */
a.retour { color: var(--or-trait); text-decoration: none; font-size: .82em;
           margin-left: .5em; padding: 0 .18em; opacity: .75; }

/* ---- callouts Obsidian : filet colore, fond tendre, libelle capitale sans
   icone -- calque sur le design de reference (pas de pictogramme, l or et le
   bleu suffisent a distinguer neutre/vocabulaire, la couleur du filet fait
   le reste). ---- */
.callout { margin: 1.3em 0; padding: .75em 1em .8em; border-left: 4pt solid;
           border-radius: 3pt 9pt 9pt 3pt;
           break-inside: avoid; page-break-inside: avoid; }
.callout > :last-child { margin-bottom: 0; }
.callout-titre { text-transform: uppercase; letter-spacing: .09em;
                 font-weight: 800; margin-bottom: .4em; font-size: .73em; }
/* code couleur impose : complement = bleu, a retenir = violet, exemple = vert,
   piege = rouge, vocabulaire = or (cf. a.lien-interne). */
.c-note   { background: var(--bleu-tendre); border-color: var(--bleu) }
.c-note   .callout-titre { color: var(--bleu-fort) }
.c-tip    { background:#F5F3FF; border-color:#8B5CF6 } .c-tip    .callout-titre{color:#6D28D9}
.c-warn   { background:#FFFBEB; border-color:#F59E0B } .c-warn   .callout-titre{color:#B45309}
.c-danger { background:#FEF2F2; border-color:#EF4444 } .c-danger .callout-titre{color:#B91C1C}
.c-quest  { background:#FDF2F8; border-color:#EC4899 } .c-quest  .callout-titre{color:#BE185D}
.c-ex     { background:#ECFDF5; border-color:#10B981 } .c-ex     .callout-titre{color:#047857}
.c-def    { background:#FFF7ED; border-color:#F97316 } .c-def    .callout-titre{color:#C2410C}
.c-theo   { background:#F0FDFA; border-color:#0D9488 } .c-theo   .callout-titre{color:#0F766E}
/* le rappel pointe vers un acquis, il n ouvre rien : filet en pointilles */
.c-rappel { background:#F0F9FF; border-color:#0EA5E9; border-left-style: dashed }
.c-rappel .callout-titre{color:#0369A1}

/* la demonstration se lit comme une preuve imprimee : serif, interligne large,
   et le carre de fin ferme le raisonnement (convention mathematique). */
.c-demo   { background:#F8FAFC; border-color:#94A3B8; font-family: var(--serif);
            line-height: 1.78 }
.c-demo .callout-titre{ color:#475569; font-family: var(--sans) }
.c-demo > :last-child::after { content: " \220E"; font-weight: 700; }

/* l enonce fondamental (loi, axiome, principe) : pas un encadre de plus mais
   une plaque doree, centree -- meme gamme que le mot de vocabulaire, l or
   marque ici aussi « a retenir mot pour mot ». */
.c-loi { background: linear-gradient(var(--or-fond), #FCD34D22); border: 0;
         border-radius: 14pt; padding: 1.1em 1.4em; text-align: center;
         box-shadow: inset 0 0 0 2pt #FCD34D; }
.c-loi .callout-titre { color: var(--or); justify-content: center; }
.c-loi p { font-family: var(--serif); font-style: italic; font-size: 1.1em;
           color:#78350F; }

/* le terme reste en pastille or dans le tableau de fin : meme mot, meme
   couleur que dans le corps du cours. Le selecteur tolere un titre numerote
   ("9. Vocabulaire a retenir"). */
[id$="vocabulaire-a-retenir"] + .corps td:first-child {
  color: var(--or); font-weight: 700; }
[id$="vocabulaire-a-retenir"] + .corps td:first-child > * { color: inherit; }

/* ---- listes : espacees, c est la forme la plus scannable ---- */
ul, ol { margin: .65em 0 1em; padding-left: 1.5em; }
li { margin-bottom: .42em; }
li > ul, li > ol { margin: .38em 0 .1em; }
ul li::marker { color: var(--bleu); font-size: 1.15em; }
ol li::marker { color: var(--bleu-fort); font-weight: 800; }
/* or = l enonce cite mot pour mot : principe, theoreme, definition du prof */
blockquote { margin: 1.25em 0; padding: .7em 1.1em; background: #FFFBEB;
             border-left: 4pt solid #F59E0B; border-radius: 3pt 9pt 9pt 3pt;
             color: #78350F; }
blockquote strong { color: #92400E; }

/* ---- tableaux : en-tete plein bleu, corps zebre ---- */
table { border-collapse: separate; border-spacing: 0; width: 100%; margin: 1.4em 0;
        font-size: .88rem; border-radius: 8pt; overflow: hidden;
        box-shadow: 0 0 0 .5pt #E5E7EB; break-inside: avoid; page-break-inside: avoid; }
th, td { padding: .5em .8em; text-align: left; vertical-align: top;
         border-bottom: .5pt solid #EEF0F3; }
thead th { background: var(--bleu-fort); color: #fff; font-weight: 800;
           text-transform: uppercase; letter-spacing: .07em; font-size: .72rem;
           border-bottom: 0; }
tbody tr:nth-child(even) { background: #FAFBFC; }
tbody tr:last-child td { border-bottom: 0; }

pre { background: #F8FAFC; border: .5pt solid #E2E8F0; border-radius: 9pt;
      padding: .8em .95em; overflow-x: auto; font-size: .82rem; line-height: 1.5;
      break-inside: avoid; page-break-inside: avoid; }
code { font-family: "Cascadia Mono", Consolas, "DejaVu Sans Mono", monospace;
       font-size: .88em; }
/* teal = notation, symbole, nom de fichier ou de commande */
p code, li code, td code { background: #E0F2F1; color: #0F766E; border-radius: 4pt;
       padding: .1em .32em; }

/* ---- figures et schemas ---- */
figure { margin: 1.5em 0; padding: 4mm; text-align: center; break-inside: avoid;
         page-break-inside: avoid; border: .5pt solid #E5E7EB; border-radius: 6pt; }
img { max-width: 100%; max-height: 155mm; height: auto; }
figcaption { font-size: .85rem; color: #6b7280; font-style: italic; margin-top: .5em; }
/* la legende suit l image : le paragraphe en italique juste dessous */
figure + p { text-align: center; font-size: .86rem; color: #6b7280;
             margin: .7em 0 1.5em; }
.mermaid { text-align: center; margin: 1.6em 0; break-inside: avoid;
           page-break-inside: avoid; }
.manquant { color: #DC2626; font-size: .85rem; font-style: italic; }

/* ---- auto-test : deplie a l impression, sinon les reponses disparaissent ---- */
details { margin: 1em 0; padding: .75em 1em; background: #FDF2F8;
          border-left: 4pt solid #EC4899; border-radius: 3pt 9pt 9pt 3pt;
          break-inside: avoid; }
summary { text-transform: uppercase; letter-spacing: .1em; font-weight: 800;
          font-size: .73em; color: #BE185D; cursor: pointer; margin-bottom: .4em; }

/* separateur de section : discret, c est un document de cours */
hr { border: 0; border-top: 1.5pt dotted #D1D5DB; margin: 2.2em 0; }
.katex { font-size: 1.03em; }
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

    return f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>{titre}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css">
<style>{CSS}</style></head>
<body>
{"".join(bloc)}
{corps}
<script src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/contrib/auto-render.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>
  document.querySelectorAll('details').forEach(d => d.open = true);
  if (window.mermaid) {{
    mermaid.initialize({{ startOnLoad: true, theme: 'neutral',
                          themeVariables: {{ fontFamily: '"Segoe UI", Inter, system-ui, sans-serif' }} }});
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
    html = indenter_parties(restaurer_maths(en_html(corps), maths))
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

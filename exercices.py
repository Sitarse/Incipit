#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""A partir d'un cours .md deja genere, produit deux supports de revision.

  (a) un TP personnel : une petite application autonome, note sur 100, qui
      interroge l'etudiant palier par palier, du tres facile au tres difficile
      # un seul fichier visible a cote du cours, <cours>_TP.bat (Windows), _TP.command (macOS) ou _TP.sh (Linux) selon l'OS
      le systeme, qui l'ouvre d'un double-clic ; le programme du TP et ses
      donnees sont ranges dans .tp/
  (b) une fiche de revision condensee, en Markdown Obsidian -- <cours>_fiche.md

Zero nouvel appel reseau propre : toute la plomberie LLM (fournisseurs, cles,
repli gratuit) vient de generator.py, reutilisee telle quelle -- cf. repondre().
La persona et la charte pedagogiques sont les memes que pour les cours, pour
que ces supports parlent la meme langue : professeur patient, zero jargon
gratuit, pas-a-pas.

Lancer :  uv run exercices.py --source chemin/vers/cours.md
Test   :  uv run exercices.py --self-test
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

from generator import CHARTE, DEFAUT, MOTEURS, PERSONA, cle_du_moteur, \
    modele_retenu, nettoyer, probleme, repondre

# Langues supportées par l'application (code ISO 639-1)
LANGUES_APP = {
    "fr": "Français", "en": "English",
}

# Le dossier du cours ne doit montrer qu'UN fichier de TP : son lanceur. Le
# programme genere et ses donnees sont des annexes -- ils vont dans un dossier
# a point, invisible dans Obsidian, comme .transcriptions a cote des sources.
DOSSIER_TP = ".tp"


def chemin_tp(source: Path, suffixe: str) -> Path:
    """Ou vit une annexe du TP de ce cours (le .py genere, ses donnees .json)."""
    return source.parent / DOSSIER_TP / (source.stem + suffixe)


# Au-dela, un cours entier en exercices coute cher a generer et decourage
# l'etudiant plutot que de l'aider -- mieux vaut un TP court qu'un pave.
NOTIONS_MAXI = 10

# Le TP monte en difficulte : un palier = un cran, du premier reflexe a la
# subtilite qu'on ne voit qu'en ayant tout compris. L'ordre de ce tuple est
# l'ordre du TP -- ne pas le melanger.
PALIERS = ("tres facile", "facile", "moyen", "difficile", "tres difficile")
# Un TP se fait d'une traite : cinq questions, une par palier, c'est la montee
# complete sans y passer la soiree. L'app laisse en demander plus.
QUESTIONS_DEFAUT = 5


def repartition_paliers(nombre: int) -> list[tuple[str, int]]:
    """Combien d'exercices par palier, pour `nombre` questions au total.

    Moins de cinq questions : on prend des marches ecartees (1 et 5 d'abord)
    plutot que d'entasser le TP dans le bas de l'echelle -- une progression de
    trois questions doit quand meme aller du cours au piege. Au-dela, chaque
    palier prend sa part et le reste retombe sur les premiers, ou l'etudiant a
    le plus besoin de repetition.
    """
    nombre = max(1, nombre)
    if nombre < len(PALIERS):
        # reparties sur toute l'echelle : 3 -> paliers 1, 3, 5
        pas = (len(PALIERS) - 1) / max(1, nombre - 1) if nombre > 1 else 0
        return [(PALIERS[round(i * pas)], 1) for i in range(nombre)]
    base, reste = divmod(nombre, len(PALIERS))
    return [(p, base + (1 if n < reste else 0))
            for n, p in enumerate(PALIERS)]

# Libelles de l'interface du TP genere, une entree par langue de LANGUES_APP.
# Le contenu des exercices est deja redige dans la langue demandee -- c'est le
# modele qui l'ecrit ; seul le decor (boutons, verdicts, noms des paliers)
# restait en francais quoi qu'on passe a --langue. Table figee plutot qu'un
# appel de traduction : le TP doit se fabriquer sans reseau supplementaire et
# sans qu'un modele distrait puisse rendre un bouton vide.
# Les cles sont celles de CLES_MOTS ; le self-test verifie qu'aucune ne manque
# nulle part -- une cle absente donnerait un "undefined" en pleine interface.
MOTS_TP = {
"fr": {"tp": "TP", "niveau": "niveau",
       "progression": "exercices, du plus simple au plus dur", "palier": "Palier",
       "p1": "Très facile", "p2": "Facile", "p3": "Moyen", "p4": "Difficile",
       "p5": "Très difficile", "verifier": "Vérifier", "indice": "Indice",
       "solution": "Solution", "suivant": "Suivant", "bilan": "Voir le bilan",
       "recommencer": "Recommencer", "fermer": "Fermer le TP",
       "reponse": "Ta réponse…", "execution": "Exécution…",
       "tests": "test(s) réussi(s)", "erreur": "Erreur", "juste": "Juste",
       "faux": "Faux", "moitie": "À moitié",
       "idees": "idée(s) attendue(s) repérée(s)", "manque": "manque",
       "autocorrige": "Corrige-toi toi-même : as-tu eu juste ?",
       "tp_fini": "TP terminé", "par_palier": "Par palier",
       "par_notion": "Par notion",
       "v90": "le cours est acquis, jusqu’aux détails.",
       "v70": "l’essentiel est là ; reprends les paliers du bas.",
       "v40": "les bases tiennent, le fond reste à travailler.",
       "v0": "relis le cours avant de recommencer.",
       "ferme": "TP fermé — tu peux fermer cet onglet.",
       "arret": "Ferme cette fenêtre pour arrêter le TP."},
"en": {"tp": "Lab", "niveau": "level",
       "progression": "exercises, from easiest to hardest", "palier": "Tier",
       "p1": "Very easy", "p2": "Easy", "p3": "Medium", "p4": "Hard",
       "p5": "Very hard", "verifier": "Check", "indice": "Hint",
       "solution": "Solution", "suivant": "Next", "bilan": "See results",
       "recommencer": "Start over", "fermer": "Close the lab",
       "reponse": "Your answer…", "execution": "Running…",
       "tests": "test(s) passed", "erreur": "Error", "juste": "Correct",
       "faux": "Wrong", "moitie": "Half right",
"idees": "expected idea(s) found", "manque": "missing",
        "autocorrige": "Grade yourself: did you get it right?",
        "tp_fini": "Lab finished", "par_palier": "By tier",
        "par_notion": "By topic",
        "v90": "the course is mastered, down to the details.",
        "v70": "the essentials are there; revisit the lower tiers.",
        "v40": "the basics hold, the depth needs work.",
        "v0": "read the course again before retrying.",
        "ferme": "Lab closed — you can close this tab.",
        "arret": "Close this window to stop the lab."},
}

CLES_MOTS = tuple(MOTS_TP["fr"])


def mots_tp(langue: str) -> dict:
    """Les libelles du TP dans cette langue, l'anglais a defaut.

    L'anglais plutot que le francais : si la langue demandee n'est pas dans la
    table, l'etudiant a plus de chances de lire l'anglais que le francais.
    """
    return MOTS_TP.get(langue, MOTS_TP["en"])

# Rubriques de fin de cours (vocabulaire, recap, auto-test, sources) : ce ne
# sont pas des notions a exercer, juste des recapitulatifs de ce qui precede.
EXCLUS_NOTION = re.compile(r"vocabulaire|recapitulat|auto-?(test|evaluation)"
                            r"|sources?\b", re.IGNORECASE)

CHAMPS_EXO = ("Notion", "Difficulte", "Type", "Enonce", "Indice", "Solution",
             "Stub", "Tests", "Reponse", "MotsCles")
TYPES_EXO = ("code", "calcul", "qualitatif")

# Un exercice "code" fait completer une fonction Python, corrigee en la faisant
# tourner. Il n'a de sens que si le cours en montre : sur un cours de genie
# logiciel qui parle de besoins et de diagrammes, le modele voyait "matiere =
# informatique" et fabriquait quand meme des fonctions a trous sans rapport
# avec ce qui etait enseigne. On ne le lui propose donc que si le cours
# contient vraiment du Python -- bloc ```python, ou un bloc quelconque qui en a
# la tete. Un schema ASCII, lui, n'a ni def ni import.
_BLOC = re.compile(r"^```([^\n]*)\n(.*?)^```", re.MULTILINE | re.DOTALL)
_PYTHON = re.compile(r"^\s*(def |class |import |from \w+ import )|print\(",
                     re.MULTILINE)


def cours_avec_code(md: str) -> bool:
    """Ce cours montre-t-il du Python ? Decide si le TP a droit au type "code".

    Prudent par construction : dans le doute on repond non. Un exercice de
    programmation manque a un cours qui aurait pu en porter -- un exercice de
    programmation sur un cours qui n'en parle pas est absurde, et c'est celui-la
    que l'etudiant a sous les yeux.
    """
    for m in _BLOC.finditer(md):
        langue_bloc = m.group(1).strip().lower()
        if langue_bloc in ("python", "py", "python3"):
            return True
        if not langue_bloc and _PYTHON.search(m.group(2)):
            return True
    return False

# Un exercice complet (situation, schema, indice, solution, stub, tests) tient
# large en 900 jetons ; le plancher couvre l'en-tete et les TP courts.
def jetons_exos(questions: int) -> int:
    return max(4000, 900 * questions)
MAX_JETONS_FICHE = 3000     # une fiche tient sur une page, pas besoin de plus
MAX_JETONS_CARTES = 3000    # des cartes courtes, meme volume qu'une fiche


# --------------------------------------------------------------- lecture du cours

def meta_du_cours(md: str, source: Path) -> dict:
    """Matiere et titre lus dans l'en-tete YAML du cours, sinon deduits du nom
    de fichier -- un cours peut toujours etre pointe sans son en-tete intact."""
    entete = md.split("\n---", 1)[0] if md.startswith("---\n") else ""

    def champ(nom: str, defaut: str) -> str:
        m = re.search(rf"^{nom}\s*:\s*(.+)$", entete, re.MULTILINE)
        return m.group(1).strip() if m else defaut

    return {
        "matiere": champ("matiere", "Divers"),
        "titre": champ("titre", source.stem.replace("_", " ").replace("-", " ")),
    }


def notions_du_cours(md: str) -> list[str]:
    """Titres ## / ### du cours, dans l'ordre d'apparition, sans les rubriques
    de fin qui ne sont pas des notions a exercer."""
    notions = []
    for ligne in md.splitlines():
        if not (m := re.match(r"^(#{2,3})\s+(.+?)\s*$", ligne.strip())):
            continue
        titre = m.group(2).strip(" *_")
        if titre and not EXCLUS_NOTION.search(titre) and titre not in notions:
            notions.append(titre)
    return notions[:NOTIONS_MAXI]


# ------------------------------------------------------------------ consignes

def consigne_exercices(langue: str = "fr", avec_code: bool = True) -> str:
    """Persona + charte des cours, reprises telles quelles : les exercices
    doivent parler la meme langue pedagogique que le cours qu'ils exercent."""
    noms_langues = {
        "fr": "français", "en": "anglais", "es": "espagnol", "de": "allemand",
        "it": "italien", "pt": "portugais", "nl": "néerlandais", "pl": "polonais",
        "ru": "russe", "zh": "chinois", "ja": "japonais", "ko": "coréen",
        "ar": "arabe", "hi": "hindi", "tr": "turc", "sv": "suédois",
        "da": "danois", "no": "norvégien", "fi": "finnois", "cs": "tchèque",
        "hu": "hongrois", "ro": "roumain", "uk": "ukrainien", "el": "grec",
        "he": "hébreu", "th": "thaï", "vi": "vietnamien", "id": "indonésien",
    }
    nom_langue = noms_langues.get(langue, "français")
    return (
        f"Tu prepares des exercices d'application pour l'etudiant a qui tu "
        f"viens d'ecrire ce cours, en {nom_langue}.\n\n"
        + PERSONA + "\n\n" + CHARTE + "\n\n"
        "Objectif de CET exercice-ci (un TP personnel note sur 100, pas un "
        "cours) :\n"
        "- chaque exercice porte sur une seule notion, clairement rattachee ;\n"
        "- l'enonce est un VRAI sujet de TP, pas une question de cours "
        "recitee : il pose une situation concrete (un cas, des donnees, un "
        "systeme, un extrait), puis demande un travail precis dessus. "
        "Trois a six lignes : de quoi poser le decor, les donnees utiles et "
        "la consigne. Une question qui commence par \"Qu'est-ce que...\" ou "
        "\"Citez...\" n'est pas un sujet de TP -- transforme-la en situation "
        "a traiter ;\n"
        "- quand un schema rend l'enonce plus clair (arbre, automate, "
        "chronologie, montage, tableau de valeurs, architecture, circuit), "
        "dessine-le en ASCII dans l'enonce, entre deux lignes ``` seules sur "
        "leur ligne. Maximum 12 lignes et 60 colonnes, caracteres simples "
        "(+ - | / \\ > v * .). N'en mets pas quand le texte suffit : un "
        "schema decoratif encombre ;\n"
        "- l'indice debloque sans donner la reponse ;\n"
        "- la solution est expliquee, pas juste un resultat sec ;\n"
        "- adapte le type d'exercice a la matiere : calcul en maths, "
        "traduction ou conjugaison en langue, analyse de document en "
        "histoire, code a completer en informatique, etc. -- un exercice de "
        "maths ne ressemble pas a un exercice de langue.\n\n"
        "Le TP est organise en paliers de difficulte croissante, et c'est "
        "le coeur du travail demande : l'etudiant doit sentir la marche "
        "monter d'un palier au suivant. Deux exercices de paliers differents "
        "ne doivent jamais pouvoir s'echanger sans que ca se voie.\n"
        "- Palier 1, tres facile : la definition, le mot juste, l'application "
        "immediate d'une formule donnee. Reussi par qui a lu le cours.\n"
        "- Palier 2, facile : une seule notion, appliquee sans piege, mais "
        "il faut avoir compris ce qu'on applique.\n"
        "- Palier 3, moyen : plusieurs etapes, ou une notion utilisee dans un "
        "contexte legerement deplace par rapport au cours.\n"
        "- Palier 4, difficile : croise deux notions du cours, ou demande de "
        "reperer un cas particulier, une condition d'application, une erreur "
        "classique.\n"
        "- Palier 5, tres difficile : le detail qu'on ne voit qu'en ayant "
        "tout compris -- une limite de la methode, un contre-exemple, une "
        "justification fine, un cas ou la regle naive tombe en panne. Ce "
        "palier doit rester faisable a partir du seul cours fourni, jamais "
        "une question hors-programme.\n\n"
        "En plus de l'enonce, CHAQUE exercice est note automatiquement : tu "
        "choisis pour chacun le type qui correspond le mieux, et tu fournis "
        "ce qu'il faut pour le corriger sans intervention humaine.\n"
        "Le type se deduit de ce que l'etudiant doit PRODUIRE pour repondre, "
        "jamais de l'etiquette de la matiere. Demande-toi : ma reponse "
        "attendue est-elle un programme, une valeur unique, ou un texte ? "
        "Un cours d'informatique qui enseigne des principes, des methodes ou "
        "des diagrammes se traite en qualitatif ou en calcul, exactement comme "
        "un cours de droit -- il n'y a rien a programmer dedans.\n"
        + ("- Type: code -- l'etudiant complete une fonction Python. Reserve "
           "aux exercices ou la reponse EST un programme, et seulement si le "
           "cours enseigne a en ecrire. Fournis un "
           "`Stub` (signature + docstring courte, corps a completer) et des "
           "`Tests` : des expressions booleennes Python separees par ` ; `, "
           "qui appellent la fonction du Stub et verifient son resultat (ex. "
           "`resoudre(2, 3) == 5 ; resoudre(0, 0) == 0`). 2 a 4 tests par "
           "exercice, couvrant un cas normal et un cas limite. Sans tests "
           "executables, n'utilise pas ce type.\n"
           if avec_code else
           "- Type: code -- INTERDIT pour ce TP. Ce cours ne contient aucun "
           "programme : il n'y a rien a completer ni a faire tourner. "
           "N'ecris jamais `Type: code`, ni `Stub`, ni `Tests`, meme si la "
           "matiere touche a l'informatique. Repartis tout entre calcul et "
           "qualitatif.\n") +
        "- Type: calcul -- la reponse est une valeur unique verifiable "
        "(nombre, date, mot, forme conjuguee...). Fournis `Reponse` : la "
        "valeur attendue, ou plusieurs formes equivalentes acceptees "
        "separees par ` | ` (ex. `42 | 42.0` ou `etait | était`).\n"
        "- Type: qualitatif -- la reponse est un developpement libre "
        "(analyse, dissertation, argumentation) qu'aucune formule ne "
        "verifie exactement. Fournis `MotsCles` : 3 a 6 mots ou courtes "
        "expressions que la reponse devrait contenir, separes par des "
        "virgules -- sert a estimer une couverture, pas une note exacte.\n"
        "Choisis le type le plus fiable a corriger pour CET exercice "
        "precis, pas un type unique impose par la matiere : un cours "
        "d'informatique peut avoir une question de cours (qualitatif) et un "
        "cours d'histoire une date a trouver (calcul).\n"
        "Chaque exercice s'appuie sur un passage precis du cours fourni : "
        "reprends-en le vocabulaire et les exemples plutot que des generalites "
        "sur la matiere. Si tu ne saurais pas dire d'ou vient l'exercice dans "
        "le cours, c'est qu'il n'a pas sa place dans ce TP.\n"
        "Contrainte de sortie : suis exactement le format demande, rien "
        "avant, rien apres, aucun bloc de code englobant l'ensemble."
    )


def demande_exercices(meta: dict, niveau: str, notions: list[str], md: str,
                      focus: str = "", questions: int = QUESTIONS_DEFAUT,
                      avec_code: bool = True) -> str:
    liste = "\n".join(f"- {n}" for n in notions)
    parts = repartition_paliers(questions)
    plan = "\n".join(f"- Palier {PALIERS.index(p) + 1} - {p} : {n} exercice(s)"
                     for p, n in parts)
    # Sans consigne, le TP balaie tout le cours ; avec, il creuse un point --
    # les autres notions ne servent alors qu'a eclairer celui-la.
    cadrage = (
        f"Sujet impose du TP : {focus}\n"
        "Tous les exercices portent la-dessus, du plus simple au plus fin. "
        "Les autres notions du cours n'apparaissent que si elles servent ce "
        "sujet. Si le cours n'en dit presque rien, dis-le dans le premier "
        "enonce et exerce ce qui s'en approche le plus.\n\n"
        if focus.strip() else
        "Le TP balaie tout le cours : repartis les notions ci-dessus entre "
        "les paliers, sans laisser de pan entier de cote.\n\n")
    return (
        f"Matiere : {meta['matiere']}\n"
        f"Cours   : {meta['titre']}\n"
        f"Niveau demande pour les exercices : {niveau}\n\n"
        "Voici le cours complet, pour que les exercices restent fideles a ce "
        "qui y est enseigne et ne debordent pas sur des notions absentes :\n\n"
        f"{md}\n\n"
        "Notions du cours a exercer :\n" + liste + "\n\n"
        + cadrage +
        f"Redige EXACTEMENT {questions} exercice(s) au total, dans cet ordre "
        "et selon cette repartition :\n" + plan + "\n"
        "Le champ Notion recopie a l'identique la notion concernee.\n"
        "Format de sortie EXACT, sans rien avant ni apres -- "
        + ("Stub/Tests uniquement si Type: code, " if avec_code else "")
        + "Reponse uniquement si Type: calcul, "
        "MotsCles uniquement si Type: qualitatif :\n\n"
        f"## Palier {PALIERS.index(parts[0][0]) + 1} - {parts[0][0]}\n"
        "### Exercice 1\n"
        "Notion: <notion recopiee a l'identique>\n"
        # L'exemple est la moitie de la consigne : montrer un exercice de code
        # a un cours qui n'en contient pas suffit a en faire produire.
        + ("Type: code\n"
           "Enonce: <la situation, puis le travail demande ; un schema ASCII "
           "entre lignes ``` s'il aide>\n"
           "Indice: ...\n"
           "Solution: ...\n"
           "Stub: def resoudre(...):\n    ...\n"
           "Tests: resoudre(2, 3) == 5 ; resoudre(0, 0) == 0\n"
           if avec_code else
           "Type: qualitatif\n"
           "Enonce: <la situation, puis le travail demande ; un schema ASCII "
           "entre lignes ``` s'il aide>\n"
           "Indice: ...\n"
           "Solution: ...\n"
           "MotsCles: premiere idee attendue, deuxieme idee, troisieme idee\n") +
        "### Exercice 2\n"
        "Notion: <notion recopiee a l'identique>\n"
        "Type: calcul\n"
        "Enonce: ...\n"
        "Indice: ...\n"
        "Solution: ...\n"
        "Reponse: 42\n"
        f"## Palier {PALIERS.index(parts[-1][0]) + 1} - {parts[-1][0]}\n"
        "...\n"
        "N'ecris que les paliers listes dans la repartition ci-dessus, "
        "aucun autre.\n"
    )


def consigne_fiche(langue: str = "fr") -> str:
    noms_langues = {
        "fr": "français", "en": "anglais", "es": "espagnol", "de": "allemand",
        "it": "italien", "pt": "portugais", "nl": "néerlandais", "pl": "polonais",
        "ru": "russe", "zh": "chinois", "ja": "japonais", "ko": "coréen",
        "ar": "arabe", "hi": "hindi", "tr": "turc", "sv": "suédois",
        "da": "danois", "no": "norvégien", "fi": "finnois", "cs": "tchèque",
        "hu": "hongrois", "ro": "roumain", "uk": "ukrainien", "el": "grec",
        "he": "hébreu", "th": "thaï", "vi": "vietnamien", "id": "indonésien",
    }
    nom_langue = noms_langues.get(langue, "français")
    return (
        f"Tu condenses le cours en une fiche de revision, en {nom_langue}, en "
        "Markdown Obsidian -- meme convention que le cours : encadres "
        "`> [!...]`, tableaux, ==surlignage==.\n\n"
        + PERSONA + "\n\n" + CHARTE + "\n\n"
        "Objectif de CETTE fiche : tenir sur une page ou deux, se relire en "
        "cinq minutes juste avant un controle. Pas de texte suivi : une "
        "notion = une ligne de tableau ou une puce, jamais un paragraphe. "
        "Garde le tableau Vocabulaire du cours s'il en existe un. Termine "
        "par un encadre `> [!tip] A retenir` avec les idees a ne surtout pas "
        "oublier.\n"
        "Contrainte de sortie : reponds uniquement par le contenu du fichier "
        ".md, en-tete YAML compris (matiere, titre, type: Fiche, date), "
        "aucun bloc de code englobant l'ensemble."
    )


def demande_fiche_ou_cartes(meta: dict, md: str) -> str:
    return f"Matiere : {meta['matiere']}\nCours : {meta['titre']}\n\n" + md


# --------------------------------------------------------- lecture des exercices

def _champ(bloc: str, nom: str) -> str:
    """Valeur d'un champ 'Nom: valeur', jusqu'au champ suivant ou la fin du bloc.

    Tolerant, comme le reste du pipeline : un modele qui glisse une ligne en
    trop ne doit pas faire perdre l'exercice entier."""
    suite = "|".join(CHAMPS_EXO)
    m = re.search(rf"{nom}\s*:\s*(.+?)(?=\n\s*(?:{suite})\s*:|\Z)", bloc,
                  re.IGNORECASE | re.DOTALL)
    return m.group(1).strip() if m else ""


def _palier(texte: str) -> str:
    """Un intitule libre de difficulte -> l'un des PALIERS.

    Le modele ecrit "## Palier 3 - moyen", "Niveau 2 : facile", ou traduit le
    nom du palier quand le TP n'est pas en francais. On reconnait donc le nom
    (du plus specifique au plus general, sinon "tres difficile" passerait pour
    "difficile"), et a defaut le numero du palier -- qui, lui, survit a la
    traduction.
    """
    t = unicodedata.normalize("NFKD", texte).encode("ascii", "ignore").decode()
    t = t.lower()
    for nom in ("tres difficile", "tres facile", "difficile", "facile", "moyen"):
        if nom in t:
            return nom
    if m := re.search(r"\b([1-5])\b", t):
        return PALIERS[int(m.group(1)) - 1]
    return "moyen"


def parser_exercices(brut: str, avec_code: bool = True) -> list[dict]:
    """Sortie du modele -> liste d'exercices, du plus simple au plus dur. Un
    `##` ouvre un palier, un `### Exercice` ouvre un exercice -- meme logique
    tolerante que plan_hierarchique dans generator.py : un modele qui devie un
    peu du format ne casse rien.

    Le tri final est le garde-fou de la progression : un modele qui sort ses
    paliers dans le desordre, ou qui range deux exercices durs au palier 1,
    donnerait sinon un TP qui ne monte pas.

    Champs communs : notion, palier, enonce, indice, solution, type.
    Champs specifiques a `type` (listes deja eclatees, jamais absentes -- une
    liste vide se teste comme un champ manquant, pas d'exception a prevoir
    cote appelant) :
      code       -> stub (str), tests (list[str], expressions booleennes)
      calcul     -> reponses (list[str], formes acceptees)
      qualitatif -> mots_cles (list[str])
    Un type absent ou non reconnu retombe sur "qualitatif" a mots_cles vide :
    l'exercice reste affichable, juste non auto-corrigeable (cf. frontend,
    qui bascule alors sur l'auto-declaration comme avant cette fonctionnalite).
    """
    exercices = []
    titres = list(re.finditer(r"^##\s+(.+?)\s*$", brut, re.MULTILINE))
    for i, m in enumerate(titres):
        entete = m.group(1).strip(" *_")
        fin = titres[i + 1].start() if i + 1 < len(titres) else len(brut)
        bloc_notion = brut[m.end():fin]
        for exo in re.finditer(r"###\s*Exercice.*?$(.*?)(?=^###\s*Exercice|\Z)",
                               bloc_notion, re.MULTILINE | re.DOTALL):
            corps = exo.group(1)
            type_ = _champ(corps, "Type").strip().lower()
            tests = [t.strip() for t in _champ(corps, "Tests").split(";")
                     if t.strip()]
            if type_ not in TYPES_EXO:
                type_ = "qualitatif"
            # Un exercice de code sans tests ne se corrige pas (le TP repond
            # "0 test" et l'etudiant reste devant un editeur inutile), et un
            # exercice de code sur un cours qui n'en contient pas n'aurait
            # jamais du sortir. Dans les deux cas il reste lisible en
            # qualitatif : c'est l'enonce qui compte, la note se rattrape a
            # l'auto-declaration.
            if type_ == "code" and (not tests or not avec_code):
                type_ = "qualitatif"
                tests = []
            exercices.append({
                # Le titre `##` sert de repli pour la notion : c'est ce qu'il
                # portait avant les paliers, et un vieux TP doit rester lisible.
                "notion": _champ(corps, "Notion") or entete,
                "palier": _palier(_champ(corps, "Difficulte") or entete),
                "type": type_,
                "enonce": _champ(corps, "Enonce"),
                "indice": _champ(corps, "Indice"),
                "solution": _champ(corps, "Solution"),
                "stub": _champ(corps, "Stub") if type_ == "code" else "",
                "tests": tests,
                "reponses": [r.strip() for r in _champ(corps, "Reponse").split("|")
                            if r.strip()],
                "mots_cles": [c.strip() for c in _champ(corps, "MotsCles").split(",")
                             if c.strip()],
            })
    exercices.sort(key=lambda e: PALIERS.index(e["palier"]))   # tri stable
    return exercices


# --------------------------------------------------------- le programme genere

# Le TP genere est un fichier unique et autonome : il vit a cote du cours, dans
# un coffre qu'on synchronise ou qu'on deplace, souvent sur un autre PC que
# celui qui l'a fabrique. Donc zero dependance (stdlib seule), zero appel
# reseau, zero chemin vers l'application : il sert sa propre page sur
# 127.0.0.1 et l'ouvre dans le navigateur deja installe.
# Chaine brute (r'''): son contenu n'est pas du texte a interpreter ici, c'est
# du code source a ecrire tel quel -- les \n qu'elle contient sont ceux du
# programme genere, pas les notres. Seuls les __MARQUEURS__ sont remplaces.
GABARIT_TP = r'''#!/usr/bin/env python3
__PEP723__"""TP personnel genere depuis un cours par exercices.py.

Ouvre une petite page dans le navigateur : un exercice a la fois, du palier le
plus simple au plus dur, note sur 100. Rien a installer, rien a connecter --
tout le TP tient dans ce fichier.

Genere : relance exercices.py si le cours change, plutot que d'editer ici.
Lancer :  python ce_fichier.py   (ou le .bat / .sh depose a cote)
"""

import http.server
import json
import subprocess
import sys
import tempfile
import threading
import webbrowser
from pathlib import Path

# La console Windows tourne en cp1252 : un titre accentue, ou des libelles en
# grec ou en japonais, suffisaient a la faire planter sur un UnicodeEncodeError.
# On garde son encodage -- elle seule sait ce qu'elle affiche -- et on relache
# le sort des caracteres inconnus : ils sortent en "?" au lieu d'interrompre.
sys.stdout.reconfigure(errors="replace")

TITRE = __TITRE__
MATIERE = __MATIERE__
NIVEAU = __NIVEAU__
PALIERS = __PALIERS__
MOTS = __MOTS__
LANGUE = __LANGUE__
EXERCICES = __EXERCICES__

MARQUEUR = "###RESULTATS###"


def corriger_code(code, tests):
    """Fait tourner le code de l'etudiant contre ses tests, dans un
    sous-processus separe : une boucle infinie ou un plantage ne doit jamais
    emporter le TP avec lui.

    Chaque test est protege individuellement -- un test qui leve compte comme
    rate, il n'empeche pas les suivants de tourner. "erreur" ne porte donc que
    les soucis du code lui-meme (syntaxe, exception a l'import).
    """
    if not tests:
        return {"reussis": 0, "total": 0, "erreur": "0 test"}
    lignes = "\n".join(
        "try:\n    __R__.append(bool(%s))\nexcept Exception:\n    __R__.append(False)\n" % t
        for t in tests)
    script = (code + "\n\n__R__ = []\n" + lignes +
              "\nprint(%r + ''.join('1' if r else '0' for r in __R__))\n" % MARQUEUR)
    with tempfile.TemporaryDirectory() as dossier:
        essai = Path(dossier) / "essai.py"
        essai.write_text(script, encoding="utf-8")
        try:
            r = subprocess.run([sys.executable, str(essai)], capture_output=True,
                               text=True, encoding="utf-8", errors="replace",
                               timeout=10)
        except subprocess.TimeoutExpired:
            return {"reussis": 0, "total": len(tests), "erreur": "timeout 10s"}
    if r.returncode != 0:
        return {"reussis": 0, "total": len(tests),
                "erreur": (r.stderr or r.stdout or "?")[-500:]}
    ligne = next((l for l in r.stdout.splitlines() if l.startswith(MARQUEUR)), "")
    if not ligne:
        return {"reussis": 0, "total": len(tests), "erreur": "?"}
    return {"reussis": ligne[len(MARQUEUR):].count("1"), "total": len(tests),
            "erreur": None}


# Brute (r"""): le \s d'une expression reguliere JavaScript n'est pas une
# echappee Python, et Python s'en plaindrait a chaque lancement du TP.
# Aucun libelle n'est ecrit en dur ici : tout vient de MOTS, donc de --langue.
PAGE = r"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TP</title>
<style>
/* Les memes gris et le meme violet que l'application : le TP est une piece
   d'Incipit, pas une page d'un autre logiciel. Le vert et le rouge ne restent
   que sur les verdicts, ou la couleur porte le sens. */
:root { color-scheme: dark; --violet: #7c3aed; --violet-clair: #a78bfa; }
* { box-sizing: border-box; }
body { margin: 0; background: #1e1e1e; color: #e8e8e8;
       font: 15px/1.55 system-ui, "Segoe UI", Roboto, sans-serif; }
.page { max-width: 840px; margin: 0 auto; padding: 26px 20px 60px; }
h1 { font-size: 20px; margin: 0 0 3px; }
h2 { font-size: 17px; margin: 0 0 10px; }
.discret { color: #9a9a9a; font-size: 13px; margin: 0; }
.jauge { height: 8px; background: #333; border-radius: 99px; margin-top: 12px;
         overflow: hidden; }
.jauge i { display: block; height: 100%; width: 0;
           background: linear-gradient(90deg, var(--violet), var(--violet-clair));
           transition: width .25s; }
.note { float: right; font-weight: 600; }
[dir="rtl"] .note { float: left; }
.carte { background: #252525; border: 1px solid #333; border-radius: 12px;
         padding: 18px; margin-top: 18px; }
.ligne { display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
         font-size: 13px; color: #9a9a9a; }
.ligne .fin { margin-inline-start: auto; }
.badge { background: #2d2d2d; border: 1px solid var(--violet); border-radius: 99px;
         padding: 2px 10px; color: var(--violet-clair); }
.enonce { font-size: 16px; margin: 14px 0 12px; white-space: pre-wrap; }
/* Un schema ASCII : chasse fixe et pas de retour a la ligne automatique,
   sinon les colonnes ne tombent plus en face les unes des autres. */
.enonce .schema { font-family: ui-monospace, Consolas, monospace; font-size: 13px;
                  line-height: 1.35; background: #1e1e1e; border: 1px solid #333;
                  border-inline-start: 3px solid var(--violet); border-radius: 8px;
                  padding: 10px 12px; margin: 10px 0; overflow-x: auto;
                  white-space: pre; direction: ltr; text-align: left; }
textarea, input { width: 100%; background: #1e1e1e; color: #e8e8e8;
                  border: 1px solid #333; border-radius: 8px; padding: 8px 10px;
                  font: inherit; }
textarea:focus, input:focus { outline: none; border-color: var(--violet);
                              box-shadow: 0 0 0 1px var(--violet); }
textarea { min-height: 90px; resize: vertical; }
textarea.code { font-family: ui-monospace, Consolas, monospace; font-size: 13px;
                min-height: 190px; white-space: pre; direction: ltr;
                text-align: left; }
.aide { background: #1e1e1e; border-inline-start: 3px solid var(--violet);
        padding: 9px 12px; margin-top: 12px; white-space: pre-wrap;
        font-size: 14px; color: #cfcfcf; }
.retour { margin-top: 12px; font-size: 14px; min-height: 20px; }
.ok { color: #4ade80; } .ko { color: #f87171; }
.boutons { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
button { background: #2d2d2d; color: #e8e8e8; border: 1px solid #333;
         border-radius: 8px; padding: 7px 14px; font: inherit; cursor: pointer; }
button:hover { background: #3d3d3d; border-color: #4a4455; }
button.primaire { background: linear-gradient(180deg, #8b5cf6 0%, #7c3aed 45%,
                  #6d28d9 100%); border-color: #6d28d9; color: #fff;
                  font-weight: 600; }
button.primaire:hover { background: linear-gradient(180deg, #9d75f9 0%, #8b5cf6 45%,
                        #7c3aed 100%); }
button:focus-visible { outline: 2px solid var(--violet-clair); outline-offset: 2px; }
button:disabled { opacity: .5; cursor: default; }
table { width: 100%; border-collapse: collapse; margin: 4px 0 18px; font-size: 14px; }
td { padding: 6px 0; border-bottom: 1px solid #333; }
td:last-child { text-align: end; color: #9a9a9a; white-space: nowrap; }
[hidden] { display: none !important; }
</style>
</head>
<body>
<div class="page">

  <header>
    <span class="note" id="note"></span>
    <h1 id="titre"></h1>
    <p class="discret" id="sous-titre"></p>
    <div class="jauge"><i id="jauge"></i></div>
  </header>

  <main class="carte" id="carte">
    <div class="ligne">
      <span class="badge" id="palier"></span>
      <span id="notion"></span>
      <span class="fin" id="avance"></span>
    </div>
    <div class="enonce" id="enonce"></div>
    <div id="zone"></div>
    <p class="aide" id="indice" hidden></p>
    <p class="aide" id="solution" hidden></p>
    <p class="retour" id="retour"></p>
    <div class="boutons">
      <button class="primaire" id="b-verifier"></button>
      <button id="b-indice"></button>
      <button id="b-solution"></button>
      <button id="b-suivant"></button>
    </div>
  </main>

  <section class="carte" id="bilan" hidden>
    <h2 id="bilan-titre"></h2>
    <p class="discret" id="titre-paliers"></p>
    <table id="bilan-paliers"></table>
    <p class="discret" id="titre-notions"></p>
    <table id="bilan-notions"></table>
    <div class="boutons">
      <button class="primaire" id="b-refaire"></button>
      <button id="b-quitter"></button>
    </div>
  </section>

</div>
<script>
const D = __DONNEES__;
const M = D.mots;
const EX = D.exercices;
const ORDRE = Object.keys(D.paliers);
const $ = (id) => document.getElementById(id);
let i = 0;

// En arabe ou en hebreu, l'algorithme bidi lit "0 / 100" a l'envers et affiche
// "100 / 0" : le / entre deux nombres est un caractere neutre, il prend le sens
// du paragraphe. On isole donc chaque fraction (U+2066 ... U+2069), sans effet
// visible dans les langues qui s'ecrivent de gauche a droite.
const num = (s) => '⁦' + s + '⁩';

// La note se calcule toujours sur le TOTAL des exercices, pas sur les seuls
// deja corriges : un TP a moitie fait ne doit pas afficher un score gonfle.
function note() {
  const somme = EX.reduce((a, e) => a + (e._pts || 0), 0);
  return Math.round(somme / EX.length * 100);
}

function majNote() {
  $('note').textContent = num(note() + ' / 100');
  $('jauge').style.width = note() + '%';
}

function dire(texte, ok) {
  const el = $('retour');
  el.textContent = texte;
  el.className = 'retour' + (ok === null ? '' : (ok ? ' ok' : ' ko'));
}

// Comparaison indulgente : accents, majuscules et espaces en trop ne doivent
// pas transformer une bonne reponse en faute.
function nu(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

// Un enonce peut porter un schema ASCII entre deux lignes ``` : hors bloc
// c'est du texte, dedans une figure a chasse fixe. textContent partout, jamais
// innerHTML : ce que le modele a ecrit reste du texte, pas du HTML.
function poserEnonce(el, texte) {
  el.textContent = '';
  String(texte || '').split('```').forEach((bout, n) => {
    if (!bout) return;
    if (n % 2 === 0) { el.append(document.createTextNode(bout)); return; }
    const pre = document.createElement('pre');
    pre.className = 'schema';
    // ```mermaid, ```text... : la langue eventuelle du bloc n'est pas du dessin
    pre.textContent = bout.replace(/^[a-zA-Z]*\n/, '').replace(/\n\s*$/, '');
    el.append(pre);
  });
}

function afficher() {
  document.querySelectorAll('.autonote').forEach((x) => x.remove());
  const e = EX[i];
  const rang = ORDRE.indexOf(e.palier) + 1;
  $('palier').textContent = M.palier + ' ' + num(rang + '/' + ORDRE.length)
    + ' — ' + (D.paliers[e.palier] || e.palier);
  $('notion').textContent = e.notion;
  $('avance').textContent = num((i + 1) + ' / ' + EX.length);
  poserEnonce($('enonce'), e.enonce);
  $('indice').textContent = e.indice;
  $('indice').hidden = true;
  $('solution').textContent = e.solution;
  $('solution').hidden = true;
  $('b-indice').hidden = !e.indice;
  $('b-solution').hidden = !e.solution;
  $('b-verifier').disabled = false;
  $('b-suivant').textContent = (i === EX.length - 1) ? M.bilan : M.suivant;
  dire('', null);

  const zone = $('zone');
  zone.innerHTML = '';
  const champ = document.createElement(e.type === 'calcul' ? 'input' : 'textarea');
  champ.id = 'reponse';
  if (e.type === 'code') {
    champ.className = 'code';
    champ.spellcheck = false;
    champ.value = e.stub || '';
  } else {
    champ.placeholder = M.reponse;
  }
  zone.appendChild(champ);
  champ.focus();
  majNote();
}

// Ni reponse ni mots-cles fournis pour cet exercice : aucune verite-terrain a
// comparer, donc on montre la solution et l'etudiant se note lui-meme plutot
// que de perdre l'exercice.
function autoNote() {
  $('solution').hidden = false;
  dire(M.autocorrige, null);
  const boite = document.createElement('div');
  boite.className = 'autonote boutons';
  [[M.juste, 1, true], [M.moitie, 0.5, null], [M.faux, 0, false]]
    .forEach(([texte, pts, ok]) => {
      const b = document.createElement('button');
      b.textContent = texte;
      b.onclick = () => { EX[i]._pts = pts; dire(texte, ok); majNote(); };
      boite.appendChild(b);
    });
  $('retour').after(boite);
}

async function verifier() {
  document.querySelectorAll('.autonote').forEach((x) => x.remove());
  const e = EX[i];
  const rep = $('reponse').value;

  if (e.type === 'code') {
    $('b-verifier').disabled = true;
    dire(M.execution, null);
    try {
      const reponse = await fetch('/corriger', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: i, code: rep }),
      });
      const r = await reponse.json();
      if (r.erreur) {
        e._pts = 0;
        dire(M.erreur + ' : ' + r.erreur, false);
      } else {
        e._pts = r.total ? r.reussis / r.total : 0;
        dire(num(r.reussis + '/' + r.total) + ' ' + M.tests, r.reussis === r.total);
        if (r.reussis < r.total) $('solution').hidden = false;
      }
    } catch (err) {
      dire(M.erreur + ' : ' + err, false);
    }
    $('b-verifier').disabled = false;
    majNote();
    return;
  }

  if (e.type === 'calcul' && e.reponses.length) {
    const dite = nu(rep);
    const juste = e.reponses.some((r) => {
      if (nu(r) === dite) return true;
      const a = parseFloat(String(r).replace(',', '.'));
      const b = parseFloat(String(rep).replace(',', '.'));
      return !isNaN(a) && !isNaN(b) && Math.abs(a - b) < 1e-6;
    });
    e._pts = juste ? 1 : 0;
    dire(juste ? M.juste : M.faux, juste);
    if (!juste) $('solution').hidden = false;
    majNote();
    return;
  }

  if (e.type === 'qualitatif' && e.mots_cles.length) {
    const dite = nu(rep);
    const vus = e.mots_cles.filter((m) => dite.includes(nu(m)));
    const manque = e.mots_cles.filter((m) => !vus.includes(m));
    e._pts = vus.length / e.mots_cles.length;
    dire(num(vus.length + '/' + e.mots_cles.length) + ' ' + M.idees
      + (manque.length ? ' — ' + M.manque + ' : ' + manque.join(', ') : ''),
      vus.length === e.mots_cles.length);
    $('solution').hidden = false;
    majNote();
    return;
  }

  autoNote();
}

function suivant() {
  if (i < EX.length - 1) { i += 1; afficher(); return; }
  bilan();
}

function remplir(table, groupes) {
  table.innerHTML = '';
  groupes.forEach(([nom, v]) => {
    const tr = table.insertRow();
    tr.insertCell().textContent = nom;
    tr.insertCell().textContent = num(Math.round(v.pts / v.total * 100) + ' / 100');
  });
}

function grouper(cle) {
  const par = {};
  EX.forEach((e) => {
    const k = cle(e);
    par[k] = par[k] || { pts: 0, total: 0 };
    par[k].pts += e._pts || 0;
    par[k].total += 1;
  });
  return par;
}

function bilan() {
  $('carte').hidden = true;
  const paliers = grouper((e) => e.palier);
  remplir($('bilan-paliers'), ORDRE.filter((p) => paliers[p])
    .map((p) => [D.paliers[p] || p, paliers[p]]));
  remplir($('bilan-notions'), Object.entries(grouper((e) => e.notion)));
  const n = note();
  $('bilan-titre').textContent = M.tp_fini + ' : ' + num(n + ' / 100') + ' — ' + (
    n >= 90 ? M.v90 : n >= 70 ? M.v70 : n >= 40 ? M.v40 : M.v0);
  $('bilan').hidden = false;
  $('avance').textContent = M.tp_fini;
  majNote();
}

function refaire() {
  EX.forEach((e) => { delete e._pts; });
  i = 0;
  $('bilan').hidden = true;
  $('carte').hidden = false;
  afficher();
}

document.documentElement.lang = D.langue;
document.documentElement.dir = D.sens;
$('titre').textContent = M.tp + ' : ' + D.titre;
$('sous-titre').textContent = D.matiere + ' — ' + M.niveau + ' ' + D.niveau
  + ' — ' + EX.length + ' ' + M.progression;
document.title = M.tp + ' : ' + D.titre;
$('b-verifier').textContent = M.verifier;
$('b-indice').textContent = M.indice;
$('b-solution').textContent = M.solution;
$('b-refaire').textContent = M.recommencer;
$('b-quitter').textContent = M.fermer;
$('titre-paliers').textContent = M.par_palier;
$('titre-notions').textContent = M.par_notion;
$('b-verifier').onclick = verifier;
$('b-indice').onclick = () => { $('indice').hidden = false; };
$('b-solution').onclick = () => { $('solution').hidden = false; };
$('b-suivant').onclick = suivant;
$('b-refaire').onclick = refaire;
$('b-quitter').onclick = async () => {
  await fetch('/quitter', { method: 'POST' }).catch(() => {});
  document.body.textContent = M.ferme;
  document.body.style.padding = '26px';
};
afficher();
</script>
</body>
</html>
"""


def page():
    """La page du TP, ses donnees injectees dedans.

    Injecter plutot que servir un second fichier garde le TP en un seul
    morceau. Le `</` echappe est la seule precaution qui compte : une solution
    qui contiendrait `</script>` fermerait sinon le script en plein milieu.
    """
    donnees = json.dumps({"titre": TITRE, "matiere": MATIERE, "niveau": NIVEAU,
                          "paliers": PALIERS, "mots": MOTS, "langue": LANGUE,
                          "sens": "ltr", "exercices": EXERCICES},
                         ensure_ascii=False).replace("</", "<\\/")
    return PAGE.replace("__DONNEES__", donnees)


class Poste(http.server.BaseHTTPRequestHandler):
    """Le strict necessaire : la page, la correction du code, l'arret."""

    def log_message(self, *a):
        pass            # la console reste lisible : elle n'affiche que l'URL

    def _rendre(self, corps, mime, code=200):
        self.send_response(code)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def do_GET(self):
        if self.path.split("?")[0] not in ("/", "/index.html"):
            self._rendre(b"404", "text/plain; charset=utf-8", 404)
            return
        self._rendre(page().encode("utf-8"), "text/html; charset=utf-8")

    def do_POST(self):
        if self.path == "/quitter":
            self._rendre(b"{}", "application/json")
            # Depuis le thread qui sert la requete, shutdown() s'attendrait
            # lui-meme : il lui faut son propre thread.
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        if self.path != "/corriger":
            self._rendre(b"{}", "application/json", 404)
            return
        taille = int(self.headers.get("Content-Length") or 0)
        envoi = json.loads(self.rfile.read(taille) or b"{}")
        index = envoi.get("index")
        if not isinstance(index, int) or not 0 <= index < len(EXERCICES):
            self._rendre(b'{"erreur": "index"}', "application/json", 400)
            return
        resultat = corriger_code(envoi.get("code", ""),
                                 EXERCICES[index].get("tests", []))
        self._rendre(json.dumps(resultat).encode("utf-8"), "application/json")


def executer():
    """Sert le TP en local et l'ouvre dans le navigateur."""
    # Port 0 : le systeme en choisit un libre. En coder un en dur ferait
    # echouer le second TP ouvert en meme temps que le premier.
    serveur = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Poste)
    url = "http://127.0.0.1:%d/" % serveur.server_port
    print("%s : %s (%s)" % (MOTS["tp"], TITRE, MATIERE))
    print(url)
    print(MOTS["arret"])
    webbrowser.open(url)
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        pass
    print(MOTS["tp_fini"])


if __name__ == "__main__":
    if "--verifier" in sys.argv:
        # Controle de bonne sante appele par exercices.py : la page se
        # fabrique-t-elle, et la correction de code repond-elle vraiment ?
        sys.stdout.write(page())
        print(corriger_code("def f(x):\n    return x * 2\n",
                            ["f(2) == 4", "f(3) == 9"]))
    else:
        executer()
'''


def script_exercices(titre: str, matiere: str, niveau: str,
                     exercices: list[dict], langue: str = "fr") -> str:
    """Le texte du TP : une petite application autonome, notee sur 100.

    Les exercices sont injectes comme donnees pures (json.dumps rend un
    litteral Python valide pour des chaines et des listes) : le programme
    genere ne fait aucun appel au modele, il rejoue ce qui a ete prepare une
    fois. Aucune dependance non plus -- `python ce_fichier.py` suffit, `uv`
    n'est pas requis.

    `langue` ne sert qu'au decor : les enonces, eux, sont deja rediges dans
    cette langue par le modele.
    """
    mots = mots_tp(langue)
    # L'en-tete PEP 723 : ce que lit `uv run --script`, le dernier recours du
    # lanceur quand le poste n'a aucun Python (uv en telecharge un). Assemble
    # ici et pas ecrit dans GABARIT_TP : uv refuse un fichier qui contient deux
    # blocs, et exercices.py a deja le sien en tete.
    pep723 = ("# " + '/// script\n# requires-python = ">=3.11"\n'
              "# dependencies = []\n# " + "///\n")
    valeurs = {
        "__TITRE__": titre, "__MATIERE__": matiere, "__NIVEAU__": niveau,
        "__PALIERS__": {p: mots[f"p{n}"] for n, p in enumerate(PALIERS, 1)},
        "__MOTS__": mots, "__LANGUE__": langue,
        "__EXERCICES__": exercices,
    }
    source = GABARIT_TP.replace("__PEP723__", pep723)
    for marque, valeur in valeurs.items():
        source = source.replace(marque, json.dumps(valeur, ensure_ascii=False,
                                                   indent=2))
    return source


def lanceur_tp(nom_script: str, platform: str) -> str:
    """Le double-clic du TP : extension selon l'OS.

    Le TP n'est qu'un fichier .py, qu'un double-clic ouvre dans un editeur
    plutot que de le lancer sur la plupart des postes -- d'ou ces lignes
    de colle. `nom_script` est relatif au lanceur (.tp/<cours>_exercices.py),
    qui commence par se placer dans son propre dossier.

    platform: "win32" -> .bat, "darwin" -> .command, "linux" -> .sh
    """
    if platform == "win32":
        # %~dp0 : le dossier du .bat. Sans lui, un lancement depuis un autre
        # dossier chercherait le .py au mauvais endroit.
        return (
            "@echo off\r\n"
            "rem Ouvre le TP dans le navigateur. Ferme cette fenetre pour l'arreter.\r\n"
            'cd /d "%~dp0"\r\n'
            f'set "TP={nom_script.replace("%", "%%")}"\r\n'
            "\r\n"
            "rem Chaque interpreteur est essaye pour de vrai (-c \"\") avant qu'on lui\r\n"
            "rem confie le TP : `where python` peut repondre oui sur l'alias du Microsoft\r\n"
            "rem Store, qui n'ouvre que la boutique, et `py` manque sur bien des postes.\r\n"
            'py -3 -c "" >nul 2>&1 && (py -3 "%TP%" & goto :fin)\r\n'
            'python -c "" >nul 2>&1 && (python "%TP%" & goto :fin)\r\n'
            'python3 -c "" >nul 2>&1 && (python3 "%TP%" & goto :fin)\r\n'
            "\r\n"
            "rem Aucun Python sur le poste : uv sait en telecharger un tout seul, et il\r\n"
            "rem est deja la des qu'Incipit a tourne ici.\r\n"
            'uv --version >nul 2>&1 && (uv run --script "%TP%" & goto :fin)\r\n'
            'if exist "%USERPROFILE%\\.local\\bin\\uv.exe" '
            '("%USERPROFILE%\\.local\\bin\\uv.exe" run --script "%TP%" & goto :fin)\r\n'
            "\r\n"
            "echo Python introuvable. Installe-le depuis https://www.python.org/downloads/\r\n"
            'echo (coche "Add python.exe to PATH"), ou ouvre le TP depuis Incipit.\r\n'
            "pause\r\n"
            "exit /b 1\r\n"
            "\r\n"
            ":fin\r\n"
            "if errorlevel 1 pause\r\n"
        )
    # macOS (.command) et Linux (.sh) : meme contenu, extension differente
    return (
        "#!/bin/sh\n"
        "# Ouvre le TP dans le navigateur. Ctrl+C pour l'arreter.\n"
        'cd "$(dirname "$0")" || exit 1\n'
        "for py in python3 python; do\n"
        f'  command -v "$py" >/dev/null 2>&1 && exec "$py" "{nom_script}"\n'
        "done\n"
        "# Aucun Python : uv sait en telecharger un tout seul.\n"
        'for uv in uv "$HOME/.local/bin/uv"; do\n'
        f'  command -v "$uv" >/dev/null 2>&1 && exec "$uv" run --script "{nom_script}"\n'
        "done\n"
        'echo "Python introuvable : installe python3 (ou uv) puis relance."\n'
        "exit 1\n"
    )


# ------------------------------------------------------------------- pipeline

def fabriquer(source: Path, niveau: str, cle_env: Path, moteur: str,
             modele: str | None, langue: str = "fr",
             faire_tp: bool = True, faire_fiche: bool = True,
             focus: str = "", questions: int = QUESTIONS_DEFAUT) -> None:
    """Lit le cours, genere les supports demandes, les ecrit a cote du cours."""
    if souci := probleme(moteur, cle_env):
        raise SystemExit(souci)
    md = source.read_text(encoding="utf-8", errors="replace")
    meta = meta_du_cours(md, source)
    notions = notions_du_cours(md)
    if not notions:
        raise SystemExit("Aucune notion trouvee (pas de titre ## ou ### dans "
                          f"{source}).")
    cle = cle_du_moteur(moteur, cle_env)
    modele = modele_retenu(moteur, modele, cle_env)
    print(f". {MOTEURS[moteur].libelle}, {len(notions)} notion(s) reperee(s)")
    faits = []

    if faire_tp:
        # Ce que le cours contient decide de ce que le TP peut demander : sans
        # Python dedans, pas de fonction a completer (cf. cours_avec_code).
        avec_code = cours_avec_code(md)
        print(". Generation des exercices (TP)"
              + ("..." if avec_code else " -- sans code, le cours n'en a pas..."))
        brut = repondre(moteur, modele, cle,
                        consigne_exercices(langue, avec_code),
                        demande_exercices(meta, niveau, notions, md, focus,
                                          questions, avec_code),
                        cle_env=cle_env, max_jetons=jetons_exos(questions))
        exos = parser_exercices(nettoyer(brut), avec_code)
        dest_py = chemin_tp(source, "_exercices.py")
        dest_py.parent.mkdir(parents=True, exist_ok=True)
        dest_py.write_text(script_exercices(meta["titre"], meta["matiere"], niveau,
                                            exos, langue), encoding="utf-8")
        # Memes donnees que le TP, pour l'interface web qui le fait passer
        # dans sa propre fenetre plutot que dans le navigateur.
        dest_json = chemin_tp(source, "_exercices.json")
        dest_json.write_text(json.dumps(exos, ensure_ascii=False, indent=2),
                             encoding="utf-8")
        faits.append(dest_py)
        faits.append(dest_json)
        print(f". Exercices ecrits : {dest_py}")

        # Un seul lanceur, celui du systeme d'ici : c'est le seul fichier de TP
        # visible a cote du cours. Les vieilles versions en deposaient quatre --
        # on efface ce qu'on remplace, sinon le dossier ne desenfle jamais.
        platform = sys.platform
        if platform == "win32":
            suffixe = "_TP.bat"
        elif platform == "darwin":
            suffixe = "_TP.command"
        else:
            suffixe = "_TP.sh"
        lanceur = source.with_name(source.stem + suffixe)
        # Le nettoyage doit precede l'ecriture : il balaie aussi "_TP.bat" /
        # "_TP.sh" / "_TP.command", qui inclut le nom du lanceur qu'on vient
        # de choisir -- fait apres coup, il effacait le fichier tout juste ecrit.
        for vieux in ("_exercices.py", "_exercices.json",
                      "_TP.bat", "_TP.sh", "_TP.command"):
            source.with_name(source.stem + vieux).unlink(missing_ok=True)
        lanceur.write_text(lanceur_tp(f"{DOSSIER_TP}/{dest_py.name}", platform),
                           encoding="utf-8", newline="")
        if platform != "win32":
            lanceur.chmod(0o755)     # sinon il n'est pas executable
        faits.append(lanceur)
        print(f". Lanceur ecrit : {lanceur.name}")

    if faire_fiche:
        print(". Generation de la fiche de revision...")
        fiche = nettoyer(repondre(moteur, modele, cle, consigne_fiche(langue),
                                  demande_fiche_ou_cartes(meta, md),
                                  cle_env=cle_env, max_jetons=MAX_JETONS_FICHE))
        dest_fiche = source.with_name(source.stem + "_fiche.md")
        dest_fiche.write_text(fiche, encoding="utf-8")
        print(f". Fiche ecrite : {dest_fiche}")
        faits.append(dest_fiche)

    if not faits:
        raise SystemExit("Aucun support demande a generer.")
    
    return faits


# ----------------------------------------------------------------- self-test

def _self_test() -> None:
    md = (
        "---\nmatiere: Maths\ntitre: Suites\n---\n"
        "## Convergence\ntexte\n### Critere de Cauchy\ntexte\n"
        "## Vocabulaire a retenir\n| mot | def |\n"
        "## Recapitulatif\ntexte\n"
    )
    assert meta_du_cours(md, Path("suites.md")) == {"matiere": "Maths",
                                                     "titre": "Suites"}
    sans_entete = meta_du_cours("# rien\n", Path("mon_cours.md"))
    assert sans_entete["matiere"] == "Divers"
    assert sans_entete["titre"] == "mon cours"

    notions = notions_du_cours(md)
    assert notions == ["Convergence", "Critere de Cauchy"], notions

    for exige in ("QUI TU ES", "CHARTE NON NEGOCIABLE"):
        assert exige in consigne_exercices("fr")
        assert exige in consigne_fiche("fr")

    consigne_en = consigne_exercices("en")
    assert "en anglais" in consigne_en

    # Un TP court garde des marches ecartees, un TP long les remplit toutes :
    # dans les deux cas le total demande est exactement celui rendu.
    for combien in (1, 2, 3, 4, 5, 7, 12, 20):
        parts = repartition_paliers(combien)
        assert sum(n for _, n in parts) == combien, (combien, parts)
        assert [p for p, _ in parts] == sorted({p for p, _ in parts},
                                               key=PALIERS.index), parts
    assert repartition_paliers(5) == [(p, 1) for p in PALIERS]
    assert [p for p, _ in repartition_paliers(3)] == ["tres facile", "moyen",
                                                      "tres difficile"]
    assert repartition_paliers(12) == [("tres facile", 3), ("facile", 3),
                                       ("moyen", 2), ("difficile", 2),
                                       ("tres difficile", 2)]
    assert repartition_paliers(0) == repartition_paliers(1)   # jamais vide

    # Le cadrage du TP : sans consigne il balaie le cours, avec il ne parle que
    # du sujet demande -- et le nombre annonce est celui du plan.
    large = demande_exercices({"matiere": "M", "titre": "T"}, "n", ["A", "B"], md)
    assert "balaie tout le cours" in large and "EXACTEMENT 5 exercice" in large
    pointu = demande_exercices({"matiere": "M", "titre": "T"}, "n", ["A", "B"],
                               md, focus="les suites de Cauchy", questions=3)
    assert "Sujet impose du TP : les suites de Cauchy" in pointu
    assert "EXACTEMENT 3 exercice" in pointu and "Palier 3 - moyen : 1" in pointu
    assert "Palier 2 - facile" not in pointu   # palier saute : pas dans le plan

    # Toute langue offerte par --langue doit avoir TOUS ses libelles : une cle
    # oubliee ne se verrait qu'a l'ecran, en "undefined" au milieu du TP.
    for code_langue in LANGUES_APP:
        assert code_langue in MOTS_TP, code_langue
        manquantes = set(CLES_MOTS) - set(MOTS_TP[code_langue])
        assert not manquantes, (code_langue, manquantes)
        assert not set(MOTS_TP[code_langue]) - set(CLES_MOTS), code_langue
        assert all(MOTS_TP[code_langue].values()), code_langue
    assert mots_tp("en")["verifier"] == "Check"
    assert mots_tp("zz") is MOTS_TP["en"]      # langue inconnue -> anglais

    # Le nom du palier passe avant son numero, les accents et la traduction ne
    # doivent pas le perdre, et "tres difficile" ne doit jamais etre lu
    # "difficile" -- l'ordre du TP en depend entierement.
    assert _palier("## Palier 5 - tres difficile") == "tres difficile"
    assert _palier("Palier 4 : difficile") == "difficile"
    assert _palier("très facile") == "tres facile"
    assert _palier("Level 3") == "moyen"          # traduit : reste le numero
    assert _palier("n'importe quoi") == "moyen"   # illisible : jamais d'exception

    # Paliers volontairement dans le desordre : c'est le tri qui garantit la
    # progression, pas la docilite du modele.
    brut = (
        "## Palier 5 - tres difficile\n"
        "### Exercice 1\n"
        "Notion: Notion B\n"
        "Enonce: Question dure.\n"
        "Indice: Indice dur.\n"
        "Solution: Solution dure.\n"
        "## Palier 1 - tres facile\n"
        "### Exercice 1\n"
        "Notion: Notion A\n"
        "Type: code\n"
        "Enonce: Fais ceci.\n"
        "Indice: Pense a cela.\n"
        "Solution: Voici pourquoi.\n"
        "Stub: def f(x):\n    ...\n"
        "Tests: f(2) == 4 ; f(0) == 0\n"
        "### Exercice 2\n"
        "Notion: Notion A\n"
        "Type: calcul\n"
        "Enonce: Fais autre chose.\n"
        "Indice: Un indice.\n"
        "Solution: Une solution.\n"
        "Reponse: 42 | 42.0\n"
    )
    exos = parser_exercices(brut)
    assert len(exos) == 3, exos
    assert [e["palier"] for e in exos] == ["tres facile", "tres facile",
                                            "tres difficile"], exos
    assert exos[0] == {"notion": "Notion A", "palier": "tres facile",
                       "type": "code", "enonce": "Fais ceci.",
                       "indice": "Pense a cela.", "solution": "Voici pourquoi.",
                       "stub": "def f(x):\n    ...",
                       "tests": ["f(2) == 4", "f(0) == 0"],
                       "reponses": [], "mots_cles": []}
    assert exos[1]["type"] == "calcul" and exos[1]["reponses"] == ["42", "42.0"]
    # type absent -> qualitatif par defaut, jamais une exception
    assert exos[2]["type"] == "qualitatif" and exos[2]["mots_cles"] == []
    # Notion absente -> le titre du bloc sert de repli, comme avant les paliers
    sans_notion = parser_exercices("## Notion Z\n### Exercice 1\nEnonce: X.\n")
    assert sans_notion[0]["notion"] == "Notion Z"
    # champ absent -> chaine vide, pas d'exception
    assert _champ("Difficulte: facile\n", "Enonce") == ""

    # Le cours decide du droit au type "code". C'est le bug qu'on corrige ici :
    # un cours de genie logiciel donnait des fonctions Python a completer alors
    # qu'il ne montre pas une ligne de code.
    assert cours_avec_code("texte\n```python\nx = 1\n```\n")
    assert cours_avec_code("```\ndef f(x):\n    return x\n```")   # bloc non etiquete
    assert not cours_avec_code("## Besoins\nUn besoin est ...")
    assert not cours_avec_code("```\n  A --> B\n  |    |\n```")   # schema ASCII
    assert not cours_avec_code("```java\nint x = 1;\n```")        # non corrigeable ici

    interdit = consigne_exercices("fr", avec_code=False)
    assert "INTERDIT" in interdit and "Stub" in interdit
    assert "Type: code" not in demande_exercices({"matiere": "M", "titre": "T"},
                                                 "n", ["A"], md, avec_code=False)

    # ... et le parseur ne fait pas confiance a la consigne : le modele glisse
    # quand meme un exercice de code, il redevient lisible en qualitatif.
    code_indu = ("## Palier 1 - tres facile\n### Exercice 1\nNotion: A\n"
                 "Type: code\nEnonce: E.\nStub: def f():\n    ...\n"
                 "Tests: f() == 1\n")
    assert parser_exercices(code_indu)[0]["type"] == "code"        # cours avec code
    sans = parser_exercices(code_indu, avec_code=False)[0]
    assert sans["type"] == "qualitatif" and sans["tests"] == [] and not sans["stub"]
    # code sans tests : rien a executer, l'etudiant restait devant "0 test"
    sans_tests = parser_exercices("## P\n### Exercice 1\nType: code\nEnonce: E.\n")
    assert sans_tests[0]["type"] == "qualitatif"

    code = script_exercices("Les suites", "Maths", "licence 1", exos)
    compile(code, "<genere>", "exec")   # valide la syntaxe du programme genere
    assert "Notion A" in code and "Fais ceci." in code
    assert code.startswith("#!/usr/bin/env python3\n")
    # Sans cet en-tete, `uv run --script` -- le repli du lanceur sur un poste
    # sans Python -- refuserait le TP.
    assert "/// script" in code and 'requires-python = ">=3.11"' in code
    # Les couleurs de l'app (gris + violet), et le schema ASCII d'un enonce
    # rendu a chasse fixe plutot qu'en texte courant.
    assert "#7c3aed" in code and "background: #4ade80" not in code
    assert "poserEnonce" in code and ".schema" in code
    # Ce marqueur-la est remplace a l'affichage, pas a la generation : s'il
    # disparaissait ici, la page servie n'aurait plus aucune donnee.
    assert "__DONNEES__" in code and "__EXERCICES__" not in code
    # --langue traverse jusqu'au decor du TP, paliers compris
    anglais = script_exercices("Les suites", "Maths", "licence 1", exos, "en")
    compile(anglais, "<genere>", "exec")
    assert "Check" in anglais and "Very hard" in anglais
    assert '"ltr"' in anglais

    # Compiler ne suffit pas : le TP plantait a l'execution, pas a la lecture.
    # Un modele glisse volontiers une case a cocher dans un enonce, et la
    # console Windows en cp1252 interrompait alors la seance -- des libelles en
    # grec ou en japonais font exactement pareil. On rejoue donc un vrai TP
    # (--verifier : il fabrique sa page et corrige un code pour de vrai, sans
    # ouvrir de navigateur), en anglais, dans une console volontairement
    # etroite.
    exotique = [{"notion": "N", "palier": "tres facile", "type": "qualitatif",
                 "enonce": "Coche la case ☐ puis reponds.", "indice": "",
                 "solution": "Fait.", "stub": "", "tests": [], "reponses": [],
                 "mots_cles": []}]
    with tempfile.TemporaryDirectory() as dossier:
        tp = Path(dossier) / "tp.py"
        tp.write_text(script_exercices("Les suites", "Maths", "licence 1",
                                       exotique, "en"), encoding="utf-8")
        rejeu = subprocess.run(
            [sys.executable, str(tp), "--verifier"], capture_output=True,
            text=True, encoding="cp1252", errors="replace",
            env={**os.environ, "PYTHONIOENCODING": "cp1252"})
    assert rejeu.returncode == 0, rejeu.stderr
    assert "Coche la case" in rejeu.stdout, rejeu.stdout[:400]
    # un test juste, un faux : la correction isolee marche dans le TP genere
    assert "{'reussis': 1, 'total': 2, 'erreur': None}" in rejeu.stdout, \
        rejeu.stdout[-400:]

    # Le cours ne garde a cote de lui que son lanceur ; le programme du TP et
    # ses donnees descendent d'un cran, dans .tp/.
    assert chemin_tp(Path("/c/Suites.md"), "_exercices.py") == \
        Path("/c/.tp/Suites_exercices.py")

    bat = lanceur_tp(".tp/Cours_exercices.py", "win32")
    assert bat.startswith("@echo off") and 'set "TP=.tp/Cours_exercices.py"' in bat
    assert "\r\n" in bat            # un .bat en LF seul casse sur d'anciens shells
    sh = lanceur_tp(".tp/Cours_exercices.py", "linux")
    assert sh.startswith("#!/bin/sh") and "\r" not in sh
    cmd = lanceur_tp(".tp/Cours_exercices.py", "darwin")
    assert cmd.startswith("#!/bin/sh") and "\r" not in cmd
    # Un poste sans Python reste servi par uv, qui sait en telecharger un :
    # c'est le cas courant, l'app livree est un .exe et n'installe rien.
    for lanceur in (bat, sh, cmd):
        assert "run --script" in lanceur, lanceur
    # ... et l'absence totale des deux se dit, au lieu d'un "commande inconnue"
    assert "python.org" in bat and "Python introuvable" in sh
    # un % dans le nom du cours serait mange par le shell de Windows
    assert "100 %% Maths_exercices.py" in lanceur_tp(".tp/100 % Maths_exercices.py",
                                                     "win32")

    print("exercices : self-test OK")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--source", type=Path, help="cours .md deja genere")
    p.add_argument("--niveau", default="comme le cours",
                   help="degre de difficulte souhaite, libre : debutant, "
                        "licence 2, agrege... (defaut : comme le cours)")
    p.add_argument("--moteur", default=DEFAUT, choices=list(MOTEURS))
    p.add_argument("--modele", help="remplace le modele du moteur")
    p.add_argument("--cle-env", type=Path,
                   default=Path(__file__).resolve().parent / "config" / "keys.env")
    p.add_argument("--langue", default="fr", choices=list(LANGUES_APP.keys()),
                   help="Langue des supports generes (code ISO 639-1)")
    p.add_argument("--no-tp", action="store_true",
                   help="Ne pas generer le TP interactif (_TP.bat/_TP.sh/_TP.command, "
                        "et ses annexes dans .tp/)")
    p.add_argument("--focus", default="",
                   help="sur quoi porte le TP, libre : une notion, un "
                        "chapitre, une competence (defaut : tout le cours)")
    p.add_argument("--questions", type=int, default=QUESTIONS_DEFAUT,
                   help=f"nombre d'exercices du TP (defaut : {QUESTIONS_DEFAUT}, "
                        "de plus en plus durs)")
    p.add_argument("--no-fiche", action="store_true",
                   help="Ne pas generer la fiche de revision (_fiche.md)")
    p.add_argument("--self-test", action="store_true")
    a = p.parse_args()

    if a.self_test:
        _self_test()
        return
    if not a.source:
        p.error("--source est obligatoire")
    fabriquer(a.source, a.niveau, a.cle_env, a.moteur, a.modele, a.langue,
              faire_tp=not a.no_tp, faire_fiche=not a.no_fiche,
              focus=a.focus, questions=a.questions)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # cp1252 mange les accents
    main()

#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""A partir d'un cours .md deja genere, produit trois supports de revision.

  (a) un TP personnel : un petit programme Python autonome qui interroge
      l'etudiant, exercice par exercice, notion par notion -- <cours>_exercices.py
  (b) une fiche de revision condensee, en Markdown Obsidian -- <cours>_fiche.md
  (c) des flashcards (syntaxe du plugin Spaced Repetition d'Obsidian,
      "Question::Reponse") -- <cours>_flashcards.md

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
from pathlib import Path

from generator import CHARTE, DEFAUT, MOTEURS, PERSONA, cle_du_moteur, \
    modele_retenu, nettoyer, probleme, repondre

# Au-dela, un cours entier en exercices coute cher a generer et decourage
# l'etudiant plutot que de l'aider -- mieux vaut un TP court qu'un pave.
NOTIONS_MAXI = 10
EXOS_PAR_NOTION = 2

# Rubriques de fin de cours (vocabulaire, recap, auto-test, sources) : ce ne
# sont pas des notions a exercer, juste des recapitulatifs de ce qui precede.
EXCLUS_NOTION = re.compile(r"vocabulaire|recapitulat|auto-?(test|evaluation)"
                            r"|sources?\b", re.IGNORECASE)

CHAMPS_EXO = ("Difficulte", "Enonce", "Indice", "Solution")

MAX_JETONS_EXOS = 6000      # plusieurs notions x plusieurs exercices, enonces courts
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

def consigne_exercices() -> str:
    """Persona + charte des cours, reprises telles quelles : les exercices
    doivent parler la meme langue pedagogique que le cours qu'ils exercent."""
    return (
        "Tu prepares des exercices d'application pour l'etudiant a qui tu "
        "viens d'ecrire ce cours, en francais.\n\n"
        + PERSONA + "\n\n" + CHARTE + "\n\n"
        "Objectif de CET exercice-ci (un TP personnel, pas un cours) :\n"
        "- chaque exercice porte sur une seule notion, clairement rattachee ;\n"
        "- l'enonce est concret, jamais une question de cours recitee ;\n"
        "- l'indice debloque sans donner la reponse ;\n"
        "- la solution est expliquee, pas juste un resultat sec ;\n"
        "- adapte le type d'exercice a la matiere : calcul en maths, "
        "traduction ou conjugaison en langue, analyse de document en "
        "histoire, code a completer en informatique, etc. -- un exercice de "
        "maths ne ressemble pas a un exercice de langue.\n"
        "Contrainte de sortie : suis exactement le format demande, rien "
        "avant, rien apres, aucun bloc de code englobant l'ensemble."
    )


def demande_exercices(meta: dict, niveau: str, notions: list[str], md: str) -> str:
    liste = "\n".join(f"- {n}" for n in notions)
    return (
        f"Matiere : {meta['matiere']}\n"
        f"Cours   : {meta['titre']}\n"
        f"Niveau demande pour les exercices : {niveau}\n\n"
        "Voici le cours complet, pour que les exercices restent fideles a ce "
        "qui y est enseigne et ne debordent pas sur des notions absentes :\n\n"
        f"{md}\n\n"
        "Notions a exercer, dans cet ordre :\n" + liste + "\n\n"
        f"Pour CHAQUE notion ci-dessus, redige {EXOS_PAR_NOTION} exercices "
        "d'application progressifs (le premier plus facile que le second), "
        "adaptes a la matiere et au niveau demandes. Format de sortie EXACT, "
        "sans rien avant ni apres :\n\n"
        "## <notion recopiee a l'identique>\n"
        "### Exercice 1\n"
        "Difficulte: facile\n"
        "Enonce: ...\n"
        "Indice: ...\n"
        "Solution: ...\n"
        "### Exercice 2\n"
        "Difficulte: moyen\n"
        "Enonce: ...\n"
        "Indice: ...\n"
        "Solution: ...\n"
    )


def consigne_fiche() -> str:
    return (
        "Tu condenses le cours en une fiche de revision, en francais, en "
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


def consigne_flashcards() -> str:
    return (
        "Tu prepares des flashcards de revision a partir du cours, en "
        "francais.\n\n"
        + PERSONA + "\n\n" + CHARTE + "\n\n"
        "Objectif : une question courte, une reponse courte, une seule idee "
        "par carte -- pas un resume, une carte qu'on relit en trois "
        "secondes.\n"
        "Format de sortie EXACT, en Markdown Obsidian (syntaxe du plugin "
        "Spaced Repetition), sans rien avant ni apres, aucun bloc de code "
        "englobant l'ensemble :\n\n"
        "## <notion>\n"
        "<Question>::<Reponse>\n"
        "<Question>::<Reponse>\n\n"
        "2 a 4 cartes par notion, une notion = un titre ##."
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


def parser_exercices(brut: str) -> list[dict]:
    """Sortie du modele -> liste d'exercices {notion, difficulte, enonce,
    indice, solution}, dans l'ordre. Un `##` ouvre une notion, un `### Exercice`
    ouvre un exercice -- meme logique tolerante que plan_hierarchique dans
    generator.py : un modele qui devie un peu du format ne casse rien."""
    exercices = []
    titres = list(re.finditer(r"^##\s+(.+?)\s*$", brut, re.MULTILINE))
    for i, m in enumerate(titres):
        notion = m.group(1).strip(" *_")
        fin = titres[i + 1].start() if i + 1 < len(titres) else len(brut)
        bloc_notion = brut[m.end():fin]
        for exo in re.finditer(r"###\s*Exercice.*?$(.*?)(?=^###\s*Exercice|\Z)",
                               bloc_notion, re.MULTILINE | re.DOTALL):
            corps = exo.group(1)
            exercices.append({
                "notion": notion,
                "difficulte": _champ(corps, "Difficulte") or "moyen",
                "enonce": _champ(corps, "Enonce"),
                "indice": _champ(corps, "Indice"),
                "solution": _champ(corps, "Solution"),
            })
    return exercices


# --------------------------------------------------------- le programme genere

def _sur(texte: str) -> str:
    """Aplatit une valeur du cours pour qu'elle tienne dans une chaine du
    programme genere sans casser sa syntaxe (retours a la ligne, guillemets)."""
    return texte.replace("\n", " ").replace('"', "'").strip()


def script_exercices(titre: str, matiere: str, niveau: str,
                     exercices: list[dict]) -> str:
    """Le texte d'un petit programme Python autonome qui interroge l'etudiant.

    Les exercices sont des donnees pures (JSON, valide aussi comme litteral
    Python) : le programme genere ne fait plus aucun appel reseau, il rejoue
    juste ce qui a ete prepare une fois. `uv run` n'est meme pas necessaire :
    aucune dependance, un `python ce_fichier.py` suffit.
    """
    titre, matiere, niveau = _sur(titre), _sur(matiere), _sur(niveau)
    donnees = json.dumps(exercices, ensure_ascii=False, indent=2)
    entete = (
        '#!/usr/bin/env python3\n'
        f'"""TP personnel genere depuis le cours : {titre}\n'
        f'Matiere : {matiere}  --  Niveau : {niveau}\n'
        "Genere par exercices.py : relance-le si le cours change, plutot que "
        "d'editer ce fichier a la main.\n"
        'Lancer :  python ce_fichier.py\n'
        '"""\n\n'
        'import sys\n\n'
        '# La console Windows tourne en cp1252 : un caractere hors de cette table\n'
        '# (une case a cocher, une fleche, un symbole mathematique) faisait planter\n'
        "# le TP en plein milieu, sur un UnicodeEncodeError. On garde l'encodage du\n"
        "# terminal -- lui seul sait ce qu'il affiche -- et on relache uniquement le\n"
        "# traitement des caracteres qu'il ne connait pas : ils sortent en '?' au\n"
        "# lieu d'interrompre la seance de revision.\n"
        'sys.stdout.reconfigure(errors="replace")\n\n'
        'EXERCICES = '
    )
    corps = '''

def executer() -> None:
    """Interroge l'etudiant notion par notion, dans l'ordre du cours."""
    print("=== TP : ''' + titre + '''  ===")
    print("Cherche par toi-meme, puis Entree pour voir la solution.\\n")
    notion_actuelle = None
    for exo in EXERCICES:
        if exo["notion"] != notion_actuelle:
            notion_actuelle = exo["notion"]
            print(f"\\n--- {notion_actuelle} ---")
        print(f"\\n({exo['difficulte']}) {exo['enonce']}")
        choix = input("Entree = solution directe, 'i' = indice d'abord > ")
        if choix.strip().lower() == "i" and exo["indice"]:
            print(f"Indice : {exo['indice']}")
            input("Entree pour voir la solution > ")
        print(f"Solution : {exo['solution']}")
    print("\\nTP termine. Relance le programme pour recommencer.")


if __name__ == "__main__":
    executer()
'''
    return entete + donnees + corps


# ------------------------------------------------------------------- pipeline

def fabriquer(source: Path, niveau: str, cle_env: Path, moteur: str,
             modele: str | None) -> None:
    """Lit le cours, genere les trois supports, les ecrit a cote du cours."""
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

    print(". Generation des exercices...")
    brut = repondre(moteur, modele, cle, consigne_exercices(),
                    demande_exercices(meta, niveau, notions, md),
                    cle_env=cle_env, max_jetons=MAX_JETONS_EXOS)
    exos = parser_exercices(nettoyer(brut))
    dest_py = source.with_name(source.stem + "_exercices.py")
    dest_py.write_text(script_exercices(meta["titre"], meta["matiere"], niveau,
                                        exos), encoding="utf-8")
    print(f". Exercices ecrits : {dest_py}")

    print(". Generation de la fiche de revision...")
    fiche = nettoyer(repondre(moteur, modele, cle, consigne_fiche(),
                              demande_fiche_ou_cartes(meta, md),
                              cle_env=cle_env, max_jetons=MAX_JETONS_FICHE))
    dest_fiche = source.with_name(source.stem + "_fiche.md")
    dest_fiche.write_text(fiche, encoding="utf-8")
    print(f". Fiche ecrite : {dest_fiche}")

    print(". Generation des flashcards...")
    cartes = nettoyer(repondre(moteur, modele, cle, consigne_flashcards(),
                               demande_fiche_ou_cartes(meta, md),
                               cle_env=cle_env, max_jetons=MAX_JETONS_CARTES))
    dest_cartes = source.with_name(source.stem + "_flashcards.md")
    dest_cartes.write_text(cartes, encoding="utf-8")
    print(f". Flashcards ecrites : {dest_cartes}")


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
        assert exige in consigne_exercices()
        assert exige in consigne_fiche()
        assert exige in consigne_flashcards()

    brut = (
        "## Notion A\n"
        "### Exercice 1\n"
        "Difficulte: facile\n"
        "Enonce: Fais ceci.\n"
        "Indice: Pense a cela.\n"
        "Solution: Voici pourquoi.\n"
        "### Exercice 2\n"
        "Difficulte: moyen\n"
        "Enonce: Fais autre chose.\n"
        "Indice: Un indice.\n"
        "Solution: Une solution.\n"
        "## Notion B\n"
        "### Exercice 1\n"
        "Difficulte: facile\n"
        "Enonce: Question B1.\n"
        "Indice: Indice B1.\n"
        "Solution: Solution B1.\n"
    )
    exos = parser_exercices(brut)
    assert len(exos) == 3, exos
    assert exos[0] == {"notion": "Notion A", "difficulte": "facile",
                       "enonce": "Fais ceci.", "indice": "Pense a cela.",
                       "solution": "Voici pourquoi."}
    assert exos[2]["notion"] == "Notion B"
    # champ absent -> chaine vide, pas d'exception
    assert _champ("Difficulte: facile\n", "Enonce") == ""

    code = script_exercices("Les suites", "Maths", "licence 1", exos)
    compile(code, "<genere>", "exec")   # valide la syntaxe du programme genere
    assert "Notion A" in code and "Fais ceci." in code
    assert code.startswith("#!/usr/bin/env python3\n")

    # Compiler ne suffit pas : le TP plantait a l'execution, pas a la lecture.
    # Un modele glisse volontiers une case a cocher ou une fleche dans un enonce,
    # et la console Windows en cp1252 interrompait alors la seance en plein
    # milieu. On rejoue donc un vrai TP, dans une console volontairement etroite.
    exotique = [{"notion": "N", "difficulte": "facile",
                 "enonce": "Coche la case ☐ puis reponds.",
                 "indice": "", "solution": "Fait."}]
    with tempfile.TemporaryDirectory() as dossier:
        tp = Path(dossier) / "tp.py"
        tp.write_text(script_exercices("T", "M", "n", exotique), encoding="utf-8")
        rejeu = subprocess.run(
            [sys.executable, str(tp)], input="\n\n", capture_output=True,
            text=True, encoding="cp1252", errors="replace",
            env={**os.environ, "PYTHONIOENCODING": "cp1252"})
    assert rejeu.returncode == 0, rejeu.stderr
    assert "TP termine" in rejeu.stdout, rejeu.stdout

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
    p.add_argument("--self-test", action="store_true")
    a = p.parse_args()

    if a.self_test:
        _self_test()
        return
    if not a.source:
        p.error("--source est obligatoire")
    fabriquer(a.source, a.niveau, a.cle_env, a.moteur, a.modele)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # cp1252 mange les accents
    main()

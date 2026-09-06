#!/usr/bin/env python3
"""Moteur de la fabrique de cours : chemins, lancement de la generation, PDF.

Aucune dependance a l'interface : tout ce qui est ici se teste sans ouvrir de
fenetre. L'interface (app.py + frontend/) se contente d'afficher les messages
produits ici.

Le travail intelligent est fait par generator.py, qui parle au modele choisi
(cf. generator.MOTEURS : Claude par le CLI (payant), ou "gratuit" -- qui essaie
Google Gemini puis NVIDIA NIM, cf. generator.FOURNISSEURS -- avec cle et modele
regles depuis l'interface et gardes dans keys.env).
Il tourne sous `uv run` : ses dependances sont declarees dans son en-tete, rien
n'est a installer dans le python qui lance l'interface.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path
from urllib.parse import quote

WINDOWS = sys.platform == "win32"
MACOS = sys.platform == "darwin"

# TYPES ne sert pas ici : il est reexporte pour app.py, qui prend tout son
# vocabulaire dans moteur plutot que de dependre aussi de generer.
from generator import (CLE_DESTINATION, CLE_TRANSCRIPTEUR, CLES_MODELE, DEFAUT,
                     FOURNISSEURS, MOTEURS, TYPES, cle_api, cle_mal_formee,
                     destination_retenue, ecrire_reglage, modele_retenu, modeles_nim,
                     probleme, probleme_fournisseur, transcripteur_retenu)

ICI = Path(__file__).resolve().parent

# Ou les cours atterrissent par defaut, tant que l'interface n'en a pas choisi
# un autre (garde dans keys.env, cf. destination_courante). Un dossier par
# matiere y est cree.
# Le chemin historique reste le defaut sur le PC ou il existe deja : changer la
# destination sous les pieds de l'utilisateur lui ferait croire ses cours perdus.
_HISTORIQUE = Path.home() / "Desktop" / "Partage_Linux" / "Cours" / "M1" / "Cours"
DESTINATION_DEFAUT = _HISTORIQUE if _HISTORIQUE.is_dir() else Path.home() / "Cours"

# Reglages et cles d'API : hors du code, et hors de git (cf. .gitignore).
CLE_ENV = ICI / "config" / "keys.env"
# Le dernier candidat est celui des paquets packaging/*: uv y voyage a cote de
# l'executable pour que l'utilisateur final n'ait rien a installer lui-meme.
CANDIDATS_UV = [Path.home() / ".local" / "bin" / ("uv.exe" if WINDOWS else "uv"),
               ICI / ("uv.exe" if WINDOWS else "uv")]

SANS_FENETRE = getattr(subprocess, "CREATE_NO_WINDOW", 0)


# ------------------------------------------------------------------- chemins

def slug(nom: str) -> str:
    """Nom saisi -> nom de dossier sur, meme avec accents."""
    s = unicodedata.normalize("NFKD", nom).encode("ascii", "ignore").decode()
    s = re.sub(r"[^\w\s-]", "", s).strip().lower()
    s = re.sub(r"[\s_-]+", "-", s)
    return s or "cours"


def nom_note(nom: str) -> str:
    """Nom de cours -> nom de fichier : accents gardes, interdits Windows retires."""
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', " ", nom)
    s = re.sub(r"\s+", " ", s).strip(" .")
    return s or "Cours"


def ouvrir(cible) -> None:
    """Confie un fichier, un dossier ou une URI au systeme, partout pareil.

    os.startfile n'existe que sous Windows : tout appelant passe par ici plutot
    que de refaire le test de plateforme, sinon un seul oubli suffit a rendre
    l'application inutilisable sous Linux ou macOS.
    """
    cible = str(cible)
    if WINDOWS:
        os.startfile(cible)                                  # noqa: S606
        return
    lanceur = "open" if MACOS else "xdg-open"
    # Detache : le lanceur ne doit pas retenir l'interface, et sa sortie n'a
    # rien a faire dans le journal de generation.
    subprocess.Popen([lanceur, cible],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def racine_vault(depart: Path) -> Path | None:
    """Remonte jusqu'au dossier contenant .obsidian, s'il y en a un.

    La destination n'est pas forcement un vault : si personne ne l'a ouvert
    comme tel dans Obsidian, on retombe sur un simple dossier de fichiers .md.
    """
    for d in [depart, *depart.parents]:
        if (d / ".obsidian").is_dir():
            return d
    return None


# Snippet CSS depose dans tout coffre que l'app provisionne : accorde le
# ==surlignage== d'Obsidian (jaune par defaut) au rouge "important" du PDF --
# meme code couleur des deux cotes, cf. la palette semantique de md2pdf.py.
SNIPPET_CSS = """/* Fabrique -- ==surlignage== = rouge important, comme dans le PDF genere */
.markdown-source-view.mod-cm6 .cm-highlight,
.markdown-rendered mark {
  background-color: #fdeced;
  color: #b3261e;
  border-radius: 4px;
  padding: 0 .2em;
}
"""


def assurer_vault(dossier: Path) -> None:
    """Fait de `dossier` un coffre Obsidian valide : cree .obsidian s'il
    manque, et y depose/active un snippet de couleurs.

    Idempotent et jamais destructeur : un .obsidian deja regle par
    l'utilisateur est complete (snippet ajoute a la liste), pas ecrase.
    """
    obsidian_dir = dossier / ".obsidian"
    snippets_dir = obsidian_dir / "snippets"
    snippets_dir.mkdir(parents=True, exist_ok=True)

    snippet = snippets_dir / "fabrique-couleurs.css"
    if not snippet.is_file():
        snippet.write_text(SNIPPET_CSS, encoding="utf-8")

    apparence = obsidian_dir / "appearance.json"
    reglages = {}
    if apparence.is_file():
        try:
            reglages = json.loads(apparence.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            reglages = {}   # config corrompue : repartir propre plutot que planter
    actives = reglages.setdefault("enabledCssSnippets", [])
    if "fabrique-couleurs" not in actives:
        actives.append("fabrique-couleurs")
    apparence.write_text(json.dumps(reglages, indent=2), encoding="utf-8")


def obsidian_installe() -> bool:
    """Un gestionnaire du protocole obsidian:// est-il enregistre sur ce PC ?

    Sans verifier, ouvrir() sur une URI obsidian:// echouerait avec une
    boite Windows generique et deroutante -- guider vers le telechargement
    est plus utile pour qui ne sait pas ce qui vient de se passer.
    """
    if not WINDOWS:
        # Pas de base de registre ailleurs. Le lanceur du systeme (open /
        # xdg-open) sait dire lui-meme qu'il ne gere pas obsidian:// ; on tente
        # donc plutot que de declarer Obsidian absent a tort.
        return bool(shutil.which("obsidian")) or MACOS
    import winreg
    try:
        winreg.QueryValue(winreg.HKEY_CLASSES_ROOT, "obsidian")
        return True
    except OSError:
        return False


def ouvrir_dans_obsidian(vault: Path, fichier: Path | None = None) -> None:
    """Assure que `vault` est un coffre, puis l'ouvre (ou une note dedans).

    N'appelle pas obsidian_installe() elle-meme : c'est a l'appelant de
    guider l'utilisateur vers le telechargement si ce n'est pas installe,
    avant d'en arriver la.
    """
    assurer_vault(vault)
    uri = f"obsidian://open?vault={quote(vault.name)}"
    if fichier:
        uri += f"&file={quote(fichier.relative_to(vault).with_suffix('').as_posix())}"
    ouvrir(uri)


def destination_courante() -> Path:
    """Le dossier ou generer le prochain cours : celui choisi dans l'interface,
    sinon le defaut."""
    return destination_retenue(DESTINATION_DEFAUT, CLE_ENV)


def choisir_destination(dossier: Path) -> None:
    """Change le dossier de sortie et le cree (avec ses parents) s'il n'existe
    pas encore : choisir un nouveau vault ne doit jamais echouer faute de dossier."""
    dossier.mkdir(parents=True, exist_ok=True)
    ecrire_reglage(CLE_ENV, CLE_DESTINATION, str(dossier))


def matieres_existantes() -> list[str]:
    """Matieres deja presentes, pour ne pas en recreer des variantes."""
    destination = destination_courante()
    if not destination.is_dir():
        return []
    return sorted((d.name for d in destination.iterdir()
                   if d.is_dir() and not d.name.startswith((".", "_"))),
                  key=str.casefold)


# ------------------------------------------------------------------ binaires

def _premier_existant(candidats: list[Path], nom: str) -> str | None:
    """which() d'abord, puis les emplacements connus.

    Le PATH utilisateur depasse la limite Windows et se fait tronquer pour les
    processus lances depuis l'Explorateur : which() echoue alors a tort.
    """
    if trouve := shutil.which(nom):
        return trouve
    for c in candidats:
        if c.is_file():
            return str(c)
    return None


def trouver_uv() -> str | None:
    return _premier_existant(CANDIDATS_UV, "uv")


def moteur_pret(moteur: str) -> str | None:
    """Ce qui manque a ce moteur pour tourner, ou None s'il est pret."""
    return probleme(moteur, CLE_ENV)


# --------------------------------------------------------------- reglages
# L'interface passe par ici : elle ne connait pas l'emplacement de keys.env.
# Communs a NIM et Gemini, les deux fournisseurs de la version gratuite.

def modele_courant(code: str) -> str:
    """Le modele qui tournerait si on lancait maintenant, pour ce fournisseur
    (gemini/nim) ou pour claude-cli."""
    return modele_retenu(code, None, CLE_ENV)


def fournisseur_pret(code: str) -> str | None:
    """Ce qui manque a ce fournisseur (gemini/nim) pour repondre, ou None s'il
    est pret."""
    return probleme_fournisseur(code, CLE_ENV)


def enregistrer_cle(code: str, valeur: str) -> None:
    """Valide la cle saisie pour ce fournisseur, puis l'ecrit dans keys.env.

    Valider avant d'ecrire : une cle fausse deja enregistree fait croire que le
    fournisseur est pret, et l'echec ne se voit qu'au premier appel reseau.
    """
    nom = FOURNISSEURS[code].cle
    if souci := cle_mal_formee(valeur, nom):
        raise ValueError(souci)
    ecrire_reglage(CLE_ENV, nom, valeur.strip())


def enregistrer_modele(code: str, nom: str) -> None:
    ecrire_reglage(CLE_ENV, CLES_MODELE[code], nom.strip())


def transcripteur_courant() -> str:
    """Le moteur qui lira les photos au prochain lancement."""
    return transcripteur_retenu(CLE_ENV)


def enregistrer_transcripteur(code: str) -> None:
    ecrire_reglage(CLE_ENV, CLE_TRANSCRIPTEUR, code)


def catalogue_nim() -> list[str]:
    """Les modeles offerts par NIM pour la cle enregistree. Appel reseau."""
    cle = cle_api(CLE_ENV, FOURNISSEURS["nim"].cle)
    if not cle:
        raise RuntimeError("Aucune cle NVIDIA enregistree.")
    return modeles_nim(cle)


# --------------------------------------------------------------- progression

def analyser(ligne: str) -> list[tuple[str, object]]:
    """Traduit une ligne de generator.py en messages (genre, charge).

    generator.py ecrit `[42] Texte` pour l'avancement et `. texte` pour le journal.
    Tout le reste (trace d'erreur, sortie de uv) est montre brut plutot que jete.
    """
    ligne = ligne.strip()
    if not ligne:
        return []
    if m := re.match(r"\[(\d{1,3})\]\s*(.+)", ligne):
        return [("phase", (m.group(2), min(100, int(m.group(1)))))]
    texte = ligne[2:] if ligne.startswith(". ") else ligne[:200]
    return [("log", texte), ("detail", texte)]


# --------------------------------------------------------------- executions

def commande_generer(uv: str, sources: Path, sortie: Path, matiere: str,
                     type_: str, titre: str, liens: list[str],
                     moteur: str = DEFAUT, modele: str | None = None) -> list[str]:
    cmd = [uv, "run", str(ICI / "generator.py"),
           "--sources", str(sources), "--sortie", str(sortie),
           "--matiere", matiere, "--type", type_, "--titre", titre,
           "--moteur", moteur, "--cle-env", str(CLE_ENV)]
    if modele:
        cmd += ["--modele", modele]
    for lien in liens:
        cmd += ["--lien", lien]
    return cmd


def faire_pdf(sortie: Path, journal) -> Path | None:
    """Convertit la note en PDF. Renvoie le PDF, ou None si ca n'a pas abouti."""
    uv = trouver_uv()
    if not uv:
        journal("uv introuvable : PDF non genere.")
        return None
    r = subprocess.run([uv, "run", str(ICI / "md2pdf.py"), str(sortie)],
                       capture_output=True, text=True, encoding="utf-8",
                       errors="replace", timeout=300, creationflags=SANS_FENETRE)
    pdf = sortie.with_suffix(".pdf")
    if pdf.is_file():
        journal(f"PDF : {pdf.name}")
        return pdf
    journal("PDF non genere : " + (r.stderr or r.stdout)[-300:])
    return None


SUFFIXES_SUPPORTS = ("_exercices.py", "_fiche.md", "_flashcards.md")


def fichiers_supports(sortie: Path) -> list[Path]:
    """Les supports de revision deja presents a cote du cours."""
    return [p for p in (sortie.with_name(sortie.stem + s)
                        for s in SUFFIXES_SUPPORTS) if p.is_file()]


def faire_supports(sortie: Path, journal, niveau: str = "comme le cours",
                   moteur: str = DEFAUT, modele: str | None = None) -> list[Path]:
    """TP, fiche et flashcards a cote du cours. Renvoie ce qui est reellement sorti.

    Meme forme que faire_pdf : rien ne remonte par exception, l'echec part au
    journal. Une generation partielle reste utile -- si seule la fiche a abouti,
    autant la rendre plutot que de tout jeter.
    """
    uv = trouver_uv()
    if not uv:
        journal("uv introuvable : supports non generes.")
        return []
    cmd = [uv, "run", str(ICI / "exercices.py"), "--source", str(sortie),
           "--niveau", niveau, "--moteur", moteur, "--cle-env", str(CLE_ENV)]
    if modele:
        cmd += ["--modele", modele]
    # trois appels au modele a la suite : large, mais borne -- sans plafond un
    # fournisseur muet bloquerait le thread pour toujours.
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                       errors="replace", timeout=900, creationflags=SANS_FENETRE)
    faits = fichiers_supports(sortie)
    if faits:
        journal("Supports : " + ", ".join(p.name for p in faits))
    else:
        journal("Supports non generes : " + (r.stderr or r.stdout)[-300:])
    return faits


def _self_test() -> None:
    assert slug("Analyse Numérique") == "analyse-numerique"
    assert slug("  Chap. 3 : Séries !  ") == "chap-3-series"
    assert slug("") == "cours"
    assert nom_note("Analyse Numérique") == "Analyse Numérique"
    assert nom_note("Chap 3 : Séries") == "Chap 3 Séries"
    assert nom_note("..") == "Cours"

    # choisir_destination n'est qu'un mkdir + ecrire_reglage : les deux sont
    # deja testes (stdlib et generator.py). destination_retenue, le vrai calcul,
    # est teste dans generator.py avec un keys.env explicite.

    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        dossier = Path(tmp)
        assurer_vault(dossier)
        assert (dossier / ".obsidian" / "snippets" / "fabrique-couleurs.css").is_file()
        reglages = json.loads((dossier / ".obsidian" / "appearance.json").read_text())
        assert reglages["enabledCssSnippets"] == ["fabrique-couleurs"]
        assert racine_vault(dossier) == dossier   # provisionne = reconnu comme coffre

        # idempotent : un second appel ne duplique rien et ne touche pas au
        # snippet si l'utilisateur l'a deja personnalise entre-temps
        (dossier / ".obsidian" / "snippets" / "fabrique-couleurs.css").write_text("/* a moi */")
        assurer_vault(dossier)
        assert (dossier / ".obsidian" / "snippets" / "fabrique-couleurs.css")\
            .read_text() == "/* a moi */"
        reglages2 = json.loads((dossier / ".obsidian" / "appearance.json").read_text())
        assert reglages2["enabledCssSnippets"] == ["fabrique-couleurs"]   # pas duplique

        # un appearance.json existant, avec d'autres reglages, n'est pas ecrase
        autre = Path(tmp) / "existant"
        (autre / ".obsidian").mkdir(parents=True)
        (autre / ".obsidian" / "appearance.json").write_text(
            json.dumps({"theme": "obsidian", "enabledCssSnippets": ["autre-snippet"]}))
        assurer_vault(autre)
        fusion = json.loads((autre / ".obsidian" / "appearance.json").read_text())
        assert fusion["theme"] == "obsidian"
        assert set(fusion["enabledCssSnippets"]) == {"autre-snippet", "fabrique-couleurs"}

    assert isinstance(obsidian_installe(), bool)   # ne doit jamais lever

    uv = trouver_uv()
    assert uv, "uv introuvable"
    assert (ICI / "generator.py").is_file(), "generator.py manquant"

    # Rien de ce qui sert a demarrer ne doit dependre d'un chemin code en dur :
    # c'est ce qui rendait l'application inutilisable hors du PC d'origine.
    assert DESTINATION_DEFAUT.is_absolute()
    assert "sitha" not in str(DESTINATION_DEFAUT).lower() or \
        str(Path.home()).lower() in str(DESTINATION_DEFAUT).lower()
    assert callable(ouvrir)

    assert analyser("[42] Redaction du cours") == \
        [("phase", ("Redaction du cours", 42))]
    assert analyser("[999] Deborde") == [("phase", ("Deborde", 100))]
    assert analyser(". p1.jpg : 210 mots")[0] == ("log", "p1.jpg : 210 mots")
    assert analyser("Traceback (most recent call last):")[0][0] == "log"
    assert analyser("") == []

    cmd = commande_generer(uv, Path("/s"), Path("/o/CM - X.md"), "Maths", "TD", "X",
                           ["Maths/_img/x/p1.jpg"], "gratuit", "meta/llama-3.3-70b-instruct")
    assert cmd[:3] == [uv, "run", str(ICI / "generator.py")]
    assert cmd.count("--lien") == 1 and "Maths/_img/x/p1.jpg" in cmd
    assert "--type" in cmd and cmd[cmd.index("--type") + 1] == "TD"
    assert cmd[cmd.index("--moteur") + 1] == "gratuit"
    assert cmd[cmd.index("--modele") + 1] == "meta/llama-3.3-70b-instruct"
    # sans precision, c'est le moteur par defaut qui part, pas rien
    defaut = commande_generer(uv, Path("/s"), Path("/o/x.md"), "M", "CM", "X", [])
    assert defaut[defaut.index("--moteur") + 1] == DEFAUT
    # ... et aucun --modele vide qui ecraserait le choix garde dans keys.env
    assert "--modele" not in defaut

    print("engine : self-test OK")
    destination = destination_courante()
    print("  destination :", destination)
    print("  vault       :", racine_vault(destination) or "aucun (.md simples)")
    print("  matieres    :", matieres_existantes() or "(aucune)")
    for nom in MOTEURS:
        etat = moteur_pret(nom)
        print(f"  {nom:<11} {'pret' if etat is None else 'a configurer'}")
    for nom in FOURNISSEURS:
        etat = fournisseur_pret(nom)
        print(f"    {nom:<9} {'pret' if etat is None else 'a configurer'}  -  "
              f"{modele_courant(nom)}")


if __name__ == "__main__":
    _self_test()

#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow>=10", "pypdf>=4", "pymupdf>=1.24"]
# ///
"""Fabrique un cours a partir des sources, avec le moteur de ton choix.

Trois phases, parce qu'un seul appel geant transcrirait mal et ne montrerait rien :
  1. chaque photo est transcrite seule (le modele lit les images) -> progression reelle
  2. le texte des PDF est extrait localement                      -> gratuit et rapide
  3. un appel final redige le cours, la skill `cours` en consigne

Deux moteurs, meme pipeline, meme sortie (cf. MOTEURS) :
  claude-cli  version payante : le CLI `claude` en sous-processus, ton abonnement
              Claude Code, rien a payer en plus. Le meilleur, quand tu l'as.
  gratuit     version gratuite : essaie Google Gemini (cle perso sur
              aistudio.google.com, lit les images nativement), et si Gemini ne
              repond pas (pas de cle, quota, panne), bascule sur NVIDIA NIM
              (cle perso sur build.nvidia.com, modele au choix dans son
              catalogue -- cf. FOURNISSEURS et ORDRE_GRATUIT).

Sortie sur stdout, une ligne par evenement, lue par engine.py :
    [12] Transcription des photos  (2/6)     <- avancement, texte
    . detail libre                           <- journal
Lancer :  uv run generator.py --sources DIR --sortie F.md --moteur claude-cli ...
Test   :  uv run generator.py --self-test
"""

import argparse
import base64
import hashlib
import io
import json
import re
import shutil
import subprocess
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.request
from collections import namedtuple
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path

# Langues supportées par l'application (code ISO 639-1)
LANGUES_APP = {
    "fr": "Français", "en": "English", "es": "Español", "de": "Deutsch",
    "it": "Italiano", "pt": "Português", "nl": "Nederlands", "pl": "Polski",
    "ru": "Русский", "zh": "中文", "ja": "日本語", "ko": "한국어",
    "ar": "العربية", "hi": "हिन्दी", "tr": "Türkçe", "sv": "Svenska",
    "da": "Dansk", "no": "Norsk", "fi": "Suomi", "cs": "Čeština",
    "hu": "Magyar", "ro": "Română", "uk": "Українська", "el": "Ελληνικά",
    "he": "עברית", "th": "ไทย", "vi": "Tiếng Việt", "id": "Bahasa Indonesia",
}

SKILL = Path.home() / ".claude" / "skills" / "cours" / "SKILL.md"
URL_NIM = "https://integrate.api.nvidia.com/v1/chat/completions"
URL_NIM_MODELES = "https://integrate.api.nvidia.com/v1/models"
URL_GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"

# modele : le modele par defaut, que --modele remplace. NIM en heberge des centaines :
# le catalogue se demande a NIM (modeles_nim) plutot que de vieillir ici.
# cle : la ligne attendue dans keys.env, ou None quand rien n'est reclame.
Moteur = namedtuple("Moteur", "modele cle libelle")

# La version gratuite n'est pas "Gemini OU NIM" -- ce choix-la ne veut rien dire
# pour l'etudiant qui n'a ni l'un ni l'autre en tete, juste "gratuit". Elle essaie
# NIM d'abord : NVIDIA seul tient tout le pipeline (mesure sur un cours complet),
# Gemini en reserve si NVIDIA tombe. Historique (pas de
# cle, quota, panne) : cf. ORDRE_GRATUIT et _gratuit(). Chacun garde sa cle et son
# modele propres, ici, sous son propre nom.
FOURNISSEURS = {
    "gemini": Moteur("gemini-2.5-flash", "GEMINI_API_KEY",
                     "Google Gemini - lit les images nativement"),
    "nim": Moteur("nvidia/nemotron-3-ultra-550b-a55b", "NVIDIA_API_KEY",
                  "NVIDIA NIM - modele au choix"),
}
ORDRE_GRATUIT = ["nim"]     # Gemini debranche : NIM seul tenait tout le
                            # pipeline sans lui (transcription, plan, redaction),
                            # mesure sur un cours complet le 4 sept 2026. Remettre
                            # "gemini" en tete si NVIDIA tombe un jour.

MOTEURS = {
    "claude-cli": Moteur("opus", None,
                         "Claude Opus 5 - version payante (abonnement Claude Code)"),
    "gratuit": Moteur(None, None,
                      "NVIDIA NIM - version gratuite, modele au choix, cle perso"),
}
DEFAUT = "claude-cli"    # le meilleur, quand l'abonnement est disponible

# Preference connue, du meilleur au moins bon, pour les modeles rencontres et
# testes dans ce projet. Un modele absent de la liste n'est pas mauvais, juste
# pas encore juge : il retombe en fin de liste, par ordre alphabetique.
PREFERENCE_NIM = [
    "nvidia/nemotron-3-ultra-550b-a55b",
    "deepseek-ai/deepseek-v4-pro-0813",
    "moonshotai/kimi-k3",
    "nvidia/llama-3.1-nemotron-ultra-253b-v1",
    "mistralai/mistral-large-2-instruct",
    "nvidia/nemotron-3-super-120b-a12b",
    "deepseek-ai/deepseek-v4-flash-0731",
    "moonshotai/kimi-k2.6",
    "nvidia/nemotron-4-340b-instruct",
    "meta/llama-3.2-11b-vision-instruct",   # seul modele vision fiable teste sur NIM
    "meta/llama-3.2-90b-vision-instruct",   # vision mais lent, timeouts observes
]
# Gemini n'a que quelques modeles pertinents : liste courte, tenue a la main,
# pas de catalogue en ligne a interroger comme pour NIM.
# Verifie sur une vraie cle gratuite : les modeles Pro repondent 429 (pas de
# quota Pro sans facturation) et gemini-2.5-pro repond 404 (retire aux nouvelles
# cles). Le palier gratuit, c'est Flash -- et Flash lit les images, ce qui est
# tout ce qu'on lui demande pour transcrire les photos.
PREFERENCE_GEMINI = [
    "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-3.8-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash-lite",
]

# Le modele retenu par moteur se garde dans keys.env, a cote des cles : c'est deja
# le fichier de reglages, et l'interface le relit au demarrage suivant.
CLE_MODELE_NIM = "NIM_MODELE"
CLE_MODELE_GEMINI = "GEMINI_MODELE"
CLES_MODELE = {"nim": CLE_MODELE_NIM, "gemini": CLE_MODELE_GEMINI}

# Le dossier de sortie choisi dans l'interface se garde de la meme facon.
CLE_DESTINATION = "DESTINATION"

LARGEUR_DIAPO = 1400    # une diapo rendue a cette largeur reste nette a l'ecran
# Seuils cales sur de vraies diapos (cf. porte_une_figure). Une exportation
# Keynote/PowerPoint colle un fond pleine page et des puces en image : ni l'un
# ni l'autre n'est une figure, d'ou les bornes basse et haute sur la surface.
FOND_MINI, FOND_MAXI = 0.02, 0.90   # part de page : en dessous une puce, au-dessus un fond
SURFACE_FIGURE = 0.03               # une figure couvre au moins ca, une fois le decor retire
TRACES_FIGURE = 5                   # ou alors elle est dessinee en vectoriel
COTE_MAX = 1400          # les notes manuscrites restent lisibles, le base64 reste petit
MAX_JETONS_PHOTO = 2000
MAX_JETONS_COURS = 16000
MAX_JETONS_PARTIE = 4000    # plafond de securite ; la cible reelle est calculee
                            # par section (cf. rediger_par_paquets)
MOTS_CIBLE_TOTAL = 6500     # plafond : au-dela le cours devient long a lire et
                            # a produire pour un gain de fond marginal
MOTS_CIBLE_FIN = 700        # part reservee au vocabulaire/recap/auto-test/sources
JETONS_PAR_MOT = 3          # marge large sur le francais (mesure ~2.4 sur du texte
                            # mixte) : trop juste tronquerait la section, trop
                            # large ne coute rien tant que le modele suit la cible
MAX_JETONS_PLAN = 1500      # plan a deux niveaux + vocabulaire, mesure ~250 sans
OUVRIERS = 5                # sections ecrites en meme temps. Regle a la main : le
                            # debit reel de NIM ne se devine pas depuis le code, et
                            # 5 tient loin des 20 requetes/minute de Gemini.
TACHES_MAXI = 24            # borne le cout d'un cours, plan bavard compris.
                            # 8 parties x 3 sous-parties : un plan normal doit
                            # tenir dessous, sinon on perd des parties entieres.
MAX_JETONS_FIN = 8000       # les sections de fin resument tout le cours et
                            # tabulent le vocabulaire : 4000 coupaient en plein mot
SOUS_PARTIES = "2 a 4"
SAUT = chr(10)             # les invites se cousent avec, sans echappement
PARTIES_MINI, PARTIES_MAXI = 3, 12
ATTENTE_RETENTE = 20        # une partie ratee, c'est un trou dans le cours :
                            # on repasse une fois avant d'abandonner

TYPES = {"CM": "cours magistral", "TD": "travaux diriges", "TP": "travaux pratiques"}

# les photos de notes manuscrites : tout le reste (PDF mis a part) est du texte
# source -- code, .md, .txt -- lu tel quel plutot que transcrit comme une image.
EXT_IMG = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".heic"}
MAX_OCTETS_FICHIER = 100_000   # une source texte plus lourde noierait le prompt

# bornes de la barre : transcription 10->60 %, PDF 65 %, redaction 70->95 %
PHOTO_DEBUT, PHOTO_FIN = 10, 60
REDACTION_DEBUT, REDACTION_FIN = 70, 95
MOTS_ATTENDUS = 2500     # sert seulement a animer la barre pendant la redaction

SANS_FENETRE = getattr(subprocess, "CREATE_NO_WINDOW", 0)

CONSIGNE_PHOTO = (
    "Transcris integralement cette photo de notes de cours. Rends le texte tel qu'il "
    "est ecrit, sans le resumer ni le reformuler. Restitue la structure : titres, "
    "listes, fleches, encadres, soulignements, ce qui est ecrit en marge. Developpe "
    "les abreviations entre parentheses la premiere fois. Les formules en LaTeX. "
    "Ce qui est illisible : ecris [illisible], n'invente jamais le contenu manquant."
)

# Qui redige. La skill `cours` dit quoi produire ; ceci dit pour qui, et ca
# change tout le reste : un etudiant qui ne connait rien au sujet, qui retient
# par l'oeil, et qui relira ce cours dix fois d'ici l'examen.
PERSONA = (
    "===== QUI TU ES =====\n"
    "Tu es le professeur qu'on aurait voulu avoir : patient, attentionne, qui "
    "tient son eleve par la main du debut a la fin. Tu pars du principe que ton "
    "lecteur ne connait RIEN au sujet -- ni le vocabulaire, ni les sigles, ni "
    "les evidences du metier. Tu n'ecris pas pour montrer ce que tu sais, tu "
    "ecris pour qu'il comprenne. Un cours ou l'eleve se perd est un cours rate, "
    "meme si tout y est exact.\n"
    "Concretement :\n"
    "- tu expliques chaque principe etape par etape, jamais d'un bloc ;\n"
    "- tu donnes l'intuition simple avant la formulation exacte ;\n"
    "- tu accompagnes chaque notion d'un exemple concret ;\n"
    "- tu ne laisses derriere toi aucun mot que tu n'as pas explique ;\n"
    "- entre impressionner et faire comprendre, tu choisis faire comprendre, a "
    "chaque phrase, sans exception.\n"
    "\n"
    "===== POUR QUI TU ECRIS =====\n"
    "Un etudiant qui decouvre la matiere, qui APPREND PAR L'OEIL -- un schema "
    "lui reste, un paragraphe non -- et qui RELIRA ce cours des dizaines de "
    "fois sur quatre mois, entre les CM, les TD et les TP de toutes ses autres "
    "matieres. Il ne relit jamais depuis le debut : il ouvre le cours au "
    "milieu, trois mois plus tard, et doit raccrocher immediatement."
)

VOCAB_MINI, VOCAB_MAXI = 8, 12   # tout le cours, pas par partie. Mesure : sans
                                 # plafond chiffre, le modele alignait 40 termes,
                                 # dont « bancaire » -- un tableau que plus
                                 # personne ne lit.

CHARTE = (
    "===== CHARTE NON NEGOCIABLE (elle prime sur tout ce qui precede) =====\n"
    "\n"
    "1. AUCUN JARGON GRATUIT.\n"
    "N'introduis jamais un sigle, une norme, une metrique ou un terme technique "
    "absent des sources du cours. Exemples de ce qu'il ne faut JAMAIS ecrire : "
    "« un projet solo de 50 kLOC », « le MCD », « l'atomicite des transactions "
    "(ACID) », « couverture MC/DC (DO-178C niveau A) ». Ces formules ne sont ni "
    "dans le cours ni dans la tete du lecteur : elles ne font que le perdre et "
    "lui couper l'envie de comprendre la section.\n"
    "Si un terme technique est vraiment indispensable, explique-le en langage "
    "courant AVANT de l'employer -- jamais apres coup, jamais glisse entre "
    "parentheses comme une evidence partagee.\n"
    "Les complements de culture generale sont les bienvenus a une condition : "
    "ils eclairent la notion et restent simples. Citer une norme ou un acronyme "
    "pour faire savant n'est pas un complement, c'est du bruit : supprime-le.\n"
    "\n"
    "2. VOCABULAIRE : PEU, UTILE, TRIVIAL.\n"
    f"- Entre {VOCAB_MINI} et {VOCAB_MAXI} termes pour tout le cours. Jamais "
    "40. Dans le doute, tu en mets moins.\n"
    "- Critere unique d'admission : sans ce terme, le lecteur ne peut pas "
    "comprendre la suite du cours. Rien d'autre n'entre.\n"
    "- Un mot du langage courant employe dans son sens courant n'est JAMAIS un "
    "terme de vocabulaire (« bancaire », « telecommunications », « client », "
    "« reseau » au sens ordinaire).\n"
    "- Test de coherence, a passer avant de retenir un terme : si un autre mot "
    "du meme registre joue le meme role dans la meme phrase, soit les deux "
    "entrent, soit aucun. Definir « bancaire » sans definir "
    "« telecommunications » est une faute.\n"
    "- Toute definition est TRIVIALE : une phrase courte, des mots de tous les "
    "jours, PUIS un exemple concret. Ne definis jamais un terme par un autre "
    "terme technique. Une definition qu'un debutant ne comprend pas est un "
    "echec, meme exacte.\n"
    "- UN SEUL DOMICILE PAR DEFINITION. Le tableau « Vocabulaire à retenir » "
    "est ce domicile : le lecteur y tombe en un clic sur le mot, directement a "
    "la bonne ligne. Un terme du tableau ne recoit donc PAS en plus son encadre "
    "`> [!definition]` dans la page -- la meme definition a deux endroits "
    "alourdit la page sans rien apprendre de plus. Garde `> [!definition]` pour "
    "un concept qu'il faut poser sur place avant de pouvoir lire la suite et "
    "qui n'est pas au tableau.\n"
    "\n"
    "3. AERE COMME UN DIAPO, PAS COMME UN ROMAN.\n"
    "Le texte suivi est l'exception, pas la regle. Dans l'ordre de preference : "
    "schema, tableau, etapes numerotees, liste courte, et seulement en dernier "
    "recours un paragraphe.\n"
    "Aucun paragraphe de plus de 4 lignes : au-dela, coupe-le ou convertis-le "
    "en liste, tableau ou schema. Une phrase qui n'apprend rien de plus que la "
    "precedente se supprime -- moins de prose, meme contenu, cours plus lisible "
    "et plus vite relu.\n"
    "==surligne== les deux ou trois mots vraiment decisifs d'une section, pas "
    "plus : tout surligner revient a ne rien surligner.\n"
    "\n"
    "4. PEDAGOGIE VISUELLE ET PAS-A-PAS.\n"
    "Pour chaque notion importante, deroule cette progression, dans cet ordre :\n"
    "  (a) l'intuition en une phrase simple, avec une analogie du quotidien ;\n"
    "  (b) la decomposition etape par etape, numerotee ;\n"
    "  (c) un exemple concret, chiffre quand c'est possible ;\n"
    "  (d) le cas limite ou le piege, seulement s'il sert vraiment.\n"
    "Des qu'il y a un processus, un cycle, une hierarchie ou une comparaison, "
    "fais-en un schema dans un bloc ```mermaid``` : le lecteur apprend par "
    "l'oeil. Le schema remplace sa description -- ne raconte pas en prose ce "
    "qu'il montre deja.\n"
    "\n"
    "5. ECRIT POUR ETRE RELU DIX FOIS.\n"
    "Le lecteur rouvrira ce cours dans trois mois, au milieu, sans souvenir du "
    "reste. Donc :\n"
    "- meme structure d'une partie a l'autre, toujours dans le meme ordre : il "
    "doit savoir ou regarder sans chercher ;\n"
    "- des titres qui annoncent ce qu'on y apprend, jamais « Generalites » ni "
    "« Introduction » ;\n"
    "- aucune dependance a une lecture precedente : pas de « comme vu plus "
    "haut » tout seul -- redis en trois mots de quoi il s'agit, ou pose un "
    "`> [!rappel]` ;\n"
    "- un encadre `> [!tip] À retenir` par sous-partie, qui se suffit a "
    "lui-meme : c'est ce que le lecteur relira en survol la veille de "
    "l'examen.\n"
    "\n"
    "6. LES ENCADRES PORTENT UN SENS, ET UNE COULEUR.\n"
    "Chaque type sort dans une couleur differente sur le PDF : le lecteur les "
    "reconnait a la couleur avant meme de les lire. Pour ces cinq roles, "
    "utilise exactement ces types :\n"
    "  `> [!example] Exemple`   -- vert   : un cas concret, chiffre si possible\n"
    "  `> [!tip] À retenir`     -- violet : le point cle a reviser en survol\n"
    "  `> [!note] Complément`   -- bleu   : ce que tu ajoutes hors des sources\n"
    "  `> [!danger] Piège`      -- rouge  : l'erreur classique a l'examen\n"
    "  `> [!definition] Terme`  -- or     : un concept a poser avant la suite\n"
    "Les autres types restent disponibles quand ils collent mieux : "
    "`> [!rappel]` (un acquis anterieur qu'on reactive), `> [!theoreme]` "
    "(un enonce formel), `> [!demonstration]` (un raisonnement pas-a-pas), "
    "`> [!loi]` (l'enonce fondateur du cours -- une seule fois dans tout le "
    "cours, pas une de plus)."
)

# La persona ne tient pas sur quinze appels paralleles si elle n'est posee
# qu'une fois : chaque section la reprend, en court.
RAPPEL_PERSONA = (
    "===== RAPPEL : QUI TU ES SUR CETTE SECTION =====\n"
    "Professeur patient, pas conferencier. Ton lecteur ne connait rien au "
    "sujet, retient par l'oeil, et relira cette section des dizaines de fois. "
    "Donc : intuition simple d'abord, puis les etapes numerotees, puis un "
    "exemple concret. Aucun sigle ni norme absents des sources. Un schema "
    "plutot qu'un paragraphe. Aucun paragraphe de plus de 4 lignes. La section "
    "doit se comprendre seule, trois mois plus tard, sans avoir relu le reste."
)


_PAROLE = threading.Lock()


def dire(texte: str, avance: int | None = None) -> None:
    """Une ligne de progression pour engine.py. Sans avance, c'est du journal.

    Sous verrou : les sections s'ecrivent en parallele, et l'interface lit cette
    sortie ligne par ligne (cf. engine.analyser). Deux `print` concurrents
    suffiraient a couper une ligne en deux et a casser la barre.
    """
    with _PAROLE:
        print(f"[{avance}] {texte}" if avance is not None else f". {texte}", flush=True)


# --------------------------------------------------------------- cles et outils

def cle_api(fichier: Path, nom: str) -> str | None:
    """Lit `set NOM=valeur` dans le fichier de cles (un .bat de `set`)."""
    if not fichier.is_file():
        return None
    for ligne in fichier.read_text(encoding="utf-8", errors="replace").splitlines():
        m = re.match(rf"\s*set\s+{re.escape(nom)}\s*=\s*(\S+)", ligne, re.I)
        if m and "colle-ta" not in m.group(1):   # la valeur d'exemple n'est pas une cle
            return re.sub(r"^Bearer\s+", "", m.group(1), flags=re.I)
    return None


def cle_du_moteur(moteur: str, fichier: Path) -> str | None:
    """La cle que ce moteur reclame. None quand il n'en reclame pas (claude-cli,
    et "gratuit" : chaque fournisseur garde la sienne, cf. _gratuit)."""
    nom = MOTEURS[moteur].cle
    return cle_api(fichier, nom) if nom else None


def probleme_fournisseur(code: str, fichier: Path) -> str | None:
    """Ce qui manque a ce fournisseur (gemini/nim) pour repondre, ou None s'il
    est pret."""
    nom = FOURNISSEURS[code].cle
    return None if cle_api(fichier, nom) else f"Cle {nom} absente."


def ecrire_reglage(fichier: Path, nom: str, valeur: str) -> None:
    """Pose `set NOM=valeur`, en remplacant la ligne existante s'il y en a une.

    Le reste du fichier est garde intact : il porte les autres cles et les
    explications pour les retrouver. Le reecrire en entier les perdrait.
    """
    fichier.parent.mkdir(parents=True, exist_ok=True)
    lignes = (fichier.read_text(encoding="utf-8", errors="replace").splitlines()
              if fichier.is_file() else [])
    debut = re.compile(rf"\s*set\s+{re.escape(nom)}\s*=", re.I)
    pose = f"set {nom}={valeur}"
    for i, ligne in enumerate(lignes):
        if debut.match(ligne):
            lignes[i] = pose
            break
    else:
        lignes.append(pose)
    fichier.write_text("\n".join(lignes) + "\n", encoding="utf-8")


PREFIXES_CLE = {"NVIDIA_API_KEY": "nvapi-", "GEMINI_API_KEY": "AIza"}


def cle_mal_formee(valeur: str, nom: str) -> str | None:
    """Ce qui cloche dans cette cle, ou None si elle a la bonne tete.

    On verifie la forme, pas la validite : seul le fournisseur peut dire si
    elle est active. Mais refuser tout de suite une cle collee de travers vaut
    mieux que la laisser echouer au milieu des transcriptions.
    """
    valeur = valeur.strip()
    if not valeur:
        return "Aucune cle saisie."
    if any(c.isspace() for c in valeur):
        return "Une cle tient sur une seule ligne, sans espace ni guillemets."
    prefixe = PREFIXES_CLE.get(nom)
    if prefixe and not valeur.startswith(prefixe):
        return f"Une cle {nom} commence par {prefixe}."
    return None


def trier_par_performance(noms: list[str], preference: list[str]) -> list[str]:
    """Connus d'abord, dans l'ordre de PREFERENCE_* ; le reste ensuite, alphabetique."""
    rang = {m: i for i, m in enumerate(preference)}
    return sorted(noms, key=lambda m: (rang.get(m, len(preference)), m))


def modeles_nim(cle: str) -> list[str]:
    """Le catalogue NIM, demande a NVIDIA, triees par performance connue.

    Sert aussi a verifier la cle : une cle refusee se voit ici en une seconde,
    au lieu d'echouer au bout de six transcriptions.
    """
    requete = urllib.request.Request(
        URL_NIM_MODELES, headers={"Authorization": f"Bearer {cle}"})
    try:
        with urllib.request.urlopen(requete, timeout=30) as r:
            donnees = json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError("Cle refusee par NVIDIA." if e.code in (401, 403)
                           else f"NVIDIA a repondu {e.code}.") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise RuntimeError(f"NVIDIA NIM injoignable ({e}).") from e
    noms = sorted({m["id"] for m in donnees.get("data", []) if m.get("id")})
    return trier_par_performance(noms, PREFERENCE_NIM)


def trouver_claude() -> str | None:
    """Le CLI `claude`. which() d'abord : le PATH tronque de Windows le rate parfois."""
    if trouve := shutil.which("claude"):
        return trouve
    nom = "claude.exe" if sys.platform == "win32" else "claude"
    for c in (Path.home() / ".local" / "bin" / nom,
              Path.home() / ".claude" / "local" / nom):
        if c.is_file():
            return str(c)
    return None


def probleme(moteur: str, fichier: Path) -> str | None:
    """Ce qui empeche ce moteur de tourner, ou None s'il est pret.

    Verifie avant de lancer : un moteur mal configure doit se dire tout de suite,
    pas au bout de dix minutes de transcriptions payees pour rien.
    """
    if moteur not in MOTEURS:
        return f"Moteur inconnu : {moteur}"
    if moteur == "gratuit":
        # au moins un des deux fournisseurs suffit : "gratuit" essaie l'un, puis
        # l'autre, pas besoin des deux cles pour demarrer.
        if all(probleme_fournisseur(code, fichier) for code in ORDRE_GRATUIT):
            return "Aucune clé enregistrée (Gemini ou NIM). Ajoute-en une dans les Paramètres."
        return None
    nom = MOTEURS[moteur].cle
    if nom and not cle_api(fichier, nom):
        return f"Clé {nom} absente. Ajoute-la dans les Paramètres."
    if moteur == "claude-cli" and not trouver_claude():
        return ("Le CLI `claude` est introuvable. Installe Claude Code, ou choisis "
                "un autre moteur.")
    return None


# ------------------------------------------------------------------- sources

def photo_en_base64(chemin: Path) -> str:
    """Photo -> JPEG base64. Redimensionner : une photo de telephone fait 4000 px
    de large, l'API la refuserait et la lisibilite du manuscrit n'y gagne rien."""
    from PIL import Image, ImageOps

    im = Image.open(chemin)
    im = ImageOps.exif_transpose(im)          # sinon les photos prises de cote sont couchees
    im = im.convert("RGB")
    im.thumbnail((COTE_MAX, COTE_MAX))
    tampon = io.BytesIO()
    im.save(tampon, "JPEG", quality=82)
    return base64.b64encode(tampon.getvalue()).decode()


def slug(nom: str) -> str:
    """Nom saisi -> nom de dossier sur, meme avec accents (meme regle que engine.py)."""
    t = unicodedata.normalize("NFKD", nom).encode("ascii", "ignore").decode()
    t = re.sub(r"[^\w\s-]", "", t).strip().lower()
    return re.sub(r"[\s_-]+", "-", t) or "cours"


def racine_vault(depart: Path) -> Path | None:
    """Remonte jusqu'au dossier contenant .obsidian, s'il y en a un."""
    for d in [depart, *depart.parents]:
        if (d / ".obsidian").is_dir():
            return d
    return None


def porte_une_figure(page) -> bool:
    """La page montre-t-elle autre chose que du texte ?

    Le modele ne voit pas les diapos, il n'en lit que le texte : sur une page
    dont tout l'interet est le schema, ce texte se reduit au titre. Sans ce
    signal, il ne peut pas savoir qu'il y a une figure a afficher.

    Deux facons d'avoir une figure sur une diapo : une image incrustee (photo,
    capture, dessin scanne) ou un trace vectoriel (les boites et fleches d'un
    schema fait dans l'outil). On mesure les deux, en ecartant le decor : le
    fond pleine page et les puces de la charte graphique.

    ponytail: heuristique calee sur deux jeux de diapos reels -- elle retient le
    schema en cascade, les acteurs UML, le diagramme de communication, et laisse
    les pages de texte. Si des figures passent au travers, baisser
    SURFACE_FIGURE et TRACES_FIGURE est le seul reglage a toucher.
    """
    aire = abs(page.rect.width * page.rect.height) or 1
    surface = 0.0
    for info in page.get_images(full=True):
        for r in page.get_image_rects(info[0]):
            part = abs(r.width * r.height) / aire
            if FOND_MINI < part < FOND_MAXI:
                surface += part
    return surface >= SURFACE_FIGURE or len(page.get_drawings()) >= TRACES_FIGURE


def images_du_pdf(chemin: Path, dst: Path, base: Path) -> dict[int, tuple[str, bool]]:
    """Rend chaque page du PDF en image a cote du cours.

    -> {no de page: (lien Obsidian, la page porte une figure)}

    C'est ce qui permet d'afficher la diapo du prof telle quelle. Redessiner un
    schema deja bon le trahit ; encore faut-il pouvoir le montrer.
    """
    import pymupdf as fitz
    from PIL import Image

    dossier = dst / slug(chemin.stem)
    dossier.mkdir(parents=True, exist_ok=True)
    liens: dict[int, tuple[str, bool]] = {}
    with fitz.open(str(chemin)) as doc:
        for i, page in enumerate(doc, 1):
            zoom = LARGEUR_DIAPO / max(page.rect.width, 1)
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
            fichier = dossier / f"p{i:02d}.webp"
            Image.frombytes("RGB", (pix.width, pix.height), pix.samples) \
                 .save(fichier, "WEBP", quality=82, method=4)
            liens[i] = (fichier.relative_to(base).as_posix(),
                        porte_une_figure(page))
    return liens


def texte_probable(chemin: Path, echantillon: int = 8192) -> bool:
    """Un fichier sans octet nul dans ses premiers Ko est du texte, pas du
    binaire -- la meme heuristique que git ou grep -I. Elle evite de tenir une
    liste d'extensions de langages a jour pour couvrir "n'importe quel langage" :
    du code source, quel qu'il soit, ne contient jamais d'octet nul."""
    with chemin.open("rb") as f:
        return b"\x00" not in f.read(echantillon)


def texte_du_fichier(chemin: Path) -> str:
    """Une source qui n'est ni une photo ni un PDF -- code, .md, .txt, config...
    -- lue telle quelle. Tronquee si trop lourde : une seule source demesuree
    ne doit pas noyer le budget de jetons du reste du cours."""
    brut = chemin.read_bytes()
    tronque = len(brut) > MAX_OCTETS_FICHIER
    texte = brut[:MAX_OCTETS_FICHIER].decode("utf-8", errors="replace")
    return texte + "\n[... fichier tronque, trop volumineux ...]" if tronque else texte


def texte_du_pdf(chemin: Path,
                 images: dict[int, tuple[str, bool]] | None = None) -> str:
    """Texte d'un PDF de diapos. Vide = PDF scanne, on le signale au lieu de mentir.

    Le lien de l'image de la page est colle dans l'en-tete de page, avec ce que
    la page contient : le modele voit du premier coup quelle diapo vaut la peine
    d'etre affichee, et a quel endroit du cours.
    """
    from pypdf import PdfReader

    images = images or {}
    pages = []
    for i, page in enumerate(PdfReader(str(chemin)).pages, 1):
        t = (page.extract_text() or "").strip()
        lien = ""
        if i in images:
            cible, figure = images[i]
            quoi = ("SCHEMA OU FIGURE, a afficher si la notion est traitee ici"
                    if figure else "texte seul, ne pas afficher")
            lien = f"  [{quoi} : ![[{cible}]]]"
        if t or lien:
            pages.append(f"--- page {i} ---{lien}\n{t}")
    if not pages:
        return "[Ce PDF ne contient aucun texte extractible : diapos scannees en image.]"
    return "\n\n".join(pages)


# -------------------------------------------------------------- appels modele

URL_FOURNISSEUR = {"nim": URL_NIM, "gemini": URL_GEMINI}

# Qui a repondu en dernier, "fournisseur [modele]". En version gratuite le
# fournisseur se decide a l'execution : c'est la seule facon de le savoir
# apres coup. Vaut donc pour le dernier appel -- la redaction, ici.
MOTEUR_UTILISE = ""

# Redaction partie par partie. Reserve au gratuit : la version payante tient
# deja la longueur en un appel, et dix appels la ralentiraient pour rien.
PAR_PAQUETS = {"gratuit"}


def repondre(moteur: str, modele: str, cle: str | None, systeme: str | None,
             texte: str, cle_env: Path | None = None, photo: Path | None = None,
             max_jetons: int = MAX_JETONS_PHOTO, au_fil=None) -> str:
    """Une question posee au modele choisi.

    `photo` joint une image, `au_fil(texte_cumule)` suit la reponse en direct.
    `cle_env` n'est utile qu'a "gratuit" : lui seul doit lire plusieurs cles.
    Chaque moteur parle son dialecte ici et seulement ici : le reste du programme
    ne sait pas a qui il s'adresse.
    """
    if moteur == "gratuit":
        return _gratuit(cle_env, systeme, texte, photo, max_jetons, au_fil)
    if moteur in FOURNISSEURS:
        _noter_moteur(moteur, modele)
        return _api_openai(URL_FOURNISSEUR[moteur], modele, cle, systeme, texte,
                           photo, max_jetons, au_fil)
    _noter_moteur("claude-cli", modele)
    return _claude_cli(modele, systeme, texte, photo, au_fil)


# NIM heberge des centaines de modeles, mais un seul confirme lire les images sur
# ce compte (le reste refuse le multimodal ou time out, cf. session de tests). Le
# modele NIM prefere par l'utilisateur reste le meilleur pour la redaction (texte
# seul) ; sur une photo, "gratuit" bascule sur celui-ci quel que soit ce choix.
NIM_VISION = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"

# Qui lit l'ecriture manuscrite. Mesure sur une meme page de notes (IMG_9208) :
#   nemotron-omni  114 mots, fleches et puces rendues, francais correct
#   kimi-k3        188 mots, fidele, beaucoup de LaTeX
#   gemini-flash   334 mots, fidele, LaTeX envahissant ($\quad$ a repetition)
#   nemotron-ocr   90 mots, confiance moyenne 0.72, texte deforme : c'est un OCR
#                  d'imprime (factures, tableaux), il decroche sur le cursif
#   llama-vision   degenere, recopie les memes puces sous trois titres
# "auto" suit ORDRE_GRATUIT : NVIDIA seul depuis que Gemini est debranche.
Transcripteur = namedtuple("Transcripteur", "libelle fournisseur modele")
TRANSCRIPTEURS = {
    "auto":          Transcripteur("Automatique  (NVIDIA)", None, None),
    "nemotron-omni": Transcripteur("NVIDIA Nemotron Omni  ·  recommande", "nim",
                                   "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"),
    "kimi-k3":       Transcripteur("NVIDIA Kimi K3", "nim", "moonshotai/kimi-k3"),
    "gemini":        Transcripteur("Google Gemini", "gemini", None),
    "ocr":           Transcripteur("NVIDIA Nemotron OCR v2  ·  texte imprime", "ocr",
                                   "nvidia/nemotron-ocr-v2"),
}
CLE_TRANSCRIPTEUR = "TRANSCRIPTEUR"
URL_OCR = "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2"
OCR_CONFIANCE = 0.50    # sous ce score le fragment est illisible, on le marque


MODELES_A_ESSAYER = 3   # au-dela, le fournisseur est vraiment en panne


def _modeles_a_essayer(code: str, photo: Path | None, cle_env: Path) -> list[str]:
    """Les modeles a tenter pour ce fournisseur, dans l'ordre.

    Un nom de modele disparait du catalogue, ou n'est pas ouvert au palier
    gratuit : l'appel est refuse sans que le fournisseur soit en panne. On
    descend donc sa liste avant de l'abandonner -- sinon un seul nom perime
    suffit a le condamner, en silence.
    """
    premier = _modele_gratuit(code, photo, cle_env)
    if photo and code == "nim":
        return [premier]          # la bascule vision est deja le seul choix valable
    suite = {"gemini": PREFERENCE_GEMINI, "nim": PREFERENCE_NIM}.get(code, [])
    return list(dict.fromkeys([premier, *suite]))[:MODELES_A_ESSAYER]


def _modele_gratuit(code: str, photo: Path | None, cle_env: Path) -> str:
    """Le modele a essayer pour ce fournisseur, sur cet appel precis.

    Sur une photo, NIM bascule sur NIM_VISION quel que soit le modele choisi
    pour la redaction (texte seul) : ce dernier ne lit pas forcement les images.
    Gemini n'a pas ce probleme, tous ses modeles sont multimodaux.
    """
    modele = modele_retenu(code, None, cle_env)
    if photo and code == "nim" and modele != NIM_VISION:
        return NIM_VISION
    return modele


def _noter_moteur(nom: str, modele: str | None) -> None:
    global MOTEUR_UTILISE
    MOTEUR_UTILISE = f"{nom} [{modele}]" if modele else nom


def _fournisseurs_disponibles() -> tuple[list[str], float]:
    """Les fournisseurs a essayer, et l'attente a purger avant si aucun n'est pret.

    Rend l'ordre de preference d'ORDRE_GRATUIT (tri stable) prive de ceux dont
    la fenetre de quota n'est pas passee. Si tous sont hors quota, rend la liste
    entiere, le plus tot liberable en tete, avec son attente.
    """
    ordre = sorted(ORDRE_GRATUIT, key=lambda c: REPRISE.get(c, 0.0))
    if prets := [c for c in ordre if REPRISE.get(c, 0.0) <= time.monotonic()]:
        return prets, 0.0
    return ordre, max(0.0, REPRISE[ordre[0]] - time.monotonic())


def _gratuit(cle_env: Path, systeme: str | None, texte: str, photo: Path | None,
            max_jetons: int, au_fil) -> str:
    """La version gratuite : les fournisseurs d'ORDRE_GRATUIT dans l'ordre, le
    suivant si celui d'avant ne repond pas -- pas de cle, quota epuise, panne.
    L'etudiant n'a pas a savoir lequel a repondu, juste que l'un a marche.
    """
    echecs = []
    # Un fournisseur qu'on sait hors quota n'est pas rappele tant que sa fenetre
    # n'est pas passee : l'appeler rendrait un 429 de plus, et attendrait encore.
    # Si aucun n'est disponible, on attend le premier a se liberer -- il n'y a
    # rien de mieux a faire, et c'est une attente au lieu de deux.
    disponibles, attente = _fournisseurs_disponibles()
    if attente:
        dire(f"tous les fournisseurs sont hors quota - reprise dans {round(attente)} s")
        time.sleep(min(attente, 90))
    for code in disponibles:
        cle = cle_api(cle_env, FOURNISSEURS[code].cle)
        if not cle:
            echecs.append(f"{code} : pas de cle enregistree")
            continue
        for modele in _modeles_a_essayer(code, photo, cle_env):
            dire(f"version gratuite : essai avec {code} [{modele}]" +
                 (" (bascule vision)" if photo and code == "nim"
                  and modele == NIM_VISION else ""))
            try:
                reponse = _api_openai(URL_FOURNISSEUR[code], modele, cle, systeme,
                                      texte, photo, max_jetons, au_fil)
            except QuotaEpuise as e:
                REPRISE[code] = time.monotonic() + getattr(e, "delai", 60)
                # inutile d'essayer ses voisins : le quota est compte par
                # fournisseur, et chaque essai de plus mange ce qu'on attend
                echecs.append(f"{code} : {e}")
                dire(f"{code} : quota epuise, on passe au fournisseur suivant")
                break
            except RuntimeError as e:
                # la raison compte : un modele retire et un fournisseur en panne
                # se soignent differemment, et se confondent dans le journal
                echecs.append(f"{code}/{modele} : {e}")
                dire(f"{code} [{modele}] refuse : {str(e)[:130]}")
                continue
            _noter_moteur(f"gratuit -> {code}", modele)
            return reponse
    raise RuntimeError("Aucun fournisseur gratuit n'a repondu :\n" +
                       "\n".join(f"  - {e}" for e in echecs))


# Jusqu'a quand un fournisseur est connu hors quota, en horloge monotone. Sans
# cette memoire, chaque appel repayait la decouverte : cinq minutes d'attente
# par appel, douze a seize appels par cours.
REPRISE: dict[str, float] = {}


class QuotaEpuise(RuntimeError):
    """Le fournisseur repond, mais le quota gratuit est atteint.

    A distinguer d'un modele refuse : la, changer de modele ne sert a rien --
    le quota est compte par fournisseur, et chaque essai supplementaire mange
    le budget qu'on attend. On passe directement au fournisseur suivant.
    """


def _delai_quota(detail: str) -> int:
    """Le delai que l'API demande vraiment.

    Google n'envoie pas d'en-tete Retry-After sur ces 429 : le delai n'existe
    que dans le corps ("Please retry in 37.6s"). Sans le lire, on attendait
    60 s en aveugle a chaque fois.
    """
    m = re.search(r"retry in ([0-9.]+)s", detail)
    return min(90, max(5, round(float(m.group(1)) + 1))) if m else 60


def _api_ocr(cle: str, photo: Path) -> str:
    """Nemotron OCR v2 : un dialecte a lui, ni chat ni completion.

    Il rend des fragments de texte avec leurs coordonnees et un score de
    confiance, pas une transcription. On les remet donc en ordre de lecture --
    de haut en bas, puis de gauche a droite -- et on marque ce qui est trop peu
    sur plutot que de le donner pour acquis au redacteur du cours.
    """
    corps = {"input": [{"type": "image_url",
                        "url": f"data:image/jpeg;base64,{photo_en_base64(photo)}"}]}
    requete = urllib.request.Request(
        URL_OCR, data=json.dumps(corps).encode(),
        headers={"Authorization": f"Bearer {cle}", "Content-Type": "application/json",
                 "Accept": "application/json"})
    with urllib.request.urlopen(requete, timeout=300) as r:
        detections = json.load(r)["data"][0]["text_detections"]
    return _non_vide(ocr_en_texte(detections), "nemotron-ocr-v2")


def ocr_en_texte(detections: list[dict]) -> str:
    """Les fragments de l'OCR remis en ordre de lecture, les douteux signales.

    De haut en bas, puis de gauche a droite. Les y sont arrondis pour qu'une
    meme ligne, dont les fragments ne sont jamais parfaitement alignes, ne se
    retrouve pas coupee en morceaux ranges chacun a sa hauteur.
    """
    def ordre_de_lecture(d):
        coins = d["bounding_box"]["points"]
        return (round(min(c["y"] for c in coins), 2), min(c["x"] for c in coins))

    morceaux = []
    for d in sorted(detections, key=ordre_de_lecture):
        texte = d["text_prediction"]["text"]
        sur = d["text_prediction"]["confidence"] >= OCR_CONFIANCE
        morceaux.append(texte if sur else f"[illisible: {texte}]")
    return SAUT.join(morceaux)


def _non_vide(reponse: str, modele: str) -> str:
    """Une reponse vide est un echec, pas un resultat.

    Un modele peut repondre 200 sans un mot : tout le budget parti en reflexion,
    ou un filtre de contenu. Rendre "" faisait ecrire une partie de cours vide,
    sans un mot dans le journal -- le cours perdait une partie entiere en
    silence. En levant, on rejoint la mecanique de secours deja en place :
    modele suivant, puis fournisseur suivant, puis encadre "Partie manquante".
    """
    if not reponse.strip():
        raise RuntimeError(f"Modele {modele} : reponse vide")
    return reponse


def _api_openai(url: str, modele: str, cle: str, systeme: str | None, texte: str,
                photo: Path | None, max_jetons: int, au_fil, essais: int = 6) -> str:
    """Dialecte OpenAI, partage par NVIDIA NIM et Google Gemini (compat OpenAI).

    Le palier gratuit limite le nombre d'appels *par minute* : reessayer au bout de
    quelques secondes retombe dans la meme fenetre bloquee. Un 429 attend donc
    l'entete Retry-After, ou une minute, la ou une panne reseau ordinaire se
    contente de quelques secondes.
    """
    contenu: list[dict] = [{"type": "text", "text": texte}]
    if photo:
        contenu.append({"type": "image_url", "image_url": {
            "url": f"data:image/jpeg;base64,{photo_en_base64(photo)}"}})
    messages = ([{"role": "system", "content": systeme}] if systeme else []) + \
               [{"role": "user", "content": contenu}]

    # Un modele qui reflechit decompte ses jetons de reflexion de max_tokens, et
    # n'atteint jamais sa reponse. Mesure : sur une transcription, Gemini brulait
    # 1917 jetons de reflexion sur 2000 et rendait 78 jetons coupes en plein
    # milieu ; sans reflexion, 414 jetons de texte utile. Meme panne sur nemotron,
    # qui consommait les 800 jetons du plan sans produire un seul titre.
    # Transcrire, et rediger d'apres des sources fournies, ne demandent pas de
    # raisonnement.
    corps = {"model": modele, "messages": messages, "reasoning_effort": "none",
             "max_tokens": max_jetons, "temperature": 0.3, "stream": au_fil is not None}

    def batir() -> urllib.request.Request:
        return urllib.request.Request(
            url, data=json.dumps(corps).encode(),
            headers={"Authorization": f"Bearer {cle}", "Content-Type": "application/json",
                     "Accept": "text/event-stream" if au_fil else "application/json"})

    requete = batir()
    essai = 0
    while (essai := essai + 1) <= essais:
        try:
            with urllib.request.urlopen(requete, timeout=900) as r:
                if au_fil is None:
                    choix = json.load(r)["choices"][0]
                    if choix.get("finish_reason") == "length":
                        # coupee au budget : le cours perdait la fin d'une section
                        # sans un mot, et le fichier s'arretait en plein mot
                        dire(f"{modele} : reponse coupee net (budget de sortie "
                             "atteint), la fin de cette section manque")
                    return _non_vide(choix["message"]["content"], modele)
                morceaux: list[str] = []
                for brute in r:
                    ligne = brute.decode("utf-8", "replace").strip()
                    if not ligne.startswith("data:"):
                        continue
                    charge = ligne[5:].strip()
                    if charge == "[DONE]":
                        break
                    try:
                        delta = json.loads(charge)["choices"][0]["delta"]
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
                    if bout := delta.get("content"):
                        morceaux.append(bout)
                        au_fil("".join(morceaux))
                return _non_vide("".join(morceaux), modele)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as e:
            detail = e.read().decode("utf-8", "replace")[:2000] if hasattr(e, "read") else str(e)
            code = getattr(e, "code", None)
            # 4xx hors quota : la demande elle-meme est refusee (modele inconnu,
            # modele sans vision a qui on envoie une photo). Reessayer six fois
            # donnerait six fois le meme refus, en dix minutes au lieu d'une.
            if code and 400 <= code < 500 and code != 429:
                # Tous les modeles n'acceptent pas qu'on coupe leur reflexion :
                # llama-3.2-11b-vision n'admet que low/medium/high la ou nemotron
                # accepte none, sur le meme fournisseur. Plutot qu'une liste de
                # modeles a tenir a jour -- exactement le piege qui a condamne
                # Gemini avec un nom perime -- on retire le parametre refuse et
                # on rejoue, sans compter cet essai.
                if "reasoning_effort" in detail and corps.pop("reasoning_effort", None):
                    dire(f"{modele} : sans reflexion a couper, on redemande sans")
                    requete, essai = batir(), essai - 1
                    continue
                raise RuntimeError(
                    f"Modele {modele} : demande refusee ({code}). "
                    f"Si le cours a des photos, ce modele lit-il les images ? {detail}") from e
            if essai == essais:
                if code == 429:
                    epuise = QuotaEpuise(f"quota gratuit atteint sur {modele}")
                    epuise.delai = _delai_quota(detail)
                    raise epuise from e
                raise RuntimeError(f"{url} injoignable ({detail})") from e
            if code == 429:
                entete = (e.headers or {}).get("Retry-After") if hasattr(e, "headers") else None
                pause = int(entete) if (entete or "").isdigit() else _delai_quota(detail)
                dire(f"quota par minute atteint - reprise dans {pause} s "
                     f"(essai {essai}/{essais})")
            else:
                pause = 3 * essai
                dire(f"echec {essai}/{essais} ({detail[:200]}) - nouvel essai dans {pause} s")
            time.sleep(pause)
    return ""


def _claude_cli(modele: str, systeme: str | None, texte: str, photo: Path | None,
                au_fil) -> str:
    """Le CLI `claude` en sous-processus : l'abonnement paie, aucune cle a fournir.

    --setting-sources vide : sans ca le CLI chargerait hooks, CLAUDE.md et skills de
    la machine, qui n'ont rien a faire dans la redaction d'un cours.
    Une photo se lit par l'outil Read, pas en base64 ; l'invite systeme reste alors
    celle du CLI, la seule a savoir se servir de ses outils.
    """
    exe = trouver_claude()
    if not exe:
        raise RuntimeError("CLI `claude` introuvable")
    cmd = [exe, "-p", "--model", modele,
           "--setting-sources", "", "--output-format", "stream-json",
           "--include-partial-messages", "--verbose"]
    if photo:
        texte = f"{texte}\n\nLa photo a transcrire : {photo.resolve()}"
        cmd += ["--allowed-tools", "Read", "--add-dir", str(photo.resolve().parent)]
    elif systeme:
        cmd += ["--system-prompt", systeme]

    p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=subprocess.PIPE, text=True, encoding="utf-8",
                         errors="replace", bufsize=1, creationflags=SANS_FENETRE)
    p.stdin.write(texte)
    p.stdin.close()

    morceaux: list[str] = []
    for ligne in p.stdout:
        try:
            evenement = json.loads(ligne)
        except json.JSONDecodeError:
            continue                       # le CLI intercale des lignes non-JSON
        delta = evenement.get("event", {}).get("delta", {})
        if delta.get("type") == "text_delta" and (bout := delta.get("text")):
            morceaux.append(bout)
            if au_fil:
                au_fil("".join(morceaux))
    erreur = p.stderr.read()[-300:]
    if p.wait() != 0:
        raise RuntimeError(f"le CLI claude a echoue ({erreur.strip() or 'sans message'})")
    return "".join(morceaux)


# ------------------------------------------------------------- transcriptions

def empreinte(photo: Path, modele: str) -> str:
    """Identifie une transcription par le contenu de la photo, la consigne *et* le
    modele : changer l'un des trois doit invalider ce qui a ete garde avec l'ancien."""
    return hashlib.sha1(photo.read_bytes() + CONSIGNE_PHOTO.encode()
                        + modele.encode()).hexdigest()


def transcripteur_retenu(cle_env: Path | None) -> str:
    """Le moteur de lecture des photos choisi dans l'interface, sinon "auto"."""
    garde = cle_api(cle_env, CLE_TRANSCRIPTEUR) if cle_env and cle_env.is_file() else None
    return garde if garde in TRANSCRIPTEURS else "auto"


def _lire_photo(moteur, modele, cle, photo: Path, cle_env, choix: str) -> str:
    """Une photo -> son texte, par le moteur choisi dans l'interface.

    "auto" garde la cascade d'origine ; un choix explicite court-circuite la
    cascade, y compris le quota : c'est l'interet de pouvoir en changer.
    """
    t = TRANSCRIPTEURS[choix]
    if t.fournisseur is None:
        return repondre(moteur, modele, cle, None, CONSIGNE_PHOTO, cle_env=cle_env,
                        photo=photo, max_jetons=MAX_JETONS_PHOTO)
    if t.fournisseur == "ocr":
        return _api_ocr(cle_api(cle_env, FOURNISSEURS["nim"].cle), photo)
    return repondre(t.fournisseur,
                    t.modele or modele_retenu(t.fournisseur, None, cle_env),
                    cle_api(cle_env, FOURNISSEURS[t.fournisseur].cle), None,
                    CONSIGNE_PHOTO, cle_env=cle_env, photo=photo,
                    max_jetons=MAX_JETONS_PHOTO)


def transcrire(moteur: str, modele: str | None, cle: str | None, photos: list[Path],
               cache: Path, cle_env: Path | None = None) -> list[tuple[str, str]]:
    """Transcrit chaque photo separement.

    Chaque transcription est gardee sur disque : une reprise apres coupure ou
    quota depasse ne repaie pas les photos deja lues -- et ne redeclenche pas le
    quota qui avait fait echouer la fois d'avant.

    Une photo qui echoue arrete tout : un cours ampute de la moitie des notes,
    sans que rien ne le signale, est pire que pas de cours du tout.
    """
    cache.mkdir(parents=True, exist_ok=True)
    choix = transcripteur_retenu(cle_env) if moteur == "gratuit" else "auto"
    if choix != "auto":
        dire(f"transcription : {TRANSCRIPTEURS[choix].libelle}")
    # "gratuit" n'a pas de modele fixe (cf. modele_retenu) : la cle de cache
    # retombe sur le nom du moteur. Limite connue : si Gemini echoue aujourd'hui
    # et que NIM repond, puis que Gemini redevient disponible demain, le cache
    # sert quand meme la version NIM tant que la photo n'a pas change de main.
    resultats = []
    for i, photo in enumerate(photos, 1):
        dire(f"Transcription des photos  ({i}/{len(photos)})",
             PHOTO_DEBUT + round((PHOTO_FIN - PHOTO_DEBUT) * (i - 1) / len(photos)))
        marque = modele or moteur
        if choix != "auto":         # "auto" garde les empreintes deja sur disque
            marque = f"{marque}-{choix}"
        garde = cache / f"{empreinte(photo, marque)}.txt"
        if garde.is_file():
            texte = garde.read_text(encoding="utf-8")
            dire(f"{photo.name} : deja transcrite ({len(texte.split())} mots)")
        else:
            texte = _lire_photo(moteur, modele, cle, photo, cle_env, choix)
            garde.write_text(texte, encoding="utf-8")
            dire(f"{photo.name} : {len(texte.split())} mots")
        resultats.append((photo.name, texte))
    return resultats


# -------------------------------------------------------------------- prompt

def consigne_systeme(langue: str = "fr") -> str:
    """La skill `cours` telle quelle : c'est elle, la methode pedagogique.

    Elle est prise en sandwich entre la persona -- qui redige, et pour qui --
    et la charte, qui tranche les arbitrages que la methode laisse ouverts.
    La charte passe en dernier parce qu'elle prime : en cas de desaccord avec
    la methode, c'est le lecteur qui gagne, pas la forme.
    """
    if not SKILL.is_file():
        raise SystemExit(f"Methode introuvable : {SKILL}")
    corps = re.sub(r"^---\n.*?\n---\n", "", SKILL.read_text(encoding="utf-8"),
                   count=1, flags=re.S)
    
    # Nom de la langue en français pour le prompt
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
        f"Tu rediges un cours pour un etudiant, en {nom_langue}, en Markdown Obsidian.\n\n"
        f"IMPORTANT : Le cours DOIT etre redige ENTIEREMENT en {nom_langue}. Pas un mot dans une autre langue.\n\n"
        + PERSONA + "\n\n"
        "Applique la methode ci-dessous a la lettre.\n\n" + corps + "\n\n"
        + CHARTE + "\n\n"
        "Contraintes de sortie : reponds uniquement par le contenu du fichier .md, "
        "en-tete YAML compris. Aucun commentaire avant ou apres, aucun bloc de code "
        "englobant l'ensemble. Tu n'as pas d'outils : les sources te sont donnees "
        "en texte, ne demande a en lire aucune autre."
    )


def demande(matiere: str, type_: str, titre: str,
            transcriptions: list[tuple[str, str]],
            pdfs: list[tuple[str, str]], liens: list[str],
            autres: list[tuple[str, str]] = (), langue: str = "fr") -> str:
    morceaux = [
        f"Matiere : {matiere}",
        f"Seance  : {type_} ({TYPES.get(type_, type_)})",
        f"Titre   : {titre}",
        f"Date    : {date.today():%Y-%m-%d}",
        f"Langue  : {langue}",
        f"Sources : {len(pdfs)} PDF, {len(transcriptions)} photos"
        + (f", {len(autres)} autre(s) fichier(s)" if autres else ""),
    ]
    if liens:
        morceaux += ["", "Les photos sont deja copiees a cote du cours. Pour en afficher "
                     "une, reprends exactement un de ces liens, place a l'endroit du "
                     "cours ou la figure est discutee :", *(f"  ![[{l}]]" for l in liens)]
    if any("SCHEMA OU FIGURE" in t or "texte seul, ne pas" in t for _, t in pdfs):
        morceaux += ["", "Chaque page de diapo est disponible en image : son lien "
                     "![[...]] est donne dans l'en-tete de page ci-dessous, avec ce "
                     "que la page contient. Les pages marquees SCHEMA OU FIGURE "
                     "portent un dessin, un graphe ou un tableau que le texte extrait "
                     "ne rend pas : affiche l'image de la diapo a l'endroit du cours "
                     "ou la notion est traitee, plutot que de la redecrire ou de la "
                     "redessiner. Les pages marquees texte seul ne s'affichent pas : "
                     "leur contenu part dans le corps du cours."]
    for nom, texte in pdfs:
        morceaux += ["", f"===== PDF : {nom} =====", texte]
    for nom, texte in transcriptions:
        morceaux += ["", f"===== NOTES MANUSCRITES : {nom} =====", texte]
    for nom, texte in autres:
        # bloc de code : le modele voit ou le fichier commence et finit, et son
        # langage (via l'extension) sans qu'on le lui dise en prose
        langue = Path(nom).suffix.lstrip(".")
        morceaux += ["", f"===== FICHIER : {nom} =====", f"```{langue}", texte, "```"]
    return "\n".join(morceaux)


def tracer_moteur(md: str, moteur: str) -> str:
    """Ajoute `moteur: ...` a l'en-tete YAML, si le cours en a un."""
    if not moteur or not md.startswith("---\n"):
        return md
    fin = md.find("\n---", 3)
    return md if fin == -1 else f"{md[:fin]}\nmoteur: {moteur}{md[fin:]}"


def parties_du_plan(brut: str) -> list[str]:
    """Sortie du modele -> titres des parties, sans les `#` ni la numerotation
    parasite. On ne garde que les lignes de titre : le modele glisse souvent une
    phrase d'introduction malgre la consigne."""
    titres = []
    for ligne in brut.splitlines():
        ligne = ligne.strip()
        if not ligne.startswith("#"):
            continue
        titre = re.sub(r"^#+\s*", "", ligne).strip(" .")
        if titre and titre.lower() not in {t.lower() for t in titres}:
            titres.append(titre)
    if not titres:
        # Tous les modeles ne mettent pas les `##` demandes : nemotron rend une
        # liste numerotee nue, et le plan partait a la poubelle -- donc tout le
        # cours en un seul appel, ce que la redaction par paquets evite.
        for ligne in brut.splitlines():
            if m := re.match(r"^\s*\d+\s*[.)]\s+(.+?)\s*$", ligne):
                titre = m.group(1).strip(" .*_#")
                if titre and titre.lower() not in {t.lower() for t in titres}:
                    titres.append(titre)
    return titres[:PARTIES_MAXI]


def plan_hierarchique(brut: str) -> list[tuple[str, list[str]]]:
    """Sortie du modele -> [(titre de partie, [titres de ses sous-parties])].

    `##` ouvre une partie, `###` la garnit. Un modele qui ne met aucun diese
    retombe sur parties_du_plan (liste numerotee nue) : chaque partie est alors
    sa propre tache, le plan degrade au lieu d'echouer.
    """
    plan: list[tuple[str, list[str]]] = []
    for ligne in brut.splitlines():
        if not (m := re.match(r"^\s*(#{2,3})\s+(.+?)\s*$", ligne)):
            continue
        titre = m.group(2).strip(" .*_")
        if not titre:
            continue
        if len(m.group(1)) == 2:
            if titre.lower() not in {p.lower() for p, _ in plan}:
                plan.append((titre, []))
        elif plan and titre.lower() not in {s.lower() for s in plan[-1][1]}:
            plan[-1][1].append(titre)
    if not plan:
        plan = [(t, []) for t in parties_du_plan(brut)]
    return plan[:PARTIES_MAXI]


def vocabulaire_du_plan(brut: str) -> list[str]:
    """Les termes annonces apres la ligne VOCABULAIRE:, separes par des virgules.

    Absent, le cours se redige quand meme -- chaque section definira ses termes
    dans son coin, comme avant. On perd la deduplication, pas le cours.
    """
    if not (m := re.search(r"^\s*VOCABULAIRE\s*:\s*(.+)$", brut,
                           re.MULTILINE | re.IGNORECASE)):
        return []
    vus = []
    for t in m.group(1).split(","):
        t = t.strip(" .*_`[]")
        if t and t.lower() not in {v.lower() for v in vus}:
            vus.append(t)
    return vus


def taches_du_plan(plan: list[tuple[str, list[str]]]) -> list[tuple[str, str | None]]:
    """Le plan mis a plat en unites d'ecriture : une sous-partie = une tache.

    Une partie sans sous-partie s'ecrit d'un bloc (sous-titre None).
    """
    taches = [(partie, sous) for partie, sousparties in plan
              for sous in (sousparties or [None])]
    if len(taches) > TACHES_MAXI:
        # perdre des parties entieres sans le dire est le pire des deux maux
        dire(f"plan trop large : {len(taches)} sections ramenees a {TACHES_MAXI}, "
             "les dernieres parties ne seront pas ecrites")
    return taches[:TACHES_MAXI]


def termes_definis(md: str) -> list[str]:
    """Les termes deja passes au vocabulaire, pour que la partie suivante ne les
    redefinisse pas et se contente d'y faire un lien."""
    vus = []
    for m in re.finditer(r"\[\[#Vocabulaire[^\]|]*\|([^\]]+)\]\]", md):
        t = m.group(1).strip()
        if t.lower() not in {v.lower() for v in vus}:
            vus.append(t)
    return vus


def entete_yaml(matiere: str, type_: str, titre: str, n_pdf: int,
                n_photos: int, n_autres: int = 0) -> str:
    """L'en-tete se construit ici : on connait deja tout ce qu'il contient, et le
    faire ecrire au modele a chaque paquet serait une occasion de divergence."""
    tag = re.sub(r"[^\w\s-]", "",
                 unicodedata.normalize("NFKD", matiere).encode("ascii", "ignore")
                 .decode()).strip().lower()
    sources = f"{n_pdf} PDF, {n_photos} photos"
    if n_autres:
        sources += f", {n_autres} autre(s) fichier(s)"
    return ("---\n"
            f"matiere: {matiere}\n"
            f"type: {type_}\n"
            f"titre: {titre}\n"
            f"sources: {sources}\n"
            f"date: {date.today():%Y-%m-%d}\n"
            f"tags: [cours, {tag}, {type_.lower()}]\n"
            "---\n")


def nettoyer(md: str) -> str:
    """Retire un ```markdown ... ``` englobant : Obsidian afficherait le cours brut."""
    md = md.strip()
    if md.startswith("```"):
        lignes = md.splitlines()
        if lignes[-1].strip() == "```":
            md = "\n".join(lignes[1:-1]).strip()
    # Un bloc de code oublie sans fermeture -- souvent un ```mermaid en fin de
    # section -- avale tout ce qui suit, parfois des sections entieres, jusqu'a
    # la prochaine cloture ```. Mermaid tente alors de rendre du francais comme
    # un diagramme et affiche "Syntax error in text" dans le PDF. Un nombre
    # impair de ``` signale une ouverture jamais refermee : on la referme ici,
    # avant qu'elle ne devore la suite du cours.
    if len(re.findall(r"^```", md, re.MULTILINE)) % 2:
        md += "\n```"
    return md + "\n"


# ------------------------------------------------------- redaction par paquets

def plan_du_cours(moteur, modele, cle, cle_env,
                  base: str) -> tuple[list[tuple[str, list[str]]], list[str]]:
    """Premier appel : le plan a deux niveaux, et le vocabulaire du cours.

    Le plan sert de carte a chaque section pour qu'aucune ne deborde sur sa
    voisine. Le vocabulaire est decide ici parce que les sections s'ecrivent
    ensuite en parallele : aucune ne voit les autres, et sans liste commune
    les quinze redefiniraient les memes termes.
    """
    consigne = SAUT.join([
        "Tu prepares le plan d'un cours a partir des sources fournies.",
        f"Donne entre {PARTIES_MINI} et {PARTIES_MAXI - 4} grandes parties, sous la "
        f"forme `## 1. Titre`, chacune suivie de ses {SOUS_PARTIES} sous-parties "
        "sous la forme `### 1.1 Titre`. Suis l'ordre du prof et reprends ses "
        "intitules. N'inclus PAS les sections de fin (Vocabulaire, Recap, "
        "Auto-test, Sources).",
        "Les titres annoncent ce qu'on y apprend : l'etudiant qui rouvre ce "
        "cours dans trois mois doit retrouver une notion en lisant le plan, "
        "sans ouvrir les parties. Evite « Generalites », « Introduction », "
        "« Notions de base ».",
        "Termine par une derniere ligne, exactement sous cette forme :",
        "VOCABULAIRE: terme1, terme2, terme3",
        f"en y mettant entre {VOCAB_MINI} et {VOCAB_MAXI} termes, pas un de "
        "plus, ranges dans l'ordre ou le cours les rencontre. Un seul critere "
        "d'admission : sans ce terme, le lecteur ne peut pas comprendre la "
        "suite du cours. Dans le doute, tu n'en mets pas. Un mot du langage "
        "courant employe dans son sens courant n'en est jamais un "
        "(« bancaire », « telecommunications »). Et si deux mots du meme "
        "registre jouent le meme role, soit les deux entrent, soit aucun. "
        "Aucun autre texte, aucun commentaire.",
    ])
    try:
        brut = repondre(moteur, modele, cle, consigne, base, cle_env=cle_env,
                        max_jetons=MAX_JETONS_PLAN)
    except (RuntimeError, urllib.error.URLError) as e:
        dire(f"plan indisponible ({e})")
        return [], []
    plan = plan_hierarchique(brut)
    if len(plan) < PARTIES_MINI:
        dire(f"plan inexploitable, {len(plan)} partie(s) reconnue(s)")
        return [], []
    return plan, vocabulaire_du_plan(brut)


def _plan_en_texte(plan: list[tuple[str, list[str]]]) -> list[str]:
    """Le plan rappele a chaque section, pour qu'aucune ne deborde sur sa voisine."""
    lignes = []
    for partie, sousparties in plan:
        lignes.append("## " + partie)
        lignes += ["### " + sous for sous in sousparties]
    return lignes


def _demander_section(moteur, modele, cle, cle_env, systeme, base: str,
                      plan: list[tuple[str, list[str]]], partie: str,
                      sous: str | None, termes: list[str], mots_cible: int,
                      au_fil) -> str:
    """Une unite d'ecriture : une sous-partie, ou une partie entiere si elle n'en
    a pas.

    `mots_cible` pilote la longueur du cours -- pas le budget de jetons, qui
    n'est qu'un plafond de securite. Mesure : sans cible chiffree, la consigne
    « donne-lui toute la place qu'elle merite, ne resume pas » poussait chaque
    section a se remplir sans borne (24 sections, 24800 mots au total contre
    ~7300 pour la version payante) -- un petit modele suit un chiffre, pas une
    invite a etre genereux.
    """
    titre = sous or partie
    niveau = "###" if sous else "##"
    situe = ("Elle appartient a la partie « " + partie + " » : n'ecris pas la "
             "ligne `## " + partie + "`, elle est deja placee.") if sous else ""
    demande = SAUT.join([
        base, "",
        "===== PLAN DU COURS (ne le recopie pas) =====",
        *_plan_en_texte(plan), "",
        RAPPEL_PERSONA, "",
        "===== TA TACHE =====",
        "Redige UNIQUEMENT « " + titre + " », et rien d'autre.",
        situe,
        "Commence par la ligne `" + niveau + " " + titre + "`, puis developpe-la : "
        "schemas, etapes numerotees, tableaux, exemples chiffres, encadres.",
        "N'ecris pas l'en-tete YAML, ni les autres sections, ni les sections de fin.",
        f"Vise environ {mots_cible} mots pour cette section : ni resumee au point "
        "de perdre le fond, ni gonflee au-dela de ce que le sujet demande.",
        "",
        "Deroule chaque notion dans cet ordre, sans sauter d'etape : l'intuition "
        "en une phrase simple (une analogie du quotidien aide), puis la "
        "decomposition etape par etape et numerotee, puis un exemple concret. "
        "Le cas limite ou le piege ne vient qu'apres, et seulement s'il sert.",
        "",
        "Aere : un schema ```mermaid```, un tableau, des etapes numerotees ou "
        "une liste courte passent avant le texte suivi. Aucun paragraphe de "
        "plus de 4 lignes -- au-dela, coupe-le ou convertis-le. Si la section "
        "decrit un processus, un cycle, une hierarchie ou une comparaison, "
        "fais-en un schema au lieu de le raconter, et ne redis pas en prose ce "
        "que le schema montre deja.",
        "",
        "Termine la section par un encadre `> [!tip] À retenir` de deux ou "
        "trois lignes, qui se suffit a lui-meme : c'est ce que l'etudiant "
        "relira en survol dans trois mois sans rouvrir le reste du cours.",
        "",
        "Ce que les sources ne disent pas et que tu ajoutes de toi-meme (exemple "
        "invente, rappel, mise en garde, analogie) va dans un encadre "
        "`> [!note] Complément` : l'etudiant doit voir d'un coup d'oeil ce qui "
        "vient de son prof et ce qui vient de toi. Ce qui est dans les sources "
        "reste en dehors de ces encadres. Un complement eclaire la notion en "
        "mots simples ; il ne cite jamais une norme ou un sigle absent des "
        "sources pour faire savant.",
        "",
        "Chaque encadre a un type, et le type porte le sens -- il n'est pas "
        "decoratif. Utilise celui qui convient : `> [!example]` pour un cas "
        "concret, `> [!tip]` pour le point cle a retenir, `> [!definition]` "
        "pour un concept a poser avant la suite, `> [!rappel]` pour un acquis "
        "anterieur qu'on reactive, `> [!theoreme]` pour un enonce formel, "
        "`> [!demonstration]` pour un raisonnement pas-a-pas, `> [!danger]` "
        "pour le piege classique a l'examen, `> [!loi]` pour l'enonce "
        "fondateur qui structure tout le cours -- celui-la, une fois dans le "
        "cours entier, pas une de plus.",
        "",
        "Quatre encadres au maximum pour cette section, le `À retenir` et le "
        "`Complément` compris. Le reste de la section vit en listes, tableaux "
        "et schemas. Si tout est encadre, plus rien ne ressort : l'encadre ne "
        "vaut que par ce qu'il laisse en dehors de lui.",
        "",
        ("Vocabulaire du cours, deja reserve pour la section finale : ne redefinis "
         "aucun de ces termes, fais-leur un lien [[#Vocabulaire à retenir|terme]] "
         "quand tu les emploies :" + SAUT + "  " + ", ".join(termes)) if termes else
        "Aucun vocabulaire impose : les termes que tu introduis sont a toi.",
    ])
    return nettoyer(repondre(moteur, modele, cle, systeme, demande,
                             cle_env=cle_env, max_jetons=plafond_jetons(mots_cible),
                             au_fil=au_fil))


def plafond_jetons(mots_cible: int) -> int:
    """Le plafond de securite pour une cible de mots donnee -- pas la cible elle
    meme, une marge large pour ne jamais tronquer une section qui deborderait
    un peu de la sienne."""
    return min(MAX_JETONS_PARTIE, max(600, round(mots_cible * JETONS_PAR_MOT)))


def _sections_de_fin(moteur, modele, cle, cle_env, systeme, corps: str,
                     sources: list[str], termes: list[str], au_fil) -> str:
    """Dernier appel. Il voit le corps assemble, pas les sources brutes : c'est du
    corps que se tirent le recap et l'auto-test."""
    demande_fin = "\n".join([
        "Le corps du cours est deja redige, le voici en entier.", "",
        corps, "",
        "===== TA TACHE =====",
        "Ecris UNIQUEMENT les quatre sections de fin, dans cet ordre exact et sans "
        "les numeroter :",
        "## Vocabulaire à retenir", "## Récap", "## Auto-test", "## Sources", "",
        "Rien d'autre : ni en-tete YAML, ni partie du corps.",
        f"Vise environ {MOTS_CIBLE_FIN} mots au total pour ces quatre sections : "
        "le vocabulaire est un tableau compact, le recap va a l'essentiel, l'auto-test "
        "reste court.",
        "",
        "Chaque definition du tableau est TRIVIALE : une phrase courte, des mots "
        "de tous les jours, suivie d'un exemple concret. Ne definis jamais un "
        "terme par un autre terme technique. Une definition qu'un debutant ne "
        "comprend pas est a reecrire, meme si elle est exacte.",
        "Ecarte du tableau tout mot du langage courant employe dans son sens "
        "courant (« bancaire », « telecommunications ») : mieux vaut dix lignes "
        "qu'on lit que quarante qu'on saute.",
        "Le `## Récap` est fait pour la relecture rapide, la veille de l'examen : "
        "des points cles reperables d'un coup d'oeil, en liste ou en tableau, "
        "pas un paragraphe.",
        "",
        "Fichiers lus, pour la section Sources : " + ", ".join(sources),
        ("Termes marques dans le corps. Reprends-les dans le tableau de "
         "vocabulaire DANS CET ORDRE EXACT, qui est celui de leur apparition "
         "dans le cours : ne les trie ni par ordre alphabetique ni autrement, "
         "l'etudiant doit les retrouver en suivant sa page.\n  "
         + ", ".join(termes)) if termes else "",
    ])
    return nettoyer(repondre(moteur, modele, cle, systeme, demande_fin,
                             cle_env=cle_env, max_jetons=MAX_JETONS_FIN,
                             au_fil=au_fil))


def ecrire_en_parallele(taches: list, ecrire, annoncer) -> list[str]:
    """Les taches menees de front, les resultats ranges dans l'ordre des taches.

    `ecrire(tache) -> str` ne doit jamais lever : une section perdue doit rendre
    son encadre, pas faire tomber les quatorze autres.
    `annoncer(faites, total)` suit l'avancement. Il est appele a chaque section
    qui atterrit, donc dans l'ordre d'arrivee et jamais dans celui du plan : le
    compteur monte toujours, la barre ne recule pas.
    """
    blocs = [""] * len(taches)
    with ThreadPoolExecutor(max_workers=OUVRIERS) as pool:
        futurs = {pool.submit(ecrire, t): i for i, t in enumerate(taches)}
        for faites, futur in enumerate(as_completed(futurs), 1):
            blocs[futurs[futur]] = futur.result()
            annoncer(faites, len(taches))
    return blocs


def assembler_corps(taches: list[tuple[str, str | None]],
                    blocs: list[str]) -> str:
    """Les sections remises dans l'ordre du plan, avec le titre de partie place.

    Les sous-parties n'ecrivent pas la ligne `## Partie` : elle serait repetee a
    chaque sous-partie. C'est ici qu'elle est posee, une fois, au changement de
    partie.
    """
    morceaux, courante = [], None
    for (partie, sous), bloc in zip(taches, blocs):
        if sous and partie != courante:
            morceaux.append("## " + partie)
        courante = partie
        morceaux.append(bloc)
    return (SAUT * 2).join(morceaux)


def rediger_par_paquets(moteur, modele, cle, cle_env, systeme, base: str,
                        matiere: str, type_: str, titre: str,
                        sources: list[str], n_pdf: int, n_photos: int,
                        n_autres: int = 0) -> str:
    """Le cours section par section, toutes ecrites en parallele.

    Le sequentiel consommait 1 a 2 requetes par minute contre un plafond de 20 :
    le temps perdu n'etait pas du quota, c'etait la file indienne.

    ponytail: les sources repartent en entier a chaque appel. C'est le plus simple
    et ca tient dans les quotas mesures ; si ca coince, le plan sait quelles pages
    alimentent quelle section et permettrait de n'envoyer que celles-la.
    """
    dire("Plan du cours", REDACTION_DEBUT)
    plan, vocabulaire = plan_du_cours(moteur, modele, cle, cle_env, base)
    if not plan:
        # sans plan, pas de sections : mieux vaut un cours en un appel qu'aucun cours
        dire("retour a la redaction en un seul appel")
        return nettoyer(repondre(moteur, modele, cle, systeme, base, cle_env=cle_env,
                                 max_jetons=MAX_JETONS_COURS))
    taches = taches_du_plan(plan)
    mots_par_section = max(150, (MOTS_CIBLE_TOTAL - MOTS_CIBLE_FIN) // len(taches))
    dire(f"{len(plan)} parties, {len(taches)} sections, "
         f"{len(vocabulaire)} termes au vocabulaire, ~{mots_par_section} mots/section")
    dire(" | ".join(partie for partie, _ in plan))

    def ecrire(tache: tuple[str, str | None]) -> str:
        """Une section, avec sa seconde chance. Ne leve jamais : un trou silencieux
        au milieu d'un cours serait pire qu'un encadre qui dit ce qui manque."""
        partie, sous = tache
        cible = sous or partie
        for reste in (True, False):
            try:
                return _demander_section(moteur, modele, cle, cle_env, systeme,
                                         base, plan, partie, sous, vocabulaire,
                                         mots_par_section, None)
            except Exception as e:
                if reste:
                    dire(f"echec sur « {cible} », nouvelle tentative dans "
                         f"{ATTENTE_RETENTE} s : {e}")
                    time.sleep(ATTENTE_RETENTE)
                else:
                    dire(f"section « {cible} » abandonnee : {e}")
                    niveau = "###" if sous else "##"
                    return (f"{niveau} {cible}" + SAUT * 2
                            + "> [!warning] Section manquante" + SAUT
                            + f"> La generation de cette section a echoue ({e}). "
                            + "Relance le cours pour la recuperer." + SAUT)

    largeur = (REDACTION_FIN - REDACTION_DEBUT) / (len(taches) + 1)
    blocs = ecrire_en_parallele(
        taches, ecrire,
        lambda faites, total: dire(f"{faites}/{total} sections ecrites",
                                   REDACTION_DEBUT + round(largeur * faites)))

    corps = assembler_corps(taches, blocs)
    # L'ordre du tableau final est celui de la page, pas celui du plan : l'etudiant
    # qui relit tombe sur les termes dans l'ordre ou le cours les lui a presentes,
    # sans avoir a les chercher. Les termes annonces au plan mais jamais lies dans
    # le corps ferment la marche -- ils n'ont pas de place dans la page.
    apparus = termes_definis(corps)
    vus = {t.lower() for t in apparus}
    termes = apparus + [v for v in vocabulaire if v.lower() not in vus]
    dire(f"corps assemble : {len(corps.split())} mots", REDACTION_FIN - round(largeur))

    dire("Vocabulaire, recap et auto-test")
    try:
        fin = _sections_de_fin(moteur, modele, cle, cle_env, systeme, corps,
                               sources, termes, None)
    except (RuntimeError, urllib.error.URLError) as e:
        dire(f"sections de fin absentes : {e}")
        fin = ""

    return (entete_yaml(matiere, type_, titre, n_pdf, n_photos, n_autres) + SAUT
            + f"# {titre}" + SAUT * 2 + corps
            + (SAUT * 2 + fin if fin else "") + SAUT)


# ------------------------------------------------------------------ pipeline

def modele_retenu(moteur: str, modele: str | None, fichier: Path) -> str | None:
    """Le modele qui va vraiment tourner, pour un moteur ou un fournisseur
    (gemini/nim) donne. None pour "gratuit" : la version gratuite n'a pas un
    modele fixe, chaque fournisseur essaye le sien (cf. _gratuit).

    Dans l'ordre : celui demande en ligne de commande, sinon celui garde dans
    keys.env par l'interface (NIM et Gemini), sinon le defaut.
    """
    if modele:
        return modele
    if (cle_reglage := CLES_MODELE.get(moteur)) and (garde := cle_api(fichier, cle_reglage)):
        return garde
    registre = MOTEURS if moteur in MOTEURS else FOURNISSEURS
    return registre[moteur].modele


def destination_retenue(defaut: Path, fichier: Path) -> Path:
    """Le dossier de sortie garde dans keys.env par l'interface, sinon le defaut fourni."""
    if garde := cle_api(fichier, CLE_DESTINATION):
        return Path(garde)
    return defaut


def fabriquer(sources: Path, sortie: Path, matiere: str, type_: str, titre: str,
              liens: list[str], cle_env: Path, moteur: str,
              modele: str | None = None, langue: str = "fr") -> None:
    if souci := probleme(moteur, cle_env):
        raise SystemExit(souci)
    cle = cle_du_moteur(moteur, cle_env)
    modele = modele_retenu(moteur, modele, cle_env)

    fichiers = [f for f in sorted(sources.iterdir()) if f.is_file()]
    photos = [f for f in fichiers if f.suffix.lower() in EXT_IMG]
    pdfs = [f for f in fichiers if f.suffix.lower() == ".pdf"]
    autres = [f for f in fichiers if f not in photos and f not in pdfs]
    if not fichiers:
        raise SystemExit(f"Aucune source dans {sources}")
    dire(f"{MOTEURS[moteur].libelle}" + (f"  [{modele}]" if modele else ""))
    dire(f"{len(photos)} photo(s), {len(pdfs)} PDF, {len(autres)} autre(s) fichier(s)", 5)

    textes_autres = []
    for f in autres:
        if not texte_probable(f):
            dire(f"{f.name} : fichier binaire non pris en charge, ignore")
            continue
        textes_autres.append((f.name, texte_du_fichier(f)))

    transcriptions = transcrire(moteur, modele, cle, photos,
                                sources.parent / ".transcriptions", cle_env)

    dire("Lecture des PDF", PHOTO_FIN)
    # les images des diapos vont la ou l'interface met deja les photos
    dossier_img = sortie.parent / "_img" / slug(titre) / "diapos"
    base = racine_vault(sortie.parent) or sortie.parent
    textes_pdf = []
    for pdf in pdfs:
        try:
            images = images_du_pdf(pdf, dossier_img, base)
        except Exception as e:            # une diapo non rendue ne doit pas tout arreter
            dire(f"{pdf.name} : pages non rendues ({type(e).__name__})")
            images = {}
        texte = texte_du_pdf(pdf, images)
        dire(f"{pdf.name} : {len(texte.split())} mots, {len(images)} page(s) en image")
        textes_pdf.append((pdf.name, texte))

    dire("Redaction du cours", REDACTION_DEBUT)
    dernier = 0.0

    def avancer(cumul: str) -> None:
        """Barre animee par le nombre de mots ecrits, au plus une fois par seconde."""
        nonlocal dernier
        if time.time() - dernier < 1:
            return
        dernier = time.time()
        mots = len(cumul.split())
        part = min(1.0, mots / MOTS_ATTENDUS)
        dire(f"Redaction du cours  ({mots} mots)",
             REDACTION_DEBUT + round((REDACTION_FIN - REDACTION_DEBUT) * part))

    base = demande(matiere, type_, titre, transcriptions, textes_pdf, liens, textes_autres, langue)
    if moteur in PAR_PAQUETS:
        # un seul appel fait rationner le modele gratuit : ~325 mots par partie
        # quoi qu'elle merite. Une partie par appel lui rend son budget entier.
        md = rediger_par_paquets(
            moteur, modele, cle, cle_env, consigne_systeme(langue), base,
            matiere, type_, titre,
            [f.name for f in fichiers], len(pdfs), len(photos), len(textes_autres))
    else:
        md = nettoyer(repondre(
            moteur, modele, cle, consigne_systeme(langue), base,
            cle_env=cle_env, max_jetons=MAX_JETONS_COURS, au_fil=avancer))
    if len(md.split()) < 200:
        raise SystemExit(f"Cours trop court, quelque chose a echoue :\n{md[:400]}")

    md = tracer_moteur(md, MOTEUR_UTILISE)
    dire(f"redige par : {MOTEUR_UTILISE or 'moteur inconnu'}")
    sortie.parent.mkdir(parents=True, exist_ok=True)
    sortie.write_text(md, encoding="utf-8")
    dire(f"{sortie.name} : {len(md.split())} mots", REDACTION_FIN)


# --------------------------------------------------------------------- tests

def _self_test() -> None:
    assert SKILL.is_file(), f"methode introuvable : {SKILL}"
    consigne = consigne_systeme("fr")
    assert consigne.lstrip().startswith("Tu rediges")
    assert "en français" in consigne
    assert "---\nname: cours" not in consigne, "l'en-tete YAML de la skill doit sauter"
    assert "Marquer les ajouts" in consigne, "le corps de la methode doit etre present"
    # la persona ouvre, la charte ferme : la methode est prise entre les deux,
    # et la charte doit passer apres elle pour primer en cas de desaccord
    assert consigne.index("QUI TU ES") < consigne.index("Marquer les ajouts") \
        < consigne.index("CHARTE NON NEGOCIABLE"), "persona, methode, puis charte"
    for exige in ("AUCUN JARGON GRATUIT", "kLOC", "> [!tip] À retenir",
                  "> [!note] Complément", f"{VOCAB_MINI} et {VOCAB_MAXI} termes"):
        assert exige in consigne, f"charte incomplete : {exige}"

    consigne_en = consigne_systeme("en")
    assert "en anglais" in consigne_en

    d = demande("Maths", "TD", "Series", [("p1.jpg", "notes")], [("d.pdf", "diapo")],
                ["Maths/_img/series/p1.jpg"])
    assert "travaux diriges" in d
    assert "![[Maths/_img/series/p1.jpg]]" in d
    assert "===== PDF : d.pdf =====" in d
    assert "affiche l'image de la diapo" not in d, "aucune diapo en image ici"
    avec = demande("Maths", "CM", "S", [], [("d.pdf", "--- page 1 ---  [SCHEMA OU "
                                            "FIGURE, a afficher si la notion est "
                                            "traitee ici : ![[d/p01.webp]]]")], [])
    assert "affiche l'image de la diapo" in avec
    # sans diapo illustree, la consigne d'affichage ne part pas
    assert "affiche l'image de la diapo" not in demande("M", "CM", "S", [],
                                                        [("d.pdf", "page 1")], [])

    # un fichier "autre" (code, .md...) part en bloc de code, langue devinee
    # depuis l'extension -- pas de prose a lui faire deviner
    avec_code = demande("Info", "CM", "S", [], [], [],
                        [("main.py", "print('salut')")])
    assert "===== FICHIER : main.py =====" in avec_code
    assert "```py" in avec_code and "print('salut')" in avec_code
    assert "1 autre(s) fichier(s)" in avec_code

    # heuristique binaire : un octet nul trahit un fichier qu'on ne sait pas lire
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        texte = Path(tmp) / "note.md"
        # newline="" : sinon Windows traduit \n en \r\n a l'ecriture, et le test
        # comparerait des octets que texte_du_fichier n'a jamais vus en entree
        texte.write_text("# Titre\n\ndu texte normal", encoding="utf-8", newline="")
        assert texte_probable(texte)
        assert texte_du_fichier(texte) == "# Titre\n\ndu texte normal"

        binaire = Path(tmp) / "photo.dat"
        binaire.write_bytes(b"\xff\xd8\x00\x01\x02")
        assert not texte_probable(binaire)

        gros = Path(tmp) / "gros.txt"
        gros.write_text("a" * (MAX_OCTETS_FICHIER + 500), encoding="utf-8")
        rendu = texte_du_fichier(gros)
        assert len(rendu) < MAX_OCTETS_FICHIER + 100 and "tronque" in rendu, rendu

    assert slug("Génie Logiciel M1") == "genie-logiciel-m1"
    assert slug("!!") == "cours"

    # detection de figure : du texte seul ne compte pas, un schema vectoriel si
    import pymupdf
    doc = pymupdf.open()
    texte = doc.new_page()
    texte.insert_text((72, 72), "Que du texte sur cette diapo")
    assert not porte_une_figure(texte), "une page de texte n'est pas une figure"
    schema = doc.new_page()
    for n in range(TRACES_FIGURE + 1):
        schema.draw_rect(pymupdf.Rect(50, 50 + n * 40, 200, 80 + n * 40))
    assert porte_une_figure(schema), "un schema vectoriel doit etre repere"
    doc.close()
    assert d.index("PDF : d.pdf") < d.index("NOTES MANUSCRITES"), "les diapos d'abord"

    # la trace du moteur entre dans l'en-tete, et nulle part ailleurs
    t = tracer_moteur("---\nmatiere: X\n---\n\nCorps.\n", "gratuit -> gemini [g-2.5]")
    assert t == "---\nmatiere: X\nmoteur: gratuit -> gemini [g-2.5]\n---\n\nCorps.\n", t
    assert tracer_moteur("Pas d'en-tete", "x") == "Pas d'en-tete"
    assert tracer_moteur("---\na: b\n---\n", "") == "---\na: b\n---\n"

    # plan : on ne garde que les titres, la phrase d'intro parasite saute
    plan = parties_du_plan("Voici le plan :\n## 1. Organisation\n"
                           "## 2. Domaines critiques\n\n## 2. Domaines critiques\n"
                           "Bonne lecture.")
    assert plan == ["1. Organisation", "2. Domaines critiques"], plan
    assert parties_du_plan("aucun titre ici") == []
    # un modele qui numerote sans dieses (nemotron) doit rester exploitable
    liste_nue = "Voici le plan :" + chr(10) + "1. Introduction" + chr(10) +                 "2) Les besoins" + chr(10) + "3. Cycles de vie"
    assert parties_du_plan(liste_nue) == ["Introduction", "Les besoins",
                                          "Cycles de vie"], parties_du_plan(liste_nue)
    # les dieses restent prioritaires : pas de melange des deux lectures
    mixte = "## 1. Vrai titre" + chr(10) + "1. faux titre en prose"
    assert parties_du_plan(mixte) == ["1. Vrai titre"], parties_du_plan(mixte)

    # la cible de mots pilote le plafond de jetons, avec un plancher et un
    # plafond absolu -- jamais en dessous de 600 (une section trop bridee
    # tronquerait), jamais au-dessus de MAX_JETONS_PARTIE (le filet historique)
    assert plafond_jetons(300) == 900          # 300 * JETONS_PAR_MOT(3)
    assert plafond_jetons(50) == 600           # plancher, sinon 150 < 600
    assert plafond_jetons(100000) == MAX_JETONS_PARTIE   # plafond absolu

    # le total vise se repartit sur le nombre reel de sections du plan, pas sur
    # un compte fixe : un plan a 24 sections cible moins par section qu'un plan
    # a 8, pour tenir la meme longueur totale
    cible_24 = max(150, (MOTS_CIBLE_TOTAL - MOTS_CIBLE_FIN) // 24)
    cible_8 = max(150, (MOTS_CIBLE_TOTAL - MOTS_CIBLE_FIN) // 8)
    assert cible_24 < cible_8, (cible_24, cible_8)
    assert cible_24 * 24 <= MOTS_CIBLE_TOTAL - MOTS_CIBLE_FIN + 24  # arrondi pres

    # plan a deux niveaux : les ### garnissent la partie ouverte par le ## juste
    # avant, et une partie sans sous-partie reste une tache a elle seule
    brut = SAUT.join(["Voici le plan :", "## 1. Intro", "### 1.1 Contexte",
                      "### 1.2 Enjeux", "## 2. Modeles",
                      "VOCABULAIRE: cascade, spirale , cascade"])
    plan2 = plan_hierarchique(brut)
    assert plan2 == [("1. Intro", ["1.1 Contexte", "1.2 Enjeux"]),
                     ("2. Modeles", [])], plan2
    assert vocabulaire_du_plan(brut) == ["cascade", "spirale"]   # doublon retire
    assert vocabulaire_du_plan("## 1. Sans vocabulaire") == []   # absent : on continue
    taches2 = taches_du_plan(plan2)
    assert taches2 == [("1. Intro", "1.1 Contexte"), ("1. Intro", "1.2 Enjeux"),
                       ("2. Modeles", None)], taches2

    # le titre de partie est pose une seule fois, avant ses sous-parties
    corps2 = assembler_corps(taches2, ["### 1.1 Contexte", "### 1.2 Enjeux",
                                       "## 2. Modeles"])
    assert corps2.count("## 1. Intro") == 1, corps2
    assert corps2.index("## 1. Intro") < corps2.index("### 1.1 Contexte")            < corps2.index("### 1.2 Enjeux"), corps2

    # les sections finissent en desordre : elles doivent se ranger dans l'ordre
    # du plan, et l'avancement rester croissant
    def _lente(t):
        time.sleep(t[1] / 200)          # la derniere tache finit la premiere
        return f"bloc{t[0]}"
    vues = []
    rangees = ecrire_en_parallele([(i, 5 - i) for i in range(5)], _lente,
                                  lambda faites, total: vues.append(faites))
    assert rangees == [f"bloc{i}" for i in range(5)], rangees
    assert vues == [1, 2, 3, 4, 5], vues

    # un fournisseur hors quota n'est pas rappele avant la fin de sa fenetre.
    # Teste sur une liste a deux entrees, jetable : ORDRE_GRATUIT n'en compte
    # plus qu'une depuis que Gemini est debranche, ce test-la a besoin de deux
    # fournisseurs concurrents pour verifier lequel passe en premier.
    global ORDRE_GRATUIT
    reel, ORDRE_GRATUIT = ORDRE_GRATUIT, ["gemini", "nim"]
    REPRISE.clear()
    assert _fournisseurs_disponibles() == (["gemini", "nim"], 0.0)   # rien de bloque

    # les fragments de l'OCR se rangent en ordre de lecture, les douteux marques
    def _frag(txt, conf, x, y):
        return {"text_prediction": {"text": txt, "confidence": conf},
                "bounding_box": {"points": [{"x": x, "y": y}, {"x": x + .1, "y": y}]}}
    brut = ocr_en_texte([_frag("droite", .9, .8, .50), _frag("bas", .9, .1, .90),
                         _frag("gauche", .9, .1, .50), _frag("flou", .2, .1, .10)])
    assert brut.splitlines() == ["[illisible: flou]", "gauche", "droite", "bas"], brut

    # changer de transcripteur doit invalider le cache, sinon on relit l'ancien
    faux = Path(__file__)
    assert empreinte(faux, "gratuit") != empreinte(faux, "gratuit-ocr")
    assert transcripteur_retenu(None) == "auto"          # pas de reglage : cascade
    assert all(t in TRANSCRIPTEURS for t in ("auto", "ocr", "nemotron-omni"))
    assert NIM_VISION in {t.modele for t in TRANSCRIPTEURS.values()},         "le repli vision doit rester un transcripteur propose"
    REPRISE["gemini"] = time.monotonic() + 45
    assert _fournisseurs_disponibles() == (["nim"], 0.0), _fournisseurs_disponibles()
    REPRISE["nim"] = time.monotonic() + 90
    tous, attente = _fournisseurs_disponibles()      # tous bloques : le plus tot d'abord
    assert tous == ["gemini", "nim"] and 40 < attente <= 45, (tous, attente)
    REPRISE.clear()
    ORDRE_GRATUIT = reel

    # les termes deja definis ne se redefinissent pas dans la partie suivante
    t = termes_definis("Le **[[#Vocabulaire à retenir|modèle en V]]** puis "
                       "[[#Vocabulaire à retenir|cahier des charges]] et encore "
                       "[[#Vocabulaire à retenir|Modèle en V]].")
    assert t == ["modèle en V", "cahier des charges"], t
    assert termes_definis("aucun lien") == []

    e = entete_yaml("Génie Logiciel M1", "CM", "CM1 — Intro", 2, 6)
    assert e.startswith("---\n") and e.endswith("---\n")
    assert "sources: 2 PDF, 6 photos" in e
    assert "tags: [cours, genie logiciel m1, cm]" in e, e

    assert PAR_PAQUETS <= set(MOTEURS), "un moteur par paquets doit exister"

    assert nettoyer("```markdown\n# Titre\n```") == "# Titre\n"
    assert nettoyer("# Titre") == "# Titre\n"
    assert nettoyer("texte\n```py\nx=1\n```\nfin").startswith("texte"), \
        "un bloc de code interne ne doit pas etre mange"
    # un mermaid jamais referme mangerait toute la suite du cours (Mermaid
    # tente ensuite de rendre du francais comme un diagramme)
    non_referme = nettoyer("### 2.6 X\ntexte\n```mermaid\nflowchart LR\nA-->B")
    assert non_referme.count("```") == 2 and non_referme.rstrip().endswith("```"), \
        non_referme

    # la barre doit monter, jamais reculer, et rester dans ses bornes
    etapes = [PHOTO_DEBUT + round((PHOTO_FIN - PHOTO_DEBUT) * i / 6) for i in range(6)]
    assert etapes == sorted(etapes) and etapes[0] == PHOTO_DEBUT and etapes[-1] < PHOTO_FIN

    assert DEFAUT in MOTEURS
    assert set(MOTEURS) == {"claude-cli", "gratuit"}
    # les deux fournisseurs restent implementes (repli si NVIDIA tombe),
    # meme si ORDRE_GRATUIT n'en essaie qu'un seul par defaut
    assert set(FOURNISSEURS) == {"gemini", "nim"}
    assert set(ORDRE_GRATUIT) <= {"gemini", "nim"} and ORDRE_GRATUIT
    # NIM lit desormais bien les images (NIM_VISION = nemotron-omni, mesure
    # superieur a Gemini sur du manuscrit) : plus de contrainte d'ordre imposee
    assert ORDRE_GRATUIT[0] in FOURNISSEURS
    # les listes de preference ne pointent que vers des reglages coherents
    assert trier_par_performance(["z", "nvidia/nemotron-3-ultra-550b-a55b", "a"],
                                 PREFERENCE_NIM) == \
        ["nvidia/nemotron-3-ultra-550b-a55b", "a", "z"], "connu d'abord, puis alpha"
    # le delai se lit dans le corps : sans en-tete Retry-After on attendait
    # 60 s en aveugle la ou Google demande 38 s
    corps429 = ('{"error": {"code": 429, "message": "You exceeded your current '
               'quota. Please retry in 37.6024549s.", "status": "RESOURCE_EXHAUSTED"}}')
    assert _delai_quota(corps429) == 39, _delai_quota(corps429)
    assert _delai_quota("503 high demand") == 60
    assert _delai_quota("retry in 4000s") == 90      # borne haute
    assert issubclass(QuotaEpuise, RuntimeError)     # _gratuit filtre sur ce type

    # une reponse vide doit lever, sinon le cours perd une partie en silence
    assert _non_vide("du texte", "m") == "du texte"
    for vide in ("", " " + chr(10) + "  "):
        try:
            _non_vide(vide, "m")
        except RuntimeError:
            pass
        else:
            raise AssertionError("reponse vide acceptee")

    assert FOURNISSEURS["gemini"].modele in PREFERENCE_GEMINI
    assert not any("pro" in m for m in PREFERENCE_GEMINI), \
        "les modeles Pro sont refuses au palier gratuit (429)"

    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        # lecture des cles : une vraie passe, la valeur d'exemple non
        env = Path(tmp) / "keys.env"
        env.write_text("rem note\nset NVIDIA_API_KEY=nvapi-vraie\n"
                       "set GEMINI_API_KEY=AIza-colle-ta-cle-ici\n",
                       encoding="utf-8")
        assert cle_api(env, "NVIDIA_API_KEY") == "nvapi-vraie"
        assert cle_api(env, "GEMINI_API_KEY") is None, "l'exemple n'est pas une cle"
        assert probleme_fournisseur("nim", env) is None
        assert "GEMINI_API_KEY" in probleme_fournisseur("gemini", env)
        # "gratuit" se contente d'un seul des deux fournisseurs pour demarrer
        assert probleme("gratuit", env) is None, "NIM seul suffit a demarrer"
        assert probleme("inconnu", env)

        vide = Path(tmp) / "no-keys.env"
        vide.write_text("", encoding="utf-8")
        assert "Gemini ou NIM" in probleme("gratuit", vide)
        # aucune cle sur les fournisseurs d'ORDRE_GRATUIT : _gratuit() le dit
        # tout de suite, sans reseau -- pour chacun d'eux, pas pour Gemini s'il
        # n'est plus tente (debranche par defaut, cf. ORDRE_GRATUIT)
        try:
            repondre("gratuit", None, None, None, "salut", cle_env=vide)
            assert False, "aurait du echouer sans aucune cle"
        except RuntimeError as e:
            assert all(code in str(e) for code in ORDRE_GRATUIT), str(e)

        # ecrire un reglage remplace sa ligne et laisse le reste du fichier intact
        ecrire_reglage(env, "NVIDIA_API_KEY", "nvapi-neuve")
        assert cle_api(env, "NVIDIA_API_KEY") == "nvapi-neuve"
        assert "rem note" in env.read_text(encoding="utf-8"), "commentaires perdus"
        assert "GEMINI_API_KEY" in env.read_text(encoding="utf-8"), "autre cle perdue"
        assert env.read_text(encoding="utf-8").count("NVIDIA_API_KEY") == 1, "ligne dupliquee"
        ecrire_reglage(env, CLE_MODELE_NIM, "meta/llama-3.3-70b-instruct")   # absent : ajoute
        assert cle_api(env, CLE_MODELE_NIM) == "meta/llama-3.3-70b-instruct"
        ecrire_reglage(env, CLE_MODELE_GEMINI, "gemini-2.5-pro")
        assert cle_api(env, CLE_MODELE_GEMINI) == "gemini-2.5-pro"

        # sur une photo, NIM bascule sur le modele vision quel que soit le choix
        # de redaction ; sans photo, ou pour Gemini, le choix de redaction tient
        photo_bidon = Path(tmp) / "photo.jpg"
        assert _modele_gratuit("nim", photo_bidon, env) == NIM_VISION
        assert _modele_gratuit("nim", None, env) == "meta/llama-3.3-70b-instruct"
        assert _modele_gratuit("gemini", photo_bidon, env) == "gemini-2.5-pro"
        ecrire_reglage(env, CLE_MODELE_NIM, NIM_VISION)   # deja le bon modele : pas de bascule
        assert _modele_gratuit("nim", photo_bidon, env) == NIM_VISION
        ecrire_reglage(env, CLE_MODELE_NIM, "meta/llama-3.3-70b-instruct")   # remis pour la suite

        # le modele retenu : --modele d'abord, puis keys.env, puis le defaut du moteur
        assert modele_retenu("nim", "openai/gpt-oss-120b", env) == "openai/gpt-oss-120b"
        assert modele_retenu("nim", None, env) == "meta/llama-3.3-70b-instruct"
        assert modele_retenu("gemini", None, env) == "gemini-2.5-pro"
        assert modele_retenu("claude-cli", None, env) == MOTEURS["claude-cli"].modele, \
            "le choix NIM ne doit pas deteindre sur les autres moteurs"
        vierge = Path(tmp) / "vide.env"
        assert modele_retenu("nim", None, vierge) == FOURNISSEURS["nim"].modele
        assert modele_retenu("gemini", None, vierge) == FOURNISSEURS["gemini"].modele

        # le dossier de sortie : garde s'il y en a un, sinon le defaut fourni
        defaut = Path(tmp) / "defaut"
        assert destination_retenue(defaut, vierge) == defaut
        ecrire_reglage(env, CLE_DESTINATION, str(Path(tmp) / "choisi"))
        assert destination_retenue(defaut, env) == Path(tmp) / "choisi"

        # une cle collee de travers se refuse avant d'etre ecrite
        assert cle_mal_formee("nvapi-abc", "NVIDIA_API_KEY") is None
        assert cle_mal_formee("AIzaSyAbc", "GEMINI_API_KEY") is None
        assert cle_mal_formee("", "NVIDIA_API_KEY") and cle_mal_formee("  ", "NVIDIA_API_KEY")
        assert cle_mal_formee("sk-ant-truc", "NVIDIA_API_KEY"), "une cle d'un autre fournisseur passe"
        assert cle_mal_formee("nvapi-abc", "GEMINI_API_KEY"), "une cle d'un autre fournisseur passe"
        assert cle_mal_formee("nvapi-abc def", "NVIDIA_API_KEY"), "une cle avec espace passe"

        # une photo deja transcrite ne doit plus rien couter : cle bidon, aucun reseau
        faux = Path(tmp) / "p1.jpg"
        faux.write_bytes(b"pas vraiment une image")
        cache = Path(tmp) / ".transcriptions"
        cache.mkdir()
        modele = FOURNISSEURS["nim"].modele
        (cache / f"{empreinte(faux, modele)}.txt").write_text("deja lu", encoding="utf-8")
        assert transcrire("nim", modele, "cle-bidon", [faux], cache) == \
            [("p1.jpg", "deja lu")]
        # "gratuit" n'a pas de modele fixe : la cache-key retombe sur le nom du
        # moteur, sans planter sur un modele=None
        (cache / f"{empreinte(faux, 'gratuit')}.txt").write_text("deja lu aussi",
                                                                  encoding="utf-8")
        assert transcrire("gratuit", None, None, [faux], cache) == \
            [("p1.jpg", "deja lu aussi")]

        # changer de moteur -> autre empreinte : on ne relit pas ce qu'un autre
        # modele avait transcrit
        assert empreinte(faux, modele) != empreinte(faux, MOTEURS["claude-cli"].modele)

        # consigne modifiee -> l'empreinte change aussi
        globals()["CONSIGNE_PHOTO"] = CONSIGNE_PHOTO + " (v2)"
        assert not (cache / f"{empreinte(faux, modele)}.txt").is_file()

    print("generator : self-test OK")
    print("  methode :", SKILL)
    env = Path(__file__).resolve().parent / "config" / "keys.env"
    for nom in MOTEURS:
        etat = probleme(nom, env)
        print(f"  {nom:<11} {'pret' if etat is None else 'a configurer'}")
    for nom in FOURNISSEURS:
        etat = probleme_fournisseur(nom, env)
        print(f"    {nom:<9} {'pret' if etat is None else 'a configurer'}  -  "
              f"{modele_retenu(nom, None, env)}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--sources", type=Path)
    p.add_argument("--sortie", type=Path)
    p.add_argument("--matiere", default="Divers")
    p.add_argument("--type", dest="type_", default="CM", choices=list(TYPES))
    p.add_argument("--titre", default="Cours")
    p.add_argument("--moteur", default=DEFAUT, choices=list(MOTEURS))
    p.add_argument("--modele", help="remplace le modele du moteur (NIM : n'importe "
                                    "lequel de son catalogue). Sans effet sur "
                                    "--moteur gratuit : chaque fournisseur garde "
                                    "le sien, reglé dans keys.env.")
    p.add_argument("--lien", dest="liens", action="append", default=[])
    p.add_argument("--cle-env", type=Path,
                   default=Path(__file__).resolve().parent / "config" / "keys.env")
    p.add_argument("--langue", default="fr", choices=list(LANGUES_APP.keys()),
                   help="Langue du cours généré (code ISO 639-1)")
    p.add_argument("--self-test", action="store_true")
    a = p.parse_args()

    if a.self_test:
        _self_test()
        return
    if not a.sources or not a.sortie:
        p.error("--sources et --sortie sont obligatoires")
    fabriquer(a.sources, a.sortie, a.matiere, a.type_, a.titre, a.liens, a.cle_env,
              a.moteur, a.modele, a.langue)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # cp1252 mange les accents
    main()

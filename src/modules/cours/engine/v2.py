#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Cours v2 : trois couches (L'essentiel, les notions, Pour aller plus loin),
un plafond de mots, et un redacteur en chef qui relit et coupe.

Lecture d'un cours v2 sans modele (couches, notions, mots comptes) : les memes
regles que modules/cours/lib.js (notionId, layersOf, notionsOf, countedWords),
a garder d'accord avec lui -- les preuves de travail sont rangees par
identifiant de notion des deux cotes.

Ce fichier n'importe pas generator.py : generator tourne en __main__, le
reimporter en ferait une deuxieme copie (autre TRACE, autres numeros d'appel).
`relire` recoit donc le module en parametre.

Test :  uv run --script v2.py --self-test
"""

import re
import sys
import unicodedata
from contextlib import contextmanager
from pathlib import Path

METHODE = Path(__file__).resolve().parent / "config" / "methode_v2.md"
# Plafonds de mots des couches 1 et 2, selon la longueur reglee
PLAFONDS = {"court": 1500, "normal": 3000, "detaille": 5000}
LANGUES = {"fr": "français", "en": "anglais"}
NUMERO = r"^\s*\d+(\.\d+)*[.)]?\s*"
# En dessous de cette part du texte d'avant, la relecture est une reponse tronquee
PART_MINI = 0.4

REDACTEUR = """Tu es le rédacteur en chef de ce cours. Il a été écrit pour un étudiant qui le relira avant l'examen. Ton travail est de le raccourcir sans rien lui faire perdre d'utile.

Coupe : ce qui est dit deux fois, les phrases qui annoncent, résument ou relient, les exemples qui redisent un exemple, les encadrés qui répètent le texte. Déplace vers « Pour aller plus loin » ce qui ne tombera pas à l'examen. Vérifie que « L'essentiel » tient sur une page et ne contient rien qui ne soit pas dans les notions.

Ne touche pas : les titres `##` (mêmes notions, même ordre, mêmes mots), l'en-tête YAML, les liens d'images `![[...]]`, les blocs ```schema (recopiés tels quels, avec leur légende), les formules, les étapes d'un raisonnement, les exemples travaillés. N'ajoute aucun contenu.

L'essentiel et les notions doivent tenir en {PLAFOND} mots au plus ; ils en font {MOTS} aujourd'hui.

Réponds uniquement par le cours entier corrigé, sans rien avant ni après."""


def _slug(nom: str) -> str:
    """La meme regle que generator.slug et lib.slug."""
    t = unicodedata.normalize("NFKD", nom).encode("ascii", "ignore").decode()
    t = re.sub(r"[^\w\s-]", "", t).strip().lower()
    return re.sub(r"[\s_-]+", "-", t) or "cours"


def identifiant(titre: str) -> str:
    """Titre de notion -> identifiant stable, numero de tete retire."""
    s = _slug(re.sub(NUMERO, "", titre))
    return "notion" if s == "cours" else s


def _simple(titre: str) -> str:
    return titre.strip().lower().replace("’", "'")


def _corps(md: str) -> str:
    return re.sub(r"^---\r?\n.*?\r?\n---\r?\n?", "", md, count=1, flags=re.S)


def _plan(md: str):
    """(lignes, titres ## de la couche 2, couches) ou None si la forme en trois
    couches n'est pas suivie : pas de « L'essentiel », ou aucune notion."""
    lignes = re.split(r"\r?\n", _corps(md))
    titres, code = [], False
    for i, ligne in enumerate(lignes):
        if ligne.lstrip().startswith("```"):
            code = not code
            continue
        if not code and (m := re.match(r"^##\s+(.+?)\s*$", ligne)):
            titres.append((i, m.group(1), _simple(m.group(1))))
    e = next((k for k, t in enumerate(titres) if t[2] == "l'essentiel"), None)
    if e is None:
        return None
    apres = titres[e + 1:]
    fin = next((t for t in apres if t[2] in ("pour aller plus loin", "sources")), None)
    tetes = [t for t in apres if fin is None or t[0] < fin[0]]
    if not tetes:
        return None
    plus = next((t for t in apres if t[2] == "pour aller plus loin"), None)
    src = next((t for t in apres if t[2] == "sources" and (plus is None or t[0] > plus[0])), None)
    coupe = lambda a, b: "\n".join(lignes[a:b])
    return tetes, {
        "essentiel": coupe(titres[e][0] + 1, tetes[0][0]),
        "cours": coupe(tetes[0][0], fin[0] if fin else len(lignes)),
        "plus": coupe(plus[0] + 1, src[0] if src else len(lignes)) if plus else "",
    }


def couches(md: str) -> dict | None:
    p = _plan(md)
    return p[1] if p else None


def notions(md: str) -> list[tuple[str, str]]:
    """(identifiant, titre sans numero) des notions ; deux titres identiques -> -2, -3."""
    p, vus, out = _plan(md), {}, []
    for _, titre, _ in (p[0] if p else []):
        i = identifiant(titre)
        vus[i] = vus.get(i, 0) + 1
        out.append((f"{i}-{vus[i]}" if vus[i] > 1 else i, re.sub(NUMERO, "", titre) or titre))
    return out


# Un schema (bloc ```schema, ou sa description gardee en commentaire) n'est pas du
# texte : il ne compte pas dans les mots. La meme regle que lib.js (SCHEMAS).
SCHEMAS = re.compile(r"^```schema.*?^```[ \t]*$|^<!--\s*schema.*?^-->[ \t]*$", re.S | re.M)


def _mots(t: str) -> int:
    return len(SCHEMAS.sub("", t).split())


def mots_comptes(md: str) -> int:
    """Les mots qui comptent pour le plafond : couches 1 et 2 (cours v1 : tout le corps)."""
    c = couches(md)
    return _mots(c["essentiel"] + " " + c["cours"]) if c else _mots(_corps(md))


def consigne(langue: str, plafond: int) -> str:
    return (METHODE.read_text(encoding="utf-8")
            .replace("{PLAFOND}", str(plafond))
            .replace("{LANGUE}", LANGUES.get(langue, "français")))


def poser_format(md: str) -> str:
    """Ajoute `format: 2` a l'en-tete d'un cours qui suit la forme. Un cours qui
    ne la suit pas n'est pas touche : il reste un cours v1 pour l'appli."""
    if couches(md) is None or not md.startswith("---\n"):
        return md
    fin = md.find("\n---", 3)
    if fin == -1 or re.search(r"^format:\s*2\s*$", md[:fin], flags=re.M):
        return md
    return f"{md[:fin]}\nformat: 2{md[fin:]}"


def relecture_valide(avant: str, apres: str) -> bool:
    """La relecture ne remplace le cours que si elle garde ses notions, sa forme,
    et le raccourcit sans le tronquer."""
    if couches(apres) is None:
        return False
    if [i for i, _ in notions(apres)] != [i for i, _ in notions(avant)]:
        return False
    a, b = mots_comptes(avant), mots_comptes(apres)
    return PART_MINI * a <= b <= a


def relire(g, moteur, modele, cle, cle_env, md: str, plafond: int) -> str:
    """Le redacteur en chef : un appel qui relit le cours entier et coupe.
    `g` : le module generator (repondre, etape, dire, nettoyer, MAX_JETONS_COURS).
    Relecture abimee ou appel rate : le cours d'avant est rendu tel quel."""
    systeme = REDACTEUR.replace("{PLAFOND}", str(plafond)).replace("{MOTS}", str(mots_comptes(md)))
    try:
        with g.etape("Rédacteur en chef"):
            apres = g.nettoyer(g.repondre(moteur, modele, cle, systeme, md, cle_env=cle_env,
                                          max_jetons=g.MAX_JETONS_COURS))
    except Exception as e:  # noqa: BLE001 -- un appel rate ne doit pas couter le cours
        g.dire(f"relecture écartée : {str(e)[:200]}")
        return md
    if not relecture_valide(md, apres):
        g.dire(f"relecture écartée : notions ou longueur abîmées ({mots_comptes(apres)} mots comptés)")
        return md
    g.dire(f"relecture gardée : {mots_comptes(md)} -> {mots_comptes(apres)} mots comptés")
    return apres


# --------------------------------------------------------------------- tests

V2_CORPS = ("# X\n\n## L’essentiel\nun deux trois\n\n## 1. API REST\nquatre cinq\n\n```\n## faux titre\n```\n\n"
            "## 2. Docker\nsix\n\n### 2.1 Détail\n\n## 3. API REST\nsept\n\n"
            "## Pour aller plus loin\nhuit neuf dix\n\n## Sources\n- a.pdf\n")
V2 = "---\ntitre: X\nformat: 2\n---\n" + V2_CORPS
V1 = "---\ntitre: Piles\n---\n\n# Piles\n\n## 1. Récupérer le code\n\ntexte\n\n## Récap\n\nfin\n"


def _self_test() -> None:
    # les memes valeurs que tests/cours.test.js : les deux langages doivent s'accorder
    assert identifiant("1. API REST") == "api-rest"
    assert identifiant("3.2 Clés étrangères") == "cles-etrangeres"
    assert identifiant("  ") == "notion"
    assert notions(V2) == [("api-rest", "API REST"), ("docker", "Docker"), ("api-rest-2", "API REST")]
    assert couches(V2)["essentiel"].strip() == "un deux trois"
    assert couches(V2)["plus"].strip() == "huit neuf dix"
    assert mots_comptes(V2) == 3 + 23, mots_comptes(V2)
    assert couches(V1) is None and notions(V1) == []
    assert mots_comptes(V1) == len(_corps(V1).split())
    assert couches("# X\n\n## L'essentiel\nseul\n\n## Sources\n- a\n") is None, "aucune notion"
    # un schema ne compte pas dans les mots, ni en bloc ni en commentaire (les memes valeurs que lib.js)
    avec = V2.replace("quatre cinq", "quatre cinq\n```schema\n{\"type\": \"pile\", \"x\": 1}\n```\n"
                      "<!-- schema s-1\n{\"type\": \"pile\"}\n-->")
    assert mots_comptes(avec) == mots_comptes(V2), mots_comptes(avec)

    c = consigne("fr", 3000)
    assert "3000 mots" in c and "français" in c and "{PLAFOND}" not in c and "{LANGUE}" not in c
    assert "anglais" in consigne("en", 1500)

    # poser_format : seulement sur un cours qui suit la forme, et une seule fois
    sans = "---\ntitre: X\n---\n" + V2_CORPS
    pose = poser_format(sans)
    assert pose.startswith("---\ntitre: X\nformat: 2\n---\n"), pose[:60]
    assert poser_format(pose) == pose and poser_format(V2) == V2
    assert poser_format(V1) == V1, "la forme n'est pas suivie : pas de format: 2"

    # relecture_valide : memes notions, forme gardee, plus court mais pas tronque
    long = V2.replace("quatre cinq", "quatre cinq " + "mot " * 40)
    assert relecture_valide(long, long.replace("mot " * 40, "mot " * 10))
    assert not relecture_valide(long, long.replace("## 2. Docker\n", "")), "notion disparue"
    assert not relecture_valide(long, V1), "plus de couches"
    assert not relecture_valide(V2, long), "plus long qu'avant"
    assert not relecture_valide(long.replace("mot " * 40, "mot " * 400), V2), "tronquee"

    # relire : garde la relecture valide, rend le cours d'avant sinon (ou si l'appel plante)
    class Faux:
        MAX_JETONS_COURS = 1
        dit: list = []

        def __init__(self, reponse):
            self.reponse = reponse

        @contextmanager
        def etape(self, nom):
            yield

        def nettoyer(self, md):
            return md.strip() + "\n"

        def dire(self, texte, avance=None):
            Faux.dit.append(texte)

        def repondre(self, moteur, modele, cle, systeme, texte, **k):
            assert "3000 mots" in systeme and "{MOTS}" not in systeme
            if isinstance(self.reponse, Exception):
                raise self.reponse
            return self.reponse

    court = long.replace("mot " * 40, "mot " * 10)
    assert relire(Faux(court), "claude-cli", "opus", None, None, long, 3000) == court
    assert "gardée" in Faux.dit[-1]
    assert relire(Faux("Désolé, je ne peux pas."), "claude-cli", "opus", None, None, long, 3000) == long
    assert "écartée" in Faux.dit[-1]
    assert relire(Faux(RuntimeError("panne")), "claude-cli", "opus", None, None, long, 3000) == long
    assert "panne" in Faux.dit[-1]
    print("v2 : tous les tests passent")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if "--self-test" in sys.argv:
        _self_test()

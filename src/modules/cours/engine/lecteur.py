#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["markdown-it-py>=3", "pymupdf>=1.24"]
# ///
"""Prepare un cours pour le lecteur de Hitodama (modules/cours/lecteur.html).

    uv run lecteur.py "C:\\...\\Cours\\COO\\CM - CM1\\CM - CM1.md"   -> JSON sur stdout

Le texte est rendu comme pour le PDF (md2pdf : formules, callouts, schemas).
Chaque partie (## ou ###) recoit ses sources : les diapos que le cours montre
(![[.../diapos/<pdf>/p07.webp]]), sinon celles dont les mots ressemblent le plus
aux siens (texte des pages du PDF du prof, lu ici par pymupdf). Rien ne part sur
internet, aucun modele n'est appele.
"""

import json
import math
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent))
import md2pdf as M  # noqa: E402

EXT = {".webp", ".jpg", ".jpeg", ".png", ".gif", ".bmp"}
STOP = set("""le la les un une des de du et ou en au aux dans sur pour par avec sans est sont ce cet cette ces qui que
quoi dont il elle ils elles on se sa son ses leur leurs pas ne plus mais donc car si comme etre avoir fait faire peut
tout tous toute toutes nous vous the of and to in is are for with this that une aussi bien tres meme entre lors""".split())
MAX_REFS = 2
# les parties tirees du cours entier (lib.js FIN_DE_COURS) : pas de diapo a elles
FIN = ("vocabulaire a retenir", "recap", "auto-test", "sources", "l'essentiel", "pour aller plus loin")
fin = lambda titre: any(f in norm(titre) for f in FIN)  # noqa: E731


def url(p: Path) -> str:
    return "file:///" + quote(str(p).replace("\\", "/"))


def norm(t: str) -> str:
    return unicodedata.normalize("NFKD", t.lower()).encode("ascii", "ignore").decode()


def mots(t: str) -> list[str]:
    return [w for w in re.findall(r"[a-z][a-z0-9_+#]{2,}", norm(t)) if w not in STOP]


def cle(nom: str) -> str:
    """'Cours1.pdf' et le dossier 'cours1' -> 'cours1' : le moteur nomme ainsi le dossier des diapos d'un PDF."""
    return re.sub(r"[^a-z0-9]", "", norm(Path(nom).stem))


def textes_pdf(stem: str, pres: list[Path], n: int) -> list[str] | None:
    """Le texte de chaque page du PDF d'ou viennent les diapos ; None si on ne le retrouve pas (ou s'il a change)."""
    for base in pres:
        for pdf in [*base.glob("*.pdf"), *base.glob("*/*.pdf")]:
            if cle(pdf.name) != stem:
                continue
            try:
                import pymupdf
                with pymupdf.open(str(pdf)) as doc:
                    pages = [p.get_text() for p in doc]
            except Exception:
                continue
            if len(pages) == n:
                return sans_bandeaux(pages)
    return None


ACCENTS = {"´": "́", "`": "̀", "^": "̂", "¨": "̈", "¸": "̧"}


def reparer(t: str) -> str:
    """LaTeX/beamer pose l'accent avant la lettre (« Orient´ee ») : on le remet dessus (« Orientée »)."""
    t = re.sub(r"([´`^¨¸])\s?([A-Za-z])", lambda m: m.group(2) + ACCENTS[m.group(1)], t)
    return unicodedata.normalize("NFC", t)


def sans_bandeaux(pages: list[str]) -> list[str]:
    """Retire les lignes qui reviennent sur beaucoup de pages (bandeau beamer, auteur, pied) : elles ne disent rien de la page."""
    lignes = [[l.strip() for l in reparer(p).splitlines() if l.strip()] for p in pages]
    freq = Counter(l for ls in lignes for l in set(ls))
    seuil = max(3, len(pages) * 0.3)
    return ["\n".join(l for l in ls if freq[l] < seuil) for ls in lignes]


def titre_page(t: str) -> str:
    for ligne in t.splitlines():
        ligne = ligne.strip()
        # une ligne de code (« package up.coo; », « #ifndef ») ne fait pas un titre
        if len(ligne) > 3 and re.search(r"[A-Za-zÀ-ÿ]{3}", ligne) and not re.search(r"[;{}<>#=]|\w( \w){3}", ligne):
            return ligne[:90]
    return ""


def sources(cours: Path) -> dict:
    """Les fichiers du chapitre : un par PDF du prof (ses pages en images), et les photos."""
    files: dict[str, dict] = {}
    photos: list[dict] = []
    for img in sorted((cours.parent / "_img").glob("*")):
        if not img.is_dir():
            continue
        for d in sorted((img / "diapos").glob("*")):
            pages = sorted(p for p in d.iterdir() if p.suffix.lower() in EXT)
            if not pages:
                continue
            textes = textes_pdf(d.name, [cours.parent, cours.parent.parent], len(pages))
            files[d.name] = {"nom": "Cours du prof" if not files else f"Cours du prof ({d.name})", "unite": "diapo",
                             "pages": [{"url": url(p), "titre": titre_page(textes[i]) if textes else "",
                                        "mots": mots(textes[i]) if textes else []} for i, p in enumerate(pages)],
                             "chemins": [str(p) for p in pages]}
        photos += [{"url": url(p), "titre": "", "mots": []} for p in sorted(img.iterdir()) if p.suffix.lower() in EXT]
    if len(files) == 1:
        next(iter(files.values()))["nom"] = "Cours du prof"
    if photos:
        files["photos"] = {"nom": "Tes notes", "unite": "photo", "pages": photos, "chemins": []}
    return files


def parties(corps: str) -> list[dict]:
    """Le cours coupe a chaque ## et ### (hors blocs de code), dans l'ordre ou le lecteur retrouve ses titres."""
    out, code = [{"niveau": 0, "titre": "", "texte": []}], False
    for ligne in corps.splitlines():
        if ligne.lstrip().startswith("```"):
            code = not code
        m = None if code else re.match(r"^(#{2,3})\s+(.+?)(?:\s+#+)?\s*$", ligne)
        if m:
            out.append({"niveau": len(m.group(1)), "titre": m.group(2), "texte": []})
        else:
            out[-1]["texte"].append(ligne)
    for p in out:
        p["texte"] = "\n".join(p["texte"])
    return out


def rattacher(parts: list[dict], files: dict) -> None:
    """refs de chaque partie : les diapos montrees par le cours, puis les plus proches par les mots (tf-idf, cosinus)."""
    index = {f: {Path(c).name.lower(): i for i, c in enumerate(v["chemins"])} for f, v in files.items()}
    docs = [(f, i, Counter(pg["mots"])) for f, v in files.items() for i, pg in enumerate(v["pages"]) if len(pg["mots"]) >= 6]
    df = Counter(w for _, _, c in docs for w in c)
    idf = {w: math.log(1 + len(docs) / n) for w, n in df.items()}

    def vec(c: Counter) -> dict:
        v = {w: (1 + math.log(n)) * idf[w] for w, n in c.items() if w in idf}
        z = math.sqrt(sum(x * x for x in v.values())) or 1
        return {w: x / z for w, x in v.items()}

    vecs = [(f, i, vec(c)) for f, i, c in docs]
    for p in parts:
        refs = []
        for m in re.finditer(r"!\[\[([^\]|]+?/diapos/([^/\]]+)/([^/\]|]+))(?:\|[^\]]*)?\]\]", p["texte"]):
            f, i = m.group(2), index.get(m.group(2), {}).get(m.group(3).lower())
            if i is not None and {"f": f, "p": i + 1} not in refs:
                refs.append({"f": f, "p": i + 1, "montree": True})
        if len(refs) < MAX_REFS and p["niveau"] and vecs and not fin(p["titre"]):
            q = vec(Counter(mots(" ".join([p["titre"]] * 3 + [p["texte"]]))))
            scores = sorted(((sum(x * d.get(w, 0) for w, x in q.items()), f, i) for f, i, d in vecs), reverse=True)
            best = scores[0][0]
            for s, f, i in scores:
                if len(refs) >= MAX_REFS or s < 0.12 or s < best * 0.75:
                    break
                if not any(r["f"] == f and r["p"] == i + 1 for r in refs):
                    refs.append({"f": f, "p": i + 1, "score": round(s, 3)})
        p["refs"] = refs


def preparer(cours: Path) -> dict:
    meta, corps = M.entete(cours.read_text(encoding="utf-8"))
    files = sources(cours)
    parts = parties(corps)
    rattacher(parts, files)
    # les diapos sortent du fil du texte : le panneau de droite les montre, a cote de la partie
    corps = re.sub(r"!\[\[[^\]]+?/diapos/[^\]]+\]\]\n?", "", corps)
    vocab = M.termes_vocabulaire(corps)
    corps = M.resoudre_images(corps, cours)
    corps = M.convertir_callouts(corps)
    corps = M.convertir_surlignage(corps)
    corps, maths = M.proteger_maths(corps)
    html = M.numeroter(M.restaurer_maths(M.en_html(corps), maths))
    html = M.ancrer_vocabulaire(html, vocab)
    for v in files.values():
        del v["chemins"]
        for pg in v["pages"]:
            del pg["mots"]
    return {"meta": meta, "html": html, "files": files,
            "parts": [{"niveau": p["niveau"], "titre": p["titre"], "refs": p["refs"]} for p in parts if p["niveau"]]}


def _self_test() -> None:
    ps = parties("intro\n## 1. A\ntexte\n```\n## pas un titre\n```\n### 1.1 B\nfin")
    assert [(p["niveau"], p["titre"]) for p in ps] == [(0, ""), (2, "1. A"), (3, "1.1 B")], ps
    assert parties("## 5. Classes en C#\n## Fin ##")[1:] == [{"niveau": 2, "titre": "5. Classes en C#", "texte": ""},
                                                       {"niveau": 2, "titre": "Fin", "texte": ""}]
    assert titre_page("package up . coo ;\n#i f n d e f\nLes objets") == "Les objets"
    assert cle("Cours1.pdf") == "cours1" == cle("cours1")
    assert reparer("Orient´ee Pr´eparation") == "Orientée Préparation", reparer("Orient´ee Pr´eparation")
    assert sans_bandeaux(["POO\nA", "POO\nB", "POO\nC", "POO\nD"]) == ["A", "B", "C", "D"]
    assert fin("Vocabulaire à retenir") and fin("Récap") and not fin("2. Concept d'objet")
    assert mots("Les Objets, l'état !") == ["objets", "etat"], mots("Les Objets, l'état !")
    files = {"c": {"chemins": ["x/p01.webp", "x/p02.webp"], "pages": [
        {"mots": mots("pile tas memoire adresse pointeur variable locale")},
        {"mots": mots("heritage classe mere classe fille polymorphisme virtuel")}]}}
    ps = [{"niveau": 2, "titre": "La pile et le tas", "texte": "une variable locale vit dans la pile, l'objet dans le tas"},
          {"niveau": 3, "titre": "Vu", "texte": "![[a/_img/cm1/diapos/c/p02.webp]] et rien d'autre"}]
    rattacher(ps, files)
    assert ps[0]["refs"][0]["p"] == 1, ps[0]
    assert ps[1]["refs"][0] == {"f": "c", "p": 2, "montree": True}, ps[1]
    print("ok")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        _self_test()
    else:
        args = [a for a in sys.argv[1:] if not a.startswith("-")]
        if not args or not Path(args[0]).is_file():
            sys.exit("Usage : lecteur.py cours.md")
        sys.stdout.reconfigure(encoding="utf-8")
        print(json.dumps(preparer(Path(args[0]).resolve()), ensure_ascii=False))

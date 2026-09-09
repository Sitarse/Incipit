# /// script
# dependencies = [
#   "flask",
#   "pywebview[qt]",
# ]
# ///
"""Incipit : point d'entree de l'application.

Sert le frontend (frontend/) et expose l'API que celui-ci appelle, puis ouvre
le tout dans une fenetre native (pywebview). Le serveur n'ecoute que sur
127.0.0.1 : rien n'est publie sur le reseau.

Ne fait aucun travail lui-meme -- il delegue :
  engine.py    chemins, reglages, lancement des sous-processus, PDF
  generator.py   redaction du cours (sous-processus `uv run`)
  md2pdf.py    mise en page du PDF (sous-processus `uv run`)

Lancer :  uv run --script app.py   (ou un double-clic dans launchers/)
"""

import json
import logging
import os
import queue
import shutil
import subprocess
import sys
import threading
import urllib.parse
from logging.handlers import RotatingFileHandler
from pathlib import Path

from flask import (Flask, Response, jsonify, request, send_from_directory,
                   stream_with_context)

import generator
import engine
from engine import (DEFAUT, MOTEURS, TYPES, matieres_existantes, nom_note,
                    racine_vault, slug, trouver_uv)

# static_url_path='' : frontend/ est servi a la racine, sinon app.js ne serait
# joignable que sur /static/app.js et la page resterait sans aucun script.
app = Flask(__name__, static_folder='frontend', static_url_path='')
BASE = engine.ICI / "workspace"

# Lance par pythonw, l'app n'a aucune console : ce fichier est le seul endroit
# ou lire ce qui s'est passe apres coup (erreurs de fond, ligne par ligne de
# la generation). RotatingFileHandler evite qu'il ne grossisse sans fin.
DOSSIER_LOGS = engine.ICI / "logs"
FICHIER_LOG = DOSSIER_LOGS / "app.log"
logger = logging.getLogger("incipit")


def configurer_logs() -> None:
    """Branche le journal sur logs/app.log et y detourne les erreurs fatales.

    A appeler une seule fois, au demarrage : sans console, une exception non
    capturee disparaitrait sans laisser de trace.
    """
    DOSSIER_LOGS.mkdir(exist_ok=True)
    handler = RotatingFileHandler(FICHIER_LOG, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s", "%Y-%m-%d %H:%M:%S"))
    racine = logging.getLogger()
    racine.addHandler(handler)
    racine.setLevel(logging.INFO)
    logging.getLogger("werkzeug").setLevel(logging.WARNING)   # le detail des requetes HTTP n'aide pas au diagnostic

    def sur_exception(exc_type, exc, tb):
        logging.critical("Exception non capturee", exc_info=(exc_type, exc, tb))

    sys.excepthook = sur_exception

# Une file par onglet ouvert sur /api/progression : la generation tourne dans
# un thread et pousse dedans, chaque client vide la sienne a son rythme. Le
# verrou protege la liste, modifiee par le thread de generation comme par les
# connexions qui vont et viennent.
clients = []
client_lock = threading.Lock()


# ------------------------------------------------------- noms et emplacements
# Ce que l'interface envoie est libre : ces fonctions en font des noms de
# fichiers et de dossiers surs, et toujours les memes. Un cours doit se
# retrouver au meme endroit qu'a sa creation, sinon l'ouverture echoue.

def get_matiere(matiere_var):
    """Matiere saisie -> nom de dossier. Vide = "Divers", jamais rien."""
    brut = matiere_var.strip()
    return nom_note(brut) if brut else "Divers"

def get_titre(titre_var):
    """Titre saisi -> nom de note. Vide = "Chapitre 1", jamais rien."""
    return nom_note(titre_var) if titre_var else "Chapitre 1"

def get_type(type_var):
    """CM/TD/TP quelle que soit la casse envoyee par l'interface.

    Les boutons radio du HTML valent "cm"/"td"/"tp" : sans passer par ici, le
    cours s'ecrivait "cm - Titre.md" et n'etait plus retrouve par get_sortie.
    """
    code = (type_var or "").strip().upper()
    return code if code in TYPES else "CM"

def get_dossier(matiere_var, type_var, titre_var):
    """Le dossier de travail de ce cours, dans workspace/ (slugs : sans accent)."""
    return BASE / slug(get_matiere(matiere_var)) / f"{get_type(type_var).lower()}-{slug(get_titre(titre_var))}"

def get_sources(matiere_var, type_var, titre_var):
    """Ou atterrissent les photos et PDF deposes dans l'interface."""
    return get_dossier(matiere_var, type_var, titre_var) / "sources"

def get_sortie(matiere_var, type_var, titre_var):
    """La note .md produite, dans son propre dossier au sein de la matiere
    (accents gardes : c'est ce que l'utilisateur lit dans Obsidian).

    Un cours n'est jamais un seul fichier : il traine son PDF, sa fiche et le
    PDF de celle-ci, le lanceur de son TP, ses images. A plat, une matiere de
    dix cours devenait un tas de cinquante fichiers -- d'ou un dossier par
    cours, a son nom.

    Les cours ecrits avant ce rangement restent lus la ou ils sont : sinon
    l'application ne les retrouvait plus et en aurait fabrique un doublon a
    cote.
    """
    dossier = engine.destination_courante() / get_matiere(matiere_var)
    nom = f"{get_type(type_var)} - {get_titre(titre_var)}"
    a_plat = dossier / f"{nom}.md"
    return a_plat if a_plat.is_file() else dossier / nom / f"{nom}.md"

def get_dossier_img(matiere_var, type_var, titre_var):
    """Les photos recopiees a cote du cours, pour qu'Obsidian les affiche.

    Meme formule que generator.py pour les images de diapos : dans le dossier
    du cours, quel qu'il soit. Un cours reste a plat garde donc son ancien
    emplacement, ou les images de toute la matiere cohabitent -- c'est ce
    sous-dossier par titre qui les y empeche de s'ecraser.
    """
    return (get_sortie(matiere_var, type_var, titre_var).parent
            / "_img" / slug(get_titre(titre_var)))


# --------------------------------------------------------- progression (SSE)

def notify_clients(message):
    """Pousse un evenement deja formate vers tous les onglets a l'ecoute."""
    with client_lock:
        for q in clients:
            q.put(message)

def sse_event(event_type, data):
    """Formate un evenement Server-Sent Events. La ligne vide finale est ce qui
    le termine : sans elle, le navigateur attend indefiniment la suite."""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/api/matieres")
def api_matieres():
    return jsonify(matieres_existantes())

@app.route("/api/status", methods=["POST"])
def api_status():
    """L'etat du cours en cours de preparation : destination, sources deja
    deposees, et ce qui manquerait au moteur choisi pour demarrer."""
    data = request.json
    matiere = data.get("matiere", "")
    type_ = data.get("type", "CM")
    titre = data.get("titre", "")

    sources_path = get_sources(matiere, type_, titre)
    fichiers = []
    if sources_path.is_dir():
        for f in sorted(sources_path.iterdir()):
            if f.is_file():
                fichiers.append({
                    "nom": f.name,
                    "taille_ko": f.stat().st_size // 1024,
                    "ext": f.suffix.lower()
                })

    moteur_courant = data.get("moteur", DEFAUT)
    souci = engine.moteur_pret(moteur_courant)

    return jsonify({
        "destination": str(engine.destination_courante()),
        "fichiers": fichiers,
        "souci": souci,
        "moteurs": {code: m.libelle for code, m in MOTEURS.items()}
    })

@app.route("/api/fichiers", methods=["POST"])
def api_upload_fichiers():
    """Recoit les photos et PDF deposes, et les range dans les sources du cours.

    Le nom est reduit a son basename : celui envoye par le navigateur ne doit
    pas pouvoir contenir de chemin. Un homonyme est suffixe plutot qu'ecrase --
    deposer deux fois "photo.jpg" ne doit pas faire disparaitre la premiere.
    """
    matiere = request.form.get("matiere", "")
    type_ = request.form.get("type", "CM")
    titre = request.form.get("titre", "")
    sources_path = get_sources(matiere, type_, titre)
    sources_path.mkdir(parents=True, exist_ok=True)
    
    for key, f in request.files.items():
        if f.filename:
            name = os.path.basename(f.filename)
            dest = sources_path / name
            i = 1
            while dest.exists():
                stem = Path(name).stem
                suffix = Path(name).suffix
                dest = sources_path / f"{stem}-{i}{suffix}"
                i += 1
            f.save(str(dest))
    return jsonify({"ok": True})

@app.route("/api/fichiers/<nom>", methods=["DELETE"])
def api_delete_fichier(nom):
    """Retire une source deposee par erreur."""
    data = request.json
    matiere = data.get("matiere", "")
    type_ = data.get("type", "CM")
    titre = data.get("titre", "")
    nom = urllib.parse.unquote(nom)
    sources_path = get_sources(matiere, type_, titre)
    cible = sources_path / nom
    if cible.is_file():
        cible.unlink()
    return jsonify({"ok": True})

def _copier_images(sources_path, dossier_img, sortie_path):
    """Recopie les photos a cote du cours et rend leurs liens relatifs.

    Relatifs a la racine du coffre quand il y en a un : c'est ainsi qu'Obsidian
    resout ![[image.png]]. Sans coffre, on se rabat sur le dossier de la note.
    """
    fichiers = [f for f in sources_path.iterdir() if f.is_file()] if sources_path.is_dir() else []
    images = [f for f in fichiers if f.suffix.lower() in generator.EXT_IMG]
    if not images:
        return []
    dossier_img.mkdir(parents=True, exist_ok=True)
    base = racine_vault(dossier_img) or sortie_path.parent
    liens = []
    for f in images:
        shutil.copy2(f, dossier_img / f.name)
        liens.append((dossier_img / f.name).relative_to(base).as_posix())
    return liens

def _pipeline(uv, sources_path, sortie_path, dossier_img, matiere, type_, titre, moteur_choisi, langue="fr"):
    """La generation complete, de bout en bout. Tourne dans un thread.

    Copie des photos -> generator.py en sous-processus -> md2pdf.py. Chaque ligne
    du sous-processus est traduite par engine.analyser() et repoussee en SSE :
    c'est ce qui fait avancer la barre de progression cote navigateur.

    Rien ne remonte par exception : l'appelant a deja rendu la main. Tout echec
    part vers l'interface en evenement "erreur", et dans logs/app.log.
    """
    def journal(t):
        notify_clients(sse_event("log", {"texte": t}))
        notify_clients(sse_event("detail", {"texte": t}))
    
    try:
        notify_clients(sse_event("phase", {"texte": "Preparation", "pct": 3}))
        sortie_path.parent.mkdir(parents=True, exist_ok=True)
        engine.assurer_vault(engine.destination_courante())
        
        images = _copier_images(sources_path, dossier_img, sortie_path)
        if images:
            journal(f"{len(images)} photo(s) copiee(s) a cote du cours.")
            
        cmd = engine.commande_generer(uv, sources_path, sortie_path, matiere, type_, titre, images, moteur_choisi, None, langue)
        proc = subprocess.Popen(
            cmd, cwd=engine.ICI, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", bufsize=1,
            creationflags=engine.SANS_FENETRE
        )
        
        for ligne in proc.stdout:
            if ligne.strip():
                logger.info(ligne.rstrip())
            for genre, charge in engine.analyser(ligne):
                if genre == "phase":
                    texte, pct = charge
                    notify_clients(sse_event("phase", {"texte": texte, "pct": pct}))
                elif genre == "log":
                    notify_clients(sse_event("log", {"texte": charge, "tag": "doux"}))
                elif genre == "detail":
                    notify_clients(sse_event("detail", {"texte": charge}))
                    
        code = proc.wait()
        if code != 0:
            notify_clients(sse_event("erreur", {"message": f"La generation a echoue (code {code})."}))
            return
            
        if not sortie_path.is_file():
            notify_clients(sse_event("erreur", {"message": "Aucun cours n'a ete ecrit."}))
            return
            
        notify_clients(sse_event("phase", {"texte": "Mise en page du PDF", "pct": 96}))
        pdf = engine.faire_pdf(sortie_path, journal)
        notify_clients(sse_event("fini", {"pdf": str(pdf) if pdf else None}))
        
    except Exception as e:
        logger.exception("Echec de la generation")
        notify_clients(sse_event("erreur", {"message": f"{type(e).__name__} : {e}"}))

@app.route("/api/generer", methods=["POST"])
def api_generer():
    """Lance la generation et rend la main tout de suite.

    Le travail part dans un thread : une generation dure des minutes, la
    requete ne peut pas l'attendre. La suite se suit sur /api/progression.
    """
    data = request.json
    matiere = data.get("matiere", "")
    type_ = data.get("type", "CM")
    titre = data.get("titre", "")
    moteur_choisi = data.get("moteur", DEFAUT)
    langue = data.get("langue", "fr")
    
    uv = trouver_uv()
    if not uv:
        return jsonify({"erreur": "`uv` est introuvable."}), 400
        
    if souci := engine.moteur_pret(moteur_choisi):
        return jsonify({"erreur": souci}), 400
        
    sources_path = get_sources(matiere, type_, titre)
    sortie_path = get_sortie(matiere, type_, titre)
    dossier_img = get_dossier_img(matiere, type_, titre)
    
    threading.Thread(target=_pipeline,
                     args=(uv, sources_path, sortie_path, dossier_img,
                           get_matiere(matiere), get_type(type_),
                           get_titre(titre), moteur_choisi, langue),
                     daemon=True).start()
    return jsonify({"ok": True})


@app.route("/api/generer-complet", methods=["POST"])
def api_generer_complet():
    """Lance une generation complete avec options choisies (cours, TP, fiche).

    Options :
    - generer_cours : bool, generer le cours principal
    - generer_tp : bool, generer le TP interactif
    - generer_fiche : bool, generer la fiche de revision
    - niveau : str, niveau pour TP/fiche (defaut: "comme le cours")
    - tp_focus : str, sur quoi porte le TP (defaut: vide = tout le cours)
    - tp_questions : int, nombre d'exercices du TP (defaut: 0 = 5, progressifs)

    Si generer_cours=false mais qu'on veut TP/fiche, le cours doit exister.
    """
    data = request.json
    matiere = data.get("matiere", "")
    type_ = data.get("type", "CM")
    titre = data.get("titre", "")
    moteur_choisi = data.get("moteur", DEFAUT)
    langue = data.get("langue", "fr")
    
    generer_cours = data.get("generer_cours", True)
    generer_tp = data.get("generer_tp", False)
    generer_fiche = data.get("generer_fiche", False)
    niveau = data.get("niveau") or "comme le cours"
    tp_focus = (data.get("tp_focus") or "").strip()
    # Un champ vide, du texte, un nombre absurde : tout ce qui n'est pas un
    # entier plausible retombe sur le defaut d'exercices.py (5, progressifs).
    try:
        tp_questions = max(0, min(50, int(data.get("tp_questions") or 0)))
    except (TypeError, ValueError):
        tp_questions = 0

    # Au moins une option doit être cochée
    if not any([generer_cours, generer_tp, generer_fiche]):
        return jsonify({"erreur": "Choisis au moins une option à générer."}), 400
    
    # Si on ne génère pas le cours mais qu'on veut les supports, vérifier que le cours existe
    if not generer_cours and any([generer_tp, generer_fiche]):
        sortie_path = get_sortie(matiere, type_, titre)
        if not sortie_path.is_file():
            return jsonify({"erreur": "Le cours n'existe pas encore. Coche 'Cours' pour le générer d'abord."}), 400
    
    uv = trouver_uv()
    if not uv:
        return jsonify({"erreur": "`uv` est introuvable."}), 400
        
    if souci := engine.moteur_pret(moteur_choisi):
        return jsonify({"erreur": souci}), 400
    
    sources_path = get_sources(matiere, type_, titre)
    sortie_path = get_sortie(matiere, type_, titre)
    dossier_img = get_dossier_img(matiere, type_, titre)
    
    options = {
        "generer_cours": generer_cours,
        "generer_tp": generer_tp,
        "generer_fiche": generer_fiche,
        "niveau": niveau,
        "tp_focus": tp_focus,
        "tp_questions": tp_questions,
    }
    
    threading.Thread(target=_pipeline_complet,
                     args=(uv, sources_path, sortie_path, dossier_img,
                           get_matiere(matiere), get_type(type_),
                           get_titre(titre), moteur_choisi, langue, options),
                     daemon=True).start()
    return jsonify({"ok": True})


def _pipeline_complet(uv, sources_path, sortie_path, dossier_img, matiere, type_, titre, moteur_choisi, langue, options):
    """Pipeline complet : cours + supports selon options. Tourne dans un thread."""
    def journal(t):
        notify_clients(sse_event("log", {"texte": t}))
        notify_clients(sse_event("detail", {"texte": t}))
    
    try:
        # Phase 1 : Générer le cours si demandé
        if options["generer_cours"]:
            notify_clients(sse_event("phase", {"texte": "Préparation du cours", "pct": 3}))
            sortie_path.parent.mkdir(parents=True, exist_ok=True)
            engine.assurer_vault(engine.destination_courante())
            
            images = _copier_images(sources_path, dossier_img, sortie_path)
            if images:
                journal(f"{len(images)} photo(s) copiée(s) à côté du cours.")
            
            cmd = engine.commande_generer(uv, sources_path, sortie_path, matiere, type_, titre, images, moteur_choisi, None, langue)
            proc = subprocess.Popen(
                cmd, cwd=engine.ICI, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace", bufsize=1,
                creationflags=engine.SANS_FENETRE
            )
            
            for ligne in proc.stdout:
                if ligne.strip():
                    logger.info(ligne.rstrip())
                for genre, charge in engine.analyser(ligne):
                    if genre == "phase":
                        texte, pct = charge
                        notify_clients(sse_event("phase", {"texte": texte, "pct": pct}))
                    elif genre == "log":
                        notify_clients(sse_event("log", {"texte": charge, "tag": "doux"}))
                    elif genre == "detail":
                        notify_clients(sse_event("detail", {"texte": charge}))
                        
            code = proc.wait()
            if code != 0:
                notify_clients(sse_event("erreur", {"message": f"La génération du cours a échoué (code {code})."}))
                return
                
            if not sortie_path.is_file():
                notify_clients(sse_event("erreur", {"message": "Aucun cours n'a été écrit."}))
                return
            
            notify_clients(sse_event("phase", {"texte": "Mise en page du PDF", "pct": 96}))
            pdf = engine.faire_pdf(sortie_path, journal)

        # Phase 2 : Générer les supports si demandés
        fichiers = None
        if any([options["generer_tp"], options["generer_fiche"]]):
            notify_clients(sse_event("phase", {"texte": "Génération des supports", "pct": 10}))
            faits = engine.faire_supports_complets(sortie_path, journal, niveau=options["niveau"],
                                                    moteur=moteur_choisi, langue=langue,
                                                    faire_tp=options["generer_tp"],
                                                    faire_fiche=options["generer_fiche"],
                                                    focus=options.get("tp_focus", ""),
                                                    questions=options.get("tp_questions", 0))
            if not faits:
                notify_clients(sse_event("erreur", {"message": "Aucun support n'a été écrit."}))
                return
            fichiers = [str(p) for p in faits]

        # Un seul evenement final, tout a la fin : le frontend ferme le flux SSE
        # des qu'il le recoit. Un "fini" envoye apres le cours coupait la ligne
        # avant que les supports, generes ensuite, aient pu s'annoncer.
        notify_clients(sse_event("phase", {"texte": "Terminé", "pct": 100}))
        notify_clients(sse_event("fini" if options["generer_cours"] else "supports",
                                 {"pdf": str(pdf) if options["generer_cours"] and pdf
                                  else None, "fichiers": fichiers}))

    except Exception as e:
        logger.exception("Echec de la generation complete")
        notify_clients(sse_event("erreur", {"message": f"{type(e).__name__} : {e}"}))


def _supports(sortie_path, moteur_choisi, niveau, langue="fr"):
    """TP et fiche a partir d'un cours deja ecrit. Tourne dans un thread.

    Meme flux SSE que la generation : l'interface n'a qu'une barre, autant s'en
    servir. L'evenement final est "supports" et non "fini", parce que "fini"
    rebranche le bouton principal sur le PDF -- ici il n'y a pas de PDF.
    """
    def journal(t):
        notify_clients(sse_event("log", {"texte": t}))
        notify_clients(sse_event("detail", {"texte": t}))

    try:
        notify_clients(sse_event("phase", {"texte": "Exercices et fiches", "pct": 10}))
        faits = engine.faire_supports(sortie_path, journal, niveau=niveau,
                                      moteur=moteur_choisi, langue=langue)
        if not faits:
            notify_clients(sse_event("erreur",
                                     {"message": "Aucun support n'a ete ecrit."}))
            return
        notify_clients(sse_event("phase", {"texte": "Supports prets", "pct": 100}))
        notify_clients(sse_event("supports",
                                 {"fichiers": [str(p) for p in faits]}))
    except Exception as e:
        logger.exception("Echec des supports")
        notify_clients(sse_event("erreur", {"message": f"{type(e).__name__} : {e}"}))

@app.route("/api/exercices", methods=["POST"])
def api_exercices():
    """Fabrique les supports de revision d'un cours deja ecrit.

    Rend la main tout de suite, comme /api/generer : trois appels au modele se
    comptent en minutes. La suite se suit sur /api/progression.
    """
    data = request.json
    matiere = data.get("matiere", "")
    type_ = data.get("type", "CM")
    titre = data.get("titre", "")
    moteur_choisi = data.get("moteur", DEFAUT)
    niveau = data.get("niveau") or "comme le cours"
    langue = data.get("langue", "fr")

    uv = trouver_uv()
    if not uv:
        return jsonify({"erreur": "`uv` est introuvable."}), 400

    if souci := engine.moteur_pret(moteur_choisi):
        return jsonify({"erreur": souci}), 400

    sortie_path = get_sortie(matiere, type_, titre)
    if not sortie_path.is_file():
        return jsonify({"erreur": "Genere d'abord le cours : les exercices se "
                                  "fabriquent a partir de lui."}), 400

    threading.Thread(target=_supports, args=(sortie_path, moteur_choisi, niveau, langue),
                     daemon=True).start()
    return jsonify({"ok": True})

def _chemin_exercices(matiere, type_, titre):
    return engine.chemin_tp(get_sortie(matiere, type_, titre), "_exercices.json")

@app.route("/api/exercices_data")
def api_exercices_data():
    """Les exercices deja fabriques pour ce cours, pour les prendre dans
    l'interface (correction live du code, du calcul et du qualitatif)."""
    chemin = _chemin_exercices(request.args.get("matiere", ""),
                               request.args.get("type", "CM"),
                               request.args.get("titre", ""))
    if not chemin.is_file():
        return jsonify({"erreur": "Aucun exercice genere pour ce cours."}), 404
    return jsonify(json.loads(chemin.read_text(encoding="utf-8")))

@app.route("/api/exercices_code", methods=["POST"])
def api_exercices_code():
    """Corrige un exercice de type "code" : fait tourner le code envoye
    contre ses tests, isole dans un sous-processus (cf. engine.corriger_code).
    """
    data = request.json
    chemin = _chemin_exercices(data.get("matiere", ""), data.get("type", "CM"),
                               data.get("titre", ""))
    if not chemin.is_file():
        return jsonify({"erreur": "Aucun exercice genere pour ce cours."}), 404
    exercices = json.loads(chemin.read_text(encoding="utf-8"))
    index = data.get("index")
    if not isinstance(index, int) or not (0 <= index < len(exercices)):
        return jsonify({"erreur": "Exercice introuvable."}), 400
    exo = exercices[index]
    if exo.get("type") != "code":
        return jsonify({"erreur": "Cet exercice n'est pas de type code."}), 400
    resultat = engine.corriger_code(data.get("code", ""), exo.get("tests", []))
    return jsonify(resultat)

@app.route("/api/progression")
def api_progression():
    """Flux Server-Sent Events : avancement, journal, fin ou erreur.

    Se ferme avec l'onglet -- le GeneratorExit retire la file de la liste,
    sinon les evenements s'y empileraient sans personne pour les lire.
    """
    def stream():
        q = queue.Queue()
        with client_lock:
            clients.append(q)
        try:
            while True:
                msg = q.get()
                yield msg
        except GeneratorExit:
            with client_lock:
                if q in clients:
                    clients.remove(q)
    return Response(stream_with_context(stream()), mimetype="text/event-stream")

@app.route("/api/recents")
def api_recents():
    """Les 8 derniers cours ecrits, pour les rouvrir d'un clic."""
    dest = engine.destination_courante()
    recents = []
    if dest.is_dir():
        fichiers = sorted((f for f in dest.rglob("*.md")
                           if not f.name.startswith(".")),
                          key=lambda p: p.stat().st_mtime, reverse=True)[:8]
        recents = [{"nom": f.stem, "chemin": str(f)} for f in fichiers]
    return jsonify(recents)


def fournisseur_du_transcripteur(code):
    """Le fournisseur dont la cle sert a ce lecteur de photos.

    "auto" suit ORDRE_GRATUIT, et l'OCR tape l'API NVIDIA avec la cle NIM
    (cf. _lire_photo) : sans ces deux redirections la pastille reclamerait une
    cle "ocr" ou "auto", qui n'existent pas.
    """
    f = generator.TRANSCRIPTEURS[code].fournisseur
    if f is None:
        return generator.ORDRE_GRATUIT[0]
    return "nim" if f == "ocr" else f


def etat_fournisseur(code):
    """De quoi peindre la pastille : le nom, ce qui manque, la tete de la cle.
    Jamais la cle elle-meme."""
    nom_cle = generator.FOURNISSEURS[code].cle
    nom, _, _ = generator.FOURNISSEURS[code].libelle.partition(" - ")
    return {"code": code, "nom": nom, "souci": engine.fournisseur_pret(code),
            "prefixe": generator.PREFIXES_CLE.get(nom_cle, "")}


@app.route("/api/moteurs")
def api_moteurs():
    """Les moteurs reellement disponibles, leur etat et leurs modeles.

    L'interface se construit a partir d'ici plutot que d'une liste ecrite en dur
    dans le HTML : proposer un moteur que le backend ne connait pas donne un
    bouton qui ne fait rien.
    """
    sortie = []
    for code, m in MOTEURS.items():
        nom, _, sous_titre = m.libelle.partition(" - ")
        if code == "gratuit":
            # La version gratuite redige sur NIM (cf. ORDRE_GRATUIT) : c'est son
            # catalogue que l'on propose. Liste statique, aucun appel reseau au
            # demarrage -- catalogue_nim() est reserve a une demande explicite.
            fournisseur = generator.ORDRE_GRATUIT[0]
            modeles = list(generator.PREFERENCE_NIM)
            actuel = engine.modele_courant(fournisseur)
        else:
            fournisseur = None            # claude-cli passe par l'abonnement
            modeles = [m.modele] if m.modele else []
            actuel = m.modele or ""
        if actuel and actuel not in modeles:
            modeles.insert(0, actuel)
        sortie.append({
            "code": code, "nom": nom, "sous_titre": sous_titre,
            "souci": engine.moteur_pret(code), "fournisseur": fournisseur,
            "modeles": modeles, "modele": actuel,
        })
    transcripteurs = [{"code": c, "libelle": t.libelle,
                       "fournisseur": fournisseur_du_transcripteur(c)}
                      for c, t in generator.TRANSCRIPTEURS.items()]
    return jsonify({
        "defaut": DEFAUT, "moteurs": sortie,
        "transcripteurs": transcripteurs,
        "transcripteur": engine.transcripteur_courant(),
        "fournisseurs": {c: etat_fournisseur(c) for c in generator.FOURNISSEURS},
    })


@app.route("/api/langues")
def api_langues():
    """Retourne la liste des langues supportées et la langue détectée du système."""
    return jsonify({
        "langues": engine.LANGUES_APP,
        "systeme": engine.langue_systeme(),
    })


@app.route("/api/messages_masques")
def api_messages_masques():
    """Les messages 'ne plus afficher' coches lors d'un lancement precedent,
    relus par le front au demarrage."""
    return jsonify(engine.messages_masques())


@app.route("/api/messages_masques", methods=["POST"])
def api_messages_masques_set():
    """Masque ou reaffiche un message ('confidentialite', 'tutoriel', ...)."""
    data = request.json or {}
    cle = data.get("cle")
    if not cle:
        return jsonify({"erreur": "Cle manquante."}), 400
    engine.masquer_message(cle, bool(data.get("masque", True)))
    return jsonify({"ok": True})


@app.route("/api/modele", methods=["POST"])
def api_modele():
    """Garde le modele choisi, chez le fournisseur a qui il appartient."""
    data = request.json or {}
    code = data.get("fournisseur") or ""
    if code not in generator.CLES_MODELE:
        return jsonify({"ok": True})      # claude-cli n'offre pas de choix
    engine.enregistrer_modele(code, data.get("modele", ""))
    return jsonify({"ok": True})


@app.route("/api/cle", methods=["POST"])
def api_cle():
    """Enregistre la cle saisie derriere la pastille d'un modele.

    La valeur ne ressort jamais d'ici : la reponse ne rend que l'etat du
    fournisseur, de quoi repeindre la pastille.
    """
    data = request.json or {}
    code = data.get("fournisseur")
    if code not in generator.FOURNISSEURS:
        return jsonify({"erreur": "Fournisseur inconnu."}), 400
    try:
        engine.enregistrer_cle(code, data.get("valeur", ""))
    except ValueError as e:                # cle collee de travers : on le dit
        return jsonify({"erreur": str(e)}), 400
    return jsonify({"ok": True})


@app.route("/api/transcripteur", methods=["POST"])
def api_transcripteur():
    """Change le moteur qui lira les photos au prochain lancement."""
    code = (request.json or {}).get("code")
    if code not in generator.TRANSCRIPTEURS:
        return jsonify({"erreur": "Transcripteur inconnu."}), 400
    engine.enregistrer_transcripteur(code)
    return jsonify({"ok": True})


@app.route("/api/catalogue", methods=["POST"])
def api_catalogue():
    """Les modeles que la cle enregistree ouvre vraiment. Appel reseau : c'est
    pour ca qu'il faut le demander, il ne part pas au chargement de la page."""
    if (request.json or {}).get("fournisseur") != "nim":
        return jsonify({"erreur": "Seul NVIDIA NIM publie son catalogue."}), 400
    try:
        return jsonify({"modeles": engine.catalogue_nim()})
    except (RuntimeError, OSError) as e:
        return jsonify({"erreur": str(e)}), 400


# ------------------------------------------------------------ Piston (sandbox)

@app.route("/api/piston/status")
def api_piston_status():
    """Etat de l'API Piston : pret ou raison de l'indisponibilite."""
    souci = engine.piston_pret()
    return jsonify({
        "pret": souci is None,
        "souci": souci,
        "url": engine.piston_url(),
    })


@app.route("/api/piston/runtimes")
def api_piston_runtimes():
    """Langages supportes par l'instance Piston."""
    runtimes = engine.piston_runtimes()
    return jsonify({"runtimes": runtimes})


@app.route("/api/piston/url", methods=["POST"])
def api_piston_url():
    """Change l'URL de l'API Piston (persiste dans keys.env)."""
    data = request.json or {}
    url = data.get("url", "").strip()
    if not url:
        return jsonify({"erreur": "URL requise."}), 400
    # Validation basique : doit commencer par http:// ou https://
    if not (url.startswith("http://") or url.startswith("https://")):
        return jsonify({"erreur": "URL invalide (doit commencer par http:// ou https://)."}), 400
    engine.ecrire_reglage(engine.CLE_ENV, engine.CLE_PISTON_URL, url)
    return jsonify({"ok": True, "url": url})


@app.route("/api/ouvrir_logs", methods=["POST"])
def api_ouvrir_logs():
    """Ouvre logs/app.log dans l'editeur du systeme. Le fichier est cree s'il
    n'existe pas encore : mieux qu'un journal vide introuvable."""
    DOSSIER_LOGS.mkdir(exist_ok=True)
    FICHIER_LOG.touch(exist_ok=True)
    engine.ouvrir(FICHIER_LOG)
    return jsonify({"ok": True})


@app.route("/api/ouvrir_destination", methods=["POST"])
def api_ouvrir_destination():
    """Ouvre le dossier de sortie dans l'explorateur de fichiers."""
    dest = engine.destination_courante()
    dest.mkdir(parents=True, exist_ok=True)
    engine.ouvrir(dest)
    return jsonify({"ok": True})


@app.route("/api/obsidian_installe", methods=["GET"])
def api_obsidian_installe():
    """Renvoie si Obsidian est installé sur ce PC."""
    return jsonify({"installe": engine.obsidian_installe()})


@app.route("/api/ouvrir_vault", methods=["POST"])
def api_ouvrir_vault():
    """Ouvre le dossier de sortie comme coffre Obsidian."""
    dest = engine.destination_courante()
    dest.mkdir(parents=True, exist_ok=True)
    if engine.obsidian_installe():
        engine.ouvrir_dans_obsidian(dest)
        return jsonify({"ok": True})
    else:
        return jsonify({"ok": False, "erreur": "Obsidian non installé"}), 200


@app.route("/api/ouvrir_note", methods=["POST"])
def api_ouvrir_note():
    """Ouvre une note recente, dans Obsidian s'il est la, sinon dans l'editeur
    du systeme."""
    chemin = Path(request.json.get("chemin", ""))
    dest = engine.destination_courante()
    # Une note ne s'ouvre que si elle est bien dans le dossier de sortie : le
    # chemin vient du navigateur, il ne doit pas pouvoir designer n'importe quel
    # fichier de la machine.
    try:
        chemin.resolve().relative_to(dest.resolve())
    except ValueError:
        return jsonify({"erreur": "Note hors du dossier de sortie."}), 400
    if not chemin.is_file():
        return jsonify({"erreur": "Note introuvable."}), 404
    if engine.obsidian_installe():
        engine.ouvrir_dans_obsidian(dest, chemin)
    else:
        engine.ouvrir(chemin)
    return jsonify({"ok": True})

@app.route("/api/ouvrir_resultat", methods=["POST"])
def api_ouvrir_resultat():
    """Ouvre le resultat de la generation : le PDF s'il est sorti, sinon la
    note. C'est le bouton qui remplace "Generer" une fois le cours fini."""
    data = request.json
    matiere = data.get("matiere", "")
    type_ = data.get("type", "CM")
    titre = data.get("titre", "")
    pdf_path = data.get("pdf", None)
    
    if pdf_path and Path(pdf_path).is_file():
        engine.ouvrir(pdf_path)
        return jsonify({"ok": True})

    sortie_path = get_sortie(matiere, type_, titre)
    if engine.obsidian_installe():
        engine.ouvrir_dans_obsidian(engine.destination_courante(), sortie_path)
    elif sortie_path.is_file():
        engine.ouvrir(sortie_path)
    return jsonify({"ok": True})

@app.route("/api/ouvrir_dossier", methods=["POST"])
def api_ouvrir_dossier():
    """Ouvre le dossier des sources, pour y deposer des fichiers a la main."""
    data = request.json
    matiere = data.get("matiere", "")
    type_ = data.get("type", "CM")
    titre = data.get("titre", "")
    sources_path = get_sources(matiere, type_, titre)
    sources_path.mkdir(parents=True, exist_ok=True)
    engine.ouvrir(sources_path)
    return jsonify({"ok": True})


def _port_libre() -> int:
    """Un port que personne n'occupe. Le 5000 en dur ne convient pas : macOS y
    fait tourner AirPlay, et deux lancements se marcheraient dessus."""
    import socket
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _attendre(port: int, secondes: float = 15.0) -> bool:
    """Attend que Flask reponde vraiment, plutot que de dormir au hasard : sur
    une machine lente, la fenetre s'ouvrait avant le serveur et restait blanche."""
    import socket
    import time
    fin = time.monotonic() + secondes
    while time.monotonic() < fin:
        with socket.socket() as s:
            s.settimeout(0.25)
            if s.connect_ex(("127.0.0.1", port)) == 0:
                return True
        time.sleep(0.05)
    return False


def main() -> None:
    """Demarre le serveur local, attend qu'il reponde, puis ouvre la fenetre.

    Sans pywebview installe, l'application s'ouvre dans le navigateur par
    defaut plutot que de ne pas demarrer du tout.
    """
    configurer_logs()
    logger.info("Demarrage d'Incipit")
    port = _port_libre()

    def servir():
        app.run(host="127.0.0.1", port=port, threaded=True)

    threading.Thread(target=servir, daemon=True).start()
    _attendre(port)
    url = f"http://127.0.0.1:{port}"

    try:
        import webview
    except ImportError:
        # Sans pywebview, l'application reste utilisable dans le navigateur
        # plutot que de ne pas demarrer du tout.
        import webbrowser
        webbrowser.open(url)
        threading.Event().wait()
        return

    # 1180 : la barre laterale (260) plus la colonne centrale de la maquette
    # (max-w-4xl, 896) et ses marges tiennent sans rogner ni faire defiler,
    # sans la largeur excedentaire d'un ecran large qui allongeait la fenetre.
    # 1040 : un peu d'air sous les 963px de vue repliee, tout en restant sous
    # les 1032px utiles d'un ecran 1080p barre des taches comprise.
    webview.create_window('Incipit', url, width=1180, height=1040,
                          min_size=(900, 620), background_color="#1e1e1e")
    # private_mode=True par defaut : le profil webview (cookies, cache) serait
    # jete a chaque fermeture. storage_path le rend persistant, sous logs/ qui
    # est deja hors-suivi git et cree par configurer_logs().
    webview.start(icon=str(engine.ICI / "frontend" / "logo.ico"),
                 private_mode=False, storage_path=str(DOSSIER_LOGS / "webview"))


def _self_test() -> None:
    """Ou atterrit un cours. Le seul calcul de app.py qui merite un controle :
    un cours retrouve ailleurs qu'a sa creation est un cours perdu."""
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        engine.destination_courante = lambda: Path(tmp)
        matiere = Path(tmp) / "Génie Logiciel M1"

        # Cours neuf : son propre dossier, et tout le reste dedans.
        sortie = get_sortie("Génie Logiciel M1", "cm", "CM1 - Besoins")
        assert sortie == matiere / "CM - CM1 - Besoins" / "CM - CM1 - Besoins.md", sortie
        assert get_dossier_img("Génie Logiciel M1", "cm", "CM1 - Besoins") \
            == sortie.parent / "_img" / "cm1-besoins"
        assert engine.chemin_tp(sortie, "_exercices.py").parent == sortie.parent / ".tp"

        # Cours ecrit avant le rangement : lu la ou il est, pas de doublon.
        matiere.mkdir(parents=True)
        (matiere / "CM - CM1 - Besoins.md").write_text("x", encoding="utf-8")
        assert get_sortie("Génie Logiciel M1", "cm", "CM1 - Besoins") \
            == matiere / "CM - CM1 - Besoins.md"

    print("app : self-test OK")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        _self_test()
    else:
        main()

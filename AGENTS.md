# AGENTS.md — règles permanentes pour toute IA travaillant sur Incipit

> **À lire avant CHAQUE modification.** Ces règles ne sont pas des conseils :
> elles décrivent comment ce projet est rangé et comment il doit le rester.
> Une modif qui ne les respecte pas est à refaire.

---

## 1. La carte du projet

```
incipit/
│
├── app.py              ← POINT D'ENTRÉE. Flask + fenêtre pywebview. Ne fait
│                          que router : aucune logique métier ici.
├── engine.py           ← Chemins, réglages, lancement des sous-processus, PDF.
│                          Zéro dépendance à l'interface : testable sans fenêtre.
├── generator.py        ← Le cerveau. Transcription photos → plan → rédaction.
│                          Tourne en SOUS-PROCESSUS (`uv run`), jamais importé
│                          pour son exécution.
├── md2pdf.py           ← Markdown (syntaxe Obsidian) → PDF via Chrome headless.
│                          Sous-processus aussi.
├── exercices.py        ← Un cours .md déjà généré → TP interactif, fiche de
│                          révision, flashcards. Sous-processus aussi ; importe
│                          `generator` pour sa plomberie LLM et sa charte.
│
├── frontend/           ← Servi à la racine par Flask (static_url_path='')
│   ├── index.html          maquette + composants
│   ├── app.js              tout le comportement client
│   ├── logo.png            affiché dans l'en-tête
│   └── logo.ico            icône de la fenêtre native
│
├── config/
│   ├── keys.env             🔴 SECRETS — gitignoré, JAMAIS commité
│   └── keys.env.example     ✅ modèle sans secret — commité
│
├── launchers/          ← Double-clic par plateforme
│   ├── Incipit.vbs         Windows (aucune console)
│   ├── incipit.sh          Linux / macOS
│   ├── Incipit.app/        paquet macOS (appelle incipit.sh)
│   └── md-to-pdf.bat       glisser-déposer .md → PDF
│
├── docs/               ← Notes de conception
├── workspace/          ← 🔒 Données utilisateur (sources + cache). Gitignoré.
└── logs/               ← 🔒 Sortie d'exécution. Gitignoré.
```

### Le flux, en une ligne

```
frontend/app.js ──HTTP──> app.py ──> engine.py ──sous-processus──> generator.py
                                          └──sous-processus──> md2pdf.py
```

---

## 2. Où mettre quoi — table de décision

| Ce que tu ajoutes | Où ça va | Jamais |
|---|---|---|
| Une route HTTP / API | `app.py` | ailleurs |
| Un chemin, un réglage, un lancement | `engine.py` | en dur dans `app.py` |
| De la génération de contenu (prompts, LLM) | `generator.py` | dans `app.py` |
| Du rendu PDF / CSS d'impression | `md2pdf.py` | dans `generator.py` |
| Un exercice, une fiche, une flashcard | `exercices.py` | dans `generator.py` |
| Du comportement d'interface | `frontend/app.js` | inline dans le HTML |
| De la structure / du style visible | `frontend/index.html` | généré en JS |
| Une clé, un jeton, un mot de passe | `config/keys.env` | dans le code, jamais |
| Une note de conception | `docs/` | à la racine |
| Un script jetable / de test manuel | **nulle part** — supprime-le après | à la racine |

**La racine ne reçoit aucun fichier nouveau** sauf décision explicite de
l'utilisateur. Un fichier de plus à la racine = une régression de rangement.

---

## 3. Avant de modifier — dans cet ordre

1. **Lire** le fichier concerné en entier. Pas d'édition à l'aveugle.
2. **Chercher l'existant** : `grep` avant d'écrire. Une fonction qui fait déjà
   le travail existe presque toujours (`slug`, `nom_note`, `ouvrir`,
   `destination_courante`, `ecrire_reglage`…). La réutiliser, pas la refaire.
3. **Chercher tous les appelants** de ce que tu touches. Corriger à la racine,
   là où tous les chemins passent — pas dans un seul appelant.
4. **Le plus petit changement qui marche.** Pas d'abstraction spéculative, pas
   d'interface à une implémentation, pas de config pour une valeur qui ne
   change jamais.

---

## 4. Après avoir modifié — VÉRIFICATION OBLIGATOIRE

Chaque module porte son propre self-test. Il faut qu'ils passent :

```bash
uv run generator.py --self-test   # après toute modif de generator.py
uv run engine.py                  # après toute modif de engine.py
uv run md2pdf.py --self-test      # après toute modif de md2pdf.py
python -m py_compile app.py       # après toute modif de app.py
node --check frontend/app.js      # après toute modif de app.js
```

> **Règle du self-test** : toute logique non triviale (branche, boucle,
> analyseur, chemin de sécurité) laisse **un** contrôle exécutable derrière
> elle, ajouté dans le `_self_test()` du module. Pas de framework, pas de
> fixtures, pas de fichier de test séparé.

Et pour toute modif visible : **lancer l'app et regarder**.

```bash
uv run --script app.py
```

---

## 5. Secrets — non négociable

- `config/keys.env` contient de vraies clés d'API. **Il est gitignoré.**
- Ne jamais écrire une clé dans le code, un commentaire, un log, un message
  d'erreur, un test, ou une réponse d'API.
- L'API ne renvoie **jamais** une clé : uniquement son état et son préfixe
  (cf. `etat_fournisseur` dans `app.py`). Garder ce contrat.
- Toute nouvelle clé ⇒ l'ajouter à `config/keys.env.example` **vide**, et
  vérifier que `.gitignore` la couvre.
- Avant tout commit : `git status` et relire la liste. Aucune clé, aucun `.env`,
  aucun contenu de `workspace/`.

---

## 6. Style du code

| Règle | Pourquoi |
|---|---|
| **Français**, sans accents dans le code Python | cohérence avec l'existant, encodage sûr partout |
| Les commentaires disent **pourquoi**, pas quoi | le quoi se lit dans le code |
| Chaque fonction publique a une docstring d'une ligne | ce qu'elle rend, pas comment |
| Un commentaire par décision non évidente | sinon elle sera défaite au prochain passage |
| Aucun chemin absolu en dur | l'app doit suivre son dossier, pas la machine |
| Tout passage plateforme via `engine.ouvrir()` | un seul oubli casse Linux/macOS |
| Fichiers < 500 lignes de préférence | `generator.py` dépasse : ne pas l'aggraver |

---

## 7. Ne jamais faire

- ❌ Créer un fichier quand une modif suffit.
- ❌ Créer de la documentation non demandée.
- ❌ Laisser un script jetable, un `.log`, un `test_*.py` improvisé à la racine.
- ❌ Committer `workspace/`, `logs/`, `config/keys.env`, `__pycache__/`.
- ❌ Ajouter une dépendance pour ce que 5 lignes de stdlib font.
  (Les dépendances vivent dans l'en-tête **PEP 723** de chaque script, pas dans
  un `requirements.txt`.)
- ❌ Renommer ou déplacer un fichier sans corriger **tous** ses appelants :
  `app.py`, `engine.py`, les 4 fichiers de `launchers/`, et les chemins dans
  `frontend/`.
- ❌ Déclarer une tâche finie sans avoir lancé les self-tests de la §4.

---

## 8. Checklist de fin de tâche

```
[ ] Les self-tests concernés passent (§4)
[ ] L'app démarre et la modif se voit
[ ] Aucun fichier nouveau à la racine
[ ] Aucun fichier mort laissé derrière
[ ] git status propre : ni secret, ni donnée utilisateur
[ ] Les commentaires expliquent les décisions prises
```

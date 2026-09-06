<div align="center">
  <img src="frontend/logo.png" width="96" alt="Incipit">
  <h1>Incipit</h1>
  <p><em>Vos photos de cours et vos PDF de la fac → un cours rédigé, en Markdown et en PDF.</em></p>
</div>

---

## Ce que ça fait

Vous déposez vos photos de tableau, vos slides PDF, vos notes. Incipit
transcrit, structure, rédige, puis met en page.

```
   📷 photos            ┌──────────────┐        📝 Cours.md   (Obsidian)
   📄 PDF de slides ──▶ │  Incipit  │ ──▶
   📋 notes             └──────────────┘        📕 Cours.pdf  (mise en page)
```

| | |
|---|---|
| 🖼️ **Lit vos photos** | transcription image par image, avec cache — rien n'est relu deux fois |
| ✍️ **Rédige vraiment** | plan puis rédaction section par section, pas un résumé |
| 🎨 **Met en page** | maths (KaTeX), schémas (Mermaid), encadrés colorés, surlignage |
| 🔗 **Parle Obsidian** | coffre provisionné tout seul, liens internes cliquables |
| 💸 **Gratuit possible** | NVIDIA NIM suffit pour tout le pipeline |

---

## Installation

### Version exécutable (recommandée, aucun prérequis)

Téléchargez l'exécutable de votre plateforme (voir **Distribution** ci-dessous) et double-cliquez dessus. Rien à installer : Python, `uv` et les dépendances sont déjà dedans. Aucun terminal ne s'ouvre.

Copiez ensuite `config/keys.env.example` en `config/keys.env` à côté de l'exécutable (ou collez votre clé directement dans l'onglet **Réglages** de l'application, ce qui fait la même chose). Pour le PDF, Chrome ou Edge — déjà là sur presque toutes les machines.

### Depuis le code source (frontend uniquement)

Un seul prérequis : `uv`. Il installe le reste tout seul au premier lancement (dépendances déclarées en PEP 723 dans chaque script).

```bash
# 1. Récupérer le projet
git clone https://github.com/Sitarse/Incipit.git incipit && cd incipit

# 2. Créer sa configuration
cp config/keys.env.example config/keys.env
```

Puis collez votre clé NVIDIA (gratuite, sur <https://build.nvidia.com> → « Get API Key ») dans `config/keys.env`, ou directement dans l'onglet **Réglages** de l'application.

---

## Distribution

Trois exécutables autonomes (Windows, Linux, macOS) — icône de l'app,
aucun terminal visible, rien à installer à côté. `uv` et les dépendances
sont embarqués.

**Téléchargement** : voir les [Releases GitHub](https://github.com/Sitarse/Incipit/releases)
(publiées automatiquement à chaque tag `v*` via GitHub Actions).

---

## Lancer depuis le code source

| Plateforme | Double-clic |
|---|---|
| Windows | `launchers/Incipit.vbs` |
| Linux | `launchers/incipit.sh` |
| n'importe où | `uv run --script app.py` |

L'application s'ouvre dans une fenêtre native (pywebview) ou dans le navigateur par défaut si pywebview n'est pas installé.

---

## Moteurs

| Moteur | Coût | Ce qu'il faut |
|---|---|---|
| **gratuit** (NVIDIA NIM) | gratuit | une clé `nvapi-…` |
| **claude-cli** | abonnement Claude Code | le CLI `claude` installé |

Le choix se fait dans l'interface, il est retenu dans `config/keys.env`.

---

## Structure

```
app.py         point d'entrée : Flask + fenêtre native
engine.py      chemins, réglages, orchestration
generator.py   transcription → plan → rédaction
md2pdf.py      Markdown → PDF (Chrome headless)
frontend/      interface (HTML + JS, servie en local)
config/        réglages et clés — keys.env n'est jamais commité
launchers/     double-clic par plateforme (depuis le code source)
packaging/     scripts de build des 3 exécutables (cf. Distribution)
workspace/     sources déposées + cache (local, jamais commité)
```

Le serveur n'écoute que sur `127.0.0.1` : rien n'est exposé sur le réseau.
Vos cours restent sur votre machine ; seuls les contenus à traiter partent
vers le moteur d'IA que vous avez choisi.

---

## Contribuer

Les règles du dépôt — humaines comme IA — sont dans **[AGENTS.md](AGENTS.md)**.
Chaque module porte son self-test :

```bash
uv run generator.py --self-test
uv run engine.py
uv run md2pdf.py --self-test
```
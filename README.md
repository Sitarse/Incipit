# Incipit

Tes photos de cours, PDF de diapos et notes deviennent un cours rédigé (Markdown pour Obsidian, et PDF), avec fiche de
révision, TP noté, flash cards à réviser, série du jour et un lecteur de cours (quiz, IDE, tuteur, sources).

C'est le module Cours de Hitodama, sorti en appli à part : mêmes fonctions, même moteur, aucune dépendance à Hitodama.
Windows, macOS et Linux.

## Installer

Les installateurs se construisent sur GitHub à chaque envoi (onglet Actions) et se publient avec un tag `v…` (onglet
Releases) ; chacun embarque uv : il n'y a rien d'autre à installer.

| Système | Fichier | Premier lancement |
|---|---|---|
| Windows | `Incipit Setup.exe` | Windows peut dire « éditeur inconnu » : Informations complémentaires → Exécuter quand même |
| macOS | `.dmg` (Intel et Apple Silicon) | appli non signée : clic droit → Ouvrir. Si macOS la dit « endommagée » : `xattr -cr /Applications/Incipit.app` |
| Linux | `.AppImage` ou `.deb` | `chmod +x Incipit*.AppImage` puis double-clic ; ou `sudo apt install ./incipit*.deb` |

Pour le PDF, il faut Chrome, Chromium ou Edge (déjà là sur presque tous les PC). Pour écrire : Claude Code connecté sur ce
PC, ou une clé d'un des fournisseurs ci-dessous, à coller dans les réglages (Avancé).

## Depuis les sources

```
npm install
node node_modules/electron/install.js   # si npm n'a pas téléchargé le binaire d'Electron
npm start
npm run launcher                        # Windows : refait Incipit.exe (logo compris) ; un double-clic ouvre l'appli
npm run dist                            # l'installateur de ce système (dist/), avec uv dedans
```

Sans l'installateur il faut [uv](https://docs.astral.sh/uv/) (Windows : `winget install astral-sh.uv` ; macOS :
`brew install uv` ; Linux : `curl -LsSf https://astral.sh/uv/install.sh | sh`) : le moteur Python
(`src/modules/cours/engine`) s'y lance, ses dépendances s'installent toutes seules.

## Qui écrit les cours

Réglages des cours → « Qui écrit » ; chaque moteur a son modèle, choisi juste dessous. Les clés se collent dans « Avancé »
(chiffrées avec le système).

| Moteur | Prix | Il faut |
|---|---|---|
| Claude (Opus, Sonnet ou Haiku) | abonnement | Claude Code connecté sur ce PC |
| Claude (API) | payant à l'usage | une clé Anthropic (`sk-ant-…`), sans abonnement |
| OpenAI | payant à l'usage | une clé OpenAI |
| Gemini | gratuit (quota Google) | une clé AI Studio, une ou plusieurs ; Gemini 4 Hydrogen, 3.8 Flash… |
| Gemini (payant) | payant à l'usage | une clé Google avec facturation : Gemini 4 Carbon, 4 Argon, 3.1 Pro… |
| OpenRouter | gratuit ou payant selon le modèle (`…:free`) | une clé OpenRouter (`sk-or-…`) |
| NVIDIA NIM | gratuit | une clé NVIDIA (`nvapi-…`) |

## Où sont les choses

| | Windows | macOS | Linux |
|---|---|---|---|
| Réglages et clés | `%APPDATA%\Incipit\config.json` | `~/Library/Application Support/Incipit/config.json` | `~/.config/Incipit/config.json` |
| Brouillons, journal, révisions | `…\Incipit\cours\` | `…/Incipit/cours/` | `…/Incipit/cours/` |
| Tes cours | `Documents\Cours` | `Documents/Cours` | `Documents/Cours` |

Les cours vont dans `Documents/Cours`, ou le dossier choisi dans les réglages. Les clés sont chiffrées avec le système
(Windows : DPAPI, macOS : trousseau, Linux : gnome-keyring ou KWallet ; sans trousseau, Electron les garde lisibles dans
`config.json`). `INCIPIT_DATA=<dossier>` change le dossier de données (pour essayer sans toucher aux tiennes).

## Ce qui diffère selon le système

- **IDE des cours** (le lecteur) : les compilateurs sont cherchés dans le PATH, plus Homebrew, cargo, nvm… Pour installer un
  langage manquant, l'IDE affiche la commande à taper (Windows : winget, par un bouton). Le pas à pas de C/C++ demande gdb
  (Linux : `sudo apt install gdb`) ; sous macOS il n'est pas disponible (clang n'a pas gdb), le reste marche.
- **Obsidian** : ses coffres sont lus dans son dossier de réglages, selon le système.
- **Code** : tout ce qui change est dans `src/app/platform.js` (testé pour les trois systèmes : `tests/platform.test.js`).

## Le code

- `src/app/platform.js` : ce qui change entre Windows, macOS et Linux (uv, Claude Code, PATH, arrêt des processus).
- `src/main.js` : la fenêtre, et ce que le module attend de son hôte.
- `src/modules/cours/` : le module tel qu'il est dans Hitodama (partie Node, panneau, lecteur, moteur Python).
- `src/renderer/` : la page, et `shim.js`, les petits outils que Hitodama fournissait au module.
- `src/ai/companion.js` : le tuteur du lecteur (Claude Code, sinon Gemini). `src/ai/ai.js` : Gemini, plusieurs clés.
- `launcher/` : le lanceur Windows `Incipit.exe` ; le logo est dans `assets/` (celui de l'ancienne appli).
- `scripts/` : `fetch-uv.js` (uv dans l'installateur), `smoke.js` (essai de démarrage), `adhoc-sign.js` (macOS).

## Tests

`npm test`, et `npm run smoke` : l'appli démarre hors écran, l'onglet Cours se dessine, aucune erreur de console (Linux sans
écran : `xvfb-run -a npm run smoke`). GitHub Actions fait les deux, plus l'auto-test du moteur Python, sur les trois systèmes.
À la main : `INCIPIT_SMOKE=<dossier> INCIPIT_DATA=<dossier> electron .` (état et capture dans `<dossier>` ; ajouter
`INCIPIT_SMOKE_REGLAGES=1`, `INCIPIT_SMOKE_LECTEUR=1`, `INCIPIT_SMOKE_TUTEUR=1` pour les réglages, le lecteur, et une
question au tuteur).

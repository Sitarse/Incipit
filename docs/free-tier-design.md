# Version gratuite : rédaction parallèle par sous-partie

Date : 2026-09-04
Statut : en attente de relecture

## Problème

La version gratuite rend un cours de ~3 700 mots là où la version payante en
rend ~7 300, pour des sources qui pèsent 3 556 mots. Autrement dit le gratuit
**reformule** les sources (1,06×) quand Opus les **double** (2,05×).

La cause n'est pas la capacité du modèle : le meilleur cours du vault, 3 759
mots et 23 sections bien hiérarchisées, porte `moteur: gratuit -> nim
[nemotron-3-ultra-550b]`. C'est bien le gratuit qui l'a écrit.

La cause est que le mode conçu pour faire long — la rédaction par paquets — ne
s'exécute jamais. `plan_du_cours` échoue, et le pipeline retombe sur
`redaction en un seul appel`, qui produit un cours court. Mesuré : nemotron
consomme les 800 jetons de `MAX_JETONS_PLAN` en raisonnement déversé dans
`content`, et n'atteint jamais la réponse (`finish_reason: length`,
`completion_tokens: 800/800`). C'est le bug corrigé le matin même sur Gemini,
présent à l'identique sur NIM.

Second problème, indépendant : le pipeline est strictement séquentiel. Il
consomme 1 à 2 requêtes par minute contre un plafond de 20. Le temps perdu
n'est pas du quota, c'est de la file indienne.

## Objectif

Un cours gratuit de 6 000 à 7 500 mots, produit en 5 à 10 minutes, dont les
ajouts du modèle sont visuellement distingués de ce que le prof a dit.

## Contraintes

- Budget : 5-10 minutes par cours, l'utilisateur regarde.
- Quota Gemini : 20 requêtes/minute, palier gratuit.
- NIM : pas de quota par minute observé, mais des 503 « Service temporarily
  overloaded » même à concurrence 1.
- Aucune dépendance nouvelle.
- La GUI lit la sortie ligne par ligne : `[NN] Texte` pour la barre, `. texte`
  pour le journal (`moteur.analyser`). Ce contrat ne doit pas casser.

## Conception

### 1. Plan à deux niveaux

`plan_du_cours` demande et rend désormais une hiérarchie : parties `## 1. Titre`
et sous-parties `### 1.1 Titre`. Forme rendue : `list[tuple[str, list[str]]]`
— titre de partie, titres de ses sous-parties.

Cible : 4 à 6 parties, 2 à 4 sous-parties chacune, plafonnées à 18 tâches au
total pour borner le coût.

Une partie sans sous-partie reste une tâche à elle seule : le plan dégrade,
il n'échoue pas.

### 2. Une tâche par sous-partie, exécutées en parallèle

Chaque sous-partie est un appel indépendant, doté de son propre budget de
sortie (`MAX_JETONS_PARTIE`). C'est **le mécanisme de la longueur** : le
volume total suit le nombre de sections, pas une consigne « écris plus » que
le modèle ignore. 15 sections × ~450 mots ≈ 6 700 mots.

Exécution par `concurrent.futures.ThreadPoolExecutor` — `urllib` est bloquant,
c'est son cas d'usage exact, et c'est la stdlib. Pool borné à 5 ouvriers
simultanés : 16 requêtes étalées sur ~5 minutes ≈ 3-4 req/min, très en deçà
des 20 autorisées, et assez doux pour les 503 de NIM.

Le nombre d'ouvriers est une constante réglable (`OUVRIERS = 5`) : le débit
réel de NIM ne se devine pas depuis le code.

### 3. Le vocabulaire décidé en amont

Aujourd'hui les parties s'écrivent en file et `termes_definis()` transmet à la
suivante les termes déjà définis, pour qu'elle fasse un lien au lieu de
redéfinir. En parallèle, aucun ouvrier ne voit les autres : sans rien faire,
les 15 redéfiniraient les mêmes termes.

L'appel de plan rend donc **aussi** la liste du vocabulaire du cours, qui est
distribuée à tous les ouvriers avant qu'ils écrivent. Chacun sait ce qu'il
doit lier plutôt que définir. Coût : zéro appel supplémentaire.

Dégradation prévue : si le bloc vocabulaire manque dans la réponse, on
continue sans lui. On perd la déduplication, pas le cours.

### 4. Marquage des ajouts du modèle

Ce que le modèle apporte au-delà des sources va dans un callout dédié, déjà
stylé par `md2pdf.py`. La consigne de sous-partie l'exige explicitement.

### 5. Garde-fous

- **Réassemblage dans l'ordre du plan**, jamais dans l'ordre d'arrivée : les
  résultats sont rangés à leur indice de tâche.
- **Échec isolé** : une sous-partie ratée laisse l'encadré « Partie manquante »
  déjà en place pour les parties, descendu d'un niveau. Le cours ne meurt pas.
- **Sortie sérialisée** : `dire()` prend un verrou. Deux `print` concurrents
  peuvent entrelacer une ligne, et `moteur.analyser` ne lirait plus rien.
- **Progression monotone** : la barre avance sur un compteur de tâches
  terminées, pas sur le pourcentage propre à chaque tâche — sinon elle recule.
- **Quota partagé** : `REPRISE` est déjà consulté par tous les appels ; un
  ouvrier qui découvre le quota épuisé en informe de fait les autres.

### 6. Prérequis bloquant : le plan doit répondre

Sans plan exploitable, il n'y a rien à paralléliser et tout retombe en un seul
appel. Le raisonnement de nemotron doit donc être coupé, comme il l'a été pour
Gemini. Quatre interrupteurs mesurés sur le vrai plan du CM1 :

| Variante | Fin | Jetons de sortie | Titres reconnus |
|---|---|---|---|
| `reasoning_effort: "none"` | `stop` | 192 | 9 |
| `chat_template_kwargs: {thinking: false}` | `stop` | 210 | 10 |
| `/no_think` en prompt système | `length` | 800 | 0 |
| budget relevé à 3000 jetons | `stop` | 229 | 8 |

`reasoning_effort: "none"` est retenu : c'est déjà l'interrupteur de Gemini,
donc une règle unique au lieu de deux.

Mais il n'est pas universel. Mesuré : `llama-3.2-11b-vision` sur NIM répond
400 avec `Input should be 'low', 'medium' or 'high'`, quand nemotron accepte
`none` — la validation est par modèle, sur le même fournisseur. Une liste de
modèles à tenir à jour serait un piège de plus, du même genre que celui qui a
condamné Gemini ce matin avec un nom de modèle périmé.

Règle retenue, qui s'auto-répare : le paramètre est envoyé à tout le monde ;
si un serveur le refuse **nommément** (400 citant `reasoning_effort`), l'appel
est rejoué une fois sans lui, sans compter d'essai. Aucun modèle à connaître à
l'avance, et un modèle futur qui l'accepte en profite sans changement de code.

## Tests

Self-tests dans `generer.py --self-test`, sans réseau :

- le plan à deux niveaux se lit correctement, y compris une partie sans
  sous-partie et un plan en liste numérotée nue ;
- le réassemblage rend les sections dans l'ordre du plan quand les tâches
  se terminent en désordre ;
- une tâche en échec produit l'encadré « Partie manquante » sans faire tomber
  les autres ;
- `dire()` reste atomique sous concurrence.

## Hors périmètre

- La passe d'enrichissement en seconde lecture : elle doublerait les appels.
  On mesure d'abord ce que la parallélisation seule donne.
- La version payante, inchangée : elle tient la longueur en un seul appel.

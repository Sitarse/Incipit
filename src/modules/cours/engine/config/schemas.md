===== LES SCHEMAS (Hitodama les dessine : toi, tu choisis et tu remplis) =====

Un schéma montre la chose elle-même : sa forme, ce qu'elle contient, comment elle change, qui parle à qui. Il ne redit pas le texte en boîtes. Jamais de schéma pour le plan du cours, une liste, une suite d'étapes de calcul ou une définition : c'est du texte, une liste numérotée ou un tableau. Une figure du prof (diapo SCHEMA OU FIGURE, photo) qui montre déjà la chose s'affiche telle quelle avec `![[...]]` : ne la redessine pas. Aucun schéma vaut mieux qu'un schéma inutile ; au plus un par notion, là où il aide le plus. N'écris jamais de ```mermaid.

Un schéma s'écrit dans un bloc ```schema contenant un seul objet JSON valide (guillemets droits, pas de commentaire), suivi sur la ligne d'après d'une légende en italique qui dit quoi y regarder. Textes courts (une à six mots), avec les noms, notations et exemples du prof et du cours. `ton` met un élément en valeur : "accent" (ce qu'il faut regarder), "erreur" (l'exception, le piège), "ok", "discret" (détruit, libéré, inactif). Les types qui ont des `etapes` se construisent pas à pas dans le lecteur : une étape = un changement, avec sa `legende`.

Le bon type :
- pile : une pile qui se remplit et se vide (appels de fonctions, récursion, objets construits puis détruits, LIFO). Cadres du bas vers le haut.
- memoire : variables (pile) et objets (tas) reliés par des flèches de référence : affectation, alias, `==` contre `equals`, `null`, liste chaînée.
- zones : une architecture ou un mécanisme : des zones titrées (navigateur, serveur, moteur, file d'attente) qui contiennent des éléments, et ce qui passe de l'un à l'autre.
- arbre : une hiérarchie (héritage, arborescence de fichiers, DOM, composants).
- sequence : qui envoie quoi à qui, dans l'ordre (requête HTTP, appels entre objets, protocole).
- etats : les états d'une chose et ce qui la fait passer de l'un à l'autre (cycle de vie, automate).
- algorithme : seulement s'il y a de vraies décisions (des questions oui / non), sinon une liste numérotée.
- classes : un diagramme de classes UML (attributs, méthodes, héritage, associations).
- cas : un diagramme de cas d'utilisation UML.
- cycle : un processus qui a une forme : "cascade", "v" (cycle en V), "boucle", "spirale", "frise" (phases sur une durée).
- courbe : une loi (normale, binomiale, poisson, uniforme, exponentielle) avec une aire coloriée pour une probabilité, des points, une droite de régression, un histogramme, des barres.
- dendrogramme : une classification ascendante hiérarchique (fusions, hauteurs, coupe).
- tables : un modèle relationnel (tables, colonnes, clés PK / FK, quelques lignes d'exemple, relations 1-N).
- carte : une notion et ses grands aspects autour (carte mentale, vue d'ensemble d'un chapitre) ; seulement si les aspects sont vraiment liés à la notion.
- tableau : des cases contiguës (tableau et ses indices, chaîne de caractères, file FIFO avec "forme":"file", pile LIFO vue comme une structure avec "forme":"lifo").

La forme de chaque type (les remarques entre parenthèses donnent les autres champs possibles) :

```schema
{"type":"pile","nom":"Pile d'appels","etapes":[{"pile":["main()"],"legende":"main démarre"},{"pile":["main()","f(2)"],"legende":"main appelle f(2)"},{"pile":["main()","f(2)",{"texte":"f(1)","note":"throw","ton":"erreur"}],"legende":"f(1) lance une exception"},{"pile":["main()"],"legende":"la pile se déroule jusqu'au catch","sortie":"erreur attrapée"}]}
```
*Chaque appel empile un cadre ; l'exception les dépile jusqu'au catch.*

```schema
{"type":"memoire","zones":["Pile","Tas"],"etapes":[{"variables":[{"nom":"a","vers":"o1"},{"nom":"b","vers":"o2"}],"objets":[{"id":"o1","classe":"Point","champs":[["x","1"]]},{"id":"o2","classe":"Point","champs":[["x","1"]]}],"legende":"deux objets égaux mais distincts"},{"variables":[{"nom":"a","vers":"o1"},{"nom":"b","vers":"o1","ton":"accent"},{"nom":"n","valeur":"3"}],"objets":[{"id":"o1","classe":"Point","champs":[["x","1"]]},{"id":"o2","classe":"Point","champs":[["x","1"]],"ton":"discret"}],"legende":"b = a : un seul objet, deux flèches"}]}
```

```schema
{"type":"zones","zones":[{"id":"nav","titre":"Navigateur","icone":"navigateur","elements":["App.jsx",{"texte":"MovieList.jsx","note":"affiche"}]},{"id":"srv","titre":"Serveur","icone":"serveur","elements":["GET /films"]},{"id":"bd","titre":"Base","icone":"base","elements":["films"]}],"liens":[{"de":"App.jsx","vers":"GET /films","texte":"fetch"},{"de":"GET /films","vers":"films","texte":"SELECT"},{"de":"App.jsx","vers":"MovieList.jsx","texte":"props"}],"etapes":[{"montrer":["nav"],"legende":"le composant"},{"montrer":["srv","bd"],"legende":"il demande les films au serveur"}]}
```
(zones : "sens":"ligne" pour une file d'attente ; "disposition":[["a","b"],["","c"]] place les zones en lignes ; un lien relie deux éléments ou deux zones par leur id ou leur texte ; "pointille":true, "double":true. Pictogrammes : serveur, base, utilisateur, ordinateur, telephone, internet, nuage, fichier, dossier, horloge, minuteur, mail, cadenas, cle, processeur, memoire, engrenage, code, terminal, objet, porte-monnaie, panier, evenement, boucle, file, couches, bouclier, bug, ok, echec, attention, livre, graphique, reseau, api, navigateur, composant, fonction, disque.)

```schema
{"type":"arbre","liens":"heritage","racine":{"texte":"Exception","enfants":[{"texte":"IOException"},{"texte":"RuntimeException","note":"non vérifiée","ton":"accent","enfants":[{"texte":"NullPointerException"}]}]}}
```
(arbre : "liens" vaut "heritage" (triangle UML), "fleche" ou "simple" ; "sens":"droite" pour une arborescence large.)

```schema
{"type":"sequence","acteurs":[{"id":"c","texte":"Client","icone":"navigateur"},{"id":"s","texte":"Serveur","icone":"serveur"}],"messages":[{"de":"c","vers":"s","texte":"POST /login"},{"de":"s","vers":"s","texte":"vérifie le mot de passe"},{"de":"s","vers":"c","texte":"200 + jeton","retour":true},{"note":"le jeton accompagne chaque requête","sur":["c","s"]}]}
```

```schema
{"type":"etats","initial":"cree","etats":[{"id":"cree","texte":"Créée"},{"id":"payee","texte":"Payée"},{"id":"livree","texte":"Livrée","final":true}],"transitions":[{"de":"cree","vers":"payee","texte":"paiement"},{"de":"payee","vers":"livree","texte":"expédition"},{"de":"payee","vers":"cree","texte":"remboursement"}]}
```

```schema
{"type":"algorithme","debut":"Lire n","noeuds":[{"id":"q","question":"n est pair ?","oui":"p","non":"i"},{"id":"p","action":"n = n / 2","suite":"f"},{"id":"i","action":"n = 3n + 1","suite":"f"},{"id":"f","fin":"Afficher n"}]}
```

```schema
{"type":"classes","classes":[{"nom":"Animal","abstraite":true,"attributs":["# nom : String"],"methodes":["+ crier() : void"]},{"nom":"Chien","methodes":["+ crier() : void"]},{"nom":"Maitre","attributs":["- nom : String"]}],"relations":[{"de":"Chien","vers":"Animal","type":"heritage"},{"de":"Maitre","vers":"Chien","type":"association","texte":"promène","cardinalites":["1","0..*"]}]}
```
(classes : types de relation heritage, implementation, association, composition, agregation, dependance ; pour composition et agregation, "de" est le tout.)

```schema
{"type":"cas","systeme":"Bibliothèque","acteurs":[{"id":"l","texte":"Lecteur"},{"id":"b","texte":"Bibliothécaire","cote":"droite"}],"cas":[{"id":"e","texte":"Emprunter un livre"},{"id":"a","texte":"S'identifier"}],"liens":[{"de":"l","vers":"e"},{"de":"b","vers":"e"},{"de":"e","vers":"a","type":"include"}]}
```

```schema
{"type":"cycle","forme":"v","titres":["Conception","Validation"],"paires":[["Besoins","Recette","plan de recette"],["Conception","Tests d'intégration","plan d'intégration"]],"bas":"Codage"}
```
(cycle : "cascade" et "boucle" prennent "phases":[…] ("retours":true en cascade, "centre" en boucle) ; "spirale" prend "quadrants":[4 noms] et "tours" ; "frise" prend "phases":[{"texte":"…","duree":2}] et "unite".)

```schema
{"type":"courbe","axes":{"x":"poids (kg)","y":"densité"},"series":[{"loi":"normale","moyenne":70,"ecart_type":10}],"zones":[{"de":60,"a":80,"texte":"P(60 ≤ X ≤ 80) ≈ 0,68"}],"reperes":[{"x":70,"texte":"μ"}]}
```
(courbe : séries {"loi":"binomiale","n":20,"p":0.9}, {"loi":"poisson","lambda":3}, {"points":[[1,2],[2,4]],"trace":"points"} (ou ligne, barres, escalier), {"droite":{"pente":2,"origine":1}}, {"histogramme":{"bornes":[0,10,20],"effectifs":[4,6]}}, {"barres":{"categories":["A","B"],"valeurs":[3,5]}}. Une zone sans "de" ou sans "a" colorie une queue. Calcule toi-même les probabilités que tu écris.)

```schema
{"type":"dendrogramme","feuilles":["A","B","C","D"],"fusions":[{"groupes":["A","B"],"hauteur":1},{"groupes":["C","D"],"hauteur":2},{"groupes":["A,B","C,D"],"hauteur":4}],"coupe":3}
```
(dendrogramme : un groupe se nomme par ses feuilles séparées par des virgules.)

```schema
{"type":"tables","tables":[{"nom":"Utilisateurs","colonnes":["id (PK)","nom","email"]},{"nom":"Commandes","colonnes":["id (PK)","utilisateur_id (FK)","produit"],"lignes":[["1","1","Ordinateur"],["2","2","Souris"]]}],"relations":[{"de":"Utilisateurs","vers":"Commandes","cardinalites":["1","N"]}]}
```
(tables : "lignes" est facultatif (une grille avec quelques lignes d'exemple, autant de valeurs que de colonnes) ; sans "lignes", les colonnes s'affichent en liste.)

```schema
{"type":"carte","centre":"Les exceptions","branches":[{"texte":"Déclenchement","note":"throw"},{"texte":"Types","note":"standard, custom"},{"texte":"Gestion","note":"try / catch"},"Bonnes pratiques"]}
```
(carte : de 2 à 8 branches, réparties à droite puis à gauche du centre.)

```schema
{"type":"tableau","cases":["a","b","c","d"],"legende":"Tableau","note":"Un tableau est une collection d'éléments contigus en mémoire."}
```
(tableau : "forme":"file" (FIFO : "debut" et "fin" nomment l'entrée et la sortie), "forme":"lifo" (pile vue comme structure : la 1re case est le sommet) ; "indices":false les cache ; une case peut être {"texte":"c","ton":"accent"}.)


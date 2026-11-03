# Audit V2 → V3 — 2 novembre 2026

## Périmètre et méthode

Comparaison de la bibliothèque V2 servie localement (`workspace.html`, `styles/workspace.css`, `workspace-ui.js`) avec l'aperçu macOS V3 (`native-v3/app/main.swift`). Une capture de chaque interface a été examinée à 1440 × 900 pour la V2 et dans une fenêtre native de 1320 × 820 pour la V3. Le serveur V2 s'est arrêté avant qu'une capture chargée de ses données puisse être obtenue : les fonctions V2 ci-dessous sont donc relevées dans le code, tandis que la disposition est constatée sur la capture. La V3 affichait 7 930 entrées sans erreur de source lors de l'examen.

## Écarts graphiques

| Zone | V2 | V3 au début de l'audit | Action |
| --- | --- | --- | --- |
| Structure | Barre compacte, explorateur étroit, tableau large, inspecteur étroit | Explorateur empilé au-dessus de la liste, lecteur occupant environ deux tiers de la fenêtre | Corrigé : trois colonnes côte à côte ; ancienne largeur V3 convertie à l'ouverture |
| Liste | Tableau dense avec colonnes, tri par en-tête, badges, état et actions de ligne | Lignes à titre et sous-titre, sans en-têtes ni tri direct | Colonnes et tri restaurés ; regroupement et actions de ligne à vérifier |
| Fiche | Métadonnées, versions, classement, export et provenance visibles dans l'inspecteur | Texte brut et choix de version ; classement et actions dans la barre de menus | Fiche intégrée avec champs et actions ; parité des menus déroulants à vérifier |
| État sans sélection | Message « Sélectionne un élément » | Lecteur et sélecteur de version vides | Corrigé : message et sélecteur désactivé |
| Navigation | Sections Bibliothèque, Fusion/Lab, Importer et modules historiques | Bibliothèque native ; autres parcours dans les menus ou fenêtres distinctes | Import intégré à la fenêtre ; Fusion/Lab reste une fenêtre séparée |
| Densité et hiérarchie | Contrôles très denses, couleurs par plateforme/projet/statut | Bonne lisibilité native, mais peu d'indices de statut dans la liste | Filtres rapides et couleurs des sources et projets conservés ; vérifier sur des archives réelles |

## Écarts fonctionnels

| Parcours | V2 | V3 constatée dans le code | Écart à traiter |
| --- | --- | --- | --- |
| Explorer et chercher | Type, plateforme, projet, tags, dossiers, dates, statut, recherche plein texte et NyxBoolean | Filtres rapides, arbre des sources, recherche plein texte et NyxBoolean présents | Vérifier filtres actifs et préférences reprises sur une installation V2 réelle |
| Liste et sélection | Colonnes triables, sélection multiple, sélection visible, regroupement et actions sur ligne | Sélection multiple, colonnes et tri direct présents | Regroupement et actions de ligne à vérifier sur archives réelles |
| Classer | Fiche éditable, tags favoris, règles, vues, actions groupées | Onglet Classer intégré à la fiche sélectionnée | Vérifier la reprise des données WebView V2 réelles |
| Lire et exploiter | Lecture structurée, versions, surlignages, provenance, pièces jointes, recherche dans les réponses, export | Lecture affichée dès la sélection ; onglets Lire, Classer et Index | Contrôler corpus, index et versions sur les mêmes archives V2/V3 |
| Fusion / Lab | Deux listes, sélection de travail, comparaison et fusion éditable | Fenêtre native dédiée | Vérifier parité visuelle et sélection sur archives réelles |
| Importer | Favori navigateur, fichier JSON, liste filtrable, sélection, suivi et arrêt | Centre d’import visible, liste filtrable des captures reçues, import fichier, synchro locale et capture de page visible | Suivi en temps réel et arrêt d’un lot distant restent à reprendre |
| Coffres historiques | Interfaces Node, Python et Codex Exporter intégrées | Codex Exporter intégré ; commandes Node/Python en menus et sorties texte | Reprendre les interfaces de sélection et d'export avant remplacement de la V2 |

## Import automatique : état vérifié le 2 novembre

- L’import local Codex/Claude/Gemini se lance à l’ouverture et toutes les cinq minutes.
- L’extension V3 récupère les historiques ChatGPT et Perplexity sans sélection manuelle lorsqu’un onglet connecté de chaque service est ouvert dans Chrome, même en arrière-plan. Elle reprend par lots de 25 avec un checkpoint local, puis revérifie chaque onglet ouvert toutes les cinq minutes. Les conversations non modifiées ne sont pas téléchargées de nouveau.
- Le pont Native Messaging est installé pour Chrome et Comet. L’extension V3 est chargée dans le profil Chrome « Arnaud » (Profile 7), active, et communique avec le pont ; son chargement dans Comet reste à confirmer. Le test simulé couvre les deux fournisseurs ; le test de protocole vérifie l’import et la déduplication d’un lot mixte.
- Validation réelle : au moins six lots de 25 conversations Perplexity ont été ajoutés au coffre Node pendant des visites du site, dont plusieurs avec l’onglet en arrière-plan (206 → 356 lors du dernier contrôle). Le profil est connecté à Perplexity. Le chargement complet de son historique reste à constater ; l’import continue dans l’onglet ouvert.
- Le profil Chrome « Arnaud » affichait ChatGPT déconnecté lors du premier test. Le profil Comet « A » est connecté : après installation de V3, un passage réel y a repéré 2 331 conversations ChatGPT et en a importé 206 avant une erreur partielle. Les conversations déjà reçues sont conservées ; l’exhaustivité reste à vérifier après reprise.
- La capture native par Accessibilité ne lit que la page visible ; elle ne remplace pas l’import de l’historique navigateur. Les API privées des deux sites peuvent changer et demander une adaptation de l’extension.

## Ordre de travail V3

1. **Bibliothèque** : vérifier les filtres rapides, le tableau triable et les onglets Lire/Classer/Index sur des données V2 réelles.
2. **Migration des données** : contrôler annotations, vues, règles, favoris et brouillons provenant d'un profil WebView V2 réel, avec sauvegarde préalable.
3. **Lecture et export** : comparer versions, réponses, références, corpus et index sur les mêmes archives V2/V3.
4. **Capture et import** : faire passer un lot réel depuis la page ou un export jusqu'au coffre et afficher chaque étape et limite.
5. **Modules historiques** : décider la reprise de chaque interface Node/Python à partir de ses parcours effectivement utilisés.

## Vérification de cette passe

- Aperçu V3 reconstruit avec `./native-v3/build-preview.sh`.
- Trois colonnes constatées dans la capture de l'application reconstruite ; 7 932 entrées et zéro erreur de source après chargement.
- `npm run test:native-v3` réussi : archives, import, extension, capture, annotations, exports et pont NoteMistress.
- La lisibilité du texte d'une fiche sélectionnée et la parité des parcours complets restent à contrôler manuellement dans l'interface.

## Comet et contrôle des sources au lancement

Le pont Native Messaging V3 et l’extension sont installés et activés dans Comet, profil « A » (`Default`). Le passage ChatGPT réel a démarré et écrit dans le coffre ; son premier rapport était partiel (2 331 repérées, 206 importées, état `error`). Un onglet Perplexity ouvert dans Comet n’a produit aucun rapport via l’extension. Cela concorde avec le blocage des extensions sur `perplexity.ai` dans Comet [décrit par le projet Complexity](https://github.com/pnd280/complexity/blob/nxt/perplexity/extension/docs/comet-enable-extensions.md). L’importeur natif Comet Perplexity est intégré à l’aperçu V3. Le réglage « Autoriser JavaScript dans les événements AppleScript » a été activé pour le profil A après sauvegarde de sa préférence. Un premier passage s’était arrêté à 199 conversations parce qu’une page de 99 éléments avait été prise à tort pour la fin. Une page suivante contenait encore 92 éléments : la pagination de l’importeur et de l’extension a été corrigée pour aller jusqu’à une page vide. Le passage réel corrigé dépassait 389 conversations repérées et 178 nouvelles importées au dernier contrôle, toujours en cours. Le nouvel importeur reprend automatiquement au lancement et toutes les cinq minutes. Aucun nouvel essai dans Chrome n’est prévu.

La V3 exécute désormais un diagnostic à son lancement pour Codex, Claude, Gemini, ChatGPT et Perplexity. Il distingue la présence des dossiers locaux, le pont et l’extension des navigateurs, et le dernier résultat réel de l’extension ou de l’importeur Comet. Il est accessible dans **Fichier → État des sources d’import** et dans le centre d’import. Le lancement réel du 3 novembre a affiché 4 sources prêtes sur 5 : Codex, Claude, Gemini et Perplexity. ChatGPT reste en cours ; l’extension l’a repéré à 2 331 conversations et le coffre en contenait plus de 695 au dernier comptage, ce nombre augmentant durant la reprise. La suite V3 complète passe.

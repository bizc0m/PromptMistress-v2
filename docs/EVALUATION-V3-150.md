# PromptMistress V3 — évaluation sur 150 critères

État observé le 3 novembre 2026. Les notes jugent la **V3 actuelle et sa trajectoire**, pas la valeur personnelle du travail. Échelle : **1** = absent ou contraire au besoin ; **5** = partiel ; **10** = utile et démontré sur les données réelles. Les critères de stratégie sont des jugements argumentés ; les critères de fonctionnement s’appuient sur le code, les tests et les imports constatés. Une réussite simulée ne vaut pas une preuve d’exhaustivité réelle.

**Moyennes non pondérées : objectif 6,36/10 · utilité 6,72/10 · pertinence 7,08/10 · ensemble 6,72/10.** Elles résument les 50 critères de chaque partie ; elles ne mesurent pas la satisfaction d’utilisateurs ni la complétude des comptes.

## A. Objectif — 50 critères

### A1. Problème à résoudre

- **001 · Retrouver tous les échanges — 9/10.** Besoin central clair et fréquent.
- **002 · Éviter la dispersion entre fournisseurs — 9/10.** ChatGPT, Perplexity et sessions locales sont réellement séparés aujourd’hui.
- **003 · Préserver un historique personnel durable — 9/10.** Le coffre local répond à une perte possible d’accès aux interfaces.
- **004 · Faire gagner du temps à la reprise — 8/10.** Recherche et lecture réunies, gain encore non mesuré.
- **005 · Réduire les copies manuelles — 8/10.** L’import automatique supprime une part importante des manipulations.
- **006 · Retrouver les sources d’origine — 8/10.** Liens et identifiants sont conservés pour les captures reconnues.
- **007 · Éviter les doublons — 8/10.** Reprise vérifiée sur les deux parcours d’import.
- **008 · Conserver les pièces jointes — 4/10.** Le parcours automatique ne les télécharge pas.
- **009 · Garantir l’exhaustivité — 4/10.** Les listes privées des fournisseurs peuvent être incomplètes ou changer.
- **010 · Remplacer le réflexe de chercher partout — 7/10.** La bibliothèque commune aide, mais la confiance dépend de la couverture réelle.

### A2. Public et usages

- **011 · Usage personnel intensif — 9/10.** La masse de chats et de projets justifie un outil spécialisé.
- **012 · Usage quotidien de recherche — 8/10.** Les filtres rapides et la lecture directe servent cet usage.
- **013 · Usage de classement après lecture — 8/10.** L’onglet Classer évite de quitter la conversation.
- **014 · Usage de reprise de projet — 7/10.** Métadonnées et recherche aident ; le contexte de reprise reste à prouver.
- **015 · Usage d’export éditorial — 7/10.** Plusieurs formats existent, leur fidélité sur un corpus réel reste à vérifier.
- **016 · Usage sans connaissance technique — 5/10.** Extension, pont natif et réglages Comet compliquent la mise en route.
- **017 · Usage hors connexion — 7/10.** Le coffre se lit localement ; la collecte distante exige une session connectée.
- **018 · Usage sur plusieurs comptes — 4/10.** La séparation des profils et comptes n’est pas encore explicitée dans l’interface.
- **019 · Usage multi-appareils — 3/10.** Aucun flux de synchronisation vérifié.
- **020 · Usage partagé en équipe — 2/10.** Le modèle et les permissions visent d’abord une seule personne.

### A3. Périmètre du produit

- **021 · Bibliothèque unifiée — 8/10.** Native et déjà alimentée par plusieurs sources.
- **022 · Import ChatGPT — 6/10.** Import réel en progression, historique complet non confirmé.
- **023 · Import Perplexity — 7/10.** Import réel et pagination corrigée, parcours complet encore en cours.
- **024 · Import Codex — 8/10.** Synchronisation locale testée et visible dans le coffre.
- **025 · Import Claude — 8/10.** Source locale détectée et synchronisée.
- **026 · Import Gemini — 8/10.** Source locale détectée et synchronisée.
- **027 · Capture d’autres pages LLM — 5/10.** Mode page visible disponible, couverture historique absente.
- **028 · Fusion / Lab — 5/10.** Fenêtre séparée ; parité d’usage V2 non démontrée.
- **029 · Coffres historiques Node/Python — 5/10.** Commandes accessibles ; interfaces riches à reprendre.
- **030 · Intégrations NoteMistress/TinyPlan — 4/10.** NoteMistress amorcée, TinyPlan reste une intention.

### A4. Définition de réussite

- **031 · Compter les conversations repérées — 7/10.** Les rapports le font pour les parcours distants.
- **032 · Compter les conversations importées — 8/10.** Compteurs et index du coffre sont vérifiables.
- **033 · Comparer repérées et importées — 5/10.** La comparaison existe manuellement, pas comme bilan final fiable.
- **034 · Montrer les échecs par source — 7/10.** Diagnostic à cinq sources et états distincts.
- **035 · Montrer la raison précise d’un échec — 5/10.** Messages agrégés ; les causes par conversation restent difficiles à examiner.
- **036 · Reprendre après interruption — 8/10.** Déduplication et reprise simulées puis observées.
- **037 · Tester au lancement — 8/10.** Vérification réelle Codex, Claude, Gemini, ChatGPT et Perplexity.
- **038 · Vérifier l’exhaustivité du compte — 3/10.** Aucun rapprochement avec un export officiel complet.
- **039 · Mesurer le temps gagné — 2/10.** Aucun scénario chronométré avant/après.
- **040 · Déclarer la parité V2 — 4/10.** Audit honnête, mais les parcours non migrés empêchent la déclaration.

### A5. Continuité avec la V2

- **041 · Préserver les archives existantes — 9/10.** La V3 lit les coffres sans migration destructrice.
- **042 · Préserver les couleurs de source/projet — 8/10.** Reprises dans la bibliothèque native.
- **043 · Retrouver les trois colonnes — 8/10.** Structure corrigée et observée.
- **044 · Retrouver le tri par colonnes — 8/10.** Présent dans la liste V3.
- **045 · Retrouver le classement intégré — 7/10.** Fiche Classer présente ; gestes fins à confronter à la V2.
- **046 · Migrer les annotations V2 — 6/10.** Procédure et sauvegarde existent ; données réelles anciennes à vérifier.
- **047 · Migrer vues, règles et favoris — 5/10.** Chemin prévu, validation réelle incomplète.
- **048 · Conserver le parcours Fusion/Lab — 5/10.** Fonctionnellement présent, visuellement séparé.
- **049 · Conserver les modules historiques — 4/10.** CLI disponible, expérience V2 incomplète.
- **050 · Retirer la V2 sans perte — 3/10.** Trop tôt tant que les vérifications de parité ne sont pas terminées.

## B. Utilité — 50 critères

### B1. Lire et retrouver

- **051 · Ouvrir une lecture dès la sélection — 9/10.** Le geste principal est immédiat.
- **052 · Lire sans changer de fenêtre — 8/10.** Inspecteur dans la bibliothèque.
- **053 · Chercher par titre — 8/10.** Champ direct et résultats visibles.
- **054 · Chercher dans le texte — 8/10.** Mode texte complet disponible.
- **055 · Filtrer par plateforme — 8/10.** Filtre rapide et explorateur.
- **056 · Filtrer par projet — 7/10.** Arbre et filtres, ergonomie réelle à confirmer.
- **057 · Filtrer par statut — 7/10.** Contrôle avancé présent.
- **058 · Chercher avec NyxBoolean — 7/10.** Moteur disponible, usage avancé à valider.
- **059 · Comparer deux conversations — 6/10.** Fonction présente, parcours réel à éprouver.
- **060 · Retrouver une réponse précise — 6/10.** Navigation paginée, fidélité sur longs chats à comparer.

### B2. Classer et annoter

- **061 · Modifier la fiche de la sélection — 8/10.** Onglet Classer cohérent avec la lecture.
- **062 · Ajouter des tags — 8/10.** Fonction native et persistante.
- **063 · Utiliser des dossiers hiérarchiques — 7/10.** Explorer et fiche présents.
- **064 · Changer le statut — 7/10.** Disponible pour une fiche ou un lot.
- **065 · Définir une priorité — 7/10.** Disponible, impact sur la reprise à éprouver.
- **066 · Ajouter une note — 8/10.** Fiche persistante sans quitter le chat.
- **067 · Conserver un brouillon interrompu — 8/10.** Protection prévue dans la V3.
- **068 · Appliquer des règles de classement — 6/10.** Moteur présent, effet sur les vrais corpus à contrôler.
- **069 · Réutiliser des vues sauvegardées — 6/10.** Fonction présente, migration V2 non prouvée.
- **070 · Éditer un lot rapidement — 6/10.** Actions groupées disponibles, fluidité à observer.

### B3. Importer automatiquement

- **071 · Importer sans clic après configuration — 7/10.** Fonctionne si Comet, l’onglet et la V3 restent ouverts.
- **072 · Importer le texte ChatGPT — 6/10.** Chats réels reçus ; couverture totale encore absente.
- **073 · Importer le texte Perplexity — 7/10.** Chats réels reçus ; pagination réparée.
- **074 · Retenter après échec réseau — 7/10.** Passages périodiques et reprise sans doublon.
- **075 · Éviter les doublons à l’import — 9/10.** Vérifié en tests et sur les passages réels.
- **076 · Afficher la progression pendant l’import — 5/10.** Compteurs enregistrés, affichage natif encore sommaire.
- **077 · Isoler une conversation illisible — 7/10.** Un fil sans texte ne stoppe plus les autres.
- **078 · Détecter une session déconnectée — 6/10.** Erreur visible, remédiation encore manuelle.
- **079 · Importer les pièces jointes — 3/10.** Non couvert par le parcours automatique.
- **080 · Prouver « tous mes chats » — 3/10.** Besoin non satisfait tant qu’un rapprochement indépendant manque.

### B4. Exporter et transférer

- **081 · Exporter en Markdown — 8/10.** Format lisible et portable.
- **082 · Exporter en texte — 7/10.** Simple pour les usages externes.
- **083 · Exporter en JSON — 8/10.** Bonne base de réversibilité.
- **084 · Exporter en ZIP — 7/10.** Pratique pour des lots.
- **085 · Exporter un corpus complet — 6/10.** Présent, fidélité sur données réelles à contrôler.
- **086 · Exporter seulement questions/réponses — 7/10.** Choix de contenu utile.
- **087 · Exporter un index Markdown — 7/10.** Sert au repérage et au transfert.
- **088 · Copier un extrait vers NoteMistress — 7/10.** Parcours concret, borné.
- **089 · Exporter un chat vers NoteMistress — 6/10.** Fonction présente avec vérification de complétude.
- **090 · Transférer vers TinyPlan — 2/10.** Pas encore d’interface d’échange vérifiée.

### B5. Usage quotidien

- **091 · Ouvrir vite une grande bibliothèque — 7/10.** Plus de 9 000 entrées observées sans erreur de source.
- **092 · Voir les éléments récents — 8/10.** Tri et dates présents.
- **093 · Garder une lecture stable — 7/10.** Panneaux configurables, comportement long terme à tester.
- **094 · Reconnaître les plateformes d’un coup d’œil — 8/10.** Couleurs et colonne Source.
- **095 · Réduire le bruit visuel — 7/10.** Filtres rapides et onglets de l’inspecteur.
- **096 · Utiliser le clavier — 5/10.** Raccourcis existent ; parcours complet clavier non audité.
- **097 · Comprendre l’état de chaque import — 6/10.** Diagnostic présent, résultat final encore technique.
- **098 · Corriger une erreur sans terminal — 4/10.** Certaines erreurs Comet exigent une configuration hors app.
- **099 · Utiliser l’app sans serveur local — 8/10.** L’aperçu native fonctionne sans port HTTP.
- **100 · Garder l’app ouverte longtemps — 6/10.** Minuteries présentes, endurance et consommation non mesurées.

## C. Pertinence — 50 critères

### C1. Adéquation à ton contexte

- **101 · Volume d’archives personnel — 9/10.** La masse observée justifie un index commun.
- **102 · Plusieurs fournisseurs LLM — 9/10.** Le besoin dépasse clairement une seule interface.
- **103 · Continuité entre recherche et création — 8/10.** Lire, classer et exporter dans un même parcours est cohérent.
- **104 · Usage macOS natif — 8/10.** Correspond à l’environnement réel et évite un service local.
- **105 · Préférence pour Comet — 7/10.** Prise en charge réelle, mais Perplexity exige un réglage avancé.
- **106 · Conservation locale — 9/10.** Convient à des conversations personnelles potentiellement sensibles.
- **107 · Besoin de contrôle manuel — 7/10.** Import de fichiers et captures sélectionnables.
- **108 · Besoin d’automatisation — 8/10.** Justifié par la taille de l’historique.
- **109 · Besoin de mobilité immédiate — 3/10.** La V3 est aujourd’hui centrée sur ce Mac.
- **110 · Besoin de collaboration — 2/10.** Rien n’indique que ce soit une priorité actuelle.

### C2. Choix du produit face aux alternatives

- **111 · Utiliser seulement la recherche ChatGPT — 4/10.** Ne couvre pas Perplexity ni les sessions locales.
- **112 · Utiliser seulement la bibliothèque Perplexity — 4/10.** Ne couvre pas les autres sources.
- **113 · Empiler des exports manuels — 5/10.** Réversible, mais pénible à répéter.
- **114 · Construire une bibliothèque commune — 9/10.** Bon choix pour la recherche transversale.
- **115 · Garder la V2 pendant la transition — 9/10.** Évite de perdre des fonctions non migrées.
- **116 · Choisir une app native plutôt qu’un serveur local — 8/10.** Réduit les ports, simplifie l’usage quotidien.
- **117 · Maintenir un pont Native Messaging — 6/10.** Efficace pour ChatGPT, coûteux à configurer.
- **118 · Préférer l’API privée des sites — 5/10.** Permet l’automatisation mais dépend de détails non garantis.
- **119 · Prévoir un import de fichiers en secours — 9/10.** Essentiel quand les parcours automatiques cassent.
- **120 · Déclarer la V3 comme remplaçante maintenant — 2/10.** La parité V2 et l’exhaustivité ne sont pas établies.

### C3. Architecture, données et confidentialité

- **121 · Coffre local lisible — 9/10.** Favorise contrôle, sauvegarde et inspection.
- **122 · Identifiant source conservé — 8/10.** Nécessaire pour la reprise et la déduplication.
- **123 · Lien vers la conversation d’origine — 8/10.** Aide à contrôler la fidélité.
- **124 · Séparer contenu et annotations — 8/10.** Protège les enrichissements personnels.
- **125 · Sauvegarder avant migration V2 — 9/10.** Bonne défense contre les pertes.
- **126 · Éviter un port HTTP local — 8/10.** Surface d’exposition plus petite.
- **127 · Autoriser AppleScript JavaScript dans Comet — 5/10.** Fonctionne, mais élargit l’accès des scripts au navigateur.
- **128 · Limiter le pont natif à l’extension V3 — 8/10.** Origine autorisée explicitement.
- **129 · Journaliser sans révéler les chats — 8/10.** États et compteurs séparés du contenu.
- **130 · Chiffrer le coffre au repos — 4/10.** Dépend aujourd’hui des protections macOS du compte.

### C4. Robustesse et coût de maintenance

- **131 · Tests automatisés V3 — 8/10.** Suite complète, dont reprise et pagination.
- **132 · Test réel sur Comet — 8/10.** ChatGPT et Perplexity ont écrit dans le coffre.
- **133 · Test réel sur toutes les sources — 7/10.** Cinq états contrôlés ; couverture des contenus encore variable.
- **134 · Résister aux changements d’API ChatGPT — 4/10.** Dépendance forte à des routes privées.
- **135 · Résister aux changements d’API Perplexity — 4/10.** Pagination irrégulière déjà rencontrée.
- **136 · Reprendre après fermeture de l’app — 7/10.** Déduplication et nouveau passage au lancement.
- **137 · Éviter les imports concurrents — 6/10.** Verrou Perplexity présent ; plusieurs sources écrivent encore dans le même coffre.
- **138 · Maintenir une extension multi-navigateurs — 5/10.** Différences Comet/Chrome/Edge coûteuses.
- **139 · Détecter une régression visuelle — 5/10.** Audit et capture faits, pas de comparaison automatisée durable.
- **140 · Documenter les limites — 8/10.** Audit et README séparent l’existant du restant.

### C5. Priorités et décisions

- **141 · Finir l’import ChatGPT — 10/10.** Première priorité tant que le compte n’est pas rapproché du coffre.
- **142 · Finir la pagination Perplexity — 10/10.** Le correctif évite une perte silencieuse de pages.
- **143 · Mesurer les conversations en échec — 9/10.** Permet de traiter les vrais trous de couverture.
- **144 · Comparer avec un export de compte — 9/10.** Seule preuve indépendante plausible d’exhaustivité.
- **145 · Tester la migration V2 réelle — 9/10.** Protège les annotations et habitudes existantes.
- **146 · Vérifier lecture et export sur un même échantillon — 8/10.** Transforme la parité déclarée en preuve.
- **147 · Simplifier la configuration Comet — 8/10.** Condition d’une utilité quotidienne sans assistance.
- **148 · Ajouter les pièces jointes après le texte — 6/10.** Utile, moins urgent que couvrir tous les chats textuels.
- **149 · Reporter TinyPlan et les modules secondaires — 8/10.** Concentre l’effort sur bibliothèque et import fiables.
- **150 · Fixer un seuil de sortie de V2 — 9/10.** Un remplacement doit dépendre de critères vérifiés.

## Verdict

La **direction produit est forte** : une bibliothèque locale de conversations multi-sources répond à un besoin réel et récurrent. La **valeur actuelle est partielle** : la bibliothèque native fonctionne, mais « tous mes chats » n’est pas encore prouvé et la parité complète avec la V2 reste à vérifier. Le risque principal n’est pas l’idée ; c’est de présenter une couverture incomplète comme terminée.

Décision recommandée : conserver la V2 comme référence, terminer les imports et leur rapprochement avec les comptes, puis vérifier les parcours V2 essentiels sur les mêmes archives. Faire de la simplicité de configuration Comet et de la lisibilité des échecs les deux critères d’acceptation de l’automatisation.

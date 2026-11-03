# Suivi des 150 améliorations V3

Périmètre : cette grille suit les 150 critères de l’évaluation initiale. Elle ne représente pas la liste ultérieure des 150 améliorations fonctionnelles demandées ; leur rapprochement reste à faire.

Source : `docs/EVALUATION-V3-150.md` (notes au 3 novembre 2026). Les notes ne changent que sur preuve écrite ici.

**États** : `existant` = fonction présente, preuve à compléter · `corrigé et testé` = changement livré et vérifié par tests (fixtures) · `restant` = à faire.
**Types** : `code` = faisable par le code · `UI` = contrôle dans l'app · `décision` = choix utilisateur · `données` = nécessite un vrai compte/coffre · `externe` = dépend d'un service tiers · `humain` = mesure hors code.

**Bilan au 3 novembre 2026** : 9 lignes `corrigé et testé` (fixtures : 077, 081, 082, 083, 084, 085, 087, 113 ; 085 et 087 testés par parité et empreinte), 0 note modifiée. Contrôle UI de l'annulation non fait. Tout le reste est `existant` ou `restant`. Aucun point n'est déclaré terminé.

**Preuves de cette session** : `npm run test:native-v3` vert (EXIT=0) ; `scripts/test-v3-features.sh` vert (cache, renommage, export par morceaux, ZIP, invalidation index/suppression).

## A. Objectif

| id | critère | note | action pour monter | type | état |
|---|---|---|---|---|---|
| 001 | Retrouver tous les échanges | 9 | Mesurer la couverture par source (lien avec 038) | données | existant |
| 002 | Éviter la dispersion entre fournisseurs | 9 | Rien de nouveau ; garder la bibliothèque commune | — | existant |
| 003 | Historique personnel durable | 9 | Vérifier la sauvegarde du coffre (125) | code | existant |
| 004 | Gain de temps à la reprise | 8 | Scénario chronométré avant/après | humain | restant |
| 005 | Réduire les copies manuelles | 8 | Mesurer les étapes manuelles restantes | humain | restant |
| 006 | Retrouver les sources d'origine | 8 | Tester les liens sur tous les fournisseurs | données | existant |
| 007 | Éviter les doublons | 8 | Test de reprise sur gros volume (fixture 5000) | code | restant |
| 008 | Pièces jointes conservées | 4 | Import des pièces jointes ChatGPT/Perplexity | externe | restant |
| 009 | Exhaustivité garantie | 4 | Rapprochement avec export officiel (144) | données | restant |
| 010 | Remplacer le réflexe de chercher partout | 7 | Tests d'usage sur vraies recherches | humain | restant |
| 011 | Usage personnel intensif | 9 | Aucune action code | — | existant |
| 012 | Usage quotidien de recherche | 8 | Chronométrer une recherche type | humain | restant |
| 013 | Classement après lecture | 8 | Vérifier le geste Classer sur vraies fiches | UI | restant |
| 014 | Reprise de projet | 7 | Contexte de reprise : résumé par projet | décision | restant |
| 015 | Export éditorial | 7 | Export corpus sur échantillon réel (085) | données | restant |
| 016 | Usage sans connaissance technique | 5 | Installation guidée, extension « Sonde » (018/138) | décision | restant |
| 017 | Usage hors connexion | 7 | Vérifier lecture sans session | UI | restant |
| 018 | Plusieurs comptes | 4 | Séparer profils/comptes dans l'interface | décision | restant |
| 019 | Multi-appareils | 3 | Hors périmètre actuel | décision | restant |
| 020 | Usage en équipe | 2 | Hors périmètre actuel | décision | restant |

## B. Utilité

| id | critère | note | action pour monter | type | état |
|---|---|---|---|---|---|
| 021 | Bibliothèque unifiée | 8 | Bilan de scan et compteurs par source | code | existant |
| 022 | Import ChatGPT | 6 | Confirmer l'historique complet (141) | données | restant |
| 023 | Import Perplexity | 7 | Finir le parcours complet (142) | données | restant |
| 024 | Import Codex | 8 | Test de synchronisation répété | code | existant |
| 025 | Import Claude | 8 | Test de synchronisation répété | code | existant |
| 026 | Import Gemini | 8 | Test de synchronisation répété | code | existant |
| 027 | Capture d'autres pages LLM | 5 | Couverture historique ou capture visible documentée | décision | restant |
| 028 | Fusion / Lab | 5 | Parité d'usage V2 démontrée | UI | restant |
| 029 | Coffres historiques Node/Python | 5 | Interfaces riches à reprendre | code | restant |
| 030 | Intégrations NoteMistress/TinyPlan | 4 | NoteMistress vérifié ; TinyPlan reporté (149) | décision | restant |
| 031 | Conversations repérées | 7 | Compteur unifié repérées/importées | code | restant |
| 032 | Conversations importées | 8 | Vérifier compteurs contre index | code | existant |
| 033 | Repérées vs importées | 5 | Bilan final automatique | code | restant |
| 034 | Échecs par source | 7 | Diagnostic à 5 sources (existant) | UI | existant |
| 035 | Raison précise d'un échec | 5 | Message par conversation, pas seulement agrégé | code | restant |
| 036 | Reprise après interruption | 8 | Test d'interruption réelle | données | existant |
| 037 | Test au lancement | 8 | Garder, ajouter un résumé lisible | UI | existant |
| 038 | Exhaustivité du compte | 3 | Rapprochement externe | données | restant |
| 039 | Temps gagné | 2 | Scénario chronométré | humain | restant |
| 040 | Déclarer la parité V2 | 4 | Parcours non migrés listés et traités | code | restant |
| 041 | Préserver les archives | 9 | Garder ; test lecture seule | code | existant |
| 042 | Couleurs source/projet | 8 | Vérifier dans l'app | UI | existant |
| 043 | Trois colonnes | 8 | Vérifier dans l'app | UI | existant |
| 044 | Tri par colonnes | 8 | Vérifier dans l'app | UI | existant |
| 045 | Classement intégré | 7 | Comparer gestes avec V2 | UI | restant |
| 046 | Migrer annotations V2 | 6 | Migration sur données réelles anciennes | données | restant |
| 047 | Migrer vues, règles, favoris | 5 | Validation réelle | données | restant |
| 048 | Parcours Fusion/Lab | 5 | Intégrer ou documenter la séparation | décision | restant |
| 049 | Modules historiques | 4 | Documenter les CLI restants | code | restant |
| 050 | Retirer V2 sans perte | 3 | Attendre 040, 046, 047 | décision | restant |
| 051 | Ouvrir une lecture à la sélection | 9 | Garder | UI | existant |
| 052 | Lire sans changer de fenêtre | 8 | Garder | UI | existant |
| 053 | Chercher par titre | 8 | Garder ; test sur 11 000 entrées | UI | existant |
| 054 | Chercher dans le texte | 8 | Mesurer le temps de recherche plein texte | code | restant |
| 055 | Filtrer par plateforme | 8 | Garder | UI | existant |
| 056 | Filtrer par projet | 7 | Confirmer ergonomie | UI | restant |
| 057 | Filtrer par statut | 7 | Confirmer ergonomie | UI | restant |
| 058 | NyxBoolean | 7 | Cas d'usage avancé testé | code | restant |
| 059 | Comparer deux conversations | 6 | Parcours réel à éprouver | UI | restant |
| 060 | Réponse précise sur longs chats | 6 | Comparer fidélité sur chat long | données | restant |
| 061 | Modifier la fiche de sélection | 8 | Renommage inclus (corrigé, testé fixture) ; contrôle UI à faire | UI | existant |
| 062 | Tags | 8 | Garder | code | existant |
| 063 | Dossiers hiérarchiques | 7 | Confirmer dans l'app | UI | restant |
| 064 | Changer le statut | 7 | Test sur lot | UI | restant |
| 065 | Priorité | 7 | Impact sur reprise à mesurer | code | restant |
| 066 | Note | 8 | Garder | UI | existant |
| 067 | Brouillon interrompu | 8 | Test de reprise de brouillon | code | existant |
| 068 | Règles de classement | 6 | Contrôle sur corpus réel | données | restant |
| 069 | Vues sauvegardées | 6 | Migration V2 prouvée (047) | données | restant |
| 070 | Éditer un lot | 6 | Mesurer fluidité sur 1000 lignes | UI | restant |

## C. Import et robustesse

| id | critère | note | action pour monter | type | état |
|---|---|---|---|---|---|
| 071 | Import sans clic après configuration | 7 | Tester avec Comet ouvert, relancement | externe | restant |
| 072 | Import texte ChatGPT | 6 | Couverture complète (141) | données | restant |
| 073 | Import texte Perplexity | 7 | Couverture complète (142) | données | restant |
| 074 | Retenter après échec réseau | 7 | Test avec réseau coupé simulé | code | restant |
| 075 | Éviter doublons à l'import | 9 | Garder ; test de non-régression | code | existant |
| 076 | Progression pendant import | 5 | Barre de progression native (export en a une : texte seulement) | UI | restant |
| 077 | Isoler conversation illisible | 7 | Scan : fichier illisible signalé, les autres passent (testé) | code | corrigé et testé |
| 078 | Session déconnectée | 6 | Remédiation guidée | UI | restant |
| 079 | Importer pièces jointes | 3 | Hors parcours automatique | externe | restant |
| 080 | Prouver « tous mes chats » | 3 | Rapprochement externe (144) | données | restant |

## D. Export massif

| id | critère | note | action pour monter | type | état |
|---|---|---|---|---|---|
| 081 | Export Markdown | 8 | Export par morceaux : fichier vérifié par empreinte, remplacement sûr (testé fixture) | code | corrigé et testé |
| 082 | Export texte | 7 | Même moteur que Markdown (testé fixture) ; contrôle UI | UI | corrigé et testé |
| 083 | Export JSON | 8 | Export en flux, JSON valide, 5000 entrées (testé fixture) | code | corrigé et testé |
| 084 | Export ZIP | 7 | ZIP vérifié par extraction (testé fixture) ; test sur gros lot | code | corrigé et testé |
| 085 | Corpus complet | 6 | Corpus en flux, sortie identique à l'ancien export (test octet à octet) ; échantillon réel à comparer | code | corrigé et testé |
| 086 | Questions/réponses seulement | 7 | Contrôle sur données réelles | données | existant |
| 087 | Index Markdown | 7 | Index en flux, écrit hors thread principal, annulable (testé fixture) | code | corrigé et testé |
| 088 | Extrait vers NoteMistress | 7 | Garder ; vérifier | code | existant |
| 089 | Chat vers NoteMistress | 6 | Vérification de complétude sur données réelles | données | restant |
| 090 | Transférer vers TinyPlan | 2 | Reporté (149) | décision | restant |
| 091 | Grande bibliothèque | 7 | Cache de scan (testé fixture) ; mesure réelle à compléter | code | existant |
| 092 | Éléments récents | 8 | Garder | UI | existant |
| 093 | Lecture stable | 7 | Test longue session | humain | restant |
| 094 | Plateformes d'un coup d'œil | 8 | Garder | UI | existant |
| 095 | Réduire le bruit visuel | 7 | Confirmer dans l'app | UI | restant |
| 096 | Clavier | 5 | Audit clavier complet | code | restant |
| 097 | État de chaque import | 6 | Résultat final lisible (non technique) | UI | restant |
| 098 | Corriger une erreur sans terminal | 4 | Guide intégré pour Comet | UI | restant |
| 099 | Sans serveur local | 8 | Garder | code | existant |
| 100 | App ouverte longtemps | 6 | Mesure mémoire et CPU sur 1 h | humain | restant |

## E. Organisation, lecture et sélection

| id | critère | note | action pour monter | type | état |
|---|---|---|---|---|---|
| 101 | Volume d'archives | 9 | Garder | — | existant |
| 102 | Plusieurs fournisseurs | 9 | Garder | — | existant |
| 103 | Recherche → création | 8 | Garder | UI | existant |
| 104 | macOS natif | 8 | Garder | — | existant |
| 105 | Préférence Comet | 7 | Réglage Perplexity simplifié (147) | UI | restant |
| 106 | Conservation locale | 9 | Garder | — | existant |
| 107 | Contrôle manuel | 7 | Sélection explicite : décocher le filtre, inverser, plage, lot nommé | UI | restant |
| 108 | Automatisation | 8 | Garder | — | existant |
| 109 | Mobilité | 3 | Hors périmètre actuel | décision | restant |
| 110 | Collaboration | 2 | Hors périmètre actuel | décision | restant |
| 111 | Recherche ChatGPT seule | 4 | Couverture multi-sources | données | restant |
| 112 | Bibliothèque Perplexity seule | 4 | Couverture multi-sources | données | restant |
| 113 | Empiler exports manuels | 5 | Export unique avec rapport d'omissions ; annulation par le bouton d'export (code fait, contrôle UI non fait) | UI | corrigé et testé |
| 114 | Bibliothèque commune | 9 | Garder | — | existant |
| 115 | Garder V2 en transition | 9 | Garder | décision | existant |
| 116 | App native sans serveur | 8 | Garder | — | existant |
| 117 | Pont Native Messaging | 6 | Simplifier l'installation | code | restant |
| 118 | API privée des sites | 5 | Dépendance documentée et test de casse | code | restant |
| 119 | Import de fichiers en secours | 9 | Garder | code | existant |
| 120 | Déclarer V3 remplaçante | 2 | Attendre 040, 046, 047, 050 | décision | restant |
| 121 | Coffre local lisible | 9 | Garder | — | existant |
| 122 | Identifiant source | 8 | Garder | code | existant |
| 123 | Lien vers origine | 8 | Garder | UI | existant |
| 124 | Contenu et annotations séparés | 8 | Garder ; test de migration | code | existant |
| 125 | Sauvegarder avant migration | 9 | Garder | code | existant |
| 126 | Pas de port HTTP local | 8 | Garder | code | existant |
| 127 | AppleScript Comet | 5 | Réduire le périmètre des scripts | code | restant |
| 128 | Pont limité à l'extension V3 | 8 | Garder | code | existant |
| 129 | Journal sans contenu | 8 | Garder | code | existant |
| 130 | Chiffrer le coffre | 4 | Chiffrement au repos (décision) | décision | restant |

## F. Qualité et tests

| id | critère | note | action pour monter | type | état |
|---|---|---|---|---|---|
| 131 | Tests automatisés V3 | 8 | Ajouter tests de gros lots et d'interruption | code | restant |
| 132 | Test réel Comet | 8 | Garder | externe | existant |
| 133 | Test réel toutes sources | 7 | Couverture des contenus | données | restant |
| 134 | Changements API ChatGPT | 4 | Détection de casse au lancement | code | restant |
| 135 | Changements API Perplexity | 4 | Détection de casse au lancement | code | restant |
| 136 | Reprise après fermeture | 7 | Test de fermeture pendant export | code | restant |
| 137 | Imports concurrents | 6 | Verrou commun à toutes les sources | code | restant |
| 138 | Extension multi-navigateurs | 5 | Guide par navigateur | décision | restant |
| 139 | Régression visuelle | 5 | Captures comparées | UI | restant |
| 140 | Documenter les limites | 8 | Garder ; mettre à jour | code | existant |
| 141 | Finir import ChatGPT | 10 | Rapprochement avec le compte | données | restant |
| 142 | Finir pagination Perplexity | 10 | Vérifier sur compte réel | données | restant |
| 143 | Mesurer conversations en échec | 9 | Garder | code | existant |
| 144 | Comparer avec export de compte | 9 | Export officiel à fournir | données | restant |
| 145 | Tester migration V2 réelle | 9 | Migration sur copie du coffre | données | restant |
| 146 | Lecture et export même échantillon | 8 | Échantillon réel comparé | données | restant |
| 147 | Simplifier configuration Comet | 8 | Assistant de configuration | UI | restant |
| 148 | Pièces jointes après texte | 6 | Planifier après couverture du texte | décision | restant |
| 149 | Reporter TinyPlan et secondaires | 8 | Garder | décision | existant |
| 150 | Seuil de sortie V2 | 9 | Liste de critères vérifiés (040, 046, 047, 145) | décision | existant |

## Restant prioritaire (dépendances)

1. Export : bouton Annuler (UI), corpus en morceaux (085), index en flux (087).
2. Sélection : 107 (décocher, inverser, plage, lot nommé).
3. Périodes 1/7/30 jours : non listées dans les 150 ; à ajouter en 150+ ou dans 107/064.
4. Données réelles : 141, 142, 046, 047, 145, 144 (bloquent 009, 038, 080, 120).
5. Décisions : 016/138 (Sonde), 027, 018, 130, 148, 150.

## Reprise : annulation tardive

Le moteur vérifie désormais l’annulation après la vérification du fichier temporaire et avant le remplacement final, pour les fichiers simples, ZIP et corpus. Un test annule après la dernière fiche et vérifie la conservation de la destination dans les cinq formats.

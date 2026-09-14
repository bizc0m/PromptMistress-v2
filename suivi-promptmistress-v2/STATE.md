# PromptMistress V2 — État

## Session en cours
- **Démarrée** : 2026-09-14
- **Itération** : 1
- **prompt_count** : 1
- **Dernier focus** : finalisation V2

## État actuel
- Repo initialisé, 3 commits locaux sur `main`, pas de remote.
- App buildée et installée dans `~/.promptmistress-v2/PromptMistress.app`.
- Serveur actif sur http://127.0.0.1:18431/ ; Node + Python démarrés.
- Node embarqué dans le bundle.
- Python utilise `/usr/bin/python3` (Xcode Python) → à embarquer.

## Reste à faire
1. Embarquer Python dans le bundle.
2. Ajouter indicateur visuel de tri actif sur les colonnes.
3. Ajouter recherche full-text dans l'onglet Importer.
4. Implémenter glisser-déposer d'un élément sur un dossier.
5. Pousser V2 sur GitHub (bizc0m/PromptMistress-v2).
6. Tests de non-régression + nettoyage.

## Version
- Courante : 0.2.0
- Prochaine : 0.2.1 après finalisation

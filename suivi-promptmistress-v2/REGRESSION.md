# PromptMistress V2 — Régressions à surveiller

## R001 — Lancement de l'app macOS
- Description : L'app doit démarrer, lancer Node, puis afficher l'interface locale.
- Fichiers concernés : binaire Swift, `scripts/server.mjs`, `Runtime.plist`.
- Test : `open ~/.promptmistress-v2/PromptMistress.app && sleep 3 && curl -s http://127.0.0.1:18431/health`.
- Validé le : 2026-09-14

## R002 — Onglet Importer
- Description : Le bookmarklet, le drop JSON et l'import doivent fonctionner.
- Fichiers concernés : `capture.html`, `scripts/capture-ui.js`.
- Test : ouvrir `/capture`, charger un export JSON, vérifier que les lignes apparaissent et s'importent.
- Validé le : 2026-09-14

## R003 — Bibliothèque unifiée
- Description : La liste, les filtres, la fiche, les exports et les annotations doivent fonctionner.
- Fichiers concernés : `workspace.html`, `scripts/workspace-ui.js`, `styles/workspace.css`.
- Test : ouvrir `/workspace`, vérifier le chargement, la recherche simple/booléenne, l'ouverture d'une fiche, l'enregistrement d'un tag.
- Validé le : 2026-09-14

## R004 — Modules Node et Python
- Description : Les deux modules doivent démarrer et répondre.
- Fichiers concernés : `scripts/server.mjs`, `projects/project-a-chatvault/pv.js`, `projects/project-b-python-prompt-vault/src/prompt_vault/ui/server.py`.
- Test : `curl -s http://127.0.0.1:18431/health` retourne `ready:true` avec `node` et `python` non null.
- Validé le : 2026-09-14

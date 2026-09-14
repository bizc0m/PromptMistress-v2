# PromptMistress V2 — Restore

## Dossier projet
`/Users/JOB/#DEV/01-projets/_applications/PromptMistress-v2`

## Commandes de reprise
```bash
cd /Users/JOB/#DEV/01-projets/_applications/PromptMistress-v2
git status --short --branch
git log --oneline -5
open ~/.promptmistress-v2/PromptMistress.app
curl -s http://127.0.0.1:18431/health
```

## État connu
- App installée dans `~/.promptmistress-v2/PromptMistress.app`.
- Serveur local sur le port 18431.
- Données dans `~/.promptmistress-v2/archives/sources.json`.
- Node embarqué ; Python en cours d'embarquement.

## Prochaine action
1. Modifier `scripts/server.mjs` pour supporter Python embarqué.
2. Compiler le lanceur Swift mis à jour.
3. Assembler le bundle avec Python.
4. Implémenter les features UI.
5. Pousser sur GitHub.
6. Tester.

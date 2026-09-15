# PromptMistress V2 — Restore

## Dossier projet
`/Users/JOB/#DEV/01-projets/_applications/PromptMistress-v2`

## Commandes de reprise
```bash
cd /Users/JOB/#DEV/01-projets/_applications/PromptMistress-v2
git status --short --branch
git log --oneline -5
npm test
open ~/.promptmistress-v2/PromptMistress.app
curl -s http://127.0.0.1:18431/health
```

## État connu
- Repo : branche `main`, remote `https://github.com/bizc0m/PromptMistress-v2`.
- App installée : `~/.promptmistress-v2/PromptMistress.app`.
- Serveur local sur le port 18431.
- Données dans `~/.promptmistress-v2/archives/sources.json`.
- Node + Python embarqués dans le bundle.
- Extension navigateur dans `browser-extension/`.
- Build script : `scripts/build.sh`.
- Tests : `scripts/verify.mjs`.
- Distribution : `dist/PromptMistress-0.2.0-macOS.zip` + `.dmg`.

## Prochaine action
1. Pousser les commits sur GitHub.
2. Tester l'extension dans Chrome/Firefox sur ChatGPT/Perplexity.
3. Signer avec un vrai certificat développeur Apple si disponible.

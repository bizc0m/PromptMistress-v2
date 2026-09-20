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
- Tests : `npm test` (`scripts/verify.mjs` + `scripts/test-extension.mjs`).
- Distribution : `dist/PromptMistress-0.2.0-macOS.zip` + `.dmg`.
- CI : `.github/workflows/build.yml`.
- Signature : `scripts/sign-and-notarize.sh`.

## Prochaine action
1. Tester l'extension dans Chrome/Firefox sur ChatGPT/Perplexity.
2. Signer avec un vrai certificat développeur Apple si disponible.

## Reprise après corrections A/B du 2026-09-20
- Voir REGRESSION.md R007–R009 pour les tests réels et STATE.md pour le périmètre terminé.
- Le serveur courant utilise `PROMPTMISTRESS_NO_AUTOIMPORT=1 npm start > /tmp/pm.log 2>&1` ; un prochain `npm start` normal relancera l’import automatique existant.
- Pour redémarrer ce serveur uniquement, cibler `pkill -f '^node scripts/server.mjs$'` : le motif large `server.mjs` correspond aussi aux services Codex sur ce Mac.
- Sauvegarde avant titres : `/Users/JOB/Documents/Codex/2026-09-20/referenced-chatgpt-conversation-this-is-an-2/work/pre-title-fix/node-vault`.
- L’app distribuée n’a pas été reconstruite ; validation dans Chrome du serveur du dépôt.
- C reste hors périmètre ; ne pas installer l’extension à la reprise sans nouvelle demande.

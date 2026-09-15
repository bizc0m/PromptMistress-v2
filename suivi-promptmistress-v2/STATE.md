# PromptMistress V2 — État

## Session en cours
- **Démarrée** : 2026-09-15
- **Itération** : 2
- **prompt_count** : 2
- **Dernier focus** : finalisation V2

## État actuel
- Repo : `main`, remote `https://github.com/bizc0m/PromptMistress-v2`.
- App buildée et installée : `~/.promptmistress-v2/PromptMistress.app`.
- Serveur actif sur http://127.0.0.1:18431/ ; Node + Python démarrés.
- Node embarqué dans le bundle.
- Python embarqué via distribution standalone installée par `uv` (3.13).
- Extension navigateur créée dans `browser-extension/`.
- Script de build automatisé `scripts/build.sh` générant `.app`, `.zip`, `.dmg`.
- Tests de non-régression dans `scripts/verify.mjs`.
- Documentation dans `docs/INSTALL.md`.

## Reste à faire
1. Pousser les commits sur GitHub.
2. Valider l'extension dans un navigateur réel (ChatGPT/Perplexity).
3. Obtenir un certificat développeur Apple pour une signature officielle.

## Version
- Courante : 0.2.0
- Prochaine : 0.2.1 après validation externe

# PromptMistress V2 — État

## Session en cours
- **Démarrée** : 2026-09-15
- **Itération** : 2
- **prompt_count** : 3
- **Dernier focus** : 2026-09-20 — points 1–4 vérifiés, titres A/B corrigés sur main

## État actuel
- Repo : `main`, remote `https://github.com/bizc0m/PromptMistress-v2`.
- App buildée et installée : `~/.promptmistress-v2/PromptMistress.app`.
- Serveur actif sur http://127.0.0.1:18431/ ; Node + Python démarrés.
- Node embarqué dans le bundle.
- Python embarqué via distribution standalone installée par `uv` (3.13).
- Extension navigateur créée dans `browser-extension/`.
- Script de build automatisé `scripts/build.sh` générant `.app`, `.zip`, `.dmg`.
- Tests de non-régression dans `scripts/verify.mjs` + test unitaire extension.
- Workflow GitHub Actions `.github/workflows/build.yml`.
- Script signature/notarisation `scripts/sign-and-notarize.sh`.
- Documentation dans `docs/INSTALL.md`.

## Reste à faire
1. Valider l'extension dans un navigateur réel (ChatGPT/Perplexity) → v0.2.1+ après tests.
2. Obtenir un certificat développeur Apple pour une signature/notarisation officielle.

## Version
- Courante : 0.2.0 (extension marquée BETA, mode dev nécessaire)
- Prochaine : 0.2.1 après validation extension réelle
- Roadmap : 0.3.0 avec extension signée + Apple cert optionnel

## Vérification du 2026-09-20
- M5.lan ; dépôt local sur main ; tests réalisés dans Chrome sur le serveur du dépôt, pas dans le bundle installé.
- Points 1–4 validés ; détails et limites : REGRESSION.md R007–R009.
- A : titres générés invalides ignorés ; commit `ad580d5`. B : date/heure UTC en tête des titres de conversations Claude.
- Serveur courant lancé avec `PROMPTMISTRESS_NO_AUTOIMPORT=1` pour préserver les données pendant les corrections ciblées ; ceci ne modifie pas la configuration persistante.
- Aucun push ; C (installation d’extension) non traité.

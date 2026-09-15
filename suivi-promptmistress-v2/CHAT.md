# PromptMistress V2 — Historique chat

## 2026-09-14 — Reprise finalisation V2
- Demande : finaliser PromptMistress V2 (Python embarqué, GitHub, tri actif, recherche Importer, drag & drop, tests).
- État constaté : repo propre, 3 commits locaux, app lancée, Node embarqué, Python via `/usr/bin/python3`.
- Suivi projet initialisé dans `suivi-promptmistress-v2/`.
- Décision : traiter dans l'ordre — suivi → Python embarqué → UI → GitHub → tests.

## 2026-09-15 — Finalisation complète
- Demande : créer extension navigateur, bookmarklet, tests, build, sign, dmg, doc.
- Actions réalisées :
  - Correction de `scripts/capture-ui.js` (éléments `install-bookmarklet` inexistants supprimés).
  - Création de l'extension `browser-extension/` (manifest V3, content script, popup, icônes, README).
  - Création de `scripts/build.sh` : compile Swift, embarque Node + Python standalone via uv, signe ad-hoc, installe, génère `.zip` + `.dmg`.
  - Création de `scripts/verify.mjs` : tests de non-régression serveur/app/distribution/extension.
  - Création de `docs/INSTALL.md`.
  - Mise à jour de `Features.md`, `todo.md`, `REGRESSION.md`, `STATE.md`, `MEMORY.md`.
- Tests : `npm test` → PASS.
- Build validé : app installée, `/health` ready:true.
- Reste : push GitHub, test navigateur réel, certificat développeur officiel.

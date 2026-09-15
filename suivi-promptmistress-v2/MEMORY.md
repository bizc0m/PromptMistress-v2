# PromptMistress V2 — Mémoire projet

## Identité
- **Nom** : PromptMistress V2
- **Type** : App macOS autonome + interface web unifiée
- **Repo local** : `/Users/JOB/#DEV/01-projets/_applications/PromptMistress-v2`
- **Repo GitHub** : https://github.com/bizc0m/PromptMistress-v2
- **Canal** : Dev (intégration propre)
- **Version cible** : 0.2.0

## Objectif
Fusionner les sources de conversations/prompts (Codex Exporter, Prompt Vault Node, Prompt Vault Python) en une bibliothèque unifiée, avec import propre depuis ChatGPT/Perplexity, gestion des tags/dossiers et app macOS autonome.

## Architecture
- **Frontend** : HTML/CSS/JS vanilla, onglets dans `index.html`
- **Serveur principal** : Node.js 20+, `scripts/server.mjs` (port 18431)
- **Module Node** : `projects/project-a-chatvault/pv.js` (port dynamique)
- **Module Python** : `projects/project-b-python-prompt-vault/src/prompt_vault/ui/server.py` (port dynamique)
- **Données** : `~/.promptmistress-v2/archives/sources.json`
- **App bundle** : `~/.promptmistress-v2/PromptMistress.app`
- **Lanceur** : binaire Swift Cocoa + WKWebView (`native/PromptMistress.swift`)
- **Extension navigateur** : `browser-extension/` (manifest V3)
- **Build** : `scripts/build.sh` (Swift, Node, Python via uv, sign, zip, dmg)
- **Tests** : `scripts/verify.mjs`

## Fichiers critiques
- `index.html` : cockpit à onglets
- `capture.html` + `scripts/capture-ui.js` : import ChatGPT/Perplexity
- `workspace.html` + `scripts/workspace-ui.js` + `styles/workspace.css` : bibliothèque unifiée
- `scripts/server.mjs` : orchestration des modules
- `scripts/build.sh` : build automatisé
- `browser-extension/manifest.json` : extension navigateur

## Contraintes
- Pas de framework frontend lourd.
- Node embarqué dans le bundle (`PromptMistress.app/Contents/Resources/bin/node`).
- Python embarqué via distribution standalone (`PromptMistress.app/Contents/Resources/Python3`).
- App autonome : l'utilisateur final ne doit pas installer Node/Python.
- Signature ad-hoc par défaut ; identité développeur configurable.

## Décisions
- Les annotations (tags, dossiers, statuts) sont stockées dans `localStorage` du navigateur ; les sources restent intactes.
- Les dossiers sont virtuels (attribut `folders` des annotations).
- Python est embarqué avec `uv python install` pour obtenir une distribution relocatable et standalone.
- L'extension navigateur remplace le bookmarklet ; le bookmarklet reste maintenu comme fallback.

## Références
- PromptMistress V1 (source Swift) : `/Users/JOB/#DEV/01-projets/_applications/PromptMistress/native/PromptMistress.swift`
- Python standalone builds : https://github.com/astral-sh/python-build-standalone

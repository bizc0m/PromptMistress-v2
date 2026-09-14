# PromptMistress V2 — Mémoire projet

## Identité
- **Nom** : PromptMistress V2
- **Type** : App macOS autonome + interface web unifiée
- **Repo local** : `/Users/JOB/#DEV/01-projets/_applications/PromptMistress-v2`
- **Canal** : Dev (en cours d'intégration)
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

## Fichiers critiques
- `index.html` : cockpit à onglets
- `capture.html` + `scripts/capture-ui.js` : import ChatGPT/Perplexity
- `workspace.html` + `scripts/workspace-ui.js` + `styles/workspace.css` : bibliothèque unifiée
- `scripts/server.mjs` : orchestration des modules

## Contraintes
- Pas de framework frontend lourd.
- Node embarqué dans le bundle (`PromptMistress.app/Contents/Resources/bin/node`).
- Python doit être embarqué pour ne plus dépendre de `/usr/bin/python3`.
- App autonome : l'utilisateur final ne doit pas installer Node/Python.

## Décisions
- Les annotations (tags, dossiers, statuts) sont stockées dans `localStorage` du navigateur ; les sources restent intactes.
- Les dossiers sont virtuels (attribut `folders` des annotations).

## Références
- PromptMistress V1 (source Swift) : `/Users/JOB/#DEV/01-projets/_applications/PromptMistress/native/PromptMistress.swift`

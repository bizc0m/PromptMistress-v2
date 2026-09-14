# PromptMistress V2 — Setup / Build

## Développement
1. `cd /Users/JOB/#DEV/01-projets/_applications/PromptMistress-v2`
2. `node scripts/server.mjs` (nécessite Node ≥ 20 et Python 3 dispo)
3. Ouvrir http://127.0.0.1:18431/

## Build app macOS
1. Compiler le lanceur Swift : `swiftc native/PromptMistress.swift -o PromptMistress.app/Contents/MacOS/PromptMistress`
2. Copier les sources dans `PromptMistress.app/Contents/Resources/app/`
3. Copier Node embarqué dans `PromptMistress.app/Contents/Resources/bin/node`
4. Copier Python embarqué dans `PromptMistress.app/Contents/Resources/bin/python3`
5. Éditer `PromptMistress.app/Contents/Resources/Runtime.plist` :
   - `node` → chemin vers `bin/node`
   - `python` → chemin vers `bin/python3`
   - `data` → `~/.promptmistress-v2/archives`
   - `log` → `~/.promptmistress-v2/PromptMistress.log`
6. Copier l'app dans `~/.promptmistress-v2/PromptMistress.app`

## Lancement
`open ~/.promptmistress-v2/PromptMistress.app`

## Santé
`curl -s http://127.0.0.1:18431/health`

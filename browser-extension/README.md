# PromptMistress Capturer — Extension navigateur

Extension Chrome / Edge / Firefox (mode développeur) pour capturer les conversations ChatGPT et Perplexity dans l'app PromptMistress locale.

## Prérequis

- L'app PromptMistress doit être lancée sur le Mac (`http://127.0.0.1:18431`).
- Être connecté sur [chatgpt.com](https://chatgpt.com) ou [perplexity.ai](https://www.perplexity.ai).

## Installation Chrome / Edge

1. Ouvrez `chrome://extensions/` (ou `edge://extensions/`).
2. Activez le **Mode développeur** en haut à droite.
3. Cliquez sur **Charger l'extension non empaquetée**.
4. Sélectionnez ce dossier `browser-extension`.

## Installation Firefox (temporaire)

1. Ouvrez `about:debugging` → **Ce Firefox** → **Charger un module complémentaire temporaire**.
2. Sélectionnez `browser-extension/manifest.json`.

## Utilisation

1. Ouvrez ChatGPT ou Perplexity.
2. Cliquez sur le bouton **PM** flottant en bas à droite, ou sur l'icône de l'extension puis **Capturer cet onglet**.
3. PromptMistress s'ouvre dans un nouvel onglet, récupère la liste des conversations, puis importe celles sélectionnées.

## Fichiers

- `manifest.json` : déclaration de l'extension.
- `content.js` : injecté sur ChatGPT/Perplexity, ajoute le bouton flottant et gère le pont avec PromptMistress.
- `background.js` : service worker, ouvre PromptMistress ou déclenche la capture.
- `popup.html/js/css` : petite popup d'aide.
- `icons/` : icônes de l'extension.

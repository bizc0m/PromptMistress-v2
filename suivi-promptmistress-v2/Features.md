# PromptMistress V2 — Features

## Validées
- F001 — Onglet Importer dédié : capture depuis ChatGPT/Perplexity + import JSON. `capture.html`, `scripts/capture-ui.js`.
- F002 — Actions Masquer/Archiver par ligne dans la Bibliothèque. `scripts/workspace-ui.js`.
- F003 — Tags favoris avec couleurs personnalisables (10 max). `scripts/workspace-ui.js`, `workspace.html`.
- F004 — Node embarqué dans le bundle macOS.
- F005 — Python embarqué dans le bundle macOS via `uv`.
- F006 — Indicateur visuel de tri actif sur les headers de colonnes.
- F007 — Recherche full-text dans l'onglet Importer.
- F008 — Glisser-déposer un élément sur un dossier.
- F009 — Extension navigateur Chrome/Firefox pour remplacer le bookmarklet. `browser-extension/`.
- F010 — Script de build automatisé reproduisant l'app + `.dmg` + `.zip`. `scripts/build.sh`.
- F011 — Tests de non-régression. `scripts/verify.mjs`.

## Format
`- = YYYY-MM-DD | Nom | statut | chemin`

## Détail
### F001 — Onglet Importer
- Date : 2026-09-10
- Statut : validé
- Fichiers : `capture.html`, `scripts/capture-ui.js`, `scripts/shell-capture.js`
- Fonctionnement : favori bookmarklet, drop JSON, sélection de conversations, import dans vault.

### F002 — Masquer / Archiver par ligne
- Date : 2026-09-14
- Statut : validé
- Fichiers : `scripts/workspace-ui.js`, `styles/workspace.css`
- Fonctionnement : boutons 🚫 / 📦 sur chaque ligne ; modifie `visibility` dans les annotations locales.

### F003 — Tags favoris
- Date : 2026-09-14
- Statut : validé
- Fichiers : `scripts/workspace-ui.js`, `workspace.html`
- Fonctionnement : dialogue de gestion, 10 tags max avec couleur, click rapide pour ajouter à la fiche.

### F009 — Extension navigateur
- Date : 2026-09-15
- Statut : validé
- Fichiers : `browser-extension/manifest.json`, `browser-extension/content.js`, `browser-extension/popup.html`
- Fonctionnement : content script sur ChatGPT/Perplexity, bouton flottant PM, pont postMessage avec PromptMistress.
- Combos : s'utilise avec F001 pour importer sans bookmarklet.

### F010 — Build automatisé
- Date : 2026-09-15
- Statut : validé
- Fichiers : `scripts/build.sh`, `package.json`
- Fonctionnement : compile Swift, embarque Node + Python standalone, signe, installe, génère `.zip` et `.dmg`.
- Combos : avec F004/F005 pour une app totalement autonome.

### F011 — Tests de non-régression
- Date : 2026-09-15
- Statut : validé
- Fichiers : `scripts/verify.mjs`
- Fonctionnement : vérifie serveur, app bundle, distribution, bookmarklets, extension.

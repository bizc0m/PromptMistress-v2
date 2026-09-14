# PromptMistress V2 — Features

## Validées
- F001 — Onglet Importer dédié : capture depuis ChatGPT/Perplexity + import JSON. `capture.html`, `scripts/capture-ui.js`.
- F002 — Actions Masquer/Archiver par ligne dans la Bibliothèque. `scripts/workspace-ui.js`.
- F003 — Tags favoris avec couleurs personnalisables (10 max). `scripts/workspace-ui.js`, `workspace.html`.
- F004 — Node embarqué dans le bundle macOS.

## En cours
- F005 — Python embarqué dans le bundle macOS.
- F006 — Indicateur visuel de tri actif sur les headers de colonnes.
- F007 — Recherche full-text dans l'onglet Importer.
- F008 — Glisser-déposer un élément sur un dossier.

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

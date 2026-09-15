# PromptMistress V2 — Installation & Build

## Utilisateur final — installation rapide

1. Téléchargez la dernière release :
   - `PromptMistress-0.2.0-macOS.dmg` (recommandé)
   - ou `PromptMistress-0.2.0-macOS.zip`
2. Ouvrez le `.dmg`, glissez `PromptMistress.app` dans **Applications**.
3. Lancez l'application.
4. Ouvrez <http://127.0.0.1:18431/> dans votre navigateur, ou utilisez l'interface Cocoa intégrée.

> **macOS Gatekeeper** : la première version est signée ad-hoc. Faites un clic droit → **Ouvrir** si le système bloque, ou allez dans **Préférences Système → Sécurité** pour autoriser.

## Prérequis développeur

- macOS 13+
- [Node.js](https://nodejs.org/) ≥ 20
- [Xcode](https://developer.apple.com/xcode/) (ou Command Line Tools) pour `swiftc`
- [uv](https://docs.astral.sh/uv/) pour embarquer un Python standalone (optionnel mais recommandé)
- `codesign`, `hdiutil`, `zip` (fournis par macOS)

## Build depuis les sources

```bash
cd /Users/JOB/#DEV/01-projets/_applications/PromptMistress-v2
./scripts/build.sh [version]
```

Le script :
- compile le lanceur Swift ;
- copie les sources web dans le bundle ;
- embarque Node (binaire courant) ;
- embarque un Python standalone via `uv` (défaut : 3.13) ;
- signe l'app (ad-hoc par défaut) ;
- installe dans `~/.promptmistress-v2/PromptMistress.app` ;
- génère `.zip` et `.dmg` dans `dist/`.

### Variables d'environnement

| Variable | Description |
|----------|-------------|
| `PROMPTMISTRESS_NODE` | Chemin du binaire Node à embarquer. |
| `PROMPTMISTRESS_PYTHON_VERSION` | Version Python à installer via uv (défaut : `3.13`). |
| `PROMPTMISTRESS_PYTHON_FRAMEWORK` | Chemin d'un `Python.framework` alternatif à copier (désactive uv). |
| `PROMPTMISTRESS_SIGN_IDENTITY` | Identité codesign (`-` = ad-hoc). |
| `PROMPTMISTRESS_SKIP_DMG` | Si non vide, ne génère pas le `.dmg`. |

### Exemple avec une identité développeur

```bash
PROMPTMISTRESS_SIGN_IDENTITY="Developer ID Application: Mon Nom" \
  ./scripts/build.sh 0.2.0
```

## Lancement en mode développement (sans build app)

```bash
cd /Users/JOB/#DEV/01-projets/_applications/PromptMistress-v2
node scripts/server.mjs
```

Puis ouvrez <http://127.0.0.1:18431/>.

## Extension navigateur

1. Ouvrez Chrome/Edge : `chrome://extensions/` (ou `edge://extensions/`).
2. Activez le **Mode développeur**.
3. Cliquez sur **Charger l'extension non empaquetée**.
4. Sélectionnez le dossier `browser-extension`.

Sur Firefox : `about:debugging` → **Charger un module complémentaire temporaire** → `browser-extension/manifest.json`.

## Bookmarklet (alternative à l'extension)

Dans l'onglet **Importer** de PromptMistress, glissez le favori **PM Capturer →** dans votre barre de favoris, puis utilisez-le sur ChatGPT ou Perplexity.

## Tests de non-régression

```bash
npm test
# ou
node scripts/verify.mjs
```

## Dépannage

- **Module Python indisponible** : vérifiez que `~/.promptmistress-v2/PromptMistress.app/Contents/Resources/Python3/bin/python3` existe et s'exécute.
- **Port déjà utilisé** : fermez l'app ou modifiez `PORT` / `PROMPTMISTRESS_MODULE_PORT`.
- **Erreur Gatekeeper** : `xattr -dr com.apple.quarantine /Applications/PromptMistress.app`.

## Données

Les sources sont lues depuis `~/.promptmistress-v2/archives/sources.json`. Les annotations restent dans le stockage local du navigateur ; les fichiers sources ne sont jamais modifiés.

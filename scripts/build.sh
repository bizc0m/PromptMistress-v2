#!/usr/bin/env bash
set -euo pipefail

# Build automatisé de PromptMistress.app (macOS)
# Usage : ./scripts/build.sh [version]
# Variables d'environnement :
#   PROMPTMISTRESS_NODE             chemin du binaire Node à embarquer
#   PROMPTMISTRESS_PYTHON_FRAMEWORK chemin du Python.framework à embarquer
#   PROMPTMISTRESS_SIGN_IDENTITY    identité codesign ("-" pour ad-hoc)
#   PROMPTMISTRESS_SKIP_DMG         si non vide, ne crée pas le .dmg

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VERSION="${1:-0.2.0}"
APP_NAME="PromptMistress"
APP_BUNDLE="${APP_NAME}.app"
BUILD_ROOT="${PROJECT_DIR}/dist/build"
DIST_DIR="${PROJECT_DIR}/dist"
INSTALL_DIR="${HOME}/.promptmistress-v2"

SIGN_IDENTITY="${PROMPTMISTRESS_SIGN_IDENTITY:--}"

NODE_BIN="${PROMPTMISTRESS_NODE:-$(command -v node)}"
PYTHON_VERSION="${PROMPTMISTRESS_PYTHON_VERSION:-3.13}"
PYTHON_FRAMEWORK="${PROMPTMISTRESS_PYTHON_FRAMEWORK:-}"
USE_UV=true
if [[ -n "$PYTHON_FRAMEWORK" ]]; then
  USE_UV=false
fi

RED='\033[0;31m'
GRN='\033[0;32m'
YEL='\033[1;33m'
RST='\033[0m'

log() { echo -e "${GRN}[build]${RST} $*"; }
warn() { echo -e "${YEL}[warn]${RST} $*"; }
err() { echo -e "${RED}[err]${RST} $*" >&2; }

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "$1 est requis mais introuvable."
    exit 1
  fi
}

require node
require python3
require swiftc
require codesign
require hdiutil
require zip

if [[ ! -x "$NODE_BIN" ]]; then
  err "Node introuvable ou non exécutable : $NODE_BIN"
  exit 1
fi

if [[ "$USE_UV" != true && ! -d "$PYTHON_FRAMEWORK" ]]; then
  err "Python.framework introuvable : $PYTHON_FRAMEWORK"
  exit 1
fi

log "Version : $VERSION"
log "Node    : $NODE_BIN"
log "Python  : $PYTHON_FRAMEWORK"
log "Sign    : $SIGN_IDENTITY"

# Nettoyage
rm -rf "$BUILD_ROOT"
mkdir -p "$BUILD_ROOT" "$DIST_DIR"

# Structure bundle
APP_DIR="${BUILD_ROOT}/${APP_BUNDLE}"
mkdir -p "${APP_DIR}/Contents/MacOS"
mkdir -p "${APP_DIR}/Contents/Resources/app"
mkdir -p "${APP_DIR}/Contents/Resources/bin"
mkdir -p "${APP_DIR}/Contents/Frameworks"

# Info.plist
log "Création Info.plist"
cat > "${APP_DIR}/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>fr</string>
  <key>CFBundleExecutable</key>
  <string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key>
  <string>com.bizc0m.promptmistress</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${APP_NAME}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${VERSION}</string>
  <key>CFBundleVersion</key>
  <string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

# Compilation Swift
log "Compilation Swift"
swiftc "${PROJECT_DIR}/native/PromptMistress.swift" \
  -o "${APP_DIR}/Contents/MacOS/${APP_NAME}"

# Copie des sources web
log "Copie des sources web"
rsync -a --exclude='.git' --exclude='dist' --exclude='backups' --exclude='*.bak' \
  "${PROJECT_DIR}/" "${APP_DIR}/Contents/Resources/app/"

# Node embarqué
log "Copie de Node"
cp "$NODE_BIN" "${APP_DIR}/Contents/Resources/bin/node"
chmod +x "${APP_DIR}/Contents/Resources/bin/node"

# Python embarqué
PY_DIR="${APP_DIR}/Contents/Resources/Python3"
mkdir -p "${APP_DIR}/Contents/Frameworks"
if [[ "$USE_UV" == true ]]; then
  require uv
  log "Installation d'un Python standalone via uv ($PYTHON_VERSION)"
  UV_PY_ROOT="${BUILD_ROOT}/uv-python"
  rm -rf "$UV_PY_ROOT"
  uv python install "$PYTHON_VERSION" --install-dir "$UV_PY_ROOT" --quiet
  INSTALLED_PY=$(find "$UV_PY_ROOT" -maxdepth 1 -type d -name 'cpython-*' | head -1)
  if [[ -z "$INSTALLED_PY" ]]; then
    err "uv n'a pas pu installer Python $PYTHON_VERSION"
    exit 1
  fi
  cp -R "$INSTALLED_PY" "$PY_DIR"
else
  log "Copie du Python.framework fourni"
  cp -R "$PYTHON_FRAMEWORK" "$PY_DIR"
fi
PY_EXE="$(find "$PY_DIR/bin" -maxdepth 1 -type f \( -name 'python3' -o -name "python${PYTHON_VERSION}" \) | head -1)"
if [[ ! -x "$PY_EXE" ]]; then
  err "python3 introuvable dans le bundle embarqué : $PY_DIR/bin"
  exit 1
fi
ln -sf "$(basename "$PY_EXE")" "${PY_DIR}/bin/python3" 2>/dev/null || true

# Alléger l'embarquage Python (inutiles pour PromptMistress)
rm -rf "${PY_DIR}/lib/tcl"* "${PY_DIR}/lib/tk"* "${PY_DIR}/lib/tcl8"* "${PY_DIR}/lib/tk8"* \
       "${PY_DIR}/share" "${PY_DIR}/include" "${PY_DIR}/lib/pkgconfig" 2>/dev/null || true
# Ne garder que python3 et python3.x
for f in "${PY_DIR}/bin"/*; do
  case "$(basename "$f")" in
    python3|python${PYTHON_VERSION}) ;;
    *) rm -f "$f" ;;
  esac
done

# Runtime.plist
log "Création Runtime.plist"
mkdir -p "${INSTALL_DIR}/archives"
mkdir -p "${INSTALL_DIR}/logs"
cat > "${APP_DIR}/Contents/Resources/Runtime.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>node</key>
  <string>${APP_DIR}/Contents/Resources/bin/node</string>
  <key>python</key>
  <string>${PY_DIR}/bin/python3</string>
  <key>data</key>
  <string>${INSTALL_DIR}/archives</string>
  <key>log</key>
  <string>${INSTALL_DIR}/logs/PromptMistress.log</string>
</dict>
</plist>
EOF

# Signature
log "Signature codesign — identity: $SIGN_IDENTITY"
if [[ "$SIGN_IDENTITY" == "-" ]]; then
  # Ad-hoc : signature de l'app seulement, les sous-composants Python standalone
  # peuvent être rejetés par --deep.
  codesign --force --sign - "$APP_DIR" || warn "Signature ad-hoc partielle"
else
  codesign --force --deep --sign "$SIGN_IDENTITY" --timestamp=none "$APP_DIR" || {
    warn "Signature développeur échouée ; signature ad-hoc en secours"
    codesign --force --sign - "$APP_DIR" || true
  }
fi

# Installation locale
log "Installation dans ${INSTALL_DIR}"
rm -rf "${INSTALL_DIR}/${APP_BUNDLE}"
cp -R "$APP_DIR" "${INSTALL_DIR}/${APP_BUNDLE}"

# Régénérer Runtime.plist avec les chemins d'installation
INSTALLED_APP="${INSTALL_DIR}/${APP_BUNDLE}"
INSTALLED_PY="${INSTALLED_APP}/Contents/Resources/Python3/bin/python3"
cat > "${INSTALLED_APP}/Contents/Resources/Runtime.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>node</key>
  <string>${INSTALLED_APP}/Contents/Resources/bin/node</string>
  <key>python</key>
  <string>${INSTALLED_PY}</string>
  <key>data</key>
  <string>${INSTALL_DIR}/archives</string>
  <key>log</key>
  <string>${INSTALL_DIR}/logs/PromptMistress.log</string>
</dict>
</plist>
EOF

# .zip
ZIP_PATH="${DIST_DIR}/${APP_NAME}-${VERSION}-macOS.zip"
log "Création ${ZIP_PATH}"
rm -f "$ZIP_PATH"
(cd "$BUILD_ROOT" && zip -rq "$ZIP_PATH" "$APP_BUNDLE")

# .dmg
if [[ -z "${PROMPTMISTRESS_SKIP_DMG:-}" ]]; then
  DMG_PATH="${DIST_DIR}/${APP_NAME}-${VERSION}-macOS.dmg"
  DMG_TMP="${BUILD_ROOT}/dmg"
  log "Création ${DMG_PATH}"
  rm -rf "$DMG_TMP"
  mkdir -p "$DMG_TMP"
  cp -R "$APP_DIR" "$DMG_TMP/"
  ln -s /Applications "${DMG_TMP}/Applications"
  hdiutil create -volname "${APP_NAME} ${VERSION}" -srcfolder "$DMG_TMP" -ov -format UDZO "$DMG_PATH" >/dev/null
  rm -rf "$DMG_TMP"
else
  warn "Création du .dmg ignorée — PROMPTMISTRESS_SKIP_DMG"
fi

log "Build terminé."
log "App : ${INSTALL_DIR}/${APP_BUNDLE}"
log "Zip : ${DIST_DIR}/${APP_NAME}-${VERSION}-macOS.zip"
[[ -z "${PROMPTMISTRESS_SKIP_DMG:-}" ]] && log "Dmg : ${DMG_PATH}"
log "Pour lancer : open '${INSTALL_DIR}/${APP_BUNDLE}'"

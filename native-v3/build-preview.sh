#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
APP="$ROOT/dist/PromptMistress-V3-preview.app"
CHATDOMINA_PACKAGE="${CHATDOMINA_PACKAGE:-$ROOT/../NoteMistress/modules/CHATDomina}"
if [[ ! -f "$CHATDOMINA_PACKAGE/Package.swift" ]]; then
  echo "CHATDomina introuvable : définissez CHATDOMINA_PACKAGE vers son module Swift." >&2
  exit 1
fi
swift build --package-path "$CHATDOMINA_PACKAGE" --product chatdomina -c release >/dev/null
CHATDOMINA_BIN="$(swift build --package-path "$CHATDOMINA_PACKAGE" -c release --show-bin-path)/chatdomina"
if [[ ! -x "$CHATDOMINA_BIN" ]]; then
  echo "Binaire CHATDomina absent après compilation." >&2
  exit 1
fi
mkdir -p "$APP/Contents/MacOS"
mkdir -p "$APP/Contents/Resources/bin" "$APP/Contents/Resources/app/native-v3" "$APP/Contents/Resources/app/projects/project-a-chatvault" "$APP/Contents/Resources/app/projects/project-b-import" "$APP/Contents/Resources/app/scripts" "$APP/Contents/Resources/app/styles" "$APP/Contents/Resources/app/vendor/go-wasm" "$APP/Contents/Resources/app/vendor/NyxBoolean"
ICON_SOURCE="$ROOT/native-v3/assets/AppIcon.png"
ICONSET="$APP/Contents/Resources/AppIcon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -s format png -z "$size" "$size" "$ICON_SOURCE" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -s format png -z "$double" "$double" "$ICON_SOURCE" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
rm -r "$ICONSET"
cp "$ICON_SOURCE" "$APP/Contents/Resources/AppIcon.png"
PYTHON_RUNTIME="${PROMPTMISTRESS_PYTHON_RUNTIME:-$HOME/.promptmistress-v2/PromptMistress.app/Contents/Resources/Python3}"
if [[ -d "$PYTHON_RUNTIME" ]]; then
  mkdir -p "$APP/Contents/Resources/Python3"
  rsync -a "$PYTHON_RUNTIME/" "$APP/Contents/Resources/Python3/"
fi
mkdir -p "$APP/Contents/Resources/app/projects/project-b-python-prompt-vault/src"
rsync -a "$ROOT/projects/project-b-python-prompt-vault/src/prompt_vault" "$APP/Contents/Resources/app/projects/project-b-python-prompt-vault/src/"
cp "$(command -v node)" "$APP/Contents/Resources/bin/node"
cp "$CHATDOMINA_BIN" "$APP/Contents/Resources/bin/chatdomina"
cp "$ROOT/native-v3/import-local.mjs" "$ROOT/native-v3/check-import-sources.mjs" "$ROOT/native-v3/import-file.mjs" "$ROOT/native-v3/import-stage.mjs" "$APP/Contents/Resources/app/native-v3/"
cp "$ROOT/native-v3/import-comet-perplexity.mjs" "$APP/Contents/Resources/app/native-v3/"
cp "$ROOT/native-v3/nyx-search.mjs" "$APP/Contents/Resources/app/native-v3/"
cp "$ROOT/vendor/go-wasm/wasm_exec.js" "$APP/Contents/Resources/app/vendor/go-wasm/"
cp "$ROOT/vendor/NyxBoolean/nyx-boolean.wasm" "$APP/Contents/Resources/app/vendor/NyxBoolean/"
cp "$ROOT/scripts/capture.mjs" "$ROOT/scripts/message-content.mjs" "$ROOT/scripts/attachments.mjs" "$ROOT/scripts/perplexity-capture.mjs" "$ROOT/scripts/preferences.mjs" "$APP/Contents/Resources/app/scripts/"
cp "$ROOT/projects/project-a-chatvault/pv.js" "$APP/Contents/Resources/app/projects/project-a-chatvault/"
cp "$ROOT/projects/project-a-chatvault/package.json" "$APP/Contents/Resources/app/projects/project-a-chatvault/"
sed 's|</head>|<link rel="stylesheet" href="../../styles/exporter-v3.css"></head>|' "$ROOT/projects/project-b-import/codex_history_public_import.html" > "$APP/Contents/Resources/app/projects/project-b-import/codex_history_public_import.html"
cp "$ROOT/native-v3/exporter-layout.css" "$APP/Contents/Resources/app/styles/exporter-v3.css"
sed 's|href="/styles/nyx.css"|href="styles/nyx.css"|' "$ROOT/fusion.html" > "$APP/Contents/Resources/app/fusion.html"
cp "$ROOT/styles/nyx.css" "$APP/Contents/Resources/app/styles/nyx.css"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>PromptMistress-V3-preview</string>
<key>CFBundleIdentifier</key><string>com.bizc0m.promptmistress.v3.preview</string>
<key>CFBundleName</key><string>PromptMistress V3 Preview</string>
<key>CFBundleIconFile</key><string>AppIcon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.3.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
swiftc "$ROOT/native-v3/ArchiveCore.swift" "$ROOT/native-v3/PromptTitle.swift" "$ROOT/native-v3/NativeWorkspace.swift" "$ROOT/native-v3/NativeChatReader.swift" "$ROOT/native-v3/NativeAnnotations.swift" "$ROOT/native-v3/NativeDrafts.swift" "$ROOT/native-v3/NativeDisplaySettings.swift" "$ROOT/native-v3/NativeImportPreferences.swift" "$ROOT/native-v3/V2StorageMigration.swift" "$ROOT/native-v3/NativeExport.swift" "$ROOT/native-v3/NativeChunkedExport.swift" "$ROOT/native-v3/NativeRules.swift" "$ROOT/native-v3/NativeViews.swift" "$ROOT/native-v3/NativeFavorites.swift" "$ROOT/native-v3/NativeOutputs.swift" "$ROOT/native-v3/NativeOutputBrowser.swift" "$ROOT/native-v3/NativeCodexExporter.swift" "$ROOT/native-v3/NativeFusionLab.swift" "$ROOT/native-v3/NativeImportPicker.swift" "$ROOT/native-v3/NativeStagePicker.swift" "$ROOT/native-v3/NativeBoolean.swift" "$ROOT/native-v3/LegacyBridge.swift" "$ROOT/native-v3/BrowserVisibleCapture.swift" "$ROOT/native-v3/BrowserAutoImporter.swift" "$ROOT/native-v3/ChatDominaBridge.swift" "$ROOT/native-v3/app/main.swift" -lsqlite3 -o "$APP/Contents/MacOS/PromptMistress-V3-preview"
codesign --force --sign - "$APP" >/dev/null
echo "$APP"

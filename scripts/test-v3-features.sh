#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
BIN="$(mktemp -t promptmistress-v3-features)"
trap 'rm -f "$BIN"' EXIT
swiftc "$ROOT/native-v3/ArchiveCore.swift" "$ROOT/native-v3/PromptTitle.swift" "$ROOT/native-v3/NativeWorkspace.swift" "$ROOT/native-v3/NativeAnnotations.swift" "$ROOT/native-v3/NativeDrafts.swift" "$ROOT/native-v3/NativeDisplaySettings.swift" "$ROOT/native-v3/NativeImportPreferences.swift" "$ROOT/native-v3/V2StorageMigration.swift" "$ROOT/native-v3/NativeExport.swift" "$ROOT/native-v3/NativeChunkedExport.swift" "$ROOT/native-v3/NativeRules.swift" "$ROOT/native-v3/NativeViews.swift" "$ROOT/native-v3/NativeFavorites.swift" "$ROOT/native-v3/NativeOutputs.swift" "$ROOT/native-v3/NativeBoolean.swift" "$ROOT/native-v3/LegacyBridge.swift" "$ROOT/native-v3/tests/features/main.swift" -lsqlite3 -o "$BIN"
PROMPTMISTRESS_TEST_ROOT="$ROOT" PROMPTMISTRESS_TEST_NODE="$(command -v node)" "$BIN"

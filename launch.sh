#!/usr/bin/env bash
# The app owns its local service and starts it once.
set -euo pipefail

APP_PATH="${PROMPTMISTRESS_APP_PATH:-${HOME}/.promptmistress-v2/PromptMistress.app}"
if [[ ! -d "$APP_PATH" ]]; then
  echo "PromptMistress.app introuvable : $APP_PATH" >&2
  echo "Construisez l'application avec ./scripts/build.sh avant de la lancer." >&2
  exit 1
fi

open "$APP_PATH"

#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
BROWSER="${1:---chrome}"
case "$BROWSER" in
  --chrome|--edge|--comet) ;;
  *) echo "Usage : $0 [--chrome|--edge|--comet]" >&2; exit 2 ;;
esac
EXTENSION_ID="$(tr -d '\n' < "$ROOT/native-v3/extension-id.txt")"
if [[ ! "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then echo 'Identifiant d’extension invalide.' >&2; exit 1; fi
if [[ -x "$HOME/.promptmistress-v2/PromptMistress.app/Contents/Resources/bin/node" ]]; then
  NODE="$HOME/.promptmistress-v2/PromptMistress.app/Contents/Resources/bin/node"
else
  NODE="$(command -v node)"
fi
HOST_DIR="$HOME/.promptmistress-v3/bin"
mkdir -p "$HOST_DIR"
HOST="$HOST_DIR/capture-host"
printf -v NODE_Q '%q' "$NODE"
printf -v SCRIPT_Q '%q' "$ROOT/native-v3/capture-host.mjs"
printf '#!/usr/bin/env bash\nexec %s %s\n' "$NODE_Q" "$SCRIPT_Q" > "$HOST"
chmod 700 "$HOST"
export HOST EXTENSION_ID BROWSER
python3 - <<'PY'
import json,os,pathlib
host=os.environ['HOST']; extension_id=os.environ['EXTENSION_ID']
manifest={'name':'com.bizc0m.promptmistress.v3','description':'PromptMistress V3 direct capture','path':host,'type':'stdio','allowed_origins':[f'chrome-extension://{extension_id}/']}
browser={'--chrome':'Google/Chrome','--edge':'Microsoft Edge','--comet':'Comet'}[os.environ['BROWSER']]
folder=pathlib.Path.home()/'Library/Application Support'/browser/'NativeMessagingHosts'
folder.mkdir(parents=True,exist_ok=True)
target=folder/'com.bizc0m.promptmistress.v3.json'
target.write_text(json.dumps(manifest,indent=2)+'\n')
print(target)
PY
echo "Pont natif V3 installé pour l’extension $EXTENSION_ID."

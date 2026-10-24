#!/bin/bash
# PromptMistress unified launcher — everything in one command
set -e

APP_PATH="${HOME}/.promptmistress/PromptMistress.app"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="/tmp/promptmistress-server.pid"
PORT=18431
TIMEOUT=10

# Check if servers already running
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "✓ Server already running (PID $PID)"
    open -a PromptMistress.app
    exit 0
  fi
fi

# Start servers
echo "Starting PromptMistress servers…"
cd "$REPO_DIR"
npm start > /dev/null 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > "$PID_FILE"

# Wait for server health check
echo "Waiting for server…"
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  if curl -s "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    echo "✓ Server ready"
    open -a PromptMistress.app
    exit 0
  fi
  sleep 0.5
  ELAPSED=$((ELAPSED + 1))
done

echo "✗ Server failed to start"
exit 1

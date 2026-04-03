#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! python3 - <<'PY'
import importlib.util, sys
sys.exit(0 if importlib.util.find_spec("PIL") else 1)
PY
then
  echo "[bootstrap] Pillow not found. Installing..."
  if ! python3 -m pip --version >/dev/null 2>&1; then
    python3 -m ensurepip --upgrade >/dev/null 2>&1 || true
  fi
  python3 -m pip install --user Pillow
fi

nohup node bot.js >> bot.log 2>&1 &
echo "Bot started with PID $!"

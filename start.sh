#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ensure_pip_available() {
  if python3 -m pip --version >/dev/null 2>&1; then
    return 0
  fi

  # Try stdlib bootstrap first.
  if python3 -m ensurepip --upgrade >/dev/null 2>&1 && python3 -m pip --version >/dev/null 2>&1; then
    return 0
  fi

  # If ensurepip is unavailable, try apt-get when running as root in Debian-like image.
  if command -v apt-get >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then
      echo "[bootstrap] pip missing. Installing python3-pip via apt-get..."
      export DEBIAN_FRONTEND=noninteractive
      if apt-get update >/dev/null 2>&1 \
        && apt-get install -y --no-install-recommends python3-pip >/dev/null 2>&1 \
        && python3 -m pip --version >/dev/null 2>&1
      then
        return 0
      fi
    else
      echo "[bootstrap] pip missing but current user is not root; skip apt-get install."
    fi
  fi

  return 1
}

if ! python3 - <<'PY'
import importlib.util, sys
sys.exit(0 if importlib.util.find_spec("PIL") else 1)
PY
then
  echo "[bootstrap] Pillow not found. Installing..."
  PIP_CMD=""
  if ensure_pip_available; then
    PIP_CMD="python3 -m pip"
  elif command -v pip3 >/dev/null 2>&1; then
    PIP_CMD="pip3"
  fi

  INSTALL_OK=0
  if [ -n "$PIP_CMD" ]; then
    if $PIP_CMD install --no-cache-dir --user Pillow >/dev/null 2>&1 \
      || $PIP_CMD install --no-cache-dir Pillow >/dev/null 2>&1
    then
      INSTALL_OK=1
    fi
  fi

  if [ "$INSTALL_OK" -eq 1 ]; then
    echo "[bootstrap] Pillow installed."
  else
    echo "[bootstrap] WARNING: Pillow install failed. Continue boot; map image mode will fallback to ASCII."
  fi
fi

echo "[bootstrap] dependencies ready, starting bot..."
exec node bot.js

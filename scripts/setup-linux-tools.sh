#!/usr/bin/env bash
# Prepare Linux-native tools/Python for openblock-desktop (obmpy + esptool).
# The repo often ships a Darwin (macOS) Python tree that cannot run on Linux.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/tools/Python"
if [[ -f "$PY/python3" ]] && file "$PY/python3" | grep -qi 'Mach-O'; then
  echo "Backing up Darwin Python tools -> tools/Python.darwin-bak"
  rm -rf "$PY.darwin-bak"
  mv "$PY" "$PY.darwin-bak"
fi
mkdir -p "$PY/bin"
if [[ ! -d "$PY/venv" ]]; then
  python3 -m venv "$PY/venv"
fi
"$PY/venv/bin/pip" install -q --upgrade pip
"$PY/venv/bin/pip" install -q 'esptool==4.8.1' pyserial
# Vendor obmpy from the Darwin tree if present, else fail with a hint.
OBMPY_SRC=""
if [[ -d "$PY.darwin-bak/lib/python3.8/site-packages/obmpy" ]]; then
  OBMPY_SRC="$PY.darwin-bak/lib/python3.8/site-packages/obmpy"
elif [[ -d "$ROOT/../openblock-link/node_modules" ]]; then
  :
fi
SP="$PY/venv/lib/python"*"/site-packages"
if [[ -n "$OBMPY_SRC" ]]; then
  cp -r "$OBMPY_SRC" $SP/
else
  echo "WARN: obmpy sources not found; copy tools/Python.darwin-bak/.../obmpy into venv site-packages"
fi
cat > "$PY/bin/python3" <<EOF
#!/bin/bash
exec "$PY/venv/bin/python3" "\$@"
EOF
chmod +x "$PY/bin/python3"
cat > "$PY/bin/esptool.py" <<EOF
#!/bin/bash
exec "$PY/bin/python3" -m esptool "\$@"
EOF
chmod +x "$PY/bin/esptool.py"
cat > "$PY/bin/obmpy" <<EOF
#!/bin/bash
exec "$PY/bin/python3" -m obmpy "\$@"
EOF
chmod +x "$PY/bin/obmpy"
# Sync BLE firmwares
FW_SRC="$ROOT/../firmware-esp32-ble/dist"
FW_DST="$ROOT/firmwares/microPython"
mkdir -p "$FW_DST"
if [[ -d "$FW_SRC" ]]; then
  cp -f "$FW_SRC"/esp32*-ble-openblock-*.bin "$FW_DST/" 2>/dev/null || true
fi
"$PY/bin/python3" -c "import obmpy, esptool, serial; print('linux tools OK')"
"$PY/bin/esptool.py" version | head -1
echo "Done. Ensure your user is in the dialout group: sudo usermod -aG dialout \$USER"

#!/bin/sh
# Run the desktop app from source on Linux/macOS. (The release build does not need this or Node.js.)
# For a server without a desktop, use: npm run build && HOST=0.0.0.0 node dist/app.cjs --no-open
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js 20+ is required: https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install || exit 1
[ -f dist/desktop.cjs ] || npm run build || exit 1
# Some tools (e.g. VS Code) set this for their own processes; it would start Electron as plain Node.
unset ELECTRON_RUN_AS_NODE
exec ./node_modules/.bin/electron . "$@"

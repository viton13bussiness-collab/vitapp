#!/bin/bash
# Builds dist/VITON13.app — a real macOS application with the VITON13 name and icon that runs this folder.
# Usage: npm run mac      (needs `npm install` first, for Electron)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/node_modules/electron/dist/Electron.app"
APP="$ROOT/dist/VITON13.app"
[ -d "$SRC" ] || { echo "Сначала выполните: npm install"; exit 1; }
rm -rf "$APP"; mkdir -p "$ROOT/dist"; cp -R "$SRC" "$APP"
PL="$APP/Contents/Info.plist"
plutil -replace CFBundleName -string "VITON13" "$PL"
plutil -replace CFBundleDisplayName -string "VITON13" "$PL"
plutil -replace CFBundleIdentifier -string "com.viton13.app" "$PL"
plutil -replace CFBundleShortVersionString -string "$(node -p "require('$ROOT/package.json').version")" "$PL"
plutil -replace NSMicrophoneUsageDescription -string "VIT слушает вас, когда вы нажимаете на микрофон." "$PL"
cp "$ROOT/electron/icon.icns" "$APP/Contents/Resources/electron.icns"
# the app is a thin shell: it runs the code and keeps the data of this folder, so an update is just `git pull`
mkdir -p "$APP/Contents/Resources/app"
cat > "$APP/Contents/Resources/app/package.json" <<JSON
{ "name": "viton13", "productName": "VITON13", "version": "$(node -p "require('$ROOT/package.json').version")", "main": "main.cjs" }
JSON
cat > "$APP/Contents/Resources/app/main.cjs" <<JS
process.env.VIT_DATA ||= $(node -p "JSON.stringify(require('path').join('$ROOT', 'data'))");
require($(node -p "JSON.stringify(require('path').join('$ROOT', 'electron', 'main.cjs'))"));
JS
rm -f "$APP/Contents/Resources/default_app.asar"
codesign --force --deep --sign - "$APP" >/dev/null 2>&1
touch "$APP"
echo "Готово: $APP"

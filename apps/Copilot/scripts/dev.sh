#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/DragonFruitMini.xcodeproj"
DERIVED_DATA="$ROOT/.build/xcode"
SCHEME="DragonFruitMini"

if ! xcodebuild -version >/dev/null 2>&1; then
  echo "Full Xcode is required to build the Copilot app bundle."
  echo "Open this project in Xcode instead: $PROJECT"
  open "$PROJECT"
  exit 1
fi

xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -derivedDataPath "$DERIVED_DATA" \
  build

APP_PATH="$(find "$DERIVED_DATA/Build/Products/Debug" -maxdepth 1 -name '*.app' -print -quit)"
if [[ -z "$APP_PATH" ]]; then
  echo "Build finished, but no .app bundle was found."
  exit 1
fi

open "$APP_PATH"
echo "Launched $APP_PATH"

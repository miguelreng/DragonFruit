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

# Sign with a stable local identity so macOS keeps permission grants (Screen
# Recording, Accessibility, microphone) across rebuilds. Ad-hoc signing changes
# the code hash on every build, so macOS treats each build as a new app and
# forgets the grants — which leaves permission onboarding stuck. Manual signing
# with a development certificate keeps a stable designated requirement, so the
# grants persist. Export CODE_SIGN_IDENTITY to override the auto-detected one.
SIGN_IDENTITY="${CODE_SIGN_IDENTITY:-}"
if [[ -z "$SIGN_IDENTITY" ]]; then
  SIGN_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | grep -oE '"Apple Development: [^"]+"' | head -1 | tr -d '"')"
fi
if [[ -z "$SIGN_IDENTITY" ]]; then
  SIGN_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | grep -oE '"[^"]+"' | head -1 | tr -d '"')"
fi

SIGN_ARGS=()
if [[ -n "$SIGN_IDENTITY" ]]; then
  echo "Signing with: $SIGN_IDENTITY"
  SIGN_ARGS=(CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY="$SIGN_IDENTITY" PROVISIONING_PROFILE_SPECIFIER="")
else
  echo "WARNING: no code-signing identity found — building ad-hoc."
  echo "macOS permission grants (Screen Recording, Accessibility, mic) will NOT survive rebuilds."
fi

xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -derivedDataPath "$DERIVED_DATA" \
  "${SIGN_ARGS[@]}" \
  build

APP_PATH="$(find "$DERIVED_DATA/Build/Products/Debug" -maxdepth 1 -name '*.app' -print -quit)"
if [[ -z "$APP_PATH" ]]; then
  echo "Build finished, but no .app bundle was found."
  exit 1
fi

open "$APP_PATH"
echo "Launched $APP_PATH"

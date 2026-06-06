#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/DragonFruitMini.xcodeproj"
DERIVED_DATA="$ROOT/.build/xcode"
SCHEME="DragonFruitMini"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

if ! xcodebuild -version >/dev/null 2>&1; then
  echo "Full Xcode is required to build the Copilot app bundle."
  echo "Open this project in Xcode instead: $PROJECT"
  open "$PROJECT"
  exit 1
fi

# Sign with a stable local identity so macOS keeps permission grants (Screen
# Recording, Accessibility, microphone) across rebuilds. Ad-hoc signing changes
# the code hash on every build, so macOS treats each build as a new app and
# forgets the grants, which leaves permission onboarding stuck. Manual signing
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
  echo "WARNING: no code-signing identity found - building ad-hoc."
  echo "macOS permission grants (Screen Recording, Accessibility, mic) will NOT survive rebuilds."
fi

xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -derivedDataPath "$DERIVED_DATA" \
  ENABLE_DEBUG_DYLIB=NO \
  "${SIGN_ARGS[@]}" \
  build

APP_PATH="$(find "$DERIVED_DATA/Build/Products/Debug" -maxdepth 1 -name '*.app' -print -quit)"
if [[ -z "$APP_PATH" ]]; then
  echo "Build finished, but no .app bundle was found."
  exit 1
fi

# macOS tracks TCC permission grants per (bundle id + code signature). A copy of
# Atlas already in /Applications shares this dev build's bundle id but has a
# different signature, so the system treats them as two apps. Grants to one
# don't apply to the other, which makes the permission flow look broken. Warn so
# the dev build is the only copy that owns sh.dragonfruit.copilot.
INSTALLED="/Applications/DragonFruit Atlas.app"
if [[ -d "$INSTALLED" ]]; then
  echo "WARNING: another copy of Atlas is installed at $INSTALLED."
  echo "         macOS tracks permissions per copy, so grants may not apply to this"
  echo "         dev build. Remove that copy, or reset grants and re-grant this one:"
  echo "           tccutil reset All sh.dragonfruit.copilot"
fi

if pgrep -x "DragonFruit Atlas" >/dev/null 2>&1; then
  echo "Stopping existing Atlas process..."
  pkill -x "DragonFruit Atlas" || true
  for _ in {1..30}; do
    pgrep -x "DragonFruit Atlas" >/dev/null 2>&1 || break
    sleep 0.2
  done
fi

if [[ -x "$LSREGISTER" ]]; then
  "$LSREGISTER" -f "$APP_PATH" >/dev/null 2>&1 || true
fi

open -g -n "$APP_PATH"
echo "Launched $APP_PATH"

# DragonFruit Atlas Native (Xcode Target)

This is the canonical native macOS app target (SwiftUI + MenuBarExtra). Use this `.app` bundle for real Atlas testing because macOS permissions are tied to the app bundle identifier.

- Stable bundle identifier: `sh.dragonfruit.copilot`
- DragonFruit native session sign-in
- Google Calendar OAuth start + callback (`ASWebAuthenticationSession`)
- URL scheme callback: `dragonfruitmini://auth/login-callback`
- Registered app hotkeys, not global keyboard monitors
- Microphone, speech recognition, and accessibility permission status
- Brand icon + Figtree fonts bundled locally

## Develop

From the repo root:

```sh
pnpm mac:dev
```

If the machine does not have full Xcode selected, open the project directly:

```sh
pnpm mac:open
```

Then select target `DragonFruitMini`, set Team/Signing in **Signing & Capabilities**, and run.

Do not use `swift run` for real hotkey, microphone, speech, or dictation testing. SwiftPM launches a debug executable, while these features need a stable `.app` identity.

## Hotkeys

- `Option Space`: create an action in DragonFruit from speech
- `Option Shift Space`: dictate into the focused input

## Required backend env vars

On VPS API:

- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI=dragonfruitmini://calendar/oauth/callback`

## Google Cloud OAuth

OAuth client type: **Web application** (backend exchange model)

Authorized redirect URI must include:

- `dragonfruitmini://calendar/oauth/callback`

If Google console rejects custom scheme for your current client policy, keep web redirect on backend and we'll switch this app to broker callback through `https://app.dragonfruit.sh/calendar/oauth/callback?app=mac`.

# DragonFruit Mini Native (Xcode Target)

This is a native macOS app target (SwiftUI + MenuBarExtra) with:

- DragonFruit email/password session sign-in
- Google Calendar OAuth start + callback (`ASWebAuthenticationSession`)
- URL scheme callback: `dragonfruitmini://calendar/oauth/callback`
- Brand icon + Figtree fonts bundled locally

## Open in Xcode

1. Open [DragonFruitMini.xcodeproj](./DragonFruitMini.xcodeproj)
2. Select target `DragonFruitMini`
3. Set Team/Signing in **Signing & Capabilities**
4. Run

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

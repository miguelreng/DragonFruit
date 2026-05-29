# DragonFruit Mobile

A **limited, consumption-focused** mobile client for DragonFruit, built with Expo
(React Native). It is intentionally _not_ a full editor — it reuses the existing
REST API and ships the slices that matter on a phone: inbox, your tasks, browsing
projects/cycles, and read-only docs.

> Heavy editing (the ProseMirror/Yjs doc editor) stays on web. The mobile app
> renders `description_html` for docs and never loads the editor.

## Status

| Milestone  | Scope                                                        | State         |
| ---------- | ------------------------------------------------------------ | ------------- |
| **M0**     | Scaffold: Expo Router, NativeWind, monorepo wiring           | ✅            |
| **M1**     | Auth handoff, secure token storage, workspace picker         | ✅            |
| **M2**     | Browse projects / cycles                                     | ✅            |
| **M3**     | My tasks + detail + light edits (state/comment/assign-to-me) | ✅            |
| M3.1       | Full multi-member assignee picker                            | ⬜            |
| **M4**     | Docs (read-only `description_html` via WebView)              | ✅            |
| **Widget** | iOS calendar widget (WidgetKit + App Group snapshot)         | ✅            |
| M5         | Inbox + push notifications                                   | ⬜ (deferred) |

## How auth works

There is **no separate mobile login**. We reuse the same native handoff the macOS
Copilot app uses:

1. `signIn()` opens an in-app browser at `${APP_HOST}/auth/native/start/?callback=dragonfruit://auth/callback`.
2. The backend reuses the web session (logging in there if needed), mints an
   `APIToken`, and redirects to `dragonfruit://auth/callback?api_token=…`.
3. We parse the token, store it in the device keychain (`expo-secure-store`), and
   send it as the `X-Api-Key` header on every request.

The `dragonfruit` URL scheme is whitelisted server-side in
`apps/api/plane/utils/path_validator.py` (`ALLOWED_NATIVE_REDIRECT_SCHEMES`).

## Running locally

From the **repo root** (single main checkout — not a worktree):

```bash
pnpm install
```

Then, because the custom-scheme auth redirect does **not** work in Expo Go, run a
**development build**:

```bash
# iOS (needs Xcode)
pnpm --filter mobile exec expo run:ios

# Android (needs Android Studio / SDK)
pnpm --filter mobile exec expo run:android
```

To just start the Metro bundler against an existing dev build:

```bash
pnpm --filter mobile start
```

### Pointing at a backend

Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL`. Use your machine's
LAN IP (not `localhost`) so the simulator/device can reach the API.

## Layout

```
src/
  app/                 # expo-router routes
    _layout.tsx        # SafeArea + SessionProvider + Stack
    (auth)/sign-in.tsx # sign-in screen (redirects out once authed)
    (app)/index.tsx    # workspace picker (redirects to sign-in if not authed)
  lib/
    config.ts          # host / API URL / auth scheme
    secure-store.ts    # keychain-backed token storage
    api.ts             # X-Api-Key fetch client + typed endpoints
    session.tsx        # auth handoff + session context
  components/
    loading-screen.tsx
```

## iOS calendar widget

A WidgetKit home-screen widget showing upcoming Google Calendar events, built
with [`@bacons/apple-targets`](https://github.com/EvanBacon/expo-apple-targets).

**Data flow (snapshot model):** the app fetches
`GET /api/users/me/calendar/upcoming-meetings/`, writes a compact JSON snapshot
into a shared **App Group** (`group.sh.dragonfruit.mobile`) via
`ExtensionStorage`, and reloads the widget. The SwiftUI widget only ever _reads_
that snapshot — no auth or networking in Swift. Refresh happens:

- on app launch + every return to the foreground (`useCalendarWidgetSync`), and
- via a periodic `expo-background-task` (~30 min, OS-throttled).

**Pieces:**

```
targets/widget/
  expo-target.config.js   # widget target + App Group entitlement
  index.swift             # WidgetKit: provider, views, bundle (read-only)
src/lib/
  calendar-widget.ts      # snapshot write + background task
  use-calendar-widget-sync.ts
```

### Build flag (free vs paid Apple account)

App Groups — which the widget relies on — require a **paid** Apple Developer
account. So the widget is **off by default** and gated behind
`EXPO_PUBLIC_WIDGET_ENABLED`. This keeps free / Personal-Team device builds
signable. The flag drives both the native config (`app.config.js` adds the
widget target + App Group entitlement) and the runtime sync
(`lib/calendar-widget.ts`).

| Target                | Command                                        | Widget?          | Cost                  |
| --------------------- | ---------------------------------------------- | ---------------- | --------------------- |
| Simulator             | `expo run:ios`                                 | ✅ (works free!) | Free                  |
| Device, free Apple ID | `expo prebuild -p ios --clean` → run           | ❌ (off)         | Free (7-day profiles) |
| Device, paid program  | `EXPO_PUBLIC_WIDGET_ENABLED=1 expo prebuild …` | ✅               | $99/yr                |

> The iOS **Simulator** doesn't enforce provisioning, so the widget runs there
> for free even though a physical-device widget needs the paid program.

**Other build notes (needs Xcode, can't run from this repo's CI sandbox):**

1. With the widget on, the App Group must be identical in three places:
   `app.config.js`, `targets/widget/expo-target.config.js`, and the `APP_GROUP`
   constant in `calendar-widget.ts` / `index.swift`.
2. Widgets never run in Expo Go — use a **dev build** (or the Simulator).
3. Add `ios.appleTeamId` to `app.json` for device signing.
4. The `expo-background-task` return value / registration API is the most likely
   spot to need a small tweak against the installed version — verify in the build.

## Conventions

- **Styling**: NativeWind (Tailwind v3 under the hood — distinct from the web
  app's Tailwind v4). Brand tokens live in `tailwind.config.js`.
- **Types**: response shapes are local for now; widen from `@plane/types` as
  richer features land (M2+).

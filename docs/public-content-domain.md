# Public content on `dragonfruit.page`

`dragonfruit.page` is the branded gateway for every public DragonFruit surface. It combines independently deployed
applications without exposing private application routes on the public domain.

## URL map

| Public URL                                             | Upstream application                  |
| ------------------------------------------------------ | ------------------------------------- |
| `https://dragonfruit.page/:workspace/doc/:slug`        | `apps/web` at `app.dragonfruit.sh`    |
| `https://dragonfruit.page/:workspace/wiki/:slug`       | `apps/web` at `app.dragonfruit.sh`    |
| `https://dragonfruit.page/:workspace/:page-type/:slug` | `apps/web` at `app.dragonfruit.sh`    |
| `https://dragonfruit.page/:workspace/calendar/:anchor` | `apps/space` through its Vercel alias |
| `https://dragonfruit.page/:workspace/project/:anchor`  | `apps/space` through its Vercel alias |
| `https://dragonfruit.page/api/public/*`                | Public-only API routes                |

`:workspace` is the readable workspace identifier used by the application, such as `rengi-media`. Supported page
types are `doc`, `wiki`, `whiteboard`, `pdf`, and `sheet`. Existing `/published/*`, `/spaces/*`,
`app.dragonfruit.sh`, and `spaces.dragonfruit.sh` links remain valid. New share links use the canonical gateway paths.

## Vercel projects

Create two additional Vercel projects from this repository:

1. **DragonFruit Space**
   - Root Directory: `apps/space`
   - Framework: React Router
   - Stable Vercel alias: `dragonfruit-space.vercel.app`
   - Optional operational domain: `spaces.dragonfruit.sh`
   - Build Command: `pnpm turbo run build --filter=space`
2. **DragonFruit Public Gateway**
   - Root Directory: `apps/public-gateway`
   - Framework: Other
   - Production domains: `dragonfruit.page`, `www.dragonfruit.page`
   - No build command is required.

The Space app enables Vercel's official React Router preset during Vercel builds. Docker and local builds continue
using the standard React Router server output. Its assets stay scoped below `/spaces`, so they cannot collide with the
published-document assets proxied from the web app.

## Production environment

Set these variables on both the web and Space Vercel builds:

```dotenv
VITE_API_BASE_URL=https://api.dragonfruit.sh
VITE_WEB_BASE_URL=https://app.dragonfruit.sh
VITE_SPACE_BASE_URL=https://dragonfruit.page
VITE_SPACE_BASE_PATH=/spaces
```

Set these variables on the API, worker, Beat, and migrator services that share Django settings:

```dotenv
SPACE_BASE_URL=https://dragonfruit.page
SPACE_BASE_PATH=/spaces/
CORS_ALLOWED_ORIGINS=https://app.dragonfruit.sh,https://dragonfruit.page,https://spaces.dragonfruit.sh
```

Keep every existing trusted origin in `CORS_ALLOWED_ORIGINS`; the example shows only the production web origins.
Public read-only requests do not require a session. If authenticated interaction is later enabled on public pages,
add `api.dragonfruit.page` as a second domain on the API service and use it as the Space app API origin.

The gateway exposes only `/api/public/*`. Browser reads on `dragonfruit.page` therefore remain same-origin without
opening private API routes on the public domain.

## DNS

Remove the old apex A records for `dragonfruit.page`, then create these records in Spaceship:

| Type | Host  | Value         |
| ---- | ----- | ------------- |
| A    | `@`   | `76.76.21.21` |
| A    | `www` | `76.76.21.21` |

These are the values Vercel currently reports for the attached domains. Recheck Vercel before changing them if this
document is used for a later migration.

The public gateway proxies Space through `dragonfruit-space.vercel.app`, so `spaces.dragonfruit.sh` is not required for
public links. It can remain attached as an operational domain; Vercel currently requests
`A spaces.dragonfruit.sh 76.76.21.21` if direct access to it is desired.

DNS and TLS are ready when all three checks succeed:

```bash
curl -I https://dragonfruit-space.vercel.app/spaces/
curl -I https://dragonfruit.page/rengi-media/doc/example
curl -I "https://dragonfruit.page/rengi-media/calendar/example?board=calendar"
```

The last two URLs can return `404` for nonexistent examples; they must return through Vercel with a valid TLS
certificate and must not time out.

## Rollout order

1. Deploy and verify `apps/space` on `dragonfruit-space.vercel.app`.
2. Set `VITE_SPACE_BASE_URL` and `VITE_SPACE_BASE_PATH` on the web and Space Vercel projects.
3. Set `SPACE_BASE_URL`, `SPACE_BASE_PATH`, and the CORS origin on the API services.
4. Deploy the Public Gateway and attach `dragonfruit.page`.
5. Replace the existing apex DNS records only after the gateway deployment is healthy.
6. Publish a test document and project calendar, then verify copying, opening, refresh, and mobile rendering.

This order keeps existing public links working throughout the migration.

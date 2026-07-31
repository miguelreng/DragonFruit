# DragonFruit public gateway

This Vercel project owns `dragonfruit.page` and keeps public content on one branded origin:

- `/:workspace/calendar/:anchor` serves a public project calendar.
- `/:workspace/project/:anchor` serves the other published project views.
- `/:workspace/:page-type/:slug` serves published docs, wikis, whiteboards, PDFs, and sheets.
- `/published/*` proxies published documents and wikis from the web app.
- `/spaces/*` proxies public project views and calendars from the Space app.
- `/api/public/*` forwards read-only public API requests without exposing private API routes.
- `/api/instances/` forwards the public instance bootstrap request so published pages stay same-origin.
- Web assets required by the published-document reader and its manifest are proxied from the web app.
- The root redirects to the private application.

Create this as a separate Vercel project with `apps/public-gateway` as its Root Directory and attach
`dragonfruit.page` plus `www.dragonfruit.page`. Configure `www` to redirect to the apex domain.

The Space upstream is its stable `dragonfruit-space.vercel.app` alias. `spaces.dragonfruit.sh` is optional and is not
required by the gateway. Preview deployments should continue using their own native URLs rather than this production
gateway.

The older `/published/*` and `/spaces/*` links remain available so existing shared URLs do not break.

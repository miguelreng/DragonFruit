# Plan 035: Finish and release `dragonfruit.page` publishing

> **Executor instructions**: Relevant work is already present in the working
> tree. Preserve it. First reconcile this plan with the live diff, then finish
> tests and deployment verification; do not restart the implementation.
>
> **Drift and dirty-state check (run first)**:
> `git status --short -- apps/public-gateway apps/space apps/web/helpers/page-public.ts apps/web/core/components/project/publish-project packages/constants/src/endpoints.ts docs/public-content-domain.md`
> Review every listed change before editing. Stop if ownership or intent of an
> existing change is unclear.

## Status

- **Priority**: P1
- **Effort**: S–M remaining
- **Risk**: MED — public URLs, DNS, and multiple deployments are involved
- **Depends on**: none
- **Category**: migration
- **Planned at**: commit `d2ca9cd196`, 2026-07-30; implementation already IN PROGRESS in the working tree

## Why this matters

The screenshot asks for `dragonfruit.page` in publish settings. The working tree
already adds canonical public Doc, Wiki, Calendar, and Project URLs plus a
public-only gateway. The remaining work is to prove fallback compatibility,
finish deployment configuration, and smoke the production domain without
breaking existing `/published/*` and `/spaces/*` links.

## Current state

- `apps/web/helpers/page-public.ts` builds
  `/:workspace/:contentType/:slug` on `dragonfruit.page` and keeps the legacy
  `/published/:workspace/:slug` route for local/non-public origins.
- `apps/web/core/components/project/publish-project/public-link.ts` builds
  canonical Project and Calendar URLs.
- `packages/constants/src/endpoints.ts` makes same-origin public API reads only
  for `dragonfruit.page` and `www.dragonfruit.page`.
- `apps/public-gateway/` and `apps/space/app/aliases/` are new, untracked
  implementation paths.
- `docs/public-content-domain.md` contains the URL map, environment variables,
  DNS instructions, rollout order, and curl checks.
- Focused URL tests already exist at
  `apps/web/helpers/page-public.test.ts` and
  `apps/web/core/components/project/publish-project/public-link.test.ts`.

## Commands you will need

| Purpose            | Command                                                                                                                                                                              | Expected on success |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | --------------------------- |
| URL tests          | `pnpm --filter=web test:unit -- --run apps/web/helpers/page-public.test.ts apps/web/core/components/project/publish-project/public-link.test.ts apps/web/helpers/public-api.test.ts` | all tests pass      |
| Web types          | `pnpm --filter=web check:types`                                                                                                                                                      | exit 0              |
| Space types/build  | `pnpm --filter=space check:types && pnpm --filter=space build`                                                                                                                       | exit 0              |
| Gateway inspection | `find apps/public-gateway -maxdepth 2 -type f -print                                                                                                                                 | sort`               | only intended gateway files |
| Full checks        | `pnpm check`                                                                                                                                                                         | exit 0              |

## Scope

**In scope**:

- `apps/public-gateway/**`
- `apps/space/app/aliases/**`
- `apps/space/vercel.json`
- `apps/web/helpers/page-public.ts` and its tests
- `apps/web/core/components/project/publish-project/public-link.ts` and tests
- `apps/web/core/components/project/publish-project/modal.tsx`
- `packages/constants/src/endpoints.ts`
- `docs/public-content-domain.md`
- Required workspace/deployment manifests already modified for this rollout

**Out of scope**:

- Moving authenticated private API routes onto the public domain.
- Removing legacy public URLs.
- Redesigning the public content readers.
- Changing DNS before both upstream deployments are healthy.

## Steps

### Step 1: Reconcile the existing implementation

Read the complete dirty diff for every in-scope file. Confirm the canonical map:

```text
/:workspace/doc/:slug       -> web published page
/:workspace/wiki/:slug      -> web published folder/wiki
/:workspace/:pageType/:slug -> web published typed page
/:workspace/project/:anchor -> Space project
/:workspace/calendar/:anchor -> Space calendar
/api/public/*               -> public-only API proxy
```

**Verify**: each path has exactly one gateway rewrite and no rewrite exposes a
private API prefix.

### Step 2: Complete URL and origin tests

Cover apex and `www`, trailing slashes, encoded workspace/slug values, local
fallbacks, unknown/non-public origins, and all supported page types. Add a
negative assertion that `/api/workspaces/*` is not proxied by the gateway.

**Verify**: focused URL tests pass.

### Step 3: Build both upstream applications

Run the Web and Space checks. Inspect generated asset paths to ensure Space
assets remain under `/spaces` and cannot collide with Web assets.

**Verify**: builds exit 0 and generated Space links retain the mounted base path.

### Step 4: Deploy in the documented order

Only after the user explicitly authorizes deployment:

1. deploy Space and verify its stable alias;
2. set the documented Web, Space, API, worker, Beat, and migrator variables;
3. deploy the public gateway;
4. attach `dragonfruit.page` and `www`;
5. change DNS only after both aliases are healthy.

Do not commit, push, deploy, or change DNS merely by executing this plan without
that explicit authorization.

### Step 5: Production smoke

Publish one Doc, one Wiki folder, one Project, and one Calendar. For each:
copy the link from settings, open signed-out, refresh a deep link, and test a
mobile viewport. Confirm legacy links still resolve.

## Execution evidence — 2026-07-30

- The four focused canonical URL/origin test files pass (12 tests), including
  the legacy local fallback.
- `@plane/space` typecheck and production build pass; emitted assets remain
  scoped to the Space mount path.
- `apps/public-gateway/api/public-proxy.mjs` passes Node syntax validation.
  Gateway rewrites remain limited to documented public content and instance
  configuration endpoints; private workspace API prefixes are not mapped.
- Global Web typecheck passes.
- No deployment, DNS, or production write was attempted because the user has
  not explicitly authorized those external changes.

## Done criteria

- [x] Focused URL/origin tests and package checks pass.
- [x] Gateway exposes only the documented public routes.
- [ ] Canonical links appear in publish/share settings.
- [ ] Four production content types pass signed-out, refresh, and mobile smoke.
- [ ] Legacy public links still work.
- [x] Deployment/DNS actions were performed only with explicit authorization.

## STOP conditions

- Existing dirty changes do not match the documented URL map.
- A gateway rule exposes non-public API routes.
- Space assets are emitted at `/assets` instead of the scoped `/spaces` path.
- A required environment value is unavailable.
- Deployment or DNS changes have not been explicitly authorized.

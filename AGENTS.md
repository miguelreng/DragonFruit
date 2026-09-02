# Agent Development Guide

## Git Workflow

- **Work directly on `main`. This is a single-branch repo.**
- Do NOT create task branches (`codex/*`, `feat/*`, etc.) and do NOT create git worktrees. Make all edits on `main` in the one working tree.
- Before committing, run `git status --short --branch` to confirm you're on `main` and the staged files match the request.
- Commit (and push to `origin/main`) only after the user asks to commit/merge or confirms the work is complete — pushing `main` deploys (web → Vercel, API → Coolify).
- Never spin up parallel worktrees or duplicate branches for tasks; one working tree on `main` is the only workflow.

## Commands

- `pnpm dev` - Start all dev servers (web:3000, admin:3001)
- `pnpm build` - Build all packages and apps
- `pnpm check` - Run all checks (format, lint, types)
- `pnpm check:lint` - OxLint across all packages
- `pnpm check:types` - TypeScript type checking
- `pnpm fix` - Auto-fix format and lint issues
- `pnpm turbo run <command> --filter=<package>` - Target specific package/app
- `pnpm --filter=@dragonfruit/ui storybook` - Start Storybook on port 6006

## Code Style

- **Imports**: Use `workspace:*` for internal packages, `catalog:` for external deps
- **UI components**: Before building any new component, check the catalog — `pnpm --filter @dragonfruit/ui storybook`
  (Design System / Component Catalog). Every recurring affordance already has a component; only invent a new
  one when the catalog shows nothing fits. One implementation per slot: `Button`/`IconButton`/`Tooltip`/`Card`/
  `Spinner` live in `@dragonfruit/propel/*`; `ModalCore`/`CustomMenu`/`Avatar`/`Loader` in `@dragonfruit/ui`. A new component
  is not done without its `.stories.tsx` — `packages/ui` has a test that enforces it
- **Swapping a JSX element for a component** (`<button>` → `<IconButton>`, and any codemod of that shape):
  run `node packages/codemods/audit-jsx-prop-loss.mjs` before calling it done. On our primitives every prop but `icon`
  is optional, so a dropped `onClick` or a flattened conditional `className` type-checks perfectly and ships a
  dead control — the icon-button migration produced four such regressions, all green under `tsc`. The script
  reports attributes present at `HEAD` and gone now; confirm each against `git diff -U15`, and recover original
  values from `git show HEAD:<file>`, never from memory
- **Icons**: Use the Solar icon set — web via the `lucide-shim`/`propel-shim` re-exports or `@solar-icons/react`, mobile via `@solar-icons/react-native`. HugeIcons/Phosphor have been removed; don't reintroduce mixed icon styles
- **TypeScript**: Strict mode enabled, all files must be typed
- **Formatting**: oxfmt, run `pnpm fix:format`
- **Linting**: OxLint with shared `.oxlintrc.json` config
- **Naming**: camelCase for variables/functions, PascalCase for components/types
- **Error Handling**: Use try-catch with proper error types, log errors appropriately
- **State Management**: MobX stores in `packages/shared-state`, reactive patterns
- **Testing**: All features require unit tests, use existing test framework per package
- **Components**: Build in `@dragonfruit/ui` with Storybook for isolated development

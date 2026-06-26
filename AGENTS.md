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
- `pnpm --filter=@plane/ui storybook` - Start Storybook on port 6006

## Code Style

- **Imports**: Use `workspace:*` for internal packages, `catalog:` for external deps
- **Icons**: Use the Solar icon set — web via the `lucide-shim`/`propel-shim` re-exports or `@solar-icons/react`, mobile via `@solar-icons/react-native`. HugeIcons/Phosphor have been removed; don't reintroduce mixed icon styles
- **TypeScript**: Strict mode enabled, all files must be typed
- **Formatting**: oxfmt, run `pnpm fix:format`
- **Linting**: OxLint with shared `.oxlintrc.json` config
- **Naming**: camelCase for variables/functions, PascalCase for components/types
- **Error Handling**: Use try-catch with proper error types, log errors appropriately
- **State Management**: MobX stores in `packages/shared-state`, reactive patterns
- **Testing**: All features require unit tests, use existing test framework per package
- **Components**: Build in `@plane/ui` with Storybook for isolated development

# Agent Development Guide

## Git Workflow

- Start each new chat/task on its own branch before making edits.
- If the current branch is `main`, create a branch named `codex/<short-task-name>` from the current `main`.
- If the current branch is already a task branch, continue on it only when the new request clearly belongs to the same task; otherwise switch back to `main` and create a new task branch.
- Before committing or merging, run `git status --short --branch` and make sure the branch and staged files match the current task.
- Merge task branches back into `main` only after the user asks to commit/merge or confirms the work is complete.
- When finishing a completed task, commit the task branch, merge it into `main`, delete the merged local task branch, and leave the worktree clean.

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
- **Icons**: Prefer the Hugeicons-backed set exposed through `@plane/icons`; avoid introducing mixed icon styles in new UI work
- **TypeScript**: Strict mode enabled, all files must be typed
- **Formatting**: oxfmt, run `pnpm fix:format`
- **Linting**: OxLint with shared `.oxlintrc.json` config
- **Naming**: camelCase for variables/functions, PascalCase for components/types
- **Error Handling**: Use try-catch with proper error types, log errors appropriately
- **State Management**: MobX stores in `packages/shared-state`, reactive patterns
- **Testing**: All features require unit tests, use existing test framework per package
- **Components**: Build in `@plane/ui` with Storybook for isolated development

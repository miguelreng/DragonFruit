#!/usr/bin/env bash
#
# wt.sh — spin up / tear down isolated git worktrees for parallel Claude Code chats.
#
# Each worktree is a separate checkout on its own branch, sharing the same .git
# history (the "same version" of the app). Open a separate Claude Code chat rooted
# in each worktree so concurrent changes never clobber each other.
#
# Usage:
#   bash scripts/wt.sh new <name> [--base <branch>] [--branch <branch>] [--build] [--no-install]
#   bash scripts/wt.sh ls
#   bash scripts/wt.sh rm <name> [--keep-branch]
#
# Examples:
#   bash scripts/wt.sh new sidebar-fix              # branch codex/sidebar-fix off latest main
#   bash scripts/wt.sh new api-thing --base main --build   # also build shared dist for local web dev
#   bash scripts/wt.sh ls
#   bash scripts/wt.sh rm sidebar-fix               # remove worktree, delete branch
#
# Notes:
#  - Worktrees live in a sibling dir: ../DragonFruit-wt/<name>
#  - Branches default to codex/<name> to match the repo's existing convention.
#  - Installs use hoisted node-linker (root .npmrc) — same as the main repo's local dev.
#  - COREPACK_INTEGRITY_KEYS=0 is set automatically (local corepack signing-key bug).
#  - "See it live": push the branch -> Vercel auto-builds a per-branch preview URL.
#    For local web dev you need the shared dist built (@plane/types|propel|editor):
#    pass --build, or run `pnpm turbo run build --filter=@plane/types ...` in the worktree.
#
set -euo pipefail

export COREPACK_INTEGRITY_KEYS=0

# --- locate the main repo + worktree parent (works from any worktree) ---
git_common=$(git rev-parse --git-common-dir)
main_repo=$(cd "$(dirname "$git_common")" && pwd)
wt_parent="$(dirname "$main_repo")/DragonFruit-wt"

cyan()  { printf "\033[36m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*" >&2; }

die() { red "error: $*"; exit 1; }

port_free() {
  ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

pick_port() {
  local p=3000
  while ! port_free "$p"; do p=$((p+1)); done
  echo "$p"
}

cmd_new() {
  local name="" base="main" branch="" do_install=1 do_build=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --base)   base="$2"; shift 2 ;;
      --branch) branch="$2"; shift 2 ;;
      --build)  do_build=1; shift ;;
      --no-install) do_install=0; shift ;;
      -*) die "unknown flag: $1" ;;
      *) [ -z "$name" ] && name="$1" && shift || die "unexpected arg: $1" ;;
    esac
  done
  [ -n "$name" ] || die "usage: wt.sh new <name> [--base <branch>] [--branch <branch>] [--build] [--no-install]"
  [ -z "$branch" ] && branch="codex/$name"

  local dest="$wt_parent/$name"
  [ -e "$dest" ] && die "worktree path already exists: $dest"

  mkdir -p "$wt_parent"

  # Base off the latest main (or chosen base). Fetch if a remote exists.
  if git -C "$main_repo" remote | grep -q .; then
    cyan "Fetching origin/$base ..."
    git -C "$main_repo" fetch --quiet origin "$base" 2>/dev/null || yellow "  (fetch skipped — using local $base)"
  fi
  local start="$base"
  git -C "$main_repo" show-ref --verify --quiet "refs/remotes/origin/$base" && start="origin/$base"

  cyan "Creating worktree: $dest  (branch $branch off $start)"
  git -C "$main_repo" worktree add -b "$branch" "$dest" "$start"

  if [ "$do_install" -eq 1 ]; then
    cyan "Installing deps (pnpm, hoisted) ..."
    ( cd "$dest" && pnpm install )
  else
    yellow "Skipped install (--no-install)."
  fi

  if [ "$do_build" -eq 1 ]; then
    cyan "Building shared dist (@plane/types, @plane/propel, @plane/editor) ..."
    ( cd "$dest" && pnpm turbo run build \
        --filter=@plane/types --filter=@plane/propel --filter=@plane/editor )
  fi

  local port; port=$(pick_port)
  # Convenience runner: local web dev on a free port (avoids the 3000 collision).
  cat > "$dest/wt-dev-web.sh" <<EOF
#!/usr/bin/env bash
# Run this worktree's web app on its own port (so multiple worktrees coexist).
# Local web dev needs shared dist built — run wt.sh new ... --build, or:
#   pnpm turbo run build --filter=@plane/types --filter=@plane/propel --filter=@plane/editor
set -e
export COREPACK_INTEGRITY_KEYS=0
cd "\$(dirname "\$0")/apps/web"
exec pnpm exec react-router dev --port $port
EOF
  chmod +x "$dest/wt-dev-web.sh"

  echo
  green "✓ Worktree ready"
  echo "  path:    $dest"
  echo "  branch:  $branch"
  echo
  echo "Next:"
  echo "  • Open a NEW Claude Code chat rooted in:  $dest"
  echo "  • See it live (recommended):  git push -u origin $branch  → Vercel preview URL"
  echo "  • Or local web dev on port $port:  ./wt-dev-web.sh   (needs --build first)"
  echo "  • When done:  bash scripts/wt.sh rm $name"
}

cmd_ls() {
  cyan "Worktrees:"
  git -C "$main_repo" worktree list
}

cmd_rm() {
  local name="" keep_branch=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --keep-branch) keep_branch=1; shift ;;
      -*) die "unknown flag: $1" ;;
      *) [ -z "$name" ] && name="$1" && shift || die "unexpected arg: $1" ;;
    esac
  done
  [ -n "$name" ] || die "usage: wt.sh rm <name> [--keep-branch]"

  local dest="$wt_parent/$name"
  [ -d "$dest" ] || die "no worktree at: $dest"

  # Resolve the branch checked out in that worktree before removing it.
  local branch; branch=$(git -C "$dest" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

  cyan "Removing worktree: $dest"
  # --force is expected: the generated wt-dev-web.sh is untracked. Try clean first quietly.
  git -C "$main_repo" worktree remove "$dest" 2>/dev/null || \
    git -C "$main_repo" worktree remove --force "$dest"

  if [ "$keep_branch" -eq 0 ] && [ -n "$branch" ] && [ "$branch" != "HEAD" ]; then
    if git -C "$main_repo" branch -d "$branch" 2>/dev/null; then
      green "✓ Deleted branch $branch"
    else
      yellow "Branch $branch not fully merged — kept it. Delete with: git branch -D $branch"
    fi
  fi
  green "✓ Done"
}

case "${1:-}" in
  new) shift; cmd_new "$@" ;;
  ls|list) shift || true; cmd_ls ;;
  rm|remove) shift; cmd_rm "$@" ;;
  *) cat >&2 <<EOF
wt.sh — isolated git worktrees for parallel Claude Code chats

  bash scripts/wt.sh new <name> [--base <branch>] [--branch <branch>] [--build] [--no-install]
  bash scripts/wt.sh ls
  bash scripts/wt.sh rm <name> [--keep-branch]
EOF
     exit 1 ;;
esac

#!/usr/bin/env bash
# DragonFruit local dev — bring up the four frontend processes in one go.
#
# Usage:
#   ./dev.sh            # all four (web, admin, space, live), single terminal, prefixed output
#   ./dev.sh web        # just web
#   ./dev.sh web live   # any subset
#   ./dev.sh --tmux     # open a tmux session with one window per service
#   ./dev.sh --tabs     # open 4 Terminal.app tabs (macOS only)
#
# Assumes the Docker backend stack is already running:
#   docker compose -f docker-compose-local.yml up -d
#
# Stop everything: Ctrl-C (single-terminal mode), `tmux kill-session -t dragonfruit` (tmux),
# or close the tabs (tabs mode).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# ── ANSI colors ─────────────────────────────────────────────────────────────
CYAN="\033[36m"; MAGENTA="\033[35m"; YELLOW="\033[33m"; GREEN="\033[32m"
GREY="\033[90m"; BOLD="\033[1m"; RESET="\033[0m"

# ── Service registry ────────────────────────────────────────────────────────
# name  port  command                              color
declare -a SERVICES=(
  "web    3000  pnpm --filter=web dev               ${CYAN}"
  "admin  3001  pnpm --filter=admin dev             ${MAGENTA}"
  "space  3002  pnpm --filter=space dev             ${YELLOW}"
  "live   3100  PORT=3100 pnpm --filter=live dev    ${GREEN}"
)

resolve_service() {
  local want="$1"
  for entry in "${SERVICES[@]}"; do
    # shellcheck disable=SC2086
    set -- $entry
    if [[ "$1" == "$want" ]]; then
      echo "$entry"
      return 0
    fi
  done
  echo "unknown service: $want" >&2
  echo "available: web admin space live" >&2
  return 1
}

backend_check() {
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^dragonfruit-api-1$'; then
    printf "${BOLD}⚠  Backend stack doesn't look up.${RESET}\n"
    printf "   Run: ${BOLD}docker compose -f docker-compose-local.yml up -d${RESET}\n"
    printf "   (continuing anyway — you'll just hit 502s until it's up)\n\n"
  fi
}

# ── Mode: --tmux ────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--tmux" ]]; then
  command -v tmux >/dev/null || { echo "tmux not installed (brew install tmux)"; exit 1; }
  SESSION="dragonfruit"
  tmux has-session -t "$SESSION" 2>/dev/null && {
    echo "session already exists — attaching"
    exec tmux attach -t "$SESSION"
  }
  backend_check
  tmux new-session -d -s "$SESSION" -n web "cd '$REPO_ROOT' && pnpm --filter=web dev"
  tmux new-window  -t "$SESSION"   -n admin "cd '$REPO_ROOT' && pnpm --filter=admin dev"
  tmux new-window  -t "$SESSION"   -n space "cd '$REPO_ROOT' && pnpm --filter=space dev"
  tmux new-window  -t "$SESSION"   -n live  "cd '$REPO_ROOT' && PORT=3100 pnpm --filter=live dev"
  exec tmux attach -t "$SESSION"
fi

# ── Mode: --tabs (macOS Terminal.app) ───────────────────────────────────────
if [[ "${1:-}" == "--tabs" ]]; then
  [[ "$(uname)" == "Darwin" ]] || { echo "--tabs is macOS only"; exit 1; }
  backend_check
  open_tab() {
    osascript <<EOF
tell application "Terminal"
  activate
  tell application "System Events" to keystroke "t" using {command down}
  delay 0.2
  do script "cd '$REPO_ROOT' && $1" in front window
end tell
EOF
  }
  open_tab "pnpm --filter=web dev"
  open_tab "pnpm --filter=admin dev"
  open_tab "pnpm --filter=space dev"
  open_tab "PORT=3100 pnpm --filter=live dev"
  echo "opened 4 tabs in Terminal.app"
  exit 0
fi

# ── Mode: single terminal, prefixed parallel output ─────────────────────────
# Pick which services to run.
declare -a SELECTED=()
if [[ $# -eq 0 ]]; then
  SELECTED=("web" "admin" "space" "live")
else
  SELECTED=("$@")
fi

backend_check
printf "${BOLD}DragonFruit dev${RESET}  ${GREY}(Ctrl-C to stop all)${RESET}\n"

PIDS=()
trap 'echo; echo "stopping…"; kill "${PIDS[@]}" 2>/dev/null || true; wait 2>/dev/null || true; exit 0' INT TERM

for svc in "${SELECTED[@]}"; do
  entry="$(resolve_service "$svc")"
  # shellcheck disable=SC2086
  set -- $entry
  name="$1"; port="$2"; shift 2
  # last "word" is the color escape; everything else is the command
  color="${!#}"
  cmd_parts=("$@"); unset 'cmd_parts[${#cmd_parts[@]}-1]'
  cmd="${cmd_parts[*]}"

  printf "${color}▶ %-5s${RESET} ${GREY}port %s${RESET}  %s\n" "$name" "$port" "$cmd"

  (
    # shellcheck disable=SC2086
    eval $cmd 2>&1 | sed -u "s|^|$(printf "${color}[%-5s]${RESET} " "$name")|"
  ) &
  PIDS+=($!)
done

echo
wait

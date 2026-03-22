#!/usr/bin/env bash
#
# loadout — install script
#
# One-liner install (no git clone needed):
#   curl -fsSL https://raw.githubusercontent.com/gpxl/loadout/main/install.sh | bash
#
# Re-run from an existing clone to update:
#   bash install.sh
#
# Options:
#   --check   Check dependencies only (exit 0 if all met, 1 otherwise)
#   --dry-run Show what would happen without making changes
#   --help    Show this help text
#

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────

CHECK_ONLY=false
DRY_RUN=false

# ── Parse arguments ───────────────────────────────────────────────────────────

for arg in "$@"; do
  case "$arg" in
    --check)   CHECK_ONLY=true ;;
    --dry-run) DRY_RUN=true ;;
    --help|-h)
      sed -n '3,/^$/{ s/^# //; s/^#$//; p }' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg"
      exit 1
      ;;
  esac
done

# ── Bootstrap detection ──────────────────────────────────────────────────────
# When piped from curl, BASH_SOURCE[0] is empty and we are NOT inside the repo.
# Detect this by checking for package.json in the resolved script dir.
_src="${BASH_SOURCE[0]:-}"
SCRIPT_DIR="$(cd "$(dirname "${_src:-$0}")" 2>/dev/null && pwd || pwd)"

if [[ ! -f "$SCRIPT_DIR/package.json" ]]; then
  INSTALL_DIR="${LOADOUT_INSTALL_DIR:-$HOME/.loadout/src}"
  echo "=== Loadout Bootstrap ==="

  if ! command -v git &>/dev/null; then
    echo "git not found. Install it and try again."
    exit 1
  fi

  if [[ -d "$INSTALL_DIR/.git" ]]; then
    echo "Updating existing clone at $INSTALL_DIR..."
    git -C "$INSTALL_DIR" pull --ff-only
  else
    echo "Cloning to $INSTALL_DIR..."
    git clone https://github.com/gpxl/loadout.git "$INSTALL_DIR"
  fi

  exec bash "$INSTALL_DIR/install.sh" "$@"
fi

# ── Colors ────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${BLUE}info${RESET}  $1"; }
ok()      { echo -e "${GREEN}ok${RESET}    $1"; }
warn()    { echo -e "${YELLOW}warn${RESET}  $1"; }
err()     { echo -e "${RED}error${RESET} $1"; }
dim()     { echo -e "${DIM}$1${RESET}"; }
heading() { echo -e "\n${BOLD}$1${RESET}\n"; }

# ── Dependency checks ─────────────────────────────────────────────────────────

DEPS_OK=true

check_node_version() {
  if ! command -v node &>/dev/null; then
    err "Node.js not found"
    dim "  Fix: brew install node  (or install via nvm/fnm)"
    DEPS_OK=false
    return 1
  fi

  local version major
  version=$(node -v | sed 's/^v//')
  major=$(echo "$version" | cut -d. -f1)

  if [ "$major" -ge 20 ]; then
    ok "Node.js $version (>= 20 required)"
  else
    err "Node.js $version found — version 20+ required"
    dim "  Fix: nvm install 20 && nvm use 20"
    DEPS_OK=false
    return 1
  fi
}

check_command() {
  local cmd="$1" label="$2" fix="${3:-}"
  if command -v "$cmd" &>/dev/null; then
    ok "$label found: $(command -v "$cmd")"
  else
    err "$label not found"
    [ -n "$fix" ] && dim "  Fix: $fix"
    DEPS_OK=false
  fi
}

heading "Checking dependencies..."

check_node_version
check_command pnpm "pnpm" "npm install -g pnpm"

if [ "$CHECK_ONLY" = true ]; then
  echo
  if [ "$DEPS_OK" = true ]; then
    ok "All dependencies met"
    exit 0
  else
    err "Missing dependencies — see above"
    exit 1
  fi
fi

if [ "$DEPS_OK" = false ]; then
  err "Missing dependencies — install them and re-run"
  exit 1
fi

# ── Install ───────────────────────────────────────────────────────────────────

cd "$SCRIPT_DIR"

heading "Installing loadout..."

info "Installing dependencies..."
if [ "$DRY_RUN" = true ]; then
  dim "  [dry-run] Would run: pnpm install"
else
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  ok "Dependencies installed"
fi

info "Building..."
if [ "$DRY_RUN" = true ]; then
  dim "  [dry-run] Would run: pnpm build"
else
  pnpm build
  ok "Build complete"
fi

info "Running tests..."
if [ "$DRY_RUN" = true ]; then
  dim "  [dry-run] Would run: pnpm test"
else
  if pnpm test &>/dev/null; then
    ok "All tests pass"
  else
    warn "Some tests failed — continuing"
  fi
fi

info "Linking loadout globally..."
if [ "$DRY_RUN" = true ]; then
  dim "  [dry-run] Would run: pnpm link --global"
else
  pnpm link --global 2>/dev/null
  ok "loadout linked globally"
fi

info "Installing loadout-awareness skill..."
if [ "$DRY_RUN" = true ]; then
  dim "  [dry-run] Would copy skills/loadout-awareness/ to ~/.claude/skills/"
else
  SKILL_SRC="$SCRIPT_DIR/skills/loadout-awareness"
  SKILL_DST="$HOME/.claude/skills/loadout-awareness"
  if [[ -d "$SKILL_SRC" ]]; then
    mkdir -p "$HOME/.claude/skills"
    rm -rf "$SKILL_DST"
    cp -R "$SKILL_SRC" "$SKILL_DST"
    ok "loadout-awareness skill installed to ~/.claude/skills/"
  else
    warn "Skill source not found — skipping"
  fi
fi

if command -v loadout &>/dev/null; then
  ok "loadout available at $(command -v loadout)"
else
  warn "loadout not found in PATH"
  dim "  Add pnpm's global bin to your PATH:"
  dim "  export PATH=\"\$(pnpm -g bin):\$PATH\""
fi

# ── Summary ───────────────────────────────────────────────────────────────────

heading "Installation complete!"

echo -e "  ${BOLD}Quick start:${RESET}"
echo -e "    loadout scan             ${DIM}Analyze project & recommend skills${RESET}"
echo -e "    loadout search react     ${DIM}Search the skills.sh registry${RESET}"
echo -e "    loadout status           ${DIM}Show installed skills${RESET}"
echo

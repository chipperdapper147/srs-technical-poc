#!/usr/bin/env bash
# Bring a Claude Code cloud container (or any Linux box with Docker, as root)
# to the state `pnpm verify` needs: Node 24, pnpm, Docker running, Atlas,
# .env, dependencies, Postgres 18 up, migrated and seeded.
#
# Idempotent and fast when nothing changed: every step checks before it acts.
# Run by .claude/hooks/session-start.sh at the start of every cloud session;
# safe to run by hand: `scripts/setup-agent-env.sh`.
#
# Output: one line per step on stdout (the session sees it); details in $LOG.
set -euo pipefail

NODE_VERSION=24.22.2 # keep on the .nvmrc major; bump deliberately
ATLAS_VERSION=1.3.8  # keep in sync with .github/actions/setup and README
TOOLS="${SRS_TOOLS_DIR:-/opt/srs-tools}"
LOG="${TMPDIR:-/tmp}/srs-agent-setup.log"

cd "$(dirname "$0")/.."
: >"$LOG"
step() { printf 'setup: %s\n' "$*"; }
fail() {
  printf 'setup: FAILED: %s (details: %s)\n' "$*" "$LOG"
  tail -n 20 "$LOG" | sed 's/^/  | /'
  exit 1
}
run() { "$@" >>"$LOG" 2>&1; }

mkdir -p "$TOOLS/bin"
for dir in "$TOOLS/bin" "$TOOLS/node/bin"; do
  case ":$PATH:" in *":$dir:"*) ;; *) PATH="$dir:$PATH" ;; esac
done
export PATH
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# Variables every later command in the session needs.
persist() {
  export "$1=$2"
  if [ -n "${CLAUDE_ENV_FILE:-}" ] && ! grep -qxF "export $1=\"$2\"" "$CLAUDE_ENV_FILE" 2>/dev/null; then
    echo "export $1=\"$2\"" >>"$CLAUDE_ENV_FILE"
  fi
}
persist PATH "$PATH"
persist COREPACK_ENABLE_DOWNLOAD_PROMPT 0
# Playwright's preinstalled Chromium in cloud images (see playwright.config.ts).
if [ -x /opt/pw-browsers/chromium ]; then
  persist PLAYWRIGHT_CHROMIUM_EXECUTABLE /opt/pw-browsers/chromium
fi

# --- Node, checksum-verified -------------------------------------------------
if [ "$(node --version 2>/dev/null)" != "v$NODE_VERSION" ]; then
  step "installing Node $NODE_VERSION"
  tarball="node-v$NODE_VERSION-linux-x64.tar.xz"
  tmp="$(mktemp -d)"
  base="https://nodejs.org/dist/v$NODE_VERSION"
  run curl -fsSL -o "$tmp/$tarball" "$base/$tarball" || fail "downloading Node"
  run curl -fsSL -o "$tmp/SHASUMS256.txt" "$base/SHASUMS256.txt" || fail "downloading Node checksums"
  (cd "$tmp" && grep " $tarball\$" SHASUMS256.txt | sha256sum --check --status) || fail "Node checksum mismatch"
  rm -rf "$TOOLS/node" && mkdir -p "$TOOLS/node"
  tar -xJf "$tmp/$tarball" -C "$TOOLS/node" --strip-components=1
  rm -rf "$tmp"
fi
# pnpm at the version package.json pins ("packageManager"), through a
# corepack shim ahead of any pnpm the image ships with.
if [ ! -x "$TOOLS/bin/pnpm" ]; then
  run corepack enable --install-directory "$TOOLS/bin" pnpm || fail "corepack enable"
fi
want="$(sed -n 's/.*"packageManager": "pnpm@\([^"]*\)".*/\1/p' package.json)"
[ "$(pnpm --version 2>>"$LOG")" = "$want" ] || fail "pnpm is not at $want"

# --- Docker (Postgres and Atlas's dev database run in containers) -------------
if ! docker info >/dev/null 2>&1; then
  command -v dockerd >/dev/null || fail "Docker is not installed and no daemon is running"
  step "starting the Docker daemon"
  setsid nohup dockerd >"${TMPDIR:-/tmp}/dockerd.log" 2>&1 </dev/null &
  for _ in $(seq 60); do docker info >/dev/null 2>&1 && break; sleep 0.5; done
  docker info >/dev/null 2>&1 || fail "Docker daemon did not start (see ${TMPDIR:-/tmp}/dockerd.log)"
fi

# --- Atlas, taken from its pinned official image ------------------------------
if ! atlas version 2>/dev/null | grep -q "v$ATLAS_VERSION"; then
  step "installing Atlas $ATLAS_VERSION"
  run docker pull "arigaio/atlas:$ATLAS_VERSION" || fail "pulling the Atlas image"
  cid="$(docker create "arigaio/atlas:$ATLAS_VERSION")"
  run docker cp "$cid:/atlas" "$TOOLS/bin/atlas" || fail "extracting Atlas"
  run docker rm "$cid"
fi

# --- Repo: .env, git hooks, dependencies -------------------------------------
[ -f .env ] || cp .env.example .env
git config core.hooksPath .githooks

# Reinstall only when this script, the Node version or a manifest changed.
hashes=node_modules/.session-start.sha256
if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  step "installing dependencies"
  rm -f "$hashes"
  run pnpm install --frozen-lockfile || fail "pnpm install"
  sha256sum scripts/setup-agent-env.sh pnpm-lock.yaml pnpm-workspace.yaml package.json \
    apps/*/package.json packages/*/package.json >"$hashes"
fi

# --- Database: up, migrated, seeded (each step is idempotent) -----------------
run pnpm db:up || fail "starting Postgres (pnpm db:up)"
run pnpm db:migrate || fail "applying migrations (pnpm db:migrate)"
run pnpm db:seed || fail "seeding (pnpm db:seed)"

step "ready: node $(node --version), pnpm $(pnpm --version), atlas v$ATLAS_VERSION, Postgres up and seeded. Verify changes with \`pnpm verify\`."

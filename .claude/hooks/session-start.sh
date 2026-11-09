#!/usr/bin/env bash
# SessionStart hook. Locally it only enables the repo's git hooks; in Claude
# Code cloud sessions it runs the full, idempotent environment setup.
set -euo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"
git config core.hooksPath .githooks
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  exec scripts/setup-agent-env.sh
fi

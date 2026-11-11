#!/usr/bin/env bash
# Fail if a pull request's title or description links to a Claude session:
# a `Claude-Session:` line or a claude.ai/code/session_ URL. The repository is
# public (AGENTS.md). Same patterns as check-commit-messages.sh; used by CI's
# `pr-description` job, which passes the text in PR_TITLE and PR_BODY (env
# vars, never interpolated into the script).
set -euo pipefail
text="${PR_TITLE:-}"$'\n'"${PR_BODY:-}"
bad="$(grep -inE '^claude-session:|claude\.ai/code/session_' <<<"$text" || true)"
if [ -n "$bad" ]; then
  echo "$bad"
  echo "::error::The pull request's title or description links to a Claude session. Edit it to remove the link." >&2
  exit 1
fi
echo "No Claude session links in the pull request's title or description"

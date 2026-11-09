#!/usr/bin/env bash
# Fail if a commit message links to a Claude session: a `Claude-Session:`
# trailer or a claude.ai/code/session_ URL. The repo is public (see AGENTS.md).
# Used by the pre-push hook and CI.
# Usage: scripts/check-commit-messages.sh [revisions...]   (default: HEAD)
set -euo pipefail
if [ $# -eq 0 ]; then set -- HEAD; fi

bad="$(git log --format='%h %s' --regexp-ignore-case --extended-regexp \
  --grep='^claude-session:' --grep='claude\.ai/code/session_' "$@")"
if [ -n "$bad" ]; then
  echo "$bad"
  echo "::error::These commits link to a Claude session. Reword them to remove the link." >&2
  exit 1
fi
echo "No Claude session links in commit messages"

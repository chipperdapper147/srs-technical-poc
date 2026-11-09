#!/usr/bin/env bash
# Run a command with variables from the repo-root .env, without overriding
# variables that are already set (CI sets them directly and has no .env).
set -euo pipefail
env_file="$(dirname "$0")/../.env"
if [ -f "$env_file" ]; then
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    [[ -z "${!key+x}" ]] && export "$key=$value"
  done < "$env_file"
fi
exec "$@"

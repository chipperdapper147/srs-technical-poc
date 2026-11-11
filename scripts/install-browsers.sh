#!/usr/bin/env bash
# Install Playwright browsers in CI: `scripts/install-browsers.sh chromium [webkit ...]`.
#
# `playwright install --with-deps` also apt-installs system packages (fonts,
# libraries). When the runner's Ubuntu mirrors are unreachable (seen for
# 30+ minutes on 2026-11-11), each apt fetch waited ~20 s and the step failed
# after ten minutes. So: if the mirrors don't resolve, skip apt; otherwise
# short apt timeouts and two attempts with system packages; then the
# browsers alone with a warning. The runner image ships
# the libraries Chromium needs; if one is really missing, the browser fails
# to launch and the tests fail loudly.
set -uo pipefail

printf 'Acquire::Retries "1";\nAcquire::http::Timeout "10";\nAcquire::https::Timeout "10";\n' |
  sudo tee /etc/apt/apt.conf.d/99ci-timeouts >/dev/null

# If the mirrors don't even resolve, apt can only time out: skip straight to
# the browsers (an outage made the two attempts below cost 20 minutes).
mirrors_resolve() {
  for host in archive.ubuntu.com security.ubuntu.com; do
    timeout 5 getent hosts "$host" >/dev/null || return 1
  done
}
if ! mirrors_resolve; then
  echo "::warning::Ubuntu mirrors don't resolve; installing $* without system packages."
  exec pnpm --filter @app/e2e exec playwright install "$@"
fi

for attempt in 1 2; do
  if pnpm --filter @app/e2e exec playwright install --with-deps "$@"; then exit 0; fi
  echo "::warning::playwright install --with-deps $* failed (attempt $attempt of 2)"
  sleep 15
done
echo "::warning::Could not install the browsers' system packages (Ubuntu mirrors unreachable?). Installing $* without them."
exec pnpm --filter @app/e2e exec playwright install "$@"

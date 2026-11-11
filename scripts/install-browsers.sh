#!/usr/bin/env bash
# Install Playwright browsers in CI: `scripts/install-browsers.sh chromium [webkit ...]`.
#
# `playwright install --with-deps` also apt-installs system packages (fonts,
# libraries). When the runner's Ubuntu mirrors are unreachable (seen for
# 30+ minutes on 2026-11-11), each apt fetch waited ~20 s and the step failed
# after ten minutes. So: short apt timeouts, two attempts with system
# packages, then the browsers alone with a warning. The runner image ships
# the libraries Chromium needs; if one is really missing, the browser fails
# to launch and the tests fail loudly.
set -uo pipefail

printf 'Acquire::Retries "1";\nAcquire::http::Timeout "10";\nAcquire::https::Timeout "10";\n' |
  sudo tee /etc/apt/apt.conf.d/99ci-timeouts >/dev/null

for attempt in 1 2; do
  if pnpm --filter @app/e2e exec playwright install --with-deps "$@"; then exit 0; fi
  echo "::warning::playwright install --with-deps $* failed (attempt $attempt of 2)"
  sleep 15
done
echo "::warning::Could not install the browsers' system packages (Ubuntu mirrors unreachable?). Installing $* without them."
exec pnpm --filter @app/e2e exec playwright install "$@"

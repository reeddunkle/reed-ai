#!/usr/bin/env bash

set -euo pipefail

if ! command -v fnm >/dev/null 2>&1; then
  echo "fnm was not found on PATH." >&2
  exit 1
fi

eval "$(fnm env --use-on-cd --shell bash)"
fnm use --silent-if-unchanged

exec "$@"

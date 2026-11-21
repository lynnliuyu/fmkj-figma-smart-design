#!/usr/bin/env bash
# Used by the owner or the local CI runner to ensure the existing dev cluster is up.
set -euo pipefail

port="${FMKJ_PG_PORT:-55432}"
data_dir="${FMKJ_PG_DATA:-$HOME/.fmkj-dev-db}"

if nc -z -w 2 127.0.0.1 "$port" 2>/dev/null; then
  echo "PostgreSQL already listening on 127.0.0.1:$port"
  exit 0
fi

if [ ! -s "$data_dir/PG_VERSION" ]; then
  echo "PostgreSQL data directory is missing or uninitialized: $data_dir (see LOCAL-DEV.md)" >&2
  exit 1
fi

# The shared instance must survive the Actions runner's orphan-process cleanup.
exec env -u RUNNER_TRACKING_ID bash "$(dirname "$0")/dev-up.sh" --db-only

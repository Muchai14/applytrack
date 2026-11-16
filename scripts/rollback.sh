#!/bin/sh
# Restore a previously built local dev image. Never drops or recreates the database.
set -eu
cd "$(dirname "$0")/.."
image=${1:?Usage: make rollback IMAGE=applytrack-api:known-good}
case "$image" in *[!a-zA-Z0-9_./:@-]*) echo "Invalid image reference" >&2; exit 2;; esac
version=$(docker image inspect --format '{{ index .Config.Labels "org.applytrack.auth-version" }}' "$image")
[ "$version" = "1" ] || { echo "Refusing pre-account image: it cannot enforce ownership." >&2; exit 2; }
API_IMAGE="$image" docker compose up -d --no-build --force-recreate api runtime
python3 - <<'PY'
import time, urllib.request
for _ in range(30):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=3) as r:
            if r.status==200: print('Rollback health check passed'); break
    except Exception: time.sleep(2)
else: raise SystemExit('Rollback health check failed')
PY

#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
# This project has no persistent volumes and never shares the development DB.
cleanup() { docker compose -f compose.test.yaml --profile checks down --volumes --remove-orphans; }
trap cleanup EXIT INT TERM
docker compose -f compose.test.yaml --profile checks build
docker compose -f compose.test.yaml run --rm frontend-tests
docker compose -f compose.test.yaml up -d --wait db api web
docker compose -f compose.test.yaml run --rm tests
docker compose -f compose.test.yaml run --rm e2e

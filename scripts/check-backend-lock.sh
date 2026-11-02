#!/bin/sh
# Backend dependencies are locked: uv.lock matches pyproject.toml, and
# requirements.lock.txt (what the Docker image installs) matches uv.lock.
# Fix either with `make backend-lock`, then commit both files.
set -eu
cd "$(dirname "$0")/../backend"
uv lock --check
# The export's header comment names its output path, so compare without comments.
fresh=$(uv export --frozen --no-emit-project --format requirements-txt | grep -v '^ *#')
committed=$(grep -v '^ *#' requirements.lock.txt)
[ "$fresh" = "$committed" ] \
  || { echo "requirements.lock.txt is out of date: run make backend-lock" >&2; exit 1; }
echo "backend lock: ok"

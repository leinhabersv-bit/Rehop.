#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."
case "${1:-}" in
    "") set -- -m "not slow" ;;
    --all) shift ;;
    *) echo "Usage: scripts/check.sh [--all]" >&2; exit 2 ;;
esac
python -m ruff check . &&
    python -m ruff format --check . &&
    python -m pytest -q "$@" --cov=app --cov-report=term-missing

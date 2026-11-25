#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."
python -m ruff check . &&
    python -m ruff format --check . &&
    python -m pytest -q --cov=app --cov-report=term-missing

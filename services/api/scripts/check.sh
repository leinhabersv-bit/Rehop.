#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."
ruff check . &&
    ruff format --check . &&
    pytest -q --cov=app --cov-report=term-missing

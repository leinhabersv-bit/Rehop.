from pathlib import Path

import yaml

from app.main import app

OPENAPI_CONTRACT = Path(__file__).resolve().parents[3] / "contracts" / "openapi.yaml"
HTTP_METHODS = {"get", "put", "post", "delete", "options", "head", "patch", "trace"}


def path_methods(document):
    return {path: HTTP_METHODS.intersection(item) for path, item in document["paths"].items()}


def test_openapi_paths_and_methods_match_contract():
    contract = yaml.safe_load(OPENAPI_CONTRACT.read_text(encoding="utf-8"))
    assert path_methods(app.openapi()) == path_methods(contract)

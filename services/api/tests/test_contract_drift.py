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


def test_journey_creation_query_parameters_match_contract():
    contract = yaml.safe_load(OPENAPI_CONTRACT.read_text(encoding="utf-8"))
    route = "/api/v1/journeys"
    assert (
        app.openapi()["paths"][route]["post"]["parameters"] == contract["paths"][route]["post"]["parameters"]
    )


def test_automatic_recovery_is_opt_in_in_live_and_checked_in_openapi():
    contract = yaml.safe_load(OPENAPI_CONTRACT.read_text(encoding="utf-8"))
    for document in (contract, app.openapi()):
        fields = document["components"]["schemas"]["RecoveryPolicy"]["properties"]
        assert fields["auto_rebook_on_confirmed_driver_cancel"]["default"] is False


def test_journey_mutation_idempotency_errors_match_contract():
    contract = yaml.safe_load(OPENAPI_CONTRACT.read_text(encoding="utf-8"))
    for document in (contract, app.openapi()):
        for operation in ("book", "rescue/approve", "cancel", "pickup/confirm", "driver-message"):
            responses = document["paths"][f"/api/v1/journeys/{{journey_id}}/{operation}"]["post"]["responses"]
            conflict = responses["409"]
            codes = (
                ["IDEMPOTENCY_KEY_REUSED", "BOOKING_FAILED"]
                if operation == "book"
                else ["IDEMPOTENCY_KEY_REUSED"]
            )
            assert conflict["x-error-codes"] == codes
            assert conflict["content"]["application/json"]["schema"]["$ref"].endswith("/ErrorEnvelope")

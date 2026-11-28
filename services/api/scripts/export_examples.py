"""Export repeatable public API transcripts for frontend fixtures."""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from tests.e2e.test_scenarios_e2e import run_http  # noqa: E402


def main():
    os.environ["DEMO_LIVE_LLM"] = "0"
    target = Path(__file__).resolve().parents[3] / "contracts/examples"
    with TestClient(app) as client:
        for scenario in ("S01", "S03", "S05", "S13", "S14", "S15", "S17"):
            state, events, requests = run_http(client, scenario)
            (target / f"{scenario.lower()}-http.json").write_text(
                json.dumps({"requests": requests, "final": state, "events": events}, indent=2) + "\n"
            )


if __name__ == "__main__":
    main()

"""Journey IDs for rider requests and repeatable simulation runs."""

from collections import Counter
from threading import Lock
from uuid import uuid4


class IdFactory:
    def __init__(self):
        self._counts: Counter[tuple[str, int]] = Counter()
        self._lock = Lock()

    @staticmethod
    def rider() -> str:
        return f"journey_{uuid4().hex[:12]}"

    def scenario(self, scenario: str, seed: int) -> str:
        with self._lock:
            self._counts[scenario, seed] += 1
            return f"journey_{scenario}_{seed}_{self._counts[scenario, seed]}"

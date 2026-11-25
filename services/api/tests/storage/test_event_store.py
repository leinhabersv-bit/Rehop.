from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

from app.schemas.enums import EventType
from app.storage.event_store import MemoryEventStore

NOW = datetime(2026, 11, 25, tzinfo=UTC)


def test_memory_sequences_are_gap_free_under_1000_concurrent_appends():
    store = MemoryEventStore()

    def append(index):
        return store.append("journey", EventType.TELEMETRY_UPDATED, {"index": index}, "ride", NOW)

    with ThreadPoolExecutor(max_workers=8) as workers:
        appended = list(workers.map(append, range(1000)))
    events = store.list("journey")
    assert sorted(appended, key=lambda event: event.seq) == events
    assert [event.seq for event in events] == list(range(1, 1001))
    assert [event.event_id for event in events] == [f"journey_evt_{seq:04}" for seq in range(1, 1001)]
    assert store.list("journey", 995) == events[995:]
    assert store.last_seq("journey") == 1000
    assert store.last_seq("other") == 0
    assert store.append("other", EventType.JOURNEY_CREATED, {}, None, NOW).seq == 1


def test_memory_event_payload_cannot_be_changed_by_a_caller():
    store = MemoryEventStore()
    event = store.append("journey", EventType.JOURNEY_CREATED, {"scenario": "S01"}, None, NOW)
    event.payload["scenario"] = "S02"
    store.list("journey")[0].payload.clear()
    assert store.list("journey")[0].payload == {"scenario": "S01"}

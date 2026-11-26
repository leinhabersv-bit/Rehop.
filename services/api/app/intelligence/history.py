"""Bounded, per-ride observations for the feature extractor."""

from collections import deque
from collections.abc import Iterable, Iterator, Sequence
from datetime import datetime, timedelta
from typing import overload

from app.schemas.domain import TelemetrySample


class TelemetryHistory(Sequence[TelemetrySample]):
    """Keep ten minutes of five-second observations, including both endpoints."""

    def __init__(
        self,
        ride_id: str,
        samples: Iterable[TelemetrySample] = (),
        *,
        initial_distance_m: int | None = None,
    ) -> None:
        self.ride_id = ride_id
        self.initial_distance_m = initial_distance_m
        self._samples: deque[TelemetrySample] = deque(maxlen=121)
        for sample in samples:
            self.append(sample)

    def append(self, sample: TelemetrySample) -> None:
        if sample.ride_id != self.ride_id:
            raise ValueError("Telemetry belongs to a different ride.")
        if self._samples and sample.observed_at < self._samples[-1].observed_at:
            raise ValueError("Telemetry must be appended in observation order.")
        if self._samples and sample.observed_at == self._samples[-1].observed_at:
            self._samples.pop()
        self._samples.append(sample)
        self.prune(sample.observed_at)

    def prune(self, now: datetime) -> None:
        while self._samples and now - self._samples[0].observed_at > timedelta(minutes=10):
            self._samples.popleft()

    def __len__(self) -> int:
        return len(self._samples)

    def __iter__(self) -> Iterator[TelemetrySample]:
        return iter(self._samples)

    @overload
    def __getitem__(self, index: int) -> TelemetrySample: ...
    @overload
    def __getitem__(self, index: slice) -> Sequence[TelemetrySample]: ...
    def __getitem__(self, index: int | slice) -> TelemetrySample | Sequence[TelemetrySample]:
        return tuple(self._samples)[index] if isinstance(index, slice) else self._samples[index]

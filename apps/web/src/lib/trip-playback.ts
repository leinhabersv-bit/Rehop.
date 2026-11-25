export function tripPlaybackLengthMs(routeSeconds: number) {
  return Math.max(8_000, routeSeconds * 50);
}

export function tripPlayback(
  boardedAtMs: number, nowMs: number, routeSeconds: number, routeMeters: number,
  arrivesAtMs = boardedAtMs + tripPlaybackLengthMs(routeSeconds),
) {
  const progress = Math.min(1, Math.max(0, (nowMs - boardedAtMs) / (arrivesAtMs - boardedAtMs)));
  return {
    progress,
    remainingSeconds: Math.ceil(routeSeconds * (1 - progress)),
    remainingMeters: Math.ceil(routeMeters * (1 - progress)),
  };
}

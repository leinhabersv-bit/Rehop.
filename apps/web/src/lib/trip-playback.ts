export function tripPlaybackLengthMs(routeSeconds: number) {
  return Math.max(8_000, routeSeconds * 50);
}

export function tripPlayback(boardedAtMs: number, nowMs: number, routeSeconds: number, routeMeters: number) {
  const progress = Math.min(1, Math.max(0, (nowMs - boardedAtMs) / tripPlaybackLengthMs(routeSeconds)));
  return {
    progress,
    remainingSeconds: Math.ceil(routeSeconds * (1 - progress)),
    remainingMeters: Math.ceil(routeMeters * (1 - progress)),
  };
}

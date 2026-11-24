const key = 'rehop.recent-rides';

export function readRecentRides(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function rememberRide(id: string) {
  try {
    localStorage.setItem(key, JSON.stringify([id, ...readRecentRides().filter((item) => item !== id)].slice(0, 8)));
  } catch {
    // The confirmed journey remains accessible via its tracking link.
  }
}

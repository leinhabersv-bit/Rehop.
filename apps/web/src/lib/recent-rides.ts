const key = 'rehop.recent-rides';
const arrivalKey = 'rehop.ride-arrivals';
const pendingKey = 'rehop.pending-trip';
const changed = 'rehop:rides-changed';

export function subscribeToRides(update: () => void) {
  window.addEventListener('storage', update);
  window.addEventListener(changed, update);
  return () => {
    window.removeEventListener('storage', update);
    window.removeEventListener(changed, update);
  };
}

export function recentRideSnapshot() {
  const ids = readRecentRides();
  let pending = null;
  try {
    const id = localStorage.getItem(pendingKey);
    if (id && ids.includes(id)) pending = id;
  } catch {
    // Tracking links still work when browser storage is unavailable.
  }
  return JSON.stringify([ids, readRideArrivals(), pending]);
}

function readRideArrivals(): Record<string, number> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(arrivalKey) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, number> : {};
  } catch {
    return {};
  }
}

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
    localStorage.setItem(pendingKey, id);
    window.dispatchEvent(new Event(changed));
    return true;
  } catch {
    return false;
  }
}

export function rememberPendingTrip(id: string) {
  try {
    if (localStorage.getItem(pendingKey)) return;
    localStorage.setItem(pendingKey, id);
    window.dispatchEvent(new Event(changed));
  } catch {
    // The tracking URL still opens the trip.
  }
}

export function clearPendingTrip(id: string) {
  try {
    if (localStorage.getItem(pendingKey) !== id) return;
    localStorage.removeItem(pendingKey);
    window.dispatchEvent(new Event(changed));
  } catch {
    // The receipt can still be opened directly.
  }
}

export function rememberRideArrival(id: string, at: number) {
  try {
    const arrivals = { ...readRideArrivals(), [id]: at };
    const known = Object.fromEntries(readRecentRides().filter((ride) => Number.isFinite(arrivals[ride])).map((ride) => [ride, arrivals[ride]]));
    localStorage.setItem(arrivalKey, JSON.stringify(known));
    window.dispatchEvent(new Event(changed));
  } catch {
    // The current page can still use its route estimate.
  }
}

export function deleteRecentRide(id: string) {
  try {
    const arrivals = readRideArrivals();
    delete arrivals[id];
    localStorage.setItem(arrivalKey, JSON.stringify(arrivals));
    localStorage.setItem(key, JSON.stringify(readRecentRides().filter((ride) => ride !== id)));
    if (localStorage.getItem(pendingKey) === id) localStorage.removeItem(pendingKey);
    window.dispatchEvent(new Event(changed));
    return true;
  } catch {
    return false;
  }
}

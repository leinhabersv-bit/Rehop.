import type { Location } from '@/types';

export class GoogleMapsHttpError extends Error {
  constructor(readonly status: number, readonly retryAfterMs: number) {
    super('Google Maps request failed');
  }
}

export async function googleRequest<T>(url: string, key: string, fields: string, body: object): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': fields,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
    cache: 'no-store',
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as {
      error?: { status?: unknown; details?: { reason?: unknown; metadata?: Record<string, unknown> }[] };
    } | null;
    const details = Array.isArray(payload?.error?.details) ? payload.error.details : [];
    const codes = [payload?.error?.status, ...details.map(detail => detail?.reason)]
      .filter((code): code is string => typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code));
    const quota = details.flatMap(detail => ['quota_limit', 'quota_limit_value', 'quota_metric', 'quota_unit']
      .map(field => [field, detail?.metadata?.[field]])
      .filter(([, value]) => typeof value === 'string' && /^[\w./{}-]{1,120}$/.test(value)));
    console.warn('Google Maps upstream request failed', {
      service: new URL(url).hostname, status: response.status, codes, quota: Object.fromEntries(quota),
    });
    const retryAfter = response.headers.get('Retry-After') ?? '';
    const wait = /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
    throw new GoogleMapsHttpError(response.status, Number.isFinite(wait) && wait > 0 ? wait : 60_000);
  }
  return response.json();
}

type GooglePlace = {
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: { shortText?: string; types?: string[] }[];
};

export async function searchGoogleIndia(query: string, key: string) {
  const { places = [] } = await googleRequest<{ places?: GooglePlace[] }>(
    'https://places.googleapis.com/v1/places:searchText',
    key,
    'places.displayName,places.formattedAddress,places.location,places.addressComponents',
    { textQuery: query, regionCode: 'IN', pageSize: 8 },
  );
  const matches: Location[] = [];
  for (const place of places) {
    const country = place.addressComponents?.find(({ types }) => types?.includes('country'));
    const { latitude: lat, longitude: lng } = place.location ?? {};
    if (country?.shortText !== 'IN' || typeof lat !== 'number' || typeof lng !== 'number' ||
        !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const name = place.displayName?.text;
    const address = place.formattedAddress;
    const label = name && address?.startsWith(name) ? address : [name, address].filter(Boolean).join(', ');
    if (label) matches.push({ label: label.slice(0, 160), lat, lng });
  }
  return { places: matches, provider: 'google' as const };
}

type GoogleRoute = {
  distanceMeters?: number;
  duration?: string;
  polyline?: { geoJsonLinestring?: { type: string; coordinates: [number, number][] } };
};

function waypoint(value: string) {
  const [longitude, latitude] = value.split(',').map(Number);
  return { location: { latLng: { latitude, longitude } } };
}

export async function computeGoogleDrive(from: string, to: string, key: string, includePath = false) {
  const fields = 'routes.distanceMeters,routes.duration,fallbackInfo.routingMode';
  const { routes = [], fallbackInfo } = await googleRequest<{
    routes?: GoogleRoute[];
    fallbackInfo?: { routingMode?: string };
  }>(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    key,
    includePath ? fields + ',routes.polyline.geoJsonLinestring' : fields,
    {
      origin: waypoint(from),
      destination: waypoint(to),
      travelMode: 'DRIVE',
      routingPreference: includePath ? 'TRAFFIC_AWARE_OPTIMAL' : 'TRAFFIC_AWARE',
      regionCode: 'IN',
      ...(includePath && { polylineEncoding: 'GEO_JSON_LINESTRING', polylineQuality: 'OVERVIEW' }),
    },
  );
  if (!routes.length) return null;
  const { distanceMeters, duration, polyline } = routes[0];
  const durationSeconds = duration && /^\d+(?:\.\d+)?s$/.test(duration) ? Number(duration.slice(0, -1)) : NaN;
  if (typeof distanceMeters !== 'number' || !Number.isFinite(distanceMeters) || distanceMeters < 0 ||
      !Number.isFinite(durationSeconds)) throw new Error('Invalid route estimate');
  return {
    coordinates: polyline?.geoJsonLinestring?.type === 'LineString' ? polyline.geoJsonLinestring.coordinates : [],
    distanceMeters,
    durationSeconds,
    calculatedAt: new Date().toISOString(),
    provider: 'google' as const,
    trafficAware: !fallbackInfo || fallbackInfo.routingMode === 'FALLBACK_TRAFFIC_AWARE',
  };
}

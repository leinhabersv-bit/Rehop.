import type { Location } from '@/types';

const userAgent = 'ReHop/0.1 (+https://github.com/leinhabersv-bit/Rehop.)';
const lastRequest = { places: 0, route: 0 };
type MapResult = { data: object; status: number };
const cache = new Map<string, { expires: number; result: Promise<MapResult> }>();

function validPoint(point: unknown): point is [number, number] {
  return Array.isArray(point) && point.length === 2 &&
    Number.isFinite(point[0]) && Math.abs(point[0]) <= 180 &&
    Number.isFinite(point[1]) && Math.abs(point[1]) <= 90;
}

function parsePoint(value: string | null) {
  if (!value || !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(value)) return null;
  const point = value.split(',').map(Number);
  return validPoint(point) ? point.join(',') : null;
}

interface PhotonFeature {
  properties?: Record<string, string | undefined>;
  geometry?: { coordinates?: unknown };
}

function placesFrom(features: PhotonFeature[]) {
  const places = new Map<string, Location>();
  for (const feature of features) {
    const coordinates = feature.geometry?.coordinates;
    const props = feature.properties;
    if (!validPoint(coordinates) || !props) continue;
    const [lng, lat] = coordinates;
    const address = [props.housenumber, props.street].filter(Boolean).join(' ');
    const parts = [props.name, address, props.district, props.city || props.county, props.state, props.country].filter(Boolean);
    const label = [...new Set(parts)].join(', ').slice(0, 160);
    if (label) places.set(`${lng},${lat}`, { label, lat, lng });
  }
  return [...places.values()];
}

async function fetchMapData(url: URL, kind: keyof typeof lastRequest): Promise<MapResult> {
  try {
    const upstream = await fetch(url, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(7000),
      cache: 'no-store',
    });
    const data = await upstream.json();
    if (kind === 'route' && ['NoRoute', 'NoSegment'].includes(data?.code)) {
      return { data: { error: 'No driving route found. Try a nearby road or entrance.' }, status: 404 };
    }
    if (!upstream.ok) throw new Error('Map provider request failed');
    if (kind === 'places' && Array.isArray(data?.features)) {
      return { data: { places: placesFrom(data.features) }, status: 200 };
    }
    const route = data?.routes?.[0];
    const coordinates: unknown = route?.geometry?.coordinates;
    if (
      data?.code === 'Ok' && Array.isArray(coordinates) && coordinates.length >= 2 &&
      coordinates.every(validPoint) && Number.isFinite(route.distance) && route.distance >= 0 &&
      Number.isFinite(route.duration) && route.duration >= 0
    ) {
      const access = data.waypoints?.map((waypoint: { distance?: number }) => waypoint.distance);
      const roadAccessMeters = access?.length === 2 && access.every(Number.isFinite) ? access : undefined;
      return {
        data: { coordinates, distanceMeters: route.distance, durationSeconds: route.duration, roadAccessMeters },
        status: 200,
      };
    }
  } catch {
    // A service outage must never produce a fabricated result.
  }
  return { data: { error: 'Map service is temporarily unavailable. Try again shortly.' }, status: 503 };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get('q')?.trim().replace(/\s+/g, ' ');
  let kind: keyof typeof lastRequest;
  let url: URL;

  if (query !== undefined) {
    if (query.length < 3 || query.length > 160) {
      return Response.json({ error: 'Enter a place or address between 3 and 160 characters.' }, { status: 400 });
    }
    kind = 'places';
    url = new URL(process.env.REHOP_PHOTON_URL || 'https://photon.komoot.io/api/');
    url.search = new URLSearchParams({ q: query, limit: '8', lat: '13.08', lon: '80.27', lang: 'en' }).toString();
  } else {
    const from = parsePoint(params.get('from'));
    const to = parsePoint(params.get('to'));
    if (!from || !to || from === to) {
      return Response.json({ error: 'Choose two different places to see a route.' }, { status: 400 });
    }
    kind = 'route';
    const base = process.env.REHOP_OSRM_URL || 'https://routing.openstreetmap.de/routed-car/route/v1/driving/';
    url = new URL(`${base.replace(/\/$/, '')}/${from};${to}`);
    url.search = new URLSearchParams({
      overview: 'simplified', geometries: 'geojson', radiuses: '1500;1500', steps: 'false',
    }).toString();
  }

  const key = kind === 'places' ? `places:${query?.toLowerCase()}` : url.href;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expires > now) {
    const { data, status } = await cached.result;
    return Response.json(data, { status });
  }
  if (now - lastRequest[kind] < 1000) {
    return Response.json({ error: 'Map service is busy. Try again in a second.' }, {
      status: 429,
      headers: { 'Retry-After': '1' },
    });
  }
  lastRequest[kind] = now;
  const pending = fetchMapData(url, kind);
  cache.delete(key);
  if (cache.size >= 250) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { expires: now + 15 * 60_000, result: pending });
  const { data, status } = await pending;
  if (status === 503 && cache.get(key)?.result === pending) cache.delete(key);
  return Response.json(data, { status });
}

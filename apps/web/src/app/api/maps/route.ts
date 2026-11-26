import type { Location } from '@/types';
import { computeGoogleDrive, GoogleMapsHttpError, searchGoogleIndia } from './google-server';

const userAgent = 'ReHop/0.1 (+https://github.com/leinhabersv-bit/Rehop.)';
const lastRequest = { places: 0, route: 0 };
const lastGoogleRequest = { places: 0, route: 0 };
const googleRetryAt = { places: 0, route: 0 };
type MapResult = { data: object; status: number };
const cache = new Map<string, { expires: number; result: Promise<MapResult> }>();
const googlePending = new Map<string, Promise<MapResult | null>>();

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
    if (!validPoint(coordinates) || props?.countrycode?.toUpperCase() !== 'IN') continue;
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
        data: {
          coordinates,
          distanceMeters: route.distance,
          durationSeconds: route.duration,
          calculatedAt: new Date().toISOString(),
          roadAccessMeters,
        },
        status: 200,
      };
    }
  } catch {
    // A service outage must never produce a fabricated result.
  }
  return { data: { error: 'Map service is temporarily unavailable. Try again shortly.' }, status: 503 };
}

export async function POST(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json') ||
      request.headers.get('sec-fetch-site') === 'cross-site') {
    return Response.json({ error: 'Use the trip planner to request map data.' }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.values(body).some((value) => typeof value !== 'string')) {
    return Response.json({ error: 'Invalid map request.' }, { status: 400 });
  }
  const params = new URLSearchParams(body);
  const query = params.get('q')?.trim().replace(/\s+/g, ' ');
  let kind: keyof typeof lastRequest;
  let url: URL;
  let points: [string, string] | undefined;

  if (query !== undefined) {
    if (query.length < 3 || query.length > 160) {
      return Response.json({ error: 'Enter a place or address between 3 and 160 characters.' }, { status: 400 });
    }
    kind = 'places';
    url = new URL(process.env.REHOP_PHOTON_URL || 'https://photon.komoot.io/api/');
    url.search = new URLSearchParams({ q: query, limit: '12', countrycode: 'IN', lang: 'en' }).toString();
  } else {
    const from = parsePoint(params.get('from'));
    const to = parsePoint(params.get('to'));
    if (!from || !to || from === to) {
      return Response.json({ error: 'Choose two different places to see a route.' }, { status: 400 });
    }
    kind = 'route';
    points = [from, to];
    const base = process.env.REHOP_OSRM_URL || 'https://routing.openstreetmap.de/routed-car/route/v1/driving/';
    url = new URL(`${base.replace(/\/$/, '')}/${from};${to}`);
    url.search = new URLSearchParams({
      overview: 'simplified', geometries: 'geojson', radiuses: '1500;1500', steps: 'false',
    }).toString();
  }

  const key = kind === 'places' ? `places:${query?.toLowerCase()}` : url.href;
  const source = points ? params.get('source') : null;
  const includeGooglePath = source === 'google-map';
  const mapsKey = source === 'osm' ? undefined : process.env.GOOGLE_MAPS_SERVER_KEY?.trim();
  const googleKey = includeGooglePath ? `google-map:${key}` : key;
  const responseOptions = { headers: { 'Cache-Control': 'no-store' } };
  const inFlight = mapsKey && googlePending.get(googleKey);
  if (inFlight) {
    const result = await inFlight;
    if (result) return Response.json(result.data, { ...responseOptions, status: result.status });
  }
  const now = Date.now();
  const requestGoogle = mapsKey && now >= googleRetryAt[kind];
  const cached = cache.get(key);
  if (!requestGoogle && cached && cached.expires > now) {
    const { data, status } = await cached.result;
    return Response.json(data, { status });
  }
  const requestTimes = requestGoogle ? lastGoogleRequest : lastRequest;
  if (now - requestTimes[kind] < 1000) {
    return Response.json({ error: 'Map service is busy. Try again in a second.' }, {
      status: 429,
      headers: { 'Retry-After': '1' },
    });
  }
  requestTimes[kind] = now;
  if (requestGoogle) {
    const pending = (async (): Promise<MapResult | null> => {
      try {
        if (points) {
          const route = await computeGoogleDrive(...points, requestGoogle, includeGooglePath);
          if (route && includeGooglePath && (!Array.isArray(route.coordinates) ||
              route.coordinates.length < 2 || !route.coordinates.every(validPoint))) return null;
          return route
            ? { data: route, status: 200 }
            : { data: { error: 'No driving route found. Try a nearby road or entrance.' }, status: 404 };
        }
        const result = await searchGoogleIndia(query!, requestGoogle);
        return { data: result, status: 200 };
      } catch (error) {
        if (error instanceof GoogleMapsHttpError && error.status === 429) {
          googleRetryAt[kind] = Date.now() + error.retryAfterMs;
        }
        return null;
      }
    })();
    googlePending.set(googleKey, pending);
    const result = await pending.finally(() => googlePending.delete(googleKey));
    if (result) return Response.json(result.data, { ...responseOptions, status: result.status });
  }
  if (cached && cached.expires > now) {
    const { data, status } = await cached.result;
    return Response.json(data, { status });
  }
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

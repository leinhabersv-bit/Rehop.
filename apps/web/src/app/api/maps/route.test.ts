import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

test('backs off Routes API on 429 and restores Google traffic after Retry-After', async () => {
  vi.stubEnv('GOOGLE_MAPS_SERVER_KEY', 'test-key');
  const clock = vi.spyOn(Date, 'now').mockReturnValue(100_000);
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const coordinates = [[80.276308, 13.082590], [80.164110, 12.982069]];
  const google = vi.fn()
    .mockResolvedValueOnce(Response.json({
      error: {
        status: 'RESOURCE_EXHAUSTED',
        details: [{ reason: 'RATE_LIMIT_EXCEEDED', metadata: { quota_limit: 'RoutesPerDay', consumer: 'private-id' } }],
      },
    }, { status: 429, headers: { 'Retry-After': '40' } }))
    .mockResolvedValueOnce(Response.json({
      routes: [{
        distanceMeters: 22000,
        duration: '1810s',
        polyline: { geoJsonLinestring: { type: 'LineString', coordinates } },
      }],
    }));
  const osm = vi.fn().mockImplementation(() => Response.json({
    code: 'Ok', routes: [{ distance: 21000, duration: 1300, geometry: { coordinates } }],
  }));
  vi.stubGlobal('fetch', (url: string | URL) => new URL(url).hostname === 'routes.googleapis.com' ? google() : osm());
  const { POST } = await import('./route');
  const request = () => POST(new Request('http://localhost/api/maps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: coordinates[0].join(','), to: coordinates[1].join(','), source: 'google-map' }),
  }));

  const fallback = await (await request()).json();
  expect(fallback).toMatchObject({ distanceMeters: 21000, durationSeconds: 1300 });
  expect(fallback.provider).toBeUndefined();
  expect(warning).toHaveBeenCalledWith('Google Maps upstream request failed', {
    service: 'routes.googleapis.com', status: 429, codes: ['RESOURCE_EXHAUSTED', 'RATE_LIMIT_EXCEEDED'],
    quota: { quota_limit: 'RoutesPerDay' },
  });
  clock.mockReturnValue(139_999);
  expect(await (await request()).json()).toEqual(fallback);
  expect(google).toHaveBeenCalledTimes(1);
  expect(osm).toHaveBeenCalledTimes(1);

  clock.mockReturnValue(140_000);
  expect(await (await request()).json()).toMatchObject({
    provider: 'google', trafficAware: true, distanceMeters: 22000, durationSeconds: 1810, coordinates,
  });
  expect(google).toHaveBeenCalledTimes(2);
  expect(osm).toHaveBeenCalledTimes(1);
});

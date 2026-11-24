import { afterEach, expect, test, vi } from 'vitest';
import { computeGoogleDrive } from '@/app/api/maps/google-server';
import { formatDrivingDistance, formatDrivingDuration } from './maps';

afterEach(() => vi.unstubAllGlobals());

test('the server returns the matching Google line, distance and traffic duration', async () => {
  const coordinates = [[80.21, 13.01], [80.25, 13.02]];
  const route = {
    distanceMeters: 5330,
    duration: '900s',
    polyline: { geoJsonLinestring: { type: 'LineString', coordinates } },
  };
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ routes: [route] }))
    .mockResolvedValueOnce(Response.json({ routes: [route], fallbackInfo: { routingMode: 'FALLBACK_TRAFFIC_UNAWARE' } }))
    .mockResolvedValueOnce(Response.json({ routes: [] }));
  vi.stubGlobal('fetch', fetch);
  const from = '80.21,13.01';
  const to = '80.25,13.02';
  await expect(computeGoogleDrive(from, to, 'test-key', true)).resolves.toEqual({
    coordinates,
    provider: 'google',
    trafficAware: true,
    distanceMeters: 5330,
    durationSeconds: 900,
    calculatedAt: expect.any(String),
  });
  const request = fetch.mock.calls[0][1];
  expect(request.headers['X-Goog-FieldMask']).toContain('routes.polyline.geoJsonLinestring');
  expect(JSON.parse(request.body)).toMatchObject({
    origin: { location: { latLng: { latitude: 13.01, longitude: 80.21 } } },
    destination: { location: { latLng: { latitude: 13.02, longitude: 80.25 } } },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
    polylineEncoding: 'GEO_JSON_LINESTRING',
  });
  await expect(computeGoogleDrive(from, to, 'test-key')).resolves.toMatchObject({ trafficAware: false });
  await expect(computeGoogleDrive(from, to, 'test-key')).resolves.toBeNull();
});

test('road estimates distinguish short trips and show hours for long trips', () => {
  expect(formatDrivingDuration(31)).toBe('<1 min');
  expect(formatDrivingDuration(124)).toBe('2 min');
  expect(formatDrivingDuration(9_120)).toBe('2 hr 32 min');
  expect(formatDrivingDistance(255)).toBe('255 m');
  expect(formatDrivingDistance(8_550)).toBe('8.6 km');
});

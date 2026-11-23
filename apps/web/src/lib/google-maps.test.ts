import { afterEach, expect, test, vi } from 'vitest';
import { formatDrivingDistance, formatDrivingDuration } from './maps';

const { computeRoutes } = vi.hoisted(() => ({ computeRoutes: vi.fn() }));
vi.mock('@googlemaps/js-api-loader', () => ({
  importLibrary: async () => ({ Route: { computeRoutes } }),
  setOptions: vi.fn(),
}));

const pickup = { label: 'Pickup entrance', lat: 13.01, lng: 80.21 };
const destination = { label: 'Destination entrance', lat: 13.02, lng: 80.25 };
const googleRoute = {
  path: [{ lat: 13.01, lng: 80.21 }, { lat: 13.02, lng: 80.25 }],
  distanceMeters: 5330,
  durationMillis: 900_000,
  localizedValues: { distance: '5.3 km', duration: '15 mins' },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  computeRoutes.mockReset();
});

test('Google supplies the line, distance and traffic-aware duration for the selected coordinates', async () => {
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY', 'test-key');
  computeRoutes.mockResolvedValue({ routes: [googleRoute] });
  const { getGoogleDrivingRoute } = await import('./google-maps');
  await expect(getGoogleDrivingRoute(pickup, destination)).resolves.toEqual({
    coordinates: [[80.21, 13.01], [80.25, 13.02]],
    provider: 'google',
    trafficAware: true,
    distanceMeters: 5330,
    durationSeconds: 900,
    calculatedAt: expect.any(String),
    distanceText: '5.3 km',
    durationText: '15 mins',
  });
  expect(computeRoutes).toHaveBeenCalledWith(expect.objectContaining({
    origin: { lat: pickup.lat, lng: pickup.lng },
    destination: { lat: destination.lat, lng: destination.lng },
    travelMode: 'DRIVING',
    routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
  }));
  computeRoutes.mockResolvedValue({ routes: [googleRoute], fallbackInfo: { routingMode: 'TRAFFIC_UNAWARE' } });
  await expect(getGoogleDrivingRoute(pickup, destination)).resolves.toMatchObject({ trafficAware: false });
  computeRoutes.mockResolvedValue({ routes: [] });
  await expect(getGoogleDrivingRoute(pickup, destination)).rejects.toThrow('No driving route found');
});

test('road estimates distinguish short trips and show hours for long trips', () => {
  expect(formatDrivingDuration(31)).toBe('<1 min');
  expect(formatDrivingDuration(124)).toBe('2 min');
  expect(formatDrivingDuration(9_120)).toBe('2 hr 32 min');
  expect(formatDrivingDistance(255)).toBe('255 m');
  expect(formatDrivingDistance(8_550)).toBe('8.6 km');
});

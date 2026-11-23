import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import type { DrivingRoute } from './maps';
import type { Location } from '@/types';

export const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
let configured = false;

export function loadGoogleLibrary<T extends 'routes' | 'maps' | 'core' | 'marker'>(library: T) {
  if (!googleMapsKey) throw new Error('Google Maps is not configured.');
  if (!configured) {
    setOptions({ key: googleMapsKey, v: 'weekly' });
    configured = true;
  }
  return importLibrary(library);
}

export async function getGoogleDrivingRoute(pickup: Location, dropoff: Location): Promise<DrivingRoute> {
  const { Route } = await loadGoogleLibrary('routes') as google.maps.RoutesLibrary;
  const { routes, fallbackInfo } = await Route.computeRoutes({
    origin: { lat: pickup.lat, lng: pickup.lng },
    destination: { lat: dropoff.lat, lng: dropoff.lng },
    travelMode: 'DRIVING',
    routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
    fields: ['path', 'distanceMeters', 'durationMillis', 'localizedValues'],
  });
  const route = routes?.[0];
  if (!route) throw new Error('No driving route found. Try a nearby road or entrance.');
  const { path, distanceMeters, durationMillis, localizedValues } = route;
  if (!path || path.length < 2 || distanceMeters == null || durationMillis == null ||
    !Number.isFinite(distanceMeters) || !Number.isFinite(durationMillis) ||
    distanceMeters < 0 || durationMillis < 0) {
    throw new Error('Google Maps did not return a complete route. Try again shortly.');
  }
  return {
    coordinates: path.map(({ lng, lat }) => [lng, lat]),
    distanceMeters,
    durationSeconds: durationMillis / 1000,
    provider: 'google',
    trafficAware: !fallbackInfo || fallbackInfo.routingMode === 'TRAFFIC_AWARE',
    distanceText: localizedValues?.distance ?? undefined,
    durationText: localizedValues?.duration ?? undefined,
  };
}

import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

export const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
let configured = false;

export function loadGoogleLibrary(library: 'maps' | 'core' | 'marker') {
  if (!googleMapsKey) throw new Error('Google Maps is not configured.');
  if (!configured) {
    setOptions({ key: googleMapsKey, v: 'weekly' });
    configured = true;
  }
  return importLibrary(library);
}

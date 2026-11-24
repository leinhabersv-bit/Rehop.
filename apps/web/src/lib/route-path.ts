type Coordinate = [lng: number, lat: number];
const radians = Math.PI / 180;
const shortestLongitude = (delta: number) => ((delta + 540) % 360) - 180;

export function interpolateRoutePoint([fromLng, fromLat]: Coordinate, [toLng, toLat]: Coordinate, fraction: number): Coordinate {
  return [
    shortestLongitude(fromLng + fraction * shortestLongitude(toLng - fromLng)),
    fromLat + fraction * (toLat - fromLat),
  ];
}

export function routeScreenHeading([fromLng, fromLat]: Coordinate, [toLng, toLat]: Coordinate): number {
  const east = shortestLongitude(toLng - fromLng) * Math.cos((fromLat + toLat) * radians / 2);
  return Math.atan2(fromLat - toLat, east) / radians;
}

type Viewport = { width: number; height: number };

function zoomToFit(point: Coordinate, endpoint: Coordinate, size: Viewport) {
  // Google Maps uses a 256-pixel Mercator world at zoom zero.
  const y = (lat: number) => Math.atanh(Math.sin(Math.max(-85.05, Math.min(85.05, lat)) * radians)) * 128 / Math.PI;
  const dx = Math.abs(shortestLongitude(endpoint[0] - point[0])) * 256 / 360;
  const dy = Math.abs(y(endpoint[1]) - y(point[1]));
  return Math.log2(Math.min(Math.max(1, size.width - 84) / dx, Math.max(1, size.height - 120) / dy));
}

export function trackingZoom(remaining: Coordinate[], endpoint: Coordinate, size: Viewport, destination: boolean) {
  if (destination) return 16;
  const fit = remaining.reduce((zoom, point) => Math.min(zoom, zoomToFit(point, endpoint, size)), 18);
  return Math.max(0, Math.floor(fit));
}

export function trackingCenter(point: Coordinate, endpoint: Coordinate, ahead: Coordinate,
  size: Viewport, destination: boolean, zoom: number) {
  const midpoint = interpolateRoutePoint(point, endpoint, 0.5);
  if (!destination) return midpoint;
  const fit = zoomToFit(point, endpoint, size);
  if (fit >= zoom) return midpoint;
  const nearby = interpolateRoutePoint(point, ahead, 0.5);
  const blend = Math.max(0, 1 + (fit - zoom) / 0.6);
  return interpolateRoutePoint(nearby, midpoint, blend);
}

export function measureRoute(coordinates: Coordinate[]) {
  const distances = [0];
  for (let i = 1; i < coordinates.length; i++) {
    const [fromLng, fromLat] = coordinates[i - 1];
    const [toLng, toLat] = coordinates[i];
    const north = (toLat - fromLat) * radians;
    const east = shortestLongitude(toLng - fromLng) * radians * Math.cos((fromLat + toLat) * radians / 2);
    distances.push(distances[i - 1] + 6_371_000 * Math.hypot(north, east));
  }
  const length = distances.at(-1)!;

  function pointAt(distance: number): Coordinate {
    if (distance <= 0) return coordinates[0];
    if (distance >= length) return coordinates[coordinates.length - 1];
    let lo = 1;
    let hi = distances.length - 1;
    while (lo < hi) {
      const middle = (lo + hi) >>> 1;
      if (distances[middle] < distance) lo = middle + 1;
      else hi = middle;
    }
    const fraction = (distance - distances[lo - 1]) / (distances[lo] - distances[lo - 1]);
    return interpolateRoutePoint(coordinates[lo - 1], coordinates[lo], fraction);
  }

  const remainingPoints = (distance: number) => [pointAt(distance), ...coordinates.filter((_, i) => distances[i] > distance)];
  return { length, pointAt, remainingPoints };
}

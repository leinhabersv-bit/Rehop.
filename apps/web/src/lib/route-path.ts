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

export function trackingCamera(point: Coordinate, endpoint: Coordinate, ahead: Coordinate,
  size: { width: number; height: number }, destination: boolean) {
  // Google Maps uses a 256-pixel Mercator world at zoom zero.
  const y = (lat: number) => Math.atanh(Math.sin(Math.max(-85.05, Math.min(85.05, lat)) * radians)) * 128 / Math.PI;
  const dx = Math.abs(shortestLongitude(endpoint[0] - point[0])) * 256 / 360;
  const dy = Math.abs(y(endpoint[1]) - y(point[1]));
  const fit = Math.log2(Math.min(Math.max(1, size.width - 84) / dx, Math.max(1, size.height - 120) / dy));
  const midpoint = interpolateRoutePoint(point, endpoint, 0.5);
  if (!destination || fit >= 16.2) return { center: midpoint, zoom: Math.min(fit, 18) };
  const nearby = interpolateRoutePoint(point, ahead, 0.5);
  const blend = Math.max(0, (fit - 15.6) / 0.6);
  return { center: interpolateRoutePoint(nearby, midpoint, blend), zoom: 16.2 };
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

  return { length, pointAt };
}

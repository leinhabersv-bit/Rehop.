import { expect, it } from 'vitest';
import { interpolateRoutePoint, measureRoute, routeScreenHeading } from './route-path';

it('follows each leg of the route by distance and reaches the exact pickup point', () => {
  const route = measureRoute([[80, 13], [80, 13.02], [80, 13.02], [80.005, 13.02]]);
  expect(route.pointAt(0)).toEqual([80, 13]);
  expect(route.pointAt(route.length / 2)[0]).toBeCloseTo(80);
  const [lng, lat] = route.pointAt(route.length - 100);
  expect(lng).toBeGreaterThan(80);
  expect(lat).toBe(13.02);
  expect(route.pointAt(route.length)).toEqual([80.005, 13.02]);
});

it('turns the cab from north to east around a road corner', () => {
  const route = measureRoute([[80, 13], [80, 13.001], [80.001, 13.001]]);
  const heading = (distance: number) => routeScreenHeading(route.pointAt(distance - 12), route.pointAt(distance + 12));
  expect(heading(50)).toBeCloseTo(-90);
  expect(heading(111)).toBeGreaterThan(-90);
  expect(heading(111)).toBeLessThan(0);
  expect(heading(160)).toBeCloseTo(0);
});

it('centers a dateline-crossing route between the driver and pickup', () => {
  expect(interpolateRoutePoint([179.8, 10], [-179.8, 12], 0.5)).toEqual([-180, 11]);
  expect(routeScreenHeading([179.8, 10], [-179.8, 10])).toBeCloseTo(0);
});

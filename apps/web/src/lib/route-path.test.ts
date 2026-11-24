import { expect, it } from 'vitest';
import { measureRoute } from './route-path';

it('follows each leg of the route by distance and reaches the exact pickup point', () => {
  const route = measureRoute([[80, 13], [80, 13.02], [80, 13.02], [80.005, 13.02]]);
  expect(route.pointAt(0)).toEqual([80, 13]);
  expect(route.pointAt(route.length / 2)[0]).toBeCloseTo(80);
  const [lng, lat] = route.pointAt(route.length - 100);
  expect(lng).toBeGreaterThan(80);
  expect(lat).toBe(13.02);
  expect(route.pointAt(route.length)).toEqual([80.005, 13.02]);
});

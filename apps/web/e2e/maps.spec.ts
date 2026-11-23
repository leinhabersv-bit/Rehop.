import { expect, test } from '@playwright/test';

const web = process.env.REHOP_TEST_WEB ?? 'http://localhost:3000';
const api = process.env.REHOP_TEST_API ?? 'http://localhost:8000';

test('a rider can use a searched location and review the road duration separately from pickup ETA', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const pickup = { label: 'Guindy National Park, Chennai', lat: 13.000005, lng: 80.2280448 };

  await page.route('**/api/maps?*', async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get('q') === 'Guindy National Park') {
      await route.fulfill({ json: { places: [pickup] } });
    } else if (params.get('from') === '80.228045,13.000005') {
      await route.fulfill({ json: {
        coordinates: [[80.228045, 13.000005], [80.2, 13.004], [80.1709, 12.9941]],
        distanceMeters: 8550,
        durationSeconds: 955,
      } });
    } else {
      await route.fulfill({ status: 404, json: { error: 'No driving route found.' } });
    }
  });
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());

  await page.goto(web);
  await page.getByRole('link', { name: 'Search any address or landmark' }).click();
  const pickupInput = page.getByRole('textbox', { name: 'Pickup location' });
  await expect(pickupInput).toBeEmpty();
  await pickupInput.fill('Guindy National Park');
  await pickupInput.press('Enter');
  await page.getByRole('button', { name: pickup.label }).click();
  await page.getByRole('textbox', { name: 'Destination' }).fill('Chennai Airport');
  await page.getByRole('button', { name: 'Chennai Airport', exact: true }).click();

  await expect(page.getByText('16 min drive')).toBeVisible();
  await expect(page.getByText(/8\.6 km · Traffic excluded/)).toBeVisible();
  await page.getByRole('button', { name: 'Show map' }).click();
  const map = page.getByRole('region', { name: 'Driving route map' });
  await expect(map.locator('svg path').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: 'Hide map' }).click();

  await page.getByRole('button', { name: 'Get ReHop’s recommendation' }).click();
  await expect(page.getByRole('heading', { name: 'Review your ride' })).toBeVisible();
  await expect(page.getByText('Estimated pickup', { exact: true })).toBeVisible();
  await expect(page.getByText('16 min drive')).toBeVisible();
  const id = new URL(page.url()).searchParams.get('journey');
  expect(id).toBeTruthy();
  const journey = await request.get(`${api}/api/v1/journeys/${id}`);
  expect(journey.ok()).toBe(true);
  expect(await journey.json()).toMatchObject({ pickup, dropoff: { label: 'Chennai Airport' } });
});

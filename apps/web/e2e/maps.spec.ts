import { expect, test } from '@playwright/test';

const web = process.env.REHOP_TEST_WEB ?? 'http://localhost:3000';
const api = process.env.REHOP_TEST_API ?? 'http://localhost:8000';

test('popular Chennai locations route to the selected airport terminal', async ({ page }) => {
  await page.route('**/api/maps', (route) => route.fulfill({ json: {
    coordinates: [[80.276308, 13.082590], [80.164110, 12.982069]],
    distanceMeters: 19200,
    durationSeconds: 2100,
    calculatedAt: '2026-11-23T13:30:00.000Z',
  } }));
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(web);
  const pickup = page.getByRole('combobox', { name: 'Pickup point' });
  const destination = page.getByRole('combobox', { name: 'Destination' });
  await expect(pickup.locator('option', { hasText: 'Kilambakkam Bus Terminus' })).toHaveCount(1);
  await expect(destination.locator('option', { hasText: 'Marina Beach Lighthouse' })).toHaveCount(1);
  await expect(pickup.locator('optgroup[label="Hospitals"] option', { hasText: 'Apollo Hospitals' })).toHaveCount(1);
  await expect(destination.locator('optgroup[label="Parks, beaches & landmarks"] option', { hasText: 'Shore Temple Parking' })).toHaveCount(1);
  await pickup.selectOption('Chennai Central Railway Station');
  await destination.selectOption('Chennai Airport T2 (International)');
  const swap = page.getByRole('button', { name: 'Swap pickup and destination' });
  await swap.click();
  await expect(pickup).toHaveValue('Chennai Airport T2 (International)');
  await expect(destination).toHaveValue('Chennai Central Railway Station');
  await swap.click();
  const requestedRoute = page.waitForRequest((request) => request.url().endsWith('/api/maps'));
  await page.getByRole('button', { name: 'Review trip details' }).click();
  expect((await requestedRoute).postDataJSON()).toMatchObject({
    from: '80.276308,13.082590', to: '80.164110,12.982069',
  });
  const report = page.getByRole('region', { name: 'Trip timing report' });
  await expect(report.getByText('35 min', { exact: true })).toBeVisible();
  await expect(report.getByText('19.2 km', { exact: true })).toBeVisible();
  await expect(report.getByText(/Traffic excluded/)).toBeVisible();
  await expect(report.getByRole('region', { name: 'Driving route map' })).toBeVisible();
  const controls = await page.getByRole('region', { name: 'Trip route', exact: true }).boundingBox();
  const timing = await report.boundingBox();
  expect(controls!.x + controls!.width).toBeLessThan(timing!.x);
  expect(Math.abs(controls!.y - timing!.y)).toBeLessThan(12);
  await page.getByRole('button', { name: 'Find my ride' }).click();
  const recommendation = page.getByRole('region', { name: 'Recommended ride' });
  const estimates = page.getByRole('region', { name: 'Other provider estimates' });
  await expect(recommendation).toBeVisible();
  await expect(estimates).toBeVisible();
  expect((await recommendation.boundingBox())!.x).toBeLessThan((await estimates.boundingBox())!.x);
  await expect(page.getByRole('button', { name: 'Book', exact: true })).toHaveCount(1);
});

test('a rider can search, copy the map timing report and review the pickup ETA separately', async ({ page, request, context }) => {
  await page.setViewportSize({ width: 320, height: 690 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pickup = { label: 'Guindy National Park, Chennai', lat: 13.000005, lng: 80.2280448 };

  await page.route('**/api/maps', async (route) => {
    const params = route.request().postDataJSON();
    if (params.q === 'Guindy National Park') {
      await route.fulfill({ json: { places: [pickup] } });
    } else if (params.from === '80.228045,13.000005') {
      await route.fulfill({ json: {
        coordinates: [[80.228045, 13.000005], [80.2, 13.004], [80.167339, 12.982553]],
        distanceMeters: 8550,
        durationSeconds: 955,
        calculatedAt: '2026-11-23T13:30:00.000Z',
        roadAccessMeters: [190, 20],
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
  const destination = page.getByRole('textbox', { name: 'Destination' });
  await destination.fill('Chennai International Airport');
  await expect(page.getByRole('button', { name: 'Chennai Airport T2 (International)', exact: true })).toBeVisible();
  await destination.fill('Chennai Airport');
  await page.getByRole('button', { name: 'Chennai Airport', exact: true }).click();

  const report = page.getByRole('region', { name: 'Trip timing report' });
  await expect(report.getByText('16 min', { exact: true })).toBeVisible();
  await expect(report.getByText('8.6 km', { exact: true })).toBeVisible();
  await expect(report.getByText(/Traffic excluded/)).toBeVisible();
  await expect(report.locator('time')).toHaveAttribute('datetime', '2026-11-23T13:30:00.000Z');
  await report.getByRole('button', { name: 'Copy timing report' }).click();
  await expect(report.getByRole('status')).toHaveText('Timing report copied.');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('Guindy National Park, Chennai → Chennai Airport');
  expect(copied).toContain('16 min estimated drive · 8.6 km');
  expect(copied).toContain('FOSSGIS / OSRM · Traffic excluded');
  await expect(page.getByText('Road access is 190 m from pickup.')).toBeVisible();
  const map = page.getByRole('region', { name: 'Driving route map' });
  await expect(map.locator('svg path').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  await page.getByRole('button', { name: 'Find my ride' }).click();
  await expect(page.getByRole('heading', { name: 'Review your ride' })).toBeVisible();
  await expect(page.getByText('Pickup in', { exact: true })).toBeVisible();
  const id = new URL(page.url()).searchParams.get('journey');
  expect(id).toBeTruthy();
  const journey = await request.get(`${api}/api/v1/journeys/${id}`);
  expect(journey.ok()).toBe(true);
  expect(await journey.json()).toMatchObject({ pickup, dropoff: { label: 'Chennai Airport' } });
});

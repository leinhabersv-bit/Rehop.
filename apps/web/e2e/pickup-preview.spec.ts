import { expect, test } from '@playwright/test';
import type { Journey } from '../src/types';

const web = process.env.REHOP_TEST_WEB ?? 'http://localhost:3000';
const api = process.env.REHOP_TEST_API ?? 'http://localhost:8000';

for (const width of [320, 390, 1366]) {
  test(`rider homepage fits at ${width}px and opens ride history`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(web);
    await expect(page.getByRole('link', { name: 'RIDE & SEEK home' })).toBeVisible();
    await expect(page).toHaveTitle(/RIDE & SEEK/);
    await expect(page.getByRole('heading', { name: 'RIDE & SEEK' })).toBeInViewport();
    await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'smooth');
    await expect(page.locator('main .ride-screen')).toHaveCSS('animation-name', 'ride-reveal');
    await page.getByRole('link', { name: 'How it works' }).click();
    await expect(page).toHaveURL(/#ride-features$/);
    const features = page.getByRole('region', { name: 'How RIDE & SEEK works' });
    await expect(features.getByRole('listitem')).toHaveCount(3);
    await expect(features.getByText(/Postgres saves the simulated rides/)).toBeVisible();
    const titles = await features.getByRole('heading', { level: 3 }).allTextContents();
    expect(titles).toEqual(['Plan with live traffic', 'Get a backup when plans change', 'Resume a saved ride']);
    await page.getByRole('link', { name: 'Plan your ride' }).click();
    await expect(page).toHaveURL(/#trip-planner$/);
    await expect(page.getByRole('heading', { name: 'Where to?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review trip details' })).toBeVisible();
    const protection = page.getByRole('region', { name: 'Pickup protection' });
    await expect(protection.getByText('Driver stalls')).toBeVisible();
    await expect(protection.getByText('Driver cancels')).toBeVisible();
    await expect(page.getByRole('link', { name: /demo/i })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.getByRole('navigation').getByRole('link', { name: 'Your rides' }).click();
    await expect(page.getByRole('heading', { name: 'No rides yet' })).toBeVisible();
  });
}

test('the intro uses its poster with reduced motion enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(web);
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
  await expect(page.locator('main .ride-screen')).toHaveCSS('animation-name', 'none');
  const intro = page.getByRole('region', { name: 'RIDE & SEEK' });
  const video = intro.locator('video');
  await expect(video).not.toHaveAttribute('src');
  await expect(video).toHaveAttribute('poster', /ride-seek-intro\.webp/);
  await expect(intro.getByRole('button', { name: /intro/i })).toHaveCount(0);
});

test('shared controls navigate home and traverse the current app history', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto(`${web}/book`);
  const navigation = page.getByRole('navigation', { name: 'Page navigation' });
  const back = navigation.getByRole('button', { name: 'Back' });
  const forward = navigation.getByRole('button', { name: 'Forward' });
  const tabs = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(back).toBeDisabled();
  await expect(forward).toBeDisabled();
  await tabs.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { name: 'RIDE & SEEK' })).toBeVisible();
  await tabs.getByRole('link', { name: 'Your rides' }).click();
  await expect(page).toHaveURL(/\/trips$/);
  await back.click();
  await expect(page).toHaveURL(`${web}/`);
  await forward.click();
  await expect(page).toHaveURL(/\/trips$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('a rider can book and track a ride on a compact phone', async ({ page, request }) => {
  await page.setViewportSize({ width: 320, height: 690 });
  await page.route('**/api/maps', (route) => route.fulfill({ json: {
    coordinates: [[80.153, 12.84], [80.167, 12.98]], distanceMeters: 2200,
    durationSeconds: 160, calculatedAt: '2026-11-23T08:30:00Z',
  } }));
  await page.goto(`${web}/book?pickup=Chennai+Central+Railway+Station&dropoff=Chennai+Egmore+Railway+Station`);
  await expect(page.getByRole('switch', { name: /^Auto-rebook if my driver cancels/ })).not.toBeChecked();
  await page.getByRole('spinbutton', { name: 'Max fare (₹)' }).fill('300');
  const getRecommendation = page.getByRole('button', { name: 'Find my ride' });
  await getRecommendation.click();

  const recommendation = page.getByRole('region', { name: 'Recommended ride' });
  await expect(recommendation.getByText('Provider B', { exact: true })).toBeVisible();
  await expect(recommendation.getByText('4 min', { exact: true })).toBeVisible();
  await expect(recommendation.getByText('₹285', { exact: true })).toBeVisible();
  const alternatives = page.getByRole('region', { name: 'Other provider estimates' });
  await expect(alternatives.getByRole('listitem')).toHaveCount(3);
  await expect(alternatives.getByText('Above max fare')).toHaveCount(3);
  await expect(alternatives.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Book', exact: true })).toHaveCount(1);
  await expect(page.getByRole('radiogroup')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const started = Date.now();
  await recommendation.getByRole('button', { name: 'Book', exact: true }).click();
  const progress = page.getByRole('dialog', { name: 'Booking progress' });
  await expect(progress).toBeVisible();
  await expect(progress.locator('video')).toHaveAttribute('src', '/images/booking-background.mp4');
  await expect(progress.getByRole('heading', { name: 'Ride booked' })).toBeVisible();
  await expect(page).toHaveURL(/\/journey\/[^/?]+$/);
  expect(Date.now() - started).toBeGreaterThanOrEqual(2500);
  const approach = page.getByRole('img', { name: /^Simulated driver approach/ });
  const cab = approach.locator('[data-pickup-cab]');
  await expect(cab).toBeVisible();
  await expect(cab).toHaveCSS('width', '34px');
  await expect(cab).toHaveCSS('perspective', 'none');
  const initialPosition = await cab.getAttribute('style');
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  const first: Journey = await (await request.get(`${api}/api/v1/journeys/${id}`)).json();
  expect(first.policy.max_total_fare_inr).toBe(300);
  await expect.poll(async () => {
    const updated: Journey = await (await request.get(`${api}/api/v1/journeys/${id}`)).json();
    return updated.active_ride?.distance_to_pickup_m;
  }, { timeout: 12_000 }).toBeLessThan(first.active_ride!.distance_to_pickup_m);
  await expect.poll(() => cab.getAttribute('style')).not.toBe(initialPosition);
  await expect(page.getByRole('button', { name: /advance|simulate/i })).toHaveCount(0);
  const tabs = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(tabs.getByRole('link')).toHaveText(['Home', 'Track ride']);
  await expect(tabs.getByRole('link', { name: 'Track ride' })).toHaveAttribute('href', `/journey/${id}`);
  await expect(page.getByRole('navigation', { name: 'Page navigation' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /your rides/i })).toHaveCount(0);
  const otherTab = await page.context().newPage();
  await otherTab.setViewportSize({ width: 1366, height: 768 });
  for (const path of ['/', '/book', '/trips', '/compare']) {
    await otherTab.goto(web + path);
    await expect(otherTab).toHaveURL(`${web}/journey/${id}`);
    await expect(otherTab.getByRole('heading', { name: 'Your pickup' })).toBeVisible();
    await expect(otherTab.getByRole('navigation', { name: 'Main navigation' }).getByRole('link')).toHaveText(['Home', 'Track ride']);
  }
  await otherTab.close();
  await tabs.getByRole('link', { name: 'Home' }).click();
  await expect(page).toHaveURL(web + '/home');
  const update = page.getByRole('region', { name: 'Ride update' });
  await expect(update.getByRole('status')).toContainText('Your ride is on the way');
  await expect(page.getByRole('button', { name: 'Review trip details' })).toHaveCount(0);
  const arrived = await request.post(`${api}/api/v1/journeys/${id}/tick`, { data: { steps: 24 } });
  expect(arrived.ok()).toBe(true);
  await expect(update.getByRole('status')).toContainText('Your driver has arrived');
  await update.getByRole('link', { name: 'Confirm boarding' }).click();
  await page.getByRole('button', { name: 'Confirm boarding' }).click();
  await expect(page.getByRole('heading', { name: 'Trip progress' })).toBeVisible();
  await expect(tabs.getByRole('link')).toHaveText(['Home', 'Track ride']);
  await tabs.getByRole('link', { name: 'Home' }).click();
  await expect(update.getByRole('status')).toContainText('You’re on your way');
  await expect(update.getByRole('status')).toContainText('Trip completed', { timeout: 12_000 });
  await expect(page).toHaveURL(web + '/home');
  await update.getByRole('link', { name: 'View trip receipt' }).click();
  await expect(tabs.getByRole('link')).toHaveText(['Home', 'Book', 'Your rides'], { timeout: 12_000 });
  await expect(page.getByRole('navigation', { name: 'Page navigation' })).toBeVisible();
  const receipt = page.getByRole('region', { name: 'Trip completed' });
  const receiptTitle = receipt.getByRole('heading', { name: 'Trip completed' });
  await expect(receiptTitle).toBeFocused();
  await expect(receipt).toHaveCSS('animation-name', 'ride-reveal');
  await expect(receiptTitle).toHaveCSS('color', 'rgb(255, 253, 248)');
  await expect(receipt.getByText('₹285', { exact: true })).toBeVisible();
  await expect(receipt.getByText('3 min', { exact: true })).toBeVisible();
  await expect(receipt.getByText('2.2 km', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Trip progress' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.reload();
  await expect(receipt.getByText('2.2 km', { exact: true })).toBeVisible();
  const bookAgain = receipt.getByRole('link', { name: 'Book another ride' });
  await expect(bookAgain).toBeInViewport({ ratio: 1 });
  await bookAgain.click();
  await expect(page).toHaveURL(`${web}/book`);
  await expect(page.getByRole('button', { name: 'Find my ride' })).toBeVisible();
  await tabs.getByRole('link', { name: 'Your rides' }).click();
  await expect(page.getByText('Arrived', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Delete ride:/ }).click();
  await page.getByRole('button', { name: 'Delete ride', exact: true }).click();
  await expect(page.getByText('Ride deleted.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'No rides yet' })).toBeVisible();
});

test('a fare below every estimate prevents booking and can be edited', async ({ page }) => {
  await page.goto(`${web}/book?pickup=Chennai+Central+Railway+Station&dropoff=Chennai+Airport`);
  const fare = page.getByRole('spinbutton', { name: 'Max fare (₹)' });
  await fare.fill('200');
  await page.getByRole('button', { name: 'Find my ride' }).click();
  await expect(page.getByRole('heading', { name: 'No rides within your budget' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Provider estimates', exact: true }).getByRole('listitem')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Book', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit max fare' }).click();
  await expect(fare).toHaveValue('200');
  await expect(page.getByRole('textbox', { name: 'Pickup location' })).toHaveValue('Chennai Central Railway Station');
  await expect(page.getByRole('textbox', { name: 'Destination' })).toHaveValue('Chennai Airport');
});


test('a closed tab restores the same ride and opens an unseen receipt once', async ({ context, page, request }) => {
  await context.route('**/api/maps', (route) => route.fulfill({ json: {
    coordinates: [[80.276308, 13.082590], [80.262770, 13.079400]],
    distanceMeters: 2200, durationSeconds: 160, calculatedAt: '2026-11-23T08:30:00Z',
  } }));
  await page.goto(`${web}/book?pickup=Chennai+Central+Railway+Station&dropoff=Chennai+Egmore+Railway+Station`);
  await page.getByRole('button', { name: 'Find my ride' }).click();
  await page.getByRole('button', { name: 'Book', exact: true }).click();
  await expect(page).toHaveURL(/\/journey\/[^/?]+$/);
  const tracking = page.url();
  const id = new URL(tracking).pathname.split('/').at(-1)!;
  const endpoint = `${api}/api/v1/journeys/${id}`;
  await expect(page.getByRole('heading', { name: 'Your pickup' })).toBeVisible();
  await page.close();

  const advanced = await request.post(`${endpoint}/tick`, { data: { steps: 24 } });
  expect(advanced.ok()).toBe(true);
  const reopened = await context.newPage();
  await reopened.goto(web);
  await expect(reopened).toHaveURL(tracking);
  await expect(reopened.getByRole('button', { name: 'Confirm boarding' })).toBeVisible();
  const confirmed = reopened.waitForResponse(response =>
    response.request().method() === 'POST' && response.url().endsWith('/pickup/confirm'));
  await reopened.getByRole('button', { name: 'Confirm boarding' }).click();
  const boarded: Journey = await (await confirmed).json();
  const arrival = Date.parse(boarded.arrives_at ?? '');
  expect(arrival).toBeGreaterThan(Date.now());
  await expect(reopened.getByRole('heading', { name: 'Trip progress' })).toBeVisible();
  await reopened.reload();
  await expect(reopened).toHaveURL(tracking);
  await expect(reopened.getByRole('heading', { name: 'Trip progress' })).toBeVisible();
  const saved: Journey = await (await request.get(endpoint)).json();
  expect(saved.arrives_at).toBe(boarded.arrives_at);
  await reopened.close();

  await expect.poll(Date.now, { timeout: 12_000 }).toBeGreaterThan(arrival);
  const returned = await context.newPage();
  await returned.goto(web);
  await expect(returned).toHaveURL(tracking);
  await expect(returned.getByRole('heading', { name: 'Trip completed' })).toBeVisible();
  await expect(returned.getByText('2.2 km', { exact: true })).toBeVisible();
  await returned.getByRole('link', { name: 'Book another ride' }).click();
  await expect(returned).toHaveURL(`${web}/book`);
  await returned.close();
  const home = await context.newPage();
  await home.goto(web);
  await expect(home.getByRole('button', { name: 'Review trip details' })).toBeVisible();
  await expect(home).toHaveURL(web + '/');
});

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
    await page.getByRole('link', { name: 'Plan your ride' }).click();
    await expect(page).toHaveURL(/#trip-planner$/);
    await expect(page.getByRole('heading', { name: 'Where to?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review trip details' })).toBeInViewport();
    await expect(page.getByRole('link', { name: /demo/i })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.getByRole('navigation').getByRole('link', { name: 'Your rides' }).click();
    await expect(page.getByRole('heading', { name: 'No rides yet' })).toBeVisible();
  });
}

test('the intro can be played and paused with reduced motion enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(web);
  const intro = page.getByRole('region', { name: 'RIDE & SEEK' });
  const video = intro.locator('video');
  await expect(video).not.toHaveAttribute('src');
  await intro.getByRole('button', { name: 'Play intro' }).click();
  await expect(intro.getByRole('button', { name: 'Pause intro' })).toBeVisible();
  await intro.getByRole('button', { name: 'Pause intro' }).click();
  await expect(intro.getByRole('button', { name: 'Play intro' })).toBeVisible();
});

test('a rider can set a five-minute maximum and confirm the recommended ride', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto(web);
  const wait = page.getByRole('combobox', { name: 'Maximum pickup wait' });
  await expect(wait).toHaveValue('10');
  await wait.selectOption('5');
  await page.getByRole('button', { name: 'Review trip details' }).click();
  await expect(page.getByRole('slider', { name: 'Maximum pickup wait' })).toHaveValue('5');
  const getRecommendation = page.getByRole('button', { name: 'Find my ride' });
  await expect(getRecommendation).toBeInViewport({ ratio: 0.9 });
  await getRecommendation.click();

  const recommendation = page.getByRole('region', { name: 'Provider B' });
  await expect(recommendation.getByText('RIDE & SEEK recommends')).toBeVisible();
  await expect(recommendation.getByText('4 min', { exact: true })).toBeVisible();
  await expect(page.getByRole('radiogroup')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await recommendation.getByRole('button', { name: 'Book with Provider B' }).click();
  const confirmation = page.getByRole('dialog');
  await expect(confirmation.getByRole('heading', { name: /booking confirmed/i })).toBeVisible();
  await confirmation.getByRole('button', { name: 'Track your ride' }).click();
  await expect(page).toHaveURL(/\/journey\/[^/?]+$/);
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  const first: Journey = await (await request.get(`${api}/api/v1/journeys/${id}`)).json();
  await expect.poll(async () => {
    const updated: Journey = await (await request.get(`${api}/api/v1/journeys/${id}`)).json();
    return updated.active_ride?.distance_to_pickup_m;
  }, { timeout: 12_000 }).toBeLessThan(first.active_ride!.distance_to_pickup_m);
  await expect(page.getByRole('button', { name: /advance|simulate/i })).toHaveCount(0);
  await page.getByRole('navigation').getByRole('link', { name: 'Your rides' }).click();
  await expect(page.getByRole('link', { name: /VIT Chennai.*Chennai Airport/ })).toHaveAttribute('href', `/journey/${id}`);
});

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
  await page.goto(web);
  await page.getByRole('button', { name: 'Review trip details' }).click();
  await expect(page.getByRole('switch', { name: /^Auto-rebook if my driver cancels/ })).not.toBeChecked();
  const getRecommendation = page.getByRole('button', { name: 'Find my ride' });
  await getRecommendation.click();

  const recommendation = page.getByRole('region', { name: 'Recommended ride' });
  await expect(recommendation.getByText('4 min', { exact: true })).toBeVisible();
  await expect(page.getByRole('radiogroup')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await recommendation.getByRole('button', { name: 'Book', exact: true }).click();
  const confirmation = page.getByRole('dialog');
  await expect(confirmation.getByRole('heading', { name: /booking confirmed/i })).toBeVisible();
  const track = confirmation.getByRole('button', { name: 'Track your ride' });
  await expect(track).toBeInViewport({ ratio: 1 });
  const sheet = (await confirmation.boundingBox())!;
  expect(sheet.x).toBe(0);
  expect(sheet.width).toBe(320);
  expect(sheet.y + sheet.height).toBe(690);
  await track.click();
  await expect(page).toHaveURL(/\/journey\/[^/?]+$/);
  await expect(page.getByRole('img', { name: /^Simulated driver approach/ })).toBeVisible();
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

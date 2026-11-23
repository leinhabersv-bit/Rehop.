import { expect, test } from '@playwright/test';

const web = process.env.REHOP_TEST_WEB ?? 'http://localhost:3000';

test('the cinematic hero can pause, resume and switch to a different clip', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  // Select the first available clip at each transition.
  await page.addInitScript(() => { Math.random = () => 0; });
  await page.goto(web);
  const hero = page.getByRole('region', { name: 'Your ride. No interruptions.' });
  const film = hero.locator('video');
  const pause = page.getByRole('button', { name: 'Pause background video' });

  await expect(pause).toBeVisible();
  await expect(film).toHaveAttribute('src', '/hero/roundabout.mp4');
  await expect.poll(() => film.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0);
  await pause.click();
  await expect.poll(() => film.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
  await page.getByRole('button', { name: 'Play background video' }).click();
  await expect(pause).toBeVisible();

  await film.evaluate((video: HTMLVideoElement) => { video.currentTime = video.duration - 0.1; });
  await expect(film).toHaveAttribute('src', '/hero/night-street.mp4');
  await expect(pause).toBeVisible();
  await expect(hero.getByRole('link', { name: 'Find a ride' })).toBeInViewport();
  await expect(hero.getByRole('link', { name: 'Try recovery demo' })).toBeInViewport();
});

test('mobile reduced motion shows the poster without fetching a clip', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => { Math.random = () => 0.9; });
  const clips: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('.mp4')) clips.push(request.url());
  });
  await page.goto(web);
  const hero = page.getByRole('region', { name: 'Your ride. No interruptions.' });
  const film = hero.locator('video');
  await expect(hero.getByRole('link', { name: 'Find a ride' })).toBeInViewport();
  await expect(hero.getByRole('link', { name: 'Try recovery demo' })).toBeInViewport();
  await expect(film).toHaveCount(0);
  expect(clips).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await page.getByRole('button', { name: 'Play background video' }).click();
  await expect(film).toHaveAttribute('src', '/hero/city-crossing.mp4');
  await expect(page.getByRole('button', { name: 'Pause background video' })).toBeVisible();
});

test('a rider can set a five-minute maximum and confirm the recommended ride', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto(web);
  const wait = page.getByRole('combobox', { name: 'Maximum pickup wait' });
  await expect(wait).toHaveValue('10');
  await wait.selectOption('5');
  await page.getByRole('button', { name: 'Review trip details' }).click();
  await expect(page.getByRole('slider', { name: 'Maximum pickup wait' })).toHaveValue('5');
  const getRecommendation = page.getByRole('button', { name: 'Get ReHop’s recommendation' });
  await expect(getRecommendation).toBeInViewport({ ratio: 0.9 });
  await getRecommendation.click();

  const recommendation = page.getByRole('region', { name: 'Provider B' });
  await expect(recommendation.getByText('ReHop recommends')).toBeVisible();
  await expect(recommendation.getByText('4 min', { exact: true })).toBeVisible();
  await expect(page.getByRole('radiogroup')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await recommendation.getByRole('button', { name: 'Book with Provider B' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: /booking confirmed/i })).toBeVisible();
});

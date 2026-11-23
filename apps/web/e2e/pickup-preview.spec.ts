import { expect, test } from '@playwright/test';

const web = process.env.REHOP_TEST_WEB ?? 'http://localhost:3000';

for (const width of [390, 1366]) {
  test(`pickup preview loads and fits at ${width}px`, async ({ page }) => {
    const reducedMotion = width === 390 ? 'reduce' : 'no-preference';
    await page.setViewportSize({ width, height: 850 });
    await page.emulateMedia({ reducedMotion });
    await page.goto(web);

    const preview = page.getByRole('figure', { name: 'Simulated pickup preview' });
    const photo = preview.getByRole('img');
    await expect(preview).toBeVisible();
    await expect(preview.getByText('Simulated pickup', { exact: true })).toBeVisible();
    await expect(preview.getByText('Backup quote', { exact: true })).toBeVisible();
    expect(await photo.evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      return image.naturalWidth > 0;
    })).toBe(true);

    const bounds = await preview.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(850);
    const motion = await photo.evaluate((image) => getComputedStyle(image).animationName);
    expect(motion === 'none').toBe(reducedMotion === 'reduce');
  });
}

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

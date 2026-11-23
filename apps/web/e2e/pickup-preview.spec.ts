import { expect, test } from '@playwright/test';

const web = process.env.REHOP_TEST_WEB ?? 'http://localhost:3000';

for (const width of [390, 1440]) {
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

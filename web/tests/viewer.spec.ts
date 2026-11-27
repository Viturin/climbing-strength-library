import { expect, test } from '@playwright/test';

test('renders the model and supports playback and view changes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.stage')).toHaveAttribute('data-status', 'ready');
  const pause = page.getByRole('button', { name: 'Pause' });
  await pause.click();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Underhand', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chin-up' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Underhand', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Overhand', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pull-up', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Side' }).click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Front' }).click();
  await page.getByRole('button', { name: 'Replay' }).click();
  await expect(pause).toBeVisible();
});

test('honors reduced motion on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('shows the poster and cue when the model fails', async ({ page }) => {
  await page.route('**/pull-up.glb', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('viewer is unavailable');
  const poster = page.getByRole('img', { name: 'Mannequin hanging from a pull-up bar' });
  await expect(poster).toBeVisible();
  await expect.poll(() => poster.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText('Hang from the bar.', { exact: false })).toBeVisible();
});

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { Event, Journey } from '../src/types';

const web = process.env.REHOP_TEST_WEB ?? 'http://localhost:3000';
const api = process.env.REHOP_TEST_API ?? 'http://localhost:8000';

async function getJourney(request: APIRequestContext, id: string): Promise<Journey> {
  const response = await request.get(`${api}/api/v1/journeys/${id}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function reachQuotes(page: Page) {
  await expect(page.getByRole('radiogroup', { name: 'Simulated ride quotes' })).toBeVisible();
  const id = new URL(page.url()).searchParams.get('journey');
  if (!id) throw new Error('Comparison URL is missing the backend journey ID');
  return id;
}

async function bookWithProviderA(page: Page) {
  const option = page.getByRole('radio', { name: 'Provider A' });
  await option.press('Space');
  await expect(option).toBeChecked();
  await page.getByRole('button', { name: 'Book with Provider A' }).click();
}

test('interprets, books, switches and confirms pickup on one simulated journey', async ({ page, request }) => {
  await page.goto(web);
  await page.getByRole('link', { name: 'Find a ride' }).first().click();
  await page.locator('textarea').fill('From VIT Chennai to Chennai Airport, pickup within 15 minutes, under ₹650.');
  const interpretation = page.waitForResponse((response) => response.url().endsWith('/intent/parse') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /interpret/i }).click();
  expect(await (await interpretation).json()).toMatchObject({
    pickup: 'VIT Chennai', dropoff: 'Chennai Airport', need_in_minutes: 15, requires_confirmation: true,
  });
  await page.getByRole('button', { name: 'Use these trip details' }).click();
  await page.getByRole('checkbox', { name: /simulate a stalled pickup/i }).check();
  await page.getByRole('button', { name: 'Find available rides' }).click();
  const id = await reachQuotes(page);
  const quoted = await getJourney(request, id);
  expect(quoted).toMatchObject({ scenario: 'S03', state: 'WAITING_FOR_RIDE', policy: { max_total_fare_inr: 650 } });
  expect(quoted.quotes).toHaveLength(4);
  expect(Date.parse(quoted.need_by) - Date.parse(quoted.simulated_time)).toBe(15 * 60_000);

  await bookWithProviderA(page);
  const confirmation = page.getByRole('dialog');
  await expect(confirmation.getByRole('heading', { name: /booking confirmed/i })).toBeVisible();
  const original = await getJourney(request, id);
  expect(original).toMatchObject({ state: 'MONITORING', booking_uncertain: false, active_ride: { provider: 'PROVIDER_A', state: 'DRIVER_EN_ROUTE' } });
  await confirmation.getByRole('button', { name: 'Track your ride' }).click();
  await expect(page).toHaveURL(`${web}/journey/${id}`);
  await page.getByRole('button', { name: 'Advance 2 min' }).click();
  await page.getByRole('button', { name: 'Review switch & fee' }).click();
  const approval = page.getByRole('dialog');
  await expect(approval.getByRole('button', { name: 'Go back' })).toBeFocused();
  const awaiting = await getJourney(request, id);
  expect(awaiting).toMatchObject({
    state: 'AWAITING_APPROVAL', active_ride_id: original.active_ride_id, pending_backup: { provider: 'PROVIDER_B' },
    cancellation_fee_notice: { fee_confirmed: false, actual_fee_inr: null },
  });
  await approval.getByRole('button', { name: 'Approve switch' }).click();
  await expect.poll(async () => (await getJourney(request, id)).active_ride?.provider).toBe('PROVIDER_B');
  await page.getByRole('button', { name: 'Advance 2 min' }).click();
  await page.getByRole('button', { name: 'Confirm boarding' }).click();
  await expect(page.getByText(/pickup confirmed/i).first()).toBeVisible();
  const complete = await getJourney(request, id);
  expect(complete).toMatchObject({ state: 'PICKUP_CONFIRMED', active_ride: { provider: 'PROVIDER_B', state: 'IN_PROGRESS' } });
  expect(complete.active_ride_id).not.toBe(original.active_ride_id);
  await expect(page).toHaveURL(`${web}/journey/${id}`);
  await expect(page.getByRole('button', { name: 'Approve switch' })).toHaveCount(0);

  const response = await request.get(`${api}/api/v1/journeys/${id}/events`);
  expect(response.ok()).toBe(true);
  const { events }: { events: Event[] } = await response.json();
  expect(events.map(({ seq }) => seq)).toEqual(events.map((_, index) => index + 1));
  const types = events.map(({ type }) => type);
  const refresh = types.indexOf('QUOTE_REFRESHED');
  const cancel = types.indexOf('RIDE_CANCEL_CONFIRMED');
  const replacement = types.lastIndexOf('RIDE_CONFIRMED');
  const pickup = types.indexOf('PICKUP_CONFIRMED');
  expect(refresh > 0 && refresh < cancel && cancel < replacement && replacement < pickup).toBe(true);
});

async function prepareManualBooking(page: Page) {
  await page.goto(`${web}/book`);
  await page.getByRole('button', { name: 'Find available rides' }).click();
  return reachQuotes(page);
}

test('keeps invalid setup input out of the journey API', async ({ page }) => {
  await page.goto(`${web}/book?needIn=Infinity`);
  await expect(page.getByRole('slider', { name: 'Pickup Deadline' })).toHaveValue('20');
  let createRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/journeys') {
      createRequests += 1;
    }
  });
  await page.getByRole('textbox', { name: 'Pickup location' }).fill('Unlisted pickup');
  await page.getByRole('button', { name: 'Find available rides' }).click();
  await expect(page.locator('form').getByRole('alert')).toHaveText(/Choose both places from the simulator location list/);
  await expect(page).toHaveURL(`${web}/book?needIn=Infinity`);
  expect(createRequests).toBe(0);
});

test('reconciles a server error after booking from the authoritative journey', async ({ page, request }) => {
  const id = await prepareManualBooking(page);
  let mutations = 0;
  await page.route(`**/journeys/${id}/book`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    mutations += 1;
    const committed = await route.fetch();
    expect(committed.ok()).toBe(true);
    await route.fulfill({ response: committed, status: 500, json: { error: { code: 'HTTP_500', message: 'Simulated response failure' } } });
  });
  const readback = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(`/journeys/${id}`) && response.request().method() === 'GET');
  await bookWithProviderA(page);
  expect(await (await readback).json()).toMatchObject({ active_ride: { provider: 'PROVIDER_A' } });
  await expect(page.getByRole('dialog').getByRole('heading', { name: /booking confirmed/i })).toBeVisible();
  expect(mutations).toBe(1);
  expect(await getJourney(request, id)).toMatchObject({ active_ride: { provider: 'PROVIDER_A' }, booking_uncertain: false });
});

test('retries an interrupted booking with the original idempotency key', async ({ page, request }) => {
  const id = await prepareManualBooking(page);
  const attempts: unknown[] = [];
  await page.route(`**/journeys/${id}/book`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    attempts.push(route.request().postDataJSON());
    if (attempts.length === 1) await route.abort('timedout');
    else await route.continue();
  });
  await bookWithProviderA(page);
  await page.getByRole('button', { name: 'Check booking status' }).click();
  expect(await getJourney(request, id)).toMatchObject({ state: 'WAITING_FOR_RIDE', active_ride: null });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry original request' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: /booking confirmed/i })).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
});

test('S12 leaves an unresolved provider outcome visible with booking blocked', async ({ page, request }) => {
  await page.goto(`${web}/demo`);
  await page.getByRole('button', { name: /run s12\b/i }).click();
  const id = await reachQuotes(page);
  await bookWithProviderA(page);
  await expect(page.getByRole('alert').filter({ hasText: /unknown|has yet to confirm/i })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const tracking = page.getByRole('button', { name: 'Open journey tracking' });
  await expect(tracking).toBeVisible();
  await expect(page.getByRole('button', { name: /book with|retry original request/i })).toHaveCount(0);
  expect(await getJourney(request, id)).toMatchObject({ state: 'RECONCILING', booking_uncertain: true, active_ride: null });
  await tracking.click();
  await expect(page.getByRole('status').filter({ hasText: /booking status is unknown/i })).toBeVisible();
});

test('blocks approval when the journey changes while the rider is reviewing the offer', async ({ page, request }) => {
  await page.goto(`${web}/demo`);
  await page.getByRole('button', { name: /run s03\b/i }).click();
  await expect(page).toHaveURL(/\/journey\/[^/?]+$/);
  const id = new URL(page.url()).pathname.split('/').at(-1)!;
  await page.getByRole('button', { name: 'Advance 2 min' }).click();
  const review = page.getByRole('button', { name: /review switch.*fee/i });
  await review.click();
  const dialog = page.getByRole('dialog');
  const approval = dialog.getByRole('button', { name: 'Approve switch' });
  await expect(approval).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Go back' })).toBeFocused();
  const observed = await getJourney(request, id);

  const tick = await request.post(`${api}/api/v1/journeys/${id}/tick`, { data: { steps: 1 } });
  expect(tick.ok()).toBe(true);
  expect((await tick.json()).version).toBeGreaterThan(observed.version);
  await expect(dialog.getByText(/journey changed/i)).toBeVisible();
  await expect(approval).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(review).toBeFocused();
  expect(await getJourney(request, id)).toMatchObject({
    state: 'AWAITING_APPROVAL', active_ride_id: observed.active_ride_id, recovery_attempts: 0,
  });
});

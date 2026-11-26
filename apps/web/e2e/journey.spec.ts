import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { Event, Journey } from '../src/types';

const web = process.env.REHOP_TEST_WEB ?? 'http://localhost:3000';
const api = process.env.REHOP_TEST_API ?? 'http://localhost:8000';

async function getJourney(request: APIRequestContext, id: string): Promise<Journey> {
  const response = await request.get(`${api}/api/v1/journeys/${id}`);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function tick(request: APIRequestContext, id: string, steps: number) {
  const response = await request.post(`${api}/api/v1/journeys/${id}/tick`, { data: { steps } });
  expect(response.ok()).toBe(true);
}

async function openScenario(page: Page, request: APIRequestContext, scenario: string, quotes = false) {
  const response = await request.post(`${api}/api/v1/scenarios/${scenario}/run`, { data: {} });
  expect(response.ok()).toBe(true);
  const journey: Journey = await response.json();
  await page.goto(quotes ? `${web}/compare?journey=${journey.id}` : `${web}/journey/${journey.id}`);
  return journey;
}

async function reachQuotes(page: Page) {
  await expect(page.getByRole('heading', { name: 'Review your ride' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recommended ride' })).toBeVisible();
  const id = new URL(page.url()).searchParams.get('journey');
  if (!id) throw new Error('Comparison URL is missing the backend journey ID');
  return id;
}

async function bookRecommended(page: Page) {
  await page.getByRole('button', { name: 'Book', exact: true }).click();
}

test('interprets, books, switches and confirms pickup on one simulated journey', async ({ page, request }) => {
  await page.route('**/api/maps', (route) => route.fulfill({ json: {
    coordinates: [[80.145, 12.841], [80.168, 12.983]], distanceMeters: 20_000,
    durationSeconds: 1200, calculatedAt: '2026-11-23T08:30:00Z',
  } }));
  await page.goto(`${web}/book`);
  await page.route('**/api/v1/journeys', (route) => route.continue({ url: route.request().url() + '?scenario=S03' }));
  await page.getByText('Describe your trip with AI', { exact: true }).click();
  await page.locator('textarea').fill('From VIT Chennai to Chennai Airport, pickup within 15 minutes, under ₹650.');
  const interpretation = page.waitForResponse((response) => response.url().endsWith('/intent/parse') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /interpret/i }).click();
  expect(await (await interpretation).json()).toMatchObject({
    pickup: 'VIT Chennai', dropoff: 'Chennai Airport', need_in_minutes: 15, requires_confirmation: true,
  });
  await page.getByRole('button', { name: 'Use these trip details' }).click();
  await page.getByRole('switch', { name: /^Auto-rebook if my driver cancels/ }).check();
  await page.getByRole('button', { name: 'Find my ride' }).click();
  const id = await reachQuotes(page);
  const quoted = await getJourney(request, id);
  expect(quoted).toMatchObject({
    scenario: 'S03', state: 'WAITING_FOR_RIDE',
    policy: { max_total_fare_inr: 650, auto_rebook_on_confirmed_driver_cancel: true },
  });
  expect(quoted.quotes).toHaveLength(4);
  expect(Date.parse(quoted.need_by) - Date.parse(quoted.simulated_time)).toBe(10 * 60_000);
  await expect(page.getByText('Auto-rebooking is on for confirmed driver cancellations.')).toBeVisible();

  await bookRecommended(page);
  await expect(page).toHaveURL(`${web}/journey/${id}`);
  const original = await getJourney(request, id);
  expect(original).toMatchObject({ state: 'MONITORING', booking_uncertain: false, active_ride: { provider: 'PROVIDER_B', state: 'DRIVER_EN_ROUTE' } });
  await tick(request, id, 24);
  const stalledCab = page.locator('[data-pickup-cab]');
  await expect(stalledCab).toHaveAttribute('data-stalled', 'true');
  await expect(stalledCab).toHaveAttribute('style', /left:\s*0(?:\.00)?%/);
  await page.getByRole('button', { name: 'Review switch & fee' }).click();
  const approval = page.getByRole('dialog');
  await expect(approval.getByRole('button', { name: 'Go back' })).toBeFocused();
  const awaiting = await getJourney(request, id);
  expect(awaiting).toMatchObject({
    state: 'AWAITING_APPROVAL', active_ride_id: original.active_ride_id, pending_backup: { provider: expect.any(String) }, recovery_attempts: 0,
    cancellation_fee_notice: { fee_confirmed: false, actual_fee_inr: null },
  });
  const replacementProvider = awaiting.pending_backup!.provider;
  expect(replacementProvider).not.toBe(original.active_ride?.provider);
  await approval.getByRole('button', { name: 'Approve switch' }).click();
  await expect.poll(async () => (await getJourney(request, id)).active_ride?.provider).toBe(replacementProvider);
  await tick(request, id, 24);
  await page.getByRole('button', { name: 'Confirm boarding' }).click();
  await expect(page.getByText(/pickup confirmed/i).first()).toBeVisible();
  const complete = await getJourney(request, id);
  expect(complete).toMatchObject({ state: 'PICKUP_CONFIRMED', active_ride: { provider: replacementProvider, state: 'IN_PROGRESS' } });
  expect(Date.parse(complete.boarded_at ?? '')).toBeGreaterThan(0);
  const transit = page.getByRole('region', { name: 'Trip progress' });
  await expect(transit.getByText('Arrival ETA', { exact: true })).toBeVisible();
  const remaining = transit.getByText('Remaining distance', { exact: true }).locator('..').locator('dd');
  await expect(remaining).toHaveText(/\d+\.\d km/);
  const startingDistance = await remaining.textContent();
  await expect(remaining).not.toHaveText(startingDistance!);
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
  await page.getByRole('button', { name: 'Find my ride' }).click();
  return reachQuotes(page);
}

test('keeps invalid setup input out of the journey API', async ({ page }) => {
  await page.goto(`${web}/book`);
  let createRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/journeys') {
      createRequests += 1;
    }
  });
  await page.getByRole('textbox', { name: 'Pickup location' }).fill('Unlisted pickup');
  await page.getByRole('button', { name: 'Find my ride' }).click();
  await expect(page.locator('form').getByRole('alert')).toHaveText('Search for your pickup and destination, then choose a result for each.');
  await expect(page).toHaveURL(`${web}/book`);
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
  await bookRecommended(page);
  expect(await (await readback).json()).toMatchObject({ active_ride: { provider: 'PROVIDER_B' } });
  await expect(page).toHaveURL(`${web}/journey/${id}`);
  await expect(page.getByRole('heading', { name: 'Your pickup' })).toBeVisible();
  expect(mutations).toBe(1);
  expect(await getJourney(request, id)).toMatchObject({ active_ride: { provider: 'PROVIDER_B' }, booking_uncertain: false });
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
  await bookRecommended(page);
  await page.getByRole('button', { name: 'Check booking status' }).click();
  expect(await getJourney(request, id)).toMatchObject({ state: 'WAITING_FOR_RIDE', active_ride: null });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry original request' }).click();
  await expect(page).toHaveURL(`${web}/journey/${id}`);
  await expect(page.getByRole('heading', { name: 'Your pickup' })).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
});

test('S12 leaves an unresolved provider outcome visible with booking blocked', async ({ page, request }) => {
  await openScenario(page, request, 'S12', true);
  const id = await reachQuotes(page);
  await bookRecommended(page);
  await expect(page).toHaveURL(`${web}/journey/${id}`);
  await expect(page.getByRole('button', { name: /^(Book|Retry original request)$/i })).toHaveCount(0);
  expect(await getJourney(request, id)).toMatchObject({ state: 'RECONCILING', booking_uncertain: true, active_ride: null });
  await expect(page.getByRole('status').filter({ hasText: /booking status is unknown/i })).toBeVisible();
});

test('tracking shows an automatically booked replacement after confirmed driver cancellation', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const original = await openScenario(page, request, 'S04');
  const id = original.id;
  expect(original).toMatchObject({
    scenario: 'S04', active_ride: { provider: 'PROVIDER_A' },
    policy: { auto_rebook_on_confirmed_driver_cancel: true },
  });

  await tick(request, id, 8);
  await expect(page.getByRole('status').filter({ hasText: 'Replacement confirmed with Provider B' })).toBeVisible();
  await expect(page.getByRole('button', { name: /review switch|review replacement|approve/i })).toHaveCount(0);
  const recovered = await getJourney(request, id);
  expect(recovered).toMatchObject({ state: 'MONITORING', pending_backup: null, recovery_attempts: 1,
    last_ride: { state: 'DRIVER_CANCELLED', provider: 'PROVIDER_A' }, active_ride: { provider: 'PROVIDER_B' } });
  expect(recovered.active_ride_id).not.toBe(original.active_ride_id);

  const response = await request.get(`${api}/api/v1/journeys/${id}/events`);
  expect(response.ok()).toBe(true);
  const { events }: { events: Event[] } = await response.json();
  const types = events.map(({ type }) => type);
  expect(types).not.toContain('APPROVAL_REQUIRED');
  const cancellation = types.indexOf('DRIVER_CANCELLED');
  const refresh = types.indexOf('QUOTE_REFRESHED');
  expect(cancellation).toBeGreaterThan(-1);
  expect(refresh).toBeGreaterThan(cancellation);
  expect(types.lastIndexOf('RIDE_CONFIRMED')).toBeGreaterThan(refresh);

  // Seeded scenarios advance only when the test ticks the simulator.
  await tick(request, id, 1);
  const moving = await getJourney(request, id);
  expect(moving.active_ride_id).toBe(recovered.active_ride_id);
  expect(moving.active_ride!.distance_to_pickup_m).toBeLessThan(recovered.active_ride!.distance_to_pickup_m);
  await expect(page.getByText('Distance to pickup', { exact: true }).locator('..').locator('dd'))
    .toHaveText(`${(moving.active_ride!.distance_to_pickup_m / 1000).toFixed(1)} km`);

  await tick(request, id, 24);
  await page.getByRole('button', { name: 'Confirm boarding' }).click();
  await expect(page.getByRole('heading', { name: 'You’re on your way' })).toBeVisible();
  expect(await getJourney(request, id)).toMatchObject({ state: 'PICKUP_CONFIRMED', active_ride: { provider: 'PROVIDER_B' } });
});

test('pickup speed controls advance the opt-in ride and its automatic replacement', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/maps', (route) => route.fulfill({ json: {
    coordinates: [[80.275, 13.082], [80.262, 13.079]], distanceMeters: 2200,
    durationSeconds: 160, calculatedAt: '2026-11-26T13:30:00Z',
  } }));
  await page.goto(`${web}/book?pickup=Chennai+Central+Railway+Station&dropoff=Chennai+Egmore+Railway+Station`);
  await page.getByRole('switch', { name: /^Auto-rebook if my driver cancels/ }).check();
  await page.getByRole('button', { name: 'Find my ride' }).click();
  const id = await reachQuotes(page);
  await bookRecommended(page);
  await expect(page).toHaveURL(`${web}/journey/${id}`);

  const playback = page.getByRole('region', { name: 'Simulated pickup speed' });
  const normal = playback.getByRole('button', { name: 'Normal speed' });
  const fast = playback.getByRole('button', { name: /Fast-forward pickup/ });
  await expect(normal).toBeVisible();
  expect((await normal.boundingBox())!.y).toBe((await fast.boundingBox())!.y);
  await normal.click();
  await expect(playback.getByRole('status')).toHaveText('Pickup running at 1×.');
  const original = await getJourney(request, id);
  expect(original.policy.auto_rebook_on_confirmed_driver_cancel).toBe(true);
  const cancelled = await request.post(`${api}/api/v1/sim/journeys/${id}/inject`, {
    data: { kind: 'DRIVER_CANCEL', params: {} },
  });
  expect(cancelled.ok()).toBe(true);
  const replacement: Journey = await cancelled.json();
  expect(replacement.active_ride_id).not.toBe(original.active_ride_id);
  expect(replacement).toMatchObject({ recovery_attempts: 1, pending_backup: null, last_ride: { state: 'DRIVER_CANCELLED' } });

  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Replacement confirmed' })).toBeVisible();
  const change = page.waitForResponse(response => response.url().endsWith('/play') && response.request().method() === 'POST');
  await fast.click();
  expect(await (await change).json()).toEqual({ playing: true, speed: 20 });
  await page.reload();
  const board = page.getByRole('button', { name: 'Confirm boarding' });
  await expect(board).toBeEnabled({ timeout: 12_000 });
  await expect(playback).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review replacement' })).toHaveCount(0);
  expect((await getJourney(request, id)).active_ride_id).toBe(replacement.active_ride_id);
  await board.click();
  await expect(page.getByRole('heading', { name: 'Trip progress' })).toBeVisible();
  const tripSpeed = page.getByRole('region', { name: 'Simulated trip speed' });
  await tripSpeed.getByRole('button', { name: 'Normal speed' }).click();
  await expect(tripSpeed.getByRole('status')).toHaveText('Trip running at 1×.');
  const slowed = await getJourney(request, id);
  expect(slowed.destination_speed).toBe(1);
  await page.reload();
  await expect(tripSpeed.getByRole('button', { name: 'Normal speed' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Arrival ETA', { exact: true }).locator('..').locator('dd')).toHaveText(/\d/);
  await expect(page.getByText('Remaining distance', { exact: true }).locator('..').locator('dd')).toHaveText(/\d/);
  expect((await getJourney(request, id)).arrives_at).toBe(slowed.arrives_at);
  await tripSpeed.getByRole('button', { name: /Fast-forward trip/ }).click();
  await expect(tripSpeed.getByRole('status')).toHaveText('Trip running at 20×.');
  await expect(page.getByRole('heading', { name: 'Trip completed' })).toBeVisible({ timeout: 15_000 });
});

test('a driver cancellation makes manual replacement the next step when auto-rebooking is off', async ({ page, request }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`${web}/book?pickup=Chennai+Central+Railway+Station&dropoff=Chennai+Egmore+Railway+Station`);
  await expect(page.getByRole('switch', { name: /^Auto-rebook if my driver cancels/ })).not.toBeChecked();
  await page.getByRole('button', { name: 'Find my ride' }).click();
  const id = await reachQuotes(page);
  await bookRecommended(page);
  await expect(page).toHaveURL(`${web}/journey/${id}`);
  const original = await getJourney(request, id);
  expect(original.active_ride_id).toBeTruthy();
  expect(original.policy.auto_rebook_on_confirmed_driver_cancel).toBe(false);

  const cancellation = await request.post(`${api}/api/v1/sim/journeys/${id}/inject`, {
    data: { kind: 'DRIVER_CANCEL', params: {} },
  });
  expect(cancellation.ok()).toBe(true);

  await page.reload();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Home' }).click();
  const update = page.getByRole('region', { name: 'Ride update' });
  await expect(update.getByRole('status')).toContainText('Your driver cancelled');
  await update.getByRole('link', { name: 'Review replacement' }).click();
  const pickup = page.getByRole('region', { name: 'Pickup status' });
  await expect(pickup.getByRole('status').filter({ hasText: 'Your driver cancelled' })).toBeVisible();
  const review = pickup.getByRole('button', { name: 'Review replacement' });
  await expect(review).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Confirm boarding' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Book' })).toHaveCount(0);
  await expect.poll(() => getJourney(request, id)).toMatchObject({
    state: 'AWAITING_APPROVAL', active_ride: null, recovery_attempts: 0, last_ride: { state: 'DRIVER_CANCELLED' },
  });

  await review.click();
  const offer = page.getByRole('dialog', { name: 'Review replacement ride' });
  await offer.getByRole('button', { name: 'Approve replacement' }).click();
  await expect.poll(() => getJourney(request, id)).toMatchObject({
    state: 'MONITORING', pending_backup: null, recovery_attempts: 1,
    policy: { auto_rebook_on_confirmed_driver_cancel: false },
  });
  const replacement = await getJourney(request, id);
  expect(replacement.active_ride_id).not.toBe(original.active_ride_id);
  await tick(request, id, 24);
  await page.getByRole('button', { name: 'Confirm boarding' }).click();
  await expect(page.getByRole('heading', { name: 'Trip progress' })).toBeVisible();
});

test('blocks approval when the journey changes while the rider is reviewing the offer', async ({ page, request }) => {
  const { id } = await openScenario(page, request, 'S03');
  await tick(request, id, 24);
  const review = page.getByRole('button', { name: /review switch.*fee/i });
  await expect(page.getByRole('region', { name: 'Pickup status' }).getByText('Driver paused', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Jump to backup review' })).toHaveAttribute('href', '#review-switch');
  await review.click();
  const dialog = page.getByRole('dialog');
  const approval = dialog.getByRole('button', { name: 'Approve switch' });
  await expect(approval).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Go back' })).toBeFocused();
  const observed = await getJourney(request, id);

  const advance = await request.post(`${api}/api/v1/journeys/${id}/tick`, { data: { steps: 1 } });
  expect(advance.ok()).toBe(true);
  expect((await advance.json()).version).toBeGreaterThan(observed.version);
  await expect(dialog.getByText(/journey changed/i)).toBeVisible();
  await expect(approval).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(review).toBeFocused();
  expect(await getJourney(request, id)).toMatchObject({
    state: 'AWAITING_APPROVAL', active_ride_id: observed.active_ride_id, recovery_attempts: 0,
  });
});

test('cancelling an active ride restores the normal navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await prepareManualBooking(page);
  await bookRecommended(page);
  await expect(page).toHaveURL(`${web}/journey/${id}`);
  const tabs = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(tabs.getByRole('link')).toHaveText(['Home', 'Track ride']);
  await page.getByRole('button', { name: 'Cancel ride', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(tabs.getByRole('link')).toHaveText(['Home', 'Book', 'Your rides']);
  await tabs.getByRole('link', { name: 'Home' }).click();
  await expect(page).toHaveURL(web + '/');
  await expect(page.getByRole('button', { name: 'Review trip details' })).toBeVisible();
});

test('a declined booking ends the loading screen and offers fresh trip estimates', async ({ page }) => {
  const id = await prepareManualBooking(page);
  await page.route(`**/journeys/${id}/book`, (route) => route.fulfill({
    status: 409, json: { error: { code: 'BOOKING_FAILED', message: 'Provider refused the booking.' } },
  }));
  await bookRecommended(page);
  await expect(page.getByRole('region', { name: 'Recommended ride' }).getByRole('alert'))
    .toContainText('Review the trip to get fresh estimates.');
  await expect(page.getByRole('dialog', { name: 'Booking progress' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Review trip details' }).click();
  await expect(page).toHaveURL(`${web}/book?edit=${id}`);
  await expect(page.getByRole('button', { name: 'Find my ride' })).toBeVisible();
});

import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './pages-worker.mjs';

const publicOrigin = 'https://ride-and-seek-8z6.pages.dev';
const cloudOrigin = 'https://app.example.com';
const env = { APP_ORIGIN: cloudOrigin };

test('the Pages relay preserves booking requests and keeps redirects on Pages', async (t) => {
  const request = new Request(`${publicOrigin}/ride-api/api/v1/journeys?q=1`, {
    method: 'POST',
    headers: { origin: publicOrigin, cookie: 'private=value' },
    body: '{}',
  });
  t.mock.method(globalThis, 'fetch', async (upstream) => {
    assert.equal(upstream.url, `${cloudOrigin}/ride-api/api/v1/journeys?q=1`);
    assert.equal(upstream.headers.get('origin'), cloudOrigin);
    assert.equal(upstream.headers.has('cookie'), false);
    assert.equal(upstream.method, 'POST');
    assert.equal(await upstream.text(), '{}');
    return Response.redirect(`${cloudOrigin}/trips`, 303);
  });

  const response = await worker.fetch(request, env);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), `${publicOrigin}/trips`);
});

test('the Pages relay rejects cross-origin ride API requests', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => {
    throw new Error('Unexpected upstream request');
  });
  const response = await worker.fetch(new Request(`${publicOrigin}/ride-api/api/v1/journeys`, {
    method: 'POST',
    headers: { origin: cloudOrigin },
  }), env);
  assert.equal(response.status, 403);
  assert.equal(fetch.mock.callCount(), 0);
});

test('the API project receives the native FastAPI path', async (t) => {
  const apiOrigin = 'https://api.example.com';
  t.mock.method(globalThis, 'fetch', (upstream) => {
    assert.equal(upstream.url, `${apiOrigin}/api/v1/locations`);
    return Response.json({ locations: [] });
  });
  const request = new Request(`${publicOrigin}/ride-api/api/v1/locations`);
  const response = await worker.fetch(request, { ...env, RIDE_API_ORIGIN: apiOrigin });
  assert.equal(response.status, 200);
});

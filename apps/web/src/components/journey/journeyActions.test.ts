import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api/client';

afterEach(() => vi.unstubAllGlobals());

describe('Versioned journey actions', () => {
  it('sends the observed journey version and a distinct idempotency key for each action', async () => {
    const fetch = vi.fn<(url: string, options: RequestInit) => Promise<Response>>(async () => Response.json({}));
    vi.stubGlobal('fetch', fetch);
    await api.approve('journey-1', true, 12);
    await api.cancel('journey-1', 13);
    await api.confirmPickup('journey-1', 14);

    const requests = fetch.mock.calls.map(([url, options]) => ({
      endpoint: new URL(url).pathname,
      method: options.method,
      body: JSON.parse(String(options.body)),
    }));
    expect(requests.map(({ endpoint, method, body }) => [endpoint, method, body.expected_version])).toEqual([
      ['/api/v1/journeys/journey-1/rescue/approve', 'POST', 12],
      ['/api/v1/journeys/journey-1/cancel', 'POST', 13],
      ['/api/v1/journeys/journey-1/pickup/confirm', 'POST', 14],
    ]);
    expect(requests[0].body.approved).toBe(true);
    expect(requests.every(({ body }) => typeof body.idempotency_key === 'string' && body.idempotency_key.length > 0)).toBe(true);
    expect(new Set(requests.map(({ body }) => body.idempotency_key)).size).toBe(3);
  });

  it('surfaces a stale approval without silently submitting it again', async () => {
    const fetch = vi.fn(async () => Response.json({
      error: { code: 'STALE_JOURNEY_VERSION', message: 'Refresh journey state before acting.' },
    }, { status: 409 }));
    vi.stubGlobal('fetch', fetch);
    await expect(api.approve('journey-1', true, 12)).rejects.toMatchObject({ code: 'STALE_JOURNEY_VERSION' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

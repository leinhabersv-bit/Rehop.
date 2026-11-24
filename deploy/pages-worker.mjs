export default {
  async fetch(request, env) {
    const publicUrl = new URL(request.url);
    const browserOrigin = request.headers.get('origin');
    const isRideApi = publicUrl.pathname.startsWith('/ride-api/');
    if (isRideApi && browserOrigin && browserOrigin !== publicUrl.origin) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const splitApi = isRideApi && Boolean(env.RIDE_API_ORIGIN);
      const target = new URL(splitApi ? env.RIDE_API_ORIGIN : env.APP_ORIGIN);
      if (target.protocol !== 'https:' || target.origin === publicUrl.origin) {
        throw new Error('Invalid cloud origin');
      }
      target.pathname = splitApi ? publicUrl.pathname.slice('/ride-api'.length) : publicUrl.pathname;
      target.search = publicUrl.search;

      const upstream = new Request(target, request);
      for (const header of ['host', 'cookie', 'authorization']) upstream.headers.delete(header);
      if (isRideApi && browserOrigin) upstream.headers.set('origin', target.origin);
      const result = await fetch(upstream, { redirect: 'manual' });
      if (result.status === 101 || result.status < 300 || result.status >= 400) return result;

      const location = result.headers.get('location');
      if (!location) return result;
      const redirect = new URL(location, target);
      if (redirect.origin !== target.origin) return result;
      const response = new Response(result.body, result);
      response.headers.set('location', new URL(redirect.pathname + redirect.search + redirect.hash, publicUrl.origin).href);
      return response;
    } catch {
      return new Response('Ride & Seek is temporarily unavailable. Please try again.', {
        status: 503,
        headers: { 'cache-control': 'no-store' },
      });
    }
  },
};

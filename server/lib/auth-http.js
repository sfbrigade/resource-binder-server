import { fromNodeHeaders } from 'better-auth/node';

export function registerAuthRoutes (fastify, auth) {
  for (const action of ['magic-link', 'verify-email', 'reset-password']) {
    fastify.get(`/auth/${action}`, async (request, reply) => {
      return reply
        .header('Cache-Control', 'no-store')
        .header('Referrer-Policy', 'no-referrer')
        .header('Content-Security-Policy', "default-src 'none'")
        .type('text/html')
        .send('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Open your app</title><h1>Open this link on your phone</h1><p>Open this email link on the device where the app is installed. If the link has expired, request a new one in the app.</p></html>');
    });
  }
  fastify.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler (request, reply) {
      const headers = fromNodeHeaders(request.headers);
      // Always overwrite this header with Fastify's trusted connection address.
      headers.set('x-auth-client-ip', request.ip);
      const response = await auth.handler(new Request(new URL(request.url, auth.options.baseURL), {
        method: request.method,
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      }));
      reply.code(response.status);
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.send(await response.text());
    },
  });
}

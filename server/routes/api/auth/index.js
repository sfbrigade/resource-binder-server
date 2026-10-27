import { fromNodeHeaders } from 'better-auth/node';

export default async function (fastify) {
  const { auth } = fastify;
  fastify.route({
    method: ['GET', 'POST'],
    url: '/*',
    async handler (request, reply) {
      const headers = fromNodeHeaders(request.headers);
      // Always overwrite this header with Fastify's trusted connection address.
      headers.set('x-auth-client-ip', request.ip);
      const url = new URL(request.url, auth.options.baseURL);
      const response = await auth.handler(new Request(url, {
        method: request.method,
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      }));
      // Magic-link failures redirect even when success uses JSON. Keep JSON callers
      // on the confirmation form; explicit browser callbacks retain native redirects.
      const location = response.headers.get('location');
      if (url.pathname === '/api/auth/magic-link/verify' && !url.searchParams.get('callbackURL') &&
        request.headers.accept?.includes('application/json') && response.status === 302 && location) {
        const code = new URL(location, auth.options.baseURL).searchParams.get('error');
        if (code) return reply.code(400).send({ code, message: 'Unable to verify this email link.' });
      }
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

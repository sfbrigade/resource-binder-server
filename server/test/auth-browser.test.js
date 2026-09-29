import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authClient } from '../../client/src/auth-client.js';
import { build, mailToken, nodemailerMock, password } from '#test/helper.js';

test('official browser client completes authentication and administration', async (t) => {
  const app = await build(t);
  let cookie = '';
  const transport = {
    baseURL: `${process.env.BASE_URL}/api/auth`,
    async customFetchImpl (url, options) {
      const headers = new Headers(options.headers);
      headers.set('origin', process.env.BASE_URL);
      if (cookie) headers.set('cookie', cookie);
      const response = await app.inject({
        method: options.method,
        url: new URL(url).pathname + new URL(url).search,
        headers: Object.fromEntries(headers),
        payload: options.body,
      });
      if (response.cookies.length) cookie = response.cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
      return new Response(response.body || null, { status: response.statusCode, headers: response.headers });
    },
  };
  const mail = nodemailerMock.mock;
  process.env.SMTP_ENABLED = 'true';
  process.env.VITE_FEATURE_REGISTRATION = 'true';
  const email = 'browser@example.com';
  const signup = await authClient.signUp.email({ firstName: 'Browser', lastName: 'User', name: 'Browser User', email, password }, transport);
  assert.equal(signup.token, null);
  assert.equal(cookie, '');
  await assert.rejects(authClient.signIn.email({ email, password }, transport), { status: 403 });
  await authClient.sendVerificationEmail({ email }, transport);
  const verificationToken = await mailToken(mail);
  await authClient.verifyEmail({ query: { token: verificationToken } }, transport);
  const login = await authClient.signIn.email({ email, password }, transport);
  assert.equal(login.user.id, signup.user.id);
  assert.ok(cookie);
  const profile = await app.inject({ url: '/api/users/me', headers: { cookie } });
  assert.equal(profile.statusCode, 200, profile.body);
  const { firstName, lastName, picture } = profile.json();
  const saved = await app.inject({ method: 'PATCH', url: `/api/users/${signup.user.id}`, headers: { cookie }, payload: { firstName, lastName, picture } });
  assert.equal(saved.statusCode, 200, saved.body);
  await authClient.changePassword({ currentPassword: password, newPassword: `${password}Changed`, revokeOtherSessions: true }, transport);
  await authClient.signOut({}, transport);
  assert.equal((await app.inject({ url: '/api/users/me', headers: { cookie } })).statusCode, 204);
  await authClient.requestPasswordReset({ email }, transport);
  const resetToken = await mailToken(mail);
  await authClient.resetPassword({ token: resetToken, newPassword: password }, transport);
  await assert.rejects(authClient.resetPassword({ token: resetToken, newPassword: password }, transport), { status: 400 });
  await app.prisma.rateLimit.deleteMany();
  await authClient.signIn.email({ email, password }, transport);
  const memberCookie = cookie;
  await authClient.signIn.email({ email: 'admin.user@test.com', password: 'test' }, transport);
  await authClient.admin.setRole({ userId: signup.user.id, role: 'admin' }, transport);
  assert.equal((await app.prisma.user.findUnique({ where: { id: signup.user.id } })).role, 'admin');
  await authClient.admin.setRole({ userId: signup.user.id, role: 'user' }, transport);
  await authClient.admin.setUserPassword({ userId: signup.user.id, newPassword: `${password}Admin` }, transport);
  assert.equal((await app.inject({ url: '/api/users/me', headers: { cookie: memberCookie } })).statusCode, 204);
  await authClient.admin.banUser({ userId: signup.user.id }, transport);
  assert.equal((await app.prisma.user.findUnique({ where: { id: signup.user.id } })).banned, true);
  await authClient.admin.unbanUser({ userId: signup.user.id }, transport);
  assert.equal((await app.prisma.user.findUnique({ where: { id: signup.user.id } })).banned, false);
});

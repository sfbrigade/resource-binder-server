import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authenticate, build, nodemailerMock } from '#test/helper.js';
import { mailToken, password, post, signUp } from '#test/auth-helper.js';
import { options } from '../../../app.js';

test('application Better Auth cutover', async (t) => {
  const app = await build(t);

  await t.test('registration, verification, native magic exchange and logout reach protected routes', async () => {
    process.env.SMTP_ENABLED = 'true';
    process.env.VITE_FEATURE_REGISTRATION = 'true';
    const signup = await signUp(app);
    assert.equal(signup.statusCode, 200, signup.body);
    assert.equal((await app.inject(`/api/auth/verify-email?token=${mailToken(nodemailerMock.mock)}`)).statusCode, 200);
    assert.equal((await post(app, '/sign-in/magic-link', { email: 'person@example.com' })).statusCode, 200);
    const token = mailToken(nodemailerMock.mock);
    const landing = await app.inject(`/auth/magic-link?token=${token}`);
    assert.equal(landing.statusCode, 200);
    const login = await app.inject(`/api/auth/magic-link/verify?token=${token}`);
    assert.equal(login.statusCode, 200, login.body);
    const headers = { authorization: `Bearer ${login.headers['set-auth-token']}` };
    const profile = await app.inject({ url: '/api/users/me', headers });
    assert.equal(profile.statusCode, 200, profile.body);
    assert.equal(profile.json().id, signup.json().user.id);
    assert.equal(profile.json().isAdmin, false);
    assert.equal((await app.inject({ url: '/api/users', headers })).statusCode, 403);
    assert.equal((await post(app, '/sign-in/email', { email: 'person@example.com', password })).statusCode, 200);
    assert.equal((await post(app, '/sign-out', {}, headers)).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/users/me', headers })).statusCode, 204);
    assert.equal((await app.inject({ url: `/api/users/${signup.json().user.id}`, headers })).statusCode, 401);
  });

  await t.test('expired and admin-revoked sessions lose application access immediately', async () => {
    const adminHeaders = await authenticate(app, 'admin.user@test.com', 'test');
    const headers = await authenticate(app, 'regular.user@test.com', 'test');
    const userId = 'dab5dff3-360d-4dbb-98dd-1990dfb5c4c5';
    assert.equal((await post(app, '/admin/revoke-user-sessions', { userId }, adminHeaders)).statusCode, 200);
    assert.equal((await app.inject({ url: `/api/users/${userId}`, headers })).statusCode, 401);
    const expired = await authenticate(app, 'regular.user@test.com', 'test');
    await app.prisma.session.updateMany({ where: { userId }, data: { expiresAt: new Date(0) } });
    assert.equal((await app.inject({ url: `/api/users/${userId}`, headers: expired })).statusCode, 401);
  });

  await t.test('legacy endpoints and untrusted browser origins cannot authenticate', async () => {
    for (const path of ['/login', '/register']) {
      assert.equal((await post(app, path, { email: 'regular.user@test.com', password: 'test' })).statusCode, 404);
    }
    const response = await post(app, '/sign-in/email', { email: 'regular.user@test.com', password: 'test' }, { origin: 'https://untrusted.example' });
    assert.equal(response.statusCode, 403);
  });

  await t.test('access log serializer excludes link tokens and headers', () => {
    assert.deepEqual(options.logger.serializers.req({ method: 'GET', url: '/auth/magic-link?token=secret', ip: '127.0.0.1', headers: { authorization: 'secret' } }), {
      method: 'GET', url: '/auth/magic-link', remoteAddress: '127.0.0.1',
    });
  });
});

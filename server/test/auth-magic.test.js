import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuth, mailToken, password, post, signUp, verifiedAdmin, verifiedUser } from './auth-helper.js';

test('Better Auth magic links and native sessions', async (t) => {
  const fixture = await buildAuth(t);
  const { app, prisma, mail } = fixture;

  async function requestLink (email) {
    const response = await post(app, '/sign-in/magic-link', { email });
    assert.equal(response.statusCode, 200, response.body);
    return mailToken(mail);
  }

  await t.test('app exchanges a single-use token for a bearer session; browser never consumes it', async () => {
    const { user } = await verifiedUser(fixture);
    const token = await requestLink(user.email);
    const stored = await prisma.verification.findMany();
    assert.ok(stored.length);
    assert.ok(stored.every(row => row.identifier !== token));
    const landing = await app.inject(`/auth/magic-link?token=${token}`);
    assert.equal(landing.statusCode, 200);
    assert.ok(!landing.body.includes(token));
    assert.equal(landing.headers['set-cookie'], undefined);
    const response = await app.inject(`/api/auth/magic-link/verify?token=${token}`);
    assert.equal(response.statusCode, 200);
    const bearer = response.headers['set-auth-token'];
    assert.ok(bearer);
    const headers = { authorization: `Bearer ${bearer}` };
    assert.equal((await app.inject({ url: '/api/auth/get-session', headers })).json().user.id, user.id);
    assert.notEqual((await app.inject(`/api/auth/magic-link/verify?token=${token}`)).statusCode, 200);
    assert.equal((await post(app, '/sign-in/email', { email: user.email, password })).statusCode, 200);
    assert.equal((await post(app, '/sign-out', {}, headers)).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/auth/get-session', headers })).json(), null);
  });

  await t.test('unknown, unverified and inactive users get the same response without mail', async () => {
    const admin = await verifiedAdmin(fixture);
    const { user } = await verifiedUser(fixture);
    await post(app, '/admin/ban-user', { userId: user.id }, admin.headers);
    await signUp(app, 'pending@example.com');
    mail.reset();
    for (const email of ['unknown@example.com', 'pending@example.com', user.email]) {
      assert.deepEqual((await post(app, '/sign-in/magic-link', { email })).json(), { status: true });
    }
    assert.equal(mail.getSentMail().length, 0);
    assert.equal(await prisma.user.count({ where: { email: 'unknown@example.com' } }), 0);
  });

  await t.test('expired tokens fail and concurrent verification creates only one session', async () => {
    const { user } = await verifiedUser(fixture);
    const expiredToken = await requestLink(user.email);
    await prisma.verification.updateMany({ data: { expiresAt: new Date(0) } });
    assert.notEqual((await app.inject(`/api/auth/magic-link/verify?token=${expiredToken}`)).statusCode, 200);
    const token = await requestLink(user.email);
    const before = await prisma.session.count();
    const responses = await Promise.all([
      app.inject(`/api/auth/magic-link/verify?token=${token}`),
      app.inject(`/api/auth/magic-link/verify?token=${token}`),
    ]);
    assert.equal(responses.filter(r => r.statusCode === 200).length, 1);
    assert.equal(await prisma.session.count(), before + 1);
  });

  await t.test('rate limits use connection IP, not a caller-supplied override', async () => {
    for (let i = 0; i < 5; i++) {
      const response = await post(app, '/sign-in/magic-link', { email: 'unknown@example.com' }, { 'x-auth-client-ip': `192.0.2.${i}` });
      assert.equal(response.statusCode, 200);
    }
    const blocked = await post(app, '/sign-in/magic-link', { email: 'unknown@example.com' }, { 'x-auth-client-ip': '192.0.2.99' });
    assert.equal(blocked.statusCode, 429);
  });
});

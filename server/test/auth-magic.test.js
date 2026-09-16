import { test } from 'node:test';
import assert from 'node:assert/strict';
import mailer from '#lib/mailer.js';
import { build, mailToken, nodemailerMock, password, verifiedAdmin, verifiedUser } from '#test/helper.js';

test('Better Auth magic links and native sessions', async (t) => {
  const app = await build(t);
  const { prisma } = app;
  const mail = nodemailerMock.mock;
  const post = (path, payload, headers = {}) => app.inject().post(`/api/auth${path}`)
    .headers({ origin: process.env.BASE_URL, ...headers }).payload(payload);

  async function requestLink (email) {
    const response = await post('/sign-in/magic-link', { email });
    assert.equal(response.statusCode, 200, response.body);
    return mailToken(mail);
  }

  await t.test('app exchanges a single-use token for a bearer session; browser never consumes it', async () => {
    const { user } = await verifiedUser(app);
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
    assert.equal((await post('/sign-in/email', { email: user.email, password })).statusCode, 200);
    assert.equal((await post('/sign-out', {}, headers)).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/auth/get-session', headers })).json(), null);
  });

  await t.test('unknown accounts receive an opaque response without mail or signup', async () => {
    const response = await post('/sign-in/magic-link', { email: 'unknown@example.com' });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: true });
    assert.equal(mail.getSentMail().length, 0);
    assert.equal(await prisma.user.count({ where: { email: 'unknown@example.com' } }), 0);
  });

  await t.test('pending accounts prove ownership through magic links and reset their password', async () => {
    const signup = await post('/sign-up/email', { firstName: 'Test', lastName: 'Person', email: 'pending@example.com', password });
    assert.equal(signup.statusCode, 200, signup.body);
    const user = signup.json().user;
    // Simulate standing access created before the mailbox owner proved ownership.
    const { internalAdapter } = await app.auth.$context;
    const oldSession = await internalAdapter.createSession(user.id);
    mail.reset();
    const token = await requestLink(user.email);
    assert.equal(mail.getSentMail().length, 1);
    const response = await app.inject(`/api/auth/magic-link/verify?token=${token}`);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().user.id, user.id);
    assert.equal(response.json().user.emailVerified, true);
    assert.equal(await prisma.account.count({ where: { userId: user.id } }), 0);
    assert.equal(await prisma.session.findUnique({ where: { id: oldSession.id } }), null);
    const headers = { authorization: `Bearer ${response.headers['set-auth-token']}` };
    assert.equal((await app.inject({ url: '/api/auth/get-session', headers })).json().user.id, user.id);
    assert.equal((await post('/sign-in/email', { email: user.email, password })).statusCode, 401);
    assert.equal((await post('/request-password-reset', { email: user.email })).statusCode, 200);
    assert.equal((await post('/reset-password', { token: mailToken(mail), newPassword: `${password}New` })).statusCode, 200);
    assert.equal((await post('/sign-in/email', { email: user.email, password: `${password}New` })).statusCode, 200);
  });

  await t.test('active bans prevent redemption of both outstanding and newly delivered links', async () => {
    const admin = await verifiedAdmin(app);
    const { user } = await verifiedUser(app);
    const outstanding = await requestLink(user.email);
    assert.equal((await post('/admin/ban-user', { userId: user.id }, admin.headers)).statusCode, 200);
    const fresh = await requestLink(user.email);
    for (const token of [outstanding, fresh]) {
      const response = await app.inject(`/api/auth/magic-link/verify?token=${token}`);
      assert.equal(response.statusCode, 403, response.body);
      assert.equal(response.headers['set-auth-token'], undefined);
    }
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
  });

  await t.test('magic sign-in clears expired temporary bans without a password sign-in', async () => {
    const admin = await verifiedAdmin(app);
    const { user } = await verifiedUser(app);
    assert.equal((await post('/admin/ban-user', { userId: user.id, banExpiresIn: 60 }, admin.headers)).statusCode, 200);
    await prisma.user.update({ where: { id: user.id }, data: { banExpires: new Date(0) } });
    const token = await requestLink(user.email);
    const response = await app.inject(`/api/auth/magic-link/verify?token=${token}`);
    assert.equal(response.statusCode, 200, response.body);
    assert.ok(response.headers['set-auth-token']);
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    assert.equal(updated.banned, false);
    assert.equal(updated.deactivatedAt, null);
  });

  await t.test('disabled SMTP and delivery failures do not expose account eligibility or secrets', async () => {
    const { user } = await verifiedUser(app);
    const { logger } = await app.auth.$context;
    const warnings = t.mock.method(logger, 'warn', () => {});
    try {
      for (const enabled of [false, true]) {
        process.env.SMTP_ENABLED = String(enabled);
        const sending = t.mock.method(mailer, 'send', async () => {
          throw new Error(`Transport failed for ${user.email} with secret-token`);
        });
        try {
          for (const email of [user.email, 'unknown@example.com']) {
            const response = await post('/sign-in/magic-link', { email });
            assert.equal(response.statusCode, 200, response.body);
            assert.deepEqual(response.json(), { status: true });
          }
        } finally {
          sending.mock.restore();
        }
      }
      assert.deepEqual(warnings.mock.calls.map(call => call.arguments), [
        ['Magic-link email delivery failed.'],
        ['Magic-link email delivery failed.'],
      ]);
    } finally {
      warnings.mock.restore();
      process.env.SMTP_ENABLED = 'true';
    }
  });

  await t.test('expired tokens fail and concurrent verification creates only one session', async () => {
    const { user } = await verifiedUser(app);
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
      const response = await post('/sign-in/magic-link', { email: 'unknown@example.com' }, { 'x-auth-client-ip': `192.0.2.${i}` });
      assert.equal(response.statusCode, 200);
    }
    const blocked = await post('/sign-in/magic-link', { email: 'unknown@example.com' }, { 'x-auth-client-ip': '192.0.2.99' });
    assert.equal(blocked.statusCode, 429);
  });
});

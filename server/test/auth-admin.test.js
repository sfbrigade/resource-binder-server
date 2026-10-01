import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build, mailToken, nodemailerMock, password, verifiedAdmin, verifiedUser } from '#test/helper.js';

test('Better Auth administration', async (t) => {
  const app = await build(t);
  const { prisma } = app;
  const mail = nodemailerMock.mock;

  await t.test('native password limits reject oversized input before hashing or verification', async (t) => {
    const member = await verifiedUser(app);
    const { password: passwords } = await app.auth.$context;
    const hash = t.mock.method(passwords, 'hash');
    const verify = t.mock.method(passwords, 'verify');
    const response = await app.inject().post('/api/auth/sign-in/email').headers({ origin: process.env.BASE_URL }).payload({ email: member.user.email, password: 'a'.repeat(129) });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().code, 'PASSWORD_TOO_LONG');
    await assert.rejects(app.auth.api.createUser({
      body: {
        name: 'Test Person',
        email: 'oversized@example.com',
        password: 'a'.repeat(129),
        data: { firstName: 'Test', lastName: 'Person' },
      }
    }), error => error.statusCode === 400 && error.body.code === 'PASSWORD_TOO_LONG');
    assert.equal(hash.mock.callCount(), 0);
    assert.equal(verify.mock.callCount(), 0);
    assert.equal(await prisma.user.count({ where: { email: 'oversized@example.com' } }), 0);
  });

  for (const hasPassword of [true, false]) {
    await t.test(`admin password changes revoke only the target user's sessions (existing password: ${hasPassword})`, async () => {
      const admin = await verifiedAdmin(app);
      const member = await verifiedUser(app);
      const other = await verifiedUser(app, 'other@example.com');
      if (!hasPassword) await prisma.account.deleteMany({ where: { userId: member.user.id, providerId: 'credential' } });
      const response = await app.inject().post('/api/auth/admin/set-user-password')
        .headers({ origin: process.env.BASE_URL, ...admin.headers })
        .payload({ userId: member.user.id, newPassword: `${password}Changed` });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal((await app.inject({ url: '/api/auth/get-session', headers: member.headers })).json(), null);
      for (const unaffected of [admin, other]) {
        assert.equal((await app.inject({ url: '/api/auth/get-session', headers: unaffected.headers })).json()?.user.id, unaffected.user.id);
      }
      assert.equal((await app.inject().post('/api/auth/sign-in/email')
        .headers({ origin: process.env.BASE_URL })
        .payload({ email: member.user.email, password: `${password}Changed` })).statusCode, 200);
    });
  }

  await t.test('admin email-change paths are unavailable', async () => {
    const admin = await verifiedAdmin(app);
    const member = await verifiedUser(app);
    assert.equal((await app.inject().post('/api/auth/admin/update-user')
      .headers({ origin: process.env.BASE_URL, ...admin.headers })
      .payload({ userId: member.user.id, data: { email: 'changed@example.com' } })).statusCode, 404);
    assert.equal((await app.inject().post('/api/auth/admin/update-user')
      .headers({ origin: process.env.BASE_URL, ...admin.headers })
      .payload({ userId: member.user.id, data: { emailVerified: true } })).statusCode, 404);
    assert.equal((await prisma.user.findUnique({ where: { id: member.user.id } })).email, member.user.email);
    assert.equal((await prisma.user.findUnique({ where: { id: member.user.id } })).emailVerified, true);
  });

  await t.test('rejected admin password changes preserve credentials and sessions', async () => {
    const admin = await verifiedAdmin(app);
    const member = await verifiedUser(app);
    const credential = await prisma.account.findFirst({ where: { userId: member.user.id, providerId: 'credential' } });
    for (const newPassword of ['short', 'a'.repeat(129)]) {
      const response = await app.inject().post('/api/auth/admin/set-user-password')
        .headers({ origin: process.env.BASE_URL, ...admin.headers })
        .payload({ userId: member.user.id, newPassword });
      assert.equal(response.statusCode, 400, response.body);
      assert.equal((await prisma.account.findUnique({ where: { id: credential.id } })).password, credential.password);
      assert.equal((await app.inject({ url: '/api/auth/get-session', headers: member.headers })).json()?.user.id, member.user.id);
    }
  });

  await t.test('a resend still allows verification', async () => {
    const signup = await app.inject().post('/api/auth/sign-up/email')
      .headers({ origin: process.env.BASE_URL })
      .payload({ firstName: 'Test', lastName: 'Person', email: 'person@example.com', password });
    assert.equal(signup.statusCode, 200);
    assert.equal((await app.inject().post('/api/auth/send-verification-email')
      .headers({ origin: process.env.BASE_URL })
      .payload({ email: signup.json().user.email })).statusCode, 200);
    assert.equal((await app.inject(`/api/auth/verify-email?token=${encodeURIComponent(await mailToken(mail))}`)).statusCode, 200);
  });

  await t.test('missing password bodies return client errors', async () => {
    const admin = await verifiedAdmin(app);
    for (const path of ['/admin/create-user', '/admin/set-user-password', '/reset-password', '/change-password']) {
      const response = await app.inject().post(`/api/auth${path}`)
        .headers({ origin: process.env.BASE_URL, ...admin.headers });
      assert.equal(response.statusCode, 400, `${path}: ${response.body}`);
    }
  });

  await t.test('members cannot administer credentials; impersonation and deletion stay unavailable', async () => {
    const member = await verifiedUser(app);
    const admin = await verifiedAdmin(app);
    assert.equal((await app.inject().post('/api/auth/admin/set-user-password')
      .headers({ origin: process.env.BASE_URL, ...member.headers })
      .payload({ userId: admin.user.id, newPassword: password })).statusCode, 403);
    assert.equal((await app.inject().post('/api/auth/admin/set-role')
      .headers({ origin: process.env.BASE_URL, ...member.headers })
      .payload({ userId: member.user.id, role: 'admin' })).statusCode, 403);
    assert.equal((await app.inject().post('/api/auth/admin/impersonate-user')
      .headers({ origin: process.env.BASE_URL, ...admin.headers })
      .payload({ userId: member.user.id })).statusCode, 403);
    assert.equal((await app.inject().post('/api/auth/admin/remove-user')
      .headers({ origin: process.env.BASE_URL, ...admin.headers })
      .payload({ userId: member.user.id })).statusCode, 403);
  });

  await t.test('banning revokes sessions and prevents new sign-ins until unbanned', async () => {
    const admin = await verifiedAdmin(app);
    const member = await verifiedUser(app);
    assert.equal((await app.inject().post('/api/auth/admin/ban-user')
      .headers({ origin: process.env.BASE_URL, ...admin.headers })
      .payload({ userId: member.user.id })).statusCode, 200);
    const user = await prisma.user.findUnique({ where: { id: member.user.id } });
    assert.equal(user.banned, true);
    assert.equal((await app.inject({ url: '/api/auth/get-session', headers: member.headers })).json(), null);
    assert.equal((await app.inject().post('/api/auth/sign-in/email')
      .headers({ origin: process.env.BASE_URL })
      .payload({ email: user.email, password })).statusCode, 403);
    assert.equal((await app.inject().post('/api/auth/admin/unban-user')
      .headers({ origin: process.env.BASE_URL, ...admin.headers })
      .payload({ userId: member.user.id })).statusCode, 200);
    assert.equal((await prisma.user.findUnique({ where: { id: member.user.id } })).banned, false);
    assert.equal((await app.inject().post('/api/auth/sign-in/email')
      .headers({ origin: process.env.BASE_URL })
      .payload({ email: user.email, password })).statusCode, 200);
  });
});

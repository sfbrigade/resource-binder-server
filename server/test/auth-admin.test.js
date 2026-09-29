import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuth, mailToken, password, post, signUp, verifiedAdmin, verifiedUser } from './auth-helper.js';

test('Better Auth administration', async (t) => {
  const fixture = await buildAuth(t);
  const { app, prisma, mail } = fixture;

  await t.test('native password limits reject oversized input before hashing or verification', async (t) => {
    const member = await verifiedUser(fixture);
    const { password: passwords } = await fixture.auth.$context;
    const hash = t.mock.method(passwords, 'hash');
    const verify = t.mock.method(passwords, 'verify');
    const response = await post(app, '/sign-in/email', { email: member.user.email, password: 'a'.repeat(129) });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().code, 'PASSWORD_TOO_LONG');
    await assert.rejects(fixture.auth.api.createUser({
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
      const admin = await verifiedAdmin(fixture);
      const member = await verifiedUser(fixture);
      const other = await verifiedUser(fixture, 'other@example.com');
      if (!hasPassword) await prisma.account.deleteMany({ where: { userId: member.user.id, providerId: 'credential' } });
      const response = await post(app, '/admin/set-user-password', { userId: member.user.id, newPassword: `${password}Changed` }, admin.headers);
      assert.equal(response.statusCode, 200, response.body);
      assert.equal((await app.inject({ url: '/api/auth/get-session', headers: member.headers })).json(), null);
      for (const unaffected of [admin, other]) {
        assert.equal((await app.inject({ url: '/api/auth/get-session', headers: unaffected.headers })).json()?.user.id, unaffected.user.id);
      }
      assert.equal((await post(app, '/sign-in/email', { email: member.user.email, password: `${password}Changed` })).statusCode, 200);
    });
  }

  await t.test('admin email-change paths are unavailable', async () => {
    const admin = await verifiedAdmin(fixture);
    const member = await verifiedUser(fixture);
    assert.equal((await post(app, '/admin/update-user', { userId: member.user.id, data: { email: 'changed@example.com' } }, admin.headers)).statusCode, 404);
    assert.equal((await post(app, '/admin/update-user', { userId: member.user.id, data: { emailVerified: true } }, admin.headers)).statusCode, 404);
    assert.equal((await prisma.user.findUnique({ where: { id: member.user.id } })).email, member.user.email);
    assert.equal((await prisma.user.findUnique({ where: { id: member.user.id } })).emailVerified, true);
  });

  await t.test('rejected admin password changes preserve credentials and sessions', async () => {
    const admin = await verifiedAdmin(fixture);
    const member = await verifiedUser(fixture);
    const credential = await prisma.account.findFirst({ where: { userId: member.user.id, providerId: 'credential' } });
    for (const newPassword of ['short', 'a'.repeat(129)]) {
      const response = await post(app, '/admin/set-user-password', { userId: member.user.id, newPassword }, admin.headers);
      assert.equal(response.statusCode, 400, response.body);
      assert.equal((await prisma.account.findUnique({ where: { id: credential.id } })).password, credential.password);
      assert.equal((await app.inject({ url: '/api/auth/get-session', headers: member.headers })).json()?.user.id, member.user.id);
    }
  });

  await t.test('a resend still allows verification', async () => {
    const signup = await signUp(app);
    assert.equal(signup.statusCode, 200);
    assert.equal((await post(app, '/send-verification-email', { email: signup.json().user.email })).statusCode, 200);
    assert.equal((await app.inject(`/api/auth/verify-email?token=${encodeURIComponent(mailToken(mail))}`)).statusCode, 200);
  });

  await t.test('missing password bodies return client errors', async () => {
    const admin = await verifiedAdmin(fixture);
    for (const path of ['/admin/create-user', '/admin/set-user-password', '/reset-password', '/change-password']) {
      const response = await post(app, path, undefined, admin.headers);
      assert.equal(response.statusCode, 400, `${path}: ${response.body}`);
    }
  });

  await t.test('members cannot administer credentials; impersonation and deletion stay unavailable', async () => {
    const member = await verifiedUser(fixture);
    const admin = await verifiedAdmin(fixture);
    assert.equal((await post(app, '/admin/set-user-password', { userId: admin.user.id, newPassword: password }, member.headers)).statusCode, 403);
    assert.equal((await post(app, '/admin/set-role', { userId: member.user.id, role: 'admin' }, member.headers)).statusCode, 403);
    assert.equal((await post(app, '/admin/impersonate-user', { userId: member.user.id }, admin.headers)).statusCode, 403);
    assert.equal((await post(app, '/admin/remove-user', { userId: member.user.id }, admin.headers)).statusCode, 403);
  });

  await t.test('banning revokes sessions and prevents new sign-ins until unbanned', async () => {
    const admin = await verifiedAdmin(fixture);
    const member = await verifiedUser(fixture);
    assert.equal((await post(app, '/admin/ban-user', { userId: member.user.id }, admin.headers)).statusCode, 200);
    const user = await prisma.user.findUnique({ where: { id: member.user.id } });
    assert.equal(user.banned, true);
    assert.equal((await app.inject({ url: '/api/auth/get-session', headers: member.headers })).json(), null);
    assert.equal((await post(app, '/sign-in/email', { email: user.email, password })).statusCode, 403);
    assert.equal((await post(app, '/admin/unban-user', { userId: member.user.id }, admin.headers)).statusCode, 200);
    assert.equal((await prisma.user.findUnique({ where: { id: member.user.id } })).banned, false);
    assert.equal((await post(app, '/sign-in/email', { email: user.email, password })).statusCode, 200);
  });
});

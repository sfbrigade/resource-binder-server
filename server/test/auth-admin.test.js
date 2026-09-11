import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuth, mailToken, password, post, verifiedAdmin, verifiedUser } from './auth-helper.js';

test('Better Auth administration', async (t) => {
  const fixture = await buildAuth(t);
  const { app, auth, prisma, mail } = fixture;

  await t.test('admins can change passwords and revoke the previous sessions', async () => {
    const admin = await verifiedAdmin(fixture);
    const member = await verifiedUser(fixture);
    const response = await post(app, '/admin/set-user-password', { userId: member.user.id, newPassword: `${password}Changed` }, admin.headers);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal((await app.inject({ url: '/api/auth/get-session', headers: member.headers })).json(), null);
    assert.equal((await post(app, '/sign-in/email', { email: member.user.email, password: `${password}Changed` })).statusCode, 200);
  });

  await t.test('admin email changes require verification and cannot mark email verified', async () => {
    const admin = await verifiedAdmin(fixture);
    const member = await verifiedUser(fixture);
    const forbidden = await post(app, '/admin/update-user', { userId: member.user.id, data: { emailVerified: true } }, admin.headers);
    assert.equal(forbidden.statusCode, 400);
    const response = await post(app, '/admin/update-user', { userId: member.user.id, data: { email: 'changed@example.com' } }, admin.headers);
    assert.equal(response.statusCode, 200, response.body);
    const user = await prisma.user.findUnique({ where: { id: member.user.id } });
    assert.equal(user.emailVerified, false);
    assert.equal((await app.inject({ url: '/api/auth/get-session', headers: member.headers })).json(), null);
    assert.equal((await post(app, '/sign-in/email', { email: user.email, password })).statusCode, 403);
    assert.equal((await app.inject(`/api/auth/verify-email?token=${mailToken(mail)}`)).statusCode, 200);
    assert.equal((await post(app, '/sign-in/email', { email: user.email, password })).statusCode, 200);
  });

  for (const email of ['changed@example.com', 'person@example.com']) {
    await t.test(`admin email update to ${email} invalidates only that user's password-reset links`, async () => {
      const admin = await verifiedAdmin(fixture);
      const member = await verifiedUser(fixture);
      const other = await verifiedUser(fixture, 'other@example.com');
      const oldTokens = [];
      for (let i = 0; i < 2; i++) {
        assert.equal((await post(app, '/request-password-reset', { email: member.user.email })).statusCode, 200);
        oldTokens.push(mailToken(mail));
      }
      assert.equal((await post(app, '/request-password-reset', { email: other.user.email })).statusCode, 200);
      const otherToken = mailToken(mail);
      const unrelated = await prisma.verification.create({
        data: { identifier: 'unrelated-verification', value: member.user.id, expiresAt: new Date(Date.now() + 60000) },
      });
      const credential = await prisma.account.findFirst({ where: { userId: member.user.id, providerId: 'credential' } });
      assert.equal((await post(app, '/admin/update-user', { userId: member.user.id, data: { email } }, admin.headers)).statusCode, 200);
      assert.equal((await app.inject(`/api/auth/verify-email?token=${mailToken(mail)}`)).statusCode, 200);
      for (const token of oldTokens) {
        assert.equal((await post(app, '/reset-password', { token, newPassword: `${password}OldMailbox` })).statusCode, 400);
      }
      assert.equal((await prisma.account.findUnique({ where: { id: credential.id } })).password, credential.password);
      assert.ok(await prisma.verification.findUnique({ where: { id: unrelated.id } }));
      assert.ok(await prisma.verification.findUnique({ where: { identifier: `reset-password:${otherToken}` } }));
      // Each reset exchange below is a separate recovery flow, not rate-limit coverage.
      await prisma.rateLimit.deleteMany();
      assert.equal((await post(app, '/reset-password', { token: otherToken, newPassword: `${password}Other` })).statusCode, 200);
      assert.equal((await post(app, '/request-password-reset', { email })).statusCode, 200);
      assert.equal((await post(app, '/reset-password', { token: mailToken(mail), newPassword: `${password}Fresh` })).statusCode, 200);
      assert.equal((await post(app, '/sign-in/email', { email, password: `${password}Fresh` })).statusCode, 200);
    });
  }

  await t.test('a reset-token deletion failure prevents the admin email update', async () => {
    const admin = await verifiedAdmin(fixture);
    const member = await verifiedUser(fixture);
    const { adapter } = await auth.$context;
    const deleteMany = adapter.deleteMany.bind(adapter);
    const deletion = t.mock.method(adapter, 'deleteMany', async (options) => {
      if (options.model === 'verification') throw new Error('Simulated reset-token deletion failure');
      return deleteMany(options);
    });
    try {
      const response = await post(app, '/admin/update-user', { userId: member.user.id, data: { email: 'changed@example.com' } }, admin.headers);
      assert.equal(response.statusCode, 500);
      const user = await prisma.user.findUnique({ where: { id: member.user.id } });
      assert.equal(user.email, member.user.email);
      assert.equal(user.emailVerified, true);
    } finally {
      deletion.mock.restore();
    }
  });

  await t.test('malformed admin updates and missing password bodies return client errors', async () => {
    const admin = await verifiedAdmin(fixture);
    for (const data of [undefined, null, 'email', [], {}, { email: '' }, { email: 123 }, { email: 'changed@example.com', emailVerified: true }]) {
      const response = await post(app, '/admin/update-user', { userId: admin.user.id, data }, admin.headers);
      assert.equal(response.statusCode, 400, response.body);
    }
    for (const path of ['/admin/update-user', '/admin/create-user', '/admin/set-user-password', '/reset-password', '/change-password']) {
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

  await t.test('deactivation revokes sessions and prevents new sign-ins until reactivated', async () => {
    const admin = await verifiedAdmin(fixture);
    const member = await verifiedUser(fixture);
    assert.equal((await post(app, '/admin/ban-user', { userId: member.user.id }, admin.headers)).statusCode, 200);
    const user = await prisma.user.findUnique({ where: { id: member.user.id } });
    assert.ok(user.deactivatedAt);
    assert.equal((await app.inject({ url: '/api/auth/get-session', headers: member.headers })).json(), null);
    assert.equal((await post(app, '/sign-in/email', { email: user.email, password })).statusCode, 403);
    assert.equal((await post(app, '/admin/unban-user', { userId: member.user.id }, admin.headers)).statusCode, 200);
    assert.equal((await prisma.user.findUnique({ where: { id: member.user.id } })).deactivatedAt, null);
    assert.equal((await post(app, '/sign-in/email', { email: user.email, password })).statusCode, 200);
  });
});

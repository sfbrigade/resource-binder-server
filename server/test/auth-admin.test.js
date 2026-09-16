import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuth, mailToken, mockResetTokenDeletionFailure, password, post, signUp, verifiedAdmin, verifiedUser } from './auth-helper.js';

test('Better Auth administration', async (t) => {
  const fixture = await buildAuth(t);
  const { app, auth, prisma, mail } = fixture;

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

  await t.test("admin password changes invalidate only that user's old reset links", async () => {
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
    assert.equal((await post(app, '/admin/set-user-password', { userId: member.user.id, newPassword: `${password}Changed` }, admin.headers)).statusCode, 200);
    for (const token of oldTokens) {
      assert.equal(await prisma.verification.findUnique({ where: { identifier: `reset-password:${token}` } }), null);
      assert.equal((await post(app, '/reset-password', { token, newPassword: `${password}OldMailbox` })).statusCode, 400);
    }
    assert.notEqual((await prisma.account.findUnique({ where: { id: credential.id } })).password, credential.password);
    assert.ok(await prisma.verification.findUnique({ where: { id: unrelated.id } }));
    assert.ok(await prisma.verification.findUnique({ where: { identifier: `reset-password:${otherToken}` } }));
    await prisma.rateLimit.deleteMany();
    assert.equal((await post(app, '/reset-password', { token: otherToken, newPassword: `${password}Other` })).statusCode, 200);
    assert.equal((await post(app, '/sign-in/email', { email: other.user.email, password: `${password}Other` })).statusCode, 200);
  });

  await t.test('reset-token invalidation failure prevents an admin password change', async () => {
    const admin = await verifiedAdmin(fixture);
    const member = await verifiedUser(fixture);
    assert.equal((await post(app, '/request-password-reset', { email: member.user.email })).statusCode, 200);
    const resetToken = mailToken(mail);
    const credential = await prisma.account.findFirst({ where: { userId: member.user.id, providerId: 'credential' } });
    const { adapter } = await auth.$context;
    const deletion = mockResetTokenDeletionFailure(t, adapter);
    try {
      assert.equal((await post(app, '/admin/set-user-password', { userId: member.user.id, newPassword: `${password}Changed` }, admin.headers)).statusCode, 500);
      assert.equal((await prisma.account.findUnique({ where: { id: credential.id } })).password, credential.password);
      assert.ok(await prisma.verification.findUnique({ where: { identifier: `reset-password:${resetToken}` } }));
      assert.equal((await app.inject({ url: '/api/auth/get-session', headers: member.headers })).json()?.user.id, member.user.id);
    } finally {
      deletion.mock.restore();
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

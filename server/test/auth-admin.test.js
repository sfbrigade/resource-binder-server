import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuth, mailToken, password, post, verifiedAdmin, verifiedUser } from './auth-helper.js';

test('Better Auth administration', async (t) => {
  const fixture = await buildAuth(t);
  const { app, prisma, mail } = fixture;

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

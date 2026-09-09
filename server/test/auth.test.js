import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuth, mailToken, password, post, signUp, verifiedUser } from './auth-helper.js';

test('Better Auth foundation', async (t) => {
  const { app, prisma } = await buildAuth(t);
  const response = await app.inject('/api/auth/get-session');
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json(), null);
  assert.equal(await prisma.session.count(), 0);
});

test('Better Auth passwords and invitations', async (t) => {
  const fixture = await buildAuth(t);
  const { app, prisma, mail } = fixture;

  await t.test('signup requires verification, then password login and logout work', async () => {
    const response = await signUp(app);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().token, null);
    assert.equal(response.json().user.name, 'Test Person');
    assert.equal((await post(app, '/sign-in/email', { email: 'person@example.com', password })).statusCode, 403);
    assert.equal((await app.inject(`/api/auth/verify-email?token=${mailToken(mail)}`)).statusCode, 200);
    const login = await post(app, '/sign-in/email', { email: 'person@example.com', password });
    assert.equal(login.statusCode, 200, login.body);
    const cookie = login.cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
    assert.ok((await app.inject({ url: '/api/auth/get-session', headers: { cookie } })).json().user.id);
    assert.equal((await post(app, '/sign-out', {}, { cookie })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/auth/get-session', headers: { cookie } })).json(), null);
  });

  await t.test('password validation and reset revoke old sessions', async () => {
    assert.equal((await signUp(app, 'weak@example.com', { password: 'weakpassword' })).statusCode, 400);
    const { headers } = await verifiedUser(fixture);
    const request = await post(app, '/request-password-reset', { email: 'person@example.com' });
    assert.equal(request.statusCode, 200, request.body);
    const token = mailToken(mail);
    assert.equal((await post(app, '/reset-password', { token, newPassword: 'weakpassword' })).statusCode, 400);
    assert.equal((await post(app, '/reset-password', { token, newPassword: `${password}New` })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/auth/get-session', headers })).json(), null);
    assert.equal((await post(app, '/reset-password', { token, newPassword: password })).statusCode, 400);
    assert.equal((await post(app, '/sign-in/email', { email: 'person@example.com', password: `${password}New` })).statusCode, 200);
  });

  await t.test('invitation signup is atomic and email-bound when registration is closed', async () => {
    const { user } = await verifiedUser(fixture, 'inviter@example.com');
    process.env.VITE_FEATURE_REGISTRATION = 'false';
    assert.equal((await signUp(app)).statusCode, 403);
    const invite = await prisma.invite.create({ data: { firstName: 'Invited', email: 'invited@example.com', createdById: user.id } });
    assert.equal((await signUp(app, 'wrong@example.com', { inviteId: invite.id })).statusCode, 400);
    assert.equal(await prisma.user.count({ where: { email: 'wrong@example.com' } }), 0);
    assert.equal((await prisma.invite.findUnique({ where: { id: invite.id } })).acceptedAt, null);
    await prisma.rateLimit.deleteMany();
    const results = await Promise.all([
      signUp(app, 'INVITED@example.com', { inviteId: invite.id }),
      signUp(app, 'invited@example.com', { inviteId: invite.id }),
    ]);
    assert.ok(results.some(r => r.statusCode === 200), results.map(r => r.body).join('\n'));
    const accepted = await prisma.invite.findUnique({ where: { id: invite.id } });
    assert.ok(accepted.acceptedAt);
    assert.equal(await prisma.account.count({ where: { userId: accepted.acceptedById } }), 1);
    assert.equal(await prisma.user.count({ where: { email: 'invited@example.com' } }), 1);
  });

  await t.test('disabled mail prevents registration and invite acceptance', async () => {
    const { user } = await verifiedUser(fixture, 'inviter@example.com');
    const invite = await prisma.invite.create({ data: { firstName: 'Invited', email: 'invited@example.com', createdById: user.id } });
    process.env.SMTP_ENABLED = 'false';
    assert.equal((await signUp(app, 'invited@example.com', { inviteId: invite.id })).statusCode, 503);
    assert.equal(await prisma.user.count({ where: { email: 'invited@example.com' } }), 0);
    assert.equal((await prisma.invite.findUnique({ where: { id: invite.id } })).acceptedAt, null);
  });
});

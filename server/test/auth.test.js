import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signJWT } from 'better-auth/crypto';
import {
  authSecret,
  buildAuth,
  mailToken,
  mockResetTokenDeletionFailure,
  password,
  post,
  signUp,
  verifiedUser,
} from './auth-helper.js';

test('Better Auth foundation', async (t) => {
  const { app, prisma } = await buildAuth(t);
  const response = await app.inject('/api/auth/get-session');
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json(), null);
  assert.equal(await prisma.session.count(), 0);
});

test('Better Auth passwords and invitations', async (t) => {
  const fixture = await buildAuth(t);
  const { app, auth, prisma, mail } = fixture;

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
    assert.equal((await signUp(app, 'weak@example.com', { password: 'short' })).statusCode, 400);
    assert.equal((await signUp(app, 'long@example.com', { password: 'a'.repeat(129) })).statusCode, 400);
    const { headers } = await verifiedUser(fixture);
    const request = await post(app, '/request-password-reset', { email: 'person@example.com' });
    assert.equal(request.statusCode, 200, request.body);
    const token = mailToken(mail);
    assert.equal((await post(app, '/reset-password', { token, newPassword: 'short' })).statusCode, 400);
    assert.equal((await post(app, '/reset-password', { token, newPassword: 'a'.repeat(129) })).statusCode, 400);
    assert.equal((await post(app, '/reset-password', { token, newPassword: `${password}New` })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/auth/get-session', headers })).json(), null);
    assert.equal((await post(app, '/reset-password', { token, newPassword: password })).statusCode, 400);
    assert.equal((await post(app, '/sign-in/email', { email: 'person@example.com', password: `${password}New` })).statusCode, 200);
  });

  await t.test('missing password bodies return validation errors', async () => {
    for (const path of ['/reset-password', '/change-password']) {
      assert.equal((await post(app, path, undefined)).statusCode, 400);
    }
  });

  await t.test('native verification tokens expire, reject tampering, and honor callback URLs', async () => {
    const signup = await signUp(app);
    assert.equal(signup.statusCode, 200, signup.body);
    const token = mailToken(mail);
    const expired = await signJWT({ email: signup.json().user.email }, authSecret, -10);
    assert.equal((await app.inject(`/api/auth/verify-email?token=${encodeURIComponent(expired)}`)).statusCode, 401);
    const tampered = `${token.slice(0, -6)}aaaaaa`;
    assert.equal((await app.inject(`/api/auth/verify-email?token=${encodeURIComponent(tampered)}`)).statusCode, 401);
    assert.equal((await prisma.user.findUnique({ where: { id: signup.json().user.id } })).emailVerified, false);
    const callbackURL = 'http://localhost:3333/account';
    const verification = await app.inject(`/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(callbackURL)}`);
    assert.equal(verification.statusCode, 302, verification.body);
    assert.equal(verification.headers.location, callbackURL);
    assert.equal((await prisma.user.findUnique({ where: { id: signup.json().user.id } })).emailVerified, true);
  });

  await t.test('self-service email changes are unavailable', async () => {
    const member = await verifiedUser(fixture);
    const response = await post(app, '/change-email', { newEmail: 'changed@example.com' }, member.headers);
    assert.equal(response.statusCode, 400, response.body);
    assert.equal((await prisma.user.findUnique({ where: { id: member.user.id } })).email, member.user.email);
    assert.equal((await post(app, '/update-user', { email: 'changed@example.com' }, member.headers)).statusCode, 404);
  });

  for (const { name, changePassword } of [
    {
      name: 'authenticated password changes',
      changePassword: (member) => post(app, '/change-password', { currentPassword: password, newPassword: `${password}New` }, member.headers),
    },
    {
      name: 'password resets',
      changePassword: async (member, tokens) => post(app, '/reset-password', { token: tokens.shift(), newPassword: `${password}New` }),
    },
  ]) {
    await t.test(`${name} invalidate only that user's old reset links`, async () => {
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
      const response = await changePassword(member, oldTokens);
      assert.equal(response.statusCode, 200, response.body);
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
  }

  await t.test('unauthorized password-change attempts do not invalidate reset links', async () => {
    const member = await verifiedUser(fixture);
    assert.equal((await post(app, '/request-password-reset', { email: member.user.email })).statusCode, 200);
    const resetToken = mailToken(mail);
    assert.equal((await post(app, '/change-password', { currentPassword: password, newPassword: `${password}New` })).statusCode, 401);
    assert.equal((await post(app, '/change-password', {
      currentPassword: 'WrongPassword123!',
      newPassword: `${password}New`,
    }, member.headers)).statusCode, 400);
    assert.ok(await prisma.verification.findUnique({ where: { identifier: `reset-password:${resetToken}` } }));
    assert.equal((await post(app, '/reset-password', { token: resetToken, newPassword: `${password}Fresh` })).statusCode, 200);
  });

  for (const { name, attempt } of [
    {
      name: 'password change',
      attempt: (member) => post(app, '/change-password', { currentPassword: password, newPassword: `${password}New` }, member.headers),
    },
    {
      name: 'password reset',
      attempt: (_member, token) => post(app, '/reset-password', { token, newPassword: `${password}New` }),
    },
  ]) {
    await t.test(`reset-token invalidation failure prevents a ${name}`, async () => {
      const member = await verifiedUser(fixture);
      const oldTokens = [];
      for (let i = 0; i < 2; i++) {
        assert.equal((await post(app, '/request-password-reset', { email: member.user.email })).statusCode, 200);
        oldTokens.push(mailToken(mail));
      }
      const credential = await prisma.account.findFirst({ where: { userId: member.user.id, providerId: 'credential' } });
      const { adapter } = await auth.$context;
      const deletion = mockResetTokenDeletionFailure(t, adapter);
      try {
        assert.equal((await attempt(member, oldTokens[0])).statusCode, 500);
        assert.equal((await prisma.account.findUnique({ where: { id: credential.id } })).password, credential.password);
        assert.ok(await prisma.verification.findUnique({ where: { identifier: `reset-password:${oldTokens[1]}` } }));
      } finally {
        deletion.mock.restore();
      }
      await prisma.rateLimit.deleteMany();
      assert.equal((await post(app, '/reset-password', { token: oldTokens[1], newPassword: `${password}Fresh` })).statusCode, 200);
    });
  }

  await t.test('invalid invitations return the same error for existing and unknown emails', async () => {
    const member = await verifiedUser(fixture);
    process.env.VITE_FEATURE_REGISTRATION = 'false';
    const sentBefore = mail.getSentMail().length;
    for (const state of ['missing', 'revoked', 'accepted', 'wrong-email']) {
      const responses = [];
      for (const email of [member.user.email, 'unknown@example.com']) {
        const invite = state === 'missing'
          ? { id: '11111111-1111-4111-8111-111111111111' }
          : await prisma.invite.create({
            data: {
              firstName: 'Invited',
              email: state === 'wrong-email' ? 'different@example.com' : email,
              createdById: member.user.id,
              ...(state === 'revoked' ? { revokedAt: new Date() } : {}),
              ...(state === 'accepted' ? { acceptedAt: new Date(), acceptedById: member.user.id } : {}),
            },
          });
        await prisma.rateLimit.deleteMany();
        const response = await signUp(app, email, { inviteId: invite.id });
        assert.equal(response.statusCode, 400, `${state}: ${response.body}`);
        responses.push(response.json());
      }
      assert.deepEqual(responses[0], responses[1]);
    }
    assert.equal(await prisma.user.count(), 1);
    assert.equal(await prisma.account.count(), 1);
    assert.equal(mail.getSentMail().length, sentBefore);
    const validInvite = await prisma.invite.create({ data: { firstName: 'Invited', email: member.user.email, createdById: member.user.id } });
    assert.equal((await signUp(app, member.user.email, { inviteId: validInvite.id })).statusCode, 200);
    assert.equal((await prisma.invite.findUnique({ where: { id: validInvite.id } })).acceptedAt, null);
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

  await t.test('an invitation revoked after the early check still rolls back registration', async () => {
    const { user } = await verifiedUser(fixture, 'inviter@example.com');
    process.env.VITE_FEATURE_REGISTRATION = 'false';
    const invite = await prisma.invite.create({ data: { firstName: 'Invited', email: 'invited@example.com', createdById: user.id } });
    const { password: passwordConfig } = await auth.$context;
    const hash = passwordConfig.hash;
    // Better Auth hashes after our precheck, before attempting invitation acceptance.
    const hashing = t.mock.method(passwordConfig, 'hash', async value => {
      await prisma.invite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
      return hash(value);
    });
    try {
      const response = await signUp(app, invite.email, { inviteId: invite.id });
      assert.equal(response.statusCode, 400, response.body);
      assert.equal(await prisma.user.count({ where: { email: invite.email } }), 0);
      assert.equal(await prisma.account.count(), 1);
      assert.equal((await prisma.invite.findUnique({ where: { id: invite.id } })).acceptedAt, null);
    } finally {
      hashing.mock.restore();
    }
  });
});

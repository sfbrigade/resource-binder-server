import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signJWT } from 'better-auth/crypto';
import { authSecret, build, mailToken, mockResetTokenDeletionFailure, nodemailerMock, password, verifiedAdmin, verifiedUser } from '#test/helper.js';

test('Better Auth foundation, passwords and invitations', async (t) => {
  const app = await build(t);
  const { prisma } = app;
  const mail = nodemailerMock.mock;

  await t.test('an unauthenticated request has no session', async () => {
    const response = await app.inject('/api/auth/get-session');
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json(), null);
    assert.equal(await prisma.session.count(), 0);
  });

  await t.test('signup requires verification, then password login and logout work', async () => {
    const response = await app.inject().post('/api/auth/sign-up/email')
      .headers({ origin: process.env.BASE_URL })
      .payload({ firstName: 'Test', lastName: 'Person', email: 'person@example.com', password });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().token, null);
    assert.equal(response.json().user.name, 'Test Person');
    assert.equal((await app.inject().post('/api/auth/sign-in/email')
      .headers({ origin: process.env.BASE_URL })
      .payload({ email: 'person@example.com', password })).statusCode, 403);
    assert.equal((await app.inject(`/api/auth/verify-email?token=${await mailToken(mail)}`)).statusCode, 200);
    const login = await app.inject().post('/api/auth/sign-in/email')
      .headers({ origin: process.env.BASE_URL })
      .payload({ email: 'person@example.com', password });
    assert.equal(login.statusCode, 200, login.body);
    const cookie = login.cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
    assert.ok((await app.inject({ url: '/api/auth/get-session', headers: { cookie } })).json().user.id);
    assert.equal((await app.inject().post('/api/auth/sign-out')
      .headers({ origin: process.env.BASE_URL, cookie })
      .payload({})).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/auth/get-session', headers: { cookie } })).json(), null);
  });

  await t.test('password validation and reset revoke old sessions', async () => {
    assert.equal((await app.inject().post('/api/auth/sign-up/email')
      .headers({ origin: process.env.BASE_URL })
      .payload({ firstName: 'Test', lastName: 'Person', email: 'weak@example.com', password: 'short' })).statusCode, 400);
    assert.equal((await app.inject().post('/api/auth/sign-up/email')
      .headers({ origin: process.env.BASE_URL })
      .payload({ firstName: 'Test', lastName: 'Person', email: 'long@example.com', password: 'a'.repeat(129) })).statusCode, 400);
    const { headers } = await verifiedUser(app);
    const request = await app.inject().post('/api/auth/request-password-reset')
      .headers({ origin: process.env.BASE_URL })
      .payload({ email: 'person@example.com' });
    assert.equal(request.statusCode, 200, request.body);
    const token = await mailToken(mail);
    assert.equal((await app.inject().post('/api/auth/reset-password')
      .headers({ origin: process.env.BASE_URL })
      .payload({ token, newPassword: 'short' })).statusCode, 400);
    assert.equal((await app.inject().post('/api/auth/reset-password')
      .headers({ origin: process.env.BASE_URL })
      .payload({ token, newPassword: 'a'.repeat(129) })).statusCode, 400);
    assert.equal((await app.inject().post('/api/auth/reset-password')
      .headers({ origin: process.env.BASE_URL })
      .payload({ token, newPassword: `${password}New` })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/auth/get-session', headers })).json(), null);
    assert.equal((await app.inject().post('/api/auth/reset-password')
      .headers({ origin: process.env.BASE_URL })
      .payload({ token, newPassword: password })).statusCode, 400);
    assert.equal((await app.inject().post('/api/auth/sign-in/email')
      .headers({ origin: process.env.BASE_URL })
      .payload({ email: 'person@example.com', password: `${password}New` })).statusCode, 200);
  });

  await t.test('missing password bodies return validation errors', async () => {
    for (const path of ['/reset-password', '/change-password']) {
      assert.equal((await app.inject().post(`/api/auth${path}`)
        .headers({ origin: process.env.BASE_URL })).statusCode, 400);
    }
  });

  await t.test('native verification tokens expire, reject tampering, and honor callback URLs', async () => {
    const signup = await app.inject().post('/api/auth/sign-up/email')
      .headers({ origin: process.env.BASE_URL })
      .payload({ firstName: 'Test', lastName: 'Person', email: 'person@example.com', password });
    assert.equal(signup.statusCode, 200, signup.body);
    const token = await mailToken(mail);
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
    const member = await verifiedUser(app);
    const response = await app.inject().post('/api/auth/change-email')
      .headers({ origin: process.env.BASE_URL, ...member.headers })
      .payload({ newEmail: 'changed@example.com' });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal((await prisma.user.findUnique({ where: { id: member.user.id } })).email, member.user.email);
    assert.equal((await app.inject().post('/api/auth/update-user')
      .headers({ origin: process.env.BASE_URL, ...member.headers })
      .payload({ email: 'changed@example.com' })).statusCode, 404);
  });

  for (const { name, changePassword } of [
    {
      name: 'authenticated password changes',
      changePassword: (member) => app.inject().post('/api/auth/change-password')
        .headers({ origin: process.env.BASE_URL, ...member.headers })
        .payload({ currentPassword: password, newPassword: `${password}New` }),
    },
    {
      name: 'password resets',
      changePassword: async (member, tokens) => app.inject().post('/api/auth/reset-password')
        .headers({ origin: process.env.BASE_URL })
        .payload({ token: tokens.shift(), newPassword: `${password}New` }),
    },
    {
      name: 'admin password changes',
      changePassword: async (member) => {
        const admin = await verifiedAdmin(app);
        return app.inject().post('/api/auth/admin/set-user-password')
          .headers({ origin: process.env.BASE_URL, ...admin.headers })
          .payload({ userId: member.user.id, newPassword: `${password}New` });
      },
    },
  ]) {
    await t.test(`${name} invalidate only that user's old reset links`, async () => {
      const member = await verifiedUser(app);
      const other = await verifiedUser(app, 'other@example.com');
      const oldTokens = [];
      for (let i = 0; i < 2; i++) {
        assert.equal((await app.inject().post('/api/auth/request-password-reset')
          .headers({ origin: process.env.BASE_URL })
          .payload({ email: member.user.email })).statusCode, 200);
        oldTokens.push(await mailToken(mail));
      }
      assert.equal((await app.inject().post('/api/auth/request-password-reset')
        .headers({ origin: process.env.BASE_URL })
        .payload({ email: other.user.email })).statusCode, 200);
      const otherToken = await mailToken(mail);
      const unrelated = await prisma.verification.create({
        data: { identifier: 'unrelated-verification', value: member.user.id, expiresAt: new Date(Date.now() + 60000) },
      });
      const credential = await prisma.account.findFirst({ where: { userId: member.user.id, providerId: 'credential' } });
      const response = await changePassword(member, oldTokens);
      assert.equal(response.statusCode, 200, response.body);
      for (const token of oldTokens) {
        assert.equal(await prisma.verification.findUnique({ where: { identifier: `reset-password:${token}` } }), null);
        assert.equal((await app.inject().post('/api/auth/reset-password')
          .headers({ origin: process.env.BASE_URL })
          .payload({ token, newPassword: `${password}OldMailbox` })).statusCode, 400);
      }
      assert.notEqual((await prisma.account.findUnique({ where: { id: credential.id } })).password, credential.password);
      assert.ok(await prisma.verification.findUnique({ where: { id: unrelated.id } }));
      assert.ok(await prisma.verification.findUnique({ where: { identifier: `reset-password:${otherToken}` } }));
      await prisma.rateLimit.deleteMany();
      assert.equal((await app.inject().post('/api/auth/reset-password')
        .headers({ origin: process.env.BASE_URL })
        .payload({ token: otherToken, newPassword: `${password}Other` })).statusCode, 200);
      assert.equal((await app.inject().post('/api/auth/sign-in/email')
        .headers({ origin: process.env.BASE_URL })
        .payload({ email: other.user.email, password: `${password}Other` })).statusCode, 200);
    });
  }

  await t.test('unauthorized password-change attempts do not invalidate reset links', async () => {
    const member = await verifiedUser(app);
    assert.equal((await app.inject().post('/api/auth/request-password-reset')
      .headers({ origin: process.env.BASE_URL })
      .payload({ email: member.user.email })).statusCode, 200);
    const resetToken = await mailToken(mail);
    assert.equal((await app.inject().post('/api/auth/change-password')
      .headers({ origin: process.env.BASE_URL })
      .payload({ currentPassword: password, newPassword: `${password}New` })).statusCode, 401);
    assert.equal((await app.inject().post('/api/auth/change-password')
      .headers({ origin: process.env.BASE_URL, ...member.headers })
      .payload({ currentPassword: 'WrongPassword123!', newPassword: `${password}New` })).statusCode, 400);
    assert.ok(await prisma.verification.findUnique({ where: { identifier: `reset-password:${resetToken}` } }));
    assert.equal((await app.inject().post('/api/auth/reset-password')
      .headers({ origin: process.env.BASE_URL })
      .payload({ token: resetToken, newPassword: `${password}Fresh` })).statusCode, 200);
  });

  for (const { name, attempt } of [
    {
      name: 'password change',
      attempt: (member) => app.inject().post('/api/auth/change-password')
        .headers({ origin: process.env.BASE_URL, ...member.headers })
        .payload({ currentPassword: password, newPassword: `${password}New` }),
    },
    {
      name: 'password reset',
      attempt: (_member, token) => app.inject().post('/api/auth/reset-password')
        .headers({ origin: process.env.BASE_URL })
        .payload({ token, newPassword: `${password}New` }),
    },
  ]) {
    await t.test(`reset-token invalidation failure prevents a ${name}`, async () => {
      const member = await verifiedUser(app);
      const oldTokens = [];
      for (let i = 0; i < 2; i++) {
        assert.equal((await app.inject().post('/api/auth/request-password-reset')
          .headers({ origin: process.env.BASE_URL })
          .payload({ email: member.user.email })).statusCode, 200);
        oldTokens.push(await mailToken(mail));
      }
      const credential = await prisma.account.findFirst({ where: { userId: member.user.id, providerId: 'credential' } });
      const { adapter } = await app.auth.$context;
      const deletion = mockResetTokenDeletionFailure(t, adapter);
      try {
        assert.equal((await attempt(member, oldTokens[0])).statusCode, 500);
        assert.equal((await prisma.account.findUnique({ where: { id: credential.id } })).password, credential.password);
        assert.ok(await prisma.verification.findUnique({ where: { identifier: `reset-password:${oldTokens[1]}` } }));
      } finally {
        deletion.mock.restore();
      }
      await prisma.rateLimit.deleteMany();
      assert.equal((await app.inject().post('/api/auth/reset-password')
        .headers({ origin: process.env.BASE_URL })
        .payload({ token: oldTokens[1], newPassword: `${password}Fresh` })).statusCode, 200);
    });
  }

  await t.test('invalid invitations return the same error for existing and unknown emails', async () => {
    const member = await verifiedUser(app);
    const userCount = await prisma.user.count();
    const accountCount = await prisma.account.count();
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
        const response = await app.inject().post('/api/auth/sign-up/email')
          .headers({ origin: process.env.BASE_URL })
          .payload({ firstName: 'Test', lastName: 'Person', email, password, inviteId: invite.id });
        assert.equal(response.statusCode, 400, `${state}: ${response.body}`);
        responses.push(response.json());
      }
      assert.deepEqual(responses[0], responses[1]);
    }
    assert.equal(await prisma.user.count(), userCount);
    assert.equal(await prisma.account.count(), accountCount);
    assert.equal(mail.getSentMail().length, sentBefore);
    const validInvite = await prisma.invite.create({ data: { firstName: 'Invited', email: member.user.email, createdById: member.user.id } });
    assert.equal((await app.inject().post('/api/auth/sign-up/email')
      .headers({ origin: process.env.BASE_URL })
      .payload({ firstName: 'Test', lastName: 'Person', email: member.user.email, password, inviteId: validInvite.id })).statusCode, 200);
    assert.equal((await prisma.invite.findUnique({ where: { id: validInvite.id } })).acceptedAt, null);
  });

  await t.test('invitation signup is atomic and email-bound when registration is closed', async () => {
    const { user } = await verifiedUser(app, 'inviter@example.com');
    process.env.VITE_FEATURE_REGISTRATION = 'false';
    assert.equal((await app.inject().post('/api/auth/sign-up/email')
      .headers({ origin: process.env.BASE_URL })
      .payload({ firstName: 'Test', lastName: 'Person', email: 'person@example.com', password })).statusCode, 403);
    const invite = await prisma.invite.create({ data: { firstName: 'Invited', email: 'invited@example.com', createdById: user.id } });
    assert.equal((await app.inject().post('/api/auth/sign-up/email')
      .headers({ origin: process.env.BASE_URL })
      .payload({ firstName: 'Test', lastName: 'Person', email: 'wrong@example.com', password, inviteId: invite.id })).statusCode, 400);
    assert.equal(await prisma.user.count({ where: { email: 'wrong@example.com' } }), 0);
    assert.equal((await prisma.invite.findUnique({ where: { id: invite.id } })).acceptedAt, null);
    await prisma.rateLimit.deleteMany();
    const results = await Promise.all([
      app.inject().post('/api/auth/sign-up/email')
        .headers({ origin: process.env.BASE_URL })
        .payload({ firstName: 'Test', lastName: 'Person', email: 'INVITED@example.com', password, inviteId: invite.id }),
      app.inject().post('/api/auth/sign-up/email')
        .headers({ origin: process.env.BASE_URL })
        .payload({ firstName: 'Test', lastName: 'Person', email: 'invited@example.com', password, inviteId: invite.id }),
    ]);
    assert.ok(results.some(r => r.statusCode === 200), results.map(r => r.body).join('\n'));
    const accepted = await prisma.invite.findUnique({ where: { id: invite.id } });
    assert.ok(accepted.acceptedAt);
    assert.equal(await prisma.account.count({ where: { userId: accepted.acceptedById } }), 1);
    assert.equal(await prisma.user.count({ where: { email: 'invited@example.com' } }), 1);
  });

  await t.test('disabled mail prevents registration and invite acceptance', async () => {
    const { user } = await verifiedUser(app, 'inviter@example.com');
    const invite = await prisma.invite.create({ data: { firstName: 'Invited', email: 'invited@example.com', createdById: user.id } });
    process.env.SMTP_ENABLED = 'false';
    assert.equal((await app.inject().post('/api/auth/sign-up/email')
      .headers({ origin: process.env.BASE_URL })
      .payload({ firstName: 'Test', lastName: 'Person', email: 'invited@example.com', password, inviteId: invite.id })).statusCode, 503);
    assert.equal(await prisma.user.count({ where: { email: 'invited@example.com' } }), 0);
    assert.equal((await prisma.invite.findUnique({ where: { id: invite.id } })).acceptedAt, null);
  });

  await t.test('an invitation revoked after the early check still rolls back registration', async () => {
    const { user } = await verifiedUser(app, 'inviter@example.com');
    process.env.VITE_FEATURE_REGISTRATION = 'false';
    const invite = await prisma.invite.create({ data: { firstName: 'Invited', email: 'invited@example.com', createdById: user.id } });
    const accountCount = await prisma.account.count();
    const { password: passwordConfig } = await app.auth.$context;
    const hash = passwordConfig.hash;
    // Better Auth hashes after our precheck, before attempting invitation acceptance.
    const hashing = t.mock.method(passwordConfig, 'hash', async value => {
      await prisma.invite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
      return hash(value);
    });
    try {
      const response = await app.inject().post('/api/auth/sign-up/email')
        .headers({ origin: process.env.BASE_URL })
        .payload({ firstName: 'Test', lastName: 'Person', email: invite.email, password, inviteId: invite.id });
      assert.equal(response.statusCode, 400, response.body);
      assert.equal(await prisma.user.count({ where: { email: invite.email } }), 0);
      assert.equal(await prisma.account.count(), accountCount);
      const revoked = await prisma.invite.findUnique({ where: { id: invite.id } });
      assert.ok(revoked.revokedAt);
      assert.equal(revoked.acceptedAt, null);
    } finally {
      hashing.mock.restore();
    }
  });
});

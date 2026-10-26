import { test } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { build, mailToken, nodemailerMock, password } from '#test/helper.js';

test('web client authentication through the application routes', async (t) => {
  const app = await build(t);
  let cookie = '';
  // Exercise the web client's real request paths, bodies and error handling.
  const previousAdapter = axios.defaults.adapter;
  axios.defaults.adapter = async config => {
    const headers = { ...config.headers.toJSON(), origin: process.env.BASE_URL, cookie };
    const result = await app.inject({
      method: config.method.toUpperCase(),
      url: axios.getUri(config),
      headers,
      ...(config.data ? { payload: config.data } : {}),
    });
    if (result.cookies.length) cookie = result.cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
    const response = { data: result.body, status: result.statusCode, headers: result.headers, config };
    if (!config.validateStatus || config.validateStatus(response.status)) return response;
    throw new axios.AxiosError(`Request failed with status code ${response.status}`, undefined, config, undefined, response);
  };
  let Api;
  try {
    ({ default: Api } = await import('../../../../client/src/Api.js'));
  } finally {
    axios.defaults.adapter = previousAdapter;
  }
  t.beforeEach(() => { cookie = ''; });

  await t.test('an invited user verifies their email before an administrator promotes their existing session', async () => {
    const email = 'invited@example.com';
    await Api.auth.login('admin.user@test.com', 'test');
    const invite = await Api.invites.create({ firstName: 'Invited', lastName: 'Person', email });
    await Api.auth.logout();
    process.env.VITE_FEATURE_REGISTRATION = 'false';
    const signup = await Api.auth.register({ firstName: 'Invited', lastName: 'Person', email, password, inviteId: invite.data.id });
    const token = await mailToken(nodemailerMock.mock);
    const userId = signup.data.user.id;
    assert.equal((await app.prisma.invite.findUnique({ where: { id: invite.data.id } })).acceptedById, userId);
    await Api.auth.login('admin.user@test.com', 'test');
    await assert.rejects(Api.users.setRole(userId, 'admin'), { _form: 'This user must verify their email before becoming an administrator.' });
    await Api.auth.logout();
    await Api.auth.verifyEmail(token);
    await Api.auth.login(email, password);
    const memberCookie = cookie;
    // Four synthetic sign-ins share one connection IP; rate limits have separate coverage.
    await app.prisma.rateLimit.deleteMany();
    await Api.auth.login('admin.user@test.com', 'test');
    assert.equal((await Api.users.setRole(userId, 'admin')).data.isAdmin, true);
    await Api.auth.logout();
    cookie = memberCookie;
    assert.equal((await Api.users.me()).data.isAdmin, true);
    assert.equal((await Api.users.index()).status, 200, 'Promotion must apply without logging in again');
  });

  await t.test('the web client promotes verified users and demotes them through Better Auth', async () => {
    const admin = await Api.auth.login('admin.user@test.com', 'test');
    const memberId = 'dab5dff3-360d-4dbb-98dd-1990dfb5c4c5';
    const pendingId = 'aa1fdcf6-a63c-454e-9775-2d6fd116fdb1';
    await app.prisma.user.update({ where: { id: pendingId }, data: { emailVerified: false } });
    assert.equal((await Api.users.get(memberId)).data.emailVerified, true);
    assert.equal((await Api.users.get(pendingId)).data.emailVerified, false);
    assert.equal((await Api.users.index()).data.find(user => user.id === pendingId).emailVerified, false);
    const promoted = await Api.users.setRole(memberId, 'admin');
    assert.equal(promoted.data.isAdmin, true);
    assert.equal(promoted.data.emailVerified, true);
    assert.equal((await Api.users.setRole(memberId, 'user')).data.isAdmin, false);
    await assert.rejects(Api.users.setRole(pendingId, 'admin'), { _form: 'This user must verify their email before becoming an administrator.' });
    assert.equal((await Api.users.me()).data.id, admin.data.id);
    await Api.auth.logout();
    await Api.auth.login('regular.user@test.com', 'test');
    await assert.rejects(Api.users.setRole(memberId, 'admin'));
    assert.equal((await app.prisma.user.findUnique({ where: { id: memberId } })).role, 'user');
  });

  await t.test('profile saves submit only editable profile fields and preserve credentials and roles', async () => {
    const member = await Api.auth.login('regular.user@test.com', 'test');
    const updated = await Api.users.update(member.data.id, {
      ...member.data,
      firstName: 'Updated',
      email: 'changed@example.com',
      password: 'NewPassword123!',
      isAdmin: true,
      emailVerified: false,
    });
    assert.equal(updated.data.firstName, 'Updated');
    assert.equal(updated.data.email, member.data.email);
    assert.equal(updated.data.isAdmin, false);
    assert.equal(updated.data.emailVerified, true);
    await Api.auth.logout();
    assert.equal((await Api.auth.login(member.data.email, 'test')).data.id, member.data.id);
  });

  await t.test('a verified administrator can log in, access admin routes and log out', async () => {
    const email = 'bootstrap@example.com';
    await app.auth.api.createUser({
      body: { name: 'First Admin', email, password, role: 'admin', data: { firstName: 'First', lastName: 'Admin', emailVerified: true } },
    });
    const login = await Api.auth.login(email, password);
    assert.equal(login.data.email, email);
    assert.equal(login.data.isAdmin, true);
    assert.equal((await Api.users.index()).status, 200);
    await Api.auth.logout();
    assert.equal((await Api.users.me()).status, 204);
  });

  await t.test('password recovery sends mail, resets the password and permits login', async () => {
    const email = 'bootstrap@example.com';
    await app.auth.api.createUser({
      body: { name: 'First Admin', email, password, role: 'admin', data: { firstName: 'First', lastName: 'Admin', emailVerified: true } },
    });
    await Api.passwords.reset(email);
    const token = await mailToken(nodemailerMock.mock);
    assert.ok(token);
    await Api.auth.login(email, password);
    await Api.passwords.update(token, `${password}Changed`);
    assert.equal((await Api.users.me()).status, 204, 'Password reset must revoke the old browser session');
    await assert.rejects(Api.passwords.update(token, password), { _form: 'This link is invalid or has expired. Please request a new one.' });
    await assert.rejects(Api.auth.login(email, password), { _form: 'Invalid email and/or password.' });
    const login = await Api.auth.login(email, `${password}Changed`);
    assert.equal(login.data.email, email);
  });

  await t.test('signup remains signed out until email verification, then returns the application profile', async () => {
    const email = 'new.user@example.com';
    const signup = await Api.auth.register({ email, password, firstName: 'New', lastName: 'User' });
    assert.equal(signup.data.token, null);
    assert.equal((await Api.users.me()).status, 204);
    await assert.rejects(Api.auth.login(email, password), { _form: 'Please verify your email before logging in.', _code: 'EMAIL_NOT_VERIFIED' });
    await Api.auth.sendVerificationEmail(email);
    await Api.auth.verifyEmail(await mailToken(nodemailerMock.mock));
    const login = await Api.auth.login(email, password);
    assert.equal(login.data.email, email);
    assert.equal(login.data.isAdmin, false);
    assert.equal(login.data.user, undefined, 'The login screen needs the application profile, not the Better Auth wrapper');
  });

  await t.test('unknown reset addresses have the same public response', async () => {
    const known = await Api.passwords.reset('regular.user@test.com');
    const unknown = await Api.passwords.reset('unknown@example.com');
    assert.equal(known.status, 200);
    assert.deepEqual(known.data, unknown.data);
  });

  await t.test('invalid credentials and expired links stay on the form instead of redirecting', async () => {
    const previousWindow = globalThis.window;
    globalThis.window = { location: '/login?from=/admin' };
    try {
      await assert.rejects(Api.auth.login('unknown@example.com', password), { _form: 'Invalid email and/or password.' });
      await assert.rejects(Api.auth.verifyEmail('invalid'), { _form: 'This link is invalid or has expired. Please request a new one.' });
      await assert.rejects(Api.passwords.update('invalid', password), { _form: 'This link is invalid or has expired. Please request a new one.' });
      assert.equal(globalThis.window.location, '/login?from=/admin');
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  });

  await t.test('a magic email link establishes the browser session', async () => {
    await app.inject().post('/api/auth/sign-in/magic-link').payload({ email: 'regular.user@test.com' });
    const login = await Api.auth.verifyMagicLink(await mailToken(nodemailerMock.mock));
    assert.equal(login.data.email, 'regular.user@test.com');
    assert.equal((await Api.users.me()).data.id, login.data.id);
  });
});

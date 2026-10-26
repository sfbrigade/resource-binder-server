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

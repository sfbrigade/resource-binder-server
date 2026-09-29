import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuth } from './auth-helper.js';

test('Better Auth foundation', async (t) => {
  const { app, prisma } = await buildAuth(t);
  const response = await app.inject('/api/auth/get-session');
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json(), null);
  assert.equal(await prisma.session.count(), 0);
});

import { test } from 'node:test';
import * as assert from 'node:assert';
import { StatusCodes } from 'http-status-codes';

import { authenticate, build, nodemailerMock } from '#test/helper.js';

test('/api/invites', async (t) => {
  const app = await build(t);
  let adminHeaders;
  t.beforeEach(async () => { adminHeaders = await authenticate(app, 'admin.user@test.com', 'test'); });
  const { prisma } = app;

  await t.test('GET /', async (t) => {
    await t.test('returns a list of Invites', async (t) => {
      const response = await app.inject().get('/api/invites').headers(adminHeaders);
      assert.deepStrictEqual(response.statusCode, StatusCodes.OK);

      const data = JSON.parse(response.body);
      assert.ok(Array.isArray(data));
      assert.deepStrictEqual(data.length, 2);
    });
  });

  await t.test('POST /', async (t) => {
    await t.test('creates a new Invite', async (t) => {
      const previousLinkOrigin = process.env.AUTH_LINK_BASE_URL;
      process.env.AUTH_LINK_BASE_URL = 'https://links.example.com/';
      t.after(() => {
        if (previousLinkOrigin === undefined) delete process.env.AUTH_LINK_BASE_URL;
        else process.env.AUTH_LINK_BASE_URL = previousLinkOrigin;
      });
      const response = await app.inject().post('/api/invites').payload({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@test.com',
        message: 'Welcome!',
      }).headers(adminHeaders);
      assert.deepStrictEqual(response.statusCode, StatusCodes.CREATED);

      let data = JSON.parse(response.body);
      assert.deepStrictEqual(data.firstName, 'John');
      assert.deepStrictEqual(data.lastName, 'Doe');
      assert.deepStrictEqual(data.email, 'john.doe@test.com');
      assert.deepStrictEqual(data.message, 'Welcome!');

      data = await prisma.invite.findUnique({ where: { id: data.id } });
      assert.deepStrictEqual(data.firstName, 'John');
      assert.deepStrictEqual(data.lastName, 'Doe');
      assert.deepStrictEqual(data.email, 'john.doe@test.com');
      assert.deepStrictEqual(data.message, 'Welcome!');

      const sentMail = nodemailerMock.mock.getSentMail();
      assert.deepStrictEqual(sentMail.length, 1);
      const [mail] = sentMail;
      assert.deepStrictEqual(mail.to, 'John Doe <john.doe@test.com>');
      assert.ok(mail.html.includes('Welcome!'));
      assert.ok(mail.html.includes(data.id));
      assert.ok(mail.text.includes('Welcome!'));
      assert.ok(mail.text.includes(data.id));
      for (const body of [mail.html, mail.text]) {
        assert.ok(body.includes(`https://links.example.com/api/auth/links/invite?inviteId=${data.id}`));
      }
    });

    for (const [omitted, attributes] of [
      ['message', { lastName: 'Doe' }],
      ['lastName', { message: 'Welcome!' }],
      ['lastName and message', {}],
    ]) {
      await t.test(`handles omitted ${omitted} throughout the invitation lifecycle`, async () => {
        const email = 'optional.invite@test.com';
        const response = await app.inject().post('/api/invites').headers(adminHeaders)
          .payload({ firstName: 'John', email, ...attributes });
        assert.strictEqual(response.statusCode, StatusCodes.CREATED, response.body);
        const { id } = response.json();
        const checkOptionalFields = (data) => {
          assert.strictEqual(data.lastName, attributes.lastName ?? null);
          assert.strictEqual(data.message, attributes.message ?? null);
        };
        checkOptionalFields(response.json());
        checkOptionalFields(await prisma.invite.findUnique({ where: { id } }));
        assert.strictEqual(await prisma.invite.count({ where: { email } }), 1);
        assert.strictEqual(nodemailerMock.mock.getSentMail().length, 1);

        const detail = await app.inject().get(`/api/invites/${id}`);
        assert.strictEqual(detail.statusCode, StatusCodes.OK, detail.body);
        checkOptionalFields(detail.json());

        const list = await app.inject().get('/api/invites').headers(adminHeaders);
        assert.strictEqual(list.statusCode, StatusCodes.OK, list.body);
        checkOptionalFields(list.json().find(invite => invite.id === id));

        const resend = await app.inject().patch(`/api/invites/${id}/resend`).headers(adminHeaders);
        assert.strictEqual(resend.statusCode, StatusCodes.OK, resend.body);
        checkOptionalFields(resend.json());
        assert.strictEqual(nodemailerMock.mock.getSentMail().length, 2);

        const revoke = await app.inject().delete(`/api/invites/${id}`).headers(adminHeaders);
        assert.strictEqual(revoke.statusCode, StatusCodes.OK, revoke.body);
        checkOptionalFields(revoke.json());
        assert.ok(revoke.json().revokedAt);
        assert.strictEqual((await app.inject().get(`/api/invites/${id}`)).statusCode, StatusCodes.GONE);
      });
    }

    await t.test('rejects null or invalid supplied optional fields before creating an invitation', async () => {
      const email = 'invalid.invite@test.com';
      for (const attributes of [{ lastName: 'A' }, { lastName: null }, { message: null }]) {
        const response = await app.inject().post('/api/invites').headers(adminHeaders)
          .payload({ firstName: 'John', email, ...attributes });
        assert.strictEqual(response.statusCode, StatusCodes.UNPROCESSABLE_ENTITY, response.body);
      }
      assert.strictEqual(await prisma.invite.count({ where: { email } }), 0);
      assert.strictEqual(nodemailerMock.mock.getSentMail().length, 0);
    });
  });

  await t.test('GET /:id', async (t) => {
    await t.test('returns a valid Invite', async (t) => {
      const response = await app.inject().get('/api/invites/7d7c61a6-55ac-4bad-8c8c-5d3aaaa1c5de');
      assert.deepStrictEqual(response.statusCode, StatusCodes.OK);

      const data = JSON.parse(response.body);
      assert.deepStrictEqual(data.id, '7d7c61a6-55ac-4bad-8c8c-5d3aaaa1c5de');
      assert.deepStrictEqual(data.firstName, 'Invited');
      assert.deepStrictEqual(data.lastName, 'User 2');
      assert.deepStrictEqual(data.email, 'invited.user.2@test.com');
      assert.deepStrictEqual(data.message, 'This is an invitation to Invited User 2.');
    });

    await t.test('returns forbidden for accepted/revoked invite', async (t) => {
      let response = await app.inject().get('/api/invites/e28fddba-8e9b-41c9-924a-c5f1f4a2f8f6');
      assert.deepStrictEqual(response.statusCode, StatusCodes.GONE);

      response = await app.inject().get('/api/invites/157d4be5-fd7d-4d08-b74e-2d3584062c8a');
      assert.deepStrictEqual(response.statusCode, StatusCodes.GONE);
    });
  });

  await t.test('PATCH /:id/resend', async (t) => {
    await t.test('resends an Invite', async (t) => {
      const response = await app.inject().patch('/api/invites/7d7c61a6-55ac-4bad-8c8c-5d3aaaa1c5de/resend').headers(adminHeaders);
      assert.deepStrictEqual(response.statusCode, StatusCodes.OK);

      const sentMail = nodemailerMock.mock.getSentMail();
      assert.deepStrictEqual(sentMail.length, 1);
    });

    await t.test('returns gone for accepted/revoked invite', async (t) => {
      let response = await app.inject().patch('/api/invites/e28fddba-8e9b-41c9-924a-c5f1f4a2f8f6/resend').headers(adminHeaders);
      assert.deepStrictEqual(response.statusCode, StatusCodes.GONE);

      response = await app.inject().patch('/api/invites/157d4be5-fd7d-4d08-b74e-2d3584062c8a/resend').headers(adminHeaders);
      assert.deepStrictEqual(response.statusCode, StatusCodes.GONE);
    });
  });

  await t.test('DELETE /:id', async (t) => {
    await t.test('revokes an Invite', async (t) => {
      const response = await app.inject().delete('/api/invites/7d7c61a6-55ac-4bad-8c8c-5d3aaaa1c5de').headers(adminHeaders);
      assert.deepStrictEqual(response.statusCode, StatusCodes.OK);

      let data = JSON.parse(response.body);
      assert.ok(data.revokedAt);
      assert.deepStrictEqual(data.revokedById, '555740af-17e9-48a3-93b8-d5236dfd2c29');

      data = await prisma.invite.findUnique({ where: { id: '7d7c61a6-55ac-4bad-8c8c-5d3aaaa1c5de' } });
      assert.ok(data.revokedAt);
      assert.deepStrictEqual(data.revokedById, '555740af-17e9-48a3-93b8-d5236dfd2c29');
    });

    await t.test('returns gone for already accepted/revoked invite', async (t) => {
      let response = await app.inject().delete('/api/invites/e28fddba-8e9b-41c9-924a-c5f1f4a2f8f6').headers(adminHeaders);
      assert.deepStrictEqual(response.statusCode, StatusCodes.GONE);

      response = await app.inject().delete('/api/invites/157d4be5-fd7d-4d08-b74e-2d3584062c8a').headers(adminHeaders);
      assert.deepStrictEqual(response.statusCode, StatusCodes.GONE);
    });
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build, mailToken, nodemailerMock, password } from '#test/helper.js';
import { createAuth } from '#lib/auth.js';
import { configureMailer } from '#lib/mailer.js';

test('first-admin verification email', async (t) => {
  const app = await build(t);
  const { prisma } = app;
  const mail = nodemailerMock.mock;

  for (const [name, relativePath] of [['repository root', '../../'], ['server directory', '../']]) {
    await t.test(`renders and verifies when invoked from the ${name}`, async () => {
      const cwd = process.cwd();
      try {
        process.chdir(fileURLToPath(new URL(relativePath, import.meta.url)));
        configureMailer(nodemailerMock);
        const auth = createAuth(prisma);
        const email = 'first-admin@example.com';
        const { user } = await auth.api.createUser({
          body: { name: 'First Admin', email, password, role: 'admin', data: { firstName: 'First', lastName: 'Admin' } },
        });
        await auth.api.sendVerificationEmail({ body: { email } });
        assert.equal(mail.getSentMail().length, 1);
        const message = mail.getSentMail()[0];
        assert.equal(message.to, email);
        assert.match(message.subject, /^Verify your .* email/);
        const token = await mailToken(mail);
        assert.ok(token);
        for (const body of [message.html, message.text]) {
          assert.ok(body.includes('Hello First,'));
          assert.ok(body.includes(`/auth/verify-email?token=${encodeURIComponent(token)}`));
        }
        assert.equal((await app.inject(`/api/auth/verify-email?token=${token}`)).statusCode, 200);
        const verified = await prisma.user.findUnique({ where: { id: user.id } });
        assert.equal(verified.emailVerified, true);
        assert.equal(verified.role, 'admin');
      } finally {
        process.chdir(cwd);
        configureMailer(nodemailerMock);
      }
    });
  }
});

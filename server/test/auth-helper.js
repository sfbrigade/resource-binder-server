import '../config.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import Fastify from 'fastify';
import * as nodemailerMock from 'nodemailer-mock';

import { createClient } from '#prisma/client.js';
import { createAuth } from '#lib/auth.js';
import { registerAuthRoutes } from '#lib/auth-http.js';
import { configureMailer } from '#lib/mailer.js';

export async function buildAuth (t) {
  const container = await new PostgreSqlContainer('postgres:18.3').start();
  t.after(() => container.stop());
  const databaseURL = container.getConnectionUri();
  await promisify(execFile)(process.execPath, ['../node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseURL },
  });
  const prisma = createClient(databaseURL);
  t.after(() => prisma.$disconnect());
  configureMailer(nodemailerMock);
  const auth = createAuth(prisma, {
    baseURL: 'http://localhost:3333',
    secret: 'test-only-secret-with-at-least-32-characters',
  });
  const app = Fastify();
  registerAuthRoutes(app, auth);
  t.after(() => app.close());
  await app.ready();
  t.beforeEach(async () => {
    await prisma.invite.deleteMany();
    await prisma.user.deleteMany();
    await prisma.verification.deleteMany();
    await prisma.rateLimit.deleteMany();
    nodemailerMock.mock.reset();
    process.env.SMTP_ENABLED = 'true';
    process.env.VITE_FEATURE_REGISTRATION = 'true';
  });
  return { app, auth, prisma, mail: nodemailerMock.mock };
}

export const password = 'SecurePassword123!';

export function post (app, path, payload, headers = {}) {
  return app.inject({ method: 'POST', url: `/api/auth${path}`, payload, headers: { origin: 'http://localhost:3333', ...headers } });
}

export function mailToken (mail) {
  const text = mail.getSentMail().at(-1).text;
  const url = new URL(text.match(/http[^\s]+/)[0]);
  return url.searchParams.get('token') ?? url.pathname.split('/').at(-1);
}

export async function signUp (app, email = 'person@example.com', extra = {}) {
  return post(app, '/sign-up/email', { firstName: 'Test', lastName: 'Person', email, password, ...extra });
}

export async function verifiedUser ({ app, mail, prisma }, email = 'person@example.com') {
  const signup = await signUp(app, email);
  if (signup.statusCode !== 200) throw new Error(`Signup failed: ${signup.body}`);
  const verification = await app.inject(`/api/auth/verify-email?token=${mailToken(mail)}`);
  if (verification.statusCode !== 200) throw new Error(`Verification failed: ${verification.statusCode}`);
  const login = await post(app, '/sign-in/email', { email, password });
  if (login.statusCode !== 200) throw new Error(`Login failed: ${login.statusCode}`);
  const cookie = login.cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
  await prisma.rateLimit.deleteMany();
  return { user: signup.json().user, headers: { cookie }, token: login.json().token };
}

export async function verifiedAdmin ({ auth, app, mail, prisma }) {
  const email = 'admin@example.com';
  const { user } = await auth.api.createUser({ body: { name: 'Test Admin', email, password, role: 'admin', data: { firstName: 'Test', lastName: 'Admin' } } });
  await auth.api.sendVerificationEmail({ body: { email } });
  const verified = await app.inject(`/api/auth/verify-email?token=${mailToken(mail)}`);
  if (verified.statusCode !== 200) throw new Error('Admin verification failed');
  const login = await post(app, '/sign-in/email', { email, password });
  if (login.statusCode !== 200) throw new Error(`Admin login failed: ${login.statusCode}`);
  await prisma.rateLimit.deleteMany();
  return { user, headers: { cookie: login.cookies.map(({ name, value }) => `${name}=${value}`).join('; ') } };
}

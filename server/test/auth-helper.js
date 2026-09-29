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
  return { app, auth, prisma, mail: nodemailerMock.mock };
}

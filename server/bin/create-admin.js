#!/usr/bin/env node
import '../config.js';
import prisma from '#prisma/client.js';
import { createAuth } from '#lib/auth.js';

if (process.argv.length !== 6) {
  console.error('Usage: bin/create-admin.js First Last email@address.com password');
  process.exit(1);
}

const [firstName, lastName, email, password] = process.argv.slice(2);
try {
  const auth = createAuth(prisma);
  await auth.api.createUser({ body: { name: `${firstName} ${lastName}`, email, password, role: 'admin', data: { firstName, lastName } } });
  await auth.api.sendVerificationEmail({ body: { email } });
  console.log('Admin created. Check your email to verify the account before signing in.');
} catch {
  console.error('Admin creation or email delivery failed. If the account exists, request another verification email.');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

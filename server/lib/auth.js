import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { getCurrentAdapter, queueAfterTransactionHook } from '@better-auth/core/context';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { hashPassword } from 'better-auth/crypto';
import User from '#models/user.js';
import mailer from '#lib/mailer.js';

async function sendAuthEmail (email, template, locals) {
  if (process.env.SMTP_ENABLED !== 'true') {
    throw new APIError('SERVICE_UNAVAILABLE', { message: 'Email delivery is unavailable.' });
  }
  try {
    await mailer.send({ message: { to: email }, template, locals });
  } catch {
    throw new APIError('SERVICE_UNAVAILABLE', { message: 'Email delivery failed. Please try again.' });
  }
}

// Declaring the existing Invite table lets hooks update it on Better Auth's
// transaction adapter. No invitation endpoints or credential writes are added.
const invitations = {
  id: 'invitations',
  schema: {
    invite: {
      fields: {
        firstName: { type: 'string' },
        lastName: { type: 'string', required: false },
        email: { type: 'string' },
        message: { type: 'string', required: false },
        createdById: { type: 'string' },
        acceptedById: { type: 'string', required: false },
        revokedById: { type: 'string', required: false },
        acceptedAt: { type: 'date', required: false },
        revokedAt: { type: 'date', required: false },
        createdAt: { type: 'date' },
        updatedAt: { type: 'date' },
      },
    },
  },
};

// Construct after configuration is loaded; tests supply their own database.
export function createAuth (prisma, { baseURL = process.env.BASE_URL, secret = process.env.BETTER_AUTH_SECRET } = {}) {
  return betterAuth({
    baseURL,
    secret,
    trustedOrigins: [new URL(baseURL).origin],
    database: prismaAdapter(prisma, { provider: 'postgresql', transaction: true }),
    advanced: {
      database: { generateId: 'uuid' },
      ipAddress: { ipAddressHeaders: ['x-auth-client-ip'] },
    },
    user: {
      changeEmail: { enabled: true },
      additionalFields: {
        firstName: { type: 'string', required: true },
        lastName: { type: 'string', required: true },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 30 * 60,
      password: {
        async hash (password) {
          const result = User.PasswordSchema.safeParse(password);
          if (!result.success) throw new APIError('BAD_REQUEST', { message: result.error.issues[0].message });
          return hashPassword(password);
        },
      },
      sendResetPassword: ({ user, url }) => sendAuthEmail(user.email, 'password-reset', { firstName: user.firstName, url }),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: ({ user, url }) => queueAfterTransactionHook(() => sendAuthEmail(user.email, 'verification', { firstName: user.firstName, url })),
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (['/reset-password', '/change-password'].includes(ctx.path)) {
          const result = User.PasswordSchema.safeParse(ctx.body.newPassword);
          if (!result.success) throw new APIError('BAD_REQUEST', { message: result.error.issues[0].message });
        }
        if (ctx.path !== '/sign-up/email') return;
        if (process.env.SMTP_ENABLED !== 'true') throw new APIError('SERVICE_UNAVAILABLE', { message: 'Email delivery is unavailable.' });
        const result = User.RegisterSchema.safeParse(ctx.body);
        if (!result.success) throw new APIError('BAD_REQUEST', { message: result.error.issues[0].message });
        const { firstName, lastName, inviteId } = result.data;
        if (!inviteId && process.env.VITE_FEATURE_REGISTRATION !== 'true') {
          throw new APIError('FORBIDDEN', { message: 'A valid invitation is required.' });
        }
        return { context: { body: { ...ctx.body, name: `${firstName} ${lastName}` } } };
      }),
    },
    databaseHooks: {
      account: {
        create: {
          async before (account, ctx) {
            if (ctx?.path !== '/sign-up/email' || !ctx.body.inviteId) return;
            const adapter = await getCurrentAdapter(ctx.context.adapter);
            const invite = await adapter.update({
              model: 'invite',
              where: [
                { field: 'id', value: ctx.body.inviteId },
                { field: 'email', value: ctx.body.email.toLowerCase() },
                { field: 'acceptedAt', value: null },
                { field: 'revokedAt', value: null },
              ],
              update: { acceptedAt: new Date(), acceptedById: account.userId },
            });
            if (!invite) throw new APIError('BAD_REQUEST', { message: 'Invitation is invalid or no longer available.' });
          },
        },
      },
    },
    plugins: [invitations],
    session: { expiresIn: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
    rateLimit: { enabled: true, storage: 'database' },
  });
}

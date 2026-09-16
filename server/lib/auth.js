import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { getCurrentAdapter, queueAfterTransactionHook } from '@better-auth/core/context';
import { APIError, createAuthMiddleware, sendVerificationEmailFn } from 'better-auth/api';
import { hashPassword, verifyJWT } from 'better-auth/crypto';
import { admin } from 'better-auth/plugins';
import { defaultAc, userAc } from 'better-auth/plugins/admin/access';
import User from '#models/user.js';
import mailer from '#lib/mailer.js';

const EMAIL_VERIFICATION_EXPIRES_IN = 60 * 60;

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
        email: { type: 'string' },
        acceptedById: { type: 'string', required: false },
        acceptedAt: { type: 'date', required: false },
        revokedAt: { type: 'date', required: false },
      },
    },
  },
};

// Construct after configuration is loaded; tests supply their own database.
export function createAuth (prisma, { baseURL = process.env.BASE_URL, secret = process.env.BETTER_AUTH_SECRET } = {}) {
  const auth = betterAuth({
    baseURL,
    secret,
    trustedOrigins: [new URL(baseURL).origin],
    disabledPaths: ['/update-user'],
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
        deactivatedAt: { type: 'date', required: false, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
        ...coreFields, role: 'user', banned: false, banReason: null, banExpires: null, ...additionalFields, id,
      }),
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
      expiresIn: EMAIL_VERIFICATION_EXPIRES_IN,
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: ({ user, url, token }) => queueAfterTransactionHook(async () => {
        // Indirection makes Better Auth's signed verification links revocable.
        const identifier = `email-verification:${user.id}:${randomUUID()}`;
        const { internalAdapter } = await auth.$context;
        await internalAdapter.createVerificationValue({
          identifier,
          value: token,
          expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_EXPIRES_IN * 1000),
        });
        const verificationURL = new URL(url);
        verificationURL.searchParams.set('token', identifier);
        await sendAuthEmail(user.email, 'verification', { firstName: user.firstName, url: verificationURL.toString() });
      }),
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/verify-email') {
          const token = ctx.query?.token;
          const verification = typeof token === 'string' && token.startsWith('email-verification:')
            ? await ctx.context.internalAdapter.findVerificationValue(token)
            : null;
          if (!verification || verification.expiresAt <= new Date()) {
            throw new APIError('UNAUTHORIZED', { code: 'INVALID_TOKEN', message: 'Verification link is invalid or expired.' });
          }
          return { context: { query: { ...ctx.query, token: verification.value } } };
        }
        if (ctx.path === '/admin/create-user' && ctx.body?.password) {
          const result = User.PasswordSchema.safeParse(ctx.body.password);
          if (!result.success) throw new APIError('BAD_REQUEST', { message: result.error.issues[0].message });
        }
        if (['/reset-password', '/change-password', '/admin/set-user-password'].includes(ctx.path)) {
          const result = User.PasswordSchema.safeParse(ctx.body?.newPassword);
          if (!result.success) throw new APIError('BAD_REQUEST', { message: result.error.issues[0].message });
        }
        if (ctx.path === '/admin/update-user') {
          // Other management actions have dedicated permission-checked APIs.
          const data = ctx.body?.data;
          if (!data || typeof data !== 'object' || Array.isArray(data) ||
            typeof data.email !== 'string' || !data.email || Object.keys(data).some(key => key !== 'email')) {
            throw new APIError('BAD_REQUEST', { message: 'Use this endpoint to change email only.' });
          }
        }
        if (ctx.path !== '/sign-up/email') return;
        if (process.env.SMTP_ENABLED !== 'true') throw new APIError('SERVICE_UNAVAILABLE', { message: 'Email delivery is unavailable.' });
        const result = User.RegisterSchema.safeParse(ctx.body);
        if (!result.success) throw new APIError('BAD_REQUEST', { message: result.error.issues[0].message });
        const { firstName, lastName, inviteId } = result.data;
        if (!inviteId && process.env.VITE_FEATURE_REGISTRATION !== 'true') {
          throw new APIError('FORBIDDEN', { message: 'A valid invitation is required.' });
        }
        // Reject invalid invitations before Better Auth's duplicate-email response.
        if (inviteId && !await prisma.invite.findFirst({
          where: { id: inviteId, email: result.data.email.toLowerCase(), acceptedAt: null, revokedAt: null },
        })) {
          throw new APIError('BAD_REQUEST', { message: 'Invitation is invalid or no longer available.' });
        }
        return { context: { body: { ...ctx.body, name: `${firstName} ${lastName}` } } };
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before (user) {
            const result = User.RegisterSchema.omit({ password: true, inviteId: true }).safeParse(user);
            if (!result.success) throw new APIError('BAD_REQUEST', { message: result.error.issues[0].message });
            return { data: { ...user, name: `${user.firstName} ${user.lastName}`, emailVerified: false } };
          },
        },
        update: {
          async before (data, ctx) {
            if (ctx?.path === '/verify-email' && data.email) {
              // Email-change links can be verified without an authenticated session.
              const token = await verifyJWT(ctx.query.token, ctx.context.secret);
              const existing = token?.email && await ctx.context.internalAdapter.findUserByEmail(token.email);
              if (!existing) throw new APIError('UNAUTHORIZED', { message: 'Email-change link is invalid or expired.' });
              const adapter = await getCurrentAdapter(ctx.context.adapter);
              await adapter.deleteMany({
                model: 'verification',
                where: [
                  { field: 'value', value: existing.user.id },
                  { field: 'identifier', operator: 'starts_with', value: 'reset-password:' },
                ],
              });
            }
            if (ctx?.path === '/admin/update-user' && data.email) {
              const adapter = await getCurrentAdapter(ctx.context.adapter);
              await adapter.deleteMany({
                model: 'verification',
                where: [
                  { field: 'value', value: ctx.body.userId },
                  { field: 'identifier', operator: 'starts_with', value: 'reset-password:' },
                ],
              });
              await adapter.deleteMany({
                model: 'verification',
                where: [{ field: 'identifier', operator: 'starts_with', value: `email-verification:${ctx.body.userId}:` }],
              });
              await ctx.context.internalAdapter.deleteUserSessions(ctx.body.userId);
              return { data: { ...data, emailVerified: false } };
            }
            if (typeof data.banned === 'boolean') return { data: { ...data, deactivatedAt: data.banned ? new Date() : null } };
          },
          async after (user, ctx) {
            if (ctx?.path === '/admin/update-user' && ctx.body.data.email) await sendVerificationEmailFn(ctx, user);
          },
        },
      },
      session: {
        create: {
          async before (session, ctx) {
            const user = await ctx.context.internalAdapter.findUserById(session.userId);
            if (!user?.emailVerified || user.banned) throw new APIError('FORBIDDEN', { message: 'Account is not available for sign-in.' });
          },
        },
      },
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
          async after (account, ctx) {
            if (ctx?.path === '/admin/set-user-password') await ctx.context.internalAdapter.deleteUserSessions(account.userId);
          },
        },
        update: {
          async after (account, ctx) {
            if (ctx?.path === '/admin/set-user-password') await ctx.context.internalAdapter.deleteUserSessions(ctx.body.userId);
          },
        },
      },
    },
    plugins: [invitations, admin({
      roles: {
        user: userAc,
        admin: defaultAc.newRole({
          user: ['get', 'list', 'update', 'set-email', 'set-password', 'set-role', 'ban'],
          session: ['list', 'revoke'],
        }),
      },
    })],
    session: { expiresIn: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
    rateLimit: { enabled: true, storage: 'database' },
  });
  return auth;
}

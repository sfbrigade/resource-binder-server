import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { getCurrentAdapter } from '@better-auth/core/context';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { admin, bearer, magicLink } from 'better-auth/plugins';
import { defaultAc, userAc } from 'better-auth/plugins/admin/access';
import User from '#models/user.js';
import mailer from '#lib/mailer.js';

const EMAIL_VERIFICATION_EXPIRES_IN = 60 * 60;
const CREDENTIAL_WRITE_PATHS = ['/reset-password', '/change-password', '/admin/set-user-password'];

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

function credentialWriteUserId (ctx) {
  if (ctx.path === '/change-password') return ctx.context.session?.user?.id;
  if (ctx.path === '/admin/set-user-password') return ctx.body?.userId;
  if (ctx.path === '/reset-password') return ctx.resetPasswordUserId;
}

async function deleteUserResetTokens (ctx, userId) {
  const adapter = await getCurrentAdapter(ctx.context.adapter);
  await adapter.deleteMany({
    model: 'verification',
    where: [
      { field: 'value', value: userId },
      { field: 'identifier', operator: 'starts_with', value: 'reset-password:' },
    ],
  });
}

async function deleteResetTokensBeforeCredentialWrite (ctx) {
  if (!CREDENTIAL_WRITE_PATHS.includes(ctx?.path)) return;
  const userId = credentialWriteUserId(ctx);
  if (!userId) throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Unable to resolve user for credential update.' });
  await deleteUserResetTokens(ctx, userId);
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
  const linkOrigin = new URL(process.env.AUTH_LINK_BASE_URL || baseURL).origin;
  const appLink = (action, token) => {
    const url = new URL(`/auth/${action}`, linkOrigin);
    url.searchParams.set('token', token);
    return url.toString();
  };
  return betterAuth({
    baseURL,
    secret,
    trustedOrigins: [new URL(baseURL).origin, linkOrigin],
    disabledPaths: ['/update-user', '/admin/update-user'],
    database: prismaAdapter(prisma, { provider: 'postgresql', transaction: true }),
    advanced: {
      database: { generateId: 'uuid' },
      ipAddress: { ipAddressHeaders: ['x-auth-client-ip'] },
    },
    user: {
      changeEmail: { enabled: false },
      additionalFields: {
        firstName: { type: 'string', required: true },
        lastName: { type: 'string', required: true },
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
      sendResetPassword: ({ user, token }) => sendAuthEmail(user.email, 'password-reset', { firstName: user.firstName, url: appLink('reset-password', token) }),
    },
    emailVerification: {
      expiresIn: EMAIL_VERIFICATION_EXPIRES_IN,
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: ({ user, token }) => sendAuthEmail(user.email, 'verification', { firstName: user.firstName, url: appLink('verify-email', token) }),
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-up/email') return;
        if (process.env.SMTP_ENABLED !== 'true') throw new APIError('SERVICE_UNAVAILABLE', { message: 'Email delivery is unavailable.' });
        const result = User.RegisterSchema.omit({ password: true }).safeParse(ctx.body);
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
          before (data, ctx) {
            // Magic links are sign-in only and must not mark an unverified email as verified.
            if (ctx?.path === '/magic-link/verify' && data.emailVerified) {
              throw new APIError('FORBIDDEN', { message: 'Verify your email before signing in.' });
            }
          },
        },
      },
      verification: {
        delete: {
          before (verification, ctx) {
            if (ctx?.path === '/reset-password' && typeof verification.identifier === 'string' &&
              verification.identifier.startsWith('reset-password:')) {
              ctx.resetPasswordUserId = verification.value;
            }
          },
        },
      },
      account: {
        delete: {
          before (account, ctx) {
            // Magic links are sign-in only, including links issued before the
            // email became unverified. Preserve the password account.
            if (ctx?.path === '/magic-link/verify') throw new APIError('FORBIDDEN', { message: 'Verify your email before signing in.' });
          },
        },
        create: {
          async before (account, ctx) {
            await deleteResetTokensBeforeCredentialWrite(ctx);
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
          async before (_account, ctx) {
            await deleteResetTokensBeforeCredentialWrite(ctx);
          },
          async after (_account, ctx) {
            if (ctx?.path === '/admin/set-user-password') await ctx.context.internalAdapter.deleteUserSessions(ctx.body.userId);
          },
        },
      },
    },
    plugins: [invitations, bearer(), magicLink({
      disableSignUp: true,
      expiresIn: 300,
      storeToken: 'hashed',
      async sendMagicLink ({ email, token }) {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.emailVerified || user.banned) return;
        await sendAuthEmail(user.email, 'magic-link', { firstName: user.firstName, url: appLink('magic-link', token) });
      },
    }), admin({
      roles: {
        user: userAc,
        admin: defaultAc.newRole({
          user: ['get', 'list', 'set-password', 'set-role', 'ban'],
          session: ['list', 'revoke'],
        }),
      },
    })],
    session: { expiresIn: 7 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
    rateLimit: { enabled: true, storage: 'database' },
  });
}

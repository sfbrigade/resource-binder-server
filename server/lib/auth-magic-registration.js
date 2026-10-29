import { createHash } from 'node:crypto';
import { getCurrentAdapter, runWithTransaction } from '@better-auth/core/context';
import { APIError, createAuthEndpoint, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { magicLink } from 'better-auth/plugins';
import User from '#models/user.js';

const hashToken = token => createHash('sha256').update(token).digest('base64url');

export function magicRegistrationProfile (user, source, ctx) {
  if (source.method !== 'magic-link') return user;
  return { ...user, ...ctx.context.magicRegistration };
}

// Extend the native plugin's admission rules and token metadata. Better Auth
// still generates, expires and consumes tokens and creates users and sessions.
export function registrationMagicLink ({ sendMagicLink }) {
  async function admit (registration, ctx) {
    if (!registration.inviteId && process.env.VITE_FEATURE_REGISTRATION !== 'true') {
      throw new APIError('FORBIDDEN', { code: 'REGISTRATION_CLOSED', message: 'A valid invitation is required.' });
    }
    if (!registration.inviteId) return;
    const adapter = await getCurrentAdapter(ctx.context.adapter);
    const invite = await adapter.findOne({ model: 'invite', where: inviteWhere(registration) });
    if (!invite) throw invalidInvite();
  }

  function inviteWhere ({ inviteId, email }) {
    return [
      { field: 'id', value: inviteId },
      { field: 'email', value: email },
      { field: 'acceptedAt', value: null },
      { field: 'revokedAt', value: null },
    ];
  }

  function invalidInvite () {
    return new APIError('BAD_REQUEST', { code: 'INVALID_INVITATION', message: 'Invitation is invalid or no longer available.' });
  }

  const plugin = magicLink({
    // New accounts are admitted only with validated registration data stored
    // alongside their token; a plain login request cannot create an account.
    disableSignUp: false,
    storeToken: { type: 'custom-hasher', hash: hashToken },
    sendMagicLink,
  });
  plugin.hooks = {
    before: [{
      matcher: ctx => ctx.path === '/sign-in/magic-link' && ctx.body?.metadata?.registration !== undefined,
      handler: createAuthMiddleware(async (ctx) => {
        if (process.env.SMTP_ENABLED !== 'true') {
          throw new APIError('SERVICE_UNAVAILABLE', { message: 'Email delivery is unavailable.' });
        }
        const result = User.RegisterSchema.safeParse({ ...ctx.body.metadata.registration, email: ctx.body.email });
        if (!result.success) throw new APIError('BAD_REQUEST', { message: result.error.issues[0].message });
        const registration = { ...result.data, email: result.data.email.toLowerCase() };
        await admit(registration, ctx);
        return {
          context: {
            body: { ...ctx.body, email: registration.email, name: `${registration.firstName} ${registration.lastName}` },
            context: { magicRegistration: registration },
          }
        };
      }),
    }],
  };
  plugin.init = () => ({
    options: {
      databaseHooks: {
        verification: {
          create: {
            before (data, ctx) {
              if (ctx?.path !== '/sign-in/magic-link' || !ctx.context.magicRegistration) return;
              return { data: { value: JSON.stringify({ ...JSON.parse(data.value), registration: ctx.context.magicRegistration }) } };
            }
          }
        },
        user: {
          create: {
            before (user, ctx) {
              if (ctx?.path !== '/magic-link/verify') return;
              const { firstName, lastName } = ctx.context.magicRegistration;
              ctx.context.magicRegistrationCreated = true;
              return { data: { firstName, lastName, name: `${firstName} ${lastName}` } };
            }
          }
        },
      }
    }
  });

  const verify = plugin.endpoints.magicLinkVerify;
  plugin.endpoints.magicLinkVerify = createAuthEndpoint(verify.path, verify.options, async (ctx) => {
    let outcome;
    try {
      // Commit account creation, session creation and invitation acceptance
      // together. A revoked or concurrently claimed invite rolls all three back.
      outcome = await runWithTransaction(ctx.context.adapter, async () => {
        const stored = await ctx.context.internalAdapter.findVerificationValue(hashToken(ctx.query.token));
        const registration = stored && stored.expiresAt > new Date() ? JSON.parse(stored.value).registration : null;
        if (registration) {
          const result = User.RegisterSchema.safeParse(registration);
          if (!result.success || result.data.email !== JSON.parse(stored.value).email) throw invalidInvite();
          ctx.context.magicRegistration = result.data;
          await admit(result.data, ctx);
        }
        let result;
        try {
          result = await verify({ ...ctx, asResponse: false, returnHeaders: true });
        } catch (error) {
          // Native login failures still consume their token. Commit those
          // outcomes (including browser redirects) before returning the error.
          // Failed new-account provisioning must roll back the account as well.
          if (!isAPIError(error) || (ctx.context.magicRegistrationCreated && !ctx.context.newSession)) throw error;
          result = { error };
        }
        if (registration?.inviteId && ctx.context.magicRegistrationCreated) {
          const adapter = await getCurrentAdapter(ctx.context.adapter);
          const invite = await adapter.update({
            model: 'invite',
            where: inviteWhere(registration),
            update: { acceptedAt: new Date(), acceptedById: ctx.context.newSession.user.id },
          });
          if (!invite) throw invalidInvite();
        }
        return result;
      });
    } catch (error) {
      ctx.context.newSession = null;
      throw error;
    }
    if (outcome.error) throw outcome.error;
    outcome.headers.forEach((value, key) => ctx.responseHeaders.append(key, value));
    return ctx.json(outcome.response);
  });
  return plugin;
}

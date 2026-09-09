# Authentication for native apps

The API uses Better Auth 1.7.3 with Prisma/PostgreSQL and the Magic Link, Bearer,
and Admin plugins. Swift and Kotlin clients call HTTPS endpoints directly; they
do not need a JavaScript SDK. Authentication endpoints live under `/api/auth`.

## Server configuration

- `BASE_URL`: public API origin; HTTPS in production.
- `BETTER_AUTH_SECRET`: a private random secret of at least 32 characters. Never
  ship this value in a mobile app. Changing it invalidates signed auth material.
- `AUTH_LINK_BASE_URL`: optional public origin for app links; defaults to
  `BASE_URL`. The origin must serve the landing routes and association files.
- `VITE_FEATURE_REGISTRATION`: existing registration switch. When not `true`,
  public signup requires an invitation.
- Existing `SMTP_*`/SES settings deliver mail; Mailcatcher captures local mail.

Only configured origins are trusted. Native HTTP clients can omit `Origin`;
browser clients must use a trusted origin. The server overwrites its private
client-IP header with Fastify's connection address for rate limiting. If deployed
behind a proxy, configure Fastify's trusted proxy addresses explicitly rather
than trusting arbitrary forwarded headers.

## Password signup and verification

`POST /api/auth/sign-up/email` accepts:

```json
{
  "firstName": "Sam",
  "lastName": "Example",
  "email": "sam@example.com",
  "password": "A-long-password123!",
  "inviteId": "optional-invitation-uuid"
}
```

The server derives `name`. Passwords require at least eight characters including
uppercase, lowercase, a number, and a special character; the maximum is 128.
Invitations must be unused, unrevoked, and match the email case-insensitively.
Account creation and invitation acceptance commit together.

Signup returns Better Auth's `{user, token: null}` response. It is not a signed-in
session, and duplicate signup can return an opaque success without creating a
second account. Display a check-email screen. Signup cannot set roles or verified
status. A verification email opens `/auth/verify-email?token=...`; the app calls
`GET /api/auth/verify-email?token=...` without a callback URL, then shows sign-in.
Verification expires after one hour and does not automatically sign in.

`POST /api/auth/send-verification-email` with `{email}` requests a replacement.
If sending a signup email fails after commit, the account remains unverified and
the invitation remains associated with that account. Request another verification
email; do not attempt to recreate the account. No database transaction waits on
verification-email delivery.

## Password and magic-link sign-in

Password sign-in uses `POST /api/auth/sign-in/email` with `{email, password}`.
The response includes `{token, user}` and a `set-auth-token` header.

Magic-link sign-in:

1. `POST /api/auth/sign-in/magic-link` with `{email}`.
2. Display the same check-email message for every successful `{status: true}`
   response. Unknown, unverified, or inactive accounts receive no sign-in email.
3. The emailed HTTPS URL is `/auth/magic-link?token=...`. The operating system
   opens the installed app with this URL.
4. Extract `token`, then call `GET /api/auth/magic-link/verify?token=...` against
   the API. Omit `callbackURL`, `newUserCallbackURL`, and `errorCallbackURL`.
5. A successful response is HTTP 200 JSON containing `token`, `user`, and
   `session`. Store the `set-auth-token` response header as the bearer credential.

Tokens expire after five minutes, are stored hashed, and can create only one
session, including concurrent exchanges. Magic links never create accounts or
verify pending accounts. A normal browser visit to the emailed landing URL
shows instructions without consuming the token. Opening the link on another
device signs in the app that exchanges it; there is no cross-device handoff.

Disable automatic redirects on token-exchange calls. Better Auth can report an
invalid/expired/reused magic token through a redirect with `error=INVALID_TOKEN`.
Treat any non-200 response or unexpected HTML as a failure, not authentication.
Offer another link. For HTTP 429, honor `Retry-After`; do not automatically retry
one-time token exchanges. A network failure after exchange may require a new link.

## Sessions

Send `Authorization: Bearer <set-auth-token value>` on API requests. Keep this
credential in iOS Keychain or Android Keystore-backed secure storage; never put it
in URLs, analytics, application logs, or plain preferences.

- `GET /api/auth/get-session` returns `{session, user}`, or `null` if signed out.
- Sessions last seven days, with renewal eligible after one day. Call get-session
  when restoring the app; retain any replacement `set-auth-token` header.
- `POST /api/auth/sign-out` revokes the current session. Clear local credentials
  after successful logout. There is no separate refresh-token contract.
- `/api/users/me` returns the application profile, or HTTP 204 if unavailable.
- Protected application routes return 401 without a valid session and 403 when
  the caller lacks access. A revoked/expired session requires sign-in again.

## Password reset and account changes

- `POST /api/auth/request-password-reset` with `{email}` sends a link to
  `/auth/reset-password?token=...`. It expires after 30 minutes. The app collects
  a new password and submits `{token, newPassword}` to `POST /api/auth/reset-password`.
- `POST /api/auth/change-password` accepts `{currentPassword, newPassword,
  revokeOtherSessions: true}` with authentication.
- `POST /api/auth/change-email` accepts `{newEmail}` with authentication. The
  existing email stays in place until the new address is verified.
- Password resets and admin credential changes revoke existing sessions.
- Application profile updates use `PATCH /api/users/:id` for names/photos only.

## Administration

Only Better Auth's `admin` role can perform administrative actions:

| Action | POST endpoint | Body |
| --- | --- | --- |
| Set password | `/api/auth/admin/set-user-password` | `{userId, newPassword}` |
| Change email | `/api/auth/admin/update-user` | `{userId, data: {email}}` |
| Set role | `/api/auth/admin/set-role` | `{userId, role: "admin" or "user"}` |
| Deactivate/reactivate | `/api/auth/admin/ban-user`, `/api/auth/admin/unban-user` | `{userId}` |
| Revoke sessions | `/api/auth/admin/revoke-user-sessions` | `{userId}` |

An admin email change takes effect immediately, sets `emailVerified=false`, revokes
sessions, and sends verification. Supplying `emailVerified=true` is rejected.
Impersonation, account deletion, and HTTP admin account creation are not permitted.
The first-admin command uses Better Auth's server API and requires email verification.

## Mobile/domain setup (separate work)

Associate `/auth/*` URLs with both apps. Host Apple's
`/.well-known/apple-app-site-association` using the real team/bundle IDs, and
Android's `/.well-known/assetlinks.json` using the real package name and signing
certificate fingerprints. Configure the corresponding native entitlements and
intent filters. These identifiers and association files are not invented here.
If a separate link origin is used, deploy the landing routes on that origin too.

Until domain association and native handlers are deployed, emails open the
instruction page; they cannot complete sign-in on their own. Test a real device
opening each kind of email link before a production release.

## Rollout and review stages

1. Additive schema/configuration and an isolated HTTP integration harness.
2. Password registration, invitation rules, verification, and reset.
3. Better Auth admin operations and session revocation.
4. Magic links, bearer sessions, landing routes, and this mobile contract.
5. Mount Better Auth in the app and remove legacy credentials/routes.

Preparation stages leave the old application login active. The final stage is a
breaking auth release: update native consumers and apply migrations before using
the new server. The old React auth client is not migrated. Existing development
passwords and sessions are not imported. Database resets are never run on startup.

# Authentication reference

The application uses [Better Auth](https://better-auth.com/) under `/api/auth`, with
the Magic Link, Bearer, and Admin plugins. Refer to Better Auth's documentation for
standard APIs and the [README](../README.md#authentication-setup) for required configuration.

## Login and registration

The web login page offers email-link login and password login. Both return to the
originally requested application page. Registration and invitation acceptance offer
email-link signup (the default) or password signup. Both require first and last names.

Password signup stays signed out until email verification, and the login form offers
verification resends. Email-link signup creates the verified account and signs the
user in when they confirm the link.

Passwordless accounts have no credential account until a password is added through
the email password-reset flow. **My Account → Sign-in options → Set or reset your
password** opens that flow. Profile editing supports names and pictures; email is
read-only, and email-change endpoints are disabled.

## API and sessions

The React client uses Better Auth's native endpoints and browser session cookies.
After login, it loads `/api/users/me` for the application profile and admin permissions.

Passwordless signup uses `/api/auth/sign-in/magic-link` with `email` and
`metadata.registration: { firstName, lastName, inviteId? }`. The server validates and
stores those profile fields with the hashed, expiring verification record. Confirmation
creates a verified user and session through Better Auth, and accepts any invitation in
the same transaction. Public registration settings and invitation availability are
checked both when requesting and confirming the link.

Plain login requests without registration metadata only send mail to existing accounts
and cannot create new accounts. Registration links for existing verified accounts sign
them in without replacing their profile or credentials. For an existing unverified
account, Better Auth proves email ownership by removing its unverified password and
old sessions; the owner can add a password through email password reset.

Forward `/api/...` requests unchanged to the backend; the proxy must not add or strip
`/api`. API callers whose base URL already ends in `/api` append `/auth/...`.

## Email links and native apps

Email links open `/api/auth/links/*` instruction pages without consuming tokens.
Browsers offer a **Continue in browser** link to the web app at `BASE_URL`, where users
can verify email, reset passwords, accept invitations, or confirm magic-link login.
Verification and magic-link tokens are redeemed only after confirmation; reset tokens
are redeemed when the new password is submitted.

Native apps must handle the original links, exchange their tokens with the API, and
provide their own screens and secure session persistence. Mobile email-link handlers
must recognize `/api/auth/links/...`. The email-link domain must host iOS/Android
association files; these can be served by this backend or its hosting layer once the
app identifiers are known. Association files and mobile handlers are separate work.

Previously sent `/auth/...` links require fresh emails; no legacy landing routes
are retained.

## Password lifecycle

Reset links are single-use and expire after 30 minutes. Password changes leave other
unused reset links valid until expiry, following Better Auth's token lifecycle.
Password resets revoke sessions through the built-in option; admin password changes
also force logout through Better Auth's native session-revocation API.

## Administrator access

Create the first administrator using the [bootstrap script](../README.md#one-time-setup).
HTTP account creation remains unavailable to admins. The bootstrap CLI prompts for a
password and creates a verified administrator, so no verification email is needed.
Its version is pinned independently of the server's Better Auth version; see the
[CLI documentation](https://better-auth.com/docs/concepts/cli#create-admin).

To add subsequent administrators, an existing admin can invite a user, wait for email
verification, then open **Admin → Users → Edit Profile** and save **Administrator access**.
Role changes use `/api/auth/admin/set-role` separately from profile updates. The server
rejects promotion of unverified accounts, and role changes apply to existing sessions
immediately. Administrators cannot remove their own admin access; another administrator
must make that change.

The admin interface displays verification status and refreshes user information after
a role change. Confirmed role updates remain successful if a background profile refresh
fails, and role saves preserve unsaved profile photos.

## Migration notes

Server startup applies the checked-in migrations; it never resets the database.
The Better Auth changes are consolidated in `20260909000100_better_auth_magic_links`.
Databases that already applied the former foundation, cutover, or deactivation migrations
need their migration history reconciled before using this sequence, even if the account
tables are empty. Do not reset a database containing directory data.

The cutover removes legacy password/reset fields, and sessions are not imported.
Existing development users must verify their email and reset their password for password
login. This is not a production password migration or a reversible rollback.

# Dao Sports Method — certificate and coach Drive fixes

The package contains the earlier certificate editor fixes plus a coach-aware Drive function, a new `supabase/config.toml`, and the corrected Vercel callback rewrite. No live deployment has been performed from this session.

## Why the coach receives the outdated-function message

The old frontend turns the server error `Centre admin role required` into the message mentioning “Part 4.” The attached function already authorizes individual coaches from `centre_memberships` and does not contain that server error. This points to a different/older function still being deployed, or the frontend being configured to call another Supabase project. Replacing frontend files alone cannot change the server's authorization rules.

The new function keeps coach ownership and centre isolation. Do not change the coach into a centre admin to work around this error.

## Deploy the Drive function using the Dashboard

This route does not require a local `config.toml` or the Supabase CLI.

1. Open the Supabase project used by the deployed website. The supplied `src/main.js` has `vjhjvcvmtfpkoyjxfmxu` as its fallback project reference; existing Vite environment variables or `/app-config.js` may override it. Match the project to the actual endpoint called by the website.
2. Open **Edge Functions**, select **google-drive-oauth**, and replace its `index.ts` with `supabase/functions/google-drive-oauth/index.ts` from this package. Deploy the update under the same function name.
3. Keep JWT verification enabled for this signed-in-user endpoint. The function also verifies every user token with Supabase Auth and checks coach membership in the database.
4. Confirm these existing function secrets are set: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and `DRIVE_TOKEN_ENCRYPTION_KEY`. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by Supabase. Do not change an existing encryption key: stored refresh tokens depend on it.
5. Confirm the `coach_drive_connections` and `coach_drive_oauth_states` tables exist. If migration `20261026_000018_coach_drive_connections.sql` has not been applied, run the included unchanged migration using your normal migration process or the Supabase SQL editor. Existing earlier migrations must already be present.
6. In Google Cloud's OAuth client settings, ensure the authorized redirect URI exactly equals `GOOGLE_REDIRECT_URI`. For the supplied production site, the intended callback is `https://jom-nittaku-webapp.vercel.app/api/auth/google-drive/callback`; use your actual deployed origin if different. Enable the Google Drive API. If the OAuth consent app is in testing mode, include the coach's Google account as a test user.

Official instructions: [Supabase Dashboard editor](https://supabase.com/docs/guides/functions/quickstart-dashboard), [user-function authentication](https://supabase.com/docs/guides/functions/auth-headers), [Google OAuth callback matching](https://developers.google.com/identity/protocols/oauth2/web-server).

## Optional CLI deployment

The new configuration is included at `supabase/config.toml`. It selects the function entrypoint and keeps `verify_jwt = true`. Its `project_id` is only a local label; choose the correct remote project explicitly below. If your existing project has a config file after all, merge the `[functions.google-drive-oauth]` block into it.

From the folder containing `supabase/`, after installing the Supabase CLI:

```bash
supabase login
supabase functions deploy google-drive-oauth --project-ref YOUR_PROJECT_REF --use-api
```

Replace `YOUR_PROJECT_REF` with the reference of the project the website actually calls. `--use-api` bundles server-side so Docker is not required. This command deploys only the named function; it does not apply SQL migrations or deploy the Vercel frontend.

Official reference: [Supabase deploy command](https://supabase.com/docs/reference/cli/supabase-functions-deploy).

## Deploy the frontend

Merge these files into your existing app and redeploy it to Vercel:

- `src/legacy-app.js`
- `src/styles.css`
- `vercel.json`

The Drive callback now rewrites directly to `/index.html`, preserving the callback path/query for the SPA. Supabase sign-in codes and Google Drive codes are handled separately. The four headings use ordinary inline text boxes; full-title fitting preserves the leading T. Artwork, text, photos, badge and QR code can be dragged and resized. Prior forced artwork locks are removed once; explicit locks made in the new editor remain saved.

The package also includes the supplied unchanged `package.json`, `index.html`, `src/main.js`, `src/report-drive.js`, certificate background and layer PNGs for reference. Keep your existing runtime configuration, other public assets and lockfile. No replacement `/app-config.js`, production environment file, or guessed lockfile is supplied.

## Verify the deployment

1. Sign in as an individual coach and open **Settings → My Google Drive**.
2. Click **Connect My Google Drive**. Google should open without a centre-admin rejection.
3. Authorize that coach's chosen Google account. The callback should return to Settings, show the verified Google account, and mark it connected.
4. Create a draft and finalize a report; confirm its JSON record and PDF appear in that coach's managed Drive folder.
5. Reconnect the same Google account and confirm it reuses the original root folder.
6. In browser developer tools, new function responses include `x-dao-drive-api-version: coach-v2`. If that header is absent, check the actual Supabase project/function being called and the deployed version. Do not share authorization headers or tokens.

## Changes in this backend update

- Individual coaches authorize their own connections through verified database membership, as in the attached per-coach source.
- Invalid/expired sessions return a clear authentication error; an Auth outage returns a controlled service error.
- OAuth configuration is checked before creating pending state.
- A repeat authorization that omits a refresh token can reuse the encrypted token only for the same verified Google account. Switching accounts cannot reuse the previous account's token.
- Single-use, expiring OAuth state, encrypted token storage, and report ownership checks remain enforced.

## Validation

```bash
node tests/regressions.cjs
node tests/drive-backend.cjs
```

All 24 isolated checks passed (13 frontend/layout and 11 backend). Backend tests run the actual TypeScript handler using Node 24's built-in TypeScript stripping. Tests mock the DOM, Supabase and Google; they do not prove a live Google authorization succeeds. JavaScript/TypeScript syntax and JSON/TOML parsing also passed.

The production build remains unverified: offline dependency installation failed because the required Vite package metadata is unavailable in this environment. No lockfile was fabricated. Browser layout and live Google/Supabase behavior still need the deployment checks above.

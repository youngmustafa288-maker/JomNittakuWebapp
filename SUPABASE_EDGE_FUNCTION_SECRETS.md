# Supabase Edge Function Secrets Handoff

This file intentionally contains names and setup notes only. Do not commit secret values.

## Required Supabase Edge Function secrets

Configure these in the Supabase project before deploying the functions:

- `SUPABASE_URL`: Supabase project URL. Usually provided automatically.
- `SUPABASE_SERVICE_ROLE_KEY`: service-role key, stored only in Edge Function secrets.
- `GOOGLE_CLIENT_ID`: Google OAuth web application client ID.
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret.
- `GOOGLE_REDIRECT_URI`: callback URL for `google-drive-oauth`.
- `GOOGLE_OAUTH_AUTHORIZE_URL`: optional; defaults to Google's OAuth authorize endpoint.
- `DRIVE_TOKEN_ENCRYPTION_KEY`: 32-byte AES key encoded as base64. Generate a new key for this project and keep it in Supabase secrets only.

## Next-session Supabase MCP checklist

1. Confirm the project URL and project reference.
2. Apply migration `supabase/migrations/20260922_000013_dev_licensing_drive.sql`.
3. Deploy `supabase/functions/dev-console` and `supabase/functions/google-drive-oauth`.
4. Set the secrets above through the Supabase MCP/secret manager; never put values in browser code or this file.
5. Configure Google OAuth consent-screen Drive scopes and add `GOOGLE_REDIRECT_URI` to the authorized redirect URIs.
6. Create the dedicated Dev user, set `app_metadata.role` to `dev`, and enroll MFA. Dev function calls require the `aal2` claim.
7. Set centre-admin users' `app_metadata.role` to `centre_admin` and `app_metadata.centre_id` to their centre UUID.
8. Verify RLS for Dev, centre admin, coach, expired licence, revoked licence, and cross-centre access.
9. Add the Drive folder-creation/upload worker that consumes `drive_sync_jobs`; the callback currently stores encrypted refresh-token metadata and connection status.

## Security reminders

- Never expose `SUPABASE_SERVICE_ROLE_KEY`, Google client secret, or `DRIVE_TOKEN_ENCRYPTION_KEY` to the browser.
- Activation keys are generated once and stored only as SHA-256 hashes; show the plaintext key only at issuance time.
- Rotate the encryption key only with a planned token re-encryption migration.

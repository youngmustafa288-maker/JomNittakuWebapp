# Continue Next Session

Date: September 4, 2026
Project: JomNittaku web app
Workspace: `C:\Users\jcomp\OneDrive\Desktop\New folder`

## Completed

- Replaced the preconfigured demo account login with Supabase email/password sign-in.
- Supabase sessions persist in the browser.
- Account role resolution uses `user.app_metadata.role = "admin"`, `user.app_metadata.coach_id`, or a matching coach email.
- Shared dashboard state no longer trusts persisted auth role data.
- Coach Reports filter is now by students instead of coaches.
- Reports support month, day, week buckets, custom date ranges, and status filtering.
- Student Edit now supports name, phone number, lesson count, and profile picture.
- Coach and student profile images upload to Supabase Storage.
- Added migration for the public `profile-images` bucket and authenticated upload policies.

## Files Changed

- `src/legacy-app.js`
- `src/styles.css`
- `supabase/migrations/20260902_000002_auth_profile_storage.sql`

## Verification

- `npm run build` passes successfully.
- No stale demo-login or `readAsDataURL` references remain in `src` or `supabase`.

## Supabase MCP

The MCP server was added globally with:

```text
codex mcp add supabase --url https://mcp.supabase.com/mcp?project_ref=vjhjvcvmtfpkoyjxfmxu&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching
```

OAuth login was completed with:

```text
codex mcp login supabase
```

`codex mcp list` shows Supabase enabled with OAuth authentication. The current Codex process still returns `Auth required` during MCP handshake because it has not reloaded the new token.

## Next Session

1. Reload/restart Codex so the authenticated Supabase MCP connection is refreshed.
2. Verify the Supabase MCP tools are available.
3. Apply `supabase/migrations/20260902_000002_auth_profile_storage.sql` to project ref `vjhjvcvmtfpkoyjxfmxu`.
4. Verify the `profile-images` bucket and storage policies.
5. Verify `dashboard_state` is readable/writable only by authenticated users.
6. Test sign-in with one admin and one coach account.
7. Confirm admin `app_metadata.role` is `admin`; confirm coach `app_metadata.coach_id` or email matches a row in `public.coaches`.
8. Test coach report student/date filters and student edits/uploads against the live Supabase project.

## Centre QR Links - Priority Next Task

The centre QR code opens `/centre`, but the public page currently says `No contact info available` because centre links were previously stored in browser `localStorage` and inside the private `dashboard_state` payload. A new public-safe migration and frontend path are prepared but not yet applied or pushed.

Pending implementation files:

- `supabase/migrations/20260904_000005_public_centre_links.sql`
- `src/legacy-app.js`

Next-session steps:

1. Restart/reload Codex so the newly authenticated Supabase MCP session is available.
2. Verify Supabase MCP database tools can access project `vjhjvcvmtfpkoyjxfmxu`.
3. Apply `supabase/migrations/20260904_000005_public_centre_links.sql` to the project.
4. Verify table `public.centre_links` exists with RLS enabled and policies allowing public SELECT but authenticated INSERT/UPDATE only.
5. Verify the existing centre links were copied into `centre_links` by logging into the dashboard or manually checking the row with `id = 'centre'`.
6. Test `/centre` in a private/incognito browser session and scan the generated QR code from a report.
7. Run `npm run build` and then commit/push the pending frontend and migration files to `origin/main` for Vercel deployment.

## Current Git Status

- Branch: `main`, currently aligned with `origin/main` at commit `c918fa4`.
- Pending uncommitted changes: `src/legacy-app.js` and `supabase/migrations/20260904_000005_public_centre_links.sql`.
- These centre-link changes have not been pushed yet.
- The last completed build before this handoff passed with `npm run build`.

## Important Notes

- Do not expose or commit service-role credentials.
- The frontend uses the publishable key from `app-config.js`.
- Profile image URLs are stored in the dashboard payload fields `coach.photo`, `coach.photo_url`, `student.photo`, and related normalized aliases.
- Existing unrelated untracked files were not modified or removed: `.tmp-frontend-inline.js`, `Image 1.jpg`, `SESSION_SUMMARY.md`, and `app-config.js`.

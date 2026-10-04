# Overview, Certificate, and Google Drive Fixes

## Goal

Improve report discovery and visible dashboard polish, remove the dev-only profile entry, fix opaque certificate artwork layers, and make completed reports sync to the connected Google Drive folder instead of existing only in Supabase.

## Scope

- Add overview report filters for all dates, month, week, and custom date range. Remove the dynamic `October 2026` label from the dashboard header/sidebar.
- Fix certificate artwork layers rendering as white blocks by making image-layer text surfaces transparent unless they are actively being edited.
- Fix the overview `View all` control stacking/overlay appearance and preserve keyboard navigation.
- Hide the profile action for `dev` users while retaining logout.
- Extend the Drive Edge Function with an authenticated report-sync action that uploads a generated report export to the connected root folder and records a sync job/result. Trigger it after report finalization/export data is available and show sync status without changing Supabase as the app source of truth.

## Implementation Plan

1. Update `src/legacy-app.js` state/rendering:
   - Add overview filter state and controls for month/week/custom ranges.
   - Reuse date-bucket matching helpers for overview rows and stats where appropriate.
   - Remove `MONTH_LABEL` from visible dashboard branding copy.
   - Render the dev topbar with logout only.
   - Trigger Drive sync after a finalized report and expose clear failure handling.
2. Update `src/styles.css`:
   - Make certificate art text backgrounds transparent by default and only opaque while editing text.
   - Isolate the overview table link styling/stacking so no overlay covers it.
   - Add responsive styling for overview filters.
3. Update `supabase/functions/google-drive-oauth/index.ts`:
   - Add a `sync-report` action authorized for centre admins.
   - Decrypt the stored refresh token, obtain an access token, upload a PDF/PNG payload to the saved root folder, and update `drive_sync_jobs` / `drive_connections` status with checked errors.
   - Keep refresh tokens and service credentials server-side.
4. Update `architecture.md` to document that report sync is a secondary Drive backup while Supabase/dashboard state remains canonical.

## Validation

- `npm run build`
- `git diff --check`
- Manual browser verification of overview filters, certificate preview, dev topbar, and Drive sync/error states when credentials are configured.

## Assumptions

- “Remove October 2026” means remove the current-month label from dashboard chrome, not delete report data.
- Drive sync should back up finalized reports; Supabase remains the canonical store.
- The browser will generate an export data URL and send it to the Edge Function; the Edge Function performs the Drive upload.

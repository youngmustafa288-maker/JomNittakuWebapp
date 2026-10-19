# Pending Report Text Editor Fix

## Current Status

The editor behavior was reproduced on the deployed app at `https://jom-nittaku-webapp.vercel.app/` using an authenticated coach session. Double-clicking an artwork label opens a focused `contenteditable` element, and typing updates the visible text. Ending the edit sends a `PATCH` to `coaches`, but the request returns HTTP 406 and the text does not persist.

The browser test used a temporary replacement for `brand-name` and then restored the displayed text to `Dao Sports Method`. The failed PATCH did not persist either value. Do not include login credentials in follow-up notes or commits.

## Root Cause

Migration `20260923_000014_centre_login_isolation.sql` removes the earlier `coaches_self_update` policy and permits coach-row updates only for centre admins. A coach can still read their own row, but cannot save their report layout through the current `saveCoachRecord` path.

## Completed

- Edit mode receives focus and accepts keystrokes.
- Font-family, weight, and style are applied to the four editable artwork labels.
- `npm run build` passes.
- A pending RLS migration is present at `supabase/migrations/20261019_000015_coach_self_profile_updates.sql`. It restores self-only updates and limits authenticated column updates to the profile/layout fields used by the app.
- Workspace `.mcp.json` points to the project's Supabase MCP endpoint, scoped to project `vjhjvcvmtfpkoyjxfmxu`.
- Supabase MCP OAuth was reconnected and the migration was applied to the hosted project as `20261019151851_coach_self_profile_updates`.
- A follow-up migration, `20261019_000016_restrict_coach_self_profile_updates.sql`, removes the unintended `role` grant from authenticated self-updates.
- Hosted verification confirms `coaches_self_update` requires `auth.uid() = id` and authenticated UPDATE grants are limited to the intended profile/layout columns.

## Remaining Work

1. Retest the deployed Certificate Design editor with an authenticated coach session: edit each of the four labels, blur/save, reload, and confirm the text remains. Check the PATCH response succeeds.
2. Review the visual typography against the artwork. Display mode uses raster image layers, so the current CSS font fallbacks may not exactly reproduce each bitmap's original typeface; choose or derive matching fonts if exact visual fidelity is required.
3. Run `npm run build` after any additional code changes.

## Validation Notes

- Deployed site sign-in and navigation to Certificate Design succeeded.
- Browser computed styles in edit mode were observed as Georgia/700/normal for the brand name, Arial/300/normal for the subtitle, Georgia/400/italic for the tagline, and Cinzel Decorative/700/normal for the report title.
- Typing changed the live editor text; persistence failed at the RLS-protected PATCH.
- The Supabase CLI was unavailable; hosted migration application and verification were completed through Supabase MCP.
- The hosted migrations are now applied and verified through Supabase MCP. Deployed editor retest remains blocked by the absence of an authenticated browser session in this workspace.

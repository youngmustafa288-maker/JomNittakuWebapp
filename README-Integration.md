# Certificate Design Update

Extract this ZIP into the root of the original project and overwrite matching files. Keep the existing app configuration, public logos, environment values, migrations and other Edge Functions.

Certificate Design includes Classic, Performance and Heritage templates, saved designs, background/image uploads, and the requested Text/Uploads editor controls. Navigation, the header and other pages retain their original UI.

Selection boxes remain in the editor. Template previews, generated reports and exports exclude editor highlights and handles.

## Report template selection

The final wizard step now includes a **Template** picker with report previews. It lists the three templates and the selected coach’s saved designs. The current design is selected by default. The choice survives step changes, closing and resuming a draft.

Finalizing saves `certificateDesign: { templateId, name, layout }` with the canonical Google Drive report. The same snapshot renders the report and its PNG/PDF exports. Later edits in Certificate Design do not change that report. Older reports without a snapshot use the coach’s current layout.

## Required backend update

Deploy the included `supabase/functions/google-drive-oauth/index.ts` together with `supabase/functions/_shared/certificate-design.js` **before deploying the frontend**. The Edge Function accepts and validates the optional design snapshot and exposes the authenticated `report-template-capabilities` action. Existing centre and coach ownership checks remain intact. No database migration is needed.

An older report service rejects the capability check before any new report is written, avoiding a save that silently drops the selected template. This backend update is supplied as source; it has not been deployed to your Supabase environment.

Production snapshots reference uploaded image URLs. Layout collections and unused uploads are excluded; a snapshot is limited to 384 KiB. Existing report JSON remains limited to 512 KiB.

## Commands

- `npm install`
- `npm run dev` — authenticated app
- `npm run dev:studio` — isolated preview at `/preview.html`
- `npm run build` — authenticated app
- `npm run build:studio` — preview
- `node --test tests/*.test.mjs` — 19 layout, selection, rendering and persistence regressions

The preview uses sample records and local browser design storage. Report generation in the preview stays in memory and never connects to real accounts.

Validated: application build, preview build, 19 regressions, actual DOM wizard selection/resume/generation, and the exact requested editor controls. Browser visual QA was unavailable in this environment. Verify live authenticated Supabase uploads and Google Drive/PDF exports in staging after deploying the function.

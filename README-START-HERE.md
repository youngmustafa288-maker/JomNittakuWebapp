# DAO Sports Method — Complete update bundle (Parts 1–7)

**This ZIP is a cumulative replacement-file overlay, NOT a standalone full repository.**
It includes the latest version of every file changed by Parts 1–7, so you do
**not** need to apply the older part ZIPs in order. Place it over your EXISTING
Vite project, preserving all other files and your existing Git repository.

## Included changes

- Certificate headings: default and edited wording now use the **same** font
  per heading (Outfit ExtraBold, Montserrat, Lato Italic, Cinzel Decorative Bold).
  Selecting a heading or editing its words no longer switches from PNG artwork
  to a different font. Fonts are loaded in `styles.css`; long titles may fit
  horizontally inside the original fixed regions. The source PNGs are included
  as rollback assets but aren't used for the four editable headings by default.
- **Accuracy:** these are close matches, NOT verified exact original font files.
  An edited heading is visually consistent with the displayed default wording,
  but both may differ from the original decorative PNG image.
- Certificate printed sections/table, divider lines, labels and contact frame
  are fixed against accidental dragging/resizing; dynamic report values remain
  editable. TTAM logo and QR code preserve the coach's currently saved size and
  position and cannot be accidentally resized or moved.
- Coach-owned Google Drive connections: every coach connects their own Google
  Drive. Authorized centre admins can access reports as permitted by the
  Edge Function. Report JSON/PDF writes are directed to the owning coach's
  Drive. Requires the migration and Edge Function deployment below.

## Files provided

```
src/legacy-app.js
src/report-drive.js
src/styles.css
public/certificate-layers/brand-name.png
public/certificate-layers/brand-subtitle.png
public/certificate-layers/brand-tagline.png
public/certificate-layers/report-title-art.png
public/certificate-layers/certification-badge.png
supabase/functions/google-drive-oauth/index.ts
supabase/migrations/20261026_000018_coach_drive_connections.sql
architecture.md
```

## Install in VS Code (PowerShell)

1. Back up your existing project and any historical centre-owned Google Drive
   reports. Extract this ZIP over the root of your existing repository. **Merge
   folders and replace matching files; do not delete other project files.**
   Never overwrite or commit private environment secrets.
2. Run `npm run build` (or `pnpm build`, depending on your project). Verify
   the build succeeds before pushing to GitHub.
3. Stage ONLY the relevant files (avoid `git add .` if unrelated/deleted files
   appear in your `git status`):

```powershell
git add -- src/legacy-app.js src/report-drive.js src/styles.css architecture.md public/certificate-layers/brand-name.png public/certificate-layers/brand-subtitle.png public/certificate-layers/brand-tagline.png public/certificate-layers/report-title-art.png public/certificate-layers/certification-badge.png supabase/functions/google-drive-oauth/index.ts supabase/migrations/20261026_000018_coach_drive_connections.sql
git commit -m "Combine coach Drive and certificate editor updates"
git push origin main
```

If there are no changed files, the commit command may say "nothing to
commit"; this is fine. If `git push` is rejected because remote has new work,
DO NOT use `--force`. Stash any unrelated uncommitted work, then `git pull
--rebase origin main`, resolve conflicts if any, push, and restore the stash.

## Supabase (critical separate step)

You stated the SQL migration
`supabase/migrations/20261026_000018_coach_drive_connections.sql` **has
already been applied**. It is included for source control/history ONLY —
**do not run it again**. No later migration is required by Parts 4–7.

GitHub/Vercel deploys the Vite frontend, **not** Supabase Edge Functions.
After copying the files, deploy the updated function to the **same Supabase
project** configured for the live Vercel app:

```powershell
supabase login
supabase link --project-ref YOUR_SUPABASE_PROJECT_REF
supabase functions deploy google-drive-oauth
```

Replace the project reference with the one in your Supabase Dashboard. If
`supabase` is not installed but Node.js is available, try `npx supabase`
instead. Keep existing Edge Function secrets configured. Never put secret
values inside these files or commit them to GitHub.

The "Centre admin role required" or "deployed function is outdated" popup is
strong evidence that the *running* Edge Function is still older than the Vite
frontend or that the wrong Supabase project was targeted. Updating frontend
files alone will not fix this.

## Verify after deployment

- Sign in as two different coach accounts. Each should be able to connect
  their **own** Google Drive account; one coach must not see the other's
  private connection token, records or writes.
- Create a draft, finalize a report, and check PDF export to each coach's
  Drive. Check admin/centre-admin views as intended.
- In Certificate Design, select, edit, reset, and export all four headings.
  The font must stay consistent. Check text is not clipped, and the table,
  TTAM badge, and QR have kept their intended positions and sizes.
- Do not remove older centre-owned Drive records; this bundle does **not**
  automatically migrate them to individual coaches' Drives.

## Validation and limits

The bundle is assembled from Parts 3, 5, and 7: latest heading code/CSS from
Part 7, previous cumulative Drive/helper/assets from Parts 3 and 5. ZIP
integrity and JavaScript syntax have been checked. The full Vite app, Google
OAuth round-trip, certificate screenshot and PDF export cannot be verified from
this replacement-only bundle; test them in your existing project.

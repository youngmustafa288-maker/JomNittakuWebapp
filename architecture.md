# Dao Sports Method Dashboard Architecture

This document describes the current implementation. Treat it as a handoff document for future coding sessions and update it when a structural change is made.

## Project Shape

This is a Vite single-page application using native browser JavaScript and the DOM. It is not a React application and it does not use a client-side router.

The main architectural constraint is that most application behavior currently lives in one module: `src/legacy-app.js`. Keep the existing vanilla DOM architecture unless a task explicitly requests a migration.

## Runtime Entry Point

1. `index.html` loads `/app-config.js` and `/src/main.js`.
2. `app-config.js` defines `window.__APP_CONFIG__` with the Supabase URL and publishable key.
3. `src/main.js` imports the stylesheet, shows the loading state, and calls `initApp()` from `src/legacy-app.js`.
4. `initApp()` creates the Supabase client when configuration is available, creates the initial state, and starts the async bootstrap process.
5. `render()` replaces the contents of `#app` with the current screen.

Runtime configuration precedence:

- `VITE_SUPABASE_URL` overrides `window.__APP_CONFIG__.supabaseUrl`.
- `VITE_SUPABASE_PUBLISHABLE_KEY` overrides `window.__APP_CONFIG__.supabaseKey`.
- Only publishable Supabase credentials may be used in browser code.

## Frontend Structure

### `src/main.js`

Small bootstrap entry point. It imports CSS and initializes the application.

### `src/legacy-app.js`

The application controller and view layer. It currently contains:

- Supabase client initialization
- auth/session restoration
- role resolution
- application state and normalization helpers
- route detection
- page rendering
- event delegation and action handling
- dashboard, coach, student, and report workflows
- certificate layout editing
- image uploads
- QR generation
- PNG/PDF export
- Supabase reads/writes and realtime subscriptions

The app uses declarative attributes in generated HTML:

- `data-action` for commands handled by `handleAction()`
- `data-nav` for page navigation handled by `navigate()`
- `data-overlay-id` for certificate layer selection/editing

There is one delegated click handler on `#app`, plus targeted handlers for forms, filters, uploads, and certificate drag/edit interactions.

### `src/styles.css`

Global CSS variables, layout, responsive behavior, dashboard styling, report/certificate styling, and modal styling.

### `public/`

Static assets served unchanged by Vite. This includes logos, certificate templates, and certificate layer artwork. Preserve existing asset paths and report template dimensions unless the task explicitly changes the report format.

## Routes

Vercel rewrites application routes to `index.html` (`vercel.json`), then `legacy-app.js` interprets `window.location.pathname`:

- `/` - login or authenticated dashboard
- `/centre` - public centre entry page
- `/centre/:slug` - centre-specific login page; after a matching centre account signs in, the same route renders that centre's dashboard
- `/coach/:slug` - public coach profile
- `/auth/callback` - OAuth callback processing, including the centre slug carried through centre Google SSO and Google Drive OAuth
- `/api/auth/google-drive/callback` - Google Drive's configured callback URL; Vercel serves `/index.html` directly for this path so the SPA can process the preserved callback URL and return to `/centre/:slug`

There is no route table or router package. Route behavior is implemented inside the bootstrap and render logic.

## Application State

The main in-memory `state` object contains:

- `auth`: role, user ID, coach ID, centre ID, and email
- `ui`: current page, selected report, menu state, and notices
- `coaches`
- `students`
- `reports` and `reportDrafts` (Drive records merged with an account-scoped IndexedDB cache and pending local drafts)
- `centreProfile`
- `devCentres` and dev-console filters/detail state
- admin, dev-console, and Drive connection data

State is normalized when loaded through helpers such as `normalizeState`, `normalizeCoach`, `normalizeStudent`, and `normalizeReport`. These helpers also bridge older snake_case database fields and current camelCase frontend fields.

Most state changes follow this pattern:

```text
user interaction
  -> delegated event handler
  -> handleAction() or a workflow function
  -> mutate state
  -> render()
  -> debounced persistence when required
```

`render()` replaces the application subtree. Code that adds a new input or modal must account for this and preserve active form values where necessary.

## Authentication and Roles

Supabase Auth provides email/password and Google OAuth. Sessions are persisted, refreshed, and restored during bootstrap. Centre login pages expose both methods; Google callback context preserves the centre slug. The dedicated Drive callback path and state-bearing `/auth/callback` URLs are identified before creating the Supabase client. Supabase URL-session detection is disabled only for Drive callbacks, so Google Drive authorization codes are exchanged by `google-drive-oauth` and Google sign-in codes remain with Supabase. Callback parameters are removed after processing. Coach Drive failures are visible in Settings, including callback denial and backend role errors.

The frontend resolves these roles:

- `dev` - internal licensing and support console
- `admin` - legacy/global dashboard administration
- `centre_admin` - centre management and report access across coaches with connected Drives
- `coach` - coach profile, students, report creation, certificate editing, and personal Google Drive authorization

Role resolution uses Supabase user metadata plus `centre_memberships`. A `/centre/:slug` route only renders a dashboard for a `centre_admin` or `coach` whose membership matches that centre; other sessions, including dev sessions, see the centre login page. The frontend uses roles to decide which UI is shown, but database Row Level Security is the actual authorization boundary.

If a signed-in user is not assigned a supported role, the app signs them out and displays an error.

## Persistence Boundaries

### Relational Supabase tables

The migrations define and evolve these main areas:

- `coaches`
- `students`
- `reports`
- `dashboard_state`
- `centre_links`
- `centres`
- `centre_memberships`
- `centre_licences`
- `activation_keys`
- `drive_connections` (legacy centre-level configuration, retained for compatibility)
- `drive_sync_jobs` (legacy centre sync jobs)
- `coach_drive_connections` (per-coach Google Drive connection metadata and encrypted refresh token)
- `coach_drive_oauth_states` (one-time, expiring OAuth state bound to coach and centre)
- `audit_logs`

`centres.logo_url` stores the public centre branding asset URL and `centres.activated_at` records the first successful activation. `activation_keys` stores both the redemption hash and the generated code needed by the privileged dev console; the code is only returned through the service-role-backed dev function.

### `dashboard_state` JSON

The current dashboard also persists a large JSON payload in `dashboard_state`.

- Global data uses the ID `dashboard`.
- Centre accounts use `centre:<centre-id>`.
- Auth values are stripped before writing.
- Reports, drafts, report-view identifiers, and transient Drive connection state are stripped before writing and are never hydrated from this payload.
- Browser-specific auth and UI values are carried over when realtime payloads are applied.
- Writes are debounced by approximately 250 ms.

Supabase Realtime listens for changes to `dashboard_state`, `coaches`, `students`, and `centre_links`, then refreshes state and rerenders the UI.

### Browser storage

Centre links can fall back to `localStorage` under the key `centre_profile` when Supabase is unavailable. The hybrid report layer stores recent normalized reports and pending drafts in IndexedDB. It never stores reports in localStorage or Supabase dashboard_state. Local copies are separated by Supabase project, user, role and centre; unsynced drafts survive closing the tab and signing out for recovery by the same account.

### Coach-owned Google Drive report records

Every coach independently authorizes a Google Drive account from Settings → My Google Drive. Centre admins do not need to connect an account. Each coach's Google account contains a managed root folder for that coach, with canonical versioned JSON report records under `Reports/Records` and finalized PDF derivatives under `Reports/Exports`. Stable opaque IDs are used for filenames and Drive `appProperties`, and personal names/summaries are never written into Drive metadata. The JSON record is canonical, and PDF upload may be retried independently.

The browser loads reports into memory after centre authentication and Drive status refresh. Coaches see only reports from their own Drive. Centre admins' reports view aggregates records from connected coaches in that centre using the authenticated `google-drive-oauth` Edge Function. Global admins can select a centre with connected coaches and obtain its eligible coach/student context. Each report read/save is restricted by centre membership, coach ownership, and student ownership. An unavailable coach Drive results in an explicit warning when other coach Drives are readable.

A coach can connect, disconnect, or reconnect. Reconnecting the same verified Google account reuses its existing managed root folder where possible; switching Google accounts creates a new root folder and does not migrate prior records. OAuth state is single-use, bound to the initiating user/centre, and expires after 10 minutes. `coach_drive_connections` is accessible only via the service-role Edge Function, and its refresh tokens are never returned to the browser.

Supabase still owns authentication, memberships, profiles, licensing, student `lessons` aggregate, encrypted Drive connection metadata, and control-plane data. Supabase `dashboard_state` excludes report arrays and transient Drive connection state. Draft edits commit to the local outbox before Drive sync. Failed uploads retain pending local edits and retry while the authenticated app is open; generated reports still require a successful canonical Drive save. Report content never falls back to Supabase. The old `drive_connections` and `drive_sync_jobs` remain for compatibility, but new coach reports use `coach_drive_connections`. **This upgrade does not migrate previously saved centre-owned Drive records.** Any existing centre Drive reports require a separately approved migration strategy.

## Supabase Storage

The `profile-images` bucket stores coach, student, certificate, and centre-logo images.

The browser validates image type and size, uploads through the publishable client, and stores the resulting public URL on the corresponding profile, student, certificate, or centre record.

## Supabase Edge Functions

`supabase/config.toml` now declares the `google-drive-oauth` entrypoint and keeps platform JWT verification enabled. Its handler additionally verifies each Bearer user token with `admin.auth.getUser()` before database actions. Frontend/Vercel deployments do not deploy Supabase functions; update the named function in the same Supabase project the frontend is configured to call. Every response from this version includes `x-dao-drive-api-version: coach-v4-hybrid-drafts` to identify the deployed API. Dashboard-based deployments do not need a local config file.

### `supabase/functions/dev-console`

Privileged internal operations, including:

- listing centres
- creating centres and their initial accounts
- issuing activation keys and licences, including the generated code and redemption status for dev-only inspection
- changing centre membership roles
- renewing centre licences
- updating centre logo URLs

It validates a dev-role token and uses the service-role key only inside the Edge Function.

### `supabase/functions/google-drive-oauth`

Per-coach Google Drive operations, including:

- verifying centre membership for centre admins/coaches and trusted metadata for global admins
- generating coach-bound, one-time OAuth state and exchanging callbacks for the originating coach account
- requesting Drive file and Google identity/email OAuth scopes
- reusing the managed coach root folder when reconnecting the same verified account, or creating a new folder for a different account
- retaining an existing encrypted refresh token on repeat authorization only when Google verifies the same account and does not return a replacement token
- AES-GCM encryption of refresh tokens in service-role-only `coach_drive_connections`
- coach self-service connection status and disconnect, and centre-admin view of connected coach IDs
- aggregating coach-scoped Drive JSON reports for their centre and trusted global admins
- saving canonical JSON reports and PDF derivatives to the **report owner's** Drive account
- verifying membership, coach/student ownership, and source connection on every report action

Report content and IDs are not written to Supabase connection metadata, sync jobs, or function logs. Legacy centre-level Drive credentials are not used for new report writes. Google secrets and service-role credentials remain in Edge Function secrets, never browser code.

## Main User Workflows

### Login

1. Bootstrap restores a Supabase session.
2. `applyAuthUser()` resolves the role and centre membership.
3. A centre route checks `centres.activated_at`; authenticated centre members without activation see the activation-code gate.
4. The code is redeemed through the privileged Edge Function, which hashes and verifies it, records the redeemer, and sets `activated_at`.
5. Coaches, students, centre state, and privileged state are refreshed and the dashboard is rendered according to role.

### Student management

Coach/admin forms update the in-memory student, then `saveStudentRecord()` upserts the student into Supabase. The local state is updated and the dashboard rerenders.

### Report creation

1. Any authenticated dashboard role except `dev` can start a report. Coaches report for themselves; centre admins select a coach in their centre; global admins select a connected centre and a coach in that centre.
2. The selected coach must have independently connected Google Drive. Draft edits are committed to IndexedDB, bound to that coach's managed Drive root, and uploaded in the background. The centre ID is request context and is not stored in canonical report content.
3. Wizard edits debounce for 200 ms to local storage (500 ms to Drive when IndexedDB is unavailable). Step changes and close flush the local transaction, without waiting for Google. Status text distinguishes Saving on this device, Saved on this device / sync pending, and Saved to Google Drive.
4. Finalization persists the latest local draft, waits for its confirmed Drive sync, and writes the canonical JSON report to Drive before marking it Generated. The cache then replaces that draft with the generated report; the student lesson count remains a Supabase profile aggregate.
5. The last wizard step offers the three templates and the selected coach's saved designs. A draft stores its chosen `certificateDesign` snapshot and retains it on resume.
6. Finalization stores the snapshot with the report. The report view and PDF/PNG exports use that layout. Legacy records without a snapshot use the coach's current layout. Template editing remains in Certificate Design and updates `coaches.report_layout`.

### Report export

- `html2canvas` creates the report canvas and `jsPDF` wraps it in a PDF.
- Finalized PDF derivatives are saved to the report coach's Google Drive and can be retried without duplicating the canonical JSON record.
- The browser downloads PNG or PDF blobs locally.
- `qrcode` generates coach and centre QR images.
- Report view can open a WhatsApp share composer with report metadata and the reports route.
- Certificate design uploads can replace the `brand-logo-art` layer or be kept in the reusable upload tray; image URLs and fit settings are persisted in the coach's `report_layout`, while image bytes stay in Supabase Storage. Uploaded assets can be dragged onto image layers. The report QR pocket starts at the template geometry. All certificate layers, including printed artwork, the TTAM badge, and the QR code, can be dragged and resized. Locks are optional user choices and persist with the layout.

Google Drive remains the authoritative shared store for generated reports. IndexedDB holds device-local cached reports and unconfirmed draft edits. Drive records are owned by each coach's connected Google account rather than a shared centre Drive. The Edge Function verifies centre membership and refreshes the corresponding coach token before accessing app-managed files. `coach_drive_connections` stores only connection/control-plane metadata; no report IDs, names, URLs, or content. Old centre-owned reports are not automatically transferred by the per-coach upgrade.

## Database and Security Rules

Database changes must be new, ordered migrations in `supabase/migrations/`. Do not edit an already-applied migration.

When changing schema or access:

- review Row Level Security policies
- review indexes and foreign keys
- keep centre isolation intact
- keep service-role operations in Edge Functions
- never expose private keys in browser code

## Build and Validation

Package manager: `pnpm` is preferred because `pnpm-lock.yaml` is committed.

Available scripts:

- `pnpm dev`
- `pnpm build`
- `pnpm preview`

Before handoff, run `pnpm build` (or `npm run build` if the environment only has npm). `npm test` runs all supplied and hybrid regression suites with Node 24; fake-indexeddb is a test-only dependency. There are no type-check or lint scripts.

## Maintenance Guidance

- Read the relevant existing code before changing behavior.
- Preserve the vanilla DOM architecture.
- Reuse existing state, selectors, CSS variables, and normalizers.
- Escape user-controlled content before inserting it into generated HTML.
- Keep changes focused; avoid rewriting `legacy-app.js` or `styles.css` wholesale.
- Do not edit `dist/` or `node_modules/`.
- Update this document when routes, persistence ownership, roles, Edge Functions, or report generation architecture changes.

## Certificate editor: movable layers and shared text editing

All certificate layers can be repositioned and resized in Certificate Design, including printed section artwork, dividers, the contact frame, the certification badge, and the QR code. Saved positions, sizes, visibility and stacking order are preserved instead of being reset to template geometry. The background/frame remains the canvas.

Layouts use `editorVersion: 2`. On the first normalization of a legacy layout, the old automatically imposed artwork/QR locks are released. New user locks persist across subsequent normalization and saves. Layer and Position panels remain available to select hidden layers and lock/unlock objects.

The four main headings (Dao Sports Method, Table Tennis Training, Character Transformation thru Sports, and This Is a Training Report) are ordinary `type: "text"` layers. They use the same contenteditable text-box wrapper and object controls as added text. Legacy `textOverride` values migrate to `text`, including deliberately empty wording. Selecting a text box updates its controls without replacing its DOM node, so double-clicks and the text caret remain intact. The toolbar supports font, size, colour, bold, italic and underline for all four headings. Their original PNG assets are retained but not rendered over the editable text.

Heading fitting measures the complete glyph width and line height, reserves space at the edges, and uses a relative `em` scale without a minimum horizontal squeeze. This prevents the leading T from being cropped and keeps fitting proportional when the report is exported at full resolution. The default fonts are Outfit, Montserrat, Lato Italic, and Cinzel Decorative; these approximate the original PNG lettering.

`tests/drive-backend.cjs` adds 11 isolated handler regressions for coach connect, verified sessions, cross-centre denial, public-only connection metadata, encrypted token storage, expired/replayed/concurrent OAuth state, same-account reconnect, account switching, missing configuration and report ownership. It uses Node 24's TypeScript stripping with Supabase/Google mocks.

`tests/regressions.cjs` provides 15 focused Node regressions (the two hybrid integration cases use the fake-indexeddb dev dependency) for layout migration/round-tripping, inline heading edits, formatting, escaping, pointer dragging/resizing, optional locks, title fitting and callback handling. DOM and Supabase behavior are mocked; this does not replace browser QA, a production build, or live Google authorization testing.


## Certificate template studio

The Certificate Design gallery offers Classic, Performance and Heritage, plus saved custom designs. `certificate-templates.js` contains the presets. `certificate-studio.js` renders the gallery and provides the isolated preview storage adapter. `certificate-editor.js` renders the editor frame and controls.

The editor toolset follows the supplied reference: Text and Uploads in the rail; font, minus/size/plus, text colour and bold/italic/underline in the toolbar. It keeps double-click text editing, dragging and resize handles. Additional editing menus and floating actions are not rendered. Template selection and custom background uploads remain in the gallery, reached from the Templates header action. QR codes remain report elements and can also be uploaded as images.

Layout metadata stays in `coaches.report_layout`: `templateId`, `baseTemplateId`, `designName`, `backgroundSource`, `qrUrl`, `designs`, `variants` and the shared upload tray. Variant snapshots exclude nested collections. Legacy layouts default to Classic. Image bytes use the existing profile-images bucket; reports retain their existing Google Drive ownership.

The gallery stylesheet is scoped to `.certificate-design-page.studio-page`. The editor uses the original global stylesheet. Other app screens and navigation keep their supplied UI.

`preview.html` and `preview-main.js` use sample data with no backend configuration. The preview stores design data in IndexedDB and never connects to live auth or Drive.

The report wizard uses `report-template-picker.js` and its scoped stylesheet. Options resolve from the report's coach, including coach variants and saved custom designs. Native radios preserve keyboard focus. Drafts and final records add an optional `certificateDesign: { templateId, name, layout }` under schema version 1. Collection metadata is excluded, the snapshot is limited to 384 KiB, and the shared `supabase/functions/_shared/certificate-design.js` validator runs in both the browser repository and the supplied Edge Function.

Deploy the included `google-drive-oauth` function and shared validator before the frontend. The client checks the authenticated `report-template-capabilities` action before writing records with a snapshot; older services fail before saving. Existing report ownership checks and the 512 KiB canonical record limit remain. No database migration is required. The preview's report writes stay in memory and skip real student/profile and Drive updates.

Validation for template selection: 19 dependency-free tests cover real presets, saved choices, snapshot rendering, frontend/backend record round-trips, legacy fallback, validation bounds and capability handling. DOM QA covers selection, Back/Next, close/resume, generation, and preserving generated designs after changing the coach template. Browser visual QA and live authenticated Drive/PDF validation remain unavailable in this environment.

Commands: `npm run build` builds the hosted preview; `npm run build:app` builds the authenticated app; `npm run dev:studio` opens the preview. The source handoff preserves the original app commands and adds `build:studio`. Run `node --test tests/certificate-studio.test.mjs` for the eight layout regressions. Live authenticated upload and report-export verification still belongs in the original staging environment.

## Drive loading performance update (2026-10-29)

Bootstrap, password sign-in and auth-state restoration render the authenticated dashboard without waiting for the Drive report list. Core coach/student/count and connection-status reads run concurrently. Connection-status reads use Supabase connection metadata; reading report JSON from Google Drive happens afterward in the background. Report counts show a loading placeholder until the initial list finishes.

`loadReportsFromDrive()` deduplicates the whole load, including global-admin workspace/context discovery. A successful list remains in session memory for 60 seconds. Navigating back to Reports during that interval reuses it; the Reports Refresh action explicitly bypasses this interval. A separate persistent IndexedDB cache now complements session memory; there is still no Supabase report cache. A refresh retains the previous list until a replacement succeeds, and a failed refresh displays its error while retaining the previous list. Report searches and date filters survive background rerenders.

Report reads are scoped to the signed-in user, role and selected centre. Generation invalidation on logout, account/centre changes, Drive callbacks and disconnect prevents late responses from applying to a new workspace. Read finalizers only clear their own in-flight promise. Active wizards/unsaved drafts skip revalidation, and a write revision prevents an earlier list response from overwriting newer local edits. Background completion does not rerender profile/settings/certificate forms or open modals.

The Edge Function uses four continuously refilled coach workers instead of batches that wait for the slowest coach. Each worker downloads at most six report JSON files concurrently (up to 24 concurrent media reads per list request). Reads and JSON saves resolve only Reports/Records; Reports/Exports is resolved when saving a PDF. Membership, coach/student ownership, encryption, canonical Drive writes and PDF retries retain their existing checks. No database migration is required. The response version header is `coach-v4-hybrid-drafts`.

Validation: `node --test tests/*.cjs tests/*.js tests/*.mjs` passes all 87 tests with Node 24, including the certificate studio, template picker, callback/ownership and Drive performance suites. `npm run build` and `npm run build:studio` build the authenticated app and isolated certificate preview respectively. One existing repository test was corrected to supply the coach ID already required by PDF saving; production PDF ownership enforcement is unchanged.

Source completeness: the follow-up src, public and scripts archives supply the modular studio, report-template picker, artwork and preview finalizer. The Drive change is merged into that newer controller and retains its saved design snapshots, preview-only writes and protection for draft edits made during a save. The added minimal vite.config.js selects preview.html for studio mode so build:studio can produce and promote the correct entry; the normal app still uses index.html. The dependency lockfile and original hosting rewrite configuration were not supplied. Live authenticated Drive timing, browser visual QA and PDF/export testing still require the original staging environment.


## Hybrid local drafts and Drive sync

`src/report-local.js` owns IndexedDB access and the outbox. `src/report-drive.js` remains the normalized remote API adapter. The authenticated controller enables local persistence when IndexedDB is available; the isolated certificate preview retains its separate design database and in-memory report adapter.

The local database is dao-report-hybrid-v1. Each normalized report/draft has its own entry, with indexes by workspace and pending state. Local edits, upload claims and acknowledgements use IndexedDB read/modify/write transactions. Editing a draft does not read or rewrite cached report bodies; status updates use pending rows and synced draft keys. A 120-second outbox lease avoids duplicate workers across tabs, and revision tokens keep a late acknowledgement from clearing newer typing. A sync pass handles up to 20 queued writes; remaining/retryable work is checked again after 15 seconds. Uploads also resume on online/visible events or Sync now. No work runs after the app is closed, or for an inactive account/centre.

The cache keeps up to 100 synced records plus every pending draft. A complete remote list removes stale synced cache entries; partial coach failures preserve cached entries and show a warning. Pending local edits take precedence. The online report list still contains the full remote collection, even though only 100 recent synced records are cached. Cached results can paint while Drive is loading; exact overview totals wait for a complete Drive result. Clear cached reports preserves the outbox, and Export local drafts downloads pending edits as JSON.

Every queued draft retains its last confirmed baseline and owner root. Hybrid save requests carry an actor ID, centre context, source root and baseline. The backend verifies membership/coach/student ownership as before, checks actor/root binding, compares the existing normalized draft to the baseline, accepts exact lost-response retries, and rejects deleted/finalized or changed drafts with DRAFT_CONFLICT. DRIVE_SOURCE_CHANGED blocks sync to a different Google account. Blocked edits stay on the device; Save as a separate copy gives them a new opaque draft ID. The client checks hybridDraftVersion: 1 before sending these writes, so an older service cannot silently ignore the safeguards.

The baseline check is a Drive read/compare/write, not an atomic distributed compare-and-swap. This release does not provide simultaneous collaborative editing guarantees across devices; production concurrent-edit behavior still needs staging verification. The same-browser outbox is transactional, but separate devices do not share its lock.

Final reports and PDF derivatives keep their existing online confirmation/retry behavior. Local persistence does not make authentication, student/profile updates, image uploads, or first-time app loading work offline. If IndexedDB is absent, drafts use the original Drive-only path. If a local transaction fails (including quota exhaustion), the app reports it and retains its unsaved-edits guard rather than claiming the draft is saved. Browser storage may be cleared or evicted; local entries are browser-managed and are not separately encrypted. Pending work should be synced or exported before clearing site data.

Deploy google-drive-oauth plus its existing shared validator before the frontend. No database migration or new cloud report table is required. The Edge Function version header is coach-v4-hybrid-drafts. npm test passes 87 tests including actual IndexedDB API emulation, slow cached reads, offline saves/retry, cross-account isolation, tab leases, edits during upload, cache bounds, backend conflicts/source binding and finalization ordering. Production Google authorization, browser/device visual QA and end-to-end PDF timing remain unverified.

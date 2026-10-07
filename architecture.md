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
- `/api/auth/google-drive/callback` - Google Drive's configured callback URL; Vercel rewrites it to `/auth/callback` so the SPA can process the code and return to `/centre/:slug`

There is no route table or router package. Route behavior is implemented inside the bootstrap and render logic.

## Application State

The main in-memory `state` object contains:

- `auth`: role, user ID, coach ID, centre ID, and email
- `ui`: current page, selected report, menu state, and notices
- `coaches`
- `students`
- `reports` and `reportDrafts` (Drive-loaded, in-memory session state only)
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

Supabase Auth provides email/password and Google OAuth. Sessions are persisted, refreshed, and restored during bootstrap. Centre login pages expose both methods; Google callback context preserves the centre slug.

The frontend resolves these roles:

- `dev` - internal licensing and support console
- `admin` - legacy/global dashboard administration
- `centre_admin` - centre management and Google Drive controls
- `coach` - coach profile, students, reports, and certificate editing

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
- `drive_connections`
- `drive_sync_jobs`
- `audit_logs`

`centres.logo_url` stores the public centre branding asset URL and `centres.activated_at` records the first successful activation. `activation_keys` stores both the redemption hash and the generated code needed by the privileged dev console; the code is only returned through the service-role-backed dev function.

### `dashboard_state` JSON

The current dashboard also persists a large JSON payload in `dashboard_state`.

- Global data uses the ID `dashboard`.
- Centre accounts use `centre:<centre-id>`.
- Auth values are stripped before writing.
- Reports, drafts, and report-view identifiers are stripped before writing and are never hydrated from this payload.
- Browser-specific auth and UI values are carried over when realtime payloads are applied.
- Writes are debounced by approximately 250 ms.

Supabase Realtime listens for changes to `dashboard_state`, `coaches`, `students`, and `centre_links`, then refreshes state and rerenders the UI.

### Browser storage

Centre links can fall back to `localStorage` under the key `centre_profile` when Supabase is unavailable. Report content is never placed in browser persistent storage.

### Centre report records

Each centre's connected Google Drive is the durable source of truth for report drafts and finalized reports. The app stores versioned JSON records under the centre root's `Reports/Records` folder and finalized PDF derivatives under `Reports/Exports`. Stable opaque IDs are used for filenames and Drive `appProperties`; student names and report summaries are not placed in metadata. JSON is canonical; PDF upload can be retried independently.

The browser loads report records into memory after centre authentication and Drive connection refresh. Draft saves and finalization go through `google-drive-oauth`; a finalized report is not presented as saved until its JSON write succeeds. Supabase `dashboard_state` serialization excludes report arrays and report-specific view IDs. Realtime hydration preserves the currently loaded in-memory Drive records. Failed Drive writes do not fall back to Supabase or browser storage.

Supabase remains responsible for auth, centre memberships, coach/student/centre profiles, licensing, and encrypted Drive connection/control-plane metadata. The existing student `lessons` profile scalar remains in Supabase as an aggregate; it is not a report record. No historical migration is planned because the user confirmed no report data needs migration. A read-only cutover audit found no report rows, dashboard-state reports, or drafts at implementation time.

## Supabase Storage

The `profile-images` bucket stores coach, student, certificate, and centre-logo images.

The browser validates image type and size, uploads through the publishable client, and stores the resulting public URL on the corresponding profile, student, certificate, or centre record.

## Supabase Edge Functions

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

Centre-admin Google Drive connection operations, including:

- starting OAuth
- exchanging an OAuth callback code
- carrying the centre ID and slug in OAuth state so the callback preserves the centre route
- creating a Google Drive root folder named after the centre before marking the connection as connected
- encrypting and storing refresh tokens
- disconnecting Drive
- queuing a retry sync job
- listing and saving centre-scoped JSON report records in managed report folders
- uploading or replacing finalized PDF derivatives idempotently
- checking centre membership and coach/student ownership for every report action

Report content and IDs are not written to Supabase sync jobs, connection metadata, or function logs. The legacy `sync-report` action is rejected; clients use the report repository actions instead.

Google client secrets, encryption keys, and service-role credentials must remain Edge Function secrets.

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

1. A coach starts a report; its draft is saved to Drive and held in memory while the wizard is open.
2. Wizard edits are debounced to Drive; step changes and close flush pending edits first.
3. Finalization writes the canonical JSON report to Drive before moving it into in-memory `state.reports`; the student lesson count remains a Supabase profile aggregate.
4. The report view renders the fixed certificate artwork plus dynamic overlays.
5. Layout edits update the coach's `report_layout`.

### Report export

- `html2canvas` creates the report canvas and `jsPDF` wraps it in a PDF.
- Finalized PDF derivatives are saved to the centre Drive and can be retried without duplicating the canonical JSON record.
- The browser downloads PNG or PDF blobs locally.
- `qrcode` generates coach and centre QR images.
- Report view can open a WhatsApp share composer with report metadata and the reports route.
- Certificate design uploads can replace the `brand-logo-art` layer or be kept in the reusable upload tray; image URLs and fit settings are persisted in the coach's `report_layout`, while image bytes stay in Supabase Storage. Uploaded assets can be dragged onto image layers. The report QR pocket is fixed to its template geometry.

Google Drive is the sole durable store for centre report drafts and records. The Edge Function refreshes the encrypted Drive token, authorizes the caller's centre membership, and reads/writes app-managed files. `drive_connections` may record generic connection status and successful-sync timestamps, but not report IDs, names, URLs, or content. No migration is planned for historical reports.

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

Before handoff, run `pnpm build` (or `npm run build` if the environment only has npm). There are currently no test, type-check, or lint scripts defined in `package.json`.

## Maintenance Guidance

- Read the relevant existing code before changing behavior.
- Preserve the vanilla DOM architecture.
- Reuse existing state, selectors, CSS variables, and normalizers.
- Escape user-controlled content before inserting it into generated HTML.
- Keep changes focused; avoid rewriting `legacy-app.js` or `styles.css` wholesale.
- Do not edit `dist/` or `node_modules/`.
- Update this document when routes, persistence ownership, roles, Edge Functions, or report generation architecture changes.

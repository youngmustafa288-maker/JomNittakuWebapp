# Hybrid local saving and Google Drive

This updated source bundle replaces the earlier Drive performance patch. It merges the hybrid approach into the latest supplied certificate studio.

## What the user sees

- Draft edits save on the device first. Typing debounces for 200 ms; step changes and closing the wizard wait for the local transaction instead of Google Drive.
- The app clearly distinguishes Saving on this device, Saved on this device / Drive sync pending, and Saved to Google Drive.
- Cached recent reports can appear while Drive is loading. The cache retains up to 100 synced records and every unsynced draft. A complete online list still shows every remote record.
- Drive sync runs in the background while the authenticated app is open. It retries pending work, resumes on reconnect/returning to the tab, and offers Sync now.
- Detected conflicts stay on the device. Save as a separate copy preserves those edits under a new draft ID; Export local drafts downloads pending drafts as JSON.
- Final report generation waits for the latest draft to sync and for the canonical report save to succeed on Drive. PDF exports retain their existing Drive retry behavior.

## Storage boundaries

Supabase still stores authentication, memberships, profiles, licensing and student lesson aggregates. Report content is excluded from Supabase dashboard_state.

Google Drive is the authoritative shared report store. IndexedDB stores device-local cached records and a pending draft outbox. Local entries are separated by Supabase project, user, role and centre. Queued uploads are bound to the coach's verified managed Drive root; a changed Google account cannot silently receive the old outbox.

Each draft has an individual IndexedDB record. Editing does not read or rewrite all cached reports. Transactions, tab leases and revision-aware acknowledgements preserve edits made during an upload. Cache pruning and Clear cached reports never remove pending drafts. Signing out stops sync and hides that account's data, while retaining its local outbox for recovery after signing back into the same account.

Local storage is browser-managed and is not separately encrypted. Clearing site data or storage eviction can remove it. Sync or export pending edits before clearing browser data. This is not a full offline application: authentication, first-time page loading, profile/student writes, image uploads and final report generation still need their existing online services. Sync does not continue after closing the app.

The backend compares a draft's last confirmed baseline and preserves detected conflicts. This is a read/compare/write check, not an atomic distributed compare-and-swap; the release does not provide simultaneous collaborative editing guarantees across devices. Live concurrent editing still needs staging verification.

If IndexedDB is unavailable, the original Drive-only draft saving path remains. If a local transaction fails (for example, quota exhaustion), the app reports the failure and retains the unsaved-edit guard instead of claiming a successful local save.

## Apply and deploy

The ZIP includes the assembled supplied src/, public/, scripts/, tests/, supabase/, package and entry/configuration files, plus updated architecture.md and changes.patch. The patch is relative to the latest src(2).zip and the original backend/tests/package uploads. Compiled output and installed dependencies are excluded.

1. Review changes.patch or compare the source with your current project.
2. Deploy the included google-drive-oauth function and its existing shared certificate-design.js dependency in the same Supabase project as the app BEFORE deploying the frontend. No database migration is required.
3. Install dependencies, including dev dependencies for builds/tests. fake-indexeddb is test-only.
4. npm test runs all 87 tests on Node 24. npm run build builds the authenticated app. npm run build:studio builds the isolated certificate preview. Both builds use dist/, so the last build determines its contents.
5. Keep your existing hosting configuration, especially SPA/auth callback rewrites. The original hosting configuration and dependency lockfile were not supplied; this bundle does not replace them.
6. Validate on staging: reconnect the existing coach Drive, create/edit a draft, go offline, close/resume, reconnect, verify Sync pending becomes Saved to Drive, test a changed Drive account, and finalize/export a report.

The client requires hybridDraftVersion: 1 before sending local outbox uploads. Older functions leave drafts pending locally and show a service-update error rather than silently discarding source/baseline safeguards. The backend response version header is coach-v4-hybrid-drafts.

## Validation

- All 87 tests pass, including the original certificate/auth/ownership suites and the new local persistence, cache, conflict and finalization cases.
- Tests use the actual IndexedDB API through fake-indexeddb, including persistence across new store instances, transactional tab claims, quota errors, upload acknowledgements racing with newer typing, and per-account/centre isolation.
- Both production app and studio builds pass.
- Live Google authorization, browser visual QA, real device storage limits and end-to-end Drive/PDF timing have not been verified here.

No production deployment was performed.

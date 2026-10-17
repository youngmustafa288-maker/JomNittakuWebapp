# Feature: Centre Login Branding

## Feature Description

Let the development account upload and verify a logo for every centre. Display each uploaded logo on that centre's login page with the centre's sport emoji.

## User Story

As a development-account operator, I want to upload and test each centre's branding so centre members recognize their login page.

## Problem Statement

The console has an upload action, but its change listener is incorrectly nested in report-layout editing. The login page loads only centre name and logo URL, and the dev list does not show an at-a-glance logo preview.

## Solution Statement

Bind centre logo uploads with other dashboard file inputs, show a compact logo preview and login test link in the dev centre list/details, and include sport plus logo in the centre route's login branding. Reuse the existing `profile-images` bucket, privileged update action, and `centreSportMarkup()` mapping.

## Out of Scope / Non-Goals

- No schema, storage bucket, migration, or RLS changes.
- No logo upload permission for centre members; uploads remain dev-console-only.
- No replacement of the global login branding or report/certificate logos.

## Feature Metadata

**Feature Type**: Enhancement / bug fix
**Estimated Complexity**: Low
**Primary Systems Affected**: `src/legacy-app.js`, `src/styles.css`
**Dependencies**: Existing Supabase Storage and `dev-console` Edge Function.

## CONTEXT REFERENCES

- `architecture.md` - centre branding is persisted in `centres.logo_url`; `profile-images` stores centre logo images.
- `src/legacy-app.js:1453` - centre login renderer.
- `src/legacy-app.js:2691` - dev centre table and sport emoji helper.
- `src/legacy-app.js:3411` - incorrectly nested centre upload listener.
- `src/legacy-app.js:4479` - shared image validation/storage upload helper.
- `src/styles.css:1144` - login logo presentation.
- `package.json` - only validation script is the Vite production build.

## IMPLEMENTATION PLAN

1. Move the hidden centre logo input listener into `attachEvents()`, preserving image validation, protected URL update, state refresh, and error feedback.
2. Add centre logo preview/test affordances to the development centre list and details modal.
3. Load the centre sport on `/centre/:slug` and render its sport emoji with the centre login logo.
4. Add compact responsive styles for previews and login sport mark.
5. Run the production build and inspect the diff for regressions.

## STEP-BY-STEP TASKS

### UPDATE `src/legacy-app.js`

- **IMPLEMENT**: Correct upload listener placement; show per-centre logo preview and test link; select sport in public centre lookup and render it with login branding.
- **PATTERN**: Existing `uploadProfileImage`, `invokePrivileged`, `refreshPrivilegedState`, and `centreSportMarkup` helpers.
- **GOTCHA**: Keep upload permission dev-only and preserve the global login route's current appearance.
- **VALIDATE**: `npm run build`
- **SATISFIES**: Upload, per-centre testing, sport-specific login branding.

### UPDATE `src/styles.css`

- **IMPLEMENT**: Style the list preview and inline sport mark without affecting report templates or mobile overflow.
- **PATTERN**: Existing login and dev-centre table styles.
- **VALIDATE**: `npm run build`
- **SATISFIES**: Branding remains legible and responsive.

## TESTING STRATEGY

No test runner is defined. Verify by production build and manual dev-console upload/login checks when authenticated access is available.

## VALIDATION COMMANDS

- `npm run build`
- No test, type-check, or lint scripts are defined.

## ACCEPTANCE CRITERIA

- [x] Dev account can upload and replace a centre logo from centre details.
- [x] Each centre row exposes its current logo (or a no-logo state) and a test link.
- [x] Centre login shows uploaded logo and matching sport emoji.
- [x] Global login and centre member permissions are unchanged.
- [x] Production build passes.

## OPEN QUESTIONS / ASSUMPTIONS

- Assumption: “logo test for each centre” means list preview and a link opening that centre's login route.
- Assumption: sport emoji belongs next to the logo on the centre login screen.

## AMENDMENTS

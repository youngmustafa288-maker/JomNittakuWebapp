# Continue: Dev Console Edge Function CORS Fix

## Current Request

The developer account centre-creation wizard showed:

> Failed to send a request to the Edge Function

The screenshot showed the failure after selecting a sport and entering a centre name.

## Diagnosis

The deployed `dev-console` Supabase Edge Function returned `403` to the browser's `OPTIONS` CORS preflight request. The function had no CORS headers or `OPTIONS` handler, so `supabase.functions.invoke()` surfaced a generic request failure before the actual response could be read.

Verification performed against:

`https://vjhjvcvmtfpkoyjxfmxu.supabase.co/functions/v1/dev-console`

The live `OPTIONS` request returned `403` before the fix was deployed.

## Code Changes Already Pushed

`supabase/functions/dev-console/index.ts` now includes:

- `corsHeaders`
- `OPTIONS` preflight response
- CORS headers merged into every JSON response

The onboarding UI copy was also updated after removing the extra fields from the screenshot:

- Removed `First coach name`
- Removed `Login email`
- Removed `Temporary password`
- Step 2 now asks only for `Centre name`

The client currently generates internal provisioning values from the centre name so the existing Edge Function contract remains satisfied. Review this later if the product should instead have a separate account activation flow using the licence key.

## Commits

- `fccdc6a Add centre onboarding wizard`
- `015e4ed Simplify centre onboarding details`
- `67d3182 Fix dev console edge function CORS`
- `55e16be Update centre onboarding copy`

All are pushed to `origin/main`.

## Blocker

The Edge Function fix has **not** been deployed to Supabase yet. The local Supabase CLI is available through `npx`, but deployment failed because this session had no Supabase MCP connection or access token:

`LegacyPlatformAuthRequiredError: Access token not provided`

## Next Session Steps (MCP Connected)

1. Read the Supabase skill instructions before using Supabase tools.
2. Deploy only the function:

```powershell
npx supabase functions deploy dev-console --project-ref vjhjvcvmtfpkoyjxfmxu --use-api
```

3. Verify the deployed preflight response:

```powershell
$url = 'https://vjhjvcvmtfpkoyjxfmxu.supabase.co/functions/v1/dev-console'
Invoke-WebRequest -UseBasicParsing -Method Options -Uri $url -Headers @{
  Origin = 'https://jom-nittaku-webapp.vercel.app'
  'Access-Control-Request-Method' = 'POST'
  'Access-Control-Request-Headers' = 'authorization,apikey,content-type'
}
```

Expected result: HTTP `200` with `access-control-allow-origin` and `access-control-allow-headers` response headers.

4. Test the complete dev-console flow in the browser:

- Sign in as the dev account.
- Open `Licensing Console`.
- Click `Create centre`.
- Select a sport.
- Enter a centre name.
- Submit creation.
- Confirm the success panel shows the centre login URL and one-year licence key.

5. Check Supabase function logs and database rows if creation still fails:

- `centres`
- `centre_memberships`
- `coaches`
- `centre_licences`
- `activation_keys`
- `audit_logs`

## Validation Already Passed

`npm run build`

`git diff --check`

## Other Worktree State

There are unrelated existing deletions/untracked files and a generated `supabase/.temp/` directory. Do not revert or clean them without explicit instruction.


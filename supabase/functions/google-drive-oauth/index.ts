import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

Deno.serve(async (request) => {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Authentication required" }, 401);
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData.user;
  const centreId = user?.app_metadata?.centre_id;
  const role = user?.app_metadata?.role;
  if (!user || !centreId || !["centre_admin", "dev"].includes(role)) return json({ error: "Centre admin role required" }, 403);
  const body = await request.json().catch(() => ({}));
  if (body.action === "callback") {
    const code = String(body.code || "");
    if (!code) return json({ error: "OAuth code is required" }, 400);
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");
    const encryptionKey = Deno.env.get("DRIVE_TOKEN_ENCRYPTION_KEY");
    if (!clientId || !clientSecret || !redirectUri || !encryptionKey) return json({ error: "Drive OAuth is not configured" }, 503);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }) });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.refresh_token) return json({ error: "Google token exchange failed" }, 502);
    const keyBytes = Uint8Array.from(atob(encryptionKey), (character) => character.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, new TextEncoder().encode(tokens.refresh_token));
    const sealed = `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(encrypted)))}`;
    await admin.from("drive_connections").upsert({ centre_id: centreId, google_account_email: String(body.google_account_email || "Connected Google account"), root_folder_id: String(body.root_folder_id || "pending"), root_folder_name: String(body.root_folder_name || "Dao Sports Method"), root_folder_url: String(body.root_folder_url || "https://drive.google.com"), encrypted_refresh_token: sealed, status: "connected", token_expires_at: tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString() : null });
    await admin.from("audit_logs").insert({ actor_id: user.id, centre_id: centreId, action: "drive.connected", metadata: { token_stored: true } });
    return json({ ok: true });
  }
  if (body.action === "disconnect") {
    await admin.from("drive_connections").update({ status: "disconnected", encrypted_refresh_token: null }).eq("centre_id", centreId);
    await admin.from("audit_logs").insert({ actor_id: user.id, centre_id: centreId, action: "drive.disconnected", metadata: {} });
    return json({ ok: true });
  }
  if (body.action === "retry") {
    await admin.from("drive_sync_jobs").insert({ centre_id: centreId, kind: "manual-retry", status: "queued" });
    return json({ ok: true });
  }
  // OAuth exchange and token encryption belong here. Secrets are read only from
  // Edge Function environment variables and never sent to the browser.
  return json({ authorization_url: `${Deno.env.get("GOOGLE_OAUTH_AUTHORIZE_URL") || "https://accounts.google.com/o/oauth2/v2/auth"}?scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file&state=${crypto.randomUUID()}` });
});

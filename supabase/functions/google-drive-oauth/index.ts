import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json", "cache-control": "no-store" } });

async function decryptRefreshToken(sealed: string, encryptionKey: string) {
  const [ivValue, payloadValue] = String(sealed || "").split(".");
  if (!ivValue || !payloadValue) throw new Error("Stored Drive token is invalid");
  const keyBytes = Uint8Array.from(atob(encryptionKey), character => character.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const iv = Uint8Array.from(atob(ivValue), character => character.charCodeAt(0));
  const payload = Uint8Array.from(atob(payloadValue), character => character.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, payload);
  return new TextDecoder().decode(plain);
}

async function getDriveAccessToken(refreshToken: string, clientId: string, clientSecret: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" })
  });
  const tokens = await response.json();
  if (!response.ok || !tokens.access_token) throw new Error("Google Drive access token refresh failed");
  return tokens;
}

function multipartBody(metadata: Record<string, unknown>, bytes: Uint8Array, mimeType: string, boundary: string) {
  const encoder = new TextEncoder();
  const prefix = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const suffix = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(prefix.length + bytes.length + suffix.length);
  body.set(prefix);
  body.set(bytes, prefix.length);
  body.set(suffix, prefix.length + bytes.length);
  return body;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Authentication required" }, 401);
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData.user;
  const centreId = user?.app_metadata?.centre_id;
  const role = user?.app_metadata?.role;
  const body = await request.json().catch(() => ({}));
  const allowedRoles = body.action === "sync-report" ? ["centre_admin", "coach", "dev"] : ["centre_admin", "dev"];
  if (!user || !centreId || !allowedRoles.includes(role)) return json({ error: body.action === "sync-report" ? "Centre membership required" : "Centre admin role required" }, 403);
  if (body.action === "sync-report") {
    const reportId = String(body.report_id || "").trim();
    const fileName = String(body.file_name || `${reportId || "training-report"}.pdf`).replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180);
    const mimeType = String(body.mime_type || "application/pdf");
    const encodedFile = String(body.file_base64 || "");
    if (!reportId || !encodedFile) return json({ error: "Report export is required" }, 400);
    if (encodedFile.length > 25 * 1024 * 1024) return json({ error: "Report export is too large" }, 413);
    const { data: connection } = await admin.from("drive_connections").select("centre_id,root_folder_id,encrypted_refresh_token,status").eq("centre_id", centreId).maybeSingle();
    if (!connection || connection.status !== "connected" || !connection.encrypted_refresh_token) return json({ error: "Google Drive is not connected" }, 409);
    const { data: job, error: jobError } = await admin.from("drive_sync_jobs").insert({ centre_id: centreId, kind: `report:${reportId}`, status: "running" }).select("id").single();
    if (jobError || !job) return json({ error: jobError?.message || "Unable to create Drive sync job" }, 500);
    try {
      const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
      const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
      const encryptionKey = Deno.env.get("DRIVE_TOKEN_ENCRYPTION_KEY");
      if (!clientId || !clientSecret || !encryptionKey) throw new Error("Drive OAuth is not configured");
      const refreshToken = await decryptRefreshToken(connection.encrypted_refresh_token, encryptionKey);
      const tokens = await getDriveAccessToken(refreshToken, clientId, clientSecret);
      const bytes = Uint8Array.from(atob(encodedFile.replace(/^data:[^;]+;base64,/, "")), character => character.charCodeAt(0));
      const boundary = `drive-${crypto.randomUUID()}`;
      const uploadResponse = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: { authorization: `Bearer ${tokens.access_token}`, "content-type": `multipart/related; boundary=${boundary}` },
        body: multipartBody({ name: fileName, parents: [connection.root_folder_id] }, bytes, mimeType, boundary)
      });
      const uploaded = await uploadResponse.json();
      if (!uploadResponse.ok || !uploaded.id) throw new Error("Google Drive report upload failed");
      await admin.from("drive_sync_jobs").update({ status: "succeeded", completed_at: new Date().toISOString() }).eq("id", job.id);
      await admin.from("drive_connections").update({ last_successful_sync_at: new Date().toISOString(), last_error: null, token_expires_at: tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString() : null }).eq("centre_id", centreId);
      return json({ ok: true, file_id: uploaded.id, file_url: `https://drive.google.com/file/d/${encodeURIComponent(uploaded.id)}/view` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google Drive report upload failed";
      await admin.from("drive_sync_jobs").update({ status: "failed", error: message, completed_at: new Date().toISOString() }).eq("id", job.id);
      await admin.from("drive_connections").update({ status: "error", last_error: message }).eq("centre_id", centreId);
      return json({ error: message }, 502);
    }
  }
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
    const { data: centre } = await admin.from("centres").select("name").eq("id", centreId).maybeSingle();
    const folderName = String(centre?.name || "Centre").trim() || "Centre";
    let rootFolderId = "";
    let rootFolderUrl = "https://drive.google.com";
    if (tokens.access_token) {
      const folderResponse = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: { authorization: `Bearer ${tokens.access_token}`, "content-type": "application/json" },
        body: JSON.stringify({ name: folderName, mimeType: "application/vnd.google-apps.folder" }),
      });
      const folder = await folderResponse.json();
      if (!folderResponse.ok || !folder.id) return json({ error: "Google Drive folder creation failed" }, 502);
      rootFolderId = folder.id;
      rootFolderUrl = `https://drive.google.com/drive/folders/${encodeURIComponent(folder.id)}`;
    }
    const keyBytes = Uint8Array.from(atob(encryptionKey), (character) => character.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, new TextEncoder().encode(tokens.refresh_token));
    const sealed = `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...new Uint8Array(encrypted)))}`;
    const { data: connection, error: connectionError } = await admin
      .from("drive_connections")
      .upsert({ centre_id: centreId, google_account_email: String(body.google_account_email || "Connected Google account"), root_folder_id: rootFolderId || String(body.root_folder_id || "pending"), root_folder_name: folderName, root_folder_url: rootFolderUrl, encrypted_refresh_token: sealed, status: "connected", token_expires_at: tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString() : null })
      .select("centre_id,google_account_email,root_folder_id,root_folder_name,root_folder_url,token_expires_at,status,last_error,last_successful_sync_at,connected_at,updated_at")
      .single();
    if (connectionError || !connection) return json({ error: connectionError?.message || "Unable to save the Google Drive connection" }, 500);
    const { error: auditError } = await admin.from("audit_logs").insert({ actor_id: user.id, centre_id: centreId, action: "drive.connected", metadata: { token_stored: true } });
    if (auditError) return json({ error: auditError.message || "Unable to record the Google Drive connection" }, 500);
    return json({ ok: true, connection });
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
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");
  if (!clientId || !redirectUri) return json({ error: "Drive OAuth is not configured" }, 503);
  const authorizationUrl = new URL(Deno.env.get("GOOGLE_OAUTH_AUTHORIZE_URL") || "https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("prompt", "consent");
  authorizationUrl.searchParams.set("scope", "https://www.googleapis.com/auth/drive.file");
  const { data: centre } = await admin.from("centres").select("slug").eq("id", centreId).maybeSingle();
  authorizationUrl.searchParams.set("state", `${centreId}|${centre?.slug || ""}|${crypto.randomUUID()}`);
  return json({ authorization_url: authorizationUrl.toString() });
});

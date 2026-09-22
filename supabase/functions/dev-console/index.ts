import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
});

async function caller(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  if (data.user?.app_metadata?.role !== "dev") return null;
  const payload = token.split(".")[1];
  let aal = "";
  try { aal = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).aal || ""; } catch { return null; }
  return aal === "aal2" ? data.user : null;
}

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `DSM-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  const user = await caller(request);
  if (!user) return json({ error: "Dev role required" }, 403);
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const action = body.action || "list";

  if (action === "list") {
    const { data, error } = await admin.from("centres").select("*, centre_licences(*), drive_connections(*), centre_memberships(user_id, role)").order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ centres: data });
  }
  if (action === "create-centre") {
    const name = String(body.name || "").trim();
    if (!name) return json({ error: "Centre name is required" }, 400);
    const { data: centre, error } = await admin.from("centres").insert({ name }).select().single();
    if (error) return json({ error: error.message }, 500);
    const key = randomKey();
    const { error: keyError } = await admin.from("activation_keys").insert({ centre_id: centre.id, key_hash: await hash(key), generated_by: user.id, expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString() });
    if (keyError) return json({ error: keyError.message }, 500);
    await admin.from("audit_logs").insert({ actor_id: user.id, centre_id: centre.id, action: "licence.issued", metadata: { reason: "centre-created" } });
    return json({ centre, activation_key: key });
  }
  if (["suspend-centre", "renew-licence", "revoke-licence"].includes(action)) {
    const centreId = String(body.centre_id || "");
    if (!centreId) return json({ error: "centre_id is required" }, 400);
    if (action === "suspend-centre") await admin.from("centres").update({ status: "suspended" }).eq("id", centreId);
    if (action === "renew-licence") await admin.from("centre_licences").insert({ centre_id: centreId, status: "active", starts_at: new Date().toISOString(), expires_at: new Date(Date.now() + 365 * 86400000).toISOString(), created_by: user.id });
    if (action === "revoke-licence") await admin.from("centre_licences").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("centre_id", centreId).eq("status", "active");
    await admin.from("audit_logs").insert({ actor_id: user.id, centre_id: centreId, action: `licence.${action.replace("-licence", "")}`, metadata: {} });
    return json({ ok: true });
  }
  if (action === "support-access") {
    const centreId = String(body.centre_id || "");
    await admin.from("audit_logs").insert({ actor_id: user.id, centre_id: centreId || null, action: "support.data_access", metadata: { indicator: "dev-support-access" } });
    return json({ ok: true, support_access: true });
  }
  return json({ error: "Unknown action" }, 400);
});

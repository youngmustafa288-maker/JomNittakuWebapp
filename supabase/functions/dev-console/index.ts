import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "content-type": "application/json", "cache-control": "no-store" },
});

async function caller(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  const payload = token.split(".")[1];
  try { JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))); } catch { return null; }
  return data.user;
}

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `DSM-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "centre";
}

function appUrl() {
  return (Deno.env.get("APP_URL") || "https://jom-nittaku-webapp.vercel.app").trim().replace(/\/+$/, "");
}

function displayEmail(value: unknown) {
  const email = String(value || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  if (email.toLowerCase().endsWith("@accounts.jomnittaku.app")) return "";
  return email;
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
  const action = body.action || "list";
  const user = await caller(request);
  if (!user) return json({ error: "Authentication required" }, 401);
  const isGoogleUser = user.app_metadata?.provider === "google"
    || user.identities?.some((identity) => identity.provider === "google");
  if (action !== "redeem-activation" && action !== "provision-google-member" && user.app_metadata?.role !== "dev") return json({ error: "Dev role required" }, 403);

  if (action === "provision-google-member") {
    if (!isGoogleUser) return json({ error: "Google sign-in is required" }, 403);
    const centreId = String(body.centre_id || "");
    if (!centreId) return json({ error: "centre_id is required" }, 400);
    const { data: centre } = await admin.from("centres").select("id,name,status").eq("id", centreId).maybeSingle();
    if (!centre || centre.status !== "active") return json({ error: "This centre is unavailable" }, 400);
    const { data: existing } = await admin.from("centre_memberships").select("centre_id, user_id, role").eq("centre_id", centreId).eq("user_id", user.id).maybeSingle();
    if (existing) return json({ membership: existing });
    const { error: membershipError } = await admin.from("centre_memberships").insert({ centre_id: centreId, user_id: user.id, role: "coach" });
    if (membershipError) return json({ error: membershipError.message }, 500);
    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Coach";
    const { error: coachError } = await admin.from("coaches").upsert({
      id: user.id,
      name,
      branch: centre.name,
      branch_address: centre.name,
      email: user.email || "",
      centre_id: centreId,
    }, { onConflict: "id" });
    if (coachError) {
      await admin.from("centre_memberships").delete().eq("centre_id", centreId).eq("user_id", user.id);
      return json({ error: coachError.message }, 500);
    }
    const { error: metadataError } = await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...(user.app_metadata || {}), role: "coach", centre_id: centreId } });
    if (metadataError) return json({ error: metadataError.message }, 500);
    await admin.from("audit_logs").insert({ actor_id: user.id, centre_id: centreId, action: "membership.google-provisioned", metadata: {} });
    return json({ membership: { centre_id: centreId, user_id: user.id, role: "coach" } });
  }

  if (action === "redeem-activation") {
    const centreId = String(body.centre_id || "");
    const code = String(body.code || "").trim().toUpperCase();
    if (!centreId || !code) return json({ error: "Centre and activation code are required" }, 400);
    const { data: membership } = await admin.from("centre_memberships").select("centre_id").eq("centre_id", centreId).eq("user_id", user.id).maybeSingle();
    if (!membership) return json({ error: "This account is not assigned to that centre" }, 403);
    const { data: centre } = await admin.from("centres").select("id,status,activated_at").eq("id", centreId).maybeSingle();
    if (!centre || centre.status !== "active") return json({ error: "This centre is unavailable" }, 400);
    if (centre.activated_at) return json({ ok: true, activated_at: centre.activated_at });
    const { data: keys } = await admin.from("activation_keys").select("id,key_hash,key_value,expires_at,revoked_at").eq("centre_id", centreId).is("redeemed_at", null).is("revoked_at", null).order("generated_at", { ascending: false });
    const codeHash = await hash(code);
    const matchingKey = (keys || []).find((key) => (!key.expires_at || new Date(key.expires_at).getTime() > Date.now()) && (key.key_hash === codeHash || key.key_value === code));
    if (!matchingKey) return json({ error: "Invalid or expired activation code" }, 400);
    const activatedAt = new Date().toISOString();
    const { error: keyError } = await admin.from("activation_keys").update({ redeemed_by: user.id, redeemed_at: activatedAt }).eq("id", matchingKey.id);
    if (keyError) return json({ error: keyError.message }, 500);
    const { error: centreError } = await admin.from("centres").update({ activated_at: activatedAt, updated_at: activatedAt }).eq("id", centreId);
    if (centreError) return json({ error: centreError.message }, 500);
    return json({ ok: true, activated_at: activatedAt });
  }

  if (action === "list") {
    const { data, error } = await admin.from("centres").select("*, centre_licences(*), drive_connections(*), centre_memberships(user_id, role), activation_keys(id, centre_id, key_value, generated_by, generated_at, redeemed_by, redeemed_at, expires_at, revoked_at)").order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    const users = await admin.auth.admin.listUsers({ perPage: 1000 });
    const userMap = new Map((users.data.users || []).map((item) => [item.id, item]));
    const { data: coaches } = await admin.from("coaches").select("id,name,photo,slug,status,centre_id");
    const coachMap = new Map((coaches || []).map((coach) => [coach.id, coach]));
    return json({ centres: (data || []).map((item) => ({
      ...item,
      login_url: `${appUrl()}/centre/${encodeURIComponent(item.slug || "")}`,
      activation_keys: (item.activation_keys || []).map((key) => ({
        ...key,
        redeemed_by_email: userMap.get(key.redeemed_by)?.email || "",
      })),
      centre_memberships: [
        ...(item.centre_memberships || []),
        ...(coaches || [])
          .filter((coach) => coach.centre_id === item.id
            && !(item.centre_memberships || []).some((membership) => membership.user_id === coach.id))
          .map((coach) => ({ user_id: coach.id, role: "coach" })),
      ].map((membership) => ({
        ...membership,
        ...(coachMap.get(membership.user_id) || {}),
        email: displayEmail(userMap.get(membership.user_id)?.email),
        name: userMap.get(membership.user_id)?.user_metadata?.full_name || userMap.get(membership.user_id)?.email || "Coach",
      })).filter((membership) => membership.email),
    })) });
  }
  if (action === "create-centre") {
    const name = String(body.name || "").trim();
    const sport = String(body.sport || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const coachName = String(body.coach_name || "").trim();
    if (!name || !sport || !email || !password || !coachName) return json({ error: "Centre name, sport, coach name, email, and password are required" }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);
    const baseSlug = slugify(name);
    let centre: any = null;
    let error: any = null;
    for (let attempt = 0; attempt < 5 && !centre; attempt += 1) {
      const { data: matchingCentres, error: slugError } = await admin.from("centres").select("slug").like("slug", `${baseSlug}%`);
      if (slugError) return json({ error: slugError.message }, 500);
      const taken = new Set((matchingCentres || []).map((item) => item.slug));
      let slug = baseSlug;
      for (let suffix = 2; taken.has(slug); suffix += 1) slug = `${baseSlug}-${suffix}`;
      const result = await admin.from("centres").insert({ name, sport, slug }).select().single();
      centre = result.data;
      error = result.error;
      if (error && !/duplicate key|unique constraint/i.test(error.message || "")) break;
    }
    if (error || !centre) return json({ error: error?.message || "Unable to create centre" }, 500);
    const { data: account, error: accountError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "coach", centre_id: centre.id },
      user_metadata: { full_name: coachName },
    });
    if (accountError || !account.user) {
      await admin.from("centres").delete().eq("id", centre.id);
      return json({ error: accountError?.message || "Unable to create centre login" }, 400);
    }
    const { error: membershipError } = await admin.from("centre_memberships").insert({ centre_id: centre.id, user_id: account.user.id, role: "coach" });
    if (membershipError) {
      await admin.auth.admin.deleteUser(account.user.id);
      await admin.from("centres").delete().eq("id", centre.id);
      return json({ error: membershipError.message }, 500);
    }
    const { error: coachError } = await admin.from("coaches").upsert({
      id: account.user.id,
      name: coachName,
      branch: name,
      branch_address: name,
      email,
      centre_id: centre.id,
    }, { onConflict: "id" });
    if (coachError) {
      await admin.from("centre_memberships").delete().eq("centre_id", centre.id).eq("user_id", account.user.id);
      await admin.auth.admin.deleteUser(account.user.id);
      await admin.from("centres").delete().eq("id", centre.id);
      return json({ error: coachError.message }, 500);
    }
    const { error: licenceError } = await admin.from("centre_licences").insert({ centre_id: centre.id, status: "active", starts_at: new Date().toISOString(), expires_at: new Date(Date.now() + 365 * 86400000).toISOString(), created_by: user.id });
    if (licenceError) {
      await admin.from("centre_memberships").delete().eq("centre_id", centre.id).eq("user_id", account.user.id);
      await admin.auth.admin.deleteUser(account.user.id);
      await admin.from("centres").delete().eq("id", centre.id);
      return json({ error: licenceError.message }, 500);
    }
    const key = randomKey();
    const { error: keyError } = await admin.from("activation_keys").insert({ centre_id: centre.id, key_value: key, key_hash: await hash(key), generated_by: user.id, expires_at: new Date(Date.now() + 365 * 86400000).toISOString() });
    if (keyError) {
      await admin.from("centre_memberships").delete().eq("centre_id", centre.id).eq("user_id", account.user.id);
      await admin.auth.admin.deleteUser(account.user.id);
      await admin.from("centres").delete().eq("id", centre.id);
      return json({ error: keyError.message }, 500);
    }
    await admin.from("audit_logs").insert({ actor_id: user.id, centre_id: centre.id, action: "licence.issued", metadata: { reason: "centre-created" } });
    return json({ centre, activation_key: key, login_url: `${appUrl()}/centre/${centre.slug}` });
  }
  if (action === "update-centre-logo") {
    const centreId = String(body.centre_id || "");
    const logoUrl = String(body.logo_url || "").trim();
    if (!centreId || !logoUrl) return json({ error: "centre_id and logo_url are required" }, 400);
    const { error } = await admin.from("centres").update({ logo_url: logoUrl, updated_at: new Date().toISOString() }).eq("id", centreId);
    if (error) return json({ error: error.message }, 500);
    await admin.from("audit_logs").insert({ actor_id: user.id, centre_id: centreId, action: "centre.logo-updated", metadata: {} });
    return json({ ok: true, logo_url: logoUrl });
  }
  if (action === "delete-centre") {
    const centreId = String(body.centre_id || "");
    if (!centreId) return json({ error: "centre_id is required" }, 400);
    const { data: centre, error: centreLookupError } = await admin.from("centres").select("id,name").eq("id", centreId).maybeSingle();
    if (centreLookupError) return json({ error: centreLookupError.message }, 500);
    if (!centre) return json({ error: "Centre not found" }, 404);
    const { data: memberships, error: membershipsError } = await admin.from("centre_memberships").select("user_id").eq("centre_id", centreId);
    if (membershipsError) return json({ error: membershipsError.message }, 500);
    const { error: deleteError } = await admin.from("centres").delete().eq("id", centreId);
    if (deleteError) return json({ error: deleteError.message }, 500);
    for (const membership of memberships || []) {
      const userId = membership.user_id;
      const { count } = await admin.from("centre_memberships").select("centre_id", { count: "exact", head: true }).eq("user_id", userId);
      if (count !== 0) continue;
      const { data: account } = await admin.auth.admin.getUserById(userId);
      if (account.user?.app_metadata?.centre_id === centreId) {
        await admin.auth.admin.deleteUser(userId);
      }
    }
    return json({ ok: true, centre_id: centreId, name: centre.name });
  }
  if (action === "update-member-role") {
    const centreId = String(body.centre_id || "");
    const userId = String(body.user_id || "");
    const role = body.role === "centre_admin" ? "centre_admin" : "coach";
    if (!centreId || !userId) return json({ error: "centre_id and user_id are required" }, 400);
    const { data: membership, error: membershipError } = await admin.from("centre_memberships")
      .upsert({ centre_id: centreId, user_id: userId, role }, { onConflict: "centre_id,user_id" })
      .select()
      .single();
    if (membershipError || !membership) return json({ error: membershipError?.message || "Centre membership not found" }, 400);
    const { data: target } = await admin.auth.admin.getUserById(userId);
    if (!target.user) return json({ error: "User not found" }, 404);
    const appMetadata = { ...(target.user.app_metadata || {}), role, centre_id: centreId };
    const { error: userError } = await admin.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
    if (userError) return json({ error: userError.message }, 500);
    await admin.from("audit_logs").insert({ actor_id: user.id, centre_id: centreId, action: "membership.role-updated", metadata: { user_id: userId, role } });
    return json({ ok: true, role });
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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeCertificateDesign } from "../_shared/certificate-design.js";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
// Exposed on every response so a deployed coach-aware function is identifiable.
const DRIVE_API_VERSION = "coach-v4-hybrid-drafts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-dao-drive-api-version",
  "x-dao-drive-api-version": DRIVE_API_VERSION,
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

const REPORT_FILE_PROPERTY = "dsmReportId";
const REPORT_KIND_PROPERTY = "dsmReportKind";
const REPORT_SUMMARY_FIELDS = ["whatTaught", "beforeCoaching", "afterTraining", "nextLesson", "remarks"];
const REPORT_FOLDER = "Reports";
const MAX_REPORT_BYTES = 512 * 1024;
const MAX_REPORT_PDF_BASE64 = 24 * 1024 * 1024;

function driveQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function driveJson(accessToken: string, url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${accessToken}`, ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(`Google Drive request failed (${response.status})`);
  return response.json();
}

async function listDriveFiles(accessToken: string, query: string, fields: string) {
  const files = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: query,
      fields: `nextPageToken,files(${fields})`,
      pageSize: "1000",
      spaces: "drive",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const result = await driveJson(accessToken, `https://www.googleapis.com/drive/v3/files?${params}`);
    files.push(...(Array.isArray(result.files) ? result.files : []));
    pageToken = result.nextPageToken || "";
  } while (pageToken);
  return files;
}

async function findOrCreateFolder(accessToken: string, parentId: string, name: string) {
  const query = `'${driveQueryValue(parentId)}' in parents and name = '${driveQueryValue(name)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const matches = await listDriveFiles(accessToken, query, "id,name,createdTime");
  if (matches.length > 1) {
    // A previous OAuth retry can leave duplicate managed folders behind. Keep
    // the oldest folder as canonical so existing records remain discoverable;
    // never delete or move user data implicitly during a report request.
    matches.sort((left, right) => {
      const byCreated = String(left.createdTime || "").localeCompare(String(right.createdTime || ""));
      return byCreated || String(left.id || "").localeCompare(String(right.id || ""));
    });
  }
  if (matches.length >= 1) return String(matches[0].id);
  const created = await driveJson(accessToken, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!created.id) throw new Error("Google Drive folder creation failed");
  return String(created.id);
}

async function getReportFolders(accessToken: string, rootFolderId: string, includeExports = false) {
  if (!rootFolderId || rootFolderId === "pending") throw new Error("Google Drive root folder is unavailable");
  const reportsId = await findOrCreateFolder(accessToken, rootFolderId, REPORT_FOLDER);
  const [recordsId, exportsId] = await Promise.all([
    findOrCreateFolder(accessToken, reportsId, "Records"),
    includeExports ? findOrCreateFolder(accessToken, reportsId, "Exports") : Promise.resolve(""),
  ]);
  return { recordsId, exportsId };
}

function normalizeReportRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid report record");
  const source = value as Record<string, unknown>;
  if (source.schemaVersion !== 1) throw new Error("Unsupported report schema version");
  const recordType = source.recordType;
  if (recordType !== "draft" && recordType !== "report") throw new Error("Invalid report record type");
  const id = String(source.id || "");
  if (!/^(draft|report)-[A-Za-z0-9-]+$/.test(id) || !id.startsWith(`${recordType === "draft" ? "draft" : "report"}-`)) {
    throw new Error("Invalid report identifier");
  }
  const coachId = String(source.coachId || "");
  const studentId = String(source.studentId || "");
  if (!coachId || coachId.length > 128 || studentId.length > 128) throw new Error("Invalid report owner");
  const allowedFields = recordType === "draft"
    ? ["id", "ref", "coachId", "studentId", "date", "time", "lessonNumber", "step", "status", "summary", "certificateDesign"]
    : ["id", "ref", "coachId", "studentId", "lessonLabel", "lessonNumber", "date", "time", "status", "generatedAt", "summary", "certificateDesign"];
  const record: Record<string, unknown> = {};
  for (const field of allowedFields) if (field in source) record[field] = source[field];
  const summarySource = source.summary && typeof source.summary === "object" && !Array.isArray(source.summary)
    ? source.summary as Record<string, unknown>
    : {};
  const summary = Object.fromEntries(REPORT_SUMMARY_FIELDS.map(field => {
    const text = String(summarySource[field] || "");
    if (text.length > 8000) throw new Error("Report summary field is too long");
    return [field, text];
  }));
  record.schemaVersion = 1;
  record.recordType = recordType;
  record.id = id;
  record.coachId = coachId;
  record.studentId = studentId;
  record.ref = String(source.ref || "").slice(0, 80);
  record.date = String(source.date || "").slice(0, 10);
  record.time = String(source.time || "").slice(0, 12);
  record.lessonNumber = Number.isFinite(Number(source.lessonNumber)) && source.lessonNumber !== "" ? Number(source.lessonNumber) : "";
  record.summary = summary;
  if (source.certificateDesign != null) record.certificateDesign = normalizeCertificateDesign(source.certificateDesign);
  if (recordType === "draft") {
    record.step = Math.min(4, Math.max(1, Number.parseInt(String(source.step || 1), 10) || 1));
    record.status = "Pending";
  } else {
    if (!studentId) throw new Error("A finalized report requires a student");
    record.lessonLabel = String(source.lessonLabel || "").slice(0, 80);
    record.status = "Generated";
    record.generatedAt = String(source.generatedAt || "").slice(0, 64);
  }
  if (new TextEncoder().encode(JSON.stringify(record)).length > MAX_REPORT_BYTES) throw new Error("Report record is too large");
  return record;
}

function stableRecord(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableRecord).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableRecord(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

async function reportFiles(accessToken: string, recordsId: string, recordId: string, recordType?: string) {
  const query = `'${driveQueryValue(recordsId)}' in parents and appProperties has { key='${REPORT_FILE_PROPERTY}' and value='${driveQueryValue(recordId)}' } and trashed = false`;
  const files = await listDriveFiles(accessToken, query, "id,name,mimeType,appProperties,parents");
  const matches = recordType ? files.filter(file => file.appProperties?.[REPORT_KIND_PROPERTY] === recordType) : files;
  if (matches.length > 1) throw new Error("Multiple Drive files match this report");
  return matches[0] || null;
}

async function saveDriveMedia(accessToken: string, existingId: string | null, metadata: Record<string, unknown>, bytes: Uint8Array, mimeType: string) {
  if (existingId) delete metadata.parents;
  const boundary = `dsm-${crypto.randomUUID()}`;
  const url = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingId)}?uploadType=multipart&fields=id`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id";
  return driveJson(accessToken, url, {
    method: existingId ? "PATCH" : "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body: multipartBody(metadata, bytes, mimeType, boundary),
  });
}

async function readDriveJson(accessToken: string, fileId: string) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Google Drive report read failed (${response.status})`);
  const text = await response.text();
  if (new TextEncoder().encode(text).length > MAX_REPORT_BYTES) throw new Error("Report record is too large");
  return JSON.parse(text);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

async function listReportRecords(accessToken: string, recordsId: string) {
  const files = await listDriveFiles(
    accessToken,
    `'${driveQueryValue(recordsId)}' in parents and mimeType = 'application/json' and trashed = false`,
    "id,name,mimeType,appProperties,parents",
  );
  // Bound reads even when a coach has hundreds of report files. Coach Drives
  // use four workers below, keeping media requests bounded to 24 per request.
  return (await mapWithConcurrency(files, 6, async file => {
    if (!file.appProperties?.[REPORT_FILE_PROPERTY]) return null;
    const record = normalizeReportRecord(await readDriveJson(accessToken, String(file.id)));
    if (record.id !== file.appProperties[REPORT_FILE_PROPERTY]) throw new Error("Drive report identity does not match its record");
    return record;
  })).filter(Boolean);
}

// Only the Edge Function's service-role client can read encrypted tokens.
const PUBLIC_CONNECTION_FIELDS = "coach_id,centre_id,google_account_email,root_folder_id,root_folder_name,root_folder_url,token_expires_at,status,last_error,last_successful_sync_at,connected_at,updated_at";

async function membershipRole(centreId: string, userId: string) {
  const { data, error } = await admin.from("centre_memberships").select("role")
    .eq("centre_id", centreId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Unable to verify centre membership");
  return ["coach", "centre_admin"].includes(data?.role || "") ? data!.role as string : "";
}

async function connectedCoachRows(centreId: string) {
  const [{ data: memberships, error: memberError }, { data: connections, error: connectionError }] = await Promise.all([
    admin.from("centre_memberships").select("user_id,role").eq("centre_id", centreId).eq("role", "coach"),
    admin.from("coach_drive_connections").select("coach_id,centre_id,root_folder_id,encrypted_refresh_token,status")
      .eq("centre_id", centreId).eq("status", "connected"),
  ]);
  if (memberError || connectionError) throw new Error("Unable to load connected coach accounts");
  const eligible = new Set((memberships || []).map(m => String(m.user_id)));
  return (connections || []).filter(row => eligible.has(String(row.coach_id)) && row.encrypted_refresh_token && row.root_folder_id);
}

async function connectionAccess(row: { encrypted_refresh_token: string; root_folder_id: string }) {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const secret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const key = Deno.env.get("DRIVE_TOKEN_ENCRYPTION_KEY");
  if (!clientId || !secret || !key) throw new Error("Drive OAuth is not configured");
  const refreshToken = await decryptRefreshToken(row.encrypted_refresh_token, key);
  const token = await getDriveAccessToken(refreshToken, clientId, secret);
  const folders = await getReportFolders(token.access_token, row.root_folder_id);
  return { accessToken: token.access_token as string, ...folders };
}

async function hashNonce(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function driveAccountEmail(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("Unable to verify the connected Google account");
  const profile = await response.json();
  if (!profile.email || !profile.email_verified) throw new Error("Google account email is not verified");
  return String(profile.email).trim().toLowerCase();
}

export async function handleDriveRequest(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Use POST for Google Drive actions" }, 405);
  const authorization = request.headers.get("authorization") || "";
  const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
  if (!token) return json({ error: "Authentication required" }, 401);
  // Retain explicit Auth verification even when invoked directly in tests or
  // from a deployment whose platform settings differ from config.toml.
  let user;
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return json({ error: "Sign in again before connecting Google Drive" }, 401);
    user = data.user;
  } catch {
    return json({ error: "Unable to verify your sign-in session" }, 503);
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 32 * 1024 * 1024) return json({ error: "Request is too large" }, 413);
  const metadataCentreId = String(user?.app_metadata?.centre_id || "");
  const role = user?.app_metadata?.role;
  let body: Record<string, unknown>;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > 32 * 1024 * 1024) return json({ error: "Request is too large" }, 413);
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "Invalid request" }, 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const action = String(body.action || "");
  // Coach roles and centre IDs are resolved from the verified membership table.
  // Google-created coach accounts may not have app_metadata.centre_id/role yet.
  let centreId = String(body.centre_id || "") || metadataCentreId;
  if (!centreId && action === "callback") centreId = String(body.state || "").split("|")[0];
  if (!centreId && user && role !== "admin" && role !== "dev") {
    const { data: memberships, error: membershipsError } = await admin.from("centre_memberships")
      .select("centre_id").eq("user_id", user.id).limit(2);
    if (membershipsError) return json({ error: "Unable to resolve coach centre" }, 500);
    if (memberships?.length === 1) centreId = memberships[0].centre_id;
  }
  if (action === "connection-status") {
    if (!user || !centreId) return json({ error: "Centre membership required" }, 403);
    try {
      const membership = await membershipRole(centreId, user.id);
      if (!membership) return json({ error: "Centre membership required" }, 403);
      if (membership === "coach") {
        const { data, error } = await admin.from("coach_drive_connections").select(PUBLIC_CONNECTION_FIELDS)
          .eq("centre_id", centreId).eq("coach_id", user.id).maybeSingle();
        if (error) throw error;
        return json({ connection: data || null });
      }
      const { data, error } = await admin.from("coach_drive_connections").select("coach_id,status")
        .eq("centre_id", centreId).eq("status", "connected");
      if (error) throw error;
      const connected = await connectedCoachRows(centreId);
      const approved = new Set(connected.map(item => item.coach_id));
      return json({ connected_coach_ids: (data || []).map(item => item.coach_id).filter(id => approved.has(id)), source_roots: Object.fromEntries(connected.map(item => [item.coach_id, item.root_folder_id])) });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Unable to load Drive status" }, 500);
    }
  }
  if (action === "admin-report-context") {
    if (!user || role !== "admin") return json({ error: "Global admin role required" }, 403);
    const requestedCentreId = String(body.centre_id || "");
    if (!requestedCentreId) {
      const [{ data: centres, error: centresError }, { data: connections, error: connectionsError }] = await Promise.all([
        admin.from("centres").select("id,name,status").order("name"),
        admin.from("coach_drive_connections").select("centre_id,encrypted_refresh_token,status").eq("status", "connected"),
      ]);
      if (centresError || connectionsError) return json({ error: "Unable to load report workspaces" }, 500);
      const eligibleIds = new Set((connections || []).filter(item => item.encrypted_refresh_token).map(item => item.centre_id));
      return json({ centres: (centres || []).filter(item => item.status === "active" && eligibleIds.has(item.id)).map(({ id, name }) => ({ id, name })) });
    }
    const [{ data: centre, error: centreError }, { data: members, error: memberError }] = await Promise.all([
      admin.from("centres").select("id,name,status").eq("id", requestedCentreId).maybeSingle(),
      admin.from("centre_memberships").select("user_id").eq("centre_id", requestedCentreId).eq("role", "coach"),
    ]);
    if (centreError || memberError || !centre || centre.status !== "active") return json({ error: "Unable to load this centre" }, 409);
    const connected = await connectedCoachRows(requestedCentreId);
    const connectedIds = new Set(connected.map(item => item.coach_id));
    const coachIds = (members || []).map(member => member.user_id);
    if (!coachIds.length) return json({ centre, coaches: [], students: [], connected_coach_ids: [] });
    const [{ data: coaches, error: coachesError }, { data: students, error: studentsError }] = await Promise.all([
      admin.from("coaches").select("id,name,branch,centre_contact,branch_address,photo,links,report_layout").in("id", coachIds),
      admin.from("students").select("id,name,coach_id,lessons,photo").in("coach_id", coachIds),
    ]);
    if (coachesError || studentsError) return json({ error: "Unable to load report participants" }, 500);
    return json({ centre: { id: centre.id, name: centre.name }, coaches: coaches || [], students: students || [], connected_coach_ids: [...connectedIds] });
  }
  const reportActions = new Set(["report-list", "report-save", "report-pdf", "report-template-capabilities"]);
  const isReportAction = reportActions.has(action);
  if (isReportAction) {
    const requestedCentreId = String(body.centre_id || centreId || "");
    if (!user || !requestedCentreId) return json({ error: "Centre membership required" }, 403);
    let actorRole = role;
    if (role !== "admin") {
      const { data: membership, error: membershipError } = await admin
        .from("centre_memberships")
        .select("role")
        .eq("centre_id", requestedCentreId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (membershipError) return json({ error: "Unable to verify centre membership" }, 500);
      if (!membership || !["coach", "centre_admin"].includes(membership.role)) {
        return json({ error: "Centre membership required" }, 403);
      }
      actorRole = membership.role;
    }
    if (action === "report-template-capabilities") return json({ certificateDesignVersion: 1, hybridDraftVersion: 1 });
    if (action === "report-list") {
      try {
        const allConnections = await connectedCoachRows(requestedCentreId);
        const connections = actorRole === "coach" ? allConnections.filter(row => row.coach_id === user.id) : allConnections;
        if (actorRole === "coach" && connections.length === 0) return json({ error: "Connect your Google Drive to view or create your reports" }, 409);
        const results: Record<string, unknown>[] = [];
        const warnings: string[] = [];
        let successfulConnections = 0;
        // Refill each free slot immediately; a slow coach must not hold the
        // next batch of accounts until its entire batch has completed.
        await mapWithConcurrency(connections, 4, async owner => {
            try {
              const { accessToken, recordsId } = await connectionAccess(owner);
              const [records, studentResult] = await Promise.all([
                listReportRecords(accessToken, recordsId),
                admin.from("students").select("id,centre_id").eq("coach_id", owner.coach_id),
              ]);
              if (studentResult.error) throw new Error("Unable to validate report student ownership");
              const eligibleStudents = new Set((studentResult.data || [])
                .filter(student => !student.centre_id || student.centre_id === requestedCentreId)
                .map(student => String(student.id)));
              const finalizedIds = new Set(records.filter(record => record.recordType === "report").map(record => String(record.id)));
              for (const record of records) {
                if (record.coachId !== owner.coach_id) throw new Error("Drive record has a mismatched coach owner");
                if (record.studentId && !eligibleStudents.has(String(record.studentId))) {
                  warnings.push("One coach's Drive contains a report for a student not assigned to that coach");
                  continue;
                }
                if (record.recordType === "draft" && finalizedIds.has(`report-${String(record.id).slice(6)}`)) continue;
                results.push(record);
              }
              successfulConnections += 1;
            } catch (error) {
              // Do not silently claim a complete view if one coach's account fails.
              warnings.push(`One coach's Drive could not be loaded (${error instanceof Error ? error.message : "unknown error"})`);
            }
        });
        if (warnings.length && !successfulConnections) return json({ error: warnings.join("; ") }, 502);
        return json({ records: results, warnings, connected_coach_ids: connections.map(row => row.coach_id), source_roots: Object.fromEntries(connections.map(row => [row.coach_id, row.root_folder_id])) });
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Unable to load coach reports" }, 502);
      }
    }
    // Route both saves and PDF derivatives to the report's own coach account.
    let ownerId = "";
    if (action === "report-save") {
      try {
        ownerId = String(normalizeReportRecord(body.record).coachId);
      } catch {
        return json({ error: "Invalid report record" }, 400);
      }
    } else {
      ownerId = String(body.coach_id || "");
    }
    if (!ownerId || (actorRole === "coach" && ownerId !== user.id)) return json({ error: "Invalid report coach" }, 403);
    try {
      if (await membershipRole(requestedCentreId, ownerId) !== "coach") return json({ error: "Report coach is not in this centre" }, 403);
    } catch {
      return json({ error: "Unable to verify report coach" }, 500);
    }
    const { data: connection, error: connectionError } = await admin.from("coach_drive_connections")
      .select("coach_id,centre_id,root_folder_id,encrypted_refresh_token,status")
      .eq("centre_id", requestedCentreId).eq("coach_id", ownerId).maybeSingle();
    if (connectionError) return json({ error: "Unable to load coach Drive connection" }, 500);
    if (!connection || connection.status !== "connected" || !connection.encrypted_refresh_token) {
      return json({ error: "This coach has not connected Google Drive" }, 409);
    }
    if (body.hybrid_draft) {
      const hybrid = body.hybrid_draft;
      if (action !== "report-save" || hybrid.version !== 1 || hybrid.actor_id !== user.id || body.record?.recordType !== "draft") {
        return json({ error: "Invalid local draft sync context" }, 403);
      }
      if (hybrid.root_folder_id !== connection.root_folder_id) {
        return json({ error: "Drive account changed: save a copy to the current Drive", code: "DRIVE_SOURCE_CHANGED" }, 409);
      }
    }
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const encryptionKey = Deno.env.get("DRIVE_TOKEN_ENCRYPTION_KEY");
    if (!clientId || !clientSecret || !encryptionKey) return json({ error: "Drive OAuth is not configured" }, 503);
    try {
      const refreshToken = await decryptRefreshToken(connection.encrypted_refresh_token, encryptionKey);
      const tokens = await getDriveAccessToken(refreshToken, clientId, clientSecret);
      const { recordsId, exportsId } = await getReportFolders(tokens.access_token, connection.root_folder_id, action === "report-pdf");
      if (action === "report-save") {
        let record: Record<string, unknown>;
        try {
          record = normalizeReportRecord(body.record);
        } catch {
          return json({ error: "Invalid report record" }, 400);
        }
        if (actorRole === "coach" && record.coachId !== user.id) return json({ error: "Coaches may only save their own reports" }, 403);
        const { data: coachMembership, error: coachError } = await admin
          .from("centre_memberships")
          .select("role")
          .eq("centre_id", requestedCentreId)
          .eq("user_id", record.coachId)
          .maybeSingle();
        if (coachError) return json({ error: "Unable to verify report coach" }, 500);
        if (!coachMembership || !["coach", "centre_admin"].includes(coachMembership.role)) return json({ error: "Report coach is not part of this centre" }, 403);
        if (record.studentId) {
          const { data: student, error: studentError } = await admin
            .from("students")
            .select("id,coach_id,centre_id")
            .eq("id", record.studentId)
            .maybeSingle();
          if (studentError) return json({ error: "Unable to verify report student" }, 500);
          if (!student || student.coach_id !== record.coachId || (student.centre_id && student.centre_id !== requestedCentreId)) {
            return json({ error: "Report student is not part of this centre and coach" }, 403);
          }
        }
        if (body.hybrid_draft) {
          const finalized = await reportFiles(tokens.access_token, recordsId, `report-${String(record.id).slice(6)}`, "report");
          if (finalized) return json({ error: "Draft conflict: this draft was already generated. Save local edits as a copy.", code: "DRAFT_CONFLICT" }, 409);
        }
        const existing = await reportFiles(tokens.access_token, recordsId, String(record.id), String(record.recordType));
        if (existing) {
          const saved = normalizeReportRecord(await readDriveJson(tokens.access_token, String(existing.id)));
          if (saved.coachId !== record.coachId || (saved.studentId && saved.studentId !== record.studentId)) {
            return json({ error: "Report identifier is already owned by a different record" }, 409);
          }
          if (body.hybrid_draft) {
            // A lost response may be retried after the exact content was saved.
            if (stableRecord(saved) === stableRecord(record)) return json({ record: saved, file_id: existing.id });
            let base;
            try { base = body.hybrid_draft.base_record ? normalizeReportRecord(body.hybrid_draft.base_record) : null; }
            catch { return json({ error: "Invalid draft sync baseline" }, 400); }
            if (!base || base.id !== record.id || stableRecord(base) !== stableRecord(saved)) {
              return json({ error: "Draft conflict: Google Drive has a different version. Keep your edits by saving a copy.", code: "DRAFT_CONFLICT" }, 409);
            }
          }
        } else if (body.hybrid_draft?.base_record) {
          return json({ error: "Draft conflict: the Drive draft was removed or finalized. Save your local edits as a copy.", code: "DRAFT_CONFLICT" }, 409);
        }
        if (record.recordType === "report" && body.draft_id) {
          const draftId = String(body.draft_id);
          if (!/^draft-[A-Za-z0-9-]+$/.test(draftId)) return json({ error: "Invalid draft identifier" }, 400);
          const draftFile = await reportFiles(tokens.access_token, recordsId, draftId, "draft");
          if (!draftFile) {
            // A prior finalize may have saved the report and deleted the draft
            // before its response was lost. Accept that exact retry only.
            if (existing && record.id === `report-${draftId.slice("draft-".length)}`) {
              const savedReport = normalizeReportRecord(await readDriveJson(tokens.access_token, String(existing.id)));
              if (savedReport.recordType === "report" && savedReport.coachId === record.coachId && savedReport.studentId === record.studentId) {
                return json({ record: savedReport, file_id: existing.id });
              }
            }
            return json({ error: "The report draft could not be found" }, 409);
          }
          const draftRecord = normalizeReportRecord(await readDriveJson(tokens.access_token, String(draftFile.id)));
          if (draftRecord.coachId !== record.coachId || draftRecord.studentId !== record.studentId || record.id !== `report-${draftId.slice("draft-".length)}` || (actorRole === "coach" && draftRecord.coachId !== user.id)) {
            return json({ error: "Report draft does not belong to this coach" }, 403);
          }
          const saved = await saveDriveMedia(
            tokens.access_token,
            existing ? String(existing.id) : null,
            {
              name: `${record.id}.json`,
              parents: [recordsId],
              mimeType: "application/json",
              appProperties: { [REPORT_FILE_PROPERTY]: record.id, [REPORT_KIND_PROPERTY]: record.recordType },
            },
            new TextEncoder().encode(JSON.stringify(record)),
            "application/json",
          );
          await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(String(draftFile.id))}`, {
            method: "DELETE",
            headers: { authorization: `Bearer ${tokens.access_token}` },
          });
          await admin.from("coach_drive_connections").update({ last_successful_sync_at: new Date().toISOString(), last_error: null }).eq("centre_id", requestedCentreId).eq("coach_id", ownerId);
          return json({ record, file_id: saved.id });
        }
        const saved = await saveDriveMedia(
          tokens.access_token,
          existing ? String(existing.id) : null,
          {
            name: `${record.id}.json`,
            parents: [recordsId],
            mimeType: "application/json",
            appProperties: { [REPORT_FILE_PROPERTY]: record.id, [REPORT_KIND_PROPERTY]: record.recordType },
          },
          new TextEncoder().encode(JSON.stringify(record)),
          "application/json",
        );
        await admin.from("coach_drive_connections").update({ last_successful_sync_at: new Date().toISOString(), last_error: null }).eq("centre_id", requestedCentreId).eq("coach_id", ownerId);
        return json({ record, file_id: saved.id });
      }

      const reportId = String(body.report_id || "");
      if (!/^report-[A-Za-z0-9-]+$/.test(reportId)) return json({ error: "Invalid report identifier" }, 400);
      const reportFile = await reportFiles(tokens.access_token, recordsId, reportId, "report");
      if (!reportFile) return json({ error: "Report not found in this centre" }, 404);
      const report = normalizeReportRecord(await readDriveJson(tokens.access_token, String(reportFile.id)));
      if (report.coachId !== ownerId) return json({ error: "Report is not owned by the selected coach" }, 403);
      const encodedFile = String(body.file_base64 || "");
      if (!encodedFile.startsWith("data:application/pdf;base64,") || encodedFile.length > MAX_REPORT_PDF_BASE64) {
        return json({ error: "A valid PDF export is required" }, 413);
      }
      const bytes = Uint8Array.from(atob(encodedFile.slice("data:application/pdf;base64,".length)), character => character.charCodeAt(0));
      const query = `'${driveQueryValue(exportsId)}' in parents and appProperties has { key='${REPORT_FILE_PROPERTY}' and value='${driveQueryValue(reportId)}' } and appProperties has { key='${REPORT_KIND_PROPERTY}' and value='pdf' } and trashed = false`;
      const pdfMatches = await listDriveFiles(tokens.access_token, query, "id,name,mimeType,appProperties");
      if (pdfMatches.length > 1) return json({ error: "Multiple PDF files match this report" }, 409);
      const saved = await saveDriveMedia(
        tokens.access_token,
        pdfMatches[0] ? String(pdfMatches[0].id) : null,
        {
          name: `${reportId}.pdf`,
          parents: [exportsId],
          mimeType: "application/pdf",
          appProperties: { [REPORT_FILE_PROPERTY]: reportId, [REPORT_KIND_PROPERTY]: "pdf" },
        },
        bytes,
        "application/pdf",
      );
      await admin.from("coach_drive_connections").update({ last_successful_sync_at: new Date().toISOString(), last_error: null }).eq("centre_id", requestedCentreId).eq("coach_id", ownerId);
      return json({ ok: true, file_id: saved.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google Drive report operation failed";
      return json({ error: message }, 502);
    }
  }
  if (action === "sync-report") return json({ error: "Report sync has moved to the Drive report repository. Refresh the app and retry." }, 410);
  if (!user || !centreId) return json({ error: "Coach centre membership required" }, 403);
  let verifiedRole = "";
  try { verifiedRole = await membershipRole(centreId, user.id); }
  catch { return json({ error: "Unable to verify coach membership" }, 500); }
  if (verifiedRole !== "coach") return json({ error: "Active coach membership required" }, 403);
  if (action === "disconnect") {
    const { error } = await admin.from("coach_drive_connections")
      .update({ status: "disconnected", encrypted_refresh_token: null }).eq("centre_id", centreId).eq("coach_id", user.id);
    if (error) return json({ error: "Unable to disconnect coach Google Drive" }, 500);
    await admin.from("audit_logs").insert({ actor_id: user.id, centre_id: centreId, action: "coach_drive.disconnected", metadata: {} });
    return json({ ok: true });
  }
  if (action === "callback") {
    const code = String(body.code || "");
    const stateValue = String(body.state || "");
    const match = /^([a-f0-9-]{36})\|([a-z0-9-]+)\|([a-f0-9-]{72})$/.exec(stateValue);
    if (!code || !match || match[1] !== centreId) return json({ error: "Invalid Google OAuth callback state" }, 400);
    const stateHash = await hashNonce(match[3]);
    // Atomically consume the state before exchanging the code; a state cannot be replayed.
    const { data: pending, error: stateError } = await admin.from("coach_drive_oauth_states")
      .delete().eq("nonce_hash", stateHash).eq("centre_id", centreId)
      .eq("user_id", user.id).gt("expires_at", new Date().toISOString()).select("nonce_hash").maybeSingle();
    if (stateError || !pending) return json({ error: "Google authorization expired or belongs to a different coach" }, 403);
    const { data: centre, error: centreError } = await admin.from("centres")
      .select("name,slug,status").eq("id", centreId).maybeSingle();
    if (centreError || !centre || centre.status !== "active" || centre.slug !== match[2]) {
      return json({ error: "Centre authorization context no longer matches" }, 403);
    }
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");
    const encryptionKey = Deno.env.get("DRIVE_TOKEN_ENCRYPTION_KEY");
    if (!clientId || !clientSecret || !redirectUri || !encryptionKey) return json({ error: "Drive OAuth is not configured" }, 503);
    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
      });
      const tokens = await response.json();
      if (!response.ok || !tokens.access_token) return json({ error: "Google token exchange failed. Please reconnect." }, 502);
      const accountEmail = await driveAccountEmail(tokens.access_token);
      const { data: existing } = await admin.from("coach_drive_connections")
        .select("google_account_email,root_folder_id,root_folder_name,root_folder_url,encrypted_refresh_token")
        .eq("coach_id", user.id).maybeSingle();
      // Google may omit a new refresh token on a repeat authorization. Reuse
      // the stored token only after verifying it is the SAME Google account.
      let sealed = "";
      if (typeof tokens.refresh_token === "string" && tokens.refresh_token) {
        const key = await crypto.subtle.importKey("raw", Uint8Array.from(atob(encryptionKey), c => c.charCodeAt(0)), "AES-GCM", false, ["encrypt"]);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const sealedBytes = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(tokens.refresh_token)));
        sealed = `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...sealedBytes))}`;
      } else if (existing?.google_account_email?.toLowerCase() === accountEmail && existing.encrypted_refresh_token) {
        sealed = existing.encrypted_refresh_token;
      } else {
        return json({ error: "Google did not grant offline access. Reconnect and approve the requested access." }, 409);
      }
      const { data: coach } = await admin.from("coaches").select("name").eq("id", user.id).maybeSingle();
      const folderName = `Dao Sports Method - ${centre.name} - ${coach?.name || "Coach"}`.slice(0, 180);
      let rootFolderId = "";
      let rootFolderUrl = "";
      let rootFolderName = folderName;
      if (existing?.google_account_email?.toLowerCase() === accountEmail && existing.root_folder_id && existing.root_folder_id !== "pending") {
        // Reconnecting the same Google account preserves its existing reports.
        try {
          await driveJson(tokens.access_token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(existing.root_folder_id)}?fields=id`);
          rootFolderId = existing.root_folder_id;
          rootFolderUrl = existing.root_folder_url;
          rootFolderName = existing.root_folder_name;
        } catch { /* Folder was removed; start a new managed root. */ }
      }
      if (!rootFolderId) {
        const folder = await driveJson(tokens.access_token, "https://www.googleapis.com/drive/v3/files?fields=id", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: folderName, mimeType: "application/vnd.google-apps.folder" }),
        });
        if (!folder.id) return json({ error: "Unable to create coach Google Drive folder" }, 502);
        rootFolderId = String(folder.id);
        rootFolderUrl = `https://drive.google.com/drive/folders/${encodeURIComponent(rootFolderId)}`;
      }
      const { data: connection, error: connectionError } = await admin.from("coach_drive_connections")
        .upsert({ coach_id: user.id, centre_id: centreId, google_account_email: accountEmail,
          root_folder_id: rootFolderId, root_folder_url: rootFolderUrl, root_folder_name: rootFolderName,
          encrypted_refresh_token: sealed, status: "connected", last_error: null,
          token_expires_at: tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString() : null })
        .select(PUBLIC_CONNECTION_FIELDS).single();
      if (connectionError || !connection) return json({ error: connectionError?.message || "Unable to save coach Drive connection" }, 500);
      await admin.from("audit_logs").insert({ actor_id: user.id, centre_id: centreId, action: "coach_drive.connected", metadata: {} });
      return json({ ok: true, connection });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Unable to connect Google Drive" }, 502);
    }
  }
  if (action !== "connect") return json({ error: "Unknown coach Drive action" }, 400);
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");
  if (!clientId || !redirectUri || !Deno.env.get("GOOGLE_CLIENT_SECRET") || !Deno.env.get("DRIVE_TOKEN_ENCRYPTION_KEY")) {
    return json({ error: "Drive OAuth is not configured" }, 503);
  }
  const { data: centre, error: centreError } = await admin.from("centres")
    .select("slug,status").eq("id", centreId).maybeSingle();
  if (centreError || !centre || centre.status !== "active" || !centre.slug) return json({ error: "Centre is unavailable" }, 403);
  const nonce = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const { error: pendingError } = await admin.from("coach_drive_oauth_states")
    .insert({ nonce_hash: await hashNonce(nonce), user_id: user.id, centre_id: centreId,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  if (pendingError) return json({ error: "Unable to start Drive authorization" }, 500);
  const authorizationUrl = new URL(Deno.env.get("GOOGLE_OAUTH_AUTHORIZE_URL") || "https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("prompt", "consent");
  authorizationUrl.searchParams.set("scope", "https://www.googleapis.com/auth/drive.file openid email");
  authorizationUrl.searchParams.set("state", `${centreId}|${centre.slug}|${nonce}`);
  return json({ authorization_url: authorizationUrl.toString() });
}

Deno.serve(handleDriveRequest);

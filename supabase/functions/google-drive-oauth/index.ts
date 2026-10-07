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
  const matches = await listDriveFiles(accessToken, query, "id,name");
  if (matches.length > 1) throw new Error("Google Drive report folder is ambiguous");
  if (matches.length === 1) return String(matches[0].id);
  const created = await driveJson(accessToken, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!created.id) throw new Error("Google Drive folder creation failed");
  return String(created.id);
}

async function getReportFolders(accessToken: string, rootFolderId: string) {
  if (!rootFolderId || rootFolderId === "pending") throw new Error("Google Drive root folder is unavailable");
  const reportsId = await findOrCreateFolder(accessToken, rootFolderId, REPORT_FOLDER);
  const [recordsId, exportsId] = await Promise.all([
    findOrCreateFolder(accessToken, reportsId, "Records"),
    findOrCreateFolder(accessToken, reportsId, "Exports"),
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
    ? ["id", "ref", "coachId", "studentId", "date", "time", "lessonNumber", "step", "status", "summary"]
    : ["id", "ref", "coachId", "studentId", "lessonLabel", "lessonNumber", "date", "time", "status", "generatedAt", "summary"];
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

async function listReportRecords(accessToken: string, recordsId: string) {
  const files = await listDriveFiles(
    accessToken,
    `'${driveQueryValue(recordsId)}' in parents and mimeType = 'application/json' and trashed = false`,
    "id,name,mimeType,appProperties,parents",
  );
  const records = [];
  for (const file of files) {
    if (!file.appProperties?.[REPORT_FILE_PROPERTY]) continue;
    const record = normalizeReportRecord(await readDriveJson(accessToken, String(file.id)));
    if (record.id !== file.appProperties[REPORT_FILE_PROPERTY]) throw new Error("Drive report identity does not match its record");
    records.push(record);
  }
  return records;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Authentication required" }, 401);
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData.user;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 32 * 1024 * 1024) return json({ error: "Request is too large" }, 413);
  const centreId = user?.app_metadata?.centre_id;
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
  const reportActions = new Set(["report-list", "report-save", "report-pdf"]);
  const isReportAction = reportActions.has(action);
  if (isReportAction) {
    const requestedCentreId = String(body.centre_id || centreId || "");
    if (!user || !requestedCentreId) return json({ error: "Centre membership required" }, 403);
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
    const { data: connection, error: connectionError } = await admin
      .from("drive_connections")
      .select("centre_id,root_folder_id,encrypted_refresh_token,status")
      .eq("centre_id", requestedCentreId)
      .maybeSingle();
    if (connectionError) return json({ error: "Unable to load the centre Drive connection" }, 500);
    if (!connection || connection.status !== "connected" || !connection.encrypted_refresh_token) {
      return json({ error: "Google Drive is not connected for this centre" }, 409);
    }
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const encryptionKey = Deno.env.get("DRIVE_TOKEN_ENCRYPTION_KEY");
    if (!clientId || !clientSecret || !encryptionKey) return json({ error: "Drive OAuth is not configured" }, 503);
    try {
      const refreshToken = await decryptRefreshToken(connection.encrypted_refresh_token, encryptionKey);
      const tokens = await getDriveAccessToken(refreshToken, clientId, clientSecret);
      const { recordsId, exportsId } = await getReportFolders(tokens.access_token, connection.root_folder_id);
      if (action === "report-list") {
        let records = await listReportRecords(tokens.access_token, recordsId);
        const finalizedIds = new Set(records.filter(record => record.recordType === "report").map(record => record.id));
        const orphanedDrafts = records.filter(record => record.recordType === "draft" && finalizedIds.has(`report-${record.id.slice("draft-".length)}`));
        for (const draft of orphanedDrafts) {
          const draftFile = await reportFiles(tokens.access_token, recordsId, draft.id, "draft");
          if (draftFile) {
            try {
              await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(String(draftFile.id))}`, {
                method: "DELETE",
                headers: { authorization: `Bearer ${tokens.access_token}` },
              });
            } catch {
              // The finalized JSON remains authoritative; a later list can retry cleanup.
            }
          }
        }
        records = records.filter(record => !orphanedDrafts.includes(record));
        if (membership.role === "coach") records = records.filter(record => record.coachId === user.id);
        return json({ records });
      }

      if (action === "report-save") {
        let record: Record<string, unknown>;
        try {
          record = normalizeReportRecord(body.record);
        } catch {
          return json({ error: "Invalid report record" }, 400);
        }
        if (membership.role === "coach" && record.coachId !== user.id) return json({ error: "Coaches may only save their own reports" }, 403);
        const { data: coachMembership, error: coachError } = await admin
          .from("centre_memberships")
          .select("role")
          .eq("centre_id", requestedCentreId)
          .eq("user_id", record.coachId)
          .maybeSingle();
        if (coachError) return json({ error: "Unable to verify report coach" }, 500);
        if (!coachMembership || coachMembership.role !== "coach") return json({ error: "Report coach is not part of this centre" }, 403);
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
        const existing = await reportFiles(tokens.access_token, recordsId, record.id, record.recordType);
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
          if (draftRecord.coachId !== record.coachId || draftRecord.studentId !== record.studentId || record.id !== `report-${draftId.slice("draft-".length)}` || (membership.role === "coach" && draftRecord.coachId !== user.id)) {
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
          await admin.from("drive_connections").update({ last_successful_sync_at: new Date().toISOString(), last_error: null }).eq("centre_id", requestedCentreId);
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
        await admin.from("drive_connections").update({ last_successful_sync_at: new Date().toISOString(), last_error: null }).eq("centre_id", requestedCentreId);
        return json({ record, file_id: saved.id });
      }

      const reportId = String(body.report_id || "");
      if (!/^report-[A-Za-z0-9-]+$/.test(reportId)) return json({ error: "Invalid report identifier" }, 400);
      const reportFile = await reportFiles(tokens.access_token, recordsId, reportId, "report");
      if (!reportFile) return json({ error: "Report not found in this centre" }, 404);
      const report = normalizeReportRecord(await readDriveJson(tokens.access_token, String(reportFile.id)));
      if (membership.role === "coach" && report.coachId !== user.id) return json({ error: "Report not found in this centre" }, 404);
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
      await admin.from("drive_connections").update({ last_successful_sync_at: new Date().toISOString(), last_error: null }).eq("centre_id", requestedCentreId);
      return json({ ok: true, file_id: saved.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google Drive report operation failed";
      return json({ error: message }, 502);
    }
  }
  if (action === "sync-report") return json({ error: "Report sync has moved to the Drive report repository. Refresh the app and retry." }, 410);
  const allowedRoles = ["centre_admin", "dev"];
  if (!user || !centreId || !allowedRoles.includes(role)) return json({ error: "Centre admin role required" }, 403);
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

export const REPORT_SCHEMA_VERSION = 1;

const SUMMARY_FIELDS = [
  "whatTaught",
  "beforeCoaching",
  "afterTraining",
  "nextLesson",
  "remarks"
];

const REPORT_FIELDS = [
  "id",
  "ref",
  "coachId",
  "studentId",
  "lessonLabel",
  "lessonNumber",
  "date",
  "time",
  "status",
  "generatedAt",
  "summary"
];

const DRAFT_FIELDS = [
  "id",
  "ref",
  "coachId",
  "studentId",
  "date",
  "time",
  "lessonNumber",
  "step",
  "status",
  "summary"
];

function boundedString(value, maxLength, field, required = false) {
  if (value == null && !required) return "";
  if (typeof value !== "string" && typeof value !== "number") {
    throw new TypeError(`Invalid report ${field}`);
  }
  const result = String(value);
  if (required && !result.trim()) throw new TypeError(`Missing report ${field}`);
  if (result.length > maxLength) throw new TypeError(`Report ${field} is too long`);
  return result;
}

function normalizeSummary(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  if (source.schemaVersion != null && source.schemaVersion !== REPORT_SCHEMA_VERSION) {
    throw new TypeError("Unsupported report schema version");
  }
  return Object.fromEntries(SUMMARY_FIELDS.map(field => [field, boundedString(source[field], 8000, field)]));
}

export function normalizeReportRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid report record");
  }
  if (value.schemaVersion !== REPORT_SCHEMA_VERSION) {
    throw new TypeError("Unsupported report schema version");
  }
  const recordType = value.recordType;
  if (recordType !== "draft" && recordType !== "report") {
    throw new TypeError("Invalid report record type");
  }
  const allowed = recordType === "draft" ? DRAFT_FIELDS : REPORT_FIELDS;
  const record = Object.fromEntries(allowed.filter(field => field in value).map(field => [field, value[field]]));
  record.schemaVersion = REPORT_SCHEMA_VERSION;
  record.recordType = recordType;
  record.id = boundedString(record.id, 128, "id", true);
  if (!/^(draft|report)-[A-Za-z0-9-]+$/.test(record.id)) throw new TypeError("Invalid report id");
  record.ref = boundedString(record.ref, 80, "reference");
  record.coachId = boundedString(record.coachId, 128, "coach id", true);
  record.studentId = boundedString(record.studentId, 128, "student id");
  record.date = boundedString(record.date, 10, "date");
  record.time = boundedString(record.time, 12, "time");
  record.lessonNumber = Number.isFinite(Number(record.lessonNumber)) && record.lessonNumber !== ""
    ? Number(record.lessonNumber)
    : "";
  record.summary = normalizeSummary(record.summary);

  if (recordType === "draft") {
    record.step = Math.min(4, Math.max(1, Number.parseInt(record.step, 10) || 1));
    record.status = "Pending";
  } else {
    record.lessonLabel = boundedString(record.lessonLabel, 80, "lesson label");
    record.status = "Generated";
    record.generatedAt = boundedString(record.generatedAt, 64, "generated timestamp");
    if (!record.studentId) throw new TypeError("Missing report student id");
  }

  return record;
}

export function createDashboardStatePayload(state) {
  const { reports: _reports, reportDrafts: _drafts, ...persisted } = state || {};
  const ui = { ...(persisted.ui || {}) };
  delete ui.reportViewId;
  delete ui.reportDraftId;
  if (ui.page === "report-view") ui.page = "overview";
  return { ...persisted, ui };
}

export function createReportDriveRepository(invoke) {
  if (typeof invoke !== "function") throw new TypeError("A Drive action invoker is required");

  return {
    async list({ centreId = "" } = {}) {
      let result = await invoke({ action: "report-list", centre_id: centreId || undefined });
      if (typeof result === "string") {
        try {
          result = JSON.parse(result);
        } catch (parseError) {
          // Keep the normal validation error below for non-JSON responses.
        }
      }
      // Accept the current response and the legacy `reports` key while older
      // centre deployments roll forward to the report repository function.
      const candidates = [result, result?.data, result?.body, result?.payload];
      const records = candidates.reduce((found, candidate) => found || (
        Array.isArray(candidate)
          ? candidate
          : Array.isArray(candidate?.records)
            ? candidate.records
            : Array.isArray(candidate?.reports)
              ? candidate.reports
              : null
      ), null);
      if (!records) throw new TypeError("Google Drive returned an invalid report list");
      return records.map(normalizeReportRecord);
    },

    async save(record, { draftId = "", centreId = "" } = {}) {
      const normalized = normalizeReportRecord(record);
      const result = await invoke({ action: "report-save", record: normalized, draft_id: draftId || undefined, centre_id: centreId || undefined });
      return normalizeReportRecord(result?.record || normalized);
    },

    async savePdf(recordId, dataUrl, { centreId = "" } = {}) {
      const id = boundedString(recordId, 128, "id", true);
      if (!/^report-[A-Za-z0-9-]+$/.test(id)) throw new TypeError("Invalid report id");
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:application/pdf;base64,")) {
        throw new TypeError("A PDF data URL is required");
      }
      return invoke({ action: "report-pdf", report_id: id, file_base64: dataUrl, centre_id: centreId || undefined });
    }
  };
}

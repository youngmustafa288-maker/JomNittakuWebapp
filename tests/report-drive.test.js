import test from "node:test";
import assert from "node:assert/strict";
import {
  createDashboardStatePayload,
  createReportDriveRepository,
  normalizeReportRecord
} from "../src/report-drive.js";

const report = {
  schemaVersion: 1,
  id: "report-123",
  recordType: "report",
  ref: "DSM-26-0001",
  coachId: "coach-1",
  studentId: "student-1",
  lessonLabel: "Lesson 1",
  lessonNumber: 1,
  date: "2026-10-06",
  time: "10:30",
  status: "Generated",
  generatedAt: "2026-10-06T02:30:00.000Z",
  summary: { whatTaught: "Footwork" },
  driveFileUrl: "https://private.example/report",
  arbitrary: "must not persist"
};

test("report normalization keeps only the versioned report contract", () => {
  const normalized = normalizeReportRecord(report);
  assert.equal(normalized.schemaVersion, 1);
  assert.equal(normalized.status, "Generated");
  assert.equal(normalized.summary.whatTaught, "Footwork");
  assert.equal(normalized.summary.remarks, "");
  assert.equal("driveFileUrl" in normalized, false);
  assert.equal("arbitrary" in normalized, false);
});

test("draft normalization keeps wizard fields and clamps the step", () => {
  const draft = normalizeReportRecord({
    schemaVersion: 1,
    id: "draft-456",
    recordType: "draft",
    coachId: "coach-1",
    step: 99,
    summary: { remarks: "Continue" }
  });
  assert.equal(draft.step, 4);
  assert.equal(draft.status, "Pending");
  assert.equal(draft.summary.remarks, "Continue");
});

test("report normalization rejects missing identity and unsupported type", () => {
  assert.throws(() => normalizeReportRecord({ ...report, id: "student-name-report" }), /Invalid report id/);
  assert.throws(() => normalizeReportRecord({ ...report, recordType: "other" }), /Invalid report record type/);
  assert.throws(() => normalizeReportRecord({ ...report, schemaVersion: 2 }), /Unsupported report schema version/);
  assert.throws(() => normalizeReportRecord({ ...report, schemaVersion: undefined }), /Unsupported report schema version/);
});

test("dashboard serializer excludes report content and report-specific UI state without mutation", () => {
  const state = {
    dataVersion: 3,
    reports: [report],
    reportDrafts: { "draft-1": { summary: { remarks: "private" } } },
    students: [{ id: "student-1", lessons: 4 }],
    ui: { page: "report-view", reportViewId: "report-123", reportDraftId: "draft-1", avatarMenuOpen: false }
  };
  const payload = createDashboardStatePayload(state);
  assert.deepEqual(payload, {
    dataVersion: 3,
    students: [{ id: "student-1", lessons: 4 }],
    ui: { page: "overview", avatarMenuOpen: false }
  });
  assert.equal(state.reports.length, 1);
});

test("Drive repository maps list/save/pdf actions through its invoker", async () => {
  const calls = [];
  const repository = createReportDriveRepository(async body => {
    calls.push(body);
    if (body.action === "report-list") return { records: [report] };
    if (body.action === "report-save") return { record: body.record };
    return { ok: true };
  });

  assert.equal((await repository.list()).length, 1);
  assert.equal((await repository.save(report, { draftId: "draft-456" })).id, report.id);
  await repository.savePdf(report.id, "data:application/pdf;base64,AA==");
  assert.deepEqual(calls.map(call => call.action), ["report-list", "report-save", "report-pdf"]);
  assert.equal(calls[1].draft_id, "draft-456");
  assert.equal("arbitrary" in calls[1].record, false);
});

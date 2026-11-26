import test from "node:test";
import assert from "node:assert/strict";
import { firstReportTourStep } from "../src/first-report-tour.js";

test("first report tour points at the next thing to click", () => {
  const base = { hasReport: false, wizardOpen: false, step: 1, picked: false, hasStudents: true };
  assert.equal(firstReportTourStep(base).target, '[data-action="new-report"]');
  assert.equal(firstReportTourStep({ ...base, wizardOpen: true }).id, "student");
  assert.equal(firstReportTourStep({ ...base, wizardOpen: true, picked: true }).id, "student-next");
  assert.equal(firstReportTourStep({ ...base, wizardOpen: true, picked: true, step: 2 }).id, "lesson");
  assert.equal(firstReportTourStep({ ...base, wizardOpen: true, picked: true, step: 3 }).id, "summary");
  assert.match(firstReportTourStep({ ...base, wizardOpen: true, picked: true, step: 4 }).target, /wizard-generate/);
  assert.equal(firstReportTourStep({ ...base, hasReport: true }).final, true);
});

test("with no students the tour shows how to add one first", () => {
  const ctx = { hasReport: false, wizardOpen: false, step: 1, picked: false, hasStudents: false, page: "overview", studentModalStep: 0 };
  assert.equal(firstReportTourStep(ctx).target, '[data-nav="students"]');
  assert.equal(firstReportTourStep({ ...ctx, page: "students" }).target, '[data-action="add-student"]');
  assert.equal(firstReportTourStep({ ...ctx, page: "students", studentModalStep: 1 }).id, "student-form");
  assert.equal(firstReportTourStep({ ...ctx, page: "students", studentModalStep: 2 }).id, "student-save");
  assert.equal(firstReportTourStep({ ...ctx, hasStudents: true }).id, "start");
});

import { TOURS, currentTourStep } from "../src/first-report-tour.js";

test("student tour finishes once a new student is saved", () => {
  const base = { page: "overview", studentModalStep: 0, studentCount: 2 };
  assert.equal(currentTourStep(TOURS.students, base, base).id, "students-page");
  assert.equal(currentTourStep(TOURS.students, { ...base, page: "students" }, base).id, "student-add");
  assert.equal(currentTourStep(TOURS.students, { ...base, page: "students", studentModalStep: 2 }, base).id, "student-save");
  assert.equal(currentTourStep(TOURS.students, { ...base, page: "students", studentCount: 3 }, base).final, true);
});

test("certificate and profile tours wait for Next on tip steps and finish on save", () => {
  const base = { page: "certificate-design", studioView: "editor", designSaves: 0 };
  assert.equal(currentTourStep(TOURS.certificate, base, base).id, "cert-canvas");
  assert.equal(currentTourStep(TOURS.certificate, base, base, new Set(["cert-canvas", "cert-tools"])).id, "cert-save");
  assert.equal(currentTourStep(TOURS.certificate, { ...base, designSaves: 1 }, base, new Set(["cert-canvas", "cert-tools"])).final, true);
  const p = { page: "overview", avatarMenuOpen: false, profileSaves: 0 };
  assert.equal(currentTourStep(TOURS.profile, p, p).id, "profile-menu");
  assert.equal(currentTourStep(TOURS.profile, { ...p, avatarMenuOpen: true }, p).id, "profile-open");
  assert.equal(currentTourStep(TOURS.profile, { ...p, page: "profile" }, p).id, "profile-photo");
});

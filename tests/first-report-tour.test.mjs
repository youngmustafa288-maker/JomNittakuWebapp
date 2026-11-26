import test from "node:test";
import assert from "node:assert/strict";
import { firstReportTourStep } from "../src/first-report-tour.js";

test("first report tour points at the next thing to click", () => {
  const base = { hasReport: false, wizardOpen: false, step: 1, picked: false };
  assert.equal(firstReportTourStep(base).target, '[data-action="new-report"]');
  assert.equal(firstReportTourStep({ ...base, wizardOpen: true }).id, "student");
  assert.equal(firstReportTourStep({ ...base, wizardOpen: true, picked: true }).id, "student-next");
  assert.equal(firstReportTourStep({ ...base, wizardOpen: true, picked: true, step: 2 }).id, "lesson");
  assert.equal(firstReportTourStep({ ...base, wizardOpen: true, picked: true, step: 3 }).id, "summary");
  assert.match(firstReportTourStep({ ...base, wizardOpen: true, picked: true, step: 4 }).target, /wizard-generate/);
  assert.equal(firstReportTourStep({ ...base, hasReport: true }).final, true);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { needsCoachOnboarding, clampOnboardingStep, onboardingStepError, createCoachOnboarding, ONBOARDING_STEPS } from "../src/coach-onboarding.js";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

test("only coaches with an empty completion date need the guide", () => {
  assert.equal(needsCoachOnboarding({ id: "a", onboarding_completed_at: null }), true);
  assert.equal(needsCoachOnboarding({ id: "a", onboarding_completed_at: "2026-11-25T00:00:00Z" }), false);
  // Before the migration is deployed the column is missing: nobody is blocked.
  assert.equal(needsCoachOnboarding({ id: "a" }), false);
  assert.equal(needsCoachOnboarding(null), false);
});

test("saved steps stay inside the six steps", () => {
  assert.equal(ONBOARDING_STEPS.length, 6);
  assert.equal(clampOnboardingStep(-3), 0);
  assert.equal(clampOnboardingStep(9), 5);
  assert.equal(clampOnboardingStep("3"), 3);
  assert.equal(clampOnboardingStep(undefined), 0);
});

test("required steps block moving forward until done", () => {
  assert.match(onboardingStepError("profile", { name: "  " }), /name/);
  assert.equal(onboardingStepError("profile", { name: "Ahmad" }), "");
  assert.match(onboardingStepError("drive", { driveStatus: "disconnected" }), /Google Drive/);
  assert.equal(onboardingStepError("drive", { driveStatus: "connected" }), "");
  assert.match(onboardingStepError("students", { studentCount: 0 }), /1 student/);
  assert.equal(onboardingStepError("students", { studentCount: 1 }), "");
  assert.equal(onboardingStepError("welcome", {}), "");
});

function fakeDeps(coach, extra = {}) {
  return {
    escapeHtml,
    templates: [{ id: "classic", name: "Classic", color: "#bd955b" }, { id: "performance", name: "Performance", color: "#c81e45" }],
    centreName: "Ace <Centre>",
    logoUrl: "",
    getCoach: () => coach,
    getStudents: () => [],
    getDriveStatus: () => "connected",
    getDriveEmail: () => "coach@example.com",
    getDriveError: () => "",
    refreshDrive: () => {},
    connectDrive: () => {},
    uploadPhoto: async () => "",
    saveProfile: async () => {},
    currentTemplateId: () => "classic",
    applyTemplate: async () => {},
    renderCertificate: (id, mode) => `<div data-cert="${id}-${mode}"></div>`,
    addStudent: async () => ({}),
    saveProgress: async () => {},
    finish: () => {},
    render: () => {},
    ...extra
  };
}

test("the guide resumes at the saved step and escapes user text", () => {
  const coach = { id: "c1", name: "<b>Ahmad</b>", onboarding_step: 3, onboarding_completed_at: null };
  const html = createCoachOnboarding(fakeDeps(coach)).render();
  assert.match(html, /Step 4 of 6/);
  assert.match(html, /data-cert="classic-base"/);
  assert.match(html, /data-cert="classic-example"/);
  assert.doesNotMatch(html, /<b>Ahmad<\/b>/);
});

test("welcome screen greets the coach and centre safely", () => {
  const coach = { id: "c2", name: "Mei Sim", onboarding_step: 0, onboarding_completed_at: null };
  const html = createCoachOnboarding(fakeDeps(coach)).render();
  assert.match(html, /Welcome, Mei/);
  assert.match(html, /Ace &lt;Centre&gt;/);
  assert.match(html, /Get started/);
  assert.doesNotMatch(html, /data-cob="back"/);
});

test("migration marks existing coaches as done and lets coaches save progress", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261125_000019_coach_onboarding.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists onboarding_completed_at timestamptz/);
  assert.match(sql, /update public\.coaches\s+set onboarding_completed_at/);
  assert.match(sql, /grant update \(onboarding_step, onboarding_completed_at\) on public\.coaches to authenticated/);
});

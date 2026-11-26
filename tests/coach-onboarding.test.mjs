import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  needsCoachOnboarding, clampOnboardingStep, onboardingStepError, createCoachOnboarding, ONBOARDING_STEPS,
  pendingSetupItems, normalizeSkipped, normalizeQrLink, isValidQrLink, QR_LINK_EXAMPLES
} from "../src/coach-onboarding.js";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

test("only coaches with an empty completion date see the guide automatically", () => {
  assert.equal(needsCoachOnboarding({ id: "a", onboarding_completed_at: null }), true);
  assert.equal(needsCoachOnboarding({ id: "a", onboarding_completed_at: "2026-11-25T00:00:00Z" }), false);
  // Before the migration is deployed the column is missing: nobody is blocked.
  assert.equal(needsCoachOnboarding({ id: "a" }), false);
  assert.equal(needsCoachOnboarding(null), false);
});

test("saved steps stay inside the seven steps", () => {
  assert.deepEqual(ONBOARDING_STEPS.map(step => step.id), ["welcome", "profile", "drive", "design", "qr", "students", "done"]);
  assert.equal(clampOnboardingStep(-3), 0);
  assert.equal(clampOnboardingStep(9), 6);
  assert.equal(clampOnboardingStep("3"), 3);
  assert.equal(clampOnboardingStep(undefined), 0);
});

test("steps ask for input unless the coach skips them", () => {
  assert.match(onboardingStepError("profile", { name: "  " }), /skip for now/);
  assert.equal(onboardingStepError("profile", { name: "Ahmad" }), "");
  assert.match(onboardingStepError("drive", { driveStatus: "disconnected" }), /Google Drive/);
  assert.equal(onboardingStepError("drive", { driveStatus: "connected" }), "");
  assert.match(onboardingStepError("students", { studentCount: 0 }), /1 student/);
  assert.equal(onboardingStepError("qr", { qrMode: "none" }), "");
  assert.match(onboardingStepError("qr", { qrMode: "custom", qrUrl: "not a link" }), /full link/);
  assert.equal(onboardingStepError("qr", { qrMode: "custom", qrUrl: "instagram.com/liverpooltt" }), "");
  assert.match(onboardingStepError("qr", { qrMode: "page", qrLinks: [{ url: "" }] }), /at least 1 link/);
  assert.match(onboardingStepError("qr", { qrMode: "page", qrLinks: [{ url: "my whatsapp" }] }), /isn't complete/);
  assert.equal(onboardingStepError("qr", { qrMode: "page", qrLinks: [{ url: "wa.me/60123456789" }, { url: "" }] }), "");
});

test("QR links get https added and the examples are valid", () => {
  assert.equal(normalizeQrLink("wa.me/60123456789"), "https://wa.me/60123456789");
  assert.equal(normalizeQrLink("https://yourcentre.com"), "https://yourcentre.com");
  assert.equal(isValidQrLink("hello"), false);
  assert.equal(isValidQrLink("javascript:alert(1)"), false);
  for (const example of QR_LINK_EXAMPLES) assert.equal(isValidQrLink(example), true, example);
});

test("reminders list skipped steps until they are really done", () => {
  const coach = { onboarding_completed_at: "2026-11-25T00:00:00Z", onboarding_skipped: ["qr", "drive", "students", "bogus"] };
  assert.deepEqual(normalizeSkipped(coach.onboarding_skipped), ["drive", "qr", "students"]);
  assert.deepEqual(pendingSetupItems(coach, { driveStatus: "disconnected", studentCount: 0 }), ["drive", "qr", "students"]);
  assert.deepEqual(pendingSetupItems(coach, { driveStatus: "connected", studentCount: 2 }), ["qr"]);
  // No reminders while the guide itself is still running.
  assert.deepEqual(pendingSetupItems({ ...coach, onboarding_completed_at: null }), []);
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
    currentBrand: () => ({ heading: "", slogan: "", contact: "", address: "", defaults: { heading: "LiverPool", slogan: "Character Transformation thru Sports", contact: "+60 12-345 6789", address: "LiverPool" } }),
    afterCertificateRender: () => {},
    currentQr: () => ({ mode: "page", url: "", links: [] }),
    coachPageUrl: () => "https://example.test/coach/ahmad",
    linkPlatform: url => /wa\.me/.test(url) ? { id: "whatsapp", label: "WhatsApp", badge: "WA", color: "#25d366" } : { id: "website", label: "Website", badge: "W", color: "#c81e45" },
    renderQrCertificate: ({ visible, url }) => `<div data-qr-cert="${visible}" data-url="${url}"></div>`,
    applyQr: async () => {},
    qrDataUrl: async () => "",
    renderCertificate: (id, mode) => `<div data-cert="${id}-${mode}"></div>`,
    addStudent: async () => ({}),
    saveProgress: async () => {},
    finish: () => {},
    render: () => {},
    ...extra
  };
}

test("the guide resumes at the saved step, offers skip, and escapes user text", () => {
  const coach = { id: "c1", name: "<b>Ahmad</b>", onboarding_step: 3, onboarding_completed_at: null };
  const html = createCoachOnboarding(fakeDeps(coach)).render();
  assert.match(html, /Step 4 of 7/);
  assert.match(html, /data-cert="classic-base"/);
  assert.match(html, /data-cert="classic-example"/);
  assert.match(html, /Skip for now/);
  assert.doesNotMatch(html, /<b>Ahmad<\/b>/);
});

test("QR step shows link examples and the done step shows the finished certificate", () => {
  const qrCoach = { id: "c3", name: "Ahmad", onboarding_step: 4, onboarding_completed_at: null };
  const qrHtml = createCoachOnboarding(fakeDeps(qrCoach)).render();
  assert.match(qrHtml, /Add a QR code/);
  assert.match(qrHtml, /My link page/);
  assert.match(qrHtml, /No QR/);
  assert.match(qrHtml, /data-qr-cert="true" data-url="https:\/\/example\.test\/coach\/ahmad"/);
  assert.match(qrHtml, /Add a link/);
  const doneCoach = { id: "c4", name: "Ahmad", onboarding_step: 6, onboarding_completed_at: null, onboarding_skipped: ["qr"] };
  const doneHtml = createCoachOnboarding(fakeDeps(doneCoach)).render();
  assert.match(doneHtml, /data-cert="classic-final"/);
  assert.doesNotMatch(doneHtml, /Skip for now/);
  assert.doesNotMatch(doneHtml, /skipped/i);
});

test("welcome screen greets the coach and centre safely", () => {
  const coach = { id: "c2", name: "Mei Sim", onboarding_step: 0, onboarding_completed_at: null };
  const html = createCoachOnboarding(fakeDeps(coach)).render();
  assert.match(html, /Welcome, Mei/);
  assert.match(html, /Ace &lt;Centre&gt;/);
  assert.match(html, /Get started/);
  assert.doesNotMatch(html, /data-cob="back"/);
});

test("reopening a finished guide shows a close button at the chosen step", () => {
  const coach = { id: "c5", name: "Ahmad", onboarding_step: 6, onboarding_completed_at: "2026-11-25T00:00:00Z" };
  let html = "";
  const guide = createCoachOnboarding(fakeDeps(coach, { render: () => { html = guide.render(); } }));
  guide.openAt("qr");
  assert.match(html, /Step 5 of 7/);
  assert.match(html, /data-cob="close"/);
});

test("migrations mark existing coaches done and allow the new step and skip list", () => {
  const first = readFileSync(new URL("../supabase/migrations/20261125_000019_coach_onboarding.sql", import.meta.url), "utf8");
  assert.match(first, /update public\.coaches\s+set onboarding_completed_at/);
  const second = readFileSync(new URL("../supabase/migrations/20261125_000020_coach_onboarding_skip_and_qr.sql", import.meta.url), "utf8");
  assert.match(second, /onboarding_skipped text\[\]/);
  assert.match(second, /between 0 and 6/);
  assert.match(second, /grant update \(onboarding_skipped\)/);
});

test("design step offers Make it yours with the centre defaults as hints", () => {
  const coach = { id: "c9", name: "Ahmad", onboarding_step: 3, onboarding_completed_at: null };
  const seen = [];
  const html = createCoachOnboarding(fakeDeps(coach, { renderCertificate: (id, mode, _pid, brand) => { seen.push([mode, brand]); return `<div data-cert="${id}-${mode}"></div>`; } })).render();
  assert.match(html, /Make it yours/);
  assert.match(html, /placeholder="LiverPool"/);
  assert.match(html, /data-cob-input="brand.slogan"/);
  // The example gets the coach's words; the base template does not.
  assert.ok(seen.some(([mode, brand]) => mode === "example" && brand && "heading" in brand));
  assert.ok(seen.some(([mode, brand]) => mode === "base" && !brand));
});

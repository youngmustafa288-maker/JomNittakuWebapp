// Guided setup for coaches.
// The app passes its own helpers in through `deps`, so this file keeps the
// screens, motion and step rules in one place.

export const ONBOARDING_STEPS = [
  { id: "welcome", name: "Welcome" },
  { id: "profile", name: "Your profile" },
  { id: "drive", name: "Google Drive" },
  { id: "design", name: "Certificate design" },
  { id: "qr", name: "QR code" },
  { id: "students", name: "Your students" },
  { id: "done", name: "All set" }
];
const LAST_STEP = ONBOARDING_STEPS.length - 1;
export const SKIPPABLE_STEPS = ["profile", "drive", "design", "qr", "students"];
const STEP_INDEX = Object.fromEntries(ONBOARDING_STEPS.map((step, index) => [step.id, index]));

export const SETUP_ITEM_LABELS = {
  profile: "Finish your profile",
  drive: "Connect Google Drive",
  design: "Choose a certificate design",
  qr: "Add a QR code",
  students: "Add your students"
};

export const QR_LINK_EXAMPLES = [
  "https://instagram.com/yourcentre",
  "https://wa.me/60123456789",
  "https://yourcentre.com"
];

// A coach sees the guide automatically only when the column exists and is
// empty. Existing coaches were marked complete by the migration. If the
// migration is not deployed yet, the field is missing and nobody is blocked.
export function needsCoachOnboarding(coach) {
  return !!coach
    && Object.prototype.hasOwnProperty.call(coach, "onboarding_completed_at")
    && !coach.onboarding_completed_at;
}

export function clampOnboardingStep(value) {
  const step = Math.floor(Number(value));
  return Number.isFinite(step) ? Math.min(LAST_STEP, Math.max(0, step)) : 0;
}

export function normalizeSkipped(value) {
  const list = Array.isArray(value) ? value : [];
  return SKIPPABLE_STEPS.filter(id => list.includes(id));
}

// Skipped steps that still need doing. Drive and students are checked
// against the real data, so connecting Drive anywhere clears the reminder.
export function pendingSetupItems(coach, { driveStatus = "unknown", studentCount = 0 } = {}) {
  if (!coach || !coach.onboarding_completed_at) return [];
  return normalizeSkipped(coach.onboarding_skipped).filter(id => {
    if (id === "drive") return driveStatus !== "connected";
    if (id === "students") return !(studentCount > 0);
    return true;
  });
}

// Adds https:// when the coach types a link without it.
export function normalizeQrLink(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
}

export function isValidQrLink(value) {
  try {
    const url = new URL(normalizeQrLink(value));
    return ["https:", "http:"].includes(url.protocol) && /\.[a-z]{2,}$/i.test(url.hostname) && url.href.length <= 600;
  } catch {
    return false;
  }
}

// Checks a step before moving forward. Returns an error message or "".
export function onboardingStepError(stepId, data) {
  if (stepId === "profile" && !String(data.name || "").trim()) return "Enter your name, or skip for now.";
  if (stepId === "drive" && data.driveStatus !== "connected") return "Connect Google Drive, or skip for now.";
  if (stepId === "design" && !data.templateId) return "Choose a design, or skip for now.";
  if (stepId === "qr" && data.qrMode === "custom" && !isValidQrLink(data.qrUrl)) return "Enter a full link like https://instagram.com/yourcentre.";
  if (stepId === "qr" && data.qrMode === "page") {
    const filled = (data.qrLinks || []).filter(link => String(link.url || "").trim());
    if (!filled.length) return "Add at least 1 link for your page, or skip for now.";
    if (filled.some(link => !isValidQrLink(link.url))) return "One of your links isn't complete. Use a full link like https://wa.me/60123456789.";
  }
  if (stepId === "students" && !(data.studentCount > 0)) return "Add at least 1 student, or skip for now.";
  return "";
}

const ICONS = {
  check: '<path d="m5 12 4 4L19 6"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  drive: '<path d="M8 3h8l6 11-4 7H6l-4-7z"/><path d="M8 3 2 14h12M16 3l-6 11 4 7"/>',
  design: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4h-4"/>',
  students: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6c3.5 3.5 3.5 9.3 0 12.8M18.4 5.6c-3.5 3.5-3.5 9.3 0 12.8"/>'
};
function icon(name) {
  return `<svg class="cob-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}
export function setupItemIcon(id) {
  return icon({ profile: "user", drive: "drive", design: "design", qr: "qr", students: "students" }[id] || "check");
}
function initials(name) {
  return String(name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
}
function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}
function storageKey(coachId) {
  return `coachOnboardingStep:${coachId}`;
}
function readLocalStep(coachId) {
  try { return clampOnboardingStep(localStorage.getItem(storageKey(coachId))); } catch { return 0; }
}
function writeLocalStep(coachId, step) {
  try { localStorage.setItem(storageKey(coachId), String(step)); } catch { /* storage may be blocked */ }
}

export function createCoachOnboarding(deps) {
  const esc = deps.escapeHtml;
  const ui = {
    coachId: "",
    open: false,
    step: 0,
    lastRenderedStep: -1,
    direction: 1,
    lastProgress: 0,
    busy: false,
    error: "",
    skipped: [],
    profile: { name: "", phone: "", photo: "" },
    templateId: "",
    certView: "base",
    qr: { mode: "page", url: "", links: [] },
    student: { name: "", age: "", parentHp: "" },
    newStudentId: "",
    driveChecked: false,
    driveChecking: false,
    focusId: "",
    caret: null,
    qrTimer: null
  };

  function loadFromCoach(coach) {
    ui.coachId = coach.id;
    ui.skipped = normalizeSkipped(coach.onboarding_skipped);
    ui.profile = { name: coach.name && coach.name !== "Coach" ? coach.name : "", phone: coach.phone || "", photo: coach.photo || "" };
    ui.templateId = deps.currentTemplateId() || deps.templates[0]?.id || "classic";
    const qr = deps.currentQr();
    const links = (qr.links || []).map((link, index) => ({ id: link.id || `link-${index + 1}`, title: link.title || "", url: link.url || "" }));
    ui.qr = { mode: qr.mode || "page", url: qr.url || "", links: links.length ? links : [{ id: "link-1", title: "", url: "" }] };
    ui.lastRenderedStep = -1;
  }

  // Load the coach's saved step the first time the guide is shown.
  function sync() {
    const coach = deps.getCoach();
    if (!coach || coach.id === ui.coachId) return coach;
    loadFromCoach(coach);
    ui.step = Math.max(clampOnboardingStep(coach.onboarding_step), readLocalStep(coach.id));
    return coach;
  }

  function stepData() {
    return {
      name: ui.profile.name,
      driveStatus: deps.getDriveStatus(),
      templateId: ui.templateId,
      qrMode: ui.qr.mode,
      qrUrl: ui.qr.url,
      qrLinks: ui.qr.links,
      studentCount: deps.getStudents().length
    };
  }

  function saveStep(step) {
    writeLocalStep(ui.coachId, step);
    return Promise.resolve(deps.saveProgress({ step, skipped: ui.skipped })).catch(() => { /* the local copy keeps the step */ });
  }

  async function run(task) {
    if (ui.busy) return;
    ui.busy = true;
    ui.error = "";
    deps.render();
    try {
      await task();
    } catch (error) {
      ui.error = error?.message || "Something went wrong. Try again.";
    } finally {
      ui.busy = false;
      deps.render();
    }
  }

  async function moveTo(target) {
    await saveStep(target);
    ui.direction = target >= ui.step ? 1 : -1;
    ui.step = target;
  }

  function next() {
    const current = ONBOARDING_STEPS[ui.step].id;
    const problem = onboardingStepError(current, stepData());
    if (problem) {
      ui.error = problem;
      deps.render();
      return;
    }
    if (current === "done") {
      return run(async () => {
        await deps.saveProgress({ step: LAST_STEP, skipped: ui.skipped, completed: true });
        writeLocalStep(ui.coachId, 0);
        ui.open = false;
        ui.lastRenderedStep = -1;
        ui.lastProgress = 0;
        deps.finish();
      });
    }
    return run(async () => {
      if (current === "profile") await deps.saveProfile({ ...ui.profile, name: ui.profile.name.trim(), phone: ui.profile.phone.trim() });
      if (current === "design" && ui.templateId !== deps.currentTemplateId()) await deps.applyTemplate(ui.templateId);
      if (current === "qr") {
        await deps.applyQr({
          mode: ui.qr.mode,
          url: ui.qr.mode === "custom" ? normalizeQrLink(ui.qr.url) : "",
          links: ui.qr.links.filter(link => String(link.url).trim()).map(link => ({ ...link, url: normalizeQrLink(link.url), title: link.title.trim() }))
        });
      }
      ui.skipped = ui.skipped.filter(id => id !== current);
      await moveTo(ui.step + 1);
    });
  }

  function skip() {
    const current = ONBOARDING_STEPS[ui.step].id;
    if (ui.busy || !SKIPPABLE_STEPS.includes(current)) return;
    if (!ui.skipped.includes(current)) ui.skipped = normalizeSkipped([...ui.skipped, current]);
    return run(() => moveTo(ui.step + 1));
  }

  function back() {
    if (ui.busy || ui.step === 0 || ui.step === LAST_STEP) return;
    ui.direction = -1;
    ui.step -= 1;
    ui.error = "";
    deps.render();
  }

  function addStudent() {
    const name = ui.student.name.trim();
    if (!name) {
      ui.error = "Enter the student's name first.";
      deps.render();
      return;
    }
    return run(async () => {
      const saved = await deps.addStudent({ name, age: ui.student.age.trim(), parentHp: ui.student.parentHp.trim() });
      ui.newStudentId = saved?.id || "";
      ui.student = { name: "", age: "", parentHp: "" };
      ui.focusId = "cobStudentName";
    });
  }

  function checkDrive() {
    if (ui.driveChecked || ui.driveChecking) return;
    ui.driveChecking = true;
    Promise.resolve(deps.refreshDrive()).catch(() => {}).finally(() => {
      ui.driveChecking = false;
      ui.driveChecked = true;
      deps.render();
    });
  }

  // Reopen the guide at one step (from the dashboard reminder or Settings).
  function openAt(stepId) {
    const coach = deps.getCoach();
    if (!coach) return;
    loadFromCoach(coach);
    ui.open = true;
    ui.step = STEP_INDEX[stepId] ?? 1;
    ui.direction = 1;
    ui.lastProgress = 0;
    ui.error = "";
    deps.render();
  }

  // ---------- screens ----------

  function skipNote() {
    return `<p class="cob-note">You can skip this and come back later.</p>`;
  }

  function screenWelcome(coach) {
    const name = firstName(ui.profile.name || coach.name);
    const items = [["user", "Set up your profile"], ["drive", "Connect Google Drive"], ["design", "Pick a certificate design"], ["qr", "Add a QR code"], ["students", "Add your students"]];
    return `
      <div class="cob-hero">
        <div class="cob-logo cob-pop">${deps.logoUrl ? `<img src="${esc(deps.logoUrl)}" alt="">` : icon("ball")}</div>
        <h2 id="cob-title" class="cob-rise" style="--d:.12s" tabindex="-1">Welcome${name ? `, ${esc(name)}` : ""}</h2>
        <p class="cob-lead cob-rise" style="--d:.22s">Let's get you ready to make reports${deps.centreName ? ` at ${esc(deps.centreName)}` : ""}. It takes about 3 minutes, and you can skip any step.</p>
      </div>
      <ol class="cob-checklist">
        ${items.map(([iconName, label], index) => `<li class="cob-rise" style="--d:${0.32 + index * 0.07}s"><span>${icon(iconName)}</span>${label}</li>`).join("")}
      </ol>`;
  }

  function screenProfile() {
    const photo = ui.profile.photo;
    return `
      <h2 id="cob-title" tabindex="-1">Your profile</h2>
      <p class="cob-lead">This shows on your reports and certificates.</p>
      <button type="button" class="cob-avatar cob-pop ${photo ? "has-photo" : ""}" data-cob="photo" aria-label="${photo ? "Change your photo" : "Add your photo"}">
        ${photo ? `<img src="${esc(photo)}" alt="">` : icon("camera")}
        <span>${photo ? "Change photo" : "Add photo"}</span>
      </button>
      <input type="file" accept="image/png,image/jpeg,image/webp" class="cob-hidden" data-cob-file>
      <div class="cob-field"><label for="cobName">Full name</label><input id="cobName" class="text-input" data-cob-input="profile.name" autocomplete="name" placeholder="Ahmad Hakim" value="${esc(ui.profile.name)}"></div>
      <div class="cob-field"><label for="cobPhone">Phone <span>(optional)</span></label><input id="cobPhone" class="text-input" type="tel" data-cob-input="profile.phone" autocomplete="tel" placeholder="012-345 6789" value="${esc(ui.profile.phone)}"></div>`;
  }

  function screenDrive() {
    const status = deps.getDriveStatus();
    if (status !== "connected") checkDrive();
    const driveError = deps.getDriveError();
    let body;
    if (status === "connected") {
      body = `<div class="cob-tick cob-pop">${icon("check")}</div><strong class="cob-ok">Drive connected</strong>${deps.getDriveEmail() ? `<small>${esc(deps.getDriveEmail())}</small>` : ""}`;
    } else if (ui.driveChecking) {
      body = `<div class="cob-spinner" aria-hidden="true"></div><small>Checking your Drive…</small>`;
    } else {
      body = `<div class="cob-drive-logo cob-pop"><svg viewBox="0 0 48 40" aria-hidden="true"><path fill="#0F9D58" d="M16 2h12l16 28H32z"/><path fill="#4285F4" d="M8 30h24l-6 10H2z"/><path fill="#F4B400" d="M16 2 2 30h12L28 2z"/></svg></div>
        <small>Not connected yet</small>
        <button type="button" class="primary-btn cob-wide" data-cob="connect-drive">Connect Google Drive</button>`;
    }
    return `
      <h2 id="cob-title" tabindex="-1">Connect Google Drive</h2>
      <p class="cob-lead">Your reports and PDFs are saved in your own Google Drive. Reports can't be saved until it's connected.</p>
      <div class="cob-panel cob-drive">${body}</div>
      ${driveError && status !== "connected" ? `<p class="cob-note is-error" role="alert">${esc(driveError)}</p>` : ""}`;
  }

  function compare(templateId) {
    return `
      <div class="cob-compare is-${ui.certView}">
        <div class="cob-seg" role="tablist" aria-label="Preview">
          <button type="button" role="tab" aria-selected="${ui.certView === "base"}" data-cob-view="base">Base template</button>
          <button type="button" role="tab" aria-selected="${ui.certView === "example"}" data-cob-view="example">Example</button>
        </div>
        <div class="cob-compare-window">
          <div class="cob-compare-track" data-cob-swipe>
            <figure class="cob-cert">
              <div class="cob-paper">${deps.renderCertificate(templateId, "base", "cob-cert-base")}</div>
              <figcaption><strong>Base template</strong><small>The empty design before a report is made.</small></figcaption>
            </figure>
            <figure class="cob-cert is-example">
              <span class="cob-badge">Example</span>
              <div class="cob-paper">${deps.renderCertificate(templateId, "example", "cob-cert-example")}</div>
              <figcaption><strong>Example</strong><small>With photos, lesson notes and a QR code added.</small></figcaption>
            </figure>
          </div>
        </div>
        <div class="cob-dots" aria-hidden="true"><i class="${ui.certView === "base" ? "is-on" : ""}"></i><i class="${ui.certView === "example" ? "is-on" : ""}"></i></div>
      </div>`;
  }

  function screenDesign() {
    const chosen = deps.templates.find(template => template.id === ui.templateId) || deps.templates[0];
    return `
      <h2 id="cob-title" tabindex="-1">Choose your certificate design</h2>
      <p class="cob-lead">Compare the base template with an example of a finished certificate.</p>
      <div class="cob-templates" role="radiogroup" aria-label="Certificate design">
        ${deps.templates.map(template => `<button type="button" role="radio" aria-checked="${template.id === chosen.id}" class="${template.id === chosen.id ? "is-on" : ""}" data-cob-template="${esc(template.id)}"><i style="background:${esc(template.color)}"></i>${esc(template.name)}</button>`).join("")}
      </div>
      ${compare(chosen.id)}
      <p class="cob-note">You can edit your design anytime in Certificate Design.</p>`;
  }

  function qrTarget() {
    if (ui.qr.mode === "page") return deps.coachPageUrl();
    if (ui.qr.mode === "custom" && isValidQrLink(ui.qr.url)) return normalizeQrLink(ui.qr.url);
    return "";
  }

  function qrCaption() {
    if (ui.qr.mode === "none") return "Your certificate without a QR code";
    const target = qrTarget();
    return target ? `QR opens: <span>${esc(target.replace(/^https?:\/\//, ""))}</span>` : "Your QR appears here when the link is complete";
  }

  function qrStatus() {
    if (ui.qr.mode !== "custom") return { cls: "", text: "" };
    if (!ui.qr.url.trim()) return { cls: "", text: "Paste the link parents should open." };
    return isValidQrLink(ui.qr.url) ? { cls: "is-ok", text: "Link looks good" } : { cls: "is-error", text: "This doesn't look like a full link yet" };
  }

  function linkRow(link, index) {
    const platform = deps.linkPlatform(link.url);
    const filled = String(link.url || "").trim();
    return `<div class="cob-link-row" data-link-index="${index}">
      <span class="cob-link-badge" style="--brand:${esc(platform.color)}" title="${esc(platform.label)}">${esc(filled ? platform.badge : "+")}</span>
      <div class="cob-link-fields">
        <input class="text-input" id="cobLinkUrl${index}" type="url" inputmode="url" data-cob-link="url" data-index="${index}" placeholder="${index === 0 ? "https://wa.me/60123456789" : "https://instagram.com/yourcentre"}" value="${esc(link.url)}" aria-label="Link ${index + 1}">
        <input class="text-input" id="cobLinkTitle${index}" data-cob-link="title" data-index="${index}" placeholder="${esc(filled ? `Button text (e.g. ${platform.id === "whatsapp" ? "Book a class on WhatsApp" : platform.id === "instagram" ? "Follow us on Instagram" : platform.label})` : "Button text (optional)")}" value="${esc(link.title)}" aria-label="Button text ${index + 1}">
      </div>
      ${ui.qr.links.length > 1 ? `<button type="button" class="cob-link-remove" data-cob-remove-link="${index}" aria-label="Remove link ${index + 1}">&times;</button>` : ""}
    </div>`;
  }

  function screenQr() {
    const status = qrStatus();
    const target = qrTarget();
    const modes = [["page", "My link page"], ["custom", "Custom link"], ["none", "No QR"]];
    let form;
    if (ui.qr.mode === "page") {
      form = `
        <p class="cob-qr-help">Parents scan the QR and see your own link page, like Linktree. Add the buttons you want on it. The first one is the main button.</p>
        <div class="cob-links">${ui.qr.links.map(linkRow).join("")}</div>
        ${ui.qr.links.length < 8 ? `<button type="button" class="cob-add-link" data-cob="add-link">+ Add a link</button>` : ""}
        <p class="cob-examples-title">Works with WhatsApp, Instagram, TikTok, Facebook, YouTube and any website.</p>`;
    } else if (ui.qr.mode === "custom") {
      form = `
        <div class="cob-field"><label for="cobQrUrl">Link</label><input id="cobQrUrl" class="text-input" type="url" inputmode="url" autocomplete="url" data-cob-input="qr.url" placeholder="https://instagram.com/yourcentre" value="${esc(ui.qr.url)}"></div>
        <p class="cob-qr-status ${status.cls}" data-cob-qr-status>${esc(status.text)}</p>
        <p class="cob-examples-title">Links can look like this:</p>
        <ul class="cob-examples">${QR_LINK_EXAMPLES.map(example => `<li><code>${esc(example)}</code></li>`).join("")}</ul>`;
    } else {
      form = `<div class="cob-panel"><strong>No QR code</strong><small>Your certificate will be printed without a QR code. You can add one later in Certificate Design.</small></div>`;
    }
    return `
      <h2 id="cob-title" tabindex="-1">Add a QR code</h2>
      <p class="cob-lead">Parents scan it on the certificate. It's optional.</p>
      <div class="cob-seg is-always is-three" role="radiogroup" aria-label="QR code">
        ${modes.map(([id, label]) => `<button type="button" role="radio" aria-selected="${ui.qr.mode === id}" data-cob-qr="${id}">${label}</button>`).join("")}
      </div>
      <div class="cob-qr">
        <div class="cob-qr-form">${form}</div>
        <figure class="cob-qr-cert">
          <div class="cob-paper" data-cob-qr-cert>${deps.renderQrCertificate({ visible: ui.qr.mode !== "none", url: target || deps.coachPageUrl() })}</div>
          <figcaption data-cob-qr-caption>${qrCaption()}</figcaption>
        </figure>
      </div>`;
  }

  function screenStudents() {
    const students = deps.getStudents();
    return `
      <h2 id="cob-title" tabindex="-1">Add your students</h2>
      <p class="cob-lead">Add a few now, or skip and add them later.</p>
      <form class="cob-student-form" data-cob-student-form novalidate>
        <div class="cob-field"><label for="cobStudentName">Student name</label><input id="cobStudentName" class="text-input" data-cob-input="student.name" placeholder="Mei Sim" value="${esc(ui.student.name)}"></div>
        <div class="cob-field-row">
          <div class="cob-field"><label for="cobStudentAge">Age <span>(optional)</span></label><input id="cobStudentAge" class="text-input" inputmode="numeric" data-cob-input="student.age" placeholder="12" value="${esc(ui.student.age)}"></div>
          <div class="cob-field"><label for="cobStudentPhone">Parent phone <span>(optional)</span></label><input id="cobStudentPhone" class="text-input" type="tel" data-cob-input="student.parentHp" placeholder="012-345 6789" value="${esc(ui.student.parentHp)}"></div>
        </div>
        <button type="submit" class="secondary-btn cob-wide cob-add">${icon("plus")}Add student</button>
      </form>
      <ul class="cob-students" aria-live="polite">
        ${students.map(student => `<li class="${student.id === ui.newStudentId ? "is-new" : ""}"><span class="cob-initials">${esc(initials(student.name))}</span><span>${esc(student.name)}</span>${icon("check")}</li>`).join("")}
      </ul>`;
  }

  function screenDone(coach) {
    const templateId = deps.currentTemplateId() || ui.templateId;
    const confetti = Array.from({ length: 36 }, (_, index) => `<i style="--x:${(index * 37) % 100}%;--d:${((index * 7) % 12) / 10}s;--c:${["#c81e45", "#f2d8ab", "#162a4a", "#18a957", "#eb4b67"][index % 5]};--r:${(index * 47) % 360}deg"></i>`).join("");
    const name = firstName(ui.profile.name || coach.name);
    return `
      <div class="cob-confetti" aria-hidden="true">${confetti}</div>
      <div class="cob-hero">
        <h2 id="cob-title" class="cob-rise" style="--d:.1s" tabindex="-1">You're all set${name ? `, ${esc(name)}` : ""}</h2>
        <p class="cob-lead cob-rise" style="--d:.2s">This is how your certificate will look. Time to make your first report.</p>
      </div>
      <figure class="cob-cert cob-final cob-rise" style="--d:.3s">
        <div class="cob-paper">${deps.renderCertificate(templateId, "final", "cob-cert-final")}</div>
      </figure>`;
  }

  // ---------- render + events ----------

  function render() {
    const coach = sync();
    if (!coach) return "";
    const step = ONBOARDING_STEPS[ui.step];
    const entering = ui.step !== ui.lastRenderedStep;
    const animation = entering && ui.lastRenderedStep !== -1 ? (ui.direction < 0 ? "is-back" : "is-forward") : entering ? "is-first" : "";
    ui.lastRenderedStep = ui.step;
    const progress = ((ui.step + 1) / ONBOARDING_STEPS.length) * 100;
    const screens = { welcome: screenWelcome, profile: screenProfile, drive: screenDrive, design: screenDesign, qr: screenQr, students: screenStudents, done: screenDone };
    const nextLabel = ui.busy ? "Saving…" : step.id === "welcome" ? "Get started" : step.id === "done" ? "Go to dashboard" : step.id === "design" ? "Use this design" : "Continue";
    const canSkip = SKIPPABLE_STEPS.includes(step.id);
    return `
      <div class="cob" data-step="${step.id}">
        <div class="cob-card" role="dialog" aria-modal="true" aria-labelledby="cob-title">
          <header class="cob-top">
            <div class="cob-progress" role="progressbar" aria-label="Setup progress" aria-valuemin="1" aria-valuemax="${ONBOARDING_STEPS.length}" aria-valuenow="${ui.step + 1}"><span data-cob-bar data-to="${progress}" style="width:${ui.lastProgress}%"></span></div>
            <div class="cob-meta"><span>Step ${ui.step + 1} of ${ONBOARDING_STEPS.length}</span><span>${esc(step.name)}</span></div>
            ${ui.open ? `<button type="button" class="cob-close" data-cob="close" aria-label="Close setup guide">&times;</button>` : ""}
          </header>
          <main class="cob-stage">
            <section class="cob-screen ${animation}">${screens[step.id](coach)}</section>
          </main>
          <footer class="cob-foot">
            <p class="cob-error" role="alert">${esc(ui.error)}</p>
            <div class="cob-actions">
              ${ui.step > 0 && ui.step < LAST_STEP ? `<button type="button" class="ghost-btn cob-back" data-cob="back" aria-label="Back" ${ui.busy ? "disabled" : ""}>${icon("back")}<span>Back</span></button>` : ""}
              <button type="button" class="primary-btn cob-next" data-cob="next" ${ui.busy ? "disabled" : ""}>${esc(nextLabel)}${ui.busy ? "" : icon("arrow")}</button>
            </div>
            ${canSkip ? `<button type="button" class="cob-skip" data-cob="skip" ${ui.busy ? "disabled" : ""}>Skip for now</button>` : ""}
          </footer>
        </div>
      </div>`;
  }

  function updateQrPreview(shell) {
    const statusEl = shell.querySelector("[data-cob-qr-status]");
    const status = qrStatus();
    if (statusEl) { statusEl.className = `cob-qr-status ${status.cls}`; statusEl.textContent = status.text; }
    const img = shell.querySelector("[data-cob-qr-cert] img[data-qr-url]");
    const target = qrTarget();
    const caption = shell.querySelector("[data-cob-qr-caption]");
    if (caption) caption.innerHTML = qrCaption();
    if (!img || !target) return;
    img.dataset.qrUrl = target;
    Promise.resolve(deps.qrDataUrl(target)).then(dataUrl => {
      if (dataUrl && qrTarget() === target) img.src = dataUrl;
    }).catch(() => {});
  }

  function attach(root) {
    const shell = root.querySelector(".cob");
    if (!shell) return;
    // Animate the progress bar from its last width to the new one.
    const bar = shell.querySelector("[data-cob-bar]");
    if (bar) {
      const to = Number(bar.dataset.to);
      requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = `${to}%`; }));
      ui.lastProgress = to;
    }
    shell.addEventListener("click", event => {
      const control = event.target.closest("[data-cob],[data-cob-template],[data-cob-view],[data-cob-qr],[data-cob-remove-link]");
      if (!control || control.disabled) return;
      if (control.dataset.cobTemplate) { ui.templateId = control.dataset.cobTemplate; ui.error = ""; deps.render(); return; }
      if (control.dataset.cobView) { ui.certView = control.dataset.cobView; deps.render(); return; }
      if (control.dataset.cobQr) { ui.qr.mode = control.dataset.cobQr; ui.error = ""; deps.render(); return; }
      if (control.dataset.cobRemoveLink !== undefined) {
        ui.qr.links.splice(Number(control.dataset.cobRemoveLink), 1);
        deps.render();
        return;
      }
      const action = control.dataset.cob;
      if (action === "next") next();
      else if (action === "back") back();
      else if (action === "skip") skip();
      else if (action === "add-link") {
        ui.qr.links.push({ id: `link-${Date.now()}`, title: "", url: "" });
        ui.focusId = `cobLinkUrl${ui.qr.links.length - 1}`;
        deps.render();
      }
      else if (action === "close") { ui.open = false; ui.lastRenderedStep = -1; ui.lastProgress = 0; deps.render(); }
      else if (action === "photo") shell.querySelector("[data-cob-file]")?.click();
      else if (action === "connect-drive") run(() => deps.connectDrive());
    });
    shell.querySelectorAll("[data-cob-input]").forEach(input => {
      input.addEventListener("input", () => {
        const [group, key] = input.dataset.cobInput.split(".");
        ui[group][key] = input.value;
        if (ui.error) { ui.error = ""; shell.querySelector(".cob-error").textContent = ""; }
        if (group === "qr") {
          clearTimeout(ui.qrTimer);
          ui.qrTimer = setTimeout(() => updateQrPreview(shell), 250);
        }
      });
    });
    shell.querySelectorAll("[data-cob-link]").forEach(input => {
      input.addEventListener("input", () => {
        const link = ui.qr.links[Number(input.dataset.index)];
        if (!link) return;
        link[input.dataset.cobLink] = input.value;
        if (ui.error) { ui.error = ""; shell.querySelector(".cob-error").textContent = ""; }
        if (input.dataset.cobLink === "url") {
          const badge = input.closest(".cob-link-row")?.querySelector(".cob-link-badge");
          const platform = deps.linkPlatform(input.value);
          if (badge) { badge.textContent = input.value.trim() ? platform.badge : "+"; badge.style.setProperty("--brand", platform.color); badge.title = platform.label; }
        }
      });
    });
    updateQrPreview(shell);
    shell.querySelector("[data-cob-file]")?.addEventListener("change", event => {
      const [file] = event.target.files || [];
      if (!file) return;
      run(async () => { ui.profile.photo = await deps.uploadPhoto(file); });
    });
    shell.querySelector("[data-cob-student-form]")?.addEventListener("submit", event => {
      event.preventDefault();
      addStudent();
    });
    // Swipe between the base template and the example on phones.
    const track = shell.querySelector("[data-cob-swipe]");
    if (track) {
      let startX = null;
      track.addEventListener("touchstart", event => { startX = event.touches[0].clientX; }, { passive: true });
      track.addEventListener("touchend", event => {
        if (startX === null) return;
        const dx = event.changedTouches[0].clientX - startX;
        startX = null;
        if (Math.abs(dx) < 40) return;
        const view = dx < 0 ? "example" : "base";
        if (view !== ui.certView) { ui.certView = view; deps.render(); }
      });
    }
    // Enter moves forward, except inside the student form.
    shell.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.target.closest("[data-cob-student-form]") || event.target.tagName === "BUTTON") return;
      if (event.target.matches("input")) { event.preventDefault(); next(); }
    });
    // Keep focus on the field being typed in; otherwise move it to the new heading.
    const active = ui.focusId && document.getElementById(ui.focusId);
    if (active) {
      active.focus({ preventScroll: true });
      if (ui.caret !== null && typeof active.setSelectionRange === "function") {
        try { active.setSelectionRange(ui.caret, ui.caret); } catch { /* some inputs do not allow it */ }
      }
    } else if (shell.querySelector(".cob-screen.is-forward, .cob-screen.is-back, .cob-screen.is-first")) {
      shell.querySelector("#cob-title")?.focus({ preventScroll: true });
    }
    ui.focusId = "";
    ui.caret = null;
  }

  // Remember which field had focus so a re-render (e.g. after adding a
  // student) puts the caret back.
  function rememberFocus() {
    const active = document.activeElement;
    if (!ui.focusId && active?.matches?.(".cob input") && active.id) {
      ui.focusId = active.id;
      ui.caret = typeof active.selectionStart === "number" ? active.selectionStart : null;
    }
  }

  return {
    render,
    attach,
    rememberFocus,
    openAt,
    isOpen: () => ui.open,
    isActive: () => ui.open || needsCoachOnboarding(deps.getCoach()),
    state: ui
  };
}

// Guided setup for new coaches.
// The app passes its own helpers in through `deps`, so this file keeps the
// screens, motion and step rules in one place.

export const ONBOARDING_STEPS = [
  { id: "welcome", name: "Welcome" },
  { id: "profile", name: "Your profile" },
  { id: "drive", name: "Google Drive" },
  { id: "design", name: "Certificate design" },
  { id: "students", name: "Your students" },
  { id: "done", name: "All set" }
];
const LAST_STEP = ONBOARDING_STEPS.length - 1;

// A coach needs the guide only when the column exists and is empty.
// Existing coaches were marked complete by the migration. If the migration
// is not deployed yet, the field is missing and nobody is blocked.
export function needsCoachOnboarding(coach) {
  return !!coach
    && Object.prototype.hasOwnProperty.call(coach, "onboarding_completed_at")
    && !coach.onboarding_completed_at;
}

export function clampOnboardingStep(value) {
  const step = Math.floor(Number(value));
  return Number.isFinite(step) ? Math.min(LAST_STEP, Math.max(0, step)) : 0;
}

// Checks a step before moving forward. Returns an error message or "".
export function onboardingStepError(stepId, data) {
  if (stepId === "profile" && !String(data.name || "").trim()) return "Enter your name to continue.";
  if (stepId === "drive" && data.driveStatus !== "connected") return "Connect Google Drive to continue.";
  if (stepId === "design" && !data.templateId) return "Choose a design to continue.";
  if (stepId === "students" && !(data.studentCount > 0)) return "Add at least 1 student to continue.";
  return "";
}

const ICONS = {
  check: '<path d="m5 12 4 4L19 6"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  drive: '<path d="M8 3h8l6 11-4 7H6l-4-7z"/><path d="M8 3 2 14h12M16 3l-6 11 4 7"/>',
  design: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  students: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="M19 12H5m5-5-5 5 5 5"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6c3.5 3.5 3.5 9.3 0 12.8M18.4 5.6c-3.5 3.5-3.5 9.3 0 12.8"/>'
};
function icon(name) {
  return `<svg class="cob-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
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
    step: 0,
    lastRenderedStep: -1,
    direction: 1,
    lastProgress: 0,
    busy: false,
    error: "",
    profile: { name: "", phone: "", photo: "" },
    templateId: "",
    certView: "base",
    student: { name: "", age: "", parentHp: "" },
    newStudentId: "",
    driveChecked: false,
    driveChecking: false,
    focusId: "",
    caret: null
  };

  // Load the coach's saved step the first time the guide is shown.
  function sync() {
    const coach = deps.getCoach();
    if (!coach || coach.id === ui.coachId) return coach;
    ui.coachId = coach.id;
    ui.step = Math.max(clampOnboardingStep(coach.onboarding_step), readLocalStep(coach.id));
    ui.profile = { name: coach.name && coach.name !== "Coach" ? coach.name : "", phone: coach.phone || "", photo: coach.photo || "" };
    ui.templateId = deps.currentTemplateId() || deps.templates[0]?.id || "classic";
    ui.lastRenderedStep = -1;
    return coach;
  }

  function stepData() {
    return {
      name: ui.profile.name,
      driveStatus: deps.getDriveStatus(),
      templateId: ui.templateId,
      studentCount: deps.getStudents().length
    };
  }

  function saveStep(step) {
    writeLocalStep(ui.coachId, step);
    return Promise.resolve(deps.saveProgress({ step })).catch(() => { /* the local copy keeps the step */ });
  }

  function go(step) {
    const next = clampOnboardingStep(step);
    ui.direction = next >= ui.step ? 1 : -1;
    ui.step = next;
    ui.error = "";
    deps.render();
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
        await deps.saveProgress({ step: LAST_STEP, completed: true });
        writeLocalStep(ui.coachId, 0);
        deps.finish();
      });
    }
    return run(async () => {
      if (current === "profile") await deps.saveProfile({ ...ui.profile, name: ui.profile.name.trim(), phone: ui.profile.phone.trim() });
      if (current === "design" && ui.templateId !== deps.currentTemplateId()) await deps.applyTemplate(ui.templateId);
      const target = ui.step + 1;
      await saveStep(target);
      ui.direction = 1;
      ui.step = target;
    });
  }

  function back() {
    if (ui.busy || ui.step === 0 || ui.step === LAST_STEP) return;
    go(ui.step - 1);
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

  // ---------- screens ----------

  function screenWelcome(coach) {
    const name = firstName(ui.profile.name || coach.name);
    const items = [["user", "Set up your profile"], ["drive", "Connect Google Drive"], ["design", "Pick a certificate design"], ["students", "Add your students"]];
    return `
      <div class="cob-hero">
        <div class="cob-logo cob-pop">${deps.logoUrl ? `<img src="${esc(deps.logoUrl)}" alt="">` : icon("ball")}</div>
        <h2 id="cob-title" class="cob-rise" style="--d:.12s" tabindex="-1">Welcome${name ? `, ${esc(name)}` : ""}</h2>
        <p class="cob-lead cob-rise" style="--d:.22s">Let's get you ready to make reports${deps.centreName ? ` at ${esc(deps.centreName)}` : ""}. It takes about 3 minutes.</p>
      </div>
      <ol class="cob-checklist">
        ${items.map(([iconName, label], index) => `<li class="cob-rise" style="--d:${0.32 + index * 0.08}s"><span>${icon(iconName)}</span>${label}</li>`).join("")}
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
      <p class="cob-lead">Your reports and PDFs are saved in your own Google Drive.</p>
      <div class="cob-panel cob-drive">${body}</div>
      ${driveError && status !== "connected" ? `<p class="cob-note is-error" role="alert">${esc(driveError)}</p>` : ""}`;
  }

  function screenDesign() {
    const chosen = deps.templates.find(template => template.id === ui.templateId) || deps.templates[0];
    return `
      <h2 id="cob-title" tabindex="-1">Choose your certificate design</h2>
      <p class="cob-lead">Compare the base template with an example of a finished certificate.</p>
      <div class="cob-templates" role="radiogroup" aria-label="Certificate design">
        ${deps.templates.map(template => `<button type="button" role="radio" aria-checked="${template.id === chosen.id}" class="${template.id === chosen.id ? "is-on" : ""}" data-cob-template="${esc(template.id)}"><i style="background:${esc(template.color)}"></i>${esc(template.name)}</button>`).join("")}
      </div>
      <div class="cob-compare is-${ui.certView}">
        <div class="cob-seg" role="tablist" aria-label="Preview">
          <button type="button" role="tab" aria-selected="${ui.certView === "base"}" data-cob-view="base">Base template</button>
          <button type="button" role="tab" aria-selected="${ui.certView === "example"}" data-cob-view="example">Example</button>
        </div>
        <div class="cob-compare-window">
          <div class="cob-compare-track" data-cob-swipe>
            <figure class="cob-cert">
              <div class="cob-paper">${deps.renderCertificate(chosen.id, "base", "cob-cert-base")}</div>
              <figcaption><strong>Base template</strong><small>Photos, names and notes are added when you make a report.</small></figcaption>
            </figure>
            <figure class="cob-cert is-example">
              <span class="cob-badge">Example</span>
              <div class="cob-paper">${deps.renderCertificate(chosen.id, "example", "cob-cert-example")}</div>
              <figcaption><strong>Example</strong><small>This is how your certificate can look.</small></figcaption>
            </figure>
          </div>
        </div>
        <div class="cob-dots" aria-hidden="true"><i class="${ui.certView === "base" ? "is-on" : ""}"></i><i class="${ui.certView === "example" ? "is-on" : ""}"></i></div>
      </div>
      <p class="cob-note">You can edit your design anytime in Certificate Design.</p>`;
  }

  function screenStudents() {
    const students = deps.getStudents();
    return `
      <h2 id="cob-title" tabindex="-1">Add your students</h2>
      <p class="cob-lead">Add at least 1 student. You can add more later.</p>
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
    const template = deps.templates.find(item => item.id === (deps.currentTemplateId() || ui.templateId));
    const count = deps.getStudents().length;
    const confetti = Array.from({ length: 36 }, (_, index) => `<i style="--x:${(index * 37) % 100}%;--d:${((index * 7) % 12) / 10}s;--c:${["#c81e45", "#f2d8ab", "#162a4a", "#18a957", "#eb4b67"][index % 5]};--r:${(index * 47) % 360}deg"></i>`).join("");
    return `
      <div class="cob-confetti" aria-hidden="true">${confetti}</div>
      <div class="cob-hero">
        <div class="cob-tick is-big cob-pop">${icon("check")}</div>
        <h2 id="cob-title" class="cob-rise" style="--d:.15s" tabindex="-1">You're all set${firstName(ui.profile.name || coach.name) ? `, ${esc(firstName(ui.profile.name || coach.name))}` : ""}</h2>
        <p class="cob-lead cob-rise" style="--d:.25s">Time to make your first report.</p>
      </div>
      <ul class="cob-summary">
        <li class="cob-rise" style="--d:.35s">${icon("check")}Profile saved</li>
        <li class="cob-rise" style="--d:.43s">${icon("check")}Google Drive connected</li>
        <li class="cob-rise" style="--d:.51s">${icon("check")}${esc(template?.name || "Certificate")} design chosen</li>
        <li class="cob-rise" style="--d:.59s">${icon("check")}${count} student${count === 1 ? "" : "s"} added</li>
      </ul>`;
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
    const screens = { welcome: screenWelcome, profile: screenProfile, drive: screenDrive, design: screenDesign, students: screenStudents, done: screenDone };
    const nextLabel = ui.busy ? "Saving…" : step.id === "welcome" ? "Get started" : step.id === "done" ? "Go to dashboard" : step.id === "design" ? "Use this design" : "Continue";
    return `
      <div class="cob" data-step="${step.id}">
        <div class="cob-card" role="dialog" aria-modal="true" aria-labelledby="cob-title">
          <header class="cob-top">
            <div class="cob-progress" role="progressbar" aria-label="Setup progress" aria-valuemin="1" aria-valuemax="${ONBOARDING_STEPS.length}" aria-valuenow="${ui.step + 1}"><span data-cob-bar data-to="${progress}" style="width:${ui.lastProgress}%"></span></div>
            <div class="cob-meta"><span>Step ${ui.step + 1} of ${ONBOARDING_STEPS.length}</span><span>${esc(step.name)}</span></div>
          </header>
          <main class="cob-stage">
            <section class="cob-screen ${animation}">${screens[step.id](coach)}</section>
          </main>
          <footer class="cob-foot">
            <p class="cob-error" role="alert">${esc(ui.error)}</p>
            <div class="cob-actions">
              ${ui.step > 0 && ui.step < LAST_STEP ? `<button type="button" class="ghost-btn cob-back" data-cob="back" ${ui.busy ? "disabled" : ""}>${icon("back")}<span>Back</span></button>` : ""}
              <button type="button" class="primary-btn cob-next" data-cob="next" ${ui.busy ? "disabled" : ""}>${esc(nextLabel)}${ui.busy ? "" : icon("arrow")}</button>
            </div>
          </footer>
        </div>
      </div>`;
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
      const control = event.target.closest("[data-cob],[data-cob-template],[data-cob-view]");
      if (!control || control.disabled) return;
      if (control.dataset.cobTemplate) { ui.templateId = control.dataset.cobTemplate; ui.error = ""; deps.render(); return; }
      if (control.dataset.cobView) { ui.certView = control.dataset.cobView; deps.render(); return; }
      const action = control.dataset.cob;
      if (action === "next") next();
      else if (action === "back") back();
      else if (action === "photo") shell.querySelector("[data-cob-file]")?.click();
      else if (action === "connect-drive") run(() => deps.connectDrive());
    });
    shell.querySelectorAll("[data-cob-input]").forEach(input => {
      input.addEventListener("input", () => {
        const [group, key] = input.dataset.cobInput.split(".");
        ui[group][key] = input.value;
        if (ui.error) { ui.error = ""; shell.querySelector(".cob-error").textContent = ""; }
      });
    });
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
    }
    else if (shell.querySelector(".cob-screen.is-forward, .cob-screen.is-back, .cob-screen.is-first")) shell.querySelector("#cob-title")?.focus({ preventScroll: true });
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

  return { render, attach, rememberFocus, isActive: () => needsCoachOnboarding(deps.getCoach()), state: ui };
}

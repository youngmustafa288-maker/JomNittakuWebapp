// Guided cursor tours (first report, students, certificate, profile).
// A glowing outline and an animated cursor point at the next thing to click,
// with a short tip beside it. The page is never blocked: the coach clicks the
// real buttons. The step to show is worked out from the app's own state each
// time, so a tour stays right however the page re-renders. Steps with
// `next: true` are tips the coach reads, then clicks Next.

const CURSOR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8-6 1.6L10 19z" fill="#fff" stroke="#111827" stroke-width="1.6" stroke-linejoin="round"/></svg>';

const addedStudent = (ctx, base) => (ctx.studentCount || 0) > (base.studentCount || 0);
const madeReport = (ctx, base) => (ctx.reportCount || 0) > (base.reportCount || 0);

// Adding a student: shared by the students tour and the report tour.
const studentSteps = (finished) => [
  { id: "students-page", target: '[data-nav="students"]', title: "Go to Students", text: "Click Students in the menu.", done: (ctx, base) => finished(ctx, base) || ctx.page === "students" || ctx.studentModalStep > 0 },
  { id: "student-add", target: '[data-action="add-student"]', title: "Add a student", text: "Click Add Student.", done: (ctx, base) => finished(ctx, base) || ctx.studentModalStep > 0 },
  { id: "student-form", target: '[data-action="onboarding-continue"]', title: "Type the student's details", text: "Fill in the student's name above, then click Continue.", done: (ctx, base) => finished(ctx, base) || ctx.studentModalStep === 2 },
  { id: "student-save", target: '[data-action="onboarding-submit"]', title: "Save your student", text: "Check the details, then click here to save.", done: finished }
];

export const TOURS = {
  report: {
    id: "report",
    title: "Make a report",
    description: "Pick a student, fill in the lesson and make the certificate.",
    minutes: 2,
    steps: [
      ...studentSteps((ctx, base) => ctx.hasStudents || madeReport(ctx, base)),
      { id: "start", target: '[data-action="new-report"]', title: "Start here", text: "Click New report.", done: (ctx, base) => ctx.wizardOpen || madeReport(ctx, base) },
      { id: "student", target: "#wizardModal .student-pick-list", title: "Pick your student", text: "Click the student you just coached.", done: (ctx, base) => ctx.picked || ctx.step > 1 || madeReport(ctx, base) },
      { id: "student-next", target: '#wizardModal [data-action="wizard-next"]', title: "Nice!", text: "Now click Next.", done: (ctx, base) => ctx.step > 1 || madeReport(ctx, base) },
      { id: "lesson", target: '#wizardModal [data-action="wizard-next"]', title: "Check the lesson", text: "The date and time are filled in for you. Change them if needed, then click Next.", done: (ctx, base) => ctx.step > 2 || madeReport(ctx, base) },
      { id: "summary", target: "#wizardModal .wizard-panel.active", title: "What happened in class", text: "Write short points in each box, one per line. Then click Next at the bottom.", done: (ctx, base) => ctx.step > 3 || madeReport(ctx, base) },
      { id: "remarks", target: '#wizardModal [data-action="wizard-generate"]', title: "Last step", text: "Write a short note for the parents above, then click Generate Final Report.", done: madeReport }
    ],
    final: { id: "done", title: "Your report is done!", text: "The certificate was made for you. You can share it with the parents now." }
  },
  students: {
    id: "students",
    title: "Add a student",
    description: "Add a student so you can make reports for them.",
    minutes: 1,
    steps: studentSteps(addedStudent),
    final: { id: "done", title: "Student added!", text: "You can now make a report for them." }
  },
  certificate: {
    id: "certificate",
    title: "Edit your certificate",
    description: "Change the words, logo, photos and QR code on your certificate.",
    minutes: 2,
    steps: [
      { id: "cert-page", target: '[data-nav="certificate-design"]', title: "Go to Certificates", text: "Click Certificates in the menu.", done: ctx => ctx.page === "certificate-design" },
      { id: "cert-edit", target: [".studio-template-card.is-current .studio-simple-use", ".studio-simple-use"], title: "Open your design", text: "Click Edit on the design you use.", done: ctx => ctx.page === "certificate-design" && ctx.studioView === "editor" },
      { id: "cert-canvas", target: ".certificate-editor-stage .template-report-shell", title: "Change anything", text: "Click any text to change it. Drag things to move them, or pull a corner to resize.", next: true },
      { id: "cert-tools", target: ".certificate-tool-strip", title: "Add more", text: "Use these to add text, upload a logo or photo, add a QR code, or change the photo frames.", next: true },
      { id: "cert-save", target: '[data-action="studio-save"]', title: "Save your design", text: "When you're happy with it, click Save.", done: (ctx, base) => (ctx.designSaves || 0) > (base.designSaves || 0) }
    ],
    final: { id: "done", title: "Design saved!", text: "Your new reports will use this certificate." }
  },
  profile: {
    id: "profile",
    title: "Update your profile",
    description: "Change your photo, name and centre details.",
    minutes: 1,
    steps: [
      { id: "profile-menu", target: '[data-action="toggle-avatar-menu"]', title: "Open your account menu", text: "Click your name or picture.", done: ctx => ctx.avatarMenuOpen || ctx.page === "profile" },
      { id: "profile-open", target: '[data-action="open-profile"]', title: "Open your profile", text: "Click Profile.", done: ctx => ctx.page === "profile" },
      { id: "profile-photo", target: "#coachProfileAvatar", title: "Your photo", text: "Click the circle to upload your photo. It shows on your reports.", next: true },
      { id: "profile-fields", target: ".profile-grid", title: "Your details", text: "Update your name, centre, contact number and address here.", next: true },
      { id: "profile-save", target: '[data-action="save-coach-profile"]', title: "Save", text: "Click Save Changes when you're done.", done: (ctx, base) => (ctx.profileSaves || 0) > (base.profileSaves || 0) }
    ],
    final: { id: "done", title: "Profile saved!", text: "Your details will show on your next reports." }
  }
};

// The step to show now: the first one not done yet, else the final message.
export function currentTourStep(tour, ctx, base = {}, read = new Set()) {
  return tour.steps.find(step => !read.has(step.id) && !(step.done ? step.done(ctx, base) : false)) || { ...tour.final, final: true };
}

// The first-report tour from one state snapshot (used by tests).
export function firstReportTourStep(ctx) {
  const base = { reportCount: 0, studentCount: 0 };
  const now = { ...ctx, reportCount: ctx.hasReport ? 1 : 0 };
  return currentTourStep(TOURS.report, now, base);
}

export function createGuidedTour({ getContext, onEnd }) {
  let root = null;
  let timer = null;
  let observer = null;
  let tour = null;
  let base = {};
  let read = new Set();
  let order = [];
  let lastStepId = "";
  let lastTarget = null;
  let frame = 0;

  function build() {
    root = document.createElement("div");
    root.className = "frt";
    root.innerHTML = `
      <div class="frt-spot" hidden></div>
      <div class="frt-cursor" hidden>${CURSOR_SVG}<span class="frt-ripple"></span></div>
      <div class="frt-bubble" role="dialog" aria-live="polite" aria-label="Guide">
        <span class="frt-count"></span>
        <strong class="frt-title"></strong>
        <p class="frt-text"></p>
        <div class="frt-actions"><button type="button" class="frt-skip">Skip guide</button><button type="button" class="frt-next primary-btn" hidden>Next</button><button type="button" class="frt-done primary-btn" hidden>Finish</button></div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector(".frt-skip").addEventListener("click", () => stop(true));
    root.querySelector(".frt-done").addEventListener("click", () => stop(true));
    root.querySelector(".frt-next").addEventListener("click", () => { if (lastStepId) read.add(lastStepId); update(); });
  }

  function visible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden";
  }

  // A list of selectors is tried in order, so the best match wins.
  function findTarget(selector) {
    for (const item of [].concat(selector || [])) {
      const match = [...document.querySelectorAll(item)].find(visible);
      if (match) return match;
    }
    return null;
  }

  function placeBubble(bubble, rect) {
    const margin = 14;
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!rect) {
      bubble.style.left = `${Math.max(12, (vw - width) / 2)}px`;
      bubble.style.top = `${Math.max(12, (vh - height) / 2)}px`;
      return;
    }
    let top = rect.bottom + margin + 18;
    if (top + height > vh - 12) top = rect.top - height - margin - 6;
    if (top < 12) {
      // Tall targets: put the tip beside them instead.
      top = Math.min(vh - height - 12, Math.max(12, rect.top + 12));
      const right = rect.right + margin;
      if (right + width < vw - 12) { bubble.style.left = `${right}px`; bubble.style.top = `${top}px`; return; }
      if (rect.left - margin - width > 12) { bubble.style.left = `${rect.left - margin - width}px`; bubble.style.top = `${top}px`; return; }
    }
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.min(vw - width - 12, Math.max(12, left));
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
  }

  function update() {
    if (!root || !tour) return;
    const step = currentTourStep(tour, getContext(), base, read);
    const spot = root.querySelector(".frt-spot");
    const cursor = root.querySelector(".frt-cursor");
    const bubble = root.querySelector(".frt-bubble");
    const target = step.final ? null : findTarget(step.target);
    const changed = step.id !== lastStepId;

    if (changed) {
      root.querySelector(".frt-title").textContent = step.title;
      root.querySelector(".frt-text").textContent = step.text;
      const index = order.indexOf(step.id);
      root.querySelector(".frt-count").textContent = step.final ? "All done" : `${tour.title} · ${index >= 0 ? index + 1 : 1} of ${order.length}`;
      root.querySelector(".frt-done").hidden = !step.final;
      root.querySelector(".frt-next").hidden = !step.next;
      root.querySelector(".frt-skip").hidden = !!step.final;
      bubble.classList.remove("is-in");
      void bubble.offsetWidth;
      bubble.classList.add("is-in");
    }
    if (target && (changed || target !== lastTarget)) {
      const rect = target.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > window.innerHeight) target.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    lastStepId = step.id;
    lastTarget = target;

    if (!target) {
      spot.hidden = true;
      cursor.hidden = true;
      placeBubble(bubble, null);
      return;
    }
    const rect = target.getBoundingClientRect();
    const pad = 8;
    spot.hidden = false;
    Object.assign(spot.style, { left: `${rect.left - pad}px`, top: `${rect.top - pad}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px` });
    cursor.hidden = false;
    // Small targets: point at the middle. Big areas: point near the top.
    const big = rect.height > 120;
    cursor.style.left = `${rect.left + Math.min(rect.width * 0.6, rect.width - 10)}px`;
    cursor.style.top = `${rect.top + (big ? 36 : rect.height * 0.6)}px`;
    placeBubble(bubble, rect);
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; update(); });
  }

  function start(tourId) {
    const next = TOURS[tourId];
    if (!next) return;
    if (root) stop(false);
    tour = next;
    build();
    base = getContext();
    read = new Set();
    lastStepId = "";
    // Count only the steps still to do when the tour starts.
    order = tour.steps.filter(step => !(step.done && step.done(base, base))).map(step => step.id);
    if (!order.length) order = tour.steps.map(step => step.id);
    observer = new MutationObserver(schedule);
    observer.observe(document.getElementById("app") || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    timer = setInterval(update, 400);
    requestAnimationFrame(update);
  }

  function stop(finished = false) {
    if (!root) return;
    const ended = tour;
    clearInterval(timer);
    observer?.disconnect();
    window.removeEventListener("resize", schedule);
    window.removeEventListener("scroll", schedule, true);
    root.remove();
    root = null;
    tour = null;
    lastStepId = "";
    lastTarget = null;
    if (finished) onEnd?.(ended?.id);
  }

  return { start, stop, isActive: () => !!root, activeTour: () => tour?.id || "" };
}

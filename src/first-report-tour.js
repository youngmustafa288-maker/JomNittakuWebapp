// Guided cursor tour for a coach's first report.
// A spotlight and an animated cursor point at the next thing to click, with a
// short tip beside it. The tour never blocks the page: the coach clicks the
// real buttons. Which step shows is worked out from the app's own state, so
// the tour stays right however the page re-renders.

const CURSOR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8-6 1.6L10 19z" fill="#fff" stroke="#111827" stroke-width="1.6" stroke-linejoin="round"/></svg>';

export function firstReportTourStep(ctx) {
  if (ctx.hasReport) return { id: "done", title: "Your first report is done!", text: "The certificate was made for you. You can share it with the parents now.", final: true };
  if (!ctx.wizardOpen) return { id: "start", target: '[data-action="new-report"]', title: "Start here", text: "Click New report to make your first report." };
  if (ctx.step === 1 && !ctx.picked) return { id: "student", target: "#wizardModal .student-pick-list", title: "Pick your student", text: "Click the student you just coached." };
  if (ctx.step === 1) return { id: "student-next", target: '#wizardModal [data-action="wizard-next"]', title: "Nice!", text: "Now click Next." };
  if (ctx.step === 2) return { id: "lesson", target: '#wizardModal [data-action="wizard-next"]', title: "Check the lesson", text: "The date and time are filled in for you. Change them if needed, then click Next." };
  if (ctx.step === 3) return { id: "summary", target: "#wizardModal .wizard-panel.active", title: "What happened in class", text: "Write short points in each box, one per line. Then click Next at the bottom." };
  return { id: "remarks", target: '#wizardModal [data-action="wizard-generate"]', title: "Last step", text: "Write a short note for the parents above, then click Generate Final Report." };
}

const ORDER = ["start", "student", "student-next", "lesson", "summary", "remarks"];

export function createFirstReportTour({ getContext, onEnd }) {
  let root = null;
  let timer = null;
  let observer = null;
  let lastStepId = "";
  let lastTarget = null;
  let frame = 0;

  function build() {
    root = document.createElement("div");
    root.className = "frt";
    root.innerHTML = `
      <div class="frt-spot" hidden></div>
      <div class="frt-cursor" hidden>${CURSOR_SVG}<span class="frt-ripple"></span></div>
      <div class="frt-bubble" role="dialog" aria-live="polite" aria-label="First report guide">
        <span class="frt-count"></span>
        <strong class="frt-title"></strong>
        <p class="frt-text"></p>
        <div class="frt-actions"><button type="button" class="frt-skip">Skip guide</button><button type="button" class="frt-done primary-btn" hidden>Finish</button></div>
      </div>`;
    document.body.appendChild(root);
    root.querySelector(".frt-skip").addEventListener("click", () => stop(true));
    root.querySelector(".frt-done").addEventListener("click", () => stop(true));
  }

  function visible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== "hidden";
  }

  function findTarget(selector) {
    if (!selector) return null;
    return [...document.querySelectorAll(selector)].find(visible) || null;
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
    if (top < 12) top = Math.min(vh - height - 12, rect.top + 12);
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.min(vw - width - 12, Math.max(12, left));
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
  }

  function update() {
    if (!root) return;
    const step = firstReportTourStep(getContext());
    const spot = root.querySelector(".frt-spot");
    const cursor = root.querySelector(".frt-cursor");
    const bubble = root.querySelector(".frt-bubble");
    const target = step.final ? null : findTarget(step.target);
    const changed = step.id !== lastStepId;

    if (changed) {
      root.querySelector(".frt-title").textContent = step.title;
      root.querySelector(".frt-text").textContent = step.text;
      const index = ORDER.indexOf(step.id);
      root.querySelector(".frt-count").textContent = step.final ? "All done" : `Your first report · ${Math.min(index + 1, ORDER.length)} of ${ORDER.length}`;
      root.querySelector(".frt-done").hidden = !step.final;
      root.querySelector(".frt-skip").hidden = !!step.final;
      bubble.classList.remove("is-in");
      void bubble.offsetWidth;
      bubble.classList.add("is-in");
      root.classList.toggle("is-final", !!step.final);
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

  function start() {
    if (root) return schedule();
    build();
    lastStepId = "";
    observer = new MutationObserver(schedule);
    observer.observe(document.getElementById("app") || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    timer = setInterval(update, 400);
    requestAnimationFrame(update);
  }

  function stop(finished = false) {
    if (!root) return;
    clearInterval(timer);
    observer?.disconnect();
    window.removeEventListener("resize", schedule);
    window.removeEventListener("scroll", schedule, true);
    root.remove();
    root = null;
    lastStepId = "";
    lastTarget = null;
    if (finished) onEnd?.();
  }

  return { start, stop, isActive: () => !!root };
}

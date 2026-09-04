import { createClient } from "@supabase/supabase-js";

const BASE_URL = "https://jom-nittaku-webapp.vercel.app";
const CENTRE_PROFILE_KEY = "centre_profile";

export function initApp(config = {}) {
    const SUPABASE_URL = config.supabaseUrl || "";
    const SUPABASE_KEY = config.supabaseKey || "";
    const REPORT_TEMPLATE_SRC = config.reportTemplateSrc || "/Image 1.jpg?v=2";
    const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric"
    }).format(new Date());
    const CURRENT_MONTH_PREFIX = (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    })();
    const REPORT_TEMPLATE_SIZE = { width: 896, height: 1200 };
    const REPORT_TEMPLATE_BULLET_MASKS = [
      { left: 8.9, top: 45.35 },
      { left: 8.9, top: 47.93 },
      { left: 8.9, top: 54.35 },
      { left: 8.9, top: 56.92 },
      { left: 52.6, top: 45.35 },
      { left: 52.6, top: 47.93 },
      { left: 52.6, top: 54.35 },
      { left: 52.6, top: 56.92 }
    ];
    const REPORT_TEMPLATE_REMARK_TOPS = [62.4, 65.0, 67.6, 70.2, 72.8];
    const REPORT_TEMPLATE_REMARK_MASK_TOPS = [64.9, 67.5, 70.1, 72.7, 75.3];
    const REPORT_TEMPLATE_REMARK_LINE_TOPS = [66.5, 69.1, 71.7, 74.3, 76.9];
    const REPORT_CANVAS_REMARK_YS = [746, 777, 808, 839, 870];
    const REPORT_CANVAS_REMARK_MASK_YS = [768, 799, 830, 861, 892];
    const REPORT_CANVAS_REMARK_LINE_YS = [794, 825, 856, 887, 918];
    const REPORT_TEMPLATE_FOOTER_TOP_DEFAULT = 75.95;
    const REPORT_CANVAS_FOOTER_Y_DEFAULT = 950;
    const PHOTO_PLACEHOLDER_SVG = `
      <svg xmlns="http://www.w3.org/2000/svg" width="123" height="111" viewBox="0 0 123 111" aria-hidden="true">
        <rect width="123" height="111" rx="12" fill="#E5E7EB"></rect>
        <circle cx="61.5" cy="38" r="17" fill="#C4CBD6"></circle>
        <path d="M28 100c3.5-21 16-31.5 33.5-31.5S91.5 79 95 100" fill="#C4CBD6"></path>
      </svg>
    `;
    const PROFILE_IMAGE_BUCKET = "profile-images";

    const LESSON_LABELS = ["Footwork Fundamentals", "Forehand Drive", "Backhand Control", "Serve Precision", "Spin Reading", "Match Strategy", "Transition Drill", "Consistency Circuit"];
    const REPORT_STATUSES = ["Generated", "Pending"];
    const DEFAULT_COACH_LINKS = [
      { id: "reports", title: "View Reports", url: "/reports", icon: "▦", visible: true, order: 1 },
      { id: "contact", title: "Contact Coach", url: "mailto:", icon: "✉", visible: true, order: 2 }
    ];
    const supabase = hasSupabaseConfig()
      ? createClient(SUPABASE_URL, SUPABASE_KEY, {
          // Supabase owns the OAuth callback exchange and persists the session
          // before getSession() is read during bootstrap.
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        })
      : null;
    let state = createInitialState();
    state.centreProfile = getCentreProfile();
    let wizardDraftId = null;
    let onboardingModal = null;
    let studentEditModal = null;
    let loginError = "";
    let isSigningIn = false;
    let authReady = !supabase;
    let authInitializing = Boolean(supabase);
    let draftProfileUploadContext = null;
    let persistTimer = null;
    let isApplyingRemoteState = false;
    let realtimeChannel = null;
    let renderQueued = false;
    let appEventsBound = false;
    let reportFilterTimer = null;
    let coachFilterTimer = null;
    let studentFilterTimer = null;
    let centreQrDataUrlPromise = null;
    const coachQrDataUrlCache = new Map();
    let qrCodeModulePromise = null;
    let html2canvasModulePromise = null;
    let jsPdfModulePromise = null;
    let reportExportPromise = null;
    let reportExportKey = "";

    async function getQrCodeLib() {
      if (!qrCodeModulePromise) {
        qrCodeModulePromise = import("qrcode").then(module => module.default || module);
      }
      return qrCodeModulePromise;
    }

    async function getHtml2CanvasLib() {
      if (!html2canvasModulePromise) {
        html2canvasModulePromise = import("html2canvas").then(module => module.default || module);
      }
      return html2canvasModulePromise;
    }

    async function getJsPdfLib() {
      if (!jsPdfModulePromise) {
        jsPdfModulePromise = import("jspdf").then(module => module.jsPDF);
      }
      return jsPdfModulePromise;
    }

    function normalizeCentreProfile(profile = {}) {
      return {
        ...profile,
        links: Array.isArray(profile.links)
          ? profile.links.map((link, index) => ({
              id: link.id || `centre-link-${index + 1}`,
              label: link.label || link.title || link.name || "Centre link",
              url: String(link.url || link.value || "").trim()
            })).filter(link => link.url)
          : []
      };
    }

    function getCentreProfile() {
      try {
        const value = JSON.parse(localStorage.getItem(CENTRE_PROFILE_KEY) || "null");
        return normalizeCentreProfile(value && typeof value === "object" ? value : {});
      } catch (error) {
        return normalizeCentreProfile();
      }
    }
    function saveCentreProfile() {
      state.centreProfile = normalizeCentreProfile(state.centreProfile);
      localStorage.setItem(CENTRE_PROFILE_KEY, JSON.stringify(state.centreProfile));
      persist();
      if (supabase) {
        supabase
          .from("centre_links")
          .upsert({ id: "centre", links: state.centreProfile.links }, { onConflict: "id" })
          .catch(() => {});
      }
    }
    function centreLinkUrl(link) {
      return String(link.url || "").trim();
    }

    function initials(name) {
      return name.split(" ").map(part => part[0] || "").join("").slice(0, 2).toUpperCase();
    }

    function blankSummary() {
      return {
        whatTaught: "",
        beforeCoaching: "",
        afterTraining: "",
        nextLesson: "",
        remarks: ""
      };
    }

    function normalizeSummary(summary = {}) {
      return {
        whatTaught: summary.whatTaught ?? summary.techniques ?? "",
        beforeCoaching: summary.beforeCoaching ?? summary.progress ?? "",
        afterTraining: summary.afterTraining ?? summary.additional ?? "",
        nextLesson: summary.nextLesson ?? summary.future ?? "",
        remarks: summary.remarks ?? ""
      };
    }

    function normalizeCoach(coach) {
      const photo = coach.photo || coach.photo_url || coach.photoUrl || coach.image_url || "";
      return {
        ...coach,
        slug: coach.slug || slugify(coach.name),
        role: coach.role || "Table Tennis Coach",
        bio: coach.bio || "",
        photo,
        photo_url: photo,
        links: Array.isArray(coach.links) && coach.links.length
          ? coach.links.map((link, index) => ({
              ...link,
              id: link.id || `link-${index + 1}`,
              visible: link.visible !== false,
              order: link.order || index + 1
            }))
          : DEFAULT_COACH_LINKS.map(link => ({ ...link })),
        branchAddress: coach.branchAddress || coach.branch || ""
      };
    }

    function slugify(value) {
      return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "coach";
    }

    function coachPublicUrl(coach) {
      return `${window.location.origin}/coach/${coach.slug}`;
    }

    async function loadQrDataUrl(coach, width = 200) {
      const cacheKey = `${coach.id}:${Math.max(200, width)}`;
      if (coachQrDataUrlCache.has(cacheKey)) {
        return coachQrDataUrlCache.get(cacheKey);
      }

      const qrPromise = getQrCodeLib().then(QRCode => QRCode.toDataURL(coachPublicUrl(coach), {
        width: Math.max(200, width),
        margin: 1,
        errorCorrectionLevel: "M",
        color: {
          dark: "#000000",
          light: "#ffffff"
        }
      })).catch(error => {
        coachQrDataUrlCache.delete(cacheKey);
        throw error;
      });

      coachQrDataUrlCache.set(cacheKey, qrPromise);
      return qrPromise;
    }

    function getCoachBySlug(slug) {
      return state.coaches.find(coach => coach.slug === String(slug || "").toLowerCase());
    }

    function normalizeReport(report) {
      return {
        ...report,
        status: REPORT_STATUSES.includes(report.status) ? report.status : "Pending",
        summary: normalizeSummary(report.summary)
      };
    }

    function normalizeStudent(student) {
      return {
        ...student,
        photo: student.photo || student.photo_url || student.photoUrl || student.image_url || ""
      };
    }

    function normalizeDraft(draft) {
      return {
        ...draft,
        summary: normalizeSummary(draft.summary)
      };
    }

    function normalizeState(rawState) {
      const defaults = createInitialState();
      const mergeList = (rawList, defaultList, normalizer) => {
        const sourceList = Array.isArray(rawList) ? rawList : defaultList;
        return sourceList.map(normalizer);
      };
      return {
        ...defaults,
        ...rawState,
        dataVersion: 3,
        auth: defaults.auth,
        ui: rawState.ui || defaults.ui,
        adminProfile: rawState.adminProfile || defaults.adminProfile,
        centreProfile: normalizeCentreProfile(rawState.centreProfile || defaults.centreProfile),
        coaches: mergeList(rawState.coaches, defaults.coaches, normalizeCoach),
        students: mergeList(rawState.students, defaults.students, normalizeStudent),
        reports: mergeList(rawState.reports, defaults.reports, normalizeReport),
        reportDrafts: Object.fromEntries(Object.entries(rawState.reportDrafts && Object.keys(rawState.reportDrafts).length ? rawState.reportDrafts : defaults.reportDrafts).map(([key, draft]) => [key, normalizeDraft(draft)]))
      };
    }

    function hasSupabaseConfig() {
      return Boolean(SUPABASE_URL && SUPABASE_KEY);
    }

    async function loadState() {
      if (!hasSupabaseConfig()) {
        return normalizeState(createInitialState());
      }
      try {
        const { data, error } = await supabase
          .from("dashboard_state")
          .select("payload")
          .eq("id", "dashboard")
          .single();
        if (!error && data?.payload && data.payload.dataVersion >= 2) {
          return normalizeState(data.payload);
        }
      } catch (error) {}
      return normalizeState(createInitialState());
    }

    async function loadPublicCentreProfile() {
      const localProfile = getCentreProfile();
      if (!supabase) return localProfile;
      try {
        const { data, error } = await supabase
          .from("centre_links")
          .select("links")
          .eq("id", "centre")
          .maybeSingle();
        if (!error && data) {
          return normalizeCentreProfile({ links: data.links });
        }
      } catch (error) {}
      return localProfile;
    }

    async function flushStateToSupabase() {
      if (!hasSupabaseConfig() || isApplyingRemoteState) {
        return;
      }
      const payload = { ...state, auth: { role: null, coachId: null, userId: null } };
      await supabase
        .from("dashboard_state")
        .upsert({ id: "dashboard", payload }, { onConflict: "id" });
    }

    function persist() {
      if (!hasSupabaseConfig()) {
        return;
      }
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        flushStateToSupabase().catch(() => {});
      }, 250);
    }

    function applyRemoteState(payload) {
      if (!payload) return;
      isApplyingRemoteState = true;
      // auth and ui are per-browser session state. They are deliberately not
      // written to the shared dashboard_state row, so normalizeState() resets
      // them to blank defaults. Carrying the live values over prevents an
      // incoming change (including the echo of this client's own write) from
      // signing the user out or yanking them to a different tab.
      const liveAuth = state.auth;
      const liveUi = state.ui;
      const focusedWizardField = document.activeElement?.closest("#wizardModal input, #wizardModal textarea, #wizardModal select");
      const localWizardDraft = focusedWizardField && wizardDraftId && state.reportDrafts?.[wizardDraftId]
        ? {
            ...state.reportDrafts[wizardDraftId],
            summary: { ...state.reportDrafts[wizardDraftId].summary }
          }
        : null;
      state = normalizeState(payload);
      state.auth = liveAuth;
      state.ui = liveUi;
      if (localWizardDraft) {
        // Realtime echoes must not replace the wizard while a field is active.
        // Keep the locally edited draft until the field loses focus or the user
        // explicitly navigates to another wizard step.
        state.reportDrafts[wizardDraftId] = localWizardDraft;
        isApplyingRemoteState = false;
        return;
      }
      render();
      window.setTimeout(() => {
        isApplyingRemoteState = false;
      }, 0);
    }

    function subscribeToRealtime() {
      if (!supabase) return;
      realtimeChannel = supabase
        .channel("dashboard-state-live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "dashboard_state" },
          payload => {
            const nextPayload = payload.new?.payload;
            if (payload.new?.id === "dashboard" && nextPayload) {
              applyRemoteState(nextPayload);
            }
          }
        )
        .subscribe();
    }

    function createInitialState() {
      return {
        dataVersion: 3,
        auth: { role: null, coachId: null, userId: null },
        ui: { page: "overview", avatarMenuOpen: false, reportViewId: null, adminToast: "" },
        adminProfile: { fullName: "JomNittaku Admin", photo: "" },
        centreProfile: { links: [] },
        coaches: [],
        students: [],
        reports: [],
        reportDrafts: {}
      };
    }

    function getCurrentCoach() {
      if (!state.coaches.length) {
        return {
          id: "coach-placeholder",
          name: "Coach",
          branch: "",
          centreContact: "",
          email: "",
          phone: "",
          slug: "coach",
          role: "Table Tennis Coach",
          bio: "",
          photo: "",
          photo_url: "",
          links: [],
          status: "Active",
          reportsGeneratedThisMonth: 0,
          reportsTotal: 0,
          studentIds: [],
          branchAddress: ""
        };
      }
      return state.coaches.find(coach => coach.id === state.auth.coachId) || state.coaches[0];
    }

    function getUserProfile() {
      if (state.auth.role === "admin") {
        return { name: state.adminProfile.fullName, photo: state.adminProfile.photo };
      }
      const coach = getCurrentCoach();
      return { name: coach.name, photo: coach.photo };
    }

    function formatDate(date) {
      return new Date(date + "T00:00:00").toLocaleDateString("en-MY", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    }

    function formatTime(time24) {
      const [hour, minute] = time24.split(":").map(Number);
      const suffix = hour >= 12 ? "PM" : "AM";
      const normalized = hour % 12 || 12;
      return `${normalized}:${String(minute).padStart(2, "0")} ${suffix}`;
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function sanitizeLines(value, limit = 2) {
      return String(value || "")
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .slice(0, limit);
    }

    function splitRemarkLines(value, limit = 5) {
      const normalized = String(value || "").replace(/\s+/g, " ").trim();
      if (!normalized) return [];
      return [normalized].slice(0, limit);
    }

    function getReportTemplateData(report) {
      const coach = getCoachById(report.coachId);
      const student = getStudentById(report.studentId);
      const summary = normalizeSummary(report.summary);
      return {
        report,
        coach,
        student,
        session: {
          date: formatDate(report.date),
          time: formatTime(report.time),
          centre: coach.branch,
          coachName: coach.name
        },
        summary,
        bullets: {
          whatTaught: sanitizeLines(summary.whatTaught),
          beforeCoaching: sanitizeLines(summary.beforeCoaching),
          afterTraining: sanitizeLines(summary.afterTraining),
          nextLesson: sanitizeLines(summary.nextLesson)
        },
        remarksLines: splitRemarkLines(summary.remarks),
        centreContact: coach.centreContact || "",
          address: coach.branchAddress || coach.branch || "",
        studentPhoto: student?.photo || student?.photo_url || student?.photoUrl || student?.image_url || "",
        coachPhoto: coach?.photo || coach?.photo_url || coach?.photoUrl || coach?.image_url || ""
      };
    }

    function renderTemplatePhoto(photo, label) {
      return `
        <div class="template-photo-card">
          <div class="template-photo-frame">
            <img class="template-photo" src="${photo || `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(PHOTO_PLACEHOLDER_SVG)}`}" alt="">
          </div>
          <div class="template-photo-label">${label}</div>
        </div>
      `;
    }

    function renderBulletOverlays(lines, positions) {
      return positions.map((position, index) => `
        <div class="template-text template-bullet" style="left:${position.left}%;top:${position.top}%;width:${position.width}%;">
          ${lines[index] ? escapeHtml(lines[index].replace(/^\s*[•●-]\s*/, "")) : ""}
        </div>
      `).join("");
    }

    function renderPlainBulletOverlays(lines, positions) {
      return positions.map((position, index) => `
        <div class="template-text template-bullet ${lines[index] ? (lines[index].length > 48 ? "is-compact" : "") : "empty"}" style="left:${position.left}%;top:${position.top}%;width:${position.width}%;height:${position.height}%;">
          <span>${lines[index] ? escapeHtml(lines[index].replace(/^\s*[•●-]\s*/, "")) : ""}</span>
        </div>
      `).join("");
    }

    function splitReportRemarks(value, limit = 5) {
      return String(value || "")
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean)
        .slice(0, limit);
    }

    function renderReportTemplate(report) {
      const data = getReportTemplateData(report);
      const footerTop = data.remarksLines.length
        ? Math.min(
            REPORT_TEMPLATE_FOOTER_TOP_DEFAULT,
            REPORT_TEMPLATE_REMARK_LINE_TOPS[data.remarksLines.length - 1] + 1.35
          )
        : REPORT_TEMPLATE_FOOTER_TOP_DEFAULT;
      return `
        <div class="template-report-shell" id="reportTemplatePreview">
          <img class="template-report-base" src="${REPORT_TEMPLATE_SRC}" alt="Training report template">
          <div class="template-report-overlay" aria-hidden="true">
            <div class="template-text template-session" style="left:17.9%;top:27.2%;width:23%;">${escapeHtml(data.session.date)}</div>
            <div class="template-text template-session" style="left:17.9%;top:29.58%;width:23%;">${escapeHtml(data.session.time)}</div>
            <div class="template-text template-session template-session-centre" style="left:17.9%;top:31.94%;width:25%;">${escapeHtml(data.session.centre)}</div>
            <div class="template-text template-session" style="left:24.25%;top:34.34%;width:19%;">${escapeHtml(data.session.coachName)}</div>

            <div class="template-report-photo-group">
              ${renderTemplatePhoto(data.studentPhoto, "STUDENT")}
              ${renderTemplatePhoto(data.coachPhoto, "COACH")}
            </div>

            ${REPORT_TEMPLATE_BULLET_MASKS.map(mask => `
              <div class="template-bullet-mask" style="left:${mask.left}%;top:${mask.top}%;"></div>
            `).join("")}

            ${renderPlainBulletOverlays(data.bullets.whatTaught, [
              { left: 11.8, top: 44.9, width: 35.2, height: 4.4 },
              { left: 11.8, top: 47.48, width: 35.2, height: 4.4 }
            ])}
            ${renderPlainBulletOverlays(data.bullets.beforeCoaching, [
              { left: 11.8, top: 52.8, width: 35.2, height: 4.4 },
              { left: 11.8, top: 55.35, width: 35.2, height: 4.4 }
            ])}
            ${renderPlainBulletOverlays(data.bullets.afterTraining, [
              { left: 55.4, top: 44.9, width: 38.5, height: 4.4 },
              { left: 55.4, top: 47.48, width: 38.5, height: 4.4 }
            ])}
            ${renderPlainBulletOverlays(data.bullets.nextLesson, [
              { left: 55.4, top: 52.8, width: 38.5, height: 4.4 },
              { left: 55.4, top: 55.35, width: 38.5, height: 4.4 }
            ])}

              ${REPORT_TEMPLATE_REMARK_TOPS.map((top, index) => data.remarksLines[index] ? `
                <div class="template-text template-bullet template-remarks-bullet" style="left:10.1%;top:${top}%;width:86%;">
                  <span>${escapeHtml(data.remarksLines[index])}</span>
                </div>
              ` : "").join("")}

            <div class="template-text template-footer-number" style="left:34.55%;top:79.9%;width:31.2%;">${escapeHtml(data.centreContact)}</div>
            <div class="template-text template-footer-address" style="left:34.55%;top:86.35%;width:31.2%;">${escapeHtml(data.address).replace(/\n/g, "<br>")}</div>
          </div>
          <div class="template-report-qr-pocket">
            <img class="template-report-qr" data-qr-centre src="" alt="Scan to open centre links">
          </div>
        </div>
      `;
    }

    function getStudentById(studentId) {
      return state.students.find(student => student.id === studentId);
    }

    function getCoachById(coachId) {
      return state.coaches.find(coach => coach.id === coachId);
    }

    function statusBadge(status) {
      const normalizedStatus = REPORT_STATUSES.includes(status) ? status : "Pending";
      const key = normalizedStatus === "Generated" ? "green" : "amber";
      return `<span class="badge ${key}"><span class="dot"></span>${normalizedStatus}</span>`;
    }

    function avatarMarkup(name, photo, size = "avatar") {
      const content = photo
        ? ""
        : initials(name);
      const style = photo ? `style="background-image:url('${photo}');"` : "";
      return `<span class="${size}" ${style}>${content}</span>`;
    }

    async function signIn() {
      if (!supabase) {
        loginError = "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.";
        return render();
      }
      const email = document.getElementById("loginEmail")?.value.trim().toLowerCase();
      const password = document.getElementById("loginPassword")?.value || "";
      if (!email || !password) {
        loginError = "Enter your email and password.";
        return render();
      }
      isSigningIn = true;
      loginError = "";
      render();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      isSigningIn = false;
      if (error) {
        loginError = error.message || "Unable to sign in.";
        return render();
      }
      state = await loadState();
      await applyAuthUser(data.user);
      state.ui.page = "overview";
      state.ui.avatarMenuOpen = false;
      state.ui.reportViewId = null;
      render();
    }

    async function signInWithGoogle() {
      if (!supabase) {
        loginError = "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.";
        return render();
      }
      isSigningIn = true;
      loginError = "";
      render();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` }
      });
      if (error) {
        isSigningIn = false;
        loginError = error.message || "Unable to sign in with Google.";
        render();
      }
    }

    async function applyAuthUser(user) {
      if (!user) {
        state.auth = { role: null, coachId: null, userId: null };
        return;
      }
      const appRole = user.app_metadata?.role;
      const coachId = user.app_metadata?.coach_id;
      let coach = state.coaches.find(item => item.id === coachId)
        || state.coaches.find(item => item.email?.toLowerCase() === user.email?.toLowerCase());
      if (!coach && supabase) {
        // OAuth account provisioning runs in a database trigger and can lag
        // behind the auth session by a few hundred milliseconds.
        for (let attempt = 0; attempt < 10 && !coach; attempt += 1) {
          const { data } = await supabase.from("coaches").select("*").eq("id", user.id).maybeSingle();
          if (data) {
            coach = normalizeCoach(data);
            state.coaches = [coach, ...state.coaches.filter(item => item.id !== coach.id)];
          } else if (attempt < 9) {
            await new Promise(resolve => window.setTimeout(resolve, 300));
          }
        }
      }
      const isGoogleUser = user.app_metadata?.provider === "google"
        || user.identities?.some(identity => identity.provider === "google");
      if (!coach && isGoogleUser) {
        // A trigger can provision the row after the first session (or an
        // existing Google user may predate that trigger). Keep the session
        // alive and give the account a usable local profile while the row is
        // reconciled on the next state refresh.
        coach = normalizeCoach({
          id: user.id,
          name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Coach",
          email: user.email || "",
          branch: "Unassigned",
          branchAddress: "Unassigned"
        });
        state.coaches = [coach, ...state.coaches.filter(item => item.id !== coach.id)];
      }
      state.auth = {
        role: appRole === "admin" ? "admin" : coach ? "coach" : null,
        coachId: coach?.id || null,
        userId: user.id
      };
      if (!state.auth.role) {
        await supabase.auth.signOut();
        loginError = "This account is not assigned as an admin or coach.";
      }
    }

    function bindAuthStateListener() {
      if (!supabase) return;
      supabase.auth.onAuthStateChange((_event, session) => {
        window.setTimeout(async () => {
          await applyAuthUser(session?.user || null);
          if (!authInitializing) render();
        }, 0);
      });
    }

    async function logout() {
      if (supabase) await supabase.auth.signOut();
      state.auth = { role: null, coachId: null, userId: null };
      loginError = "";
      state.ui.page = "overview";
      state.ui.avatarMenuOpen = false;
      state.ui.reportViewId = null;
      persist();
      wizardDraftId = null;
      scheduleRender();
    }

    function navigate(page) {
      if (page === "centre-settings" && !["admin", "coach"].includes(state.auth.role)) {
        state.ui.page = "overview";
        return scheduleRender();
      }
      if (state.auth.role === "coach" && page === "coaches") {
        return;
      }
      state.ui.page = page;
      state.ui.avatarMenuOpen = false;
      persist();
      scheduleRender();
    }

    function getVisibleCoaches() {
      return state.auth.role === "admin"
        ? state.coaches
        : state.coaches.filter(coach => coach.id === getCurrentCoach().id);
    }

    function getVisibleStudents() {
      return state.auth.role === "admin"
        ? state.students
        : state.students.filter(student => student.coachId === getCurrentCoach().id);
    }

    function getVisibleReportsForMonth(monthPrefix) {
      return getVisibleReports().filter(report => {
        const createdValue = report.generatedAt || report.date || "";
        const createdDate = new Date(createdValue);
        if (Number.isNaN(createdDate.getTime())) {
          return String(createdValue).startsWith(monthPrefix);
        }
        const createdMonth = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, "0")}`;
        return createdMonth === monthPrefix;
      });
    }

    function getPreviousMonthPrefix() {
      const previousMonth = new Date();
      previousMonth.setMonth(previousMonth.getMonth() - 1);
      return `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, "0")}`;
    }

    function formatPercentChange(current, previous) {
      if (previous === 0) return current > 0 ? "up 100% vs last month" : "no change vs last month";
      const percent = Math.round(((current - previous) / previous) * 100);
      return `${percent >= 0 ? "up" : "down"} ${Math.abs(percent)}% vs last month`;
    }

    function overviewStats() {
      const reportsThisMonth = getVisibleReportsForMonth(CURRENT_MONTH_PREFIX).length;
      const reportsLastMonth = getVisibleReportsForMonth(getPreviousMonthPrefix()).length;
      const activeStudents = getVisibleStudents().filter(student => student.status !== "Inactive").length;
      const activeCoaches = getVisibleCoaches().filter(coach => coach.status !== "Inactive").length;
      const stats = [
        { title: "Reports Created This Month", value: reportsThisMonth, footnote: formatPercentChange(reportsThisMonth, reportsLastMonth), tone: reportsThisMonth >= reportsLastMonth ? "positive" : "negative" },
        { title: "Total Students", value: activeStudents, footnote: "" }
      ];
      if (state.auth.role === "admin") {
        stats.push({ title: "Total Coaches", value: activeCoaches, footnote: "" });
      }
      return stats;
    }

    function sortReportsDesc(reports) {
      return [...reports].sort((a, b) => {
        const aStamp = `${a.date}T${a.time}`;
        const bStamp = `${b.date}T${b.time}`;
        return bStamp.localeCompare(aStamp);
      });
    }

    function getVisibleReports() {
      const reports = state.auth.role === "admin"
        ? state.reports
        : state.reports.filter(report => report.coachId === getCurrentCoach().id);
      return sortReportsDesc(reports);
    }

    function renderLogin() {
      return `
        <section class="login-screen">
          <div class="login-panel">
            <div class="brand-lockup">
              <div class="brand-mark"></div>
              <div class="brand-copy">
                <h1>JomNittaku</h1>
                <p>Coach Reporting System</p>
              </div>
            </div>
            <h2 class="login-title">Sign in</h2>
            <form class="login-form">
              <div class="field">
                <label for="loginEmail">Email</label>
                <input id="loginEmail" class="text-input" type="email" autocomplete="email" required>
              </div>
              <div class="field">
                <label for="loginPassword">Password</label>
                <input id="loginPassword" class="text-input" type="password" autocomplete="current-password" required>
              </div>
              ${loginError ? `<p class="form-error" role="alert">${escapeHtml(loginError)}</p>` : ""}
              <button class="primary-btn" type="submit" ${isSigningIn ? "disabled" : ""}>${isSigningIn ? "Signing in..." : "Sign in"}</button>
              <div class="login-divider"><span>or</span></div>
              <button class="google-btn" type="button" data-action="sign-in-google" ${isSigningIn ? "disabled" : ""}>
                <span class="google-mark" aria-hidden="true">G</span>
                Continue with Google
              </button>
            </form>
          </div>
        </section>
      `;
    }

    function renderSidebar() {
      const role = state.auth.role;
      const items = role === "admin"
        ? [
            ["overview", "⌂", "Overview"],
            ["reports", "▦", "Reports"],
            ["coaches", "◫", "Coaches"],
            ["students", "●", "Students"],
            ["settings", "⚙", "Settings"]
          ]
        : [
            ["overview", "⌂", "Overview"],
            ["reports", "▦", "Reports"],
            ["students", "●", "Students"]
          ];

      return `
        <aside class="sidebar">
          <div>
            <div class="sidebar-logo">
              <div class="logo-ball"></div>
              <div class="logo-copy">
                <strong>JomNittaku</strong>
                <span>${MONTH_LABEL}</span>
              </div>
            </div>
          </div>
          <nav class="nav-list">
            ${items.map(([page, icon, label]) => `
              <button class="nav-item ${state.ui.page === page ? "active" : ""}" data-nav="${page}">
                <span class="nav-icon">${icon}</span>
                <span>${label}</span>
              </button>
            `).join("")}
          </nav>
        </aside>
      `;
    }

    function renderTopbar() {
      const profile = getUserProfile();
      return `
        <div class="topbar">
          <div class="topbar-actions">
            ${state.auth.role === "coach" ? `<button class="primary-btn" data-action="new-report">+ New Report</button>` : ""}
            <button class="avatar-btn" data-action="toggle-avatar-menu" ${profile.photo ? `style="background-image:url('${profile.photo}');"` : ""}>
              ${profile.photo ? "" : initials(profile.name)}
            </button>
            <div class="avatar-dropdown ${state.ui.avatarMenuOpen ? "" : "hidden"}">
              <button class="dropdown-item" data-action="open-profile">Profile</button>
              <button class="dropdown-item" data-action="logout">Logout</button>
            </div>
          </div>
        </div>
      `;
    }

    function renderStats() {
      return `
        <section class="stats-grid">
          ${overviewStats().map(stat => `
            <article class="stat-card">
              <h3>${stat.title}</h3>
              <div class="value">${stat.value}</div>
              <div class="stat-footnote ${stat.tone || ""}">${stat.footnote || ""}</div>
            </article>
          `).join("")}
        </section>
      `;
    }

    function renderOverviewPage() {
      const visibleReports = getVisibleReports().slice(0, 5);
      return `
        <section class="page ${state.ui.page === "overview" ? "active" : ""}">
          ${renderStats()}
          <div class="table-card">
            <div class="table-topline">
              <div class="section-title">
                <h2>Recent Reports</h2>
              </div>
              <button class="plain-link table-title-link" data-nav="reports">View all <span aria-hidden="true">→</span></button>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>REF #</th>
                    <th>STUDENT</th>
                    <th>LESSON</th>
                    <th>DATE & TIME</th>
                    <th>REPORT STATUS</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${visibleReports.map(report => {
                    const student = getStudentById(report.studentId);
                    return `
                      <tr>
                        <td>${report.ref}</td>
                        <td>${student.name}</td>
                        <td>Lesson ${report.lessonNumber}</td>
                        <td>${formatDate(report.date)}, ${formatTime(report.time)}</td>
                        <td>${statusBadge(report.status)}</td>
                        <td><button class="icon-btn" data-action="view-report" data-report-id="${report.id}" aria-label="View report">→</button></td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      `;
    }

    function renderReportsPage() {
      const studentOptions = state.students
        .filter(student => state.auth.role === "admin" || student.coachId === getCurrentCoach().id)
        .map(student => `<option value="${student.id}">${escapeHtml(student.name)}</option>`).join("");
      const reportMonths = [...new Set(state.reports.map(report => report.date.slice(0, 7)))].sort().reverse();
      return `
        <section class="page ${state.ui.page === "reports" ? "active" : ""}">
          <div class="table-card">
            <div class="table-topline">
              <div class="section-title">
                <h2>Reports</h2>
              </div>
            </div>
            <div class="reports-filter-bar">
              <input id="reportsSearch" class="search-input" type="search" placeholder="Search by name or ref number...">
              <select id="reportsStudentFilter" class="filter-select">
                <option value="">All students</option>
                ${studentOptions}
              </select>
              <select id="reportsDateFilter" class="filter-select">
                <option value="">All dates</option>
                <option value="month">By month</option>
                <option value="day">By day</option>
                <option value="week1">1st - 7th</option>
                <option value="week2">8th - 14th</option>
                <option value="week3">15th - 21st</option>
                <option value="week4">22nd - end of month</option>
                <option value="custom">Custom range</option>
              </select>
              <select id="reportsMonthFilter" class="filter-select hidden">
                ${reportMonths.map(month => `<option value="${month}">${escapeHtml(new Date(`${month}-01T00:00:00`).toLocaleDateString("en-MY", { month: "long", year: "numeric" }))}</option>`).join("")}
              </select>
              <input id="reportsDayFilter" class="text-input hidden" type="date" aria-label="Report day">
              <div class="report-custom-dates hidden" id="reportsCustomDates">
                <input id="reportsDateFrom" class="text-input" type="date" aria-label="From date">
                <input id="reportsDateTo" class="text-input" type="date" aria-label="To date">
              </div>
              <select id="reportsStatusFilter" class="filter-select">
                <option value="">All statuses</option>
                <option value="Generated">Generated</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
            <div class="table-wrap" style="margin-top:18px;">
              <table id="reportsTable">
                <thead>
                  <tr>
                    <th>REF #</th>
                    <th>STUDENT</th>
                    <th>COACH</th>
                    <th>LESSON</th>
                    <th>DATE & TIME</th>
                    <th>REPORT STATUS</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </section>
      `;
    }

    function renderCoachesPage() {
      return `
        <section class="page ${state.ui.page === "coaches" ? "active" : ""}">
          <div class="table-card">
            <div class="table-topline">
              <div class="section-title">
                <h2>Coaches</h2>
                <p>${getVisibleCoaches().filter(coach => coach.status !== "Inactive").length} active coaches</p>
              </div>
              <button class="primary-btn" data-action="stub-add-coach">+ Add Coach</button>
            </div>
            <div class="students-filter-bar">
              <input id="coachSearch" class="search-input" type="search" placeholder="Search coach">
            </div>
            <div class="table-wrap" style="margin-top:18px;">
              <table id="coachesTable">
                <thead>
                  <tr>
                    <th>COACH</th>
                    <th>STUDENTS</th>
                    <th>REPORTS</th>
                    <th>STATUS</th>
                    <th>PUBLIC PROFILE</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </section>
      `;
    }

    function renderStudentsPage() {
      const filter = state.auth.role === "admin"
        ? `
          <select id="studentCoachFilter" class="filter-select">
            <option value="">All coaches</option>
            ${state.coaches.map(coach => `<option value="${coach.id}">${coach.name}</option>`).join("")}
          </select>
        `
        : "";

      return `
        <section class="page ${state.ui.page === "students" ? "active" : ""}">
          <div class="table-card">
            <div class="table-topline">
              <div class="section-title">
                <h2>Students</h2>
                <p>${getVisibleStudents().filter(student => student.status !== "Inactive").length} active students</p>
              </div>
              <button class="primary-btn" data-action="add-student">+ Add Student</button>
            </div>
            <div class="students-filter-bar">
              <input id="studentSearch" class="search-input" type="search" placeholder="Search student">
              ${filter}
            </div>
            <div class="table-wrap" style="margin-top:18px;">
              <table id="studentsTable">
                <thead>
                  <tr>
                    <th>STUDENT</th>
                    ${state.auth.role === "admin" ? "<th>ASSIGNED COACH</th>" : ""}
                    <th>LESSONS</th>
                    <th>PARENT HP</th>
                    <th>PHOTO</th>
                    <th>STATUS</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </section>
      `;
    }

    function renderAdminProfilePage() {
      return `
        <section class="page ${state.ui.page === "settings" ? "active" : ""}">
          <div class="profile-card">
            <div class="section-title" style="margin-bottom:20px;">
              <h2>Admin Profile</h2>
              <p>Update your full name and profile picture.</p>
            </div>
            <div class="profile-avatar-wrap">
              <div class="profile-avatar-lg" id="adminProfileAvatar" ${state.adminProfile.photo ? `style="background-image:url('${state.adminProfile.photo}');"` : ""}>
                ${state.adminProfile.photo ? "" : initials(state.adminProfile.fullName)}
              </div>
              <div>
                <button class="secondary-btn" data-action="upload-admin-photo">Upload Profile Picture</button>
              </div>
            </div>
            <div class="profile-grid">
              <div class="field">
                <label for="adminFullName">Full Name</label>
                <input id="adminFullName" class="text-input" type="text" value="${state.adminProfile.fullName}">
              </div>
            </div>
            <div style="margin-top:20px;">
              <button class="primary-btn" data-action="save-admin-profile">Save Changes</button>
            </div>
          </div>
        </section>
      `;
    }

    function renderCoachProfilePage() {
      const coach = getCurrentCoach();
      return `
        <section class="page ${state.ui.page === "profile" ? "active" : ""}">
          <div class="back-row">
            <button class="ghost-btn" data-action="back-from-profile">Back</button>
          </div>
          <div class="profile-card">
            <div class="section-title" style="margin-bottom:20px;">
              <h2>Coach Profile</h2>
              <p>Update the coach information used across reports and the dashboard.</p>
            </div>
            <div class="profile-avatar-wrap">
              <button class="profile-avatar-lg" id="coachProfileAvatar" data-action="upload-coach-photo" ${coach.photo ? `style="background-image:url('${coach.photo}');"` : ""}>
                ${coach.photo ? "" : initials(coach.name)}
              </button>
              <div>
                <strong>Profile Picture</strong>
                <p class="muted">Click the avatar circle to upload a new coach photo.</p>
              </div>
            </div>
            <div class="profile-grid">
              <div class="field">
                <label for="coachFullName">Full Name</label>
                <input id="coachFullName" class="text-input" type="text" value="${coach.name}">
              </div>
              <div class="field">
                <label for="coachBranch">Centre / Branch</label>
                <input id="coachBranch" class="text-input" type="text" value="${coach.branch}">
              </div>
              <div class="field">
                <label for="coachCentreContact">Centre Contact Number</label>
                <input id="coachCentreContact" class="text-input" type="text" value="${coach.centreContact}">
              </div>
              <div class="field">
                <label for="coachBranchAddress">Address</label>
                <textarea id="coachBranchAddress" class="text-area" style="min-height:110px;">${coach.branchAddress || coach.branch || ""}</textarea>
              </div>
              <div class="field">
                <label for="coachEmail">Email (optional)</label>
                <input id="coachEmail" class="text-input" type="email" value="${coach.email || ""}">
              </div>
              <div class="field">
                <label for="coachPhone">Phone Number (optional)</label>
                <input id="coachPhone" class="text-input" type="text" value="${coach.phone || ""}">
              </div>
            </div>
            <div style="margin-top:20px;">
              <button class="primary-btn" data-action="save-coach-profile">Save Changes</button>
            </div>
          </div>
        </section>
      `;
    }

    function renderReportViewPage() {
      const report = state.reports.find(item => item.id === state.ui.reportViewId);
      if (!report) {
        return "";
      }
      const student = getStudentById(report.studentId);
      const coach = getCoachById(report.coachId);
      return `
        <section class="page ${state.ui.page === "report-view" ? "active" : ""}">
          <div class="report-view-wrap">
            <div class="back-row">
              <button class="ghost-btn" data-action="close-report-view">Back</button>
            </div>
            <div class="report-paper">
              <div class="section-header" style="margin-bottom:18px;">
                <div class="section-title">
                  <h2>${student.name} · Lesson ${report.lessonNumber}</h2>
                  <p>${coach.name} · ${formatDate(report.date)} · ${formatTime(report.time)}</p>
                </div>
                <div class="report-actions">
                  <button class="primary-btn" data-action="download-report-pdf">Download PDF</button>
                </div>
              </div>
              ${renderReportTemplate(report)}
            </div>
          </div>
        </section>
      `;
      const summary = report.summary || {};
      const remarksLines = splitReportRemarks(summary.remarks);

      const listFromText = value => (value || "").split("\n").filter(Boolean).map(item => `<li>${item}</li>`).join("") || "<li>-</li>";

      return `
        <section class="page ${state.ui.page === "report-view" ? "active" : ""}">
          <div class="report-view-wrap">
            <div class="back-row">
              <button class="ghost-btn" data-action="close-report-view">Back</button>
            </div>
            <div class="report-paper">
              <div class="report-frame">
                <div class="report-header">
                  <div class="report-brand">
                    <div class="brand-mark" style="width:64px;height:64px;border-radius:22px;"></div>
                    <div class="report-brand-copy">
                      <small>Dao Sports Method</small>
                      <h2>TABLE TENNIS TRAINING</h2>
                      <p>Character Transformation thru Sports</p>
                    </div>
                  </div>
                  <div class="badge ${report.status === "Generated" ? "green" : report.status === "Pending" ? "amber" : "grey"}">${report.status}</div>
                </div>
                <div class="decorative-title">This Is A Training Report</div>
                <div class="report-info-grid">
                  <div class="underline-list">
                    <div class="underline-row"><strong>Date</strong><span>${formatDate(report.date)}</span></div>
                    <div class="underline-row"><strong>Time</strong><span>${formatTime(report.time)}</span></div>
                    <div class="underline-row"><strong>Centre</strong><span>${coach.branch}</span></div>
                    <div class="underline-row"><strong>Coach Name</strong><span>${coach.name}</span></div>
                  </div>
                  <div class="report-photo-row">
                    <div class="report-photo-card">
                      <div class="photo" ${student.photo ? `style="background-image:url('${student.photo}');"` : ""}>${student.photo ? "" : initials(student.name)}</div>
                      <strong>STUDENT</strong>
                    </div>
                    <div class="report-photo-card">
                      <div class="photo" ${coach.photo ? `style="background-image:url('${coach.photo}');"` : ""}>${coach.photo ? "" : initials(coach.name)}</div>
                      <strong>COACH</strong>
                    </div>
                  </div>
                </div>
                <div class="report-summary">
                  <div class="report-section">
                    <h4>Techniques and Skills Covered</h4>
                    <ul>${listFromText(summary.techniques)}</ul>
                    <h4 style="margin-top:16px;">Skill Assessment and Progress</h4>
                    <ul>${listFromText(summary.progress)}</ul>
                  </div>
                  <div class="report-section">
                    <h4>Future Recommendations</h4>
                    <ul>${listFromText(summary.future)}</ul>
                    <h4 style="margin-top:16px;">Additional Skill Assessment and Progress</h4>
                    <ul>${listFromText(summary.additional)}</ul>
                  </div>
                </div>
                <div class="remarks-box">
                  <h4>Coach Remarks</h4>
                  <div class="remarks-lines">${remarksLines.length ? remarksLines.map(line => `<div class="remarks-line">${escapeHtml(line)}</div>`).join("") : `<div class="remarks-line">-</div>`}</div>
                </div>
                <div class="report-footer">
                  <div class="footer-badge">
                    <div class="footer-seal">TTAM</div>
                    <div>Certified Coach</div>
                  </div>
                  <div class="footer-center">
                    <strong>${coach.centreContact}</strong><br>
                    Dao Sports Method
                  </div>
                    <div>
                    </div>
                  </div>
                </div>
                <div class="report-bottom-bar">JOMNITTAKU - Passion · Focus · Excellent</div>
              </div>
            </div>
          </div>
        </section>
      `;
    }

    function renderReportWizard() {
      const draft = wizardDraftId ? state.reportDrafts[wizardDraftId] : null;
      if (!draft) {
        return `<div id="wizardModal" class="modal-backdrop"></div>`;
      }

      const coach = getCoachById(draft.coachId);
      const coachStudents = state.students.filter(student => student.coachId === coach.id);
      const selectedStudent = getStudentById(draft.studentId || "");
      const step = draft.step || 1;
      const coachStudentOptions = coachStudents.map(student => `
        <button class="student-pick ${draft.studentId === student.id ? "active" : ""}" data-action="pick-student" data-student-id="${student.id}">
          <div class="person-cell">
            ${avatarMarkup(student.name, student.photo)}
            <div>
              <strong>${student.name}</strong>
              <div class="muted">Lesson count: ${student.lessons}</div>
            </div>
          </div>
          <strong>${draft.studentId === student.id ? "Selected" : "Choose"}</strong>
        </button>
      `).join("");

      return `
        <div id="wizardModal" class="modal-backdrop open">
          <div class="modal-card">
            <div class="section-header">
              <div class="section-title">
                <h2>Generate Report</h2>
                <p>${draft.ref} · ${coach.name}</p>
              </div>
              <button class="ghost-btn" data-action="save-close-wizard">X</button>
            </div>
            <div class="wizard-steps">
              ${[
                ["Step 1", "Select Student"],
                ["Step 2", "Session Details"],
                ["Step 3", "Training Summary"],
                ["Step 4", "Coach Remarks"]
              ].map((item, index) => {
                const stepNumber = index + 1;
                const klass = stepNumber < step ? "done" : stepNumber === step ? "active" : "";
                return `<div class="wizard-step ${klass}">${item[0]}<strong>${item[1]}</strong></div>`;
              }).join("")}
            </div>

            <div class="wizard-panel ${step === 1 ? "active" : ""}">
              <div class="student-pick-list">${coachStudentOptions}</div>
            </div>

            <div class="wizard-panel ${step === 2 ? "active" : ""}">
              <div class="split-grid">
                <div class="field">
                  <label for="wizardDate">Date</label>
                  <input id="wizardDate" class="text-input" type="date" value="${draft.date}">
                </div>
                <div class="field">
                  <label for="wizardTime">Time</label>
                  <input id="wizardTime" class="text-input" type="time" value="${draft.time}">
                </div>
                <div class="field">
                  <label for="wizardLessonNumber">Lesson Number</label>
                  <input id="wizardLessonNumber" class="text-input" type="number" min="1" value="${draft.lessonNumber || ""}">
                </div>
              </div>
            </div>

            <div class="wizard-panel ${step === 3 ? "active" : ""}">
              <div class="split-grid">
                <div class="field">
                  <label for="wizardWhatTaught">What Was Taught Today</label>
                  <textarea id="wizardWhatTaught" class="text-area" placeholder="One bullet point per line">${draft.summary.whatTaught || ""}</textarea>
                </div>
                <div class="field">
                  <label for="wizardAfterTraining">After Training – Areas of Improvement</label>
                  <textarea id="wizardAfterTraining" class="text-area" placeholder="One bullet point per line">${draft.summary.afterTraining || ""}</textarea>
                </div>
                <div class="field">
                  <label for="wizardBeforeCoaching">Before Coaching – Skill Level</label>
                  <textarea id="wizardBeforeCoaching" class="text-area" placeholder="One bullet point per line">${draft.summary.beforeCoaching || ""}</textarea>
                </div>
                <div class="field">
                  <label for="wizardNextLesson">Next Recommended Lesson</label>
                  <textarea id="wizardNextLesson" class="text-area" placeholder="One bullet point per line">${draft.summary.nextLesson || ""}</textarea>
                </div>
              </div>
            </div>

            <div class="wizard-panel ${step === 4 ? "active" : ""}">
              <div class="field">
                <label for="wizardRemarks">Coach Remarks</label>
                <textarea id="wizardRemarks" class="text-area" style="min-height:180px;">${draft.summary.remarks || ""}</textarea>
              </div>
              <div class="notice" style="margin-top:14px;">
                Student: ${selectedStudent ? selectedStudent.name : "-"}<br>
                Lesson: ${draft.lessonNumber || "-"}<br>
                Session: ${draft.date ? formatDate(draft.date) : "-"} ${draft.time ? `· ${formatTime(draft.time)}` : ""}
              </div>
            </div>

            <div class="wizard-footer">
              <div>
                ${step > 1 ? `<button class="secondary-btn" data-action="wizard-back">Back</button>` : ""}
              </div>
              <div style="display:flex;gap:12px;">
                ${step < 4
                  ? `<button class="primary-btn" data-action="wizard-next">Next</button>`
                  : `<button class="primary-btn" data-action="wizard-generate">Generate Final Report</button>`}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function getOnboardingConfig(type) {
      return type === "coach"
        ? {
            title: "Add New Coach",
            reviewTitle: "Review & Confirm",
            submitLabel: "Add Coach ✓",
            continueLabel: "Continue →",
            fields: [
              ["firstName", "First name"],
              ["lastName", "Last name"],
              ["phone", "Phone number"],
              ["email", "Email address"],
              ["centre", "Coaching centre"]
            ],
            reviewRows: [
              ["First name", "firstName"],
              ["Last name", "lastName"],
              ["Phone", "phone"],
              ["Email", "email"],
              ["Coaching centre", "centre"]
            ]
          }
        : {
            title: "Add New Student",
            reviewTitle: "Review & Confirm",
            submitLabel: "Add Student ✓",
            continueLabel: "Continue →",
            fields: [
              ["firstName", "First name"],
              ["lastName", "Last name"],
              ["age", "Age"],
              ["phone", "Phone number"],
              ["centre", "Coaching centre"]
            ],
            reviewRows: [
              ["First name", "firstName"],
              ["Last name", "lastName"],
              ["Age", "age"],
              ["Phone", "phone"],
              ["Coaching centre", "centre"]
            ]
          };
    }

    function onboardingFullName(values) {
      return [values.firstName, values.lastName].filter(Boolean).join(" ").trim() || "—";
    }

    function renderOnboardingModal() {
      if (!onboardingModal) {
        return `<div class="onboarding-backdrop"></div>`;
      }
      const config = getOnboardingConfig(onboardingModal.type);
      const values = onboardingModal.values;
      const initialsText = initials([values.firstName, values.lastName].filter(Boolean).join(" ").trim() || " ");
      return `
        <div class="onboarding-backdrop open">
          <div class="onboarding-modal">
            <div class="onboarding-head">
              <div class="section-title">
                <h2>${onboardingModal.step === 1 ? config.title : config.reviewTitle}</h2>
              </div>
              <button class="close-btn" data-action="close-onboarding" aria-label="Close modal">×</button>
            </div>
            <div class="step-dots" aria-hidden="true">
              <span class="step-dot ${onboardingModal.step === 1 ? "active" : ""}"></span>
              <span class="step-dot ${onboardingModal.step === 2 ? "active" : ""}"></span>
            </div>
            ${onboardingModal.step === 1 ? `
              <div class="onboarding-grid">
                ${config.fields.map(([key, label]) => `
                  <div class="field">
                    <label for="onboarding-${key}">${label}</label>
                    <input id="onboarding-${key}" class="text-input" type="text" value="${values[key] || ""}">
                  </div>
                `).join("")}
              </div>
              <div class="onboarding-actions end">
                <button class="primary-btn" data-action="onboarding-continue">${config.continueLabel}</button>
              </div>
            ` : `
              <div class="review-profile">
                <div class="review-avatar">${initialsText || "—"}</div>
                <div class="review-name">${onboardingFullName(values)}</div>
              </div>
              <div class="review-card">
                ${config.reviewRows.map(([label, key]) => `
                  <div class="review-row">
                    <strong>${label}</strong>
                    <span>${values[key] || "—"}</span>
                  </div>
                `).join("")}
              </div>
              <div class="onboarding-actions">
                <button class="ghost-btn" data-action="onboarding-back">← Back</button>
                <button class="primary-btn" data-action="onboarding-submit">${config.submitLabel}</button>
              </div>
            `}
          </div>
        </div>
      `;
    }

    function renderDashboard() {
      const navItems = state.auth.role === "admin"
        ? [
            ["overview", "Overview"],
            ["reports", "Reports"],
            ["coaches", "Coaches"],
            ["students", "Students"]
          ]
        : [
            ["overview", "Overview"],
            ["reports", "Reports"],
            ["students", "Students"]
          ];
      navItems.push(["centre-settings", "Centre Links"]);
      const pageContent = state.ui.page === "reports"
        ? renderReportsPage()
        : state.ui.page === "coaches"
          ? (state.auth.role === "admin" ? renderCoachesPage() : renderOverviewPage())
          : state.ui.page === "students"
            ? renderStudentsPage()
              : state.ui.page === "centre-settings"
                ? renderCentreSettingsPage()
              : state.ui.page === "settings"
              ? renderAdminProfilePage()
              : state.ui.page === "profile"
                ? renderCoachProfilePage()
                : state.ui.page === "report-view"
                  ? renderReportViewPage()
                  : renderOverviewPage();
      return `
        <div class="dashboard">
          <aside class="sidebar">
            <nav class="sidebar-nav" aria-label="Dashboard sections">
              ${navItems.map(([page, label]) => `<button class="sidebar-nav-item ${state.ui.page === page ? "active" : ""}" data-nav="${page}">${label}</button>`).join("")}
            </nav>
          </aside>
          <main class="main">
            ${renderTopbar()}
            <header class="page-header">
              <div class="header-copy">
                <h1>Academy Overview 🏓</h1>
                <p>JomNittaku Coach Reporting System · ${MONTH_LABEL}</p>
              </div>
            </header>
            ${pageContent}
          </main>
        </div>
        ${renderReportWizard()}
        ${renderOnboardingModal()}
        ${renderStudentEditModal()}
        <input id="hiddenStudentUpload" type="file" accept="image/*" class="hidden">
        <input id="hiddenProfileUpload" type="file" accept="image/*" class="hidden">
      `;
    }

    function renderStudentEditModal() {
      if (!studentEditModal) return "";
      const student = getStudentById(studentEditModal.studentId);
      if (!student) return "";
      return `
        <div class="onboarding-backdrop open">
          <div class="onboarding-modal">
            <div class="onboarding-head">
              <div class="section-title"><h2>Edit Student</h2></div>
              <button class="close-btn" data-action="close-student-edit" aria-label="Close modal">X</button>
            </div>
            <div class="profile-avatar-wrap">
              <button class="profile-avatar-lg" type="button" data-action="student-edit-photo" data-student-id="${student.id}" ${student.photo ? `style="background-image:url('${escapeHtml(student.photo)}');"` : ""}>
                ${student.photo ? "" : initials(student.name)}
              </button>
              <div><strong>Profile Picture</strong><p class="muted">Click the avatar to upload a new photo.</p></div>
            </div>
            <div class="onboarding-grid">
              <div class="field"><label for="editStudentName">Name</label><input id="editStudentName" class="text-input" value="${escapeHtml(student.name)}"></div>
              <div class="field"><label for="editStudentPhone">Phone Number</label><input id="editStudentPhone" class="text-input" value="${escapeHtml(student.parentHp)}"></div>
              <div class="field"><label for="editStudentLessons">Lesson</label><input id="editStudentLessons" class="text-input" type="number" min="0" value="${student.lessons}"></div>
            </div>
            <div class="onboarding-actions"><button class="ghost-btn" data-action="close-student-edit">Cancel</button><button class="primary-btn" data-action="save-student-edit">Save Changes</button></div>
          </div>
        </div>
      `;
    }

    function renderCentreSettingsPage() {
      const profile = state.centreProfile;
      return `
        <section class="page ${state.ui.page === "centre-settings" ? "active" : ""}">
          <div class="profile-card centre-settings-card">
            <div class="section-title"><h2>Centre Links</h2></div>
            <div class="centre-links-editor">
              ${profile.links.map(link => `
                <div class="centre-link-row" data-link-id="${escapeHtml(link.id)}">
                  <input class="text-input centre-link-label" data-link-field="label" value="${escapeHtml(link.label)}" placeholder="Label">
                  <input class="text-input centre-link-url" data-link-field="url" type="url" value="${escapeHtml(link.url)}" placeholder="https://...">
                  <button class="ghost-btn" data-action="delete-centre-link" data-link-id="${escapeHtml(link.id)}">Delete</button>
                </div>
              `).join("")}
            </div>
            <div class="profile-actions">
              <button class="secondary-btn" data-action="add-centre-link">+ Add Link</button>
              <button class="primary-btn" type="button" data-action="save-centre-profile">Save</button>
            </div>
          </div>
        </section>
      `;
    }

    function renderCentrePage() {
      const profile = state.centreProfile;
      return `<main class="public-centre-page"><section class="public-centre-card">
        ${profile.links.length ? `<div class="public-centre-links">${profile.links.map(link => `<a class="public-centre-link" href="${escapeHtml(centreLinkUrl(link))}">${escapeHtml(link.label)}</a>`).join("")}</div>` : "<p class=\"muted\">No contact info available</p>"}
      </section></main>`;
    }

    function renderPublicCoachPage(coach) {
      const reports = state.reports.filter(report => report.coachId === coach.id);
      const generated = reports.filter(report => report.status === "Generated").length;
      const centreLinks = (state.centreProfile?.links || []).map(link => ({
        ...link,
        title: link.label || link.title || "Centre link",
        icon: link.icon || ""
      }));
      const coachLinks = (coach.links || [])
        .filter(link => link.visible !== false && String(link.url || "").trim())
        .map(link => ({ ...link, title: link.title || link.label || "Coach link" }));
      const links = [...centreLinks, ...coachLinks]
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      const avatar = coach.photo_url || coach.photo;
      return `
        <main class="public-coach-page">
          <section class="public-coach-card">
            <div class="public-coach-avatar" ${avatar ? `style="background-image:url('${avatar}')"` : ""}>
              ${avatar ? "" : escapeHtml(initials(coach.name))}
            </div>
            <p class="public-coach-kicker">${escapeHtml(coach.role || "Coach")}</p>
            <h1>${escapeHtml(coach.name)}</h1>
            <p class="public-coach-bio">${escapeHtml(coach.bio || coach.branch || "")}</p>
            <div class="public-coach-stats">
              <span><strong>${reports.length}</strong> sessions</span>
              <span><strong>${reports.length ? "100" : "0"}%</strong> attendance</span>
              <span><strong>${generated}</strong> reports filed</span>
            </div>
            ${links.length ? "" : `<div class="public-coach-links-empty">No centre or coach links have been added yet.</div>`}
            <div class="public-coach-links">
              ${links.map(link => `<a href="${escapeHtml(link.url)}" class="public-coach-link" ${/^https?:|^mailto:|^tel:/.test(link.url) ? 'target="_blank" rel="noreferrer"' : ""}><span>${escapeHtml(link.icon || "↗")}</span>${escapeHtml(link.title)}</a>`).join("")}
            </div>
            <small>${escapeHtml(coach.branch || "")}</small>
          </section>
        </main>
      `;
    }

    function scheduleRender() {
      if (renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(() => {
        renderQueued = false;
        render();
      });
    }

    function render() {
      const app = document.getElementById("app");
      if (!authReady) {
        app.innerHTML = '<div class="app-loading" role="status" aria-live="polite">Loading JomNittaku...</div>';
        return;
      }
      // A re-render replaces the whole subtree, so anything the user has
      // half-typed into the login form (and the caret position) is lost
      // unless it is carried across explicitly.
      const activeElement = document.activeElement;
      const loginForm = app.querySelector(".login-form");
      const loginFormState = loginForm
        ? {
            values: Array.from(loginForm.querySelectorAll("input")).reduce((acc, input) => {
              if (input.id && input.type !== "checkbox" && input.type !== "radio") acc[input.id] = input.value;
              return acc;
            }, {}),
            activeId: activeElement && loginForm.contains(activeElement) ? activeElement.id || null : null,
            selectionStart: activeElement && typeof activeElement.selectionStart === "number" ? activeElement.selectionStart : null,
            selectionEnd: activeElement && typeof activeElement.selectionEnd === "number" ? activeElement.selectionEnd : null
          }
        : null;
      const publicMatch = window.location.pathname.match(/^\/coach\/([^/]+)\/?$/i);
      const publicCoach = publicMatch ? getCoachBySlug(decodeURIComponent(publicMatch[1])) : null;
      if (/^\/centre\/?$/i.test(window.location.pathname)) {
        app.innerHTML = renderCentrePage();
        return;
      }
      app.innerHTML = publicCoach ? renderPublicCoachPage(publicCoach) : state.auth.role ? renderDashboard() : renderLogin();
      if (publicCoach) return;
      attachEvents();
      if (state.auth.role) {
        hydrateReportsTable();
        hydrateCoachesTable();
        hydrateStudentsTable();
        hydrateQrImages();
        // Covers server-rendered tables (e.g. overview "Recent Reports")
        // that have no hydrate step of their own.
        stampTableLabels();
      }
      if (loginFormState) {
        Object.entries(loginFormState.values).forEach(([id, value]) => {
          const input = document.getElementById(id);
          if (input && value) input.value = value;
        });
        const nextFocus = loginFormState.activeId ? document.getElementById(loginFormState.activeId) : null;
        if (nextFocus && typeof nextFocus.focus === "function") {
          nextFocus.focus({ preventScroll: true });
          if (typeof nextFocus.setSelectionRange === "function" && loginFormState.selectionStart !== null && loginFormState.selectionEnd !== null) {
            try {
              nextFocus.setSelectionRange(loginFormState.selectionStart, loginFormState.selectionEnd);
            } catch {
              // Some input types (e.g. email) disallow selection APIs.
            }
          }
        }
      }
    }

    function hydrateQrImages() {
      document.querySelectorAll("[data-qr-coach]").forEach(container => {
        const coach = getCoachById(container.dataset.qrCoach);
        if (!coach) return;
        const image = container.tagName === "IMG" ? container : container.querySelector("img");
        if (!image) return;
        if (image.dataset.qrReady === "true") return;
        const width = Number(container.dataset.qrWidth || image.dataset.qrWidth || image.width || 200);
        loadQrDataUrl(coach, width).then(dataUrl => {
          image.src = dataUrl;
          image.dataset.qrReady = "true";
        }).catch(() => {});
      });
      document.querySelectorAll("[data-qr-centre]").forEach(image => {
        if (image.dataset.qrReady === "true") return;
        loadCentreQrDataUrl().then(dataUrl => {
          image.src = dataUrl;
          image.dataset.qrReady = "true";
        }).catch(() => {});
      });
    }

    async function loadCentreQrDataUrl() {
      if (centreQrDataUrlPromise) {
        return centreQrDataUrlPromise;
      }

      centreQrDataUrlPromise = getQrCodeLib().then(QRCode => QRCode.toDataURL("https://jom-nittaku-webapp.vercel.app/centre", {
        width: 200,
        margin: 1,
        errorCorrectionLevel: "M",
        color: {
          dark: "#000000",
          light: "#ffffff"
        }
      })).catch(error => {
        centreQrDataUrlPromise = null;
        throw error;
      });

      return centreQrDataUrlPromise;
    }

    function scheduleReportsHydration() {
      clearTimeout(reportFilterTimer);
      reportFilterTimer = window.setTimeout(hydrateReportsTable, 120);
    }

    function scheduleCoachesHydration() {
      clearTimeout(coachFilterTimer);
      coachFilterTimer = window.setTimeout(hydrateCoachesTable, 120);
    }

    function scheduleStudentsHydration() {
      clearTimeout(studentFilterTimer);
      studentFilterTimer = window.setTimeout(hydrateStudentsTable, 120);
    }

    function attachEvents() {
      if (!appEventsBound) {
        const app = document.getElementById("app");
        app.addEventListener("click", event => {
          // Clicks that land on a form control must never be treated as an
          // action/nav trigger. Otherwise an ancestor carrying data-action
          // (e.g. a <form>) swallows the click, preventDefault() blocks the
          // caret, and the following re-render wipes what the user typed.
          if (event.target.closest("input, textarea, select, label, option")) {
            return;
          }
          const actionButton = event.target.closest("[data-action]");
          if (actionButton) {
            event.preventDefault();
            handleAction({ currentTarget: actionButton });
            return;
          }
          const navButton = event.target.closest("[data-nav]");
          if (navButton) {
            event.preventDefault();
            navigate(navButton.dataset.nav);
          }
        });
        appEventsBound = true;
      }

      const reportsSearch = document.getElementById("reportsSearch");
      const reportsDate = document.getElementById("reportsDateFilter");
      const reportsStatus = document.getElementById("reportsStatusFilter");
      const reportsStudent = document.getElementById("reportsStudentFilter");
      const reportsMonth = document.getElementById("reportsMonthFilter");
      const reportsDay = document.getElementById("reportsDayFilter");
      const reportsDateFrom = document.getElementById("reportsDateFrom");
      const reportsDateTo = document.getElementById("reportsDateTo");

      [reportsSearch, reportsDate, reportsStatus, reportsStudent, reportsMonth, reportsDay, reportsDateFrom, reportsDateTo].filter(Boolean).forEach(input => {
        input.addEventListener("input", scheduleReportsHydration);
        input.addEventListener("change", () => {
          const customDates = document.getElementById("reportsCustomDates");
          reportsMonth?.classList.toggle("hidden", reportsDate?.value !== "month");
          reportsDay?.classList.toggle("hidden", reportsDate?.value !== "day");
          customDates?.classList.toggle("hidden", reportsDate?.value !== "custom");
          hydrateReportsTable();
        });
      });

      const loginForm = document.querySelector(".login-form");
      loginForm?.addEventListener("submit", event => {
        event.preventDefault();
        signIn();
      });
      document.querySelector('[data-action="sign-in-google"]')?.addEventListener("click", signInWithGoogle);

      const coachSearch = document.getElementById("coachSearch");
      if (coachSearch) {
        coachSearch.addEventListener("input", scheduleCoachesHydration);
      }

      const studentSearch = document.getElementById("studentSearch");
      const studentCoachFilter = document.getElementById("studentCoachFilter");
      [studentSearch, studentCoachFilter].filter(Boolean).forEach(input => {
        input.addEventListener("input", scheduleStudentsHydration);
        input.addEventListener("change", hydrateStudentsTable);
      });

      const hiddenStudentUpload = document.getElementById("hiddenStudentUpload");
      if (hiddenStudentUpload) {
        hiddenStudentUpload.addEventListener("change", event => {
          const [file] = event.target.files || [];
          if (!file || !event.target.dataset.studentId) return;
          uploadProfileImage(file, "student", event.target.dataset.studentId).then(url => {
            const student = getStudentById(event.target.dataset.studentId);
            if (student) student.photo = url;
            event.target.value = "";
            persist();
            render();
          }).catch(error => alert(error.message || "Unable to upload photo."));
        });
      }

      const hiddenProfileUpload = document.getElementById("hiddenProfileUpload");
      if (hiddenProfileUpload) {
        hiddenProfileUpload.addEventListener("change", event => {
          const [file] = event.target.files || [];
          if (!file || !draftProfileUploadContext) return;
          const context = draftProfileUploadContext;
          const targetId = context === "admin" ? "admin" : getCurrentCoach().id;
          uploadProfileImage(file, context, targetId).then(url => {
            if (context === "admin") {
              state.adminProfile.photo = url;
            } else {
              getCurrentCoach().photo = url;
              getCurrentCoach().photo_url = url;
            }
            draftProfileUploadContext = null;
            event.target.value = "";
            persist();
            render();
          }).catch(error => alert(error.message || "Unable to upload photo."));
        });
      }

      ["wizardDate", "wizardTime", "wizardLessonNumber", "wizardWhatTaught", "wizardAfterTraining", "wizardBeforeCoaching", "wizardNextLesson", "wizardRemarks"].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
          element.addEventListener("input", updateWizardDraftFromInputs);
        }
      });
    }

    function handleAction(event) {
      const action = event.currentTarget.dataset.action;
      if (action === "sign-in") return signIn();
      if (action === "logout") return logout();
      if (action === "toggle-avatar-menu") {
        state.ui.avatarMenuOpen = !state.ui.avatarMenuOpen;
        persist();
        return render();
      }
      if (action === "open-profile") {
        state.ui.page = state.auth.role === "admin" ? "settings" : "profile";
        state.ui.avatarMenuOpen = false;
        persist();
        return render();
      }
      if (action === "back-from-profile") return navigate("overview");
      if (action === "new-report") return startReportFlow();
      if (action === "save-close-wizard") return closeWizard();
      if (action === "wizard-next") return advanceWizard();
      if (action === "wizard-back") return retreatWizard();
      if (action === "wizard-generate") return finalizeWizard();
      if (action === "pick-student") return pickStudent(event.currentTarget.dataset.studentId);
      if (action === "view-report") return openReportView(event.currentTarget.dataset.reportId);
      if (action === "close-report-view") return navigate("reports");
      if (action === "download-report-pdf") return downloadReportPdf();
      if (action === "upload-admin-photo") return triggerProfileUpload("admin");
      if (action === "upload-coach-photo") return triggerProfileUpload("coach");
      if (action === "save-admin-profile") return saveAdminProfile();
      if (action === "save-coach-profile") return saveCoachProfile();
      if (action === "add-centre-link") {
        state.centreProfile.links.push({ id: crypto.randomUUID ? crypto.randomUUID() : `link-${Date.now()}`, label: "", url: "" });
        return render();
      }
      if (action === "delete-centre-link") { state.centreProfile.links = state.centreProfile.links.filter(link => link.id !== event.currentTarget.dataset.linkId); return render(); }
      if (action === "save-centre-profile") return saveCentreProfileFromInputs();
      if (action === "add-coach-link") return addCoachLink();
      if (action === "student-upload") return triggerStudentUpload(event.currentTarget.dataset.studentId);
      if (action === "student-edit") return openStudentEditModal(event.currentTarget.dataset.studentId);
      if (action === "student-edit-photo") return triggerStudentUpload(event.currentTarget.dataset.studentId);
      if (action === "close-student-edit") return closeStudentEditModal();
      if (action === "save-student-edit") return saveStudentEdit();
      if (action === "add-student") return openAddStudentModal();
      if (action === "close-onboarding") return closeOnboardingModal();
      if (action === "onboarding-continue") return continueOnboarding();
      if (action === "onboarding-back") return backOnboarding();
      if (action === "onboarding-submit") return submitOnboarding();
      if (action === "save-student") return saveStudentFromModal();
      if (action === "stub-add-coach") return openCoachOnboarding();
    }

    function hydrateReportsTable() {
      const tbody = document.querySelector("#reportsTable tbody");
      if (!tbody) return;
      const search = (document.getElementById("reportsSearch")?.value || "").trim().toLowerCase();
      const dateFilter = document.getElementById("reportsDateFilter")?.value || "";
      const statusFilter = document.getElementById("reportsStatusFilter")?.value || "";
      const studentFilter = document.getElementById("reportsStudentFilter")?.value || "";
      const monthFilter = document.getElementById("reportsMonthFilter")?.value || "";
      const dateFrom = document.getElementById("reportsDateFrom")?.value || "";
      const dateTo = document.getElementById("reportsDateTo")?.value || "";

      let reports = getVisibleReports().filter(report => {
        const student = getStudentById(report.studentId);
        const coach = getCoachById(report.coachId);
        const searchOk = !search || [report.ref, student.name, coach.name, report.lessonLabel, `Lesson ${report.lessonNumber}`].join(" ").toLowerCase().includes(search);
        const statusOk = !statusFilter || report.status === statusFilter;
        const studentOk = !studentFilter || report.studentId === studentFilter;
        const dateOk = !dateFilter || withinDateBucket(report.date, dateFilter, dateFrom, dateTo, monthFilter);
        return searchOk && statusOk && studentOk && dateOk;
      });

      tbody.innerHTML = reports.map(report => {
        const student = getStudentById(report.studentId);
        const coach = getCoachById(report.coachId);
        return `
          <tr>
            <td>${report.ref}</td>
            <td>${student.name}</td>
            <td>${coach.name}</td>
            <td>Lesson ${report.lessonNumber}</td>
            <td>${formatDate(report.date)}, ${formatTime(report.time)}</td>
            <td>${statusBadge(report.status)}</td>
            <td><button class="icon-btn" data-action="view-report" data-report-id="${report.id}" aria-label="View report">→</button></td>
          </tr>
        `;
      }).join("");
      stampTableLabels(tbody.closest("table") || document);
    }

    /**
     * Copies each table's <th> text onto its matching <td> as data-label.
     * The mobile card layout renders these labels via CSS ::before, so a
     * stacked row still says which column each value came from. Runs after
     * every hydrate so re-rendered tbodies stay labelled.
     */
    function stampTableLabels(root = document) {
      root.querySelectorAll("table").forEach(table => {
        const headings = [...table.querySelectorAll("thead th")].map(th => th.textContent.trim());
        if (!headings.length) return;
        table.querySelectorAll("tbody tr").forEach(row => {
          [...row.children].forEach((cell, i) => {
            const label = headings[i];
            if (label) cell.setAttribute("data-label", label);
            else cell.removeAttribute("data-label");
          });
        });
      });
    }

    function withinDateBucket(date, bucket, dateFrom = "", dateTo = "", monthFilter = "") {
      const day = Number(date.split("-")[2]);
      if (bucket === "month") return !monthFilter || date.startsWith(monthFilter);
      if (bucket === "day") return !document.getElementById("reportsDayFilter")?.value || date === document.getElementById("reportsDayFilter")?.value;
      if (bucket === "custom") return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo);
      if (bucket === "week1") return day >= 1 && day <= 7;
      if (bucket === "week2") return day >= 8 && day <= 14;
      if (bucket === "week3") return day >= 15 && day <= 21;
      if (bucket === "week4") return day >= 22 && day <= 31;
      return true;
    }

    function hydrateCoachesTable() {
      const tbody = document.querySelector("#coachesTable tbody");
      if (!tbody) return;
      const search = (document.getElementById("coachSearch")?.value || "").trim().toLowerCase();
      const coaches = state.coaches.filter(coach => coach.name.toLowerCase().includes(search));
      const studentTotalsByCoach = state.students.reduce((totals, student) => {
        totals[student.coachId] = (totals[student.coachId] || 0) + 1;
        return totals;
      }, {});
      const reportTotalsByCoach = state.reports.reduce((totals, report) => {
        totals[report.coachId] = (totals[report.coachId] || 0) + 1;
        return totals;
      }, {});
      tbody.innerHTML = coaches.map(coach => `
        <tr>
          <td>
            <div class="person-cell">
              ${avatarMarkup(coach.name, coach.photo)}
              <strong>${coach.name}</strong>
            </div>
          </td>
          <td>${studentTotalsByCoach[coach.id] || 0}</td>
          <td>${reportTotalsByCoach[coach.id] || 0}</td>
          <td><span class="badge green"><span class="dot"></span>Active</span></td>
          <td>
            <a class="secondary-btn" href="/coach/${encodeURIComponent(coach.slug)}" target="_blank" rel="noreferrer">View Profile</a>
          </td>
        </tr>
      `).join("");
      stampTableLabels(tbody.closest("table") || document);
    }

    function hydrateStudentsTable() {
      const tbody = document.querySelector("#studentsTable tbody");
      if (!tbody) return;
      const search = (document.getElementById("studentSearch")?.value || "").trim().toLowerCase();
      const coachFilter = document.getElementById("studentCoachFilter")?.value || "";
      const visibleStudents = state.students.filter(student => {
        const coachScoped = state.auth.role === "coach" ? student.coachId === getCurrentCoach().id : true;
        const coachMatch = !coachFilter || student.coachId === coachFilter;
        const searchMatch = !search || student.name.toLowerCase().includes(search) || student.parentHp.toLowerCase().includes(search);
        return coachScoped && coachMatch && searchMatch;
      });

      tbody.innerHTML = visibleStudents.map(student => {
        const coach = getCoachById(student.coachId);
        return `
          <tr>
            <td>
              <div class="person-cell">
                ${avatarMarkup(student.name, student.photo)}
                <strong>${student.name}</strong>
              </div>
            </td>
            ${state.auth.role === "admin" ? `<td>${coach.name}</td>` : ""}
            <td>${student.lessons}</td>
            <td>${student.parentHp}</td>
            <td>
              <div class="photo-cell">
                ${student.photo
                  ? `<span class="badge green"><span class="dot"></span>Uploaded</span>`
                  : `<button class="upload-chip" data-action="student-upload" data-student-id="${student.id}">+ Upload Photo</button>`}
              </div>
            </td>
            <td><span class="badge green"><span class="dot"></span>Active</span></td>
            <td><button class="icon-btn table-edit-btn" data-action="student-edit" data-student-id="${student.id}">Edit</button></td>
          </tr>
        `;
      }).join("");
      stampTableLabels(tbody.closest("table") || document);
    }

    function openStudentEditModal(studentId) {
      const student = getStudentById(studentId);
      if (!student) return;
      studentEditModal = { studentId };
      render();
    }

    function closeStudentEditModal() {
      studentEditModal = null;
      render();
    }

    function saveStudentEdit() {
      const student = studentEditModal && getStudentById(studentEditModal.studentId);
      if (!student) return;
      const name = document.getElementById("editStudentName")?.value.trim();
      const lessons = Number(document.getElementById("editStudentLessons")?.value);
      if (!name || !Number.isFinite(lessons) || lessons < 0) {
        alert("Enter a name and a valid lesson count.");
        return;
      }
      student.name = name;
      student.parentHp = document.getElementById("editStudentPhone")?.value.trim() || "";
      student.lessons = lessons;
      studentEditModal = null;
      persist();
      render();
    }

    function startReportFlow() {
      if (state.auth.role !== "coach") {
        alert("New report generation is available from the Coach account.");
        return;
      }
      const coach = getCurrentCoach();
      const now = new Date();
      const id = `draft-${Date.now()}`;
      const refNumber = state.reports.length + Object.keys(state.reportDrafts).length + 1;
      state.reportDrafts[id] = {
        id,
        ref: `DSM-26-${String(refNumber).padStart(4, "0")}`,
        coachId: coach.id,
        studentId: "",
        date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
        time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        lessonNumber: "",
        step: 1,
        status: "Pending",
        summary: blankSummary()
      };
      wizardDraftId = id;
      persist();
      render();
    }

    function updateWizardDraftFromInputs() {
      const draft = state.reportDrafts[wizardDraftId];
      if (!draft) return;
      const selectedStudent = getStudentById(draft.studentId || "");
      draft.date = document.getElementById("wizardDate")?.value || draft.date;
      draft.time = document.getElementById("wizardTime")?.value || draft.time;
      draft.lessonNumber = document.getElementById("wizardLessonNumber")?.value || draft.lessonNumber || (selectedStudent ? selectedStudent.lessons + 1 : "");
      draft.summary.whatTaught = document.getElementById("wizardWhatTaught")?.value ?? draft.summary.whatTaught;
      draft.summary.afterTraining = document.getElementById("wizardAfterTraining")?.value ?? draft.summary.afterTraining;
      draft.summary.beforeCoaching = document.getElementById("wizardBeforeCoaching")?.value ?? draft.summary.beforeCoaching;
      draft.summary.nextLesson = document.getElementById("wizardNextLesson")?.value ?? draft.summary.nextLesson;
      draft.summary.remarks = document.getElementById("wizardRemarks")?.value ?? draft.summary.remarks;
      persist();
    }

    function pickStudent(studentId) {
      const draft = state.reportDrafts[wizardDraftId];
      if (!draft) return;
      const student = getStudentById(studentId);
      draft.studentId = studentId;
      draft.lessonNumber = student.lessons + 1;
      persist();
      render();
    }

    function advanceWizard() {
      const draft = state.reportDrafts[wizardDraftId];
      if (!draft) return;
      updateWizardDraftFromInputs();
      if (draft.step === 1 && !draft.studentId) {
        alert("Select a student before continuing.");
        return;
      }
      if (draft.step === 2 && (!draft.date || !draft.time || !draft.lessonNumber)) {
        alert("Complete date, time and lesson number.");
        return;
      }
      draft.step = Math.min(4, draft.step + 1);
      persist();
      render();
    }

    function retreatWizard() {
      const draft = state.reportDrafts[wizardDraftId];
      if (!draft) return;
      updateWizardDraftFromInputs();
      draft.step = Math.max(1, draft.step - 1);
      persist();
      render();
    }

    function finalizeWizard() {
      const draft = state.reportDrafts[wizardDraftId];
      if (!draft) return;
      updateWizardDraftFromInputs();
      if (!draft.studentId) {
        alert("Select a student first.");
        return;
      }
      const reportId = `report-${Date.now()}`;
      const finalReport = {
        id: reportId,
        ref: draft.ref,
        studentId: draft.studentId,
        coachId: draft.coachId,
        lessonLabel: LESSON_LABELS[state.reports.length % LESSON_LABELS.length],
        lessonNumber: Number(draft.lessonNumber) || 1,
        date: draft.date,
        time: draft.time,
        status: "Generated",
        generatedAt: new Date().toISOString(),
        summary: { ...draft.summary }
      };
      state.reports.unshift(finalReport);
      const student = getStudentById(draft.studentId);
      student.lessons = Math.max(student.lessons, finalReport.lessonNumber);
      delete state.reportDrafts[wizardDraftId];
      wizardDraftId = null;
      state.ui.page = "report-view";
      state.ui.reportViewId = reportId;
      persist();
      render();
    }

    function closeWizard() {
      updateWizardDraftFromInputs();
      wizardDraftId = null;
      persist();
      render();
    }

    function openReportView(reportId) {
      state.ui.page = "report-view";
      state.ui.reportViewId = reportId;
      persist();
      render();
      window.requestAnimationFrame(() => {
        const report = state.reports.find(item => item.id === reportId);
        if (report) primeReportExport(report);
      });
    }

    async function waitForReportReady(element) {
      await document.fonts.ready;
      const target = element || document.querySelector("#reportTemplatePreview");
      if (!target || target.getBoundingClientRect().width === 0) {
        throw new Error("Report is not visible and ready for export");
      }
      await Promise.all([...target.querySelectorAll("img")].map(image => {
        if (image.complete && image.naturalWidth > 0) {
          return image.decode ? image.decode().catch(() => {}) : Promise.resolve();
        }
        return new Promise(resolve => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
      }));
    }

    /**
     * html2canvas 1.4.1 does not implement object-fit: renderReplacedElement()
     * draws the whole source bitmap into the content box, so a portrait photo
     * gets squashed into the frame's landscape box instead of being cropped.
     * Pre-cropping the bitmap to the frame's aspect makes that stretch a no-op,
     * so the export matches what object-fit: cover renders on screen.
     * Resolves to null when the source can't be used, in which case the caller
     * keeps the original src rather than losing the photo entirely.
     */
    function coverCropDataUrl(src, targetAspect, targetWidth) {
      return new Promise(resolve => {
        const image = new Image();
        // Vector sources rasterise at whatever size we draw them, so they are
        // not capped by an intrinsic pixel budget the way photos are.
        const isVector = /^data:image\/svg\+xml/i.test(src);
        if (!/^data:/i.test(src)) image.crossOrigin = "anonymous";
        image.onload = () => {
          const sourceWidth = image.naturalWidth;
          const sourceHeight = image.naturalHeight;
          if (!sourceWidth || !sourceHeight) return resolve(null);
          // Largest centred region of the source matching the frame aspect.
          let cropWidth = sourceWidth;
          let cropHeight = Math.round(sourceWidth / targetAspect);
          if (cropHeight > sourceHeight) {
            cropHeight = sourceHeight;
            cropWidth = Math.round(sourceHeight * targetAspect);
          }
          const cropX = Math.max(0, Math.round((sourceWidth - cropWidth) / 2));
          const cropY = Math.max(0, Math.round((sourceHeight - cropHeight) / 2));
          const requested = Math.max(1, Math.round(targetWidth));
          const outWidth = isVector ? requested : Math.min(requested, cropWidth);
          const outHeight = Math.max(1, Math.round(outWidth / targetAspect));
          const canvas = document.createElement("canvas");
          canvas.width = outWidth;
          canvas.height = outHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, outWidth, outHeight);
          try {
            resolve(canvas.toDataURL("image/png"));
          } catch (error) {
            // Cross-origin photo tainted the canvas; leave the original src.
            resolve(null);
          }
        };
        image.onerror = () => resolve(null);
        image.src = src;
      });
    }

    function roundedRectPath(ctx, x, y, width, height, radius) {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      ctx.lineTo(x + radius, y + height);
      ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
    }

    function getWrappedLines(ctx, text, maxWidth, maxLines = Infinity) {
      const words = String(text || "").trim().split(/\s+/).filter(Boolean);
      if (!words.length) return [];
      const lines = [];
      let current = "";
      words.forEach(word => {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width > maxWidth && current) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      });
      if (current) lines.push(current);
      return lines.slice(0, maxLines);
    }

    function drawWrappedLines(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
      getWrappedLines(ctx, text, maxWidth, maxLines).forEach((line, index) => {
        ctx.fillText(line, x, y + (index * lineHeight));
      });
    }

    function drawFittedText(ctx, text, x, y, maxWidth, fontSize, minFontSize = 14, fontWeight = 600) {
      const value = String(text || "").trim();
      if (!value) return;
      let size = fontSize;
      while (size > minFontSize) {
        ctx.font = `${fontWeight} ${size}px Arial, "Helvetica Neue", Helvetica, sans-serif`;
        if (ctx.measureText(value).width <= maxWidth) break;
        size -= 1;
      }
      ctx.fillText(value, x, y);
    }

    function drawBulletLine(ctx, text, x, y, maxWidth, lineHeight, maxLines, inset = 0) {
      const value = String(text || "").trim();
      if (!value) return;
      const originalFont = ctx.font;
      const fontMatch = originalFont.match(/(\d+(?:\.\d+)?)px/);
      const originalSize = fontMatch ? Number(fontMatch[1]) : 14;
      let fontSize = originalSize;
      let lines = [];
      do {
        ctx.font = `400 ${fontSize}px Arial, "Helvetica Neue", Helvetica, sans-serif`;
        lines = getWrappedLines(ctx, value, maxWidth - inset);
        if (lines.length <= maxLines || fontSize <= 10) break;
        fontSize -= 0.5;
      } while (fontSize > 10);
      lines = lines.slice(0, maxLines);
      if (!lines.length) return;
      const textX = x + inset;
      ctx.fillText(lines[0], textX, y);
      lines.slice(1).forEach((line, index) => {
        ctx.fillText(line, textX, y + ((index + 1) * lineHeight));
      });
    }

    function getReportExportKey(report) {
      return report ? JSON.stringify(getReportTemplateData(report)) : "";
    }

    async function renderReportCanvas() {
      const reportTemplate = document.querySelector("#reportTemplatePreview");
      if (!reportTemplate) {
        throw new Error("Report template is not mounted");
      }
      const html2canvas = await getHtml2CanvasLib();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await waitForReportReady(reportTemplate);
      const exportWidth = REPORT_TEMPLATE_SIZE.width;
      const exportHeight = REPORT_TEMPLATE_SIZE.height;
      const photoCardWidthPx = exportWidth * 0.112;
      const photoCardHeightPx = photoCardWidthPx * (111 / 123);
      const photoGapPx = exportWidth * 0.0145;

      // Pre-crop each photo to the frame aspect so the export matches the
      // on-screen object-fit: cover. Done before html2canvas (rather than
      // inside onclone) so the async decode can't race the render pass.
      const exportScale = 3;
      const photoCrops = await Promise.all(
        [...reportTemplate.querySelectorAll(".template-photo")].map(photo => {
          const box = photo.getBoundingClientRect();
          // The live content box already has the aspect object-fit is using,
          // so matching it reproduces the on-screen crop exactly.
          const aspect = box.width > 0 && box.height > 0
            ? box.width / box.height
            : 123 / 111;
          const src = photo.currentSrc || photo.getAttribute("src") || "";
          if (!src) return Promise.resolve(null);
          return coverCropDataUrl(src, aspect, photoCardWidthPx * exportScale);
        })
      );

      return await html2canvas(reportTemplate, {
        scale: exportScale,
        useCORS: true,
        allowTaint: true,
        imageTimeout: 0,
        logging: false,
        removeContainer: true,
        width: Math.ceil(exportWidth),
        height: Math.ceil(exportHeight),
        backgroundColor: null,
        onclone: clonedDoc => {
          const clonedReportTemplate = clonedDoc.querySelector("#reportTemplatePreview");
          if (!clonedReportTemplate) return;
          clonedReportTemplate.style.setProperty("container-type", "inline-size");
          clonedReportTemplate.style.setProperty("container-name", "report");
          clonedReportTemplate.style.width = `${exportWidth}px`;
          clonedReportTemplate.style.height = `${exportHeight}px`;
          clonedReportTemplate.style.minWidth = `${exportWidth}px`;
          clonedReportTemplate.style.maxWidth = `${exportWidth}px`;
          clonedReportTemplate.style.minHeight = `${exportHeight}px`;
          clonedReportTemplate.style.maxHeight = `${exportHeight}px`;

          const clonedPhotoGroup = clonedReportTemplate.querySelector(".template-report-photo-group");
          if (clonedPhotoGroup) {
            clonedPhotoGroup.style.gap = `${photoGapPx}px`;
          }

          clonedReportTemplate.querySelectorAll(".template-photo-card").forEach(card => {
            card.style.width = `${photoCardWidthPx}px`;
            card.style.minWidth = `${photoCardWidthPx}px`;
            card.style.maxWidth = `${photoCardWidthPx}px`;
            card.style.flex = `0 0 ${photoCardWidthPx}px`;
            card.style.flexShrink = "0";
          });

          clonedReportTemplate.querySelectorAll(".template-photo-frame").forEach(frame => {
            frame.style.width = "100%";
            frame.style.height = `${photoCardHeightPx}px`;
            frame.style.minHeight = `${photoCardHeightPx}px`;
            frame.style.maxHeight = `${photoCardHeightPx}px`;
          });

          clonedReportTemplate.querySelectorAll(".template-photo").forEach((photo, index) => {
            photo.style.width = "100%";
            photo.style.height = "100%";
            photo.style.maxHeight = "100%";
            photo.style.objectFit = "cover";
            photo.style.objectPosition = "center center";
            photo.style.display = "block";
            // html2canvas ignores object-fit and stretches the full bitmap into
            // the box, so hand it a bitmap already cropped to that box's aspect.
            const cropped = photoCrops[index];
            if (cropped) {
              photo.setAttribute("src", cropped);
              photo.removeAttribute("srcset");
              photo.removeAttribute("sizes");
            }
          });
        }
      });
    }

    function primeReportExport(report) {
      const key = getReportExportKey(report);
      if (!key || (reportExportPromise && reportExportKey === key)) return;
      reportExportKey = key;
      reportExportPromise = renderReportCanvas().catch(error => {
        reportExportPromise = null;
        reportExportKey = "";
        throw error;
      });
    }

    async function getReportExportCanvas(report) {
      const key = getReportExportKey(report);
      if (!key) throw new Error("Report is missing");
      if (reportExportPromise && reportExportKey === key) {
        return await reportExportPromise;
      }
      reportExportKey = key;
      reportExportPromise = renderReportCanvas().catch(error => {
        reportExportPromise = null;
        reportExportKey = "";
        throw error;
      });
      return await reportExportPromise;
    }

    function saveCentreProfileFromInputs() {
      const links = [...document.querySelectorAll(".centre-link-row")].map(row => ({
        id: row.dataset.linkId || `link-${Date.now()}-${Math.random()}`,
        label: row.querySelector('[data-link-field="label"]')?.value.trim() || "",
        url: row.querySelector('[data-link-field="url"]')?.value.trim() || ""
      }));
      state.centreProfile = { links };
      saveCentreProfile();
      const button = document.querySelector('[data-action="save-centre-profile"]');
      if (button) {
        button.textContent = "Saved";
        window.setTimeout(() => { if (button.isConnected) button.textContent = "Save"; }, 1500);
      }
    }

    function downloadBlob(blob, filename) {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
    }

    async function downloadReportPdf() {
      const report = state.reports.find(item => item.id === state.ui.reportViewId);
      if (!report) return;
      const canvas = await renderReportCanvas();
      const jsPDF = await getJsPdfLib();
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "px",
        format: [canvas.width, canvas.height],
        hotfixes: ["px_scaling"]
      });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      downloadBlob(pdf.output("blob"), `${report.ref || report.id}-training-report.pdf`);
    }

    function triggerStudentUpload(studentId) {
      const input = document.getElementById("hiddenStudentUpload");
      if (!input) return;
      input.dataset.studentId = studentId;
      input.click();
    }

    function triggerProfileUpload(context) {
      draftProfileUploadContext = context;
      document.getElementById("hiddenProfileUpload")?.click();
    }

    async function uploadProfileImage(file, kind, recordId) {
      if (!supabase) throw new Error("Supabase is not configured.");
      if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
      if (file.size > 5 * 1024 * 1024) throw new Error("Images must be 5 MB or smaller.");
      const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${kind}/${recordId}-${Date.now()}.${extension}`;
      const { error } = await supabase.storage.from(PROFILE_IMAGE_BUCKET).upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false
      });
      if (error) throw error;
      return supabase.storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
    }

    function saveAdminProfile() {
      const fullName = document.getElementById("adminFullName")?.value.trim();
      if (!fullName) {
        alert("Full name is required.");
        return;
      }
      state.adminProfile.fullName = fullName;
      persist();
      render();
    }

    function saveCoachProfile() {
      const coach = getCurrentCoach();
      coach.name = document.getElementById("coachFullName")?.value.trim() || coach.name;
      coach.branch = document.getElementById("coachBranch")?.value.trim() || coach.branch;
      coach.centreContact = document.getElementById("coachCentreContact")?.value.trim() || coach.centreContact;
      coach.branchAddress = document.getElementById("coachBranchAddress")?.value.trim() || coach.branchAddress || coach.branch;
      coach.email = document.getElementById("coachEmail")?.value.trim();
      coach.phone = document.getElementById("coachPhone")?.value.trim();
      const requestedSlug = slugify(document.getElementById("coachSlug")?.value || coach.name);
      const slugConflict = state.coaches.some(item => item.id !== coach.id && item.slug === requestedSlug);
      if (slugConflict) {
        alert(`That public URL is already used. Try ${requestedSlug}-${slugify(coach.id)}.`);
        return;
      }
      coach.slug = requestedSlug;
      coach.role = document.getElementById("coachRole")?.value.trim() || "Table Tennis Coach";
      coach.bio = document.getElementById("coachBio")?.value.trim() || "";
      coach.links = Array.from(document.querySelectorAll(".coach-link-row")).map((row, index) => ({
        id: row.querySelector(".coach-link-url")?.value.trim() || `link-${index + 1}`,
        title: row.querySelector(".coach-link-title")?.value.trim() || "Link",
        url: row.querySelector(".coach-link-url")?.value.trim() || "#",
        icon: "↗",
        visible: row.querySelector(".coach-link-visible")?.checked !== false,
        order: index + 1
      }));
      persist();
      render();
    }

    function addCoachLink() {
      const coach = getCurrentCoach();
      coach.links = [...(coach.links || []), {
        id: `link-${Date.now()}`,
        title: "New link",
        url: "https://",
        icon: "↗",
        visible: true,
        order: (coach.links || []).length + 1
      }];
      render();
    }

    function openOnboarding(type) {
      onboardingModal = {
        type,
        step: 1,
        values: { firstName: "", lastName: "", phone: "", email: "", centre: "", age: "" }
      };
      render();
    }

    function openCoachOnboarding() {
      openOnboarding("coach");
    }

    function openAddStudentModal() {
      openOnboarding("student");
    }

    function closeOnboardingModal() {
      onboardingModal = null;
      render();
    }

    function readOnboardingInputs() {
      if (!onboardingModal) return;
      const config = getOnboardingConfig(onboardingModal.type);
      config.fields.forEach(([key]) => {
        onboardingModal.values[key] = document.getElementById(`onboarding-${key}`)?.value.trim() || "";
      });
    }

    function continueOnboarding() {
      if (!onboardingModal) return;
      readOnboardingInputs();
      onboardingModal.step = 2;
      render();
    }

    function backOnboarding() {
      if (!onboardingModal) return;
      onboardingModal.step = 1;
      render();
    }

    function resolveCoachIdForStudent(centre) {
      const matchingCoach = state.coaches.find(coach => coach.branch.toLowerCase() === centre.toLowerCase());
      if (matchingCoach) return matchingCoach.id;
      return state.auth.role === "coach" ? getCurrentCoach().id : state.coaches[0].id;
    }

    function submitCoachOnboarding(values) {
      const name = [values.firstName, values.lastName].filter(Boolean).join(" ").trim() || "—";
      state.coaches.unshift({
        id: `coach-${Date.now()}`,
        name,
        branch: values.centre || "—",
        centreContact: values.phone || "",
        email: values.email || "",
        phone: values.phone || "",
        status: "Active",
        photo: "",
        reportsGeneratedThisMonth: 0,
        reportsTotal: 0,
        studentIds: [],
        branchAddress: values.centre || "—"
      });
    }

    function submitStudentOnboarding(values) {
      const name = [values.firstName, values.lastName].filter(Boolean).join(" ").trim() || "—";
      const coachId = resolveCoachIdForStudent(values.centre || "");
      const student = {
        id: `student-${Date.now()}`,
        name,
        coachId,
        lessons: 1,
        parentHp: values.phone || "—",
        photo: "",
        status: "Active",
        age: values.age || "",
        centre: values.centre || ""
      };
      state.students.unshift(student);
      const coach = getCoachById(coachId);
      if (coach) {
        coach.studentIds = coach.studentIds || [];
        coach.studentIds.unshift(student.id);
      }
    }

    function submitOnboarding() {
      if (!onboardingModal) return;
      const values = onboardingModal.values;
      if (onboardingModal.type === "coach") {
        submitCoachOnboarding(values);
      } else {
        submitStudentOnboarding(values);
      }
      onboardingModal = null;
      persist();
      render();
    }

    function saveStudentFromModal() {
      submitOnboarding();
    }

    (async function bootstrap() {
      let callbackError = "";
      if (supabase && window.location.pathname === "/auth/callback") {
        const callbackParams = new URLSearchParams(window.location.search);
        callbackError = callbackParams.get("error_description") || callbackParams.get("error") || "";
        window.history.replaceState({}, document.title, "/");
      }
      if (/^\/centre\/?$/i.test(window.location.pathname)) {
        authReady = true;
        authInitializing = false;
        render();
        state.centreProfile = await loadPublicCentreProfile();
        render();
        return;
      }
      const initialSessionPromise = supabase
        ? (bindAuthStateListener(), supabase.auth.getSession())
        : Promise.resolve({ data: { session: null }, error: null });
      loadState()
        .then(async nextState => {
          // loadState() returns a fresh state whose auth is blank, so the
          // session resolved above has to be carried over. Otherwise a
          // signed-in user gets dropped back on the login screen on reload.
          const liveAuth = state.auth;
          state = nextState;
          state.auth = liveAuth;
          const localCentreProfile = getCentreProfile();
          if (!state.centreProfile?.links?.length && localCentreProfile.links.length) {
            state.centreProfile = localCentreProfile;
            persist();
          } else {
            state.centreProfile = normalizeCentreProfile(state.centreProfile);
          }
          if (supabase && state.centreProfile.links.length) {
            supabase
              .from("centre_links")
              .upsert({ id: "centre", links: state.centreProfile.links }, { onConflict: "id" })
              .catch(() => {});
          }
          if (supabase) {
            // Wait for URL callback processing/session persistence before the
            // first authenticated render.
            const { data, error } = await initialSessionPromise;
            if (error && !callbackError) callbackError = error.message;
            await applyAuthUser(data.session?.user || null);
          }
          authInitializing = false;
          authReady = true;
          if (callbackError) loginError = callbackError;
          render();
          subscribeToRealtime();
        })
        .catch(() => {
          state = normalizeState(createInitialState());
          authInitializing = false;
          authReady = true;
          if (callbackError) loginError = callbackError;
          render();
        });
    })();
}

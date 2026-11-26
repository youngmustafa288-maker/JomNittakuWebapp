import { renderCertificateEditor, renderCertificateEditorTools, renderCertificateEditorToolbar } from "./certificate-editor.js";
import { REPORT_TEMPLATES, makeTemplateLayout, layoutSnapshot, studioIcon } from "./certificate-templates.js";
import { renderStudio, previewLayoutStore } from "./certificate-studio.js";
import { createClient } from "@supabase/supabase-js";
import { createDashboardStatePayload, createReportDriveRepository, normalizeReportRecord } from "./report-drive.js";
import { reportTemplateOptions, renderReportTemplateChoices } from "./report-template-picker.js";
import { createIndexedDbReportStore, createHybridReportWorkspace, reportWorkspaceKey } from "./report-local.js";
import { mountSportScene, LOGIN_SPORTS } from "./sport-scenes.js";
import { createCoachOnboarding, needsCoachOnboarding, pendingSetupItems, normalizeSkipped, SETUP_ITEM_LABELS, setupItemIcon } from "./coach-onboarding.js";

const BASE_URL = "https://jom-nittaku-webapp.vercel.app";
const CENTRE_PROFILE_KEY = "centre_profile";

export function isGoogleDriveCallback(location) {
  return location.pathname === "/api/auth/google-drive/callback"
    || (location.pathname === "/auth/callback" && new URLSearchParams(location.search).has("state"));
}

export function initApp(config = {}) {
    const driveCallback = isGoogleDriveCallback(window.location);
    const SUPABASE_URL = config.supabaseUrl || "";
    const SUPABASE_KEY = config.supabaseKey || "";
    const REPORT_TEMPLATE_SRC = config.reportTemplateSrc || "/Certificate%20Template.jpg?v=4";
    const REPORT_TEMPLATE_LAYER_ROOT = config.reportTemplateLayerRoot || "/certificate-layers";
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
    const DEFAULT_REPORT_LAYOUT = {
      date: { left: 17.9, top: 27.2, width: 23, fontSize: 2.7, fontFamily: "Arial", color: "#111111", fontWeight: 700 },
      time: { left: 17.9, top: 29.58, width: 23, fontSize: 2.7, fontFamily: "Arial", color: "#111111", fontWeight: 700 },
      centre: { left: 17.9, top: 31.94, width: 25, fontSize: 2.7, fontFamily: "Arial", color: "#111111", fontWeight: 700 },
      coach: { left: 24.25, top: 34.34, width: 19, fontSize: 2.7, fontFamily: "Arial", color: "#111111", fontWeight: 700 },
      whatTaught: { left: 55.4, top: 44.9, width: 38.5, height: 5.16, fontSize: 1.55, fontFamily: "Arial", color: "#111111", fontWeight: 400 },
      beforeCoaching: { left: 11.8, top: 44.9, width: 35.2, height: 5.16, fontSize: 1.55, fontFamily: "Arial", color: "#111111", fontWeight: 400 },
      afterTraining: { left: 11.8, top: 52.8, width: 35.2, height: 5.16, fontSize: 1.55, fontFamily: "Arial", color: "#111111", fontWeight: 400 },
      nextLesson: { left: 55.4, top: 52.8, width: 38.5, height: 5.16, fontSize: 1.55, fontFamily: "Arial", color: "#111111", fontWeight: 400 },
      remarks: { left: 10.1, top: 61.9, width: 79.5, height: 11.6, fontSize: 1.55, fontFamily: "Arial", color: "#111111", fontWeight: 400 },
      contact: { left: 34.55, top: 79.9, width: 31.2, fontSize: 2.3, fontFamily: "Arial", color: "#111111", fontWeight: 700 },
      address: { left: 34.55, top: 86.35, width: 31.2, height: 4, fontSize: 2, fontFamily: "Arial", color: "#111111", fontWeight: 700 }
    };
    const ARTWORK_SLICES = {
      "decor-top-left": { left: 1.8, top: 1.2, width: 23, height: 15 },
      "decor-top-right": { left: 77, top: 1.2, width: 21.5, height: 14 },
      "brand-logo-art": { left: 20.8, top: 5.4, width: 10.8, height: 7.8 },
      "brand-name": { left: 31.8, top: 6.7, width: 48.5, height: 3.7 },
      "brand-subtitle": { left: 32.1, top: 10.3, width: 44.5, height: 2.6 },
      "brand-tagline": { left: 24.2, top: 13.4, width: 53.8, height: 2.7 },
      "report-title-art": { left: 16, top: 16.4, width: 70, height: 5.8 },
      "session-title": { left: 9.7, top: 24.5, width: 23, height: 2.6 },
      "date-label": { left: 9.7, top: 27.3, width: 8, height: 2.2 },
      "time-label": { left: 9.7, top: 29.6, width: 8, height: 2.2 },
      "centre-label": { left: 9.7, top: 31.9, width: 9, height: 2.2 },
      "coach-label": { left: 9.7, top: 34.2, width: 15, height: 2.2 },
      "session-divider": { left: 9.7, top: 37.7, width: 80, height: 0.7 },
      "training-title": { left: 9.7, top: 39, width: 29, height: 2.6 },
      // Left column: Before, then After. Right column: Taught, then Next.
      // Bullet dots stay where the artwork had them; only the headings move.
      "taught-title": { left: 53.1, top: 42, width: 31, height: 2.4 },
      "taught-dot-1": { left: 9.7, top: 44.6, width: 2.2, height: 1.8 },
      "taught-dot-2": { left: 9.7, top: 47, width: 2.2, height: 1.8 },
      "before-title": { left: 9.7, top: 42, width: 34, height: 2.4 },
      "before-dot-1": { left: 9.7, top: 52.6, width: 2.2, height: 1.8 },
      "before-dot-2": { left: 9.7, top: 55, width: 2.2, height: 1.8 },
      "after-title": { left: 10.4, top: 50, width: 40, height: 2.4 },
      "after-dot-1": { left: 53.8, top: 44.6, width: 2.2, height: 1.8 },
      "after-dot-2": { left: 53.8, top: 47, width: 2.2, height: 1.8 },
      "next-title": { left: 53.8, top: 50, width: 35, height: 2.4 },
      "next-dot-1": { left: 53.8, top: 52.6, width: 2.2, height: 1.8 },
      "next-dot-2": { left: 53.8, top: 55, width: 2.2, height: 1.8 },
      "summary-divider": { left: 9.7, top: 58, width: 80, height: 0.7 },
      "remarks-title-art": { left: 9.7, top: 59.5, width: 25, height: 2.7 },
      "remark-line-1": { left: 9.7, top: 64.1, width: 80, height: 0.7 },
      "remark-line-2": { left: 9.7, top: 66.6, width: 80, height: 0.7 },
      "remark-line-3": { left: 9.7, top: 68.8, width: 80, height: 0.7 },
      "remark-line-4": { left: 9.7, top: 71, width: 80, height: 0.7 },
      "remark-line-5": { left: 9.7, top: 73.2, width: 80, height: 0.7 },
      "certification-badge": { left: 5, top: 75.8, width: 18, height: 15 },
      "contact-frame": { left: 34.4, top: 76, width: 31.8, height: 14.2 },
      "contact-title-art": { left: 35.6, top: 77, width: 29.5, height: 2.5 },
      "address-title-art": { left: 42.5, top: 82.5, width: 15, height: 2.6 },
      "decor-bottom-left": { left: 1.8, top: 84, width: 23, height: 14 },
      // Let the template's own footer color show through instead of stacking
      // another opaque navy band on top of it.
      "footer-bar-art": { left: 22, top: 92.1, width: 56, height: 5.9, opacity: 1 },
      "decor-bottom-right": { left: 80, top: 82, width: 18.5, height: 16.5 }
    };
    const ARTWORK_EDITABLE_TEXT = {
      "brand-name": "Dao Sports Method",
      "brand-subtitle": "TABLE TENNIS TRAINING",
      "brand-tagline": "Character Transformation thru Sports",
      "report-title-art": "THIS IS A TRAINING REPORT"
    };
    const ARTWORK_TEXT_STYLE = {
      // The default AND customized heading texts use these same loaded fonts.
      // Font sizes are in container-width units (cqw); selection preserves them.
      // These are visual approximations, not verified original PNG typefaces.
      "brand-name": { fontFamily: "Arial", fontSize: 4.35, color: "#171525", fontWeight: 800, fontStyle: "normal" },
      "brand-subtitle": { fontFamily: "Arial", fontSize: 2.95, color: "#171525", fontWeight: 400, fontStyle: "normal" },
      "brand-tagline": { fontFamily: "Arial", fontSize: 2.65, color: "#171525", fontWeight: 400, fontStyle: "italic" },
      "report-title-art": { fontFamily: "Arial", fontSize: 5.4, color: "#814b28", fontWeight: 700, fontStyle: "normal" }
    };
    const DEFAULT_FOOTER_TEXT = "JOMNITTAKU\nPassion · Focus · Exilent";
    // The certificate footer shows the centre's own name. A coach who typed
    // their own footer text keeps it.
    function certificateCentreName() {
      const coach = state.auth.role === "coach" ? state.coaches.find(item => item.id === state.auth.coachId) : null;
      const branch = coach?.branch && !["Unassigned", "Centre"].includes(coach.branch) ? coach.branch : "";
      return requestedCentre?.name || branch || "";
    }
    // The old "Passion · Focus · Excellent" tagline is no longer printed.
    const FOOTER_TAGLINE = /^\s*Passion\s*·\s*Focus\s*·\s*Ex\w*\s*$/i;
    const TEMPLATE_FOOTER_TEXT = "DAO SPORTS METHOD\nCHARACTER TRANSFORMATION THROUGH SPORTS";
    function footerTextForCentre(text) {
      const centre = certificateCentreName();
      let value = String(text || "");
      if (centre && value === DEFAULT_FOOTER_TEXT) value = centre.toUpperCase();
      else if (centre && value === TEMPLATE_FOOTER_TEXT) value = `${centre.toUpperCase()}\nCHARACTER TRANSFORMATION THROUGH SPORTS`;
      return value.split(/\n+/).filter(line => !FOOTER_TAGLINE.test(line)).join("\n");
    }
    function certificateCentreLogo() {
      return requestedCentre?.logo_url || "";
    }
    function certificateCentreSport() {
      const sport = String(requestedCentre?.sport || "").trim();
      return /^other$/i.test(sport) ? "" : sport;
    }
    // Default heading words become the centre's own: its name instead of
    // "Dao Sports Method" and its sport in "<SPORT> TRAINING". Words a coach
    // typed themselves are kept.
    function headingTextForCentre(layer) {
      const text = String(layer.text ?? "");
      if (layer.id === "brand-name" && text === ARTWORK_EDITABLE_TEXT["brand-name"] && certificateCentreName()) return certificateCentreName();
      if (layer.id === "brand-subtitle" && text === ARTWORK_EDITABLE_TEXT["brand-subtitle"] && certificateCentreSport()) return `${certificateCentreSport().toUpperCase()} TRAINING`;
      return text;
    }
    const DEFAULT_LAYER_GEOMETRY = {
      ...ARTWORK_SLICES,
      "student-photo": { left: 63.62, top: 24.92, width: 11.2, height: 9.7 },
      "coach-photo": { left: 76.27, top: 24.92, width: 11.2, height: 9.7 },
      // Inside the dark corner pocket of the classic frame (square on the 896x1200 sheet).
      qr: { left: 87, top: 88.3, width: 8.4, height: 6.27, zIndex: 50 },
      "footer-text-overlay": {
        left: 27,
        top: 91.55,
        width: 46,
        height: 7.15,
        fontFamily: "Arial",
        fontSize: 2.2,
        color: "#d8b477",
        fontWeight: 400,
        fill: "transparent",
        text: DEFAULT_FOOTER_TEXT,
        zIndex: 30
      }
    };
    // The supplied certificate artwork already provides the border treatment;
    // keep the legacy ornamental corner flourishes out of new and saved layouts.
    const REMOVED_CERTIFICATE_LAYER_IDS = new Set(["decor-top-left", "decor-top-right", "decor-bottom-left", "footer-bar-art", "footer-jomnittaku-overlay"]);
    const DEFAULT_CERTIFICATE_LAYERS = [
      ...Object.keys(ARTWORK_SLICES).filter(id => !REMOVED_CERTIFICATE_LAYER_IDS.has(id)).map(id => [id, id.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" "), "image"]),
      ["date", "Date value", "dynamic-text"],
      ["time", "Time", "dynamic-text"], ["centre", "Centre", "dynamic-text"],
      ["coach", "Coach name", "dynamic-text"], ["student-photo", "Student photo", "photo"],
      ["coach-photo", "Coach photo", "photo"], ["whatTaught", "What was taught", "dynamic-text"],
      ["beforeCoaching", "Before coaching", "dynamic-text"], ["afterTraining", "After training", "dynamic-text"],
      ["nextLesson", "Next lesson", "dynamic-text"], ["remarks", "Coach remarks", "dynamic-text"],
      ["contact", "Centre contact", "dynamic-text"], ["address", "Address", "dynamic-text"],
      ["qr", "QR code", "image"], ["footer-text-overlay", "Footer text", "text"]
    ].map(([id, name, type], index) => ({
      id, name, type, visible: true, zIndex: index + 2,
      ...(DEFAULT_LAYER_GEOMETRY[id] || {}), locked: false,
      ...(Object.prototype.hasOwnProperty.call(ARTWORK_EDITABLE_TEXT, id)
        ? { type: "text", text: ARTWORK_EDITABLE_TEXT[id], ...ARTWORK_TEXT_STYLE[id] } : {})
    }));
    const RETIRED_CERTIFICATE_LAYER_IDS = new Set([
      "art-brand", "art-session", "art-summary", "art-remarks", "art-badge", "art-contact", "art-footer",
      "brand-title", "brand-logo", "report-title", "remarks", "badge", "footer",
      ...REMOVED_CERTIFICATE_LAYER_IDS
    ]);
    const PHOTO_PLACEHOLDER_SVG = `
      <svg xmlns="http://www.w3.org/2000/svg" width="123" height="111" viewBox="0 0 123 111" aria-hidden="true">
        <rect width="123" height="111" rx="12" fill="#E5E7EB"></rect>
        <circle cx="61.5" cy="38" r="17" fill="#C4CBD6"></circle>
        <path d="M28 100c3.5-21 16-31.5 33.5-31.5S91.5 79 95 100" fill="#C4CBD6"></path>
      </svg>
    `;
    const PROFILE_IMAGE_BUCKET = "profile-images";

    const LESSON_LABELS = ["Footwork Fundamentals", "Forehand Drive", "Backhand Control", "Serve Precision", "Spin Reading", "Match Strategy", "Transition Drill", "Consistency Circuit"];
    const REPORT_STATUSES = ["Generated"];
    // New coaches start with one empty link row to fill in (platform + link).
    const DEFAULT_COACH_LINKS = [
      { id: "link-1", title: "", url: "", icon: "↗", visible: true, order: 1 }
    ];
    const supabase = hasSupabaseConfig()
      ? createClient(SUPABASE_URL, SUPABASE_KEY, {
          // Supabase owns the OAuth callback exchange and persists the session
          // before getSession() is read during bootstrap.
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !driveCallback }
        })
      : null;
    const reportRepository = supabase
      ? createReportDriveRepository(body => invokePrivileged("google-drive-oauth", body))
      : null;
    const reportLocalStore = supabase && typeof indexedDB !== "undefined" ? createIndexedDbReportStore(indexedDB) : null;
    let state = createInitialState();
    state.centreProfile = getCentreProfile();
    let wizardDraftId = null;
    let reportGenerating = false;
    let onboardingModal = null;
    let centreOnboardingModal = null;
    let studentEditModal = null;
    let loginError = "";
    // The centre this account belongs to, when it differs from the centre
    // link being opened. Used to point people to the right place.
    let authHomeCentre = null;
    let requestedCentre = null;
    // { status: "loading" | "ready" | "missing" | "error", page }
    let publicCoachPage = null;
    let centreRouteLoadFailed = false;
    let centreRouteUnavailable = false;
    let devConsoleTab = "centres";
    let devCentreCoachFilter = "";
    let devCentreCoachSearch = "";
    let devCentreDetailModal = null;
    let isSigningIn = false;
    let isActivatingCentre = false;
    let activationError = "";
    let authReady = !supabase;
    let authInitializing = Boolean(supabase);
    let draftProfileUploadContext = null;
    let certificateLogoUploadTarget = null;
    let certificateUploadToLibrary = false;
    let selectedCertificateUploadId = "";
    let persistTimer = null;
    let isApplyingRemoteState = false;
    let realtimeChannel = null;
    let renderQueued = false;
    let appEventsBound = false;
    let reportFilterTimer = null;
    // Created on first use, after the rest of the controller is ready.
    let coachOnboardingInstance = null;
    const getCoachOnboarding = () => coachOnboardingInstance || (coachOnboardingInstance = createCoachOnboarding({
      escapeHtml: value => escapeHtml(value),
      templates: REPORT_TEMPLATES,
      get centreName() { return requestedCentre?.name || ""; },
      get logoUrl() { return requestedCentre?.logo_url || ""; },
      getCoach: () => getOnboardingCoach(),
      getStudents: () => {
        const coach = getOnboardingCoach();
        return coach ? state.students.filter(student => student.coachId === coach.id) : [];
      },
      getDriveStatus: () => isCertificatePreview ? (previewDriveConnected ? "connected" : "disconnected") : state.driveConnection?.status === "connected" ? "connected" : state.driveConnection ? "disconnected" : "unknown",
      getDriveEmail: () => state.driveConnection?.google_account_email || "",
      getDriveError: () => driveConnectionError || state.driveConnection?.last_error || "",
      refreshDrive: () => isCertificatePreview ? undefined : refreshPrivilegedState(),
      connectDrive: () => onboardingConnectDrive(),
      uploadPhoto: file => uploadProfileImage(file, "coach", getOnboardingCoach().id),
      saveProfile: values => saveOnboardingProfile(values),
      currentTemplateId: () => getReportLayout(getOnboardingCoach()).templateId,
      applyTemplate: (templateId, brand) => applyOnboardingTemplate(templateId, brand),
      currentQr: () => getOnboardingQr(),
      coachPageUrl: () => { const coach = getOnboardingCoach(); return coach ? coachPublicUrl(coach) : ""; },
      linkPlatform: url => linkPlatform(url),
      renderQrCertificate: ({ visible, url }) => renderOnboardingCertificate(getReportLayout(getOnboardingCoach() || {}).templateId, "final", "cob-cert-qr", { qrVisible: visible, qrUrl: url }),
      applyQr: values => applyOnboardingQr(values),
      qrDataUrl: link => getQrCodeLib().then(QRCode => QRCode.toDataURL(link, { width: 320, margin: 2, errorCorrectionLevel: "M" })),
      renderCertificate: (templateId, mode, previewId, brand) => renderOnboardingCertificate(templateId, mode, previewId, brand ? { brand } : null),
      currentBrand: () => getOnboardingBrand(),
      afterCertificateRender: () => { fitCustomCertificateHeadingText(); hydrateQrImages(); },
      addStudent: values => addOnboardingStudent(values),
      saveProgress: progress => saveOnboardingProgress(progress),
      finish: () => { state.ui.page = "overview"; persist(); },
      render: () => scheduleRender()
    }));
    let previewDriveConnected = false;
    let overviewDateFilter = "";
    let overviewMonthFilter = "";
    let overviewWeekFilter = "week1";
    let overviewDateFrom = "";
    let overviewDateTo = "";
    let coachFilterTimer = null;
    let studentFilterTimer = null;
    let coachAccountCount = 0;
    let centreQrDataUrlPromise = null;
    const coachQrDataUrlCache = new Map();
    let qrCodeModulePromise = null;
    let html2canvasModulePromise = null;
    let jsPdfModulePromise = null;
    let reportExportPromise = null;
    let reportExportKey = "";
    let reportStoreStatus = "idle";
    let reportStoreError = "";
    let driveConnectionError = "";
    let reportPdfError = "";
    let reportLoadPromise = null;
    let reportLoadedAt = 0;
    let reportLoadedScope = "";
    let reportLoadGeneration = 0;
    let reportWriteRevision = 0;
    let hybridWorkspace = null;
    let hybridScope = "";
    let hybridCacheLoadedScope = "";
    let hybridPending = [];
    let hybridSyncedDraftIds = new Set();
    let remoteReportDrafts = new Map();
    let reportUsingLocalCache = false;
    let hybridLocalError = "";
    let hybridSyncTimer = null;
    let coachDriveRoots = {};
    const REPORT_SESSION_CACHE_MS = 60000;
    let adminReportCentres = [];
    let adminReportCentresLoaded = false;
    let activeReportCentreId = "";
    let adminReportContext = null;
    let adminReportContextCentreId = "";
    let connectedCoachDriveIds = [];
    let reportStartOpen = false;
    let draftSaveTimer = null;
    let dirtyReportDraftId = "";
    const reportWriteQueues = new Map();
    const draftRevisions = new Map();
    let reportLayoutEditing = false;
    let selectedReportOverlay = "date";
    let certificateEditorTool = "templates";
    let reportOverlayDragged = false;
    let activeCertificateEditor = null;
    // Studio state is UI-only; reusable geometry stays in coaches.report_layout.
    let studioView = "templates";
    let studioFilter = "all";
    let studioHelpOpen = false;
    let studioPreview = false;
    let studioZoom = 70;
    let studioPictureTarget = "";
    const isCertificatePreview = config.certificatePreview === true && !SUPABASE_URL && !SUPABASE_KEY;

    function studioToast(message) {
      const toast = document.getElementById("studioToast");
      if (!toast) return;
      toast.textContent = message;
      toast.classList.add("visible");
      clearTimeout(studioToast.timer);
      studioToast.timer = setTimeout(() => toast.classList.remove("visible"), 4500);
    }
    function defaultStudioLayout(id = "classic") {
      return makeTemplateLayout(normalizeReportLayout(), id);
    }
    // Puts every built-in item back where the template places it. The coach's
    // own words, uploaded logo/images and added text boxes are kept. The QR is shown again.
    function resetLayoutPositions(current) {
      const fresh = defaultStudioLayout(current.baseTemplateId);
      const savedById = new Map((current.layers || []).map(layer => [layer.id, layer]));
      const layers = fresh.layers.map(layer => {
        const saved = savedById.get(layer.id);
        if (!saved) return layer;
        const kept = {};
        if (typeof saved.source === "string" && saved.source) kept.source = saved.source;
        if (Object.prototype.hasOwnProperty.call(ARTWORK_EDITABLE_TEXT, layer.id) && typeof saved.text === "string") kept.text = saved.text;
        if (layer.id === "footer-text-overlay" && typeof saved.text === "string") kept.text = saved.text;
        return { ...layer, ...kept };
      });
      const added = (current.layers || []).filter(layer => !fresh.layers.some(item => item.id === layer.id));
      return {
        ...fresh, layers: layers.concat(added),
        templateId: current.templateId, designName: current.designName, backgroundSource: current.backgroundSource,
        qrUrl: current.qrUrl, designs: current.designs, variants: current.variants, uploads: current.uploads
      };
    }
    function studioLayoutForId(id) {
      const current = getReportLayout(getCurrentCoach());
      if (id === current.templateId) return current;
      return normalizeReportLayout(current.variants?.[id] || defaultStudioLayout(id));
    }
    function getDraftTemplateOptions(draft) {
      return reportTemplateOptions(getReportLayout(getCoachById(draft.coachId)), defaultStudioLayout, ensureDraftCertificateDesign(draft));
    }
    // A draft shows the coach's latest saved design. Unless the coach picked
    // a template for this report, it follows their current design. The design
    // is only frozen when the report is finished.
    function ensureDraftCertificateDesign(draft) {
      const current = getReportLayout(getCoachById(draft.coachId));
      const latest = reportTemplateOptions(current, defaultStudioLayout);
      const wantedId = draft.certificateDesignPicked && draft.certificateDesign?.templateId ? draft.certificateDesign.templateId : current.templateId;
      const match = latest.find(option => option.templateId === wantedId) || latest.find(option => option.templateId === current.templateId);
      if (match) draft.certificateDesign = match;
      return draft.certificateDesign;
    }
    function renderDraftTemplatePicker(draft) {
      const selected = ensureDraftCertificateDesign(draft);
      const editing = reportLayoutEditing;
      const selection = selectedReportOverlay;
      reportLayoutEditing = false;
      selectedReportOverlay = "";
      try {
        return renderReportTemplateChoices(getDraftTemplateOptions(draft), selected.templateId,
          (option, index) => renderReportTemplate(draft, option.layout, `report-choice-${index}`), escapeHtml);
      } finally {
        reportLayoutEditing = editing;
        selectedReportOverlay = selection;
      }
    }
    function selectDraftTemplate(templateId) {
      if (reportGenerating) return;
      const draft = state.reportDrafts[wizardDraftId];
      if (!draft) return;
      const selected = getDraftTemplateOptions(draft).find(option => option.templateId === templateId);
      if (!selected) return;
      updateWizardDraftFromInputs({ schedule: false });
      draft.certificateDesign = selected;
      draft.certificateDesignPicked = true;
      scheduleDraftSave(draft);
      // Keep the radio group in place for native arrow-key navigation.
      document.querySelectorAll('input[name="reportTemplate"]').forEach(input => {
        input.checked = input.value === templateId;
        input.closest(".report-template-option")?.classList.toggle("is-selected", input.checked);
      });
    }
    async function selectStudioTemplate(id) {
      const coach = getCurrentCoach();
      const current = getReportLayout(coach);
      const variants = { ...(current.variants || {}), [current.templateId]: layoutSnapshot(current) };
      const next = normalizeReportLayout(variants[id] || defaultStudioLayout(id));
      coach.reportLayout = { ...next, variants, designs: current.designs || [], uploads: current.uploads || [] };
      studioView = "editor"; studioPreview = false; selectedReportOverlay = "date"; certificateEditorTool = "text";
      await saveReportLayout(coach);
    }
    function renderStudioMini(id) {
      const prior = reportLayoutEditing;
      const selection = selectedReportOverlay;
      reportLayoutEditing = false; selectedReportOverlay = "";
      const html = renderReportTemplate(getCertificateDesignPreviewReport(getCurrentCoach()), studioLayoutForId(id), `studio-mini-${id}`);
      reportLayoutEditing = prior; selectedReportOverlay = selection;
      return html;
    }
    // "Photo frames" tool: show/hide each photo, labels, frame shape and colour.
    function renderPhotoFramesPanel(layout, compact = false) {
      const frames = normalizePhotoFrames(layout.photoFrames);
      const shown = id => layout.layers.find(layer => layer.id === id)?.visible !== false;
      const toggle = (id, label) => `<label class="studio-frame-toggle"><input type="checkbox" data-action="studio-frame-photo" data-photo="${id}" ${shown(id) ? "checked" : ""}><span>${label}</span></label>`;
      return `${compact ? `<strong>Photo frames</strong><p class="studio-frame-intro">How the student and coach photos look on every report.</p>` : `<div class="studio-panel-title"><h3>Photo frames</h3><p>How the student and coach photos look on every report.</p></div>`}
        <div class="studio-frame-group">
          ${toggle("student-photo", "Student photo")}
          ${toggle("coach-photo", "Coach photo")}
          <label class="studio-frame-toggle"><input type="checkbox" data-action="studio-frame-labels" ${frames.labels ? "checked" : ""}><span>Show labels</span></label>
        </div>
        <p class="studio-frame-subtitle">Frame shape</p>
        <div class="studio-frame-shapes" role="radiogroup" aria-label="Frame shape">${Object.entries(PHOTO_FRAME_SHAPES).map(([id, name]) => `<button type="button" role="radio" aria-checked="${frames.shape === id}" class="${frames.shape === id ? "is-active" : ""}" data-action="studio-frame-shape" data-shape="${id}"><i class="studio-shape-icon is-${id}" aria-hidden="true"></i>${name}</button>`).join("")}</div>
        <p class="studio-frame-subtitle">Frame colour</p>
        <div class="studio-frame-colours" role="radiogroup" aria-label="Frame colour">${Object.entries(PHOTO_FRAME_COLOURS).map(([id, [name, colour]]) => `<button type="button" role="radio" aria-checked="${frames.colour === id}" aria-label="${name}" title="${name}" class="${frames.colour === id ? "is-active" : ""} ${id === "none" ? "is-none" : ""}" style="--swatch:${colour}" data-action="studio-frame-colour" data-colour="${id}"></button>`).join("")}</div>
        <p class="studio-frame-tip">Drag a photo on the certificate to move it, or pull its corner to resize.</p>`;
    }

    function renderStudioPanel(coach) {
      const layout = getReportLayout(coach);
      if (certificateEditorTool === "templates") return `<div class="studio-panel-title"><h3>Templates</h3></div><div class="studio-mini-list">${[...REPORT_TEMPLATES,...layout.designs].map(t=>`<button class="${layout.templateId===t.id?'active':''}" data-studio-template="${escapeHtml(t.id)}"><span class="studio-mini-thumb">${renderStudioMini(t.id)}</span><strong>${escapeHtml(t.name)}</strong>${layout.templateId===t.id?studioIcon('check'):''}</button>`).join('')}</div><button class="studio-panel-upload" data-action="studio-upload-background">${studioIcon('upload')}Upload design</button>`;
      if (certificateEditorTool === "qr") { const qrHidden = layout.layers.find(l=>l.id==='qr')?.visible===false; return `<div class="studio-panel-title"><h3>Add QR</h3></div><button class="${qrHidden?'primary-btn studio-btn studio-full':'studio-panel-upload'}" data-action="studio-toggle-qr">${qrHidden?'Add QR':'Hide QR'}</button>`; }
      if (certificateEditorTool === "frames") return renderPhotoFramesPanel(layout);
      if (certificateEditorTool === "uploads") return `<div class="studio-panel-title"><h3>Photos</h3></div><button class="studio-dropzone" data-action="studio-upload-picture">${studioIcon('upload')}<strong>Upload photo</strong><small>PNG, JPG, WebP · 5 MB</small></button><div class="studio-photo-targets"><button data-action="studio-upload-student" aria-label="Upload student photo">Student</button><button data-action="studio-upload-coach" aria-label="Upload coach photo">Coach</button></div>${layout.uploads.length?`<div class="studio-asset-grid">${layout.uploads.map(a=>`<button data-studio-asset="${escapeHtml(a.id)}" aria-label="Add ${escapeHtml(a.name)}"><img src="${escapeHtml(a.source)}" alt="${escapeHtml(a.name)}"><span>${escapeHtml(a.name)}</span></button>`).join('')}</div>`:'<div class="studio-empty-assets"><p>No photos</p></div>'}`;
      if (certificateEditorTool === "text") return `<div class="studio-panel-title"><h3>Text</h3></div><button class="studio-text-add" data-action="add-certificate-text">${studioIcon('plus')}Add text</button>`;
      return renderCertificateToolPanel(coach);
    }
    function attachStudioEvents() {
      document.querySelectorAll('[data-studio-template]').forEach(el => el.addEventListener('click',()=>selectStudioTemplate(el.dataset.studioTemplate).catch(e=>studioToast(e.message))));
      document.querySelectorAll('[data-studio-filter]').forEach(el=>el.addEventListener('click',()=>{studioFilter=el.dataset.studioFilter;render();}));
      document.querySelector('[data-studio-name]')?.addEventListener('change',event=>{const coach=getCurrentCoach();coach.reportLayout=getReportLayout(coach);coach.reportLayout.designName=event.target.value.trim() || 'Untitled design';saveReportLayout(coach);});
      document.querySelectorAll('[data-studio-zoom]').forEach(el=>el.addEventListener('click',()=>{studioZoom=el.dataset.studioZoom==='fit'?70:Math.min(130,Math.max(40,studioZoom+Number(el.dataset.studioZoom)));render();}));
      document.getElementById('studioBackgroundUpload')?.addEventListener('change',event=>{const file=event.target.files[0];if(file) uploadStudioBackground(file).catch(e=>studioToast(e.message));});
      document.getElementById('studioPictureUpload')?.addEventListener('change',event=>{const file=event.target.files[0];if(file) uploadStudioPicture(file).catch(e=>studioToast(e.message));});
      document.querySelectorAll('[data-studio-asset]').forEach(el=>el.addEventListener('click',()=>{const coach=getCurrentCoach();const layout=getReportLayout(coach);const asset=layout.uploads.find(a=>a.id===el.dataset.studioAsset);if(asset) addStudioPicture(layout,asset.source,asset.name);coach.reportLayout=layout;saveReportLayout(coach);}));
    }
    function addStudioPicture(layout, source, name) {
      const id = `custom-${crypto.randomUUID()}`;
      layout.layers.push({id,name,type:'image',source,left:35,top:32,width:25,height:18.67,visible:true,locked:false,zIndex:Math.max(...layout.layers.map(l=>Number(l.zIndex)||0))+1,objectFit:'contain'});
      selectedReportOverlay=id;
    }
    async function studioUpload(file) {
      if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPG or WebP image.');
      if (file.size>5*1024*1024) throw new Error('Please choose an image under 5 MB.');
      const bitmap=await createImageBitmap(file).catch(()=>null);
      if (!bitmap) throw new Error('This image could not be opened. Please choose another file.');
      bitmap.close();
      return uploadProfileImage(file,'certificate',getCurrentCoach().id);
    }
    async function uploadStudioBackground(file) {
      studioToast('Uploading…');
      const source=await studioUpload(file);
      const coach=getCurrentCoach(); const old=getReportLayout(coach);
      const id=`design-${crypto.randomUUID()}`;const name=file.name.replace(/\.[^.]+$/,'').slice(0,80) || 'My design';
      const next=defaultStudioLayout('classic');
      Object.assign(next,{templateId:id,designName:name,backgroundSource:source,designs:[...old.designs,{id,name}],uploads:old.uploads,variants:{...old.variants,[old.templateId]:layoutSnapshot(old)}});
      coach.reportLayout=next;studioView='editor';certificateEditorTool='uploads';selectedReportOverlay='';
      if (await saveReportLayout(coach)) studioToast('Design added');
    }
    async function uploadStudioPicture(file) {
      const source=await studioUpload(file);const coach=getCurrentCoach();const layout=getReportLayout(coach);
      addCertificateUpload(layout,source,file.name);
      if (studioPictureTarget) {const layer=layout.layers.find(l=>l.id===studioPictureTarget);Object.assign(layer,{source,visible:true,objectFit:'cover'});selectedReportOverlay=layer.id;studioPictureTarget='';}
      else addStudioPicture(layout,source,file.name);
      coach.reportLayout=layout;if(await saveReportLayout(coach)) studioToast('Photo added');
    }
    // Delete one of the coach's own saved designs (never a built-in template).
    // If it is the design in use, the coach goes back to the template it was
    // based on. Reports already made keep their own copy of the design.
    async function deleteSavedDesign(id) {
      if (!/^design-/i.test(id)) return;
      const coach = getCurrentCoach();
      const layout = getReportLayout(coach);
      const design = (layout.designs || []).find(item => item.id === id);
      if (!design) return;
      if (!window.confirm(`Delete "${design.name}"? This can't be undone. Reports you already made are not affected.`)) return;
      const designs = layout.designs.filter(item => item.id !== id);
      const { [id]: removed, ...variants } = layout.variants || {};
      if (layout.templateId === id) {
        const baseId = REPORT_TEMPLATES.some(template => template.id === layout.baseTemplateId) ? layout.baseTemplateId : "classic";
        const next = normalizeReportLayout(variants[baseId] || defaultStudioLayout(baseId));
        coach.reportLayout = { ...next, variants, designs, uploads: layout.uploads || [] };
      } else {
        coach.reportLayout = { ...layout, designs, variants };
      }
      if (await saveReportLayout(coach)) studioToast("Design deleted");
      render();
    }

    async function handleStudioAction(action, trigger = null) {
      try {
        if(action==='studio-delete-design')return deleteSavedDesign(trigger?.dataset.designId || '');
        if(action==='studio-gallery'){studioView='templates';studioPreview=false;return render();}
        if(action==='studio-editor'){studioView='editor';return render();}
        if(action==='studio-help'){studioHelpOpen=!studioHelpOpen;return render();}
        if(action==='studio-preview'){studioPreview=!studioPreview;return render();}
        if(action==='studio-demo-nav')return studioToast('This preview focuses on Certificate Design. Choose a template to get started.');
        if(action==='studio-upload-background')return document.getElementById('studioBackgroundUpload')?.click();
        if(['studio-upload-picture','studio-upload-student','studio-upload-coach'].includes(action)){studioPictureTarget=action==='studio-upload-student'?'student-photo':action==='studio-upload-coach'?'coach-photo':'';return document.getElementById('studioPictureUpload')?.click();}
        if(action==='studio-export'){
          const wasPreview=studioPreview;studioPreview=true;render();
          try {const canvas=await renderReportCanvas();const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Unable to create image.');const link=document.createElement('a');const url=URL.createObjectURL(blob);link.href=url;link.download=`${getReportLayout(getCurrentCoach()).designName.replace(/[^a-z0-9]+/gi,'-')}.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
          finally {studioPreview=wasPreview;render();}return;
        }
        const coach=getCurrentCoach();const layout=getReportLayout(coach);
        if(action==='studio-apply-qr'){
          const input=document.getElementById('studioQrUrl');const value=input?.value.trim();let valid=false;
          try{const url=new URL(value);valid=['https:','http:'].includes(url.protocol)&&!!url.hostname&&value.length<=600;}catch{}
          if(!valid){document.getElementById('studioQrError').textContent='Enter a valid URL';input?.focus();return;}
          layout.qrUrl=value;layout.layers.find(l=>l.id==='qr').visible=true;selectedReportOverlay='qr';
        }
        if(action==='studio-toggle-qr'){const layer=layout.layers.find(l=>l.id==='qr');layer.visible=layer.visible===false;selectedReportOverlay='qr';}
        let frameToast='';
        if(action==='studio-frame-photo'){const id=trigger?.dataset.photo;const layer=layout.layers.find(l=>l.id===id);if(layer){layer.visible=layer.visible===false;selectedReportOverlay=layer.visible===false?'':id;frameToast=`${id==='student-photo'?'Student':'Coach'} photo ${layer.visible===false?'hidden':'shown'}`;}}
        if(action==='studio-frame-labels'){const frames=normalizePhotoFrames(layout.photoFrames);layout.photoFrames={...frames,labels:!frames.labels};frameToast=layout.photoFrames.labels?'Labels shown':'Labels hidden';}
        if(action==='studio-frame-shape'){const shape=trigger?.dataset.shape;layout.photoFrames={...normalizePhotoFrames(layout.photoFrames),shape};frameToast='Frame shape updated';}
        if(action==='studio-frame-colour'){const colour=trigger?.dataset.colour;layout.photoFrames={...normalizePhotoFrames(layout.photoFrames),colour};frameToast='Frame colour updated';}
        if(action==='studio-reset-layout'){
          if(!window.confirm('Put every item back in its original place and show the QR code? Your text and logo are kept.'))return;
          coach.reportLayout=resetLayoutPositions(layout);selectedReportOverlay='';
          if(await saveReportLayout(coach)) studioToast('Layout reset');
          return;
        }
        if(action==='studio-save'||action==='studio-save-copy'){
          // Save keeps the coach on the design they are editing (built-in
          // templates included). Only "Save a copy" makes a new design.
          if(action==='studio-save-copy'){
            const name=layout.designName+(action==='studio-save-copy'?' copy':' — my design');layout.templateId=`design-${crypto.randomUUID()}`;layout.designName=name.slice(0,80);layout.designs=[...layout.designs,{id:layout.templateId,name:layout.designName}];
          }else layout.designs=layout.designs.map(d=>d.id===layout.templateId?{...d,name:layout.designName}:d);
          layout.variants={...layout.variants,[layout.templateId]:layoutSnapshot(layout)};
        }
        coach.reportLayout=layout;
        if(await saveReportLayout(coach)) studioToast(frameToast||(action==='studio-apply-qr'?'QR updated':action==='studio-toggle-qr'?(layout.layers.find(l=>l.id==='qr')?.visible===false?'QR hidden':'QR added'):'Saved'));
      } catch(error){studioToast(error.message || 'Unable to save. Please try again.');}
    }


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
    async function saveCentreProfile() {
      state.centreProfile = normalizeCentreProfile(state.centreProfile);
      localStorage.setItem(CENTRE_PROFILE_KEY, JSON.stringify(state.centreProfile));
      persist();
      if (supabase && !isCentreAccount()) {
        const { error } = await supabase
          .from("centre_links")
          .upsert({ id: "centre", links: state.centreProfile.links }, { onConflict: "id" })
        if (error) throw error;
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
        centreId: coach.centreId ?? coach.centre_id ?? "",
        centreContact: coach.centreContact ?? coach.centre_contact ?? "",
        branchAddress: coach.branchAddress || coach.branch_address || coach.branch || "",
        slug: coach.slug || slugify(coach.name),
        role: coach.role || "Table Tennis Coach",
        bio: coach.bio || "",
        photo,
        photo_url: photo,
        links: Array.isArray(coach.links)
          ? coach.links.map((link, index) => ({
              ...link,
              id: link.id || `link-${index + 1}`,
              visible: link.visible !== false,
              order: link.order || index + 1
            }))
          : DEFAULT_COACH_LINKS.map(link => ({ ...link }))
        , reportLayout: normalizeReportLayout(coach.reportLayout || coach.report_layout)
      };
    }

    function validStudioImageSource(source) {
      return typeof source === "string" && (/^https:\/\//i.test(source) || /^\/certificate-templates\/(performance|heritage)\.svg$/.test(source) || source === REPORT_TEMPLATE_SRC || source === "/Certificate%20Template.jpg?v=4" || (isCertificatePreview && /^data:image\/(png|jpeg|webp);base64,/.test(source)));
    }
    function validStudioQrUrl(source) {
      try { const u=new URL(source); return ["https:","http:"].includes(u.protocol) && !!u.hostname && source.length<=600; } catch { return false; }
    }

    // Certificates use Arial. Designs saved before this change still carry the
    // old template fonts, so they are switched to Arial once (fontVersion 2).
    const RETIRED_CERTIFICATE_FONTS = new Set(["Kalam", "Outfit", "Montserrat", "Lato", "Cinzel Decorative", "Georgia"]);
    function upgradeCertificateFonts(saved) {
      if (!saved || typeof saved !== "object" || saved.fontVersion >= 4) return saved;
      const upgraded = { ...saved };
      if (saved.fontVersion !== 2) {
        const fix = item => item && typeof item === "object" && RETIRED_CERTIFICATE_FONTS.has(item.fontFamily) ? { ...item, fontFamily: "Arial" } : item;
        Object.keys(DEFAULT_REPORT_LAYOUT).forEach(key => { if (upgraded[key]) upgraded[key] = fix(upgraded[key]); });
        if (Array.isArray(upgraded.layers)) upgraded.layers = upgraded.layers.map(fix);
      }
      // Version 3: Arial is wider than the old handwriting font, so the
      // contact box sizes that were never changed by the coach get smaller.
      const oldSizes = saved.fontVersion >= 3 ? {} : { contact: 2.9, address: 2.7 };
      Object.entries(oldSizes).forEach(([key, size]) => {
        if (upgraded[key] && Number(upgraded[key].fontSize) === size) upgraded[key] = { ...upgraded[key], fontSize: DEFAULT_REPORT_LAYOUT[key].fontSize };
      });
      // Remarks used to run past the ruled lines on the right.
      if (upgraded.remarks && Number(upgraded.remarks.width) === 86) upgraded.remarks = { ...upgraded.remarks, width: DEFAULT_REPORT_LAYOUT.remarks.width };
      // Version 4: remarks rows sit on the ruled lines.
      if (upgraded.remarks && Number(upgraded.remarks.top) === 62.4 && Number(upgraded.remarks.height) === 12.9) {
        upgraded.remarks = { ...upgraded.remarks, top: DEFAULT_REPORT_LAYOUT.remarks.top, height: DEFAULT_REPORT_LAYOUT.remarks.height };
      }
      return upgraded;
    }

    // Fix photo/QR positions that can't be right: missing numbers, the old
    // QR spot on the classic frame's corner, or a photo pushed up into the
    // classic title area. Anything else the coach placed is kept.
    function repairLayerGeometry(defaultLayer, savedLayer, saved) {
      if (!["student-photo", "coach-photo", "qr"].includes(defaultLayer.id) || !savedLayer || !Object.keys(savedLayer).length) return savedLayer;
      const fields = ["left", "top", "width", "height"];
      const invalid = fields.some(field => savedLayer[field] !== undefined && !Number.isFinite(Number(savedLayer[field])));
      const isClassic = !saved?.baseTemplateId || saved.baseTemplateId === "classic";
      const oldQrSpot = defaultLayer.id === "qr" && isClassic && [[87.7, 91.88], [76.5, 78.2], [70.5, 79.3], [88.2, 87.9]].some(([left, top]) => Number(savedLayer.left) === left && Number(savedLayer.top) === top);
      const photoInTitle = defaultLayer.id !== "qr" && isClassic && Number.isFinite(Number(savedLayer.top)) && Number(savedLayer.top) < 18;
      if (!invalid && !oldQrSpot && !photoInTitle) return savedLayer;
      const repaired = { ...savedLayer };
      fields.forEach(field => { repaired[field] = defaultLayer[field]; });
      return repaired;
    }

    // Summary sections used to be Taught/Before on the left and After/Next on
    // the right. Items still at those old default spots move to the new ones
    // (Before/After left, Taught/Next right). Items a coach moved stay put.
    const OLD_SUMMARY_SPOTS = {
      "taught-title": [9.7, 42], "before-title": [9.7, 50], "after-title": [53.8, 42],
      whatTaught: [11.8, 44.9], beforeCoaching: [11.8, 52.8], afterTraining: [55.4, 44.9]
    };
    function moveSummarySections(saved) {
      if (!saved || typeof saved !== "object" || (saved.baseTemplateId && saved.baseTemplateId !== "classic")) return saved;
      const atOldSpot = (id, item) => item && Number(item.left) === OLD_SUMMARY_SPOTS[id][0] && Number(item.top) === OLD_SUMMARY_SPOTS[id][1];
      const next = { ...saved };
      ["whatTaught", "beforeCoaching", "afterTraining"].forEach(key => {
        if (atOldSpot(key, saved[key])) next[key] = { ...saved[key], left: DEFAULT_REPORT_LAYOUT[key].left, top: DEFAULT_REPORT_LAYOUT[key].top, width: DEFAULT_REPORT_LAYOUT[key].width };
      });
      if (Array.isArray(saved.layers)) next.layers = saved.layers.map(layer => {
        if (!layer || !OLD_SUMMARY_SPOTS[layer.id] || !ARTWORK_SLICES[layer.id] || !atOldSpot(layer.id, layer)) return layer;
        const spot = ARTWORK_SLICES[layer.id];
        return { ...layer, left: spot.left, top: spot.top, width: spot.width };
      });
      return next;
    }

    // Older versions turned every Save on Classic/Performance/Heritage into a
    // hidden "<Template> — my design" copy, so the template card kept showing
    // the old layout. If the coach is on such a copy, put it back on the
    // template it came from. Only coach layouts (which carry "designs") are
    // touched; report snapshots are left as they are.
    function foldAccidentalDesignCopy(saved) {
      if (!saved || !Array.isArray(saved.designs) || !/^design-/i.test(String(saved.templateId || ""))) return saved;
      const base = REPORT_TEMPLATES.find(template => template.id === (saved.baseTemplateId || "classic"));
      if (!base || String(saved.designName || "") !== `${base.name} — my design`) return saved;
      const { [saved.templateId]: dropped, ...variants } = saved.variants || {};
      return {
        ...saved, templateId: base.id, designName: base.name,
        designs: saved.designs.filter(design => design.id !== saved.templateId),
        variants
      };
    }

    // Photo frames: how the student and coach photos look on the certificate.
    const PHOTO_FRAME_SHAPES = { rounded: "Rounded", square: "Square", circle: "Circle" };
    const PHOTO_FRAME_COLOURS = { light: ["Light", "#d5d9e0"], white: ["White", "#ffffff"], red: ["Red", "#c81e45"], navy: ["Navy", "#162a4a"], gold: ["Gold", "#c9a96b"], none: ["None", "transparent"] };
    function normalizePhotoFrames(value) {
      const frames = value && typeof value === "object" ? value : {};
      return {
        shape: PHOTO_FRAME_SHAPES[frames.shape] ? frames.shape : "rounded",
        colour: PHOTO_FRAME_COLOURS[frames.colour] ? frames.colour : "light",
        labels: frames.labels !== false
      };
    }

    function normalizeReportLayout(saved = {}) {
      saved = moveSummarySections(upgradeCertificateFonts(foldAccidentalDesignCopy(saved)));
      const keyed = Object.fromEntries(Object.entries(DEFAULT_REPORT_LAYOUT).map(([key, value]) => [key, { ...value, ...(saved?.[key] || {}) }]));
      const legacyLayout = saved?.editorVersion !== 2;
      const savedLayers = Array.isArray(saved?.layers) ? saved.layers : [];
      const layers = DEFAULT_CERTIFICATE_LAYERS.map(defaultLayer => {
        const savedLayer = repairLayerGeometry(defaultLayer, savedLayers.find(layer => layer.id === defaultLayer.id) || {}, saved);
        const isHeading = Object.prototype.hasOwnProperty.call(ARTWORK_EDITABLE_TEXT, defaultLayer.id);
        const merged = {
          ...defaultLayer, ...savedLayer,
          // Old versions imposed these locks on every load. Release them on
          // upgrade; subsequent locks are explicit choices and remain saved.
          locked: legacyLayout && (ARTWORK_SLICES[defaultLayer.id] || defaultLayer.id === "qr")
            ? false : savedLayer.locked === true,
          visible: savedLayer.visible !== false,
          zIndex: Number(savedLayer.zIndex) || defaultLayer.zIndex
        };
        if (isHeading) {
          merged.type = "text";
          merged.text = typeof savedLayer.text === "string" ? savedLayer.text
            : typeof savedLayer.textOverride === "string" ? savedLayer.textOverride
            : ARTWORK_EDITABLE_TEXT[defaultLayer.id];
          delete merged.textOverride;
        }
        return merged;
      }).concat(savedLayers.filter(layer =>
        !DEFAULT_CERTIFICATE_LAYERS.some(defaultLayer => defaultLayer.id === layer.id)
        && !RETIRED_CERTIFICATE_LAYER_IDS.has(layer.id)
      ));
      const uploads = Array.isArray(saved?.uploads)
        ? saved.uploads.filter(asset => asset && typeof asset.source === "string" && validStudioImageSource(asset.source))
          .slice(-40)
          .map((asset, index) => ({
            id: String(asset.id || `upload-${index + 1}`).slice(0, 128),
            name: String(asset.name || "Uploaded image").slice(0, 120),
            source: isCertificatePreview ? asset.source : asset.source.slice(0, 2048)
          }))
        : [];
      return { ...keyed, layers, uploads, editorVersion: 2, fontVersion: 4,
        photoFrames: normalizePhotoFrames(saved?.photoFrames),
        templateId: String(saved?.templateId || "classic"),
        baseTemplateId: ["classic","performance","heritage"].includes(saved?.baseTemplateId) ? saved.baseTemplateId : (["performance","heritage"].includes(saved?.templateId) ? saved.templateId : "classic"),
        designName: String(saved?.designName || "Classic").slice(0,80),
        backgroundSource: validStudioImageSource(saved?.backgroundSource) ? saved.backgroundSource : REPORT_TEMPLATE_SRC,
        qrUrl: validStudioQrUrl(saved?.qrUrl) ? saved.qrUrl : "https://jom-nittaku-webapp.vercel.app/centre",
        designs: Array.isArray(saved?.designs) ? saved.designs.filter(d=>d && /^design-[a-z0-9-]+$/i.test(d.id)).slice(-30).map(d=>({id:d.id,name:String(d.name || "My design").slice(0,80)})) : [],
        variants: saved?.variants && typeof saved.variants === "object" ? Object.fromEntries(Object.entries(saved.variants).filter(([key,v])=>/^(classic|performance|heritage|design-[a-z0-9-]+)$/i.test(key) && v && typeof v==='object').slice(-35).map(([key,value])=>[key,layoutSnapshot(value)])) : {}
      };
    }

    function getReportLayout(coach) {
      return coach?.reportLayout ? normalizeReportLayout(coach.reportLayout) : normalizeReportLayout();
    }

    function overlayStyle(layout, extra = "") {
      return `left:${layout.left}%;top:${layout.top}%;width:${layout.width}%;${layout.height ? `height:${layout.height}%;` : ""}font-size:${layout.fontSize}cqw;font-family:${escapeHtml(layout.fontFamily)};color:${escapeHtml(layout.color)};font-weight:${layout.fontWeight};font-style:${escapeHtml(layout.fontStyle || "normal")};text-decoration:${escapeHtml(layout.textDecoration || "none")};opacity:${layout.opacity ?? 1};z-index:${layout.zIndex ?? 20};${extra}`;
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
        status: REPORT_STATUSES.includes(report.status) ? report.status : "Generated",
        summary: normalizeSummary(report.summary)
      };
    }

    function normalizeStudent(student) {
      return {
        ...student,
        coachId: student.coachId || student.coach_id,
        parentHp: student.parentHp ?? student.parent_hp ?? "",
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
        reports: [],
        reportDrafts: {}
      };
    }

    function hasSupabaseConfig() {
      return Boolean(SUPABASE_URL && SUPABASE_KEY);
    }

    function dashboardStateId() {
      return state.auth.centreId && ["centre_admin", "coach"].includes(state.auth.role)
        ? `centre:${state.auth.centreId}`
        : "dashboard";
    }

    function isCentreAccount() {
      return Boolean(state.auth.centreId && ["centre_admin", "coach"].includes(state.auth.role));
    }

    async function loadState(id = dashboardStateId()) {
      if (!hasSupabaseConfig()) {
        return normalizeState(createInitialState());
      }
      try {
        const { data, error } = await supabase
          .from("dashboard_state")
          .select("payload")
          .eq("id", id)
          .single();
        if (!error && data?.payload && data.payload.dataVersion >= 2) {
          return normalizeState({ ...createDashboardStatePayload(data.payload), reports: [], reportDrafts: {} });
        }
      } catch (error) {}
      return normalizeState(createInitialState());
    }

    async function loadPublicCentreProfile() {
      if (isCentreAccount()) return normalizeCentreProfile(state.centreProfile);
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

    async function fetchPublicCoachPage(slug) {
      if (!supabase || !slug) return { status: "missing" };
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { data, error } = await supabase.rpc("get_public_coach_page", { target_slug: slug.toLowerCase() });
        if (!error) {
          const page = Array.isArray(data) ? data[0] : data;
          return page ? { status: "ready", page } : { status: "missing" };
        }
        await new Promise(resolve => window.setTimeout(resolve, 500));
      }
      return { status: "error" };
    }

    // Find an active centre by its link. Uses the get_centre_by_slug database
    // function, which works whether or not someone is signed in. A failed
    // request (for example while the sign-in token is being renewed on a
    // refresh) is retried before giving up, and is reported separately from
    // "this centre does not exist".
    async function fetchCentreBySlug(slug, client = supabase) {
      if (!client || !slug) return { centre: null };
      const columns = "id,name,slug,sport,status,logo_url,activated_at";
      let lastError = null;
      let useTable = false;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          let centre = null;
          if (!useTable) {
            const { data, error } = await client.rpc("get_centre_by_slug", { target_slug: slug });
            if (error && (error.code === "PGRST202" || /get_centre_by_slug/.test(error.message || ""))) {
              useTable = true; // The database function is not installed yet.
            } else if (error) {
              throw error;
            } else {
              centre = Array.isArray(data) ? data[0] || null : data || null;
            }
          }
          if (useTable) {
            const { data, error } = await client.from("centres").select(columns).eq("slug", slug).maybeSingle();
            if (error) throw error;
            centre = data?.status === "active" ? data : null;
          }
          if (centre) return { centre };
          // Not found: with the database function that is a real answer.
          // The older table lookup can hide centres while a session is
          // settling, so give it one more try.
          if (!useTable || attempt > 0) return { centre: null };
        } catch (error) {
          lastError = error;
        }
        try { await client.auth.getSession(); } catch { /* keep retrying */ }
        await new Promise(resolve => window.setTimeout(resolve, 400 * (attempt + 1)));
      }
      return lastError ? { centre: null, error: lastError } : { centre: null };
    }

    async function invokePrivileged(functionName, body) {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error } = await supabase.functions.invoke(functionName, { body, ...(body.hybrid_draft ? { timeout: 45000 } : body.action === "report-template-capabilities" ? { timeout: 15000 } : {}) });
      if (error) {
        let detail = "", code = "", extra = {};
        try {
          const response = error.context;
          const payload = response && typeof response.json === "function" ? await response.json() : null;
          detail = payload?.error || "";
          code = payload?.code || "";
          extra = payload?.centre ? { centre: payload.centre } : {};
        } catch (parseError) {}
        throw Object.assign(new Error(detail || error.message || "The server rejected this request."), { code, ...extra });
      }
      // Older Edge Function deployments can return the JSON body as text when
      // their content type is not propagated through the gateway. Normalize it
      // here so callers always receive the same object shape.
      let payload = data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch (parseError) {
          // Preserve the original response for callers that handle plain text.
        }
      }
      if (payload?.error) throw Object.assign(new Error(payload.error), { code: payload.code || "", ...(payload.centre ? { centre: payload.centre } : {}) });
      return payload;
    }

    function queueReportWrite(record, options) {
      if (isCertificatePreview) return Promise.resolve(structuredClone(record));
      const normalized = normalizeReportRecord(record);
      const previous = reportWriteQueues.get(normalized.id) || Promise.resolve();
      const current = previous.catch(() => {}).then(() => reportRepository.save(normalized, options));
      reportWriteQueues.set(normalized.id, current);
      current.finally(() => {
        if (reportWriteQueues.get(normalized.id) === current) reportWriteQueues.delete(normalized.id);
      }).catch(() => {});
      return current;
    }

    function resetHybridSession() {
      clearTimeout(hybridSyncTimer);
      hybridSyncTimer = null;
      hybridWorkspace = null;
      hybridScope = "";
      hybridCacheLoadedScope = "";
      hybridPending = [];
      hybridSyncedDraftIds = new Set();
      remoteReportDrafts = new Map();
      reportUsingLocalCache = false;
      hybridLocalError = "";
      coachDriveRoots = {};
    }

    function ensureHybridWorkspace() {
      if (!reportLocalStore || !state.auth.userId || !getReportCentreId()) return null;
      const scope = reportWorkspaceKey({ project: SUPABASE_URL, userId: state.auth.userId, role: state.auth.role, centreId: getReportCentreId() });
      if (hybridWorkspace && hybridScope === scope) return hybridWorkspace;
      const verifiedRoots = coachDriveRoots;
      resetHybridSession();
      coachDriveRoots = verifiedRoots;
      hybridScope = scope;
      const workspace = createHybridReportWorkspace({
        store: reportLocalStore, scope, actorId: state.auth.userId, remote: reportRepository,
        getRoot: coachId => state.auth.role === "coach"
          ? state.driveConnection?.status === "connected" && coachId === state.auth.userId ? state.driveConnection.root_folder_id || "" : ""
          : coachDriveRoots[coachId] || "",
        isActive: () => hybridWorkspace === workspace && hybridScope === scope && Boolean(state.auth.userId)
          && scope === reportWorkspaceKey({ project: SUPABASE_URL, userId: state.auth.userId, role: state.auth.role, centreId: getReportCentreId() }),
        onChange: snapshot => {
          applyHybridSnapshot(snapshot);
          updateHybridNotice();
        },
      });
      hybridWorkspace = workspace;
      return workspace;
    }

    function reportSaveMessage() {
      if (isCertificatePreview) return "Preview";
      // Drafts save on this device first and sync to Drive in the background.
      // Coaches only need to know whether their work is saved.
      if (dirtyReportDraftId === wizardDraftId || draftSaveTimer) return "Saving…";
      return "Saved";
    }

    function applyHybridSnapshot(snapshot) {
      hybridPending = snapshot.pending;
      const pendingIds = new Set(snapshot.pending.map(item => item.id));
      hybridSyncedDraftIds = new Set(snapshot.syncedDraftIds || snapshot.records.filter(record => record.recordType === "draft" && !pendingIds.has(record.id)).map(record => record.id));
    }

    function hybridNoticeContent() {
      // Background Drive sync is silent; only a broken device store is shown.
      if (!hybridLocalError) return "";
      return `<p class="is-error">${escapeHtml(hybridLocalError)}</p>`;
    }

    function renderHybridNotice() { return `<div class="report-hybrid-notice" data-hybrid-notice role="status">${hybridNoticeContent()}</div>`; }

    function updateHybridNotice() {
      document.querySelectorAll?.("[data-hybrid-notice]").forEach(element => { element.innerHTML = hybridNoticeContent(); });
      if (wizardDraftId) updateReportSaveStatus(reportSaveMessage());
    }

    function scheduleHybridSync(delay = 1000) {
      clearTimeout(hybridSyncTimer);
      if (!hybridWorkspace) return;
      hybridSyncTimer = window.setTimeout(() => syncLocalDrafts(), delay);
    }

    async function syncLocalDrafts() {
      const workspace = hybridWorkspace;
      if (!workspace) return;
      try {
        if (navigator.onLine !== false) await workspace.sync();
      } catch (error) {
        if (workspace === hybridWorkspace) hybridLocalError = `Local storage: ${error.message}`;
      }
      if (workspace !== hybridWorkspace) return;
      updateHybridNotice();
      if (hybridPending.some(item => !item.blocked)) scheduleHybridSync(15000);
    }

    function applyReportRecords(records, centreId) {
      state.reports = records.filter(record => record.recordType === "report").map(record => ({ ...normalizeReport(record), centreId }));
      state.reportDrafts = Object.fromEntries(records.filter(record => record.recordType === "draft").map(record => [record.id, { ...normalizeDraft(record), centreId }]));
    }

    function updateReportSaveStatus(text, isError = false) {
      const status = document.getElementById("reportSaveStatus");
      if (!status) return;
      status.textContent = text;
      status.classList.toggle("is-error", isError);
    }

    async function saveReportRecord(record, options = {}) {
      const saveScope = reportReadScope();
      const saveGeneration = reportLoadGeneration;
      const draftBeforeSave = record.recordType === "draft" ? JSON.stringify(state.reportDrafts[record.id]) : "";
      reportWriteRevision += 1;
      const workspace = !isCertificatePreview && record.recordType === "draft" ? ensureHybridWorkspace() : null;
      if (workspace) {
        updateReportSaveStatus("Saving…");
        try {
          const saved = await workspace.queue(record, { baseRecord: remoteReportDrafts.get(record.id) || null });
          if (workspace !== hybridWorkspace) return saved;
          if (JSON.stringify(state.reportDrafts[record.id]) === draftBeforeSave) state.reportDrafts[saved.id] = { ...normalizeDraft(saved), centreId: options.centreId || getReportCentreId() };
          hybridLocalError = "";
          reportStoreStatus = "ready";
          updateReportSaveStatus(reportSaveMessage());
          scheduleHybridSync();
          return saved;
        } catch (error) {
          if (workspace === hybridWorkspace) {
            hybridLocalError = `Not saved on this device: ${error.message}`;
            updateReportSaveStatus(hybridLocalError, true);
            updateHybridNotice();
          }
          throw error;
        }
      }
      reportStoreError = "";
      reportStoreStatus = "saving";
      updateReportSaveStatus(isCertificatePreview ? "Saving preview…" : "Saving to Google Drive…");
      try {
        const saved = await queueReportWrite(record, options);
        if (saveScope !== reportReadScope() || saveGeneration !== reportLoadGeneration) return saved;
        reportStoreStatus = "ready";
        reportStoreError = "";
        updateReportSaveStatus(isCertificatePreview ? "Preview" : "Saved to Google Drive");
        if (record.recordType === "draft" && JSON.stringify(state.reportDrafts[record.id]) === draftBeforeSave) {
          state.reportDrafts[saved.id] = { ...normalizeDraft(saved), centreId: options.centreId || record.centreId || getReportCentreId() };
        }
        return saved;
      } catch (error) {
        if (saveScope !== reportReadScope() || saveGeneration !== reportLoadGeneration) throw error;
        reportStoreStatus = "error";
        reportStoreError = error.message || "Unable to save report to Google Drive.";
        updateReportSaveStatus(`Not saved: ${reportStoreError}`, true);
        throw error;
      }
    }

    function reportReadScope() {
      return JSON.stringify([state.auth.userId, state.auth.role, getReportCentreId()]);
    }

    function invalidateReportReads() {
      // A response from a previous account/workspace must never hydrate this one.
      reportLoadGeneration += 1;
      reportLoadPromise = null;
      reportLoadedAt = 0;
      reportLoadedScope = "";
      resetHybridSession();
      reportGenerating = false;
    }

    function refreshReportsInBackground(options = {}) {
      const scope = reportReadScope();
      const generation = reportLoadGeneration;
      const pending = loadReportsFromDrive(options);
      pending.then(() => {
        if (scope !== reportReadScope() || generation !== reportLoadGeneration) return;
        // Background completion must not replace profile forms, certificate
        // editors, or an open wizard/modal while the user is working in them.
        if (wizardDraftId || onboardingModal || studentEditModal || reportStartOpen) return;
        if (!["overview", "reports", "report-view"].includes(state.ui.page)) return;
        scheduleRender();
      }).catch(() => {});
      return pending;
    }

    async function loadReportsFromDrive({ force = false } = {}) {
      const isGlobalAdmin = state.auth.role === "admin";
      if (!reportRepository || (!isCentreAccount() && !isGlobalAdmin)) return;
      if (reportLoadPromise) return reportLoadPromise;
      // Keep active edits authoritative; a list response may predate a save.
      if (wizardDraftId || dirtyReportDraftId || draftSaveTimer || reportWriteQueues.size || reportStoreStatus === "saving") return;
      const scope = reportReadScope();
      const generation = reportLoadGeneration;
      const revision = reportWriteRevision;
      const isCurrent = () => scope === reportReadScope() && generation === reportLoadGeneration;
      const canApply = () => isCurrent() && revision === reportWriteRevision && !wizardDraftId && !dirtyReportDraftId;
      let hasSnapshot = reportLoadedScope === scope && Boolean(reportLoadedAt);
      if (!force && hasSnapshot && Date.now() - reportLoadedAt < REPORT_SESSION_CACHE_MS) return;
      if (/^\/coach\/[^/]+\/?$/i.test(window.location.pathname)) return;
      reportStoreError = "";
      reportStoreStatus = hasSnapshot ? "ready" : "loading";
      // Assign the shared promise before any context/list request can finish.
      // This includes global-admin context discovery, not just the final list.
      const pending = Promise.resolve().then(async () => {
        try {
          if (!isCurrent()) return;
          const workspace = ensureHybridWorkspace();
          const explicitlyDisconnected = state.auth.role === "coach" && !driveConnectionError && state.driveConnection?.status !== "connected";
          if (workspace && !explicitlyDisconnected && hybridCacheLoadedScope !== hybridScope) {
            try {
              const local = await workspace.snapshot();
              if (!canApply()) return;
              applyHybridSnapshot(local);
              hybridCacheLoadedScope = hybridScope;
              if (local.records.length) {
                applyReportRecords(local.records, getReportCentreId());
                hasSnapshot = true;
                reportUsingLocalCache = true;
                reportStoreStatus = "ready";
                if (["overview", "reports", "report-view"].includes(state.ui.page)) scheduleRender();
              }
              scheduleHybridSync();
            } catch (error) { hybridLocalError = `Local storage unavailable: ${error.message}`; }
          }
          if (isGlobalAdmin && !adminReportCentresLoaded) {
            const result = await invokePrivileged("google-drive-oauth", { action: "admin-report-context" });
            if (!isCurrent()) return;
            adminReportCentres = Array.isArray(result.centres) ? result.centres : [];
            adminReportCentresLoaded = true;
          }
          const centreId = getReportCentreId();
          if (isGlobalAdmin && !centreId) {
            reportStoreStatus = "idle";
            return;
          }
          if (isGlobalAdmin && adminReportContextCentreId !== centreId) {
            const context = await invokePrivileged("google-drive-oauth", { action: "admin-report-context", centre_id: centreId });
            if (!isCurrent()) return;
            adminReportContext = {
              ...context,
              coaches: (context.coaches || []).map(normalizeCoach),
              students: (context.students || []).map(normalizeStudent),
            };
            connectedCoachDriveIds = Array.isArray(context.connected_coach_ids) ? context.connected_coach_ids : [];
            adminReportContextCentreId = centreId;
          }
          if (state.auth.role === "coach" && state.driveConnection?.status !== "connected") {
            if (hasSnapshot && driveConnectionError) {
              reportStoreStatus = "ready";
              reportStoreError = "Showing saved data from this device. Reconnect to check Google Drive.";
              return;
            }
            state.reports = [];
            state.reportDrafts = {};
            reportStoreStatus = "disconnected";
            reportStoreError = driveConnectionError || "Connect your Google Drive to view or create your reports.";
            return;
          }
          let driveWarnings = [];
          let sources = {};
          let records = await reportRepository.list({ centreId, onWarnings: warnings => { driveWarnings = warnings; }, onSources: roots => { sources = roots; } });
          if (!canApply()) return;
          coachDriveRoots = sources;
          remoteReportDrafts = new Map(records.filter(record => record.recordType === "draft").map(record => [record.id, record]));
          if (workspace) {
            try {
              const local = await workspace.cache(records, { complete: !driveWarnings.length });
              if (!canApply()) return;
              const pendingIds = new Set(local.pending.map(item => item.id));
              const merged = new Map(records.map(record => [record.id, record]));
              for (const record of local.records) if (pendingIds.has(record.id) || driveWarnings.length && !merged.has(record.id)) merged.set(record.id, record);
              records = [...merged.values()];
              applyHybridSnapshot(local);
            } catch (error) { hybridLocalError = `Local cache could not be updated: ${error.message}`; }
          }
          applyReportRecords(records, centreId);
          reportUsingLocalCache = Boolean(driveWarnings.length);
          reportStoreStatus = "ready";
          reportStoreError = driveWarnings.length ? `Some coach reports could not be loaded: ${driveWarnings.join("; ")}` : "";
          reportLoadedAt = Date.now();
          reportLoadedScope = scope;
        } catch (error) {
          if (!canApply()) return;
          reportStoreStatus = hasSnapshot ? "ready" : "error";
          reportStoreError = error.message || "Unable to load reports from Google Drive.";
        }
      });
      reportLoadPromise = pending;
      try {
        await pending;
      } finally {
        if (reportLoadPromise === pending) reportLoadPromise = null;
      }
    }

    async function refreshPrivilegedState() {
      if (!supabase) return;
      if (state.auth.role === "dev") {
        const data = await invokePrivileged("dev-console", { action: "list" });
        state.devCentres = data.centres || [];
      } else if (["centre_admin", "coach"].includes(state.auth.role) && state.auth.centreId) {
        // Drive tokens never leave the Edge Function. Coaches see their own status;
        // centre admins only see the IDs of connected coaches.
        let result;
        try {
          result = await invokePrivileged("google-drive-oauth", { action: "connection-status", centre_id: state.auth.centreId });
          driveConnectionError = "";
        } catch (error) {
          driveConnectionError = error.message || "Unable to check your Google Drive connection.";
          throw error;
        }
        if (state.auth.role === "coach") {
          state.driveConnection = result.connection || null;
          connectedCoachDriveIds = result.connection?.status === "connected" ? [state.auth.userId] : [];
        } else {
          state.driveConnection = null;
          connectedCoachDriveIds = Array.isArray(result.connected_coach_ids) ? result.connected_coach_ids : [];
          coachDriveRoots = result.source_roots || {};
        }
      }
    }

    async function refreshCoachesFromSupabase() {
      if (!supabase || !state.auth.userId) return;
      const query = supabase.from("coaches").select("*").order("created_at", { ascending: true });
      const { data, error } = state.auth.role === "admin" || state.auth.role === "centre_admin"
        ? await query
        : await query.eq("id", state.auth.userId);
      if (error || !Array.isArray(data)) return;
      state.coaches = data.map(normalizeCoach);
    }

    async function refreshStudentsFromSupabase() {
      if (!supabase || !state.auth.userId) return;
      const query = supabase.from("students").select("*").order("created_at", { ascending: true });
      const { data, error } = state.auth.role === "admin" || state.auth.role === "centre_admin"
        ? await query
        : await query.eq("coach_id", state.auth.userId);
      if (error || !Array.isArray(data)) return;
      state.students = data.map(normalizeStudent);
    }

    async function refreshCoachAccountCount() {
      if (!supabase || state.auth.role !== "admin") return;
      const { count, error } = await supabase
        .from("coaches")
        .select("id", { count: "exact", head: true });
      if (!error && Number.isInteger(count)) coachAccountCount = count;
    }

    async function flushStateToSupabase() {
      if (!hasSupabaseConfig() || isApplyingRemoteState) {
        return;
      }
      const payload = createDashboardStatePayload({
        ...state,
        auth: { role: null, coachId: null, userId: null, centreId: null, email: "" }
      });
      await supabase
        .from("dashboard_state")
        .upsert({ id: dashboardStateId(), payload }, { onConflict: "id" });
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
      const liveCentreProfile = state.centreProfile;
      const liveReports = state.reports;
      const liveReportDrafts = state.reportDrafts;
      // People data never comes from the shared row; keep what was loaded
      // from the coaches/students tables for this account.
      const liveCoaches = state.coaches;
      const liveStudents = state.students;
      const liveDevCentres = state.devCentres;
      const focusedWizardField = document.activeElement?.closest("#wizardModal input, #wizardModal textarea, #wizardModal select");
      const localWizardDraft = focusedWizardField && wizardDraftId && state.reportDrafts?.[wizardDraftId]
        ? {
            ...state.reportDrafts[wizardDraftId],
            summary: { ...state.reportDrafts[wizardDraftId].summary }
          }
        : null;
      state = normalizeState(createDashboardStatePayload(payload));
      state.auth = liveAuth;
      state.ui = liveUi;
      state.centreProfile = liveCentreProfile;
      state.reports = liveReports;
      state.reportDrafts = liveReportDrafts;
      state.coaches = liveCoaches;
      state.students = liveStudents;
      state.devCentres = liveDevCentres;
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
          { event: "*", schema: "public", table: "dashboard_state", filter: `id=eq.${dashboardStateId()}` },
          payload => {
            const nextPayload = payload.new?.payload;
            if (payload.new?.id === dashboardStateId() && nextPayload) {
              applyRemoteState(nextPayload);
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "coaches" },
          async () => {
            await refreshCoachesFromSupabase();
            await refreshCoachAccountCount();
            render();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "students" },
          async () => {
            await refreshStudentsFromSupabase();
            render();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "centre_links" },
          async () => {
            state.centreProfile = await loadPublicCentreProfile();
            render();
          }
        )
        .subscribe();
    }

    function createInitialState() {
      return {
        dataVersion: 3,
        auth: { role: null, coachId: null, userId: null, centreId: null, email: "" },
        ui: { page: "overview", avatarMenuOpen: false, reportViewId: null, adminToast: "" },
        adminProfile: { fullName: "Centre Admin", photo: "" },
        centreProfile: { links: [] },
        driveConnection: null,
        devCentres: [],
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

    function formatShortDate(date) {
      const value = new Date(date + "T00:00:00");
      const sameYear = value.getFullYear() === new Date().getFullYear();
      return value.toLocaleDateString("en-GB", sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
    }

    function formatDate(date) {
      return new Date(date + "T00:00:00").toLocaleDateString("en-MY", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    }

    // Hour / minute / AM-PM picker so times read "3:25 PM", not "03:25 PM".
    // The hidden #wizardTime keeps the 24-hour value the draft stores.
    function renderTimePicker(time24) {
      const [rawHour, rawMinute] = String(time24 || "").split(":").map(Number);
      const hour24 = Number.isFinite(rawHour) ? rawHour : 9;
      const minute = Number.isFinite(rawMinute) ? rawMinute : 0;
      const hour12 = hour24 % 12 || 12;
      const pm = hour24 >= 12;
      const options = (values, selected, label) => values.map(value => `<option value="${value}" ${value === selected ? "selected" : ""}>${label(value)}</option>`).join("");
      return `<div class="time-picker" data-time-picker>
        <input id="wizardTime" type="hidden" value="${escapeHtml(time24 || "")}">
        <select class="text-input" data-time-part="hour" aria-label="Hour">${options(Array.from({ length: 12 }, (_, i) => i + 1), hour12, value => value)}</select>
        <span aria-hidden="true">:</span>
        <select class="text-input" data-time-part="minute" aria-label="Minute">${options(Array.from({ length: 60 }, (_, i) => i), minute, value => String(value).padStart(2, "0"))}</select>
        <select class="text-input" data-time-part="ampm" aria-label="AM or PM">${options(["AM", "PM"], pm ? "PM" : "AM", value => value)}</select>
      </div>`;
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
      const coach = report.previewCoach || getCoachById(report.coachId);
      const student = report.previewStudent || getStudentById(report.studentId);
      const summary = normalizeSummary(report.summary);
      return {
        report,
        coach,
        student,
        session: {
          date: report.date ? formatDate(report.date) : "",
          time: report.time ? formatTime(report.time) : "",
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

    function renderTemplatePhoto(photo, label, frames = null) {
      const frame = normalizePhotoFrames(frames);
      const colour = PHOTO_FRAME_COLOURS[frame.colour][1];
      const frameStyle = frame.colour === "light" ? "" : frame.colour === "none" ? "border-color:transparent;" : `border:0.45cqw solid ${colour};`;
      return `
        <div class="template-photo-card is-${frame.shape}${frame.labels ? "" : " no-label"}">
          <div class="template-photo-frame" style="${frameStyle}">
            <img class="template-photo" src="${photo || `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(PHOTO_PLACEHOLDER_SVG)}`}" alt="">
          </div>
          ${frame.labels ? `<div class="template-photo-label">${label}</div>` : ""}
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

    // Split text into lines that fit a width (in cqw) at a font size (in cqw).
    let textMeasureContext = null;
    function wrapTextToWidth(text, widthCqw, fontCqw) {
      const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
      if (!words.length) return [];
      if (!textMeasureContext) {
        try { textMeasureContext = document.createElement("canvas").getContext("2d"); } catch { textMeasureContext = null; }
      }
      const fits = line => {
        if (!textMeasureContext) return line.length <= Math.floor(widthCqw / (fontCqw * 0.52));
        textMeasureContext.font = "400 100px Arial";
        return (textMeasureContext.measureText(line).width / 100) * fontCqw <= widthCqw * 0.97;
      };
      const lines = [];
      let current = "";
      words.forEach(word => {
        const next = current ? `${current} ${word}` : word;
        if (!current || fits(next)) current = next;
        else { lines.push(current); current = word; }
      });
      if (current) lines.push(current);
      return lines;
    }

    function renderPlainBulletOverlays(lines, positions, layout, field) {
      if(layout.visible===false)return "";
      const rowHeight = 100 / positions.length;
      const sourceLines = String(layout.textOverride ?? lines.join("\n")).split(/\n+/);
      // Remarks: wrap the text so each line sits on one ruled line.
      const ruled = field === "remarks";
      const displayLines = (ruled
        ? sourceLines.flatMap(line => wrapTextToWidth(line, Number(layout.width) || 79.5, Number(layout.fontSize) || 1.55))
        : sourceLines).slice(0, positions.length);
      lines = displayLines;
      return `<div class="template-bullet-group report-overlay-item ${reportLayoutEditing ? "is-editing" : ""} ${reportLayoutEditing && selectedReportOverlay === field ? "is-selected" : ""} ${layout.locked === true ? "is-locked" : ""}" data-overlay-id="${field}" data-overlay-text="true" style="${overlayStyle(layout)}">
        ${positions.map((_position, index) => `<div class="template-text template-bullet ${ruled ? "is-ruled" : ""} ${lines[index] ? "" : "empty"}" style="left:0;width:100%;${ruled ? `top:auto;bottom:${(100 - (index + 1) * rowHeight).toFixed(3)}%;` : `top:${index * rowHeight}%;max-height:${rowHeight}%;`}"><span>${lines[index] ? escapeHtml(lines[index].replace(/^\s*[•●-]\s*/, "")) : ""}</span></div>`).join("")}
        ${reportLayoutEditing ? renderCertificateResizeHandles() : ""}
      </div>`;
    }

    function splitReportRemarks(value, limit = 5) {
      return String(value || "")
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean)
        .slice(0, limit);
    }

    function renderReportTemplate(report, layoutOverride = null, previewId = "reportTemplatePreview") {
      const data = getReportTemplateData(report);
      // Saved reports keep a copy of the design from the day they were made.
      // Run every layout through the same upgrade as live designs, so older
      // copies also get Arial and repaired photo/QR positions.
      const layout = normalizeReportLayout(layoutOverride || report.certificateDesign?.layout || getReportLayout(data.coach));
      const footerTop = data.remarksLines.length
        ? Math.min(
            REPORT_TEMPLATE_FOOTER_TOP_DEFAULT,
            REPORT_TEMPLATE_REMARK_LINE_TOPS[data.remarksLines.length - 1] + 1.35
          )
        : REPORT_TEMPLATE_FOOTER_TOP_DEFAULT;
      return `
        <div class="template-report-shell studio-report-${escapeHtml(layout.baseTemplateId || layout.templateId)}" id="${escapeHtml(previewId)}">
          <img class="template-report-base" src="${escapeHtml(layout.backgroundSource || REPORT_TEMPLATE_SRC)}" alt="Training report template">
          <div class="template-report-overlay" aria-hidden="${reportLayoutEditing ? "false" : "true"}">
            ${renderEditableOverlay("date", escapeHtml(data.session.date), layout.date, "white-space:nowrap;")}
            ${renderEditableOverlay("time", escapeHtml(data.session.time), layout.time, "white-space:nowrap;")}
            ${renderEditableOverlay("centre", escapeHtml(data.session.centre), layout.centre, "white-space:nowrap;")}
            ${renderEditableOverlay("coach", escapeHtml(data.session.coachName), layout.coach, "white-space:nowrap;")}

            ${renderEditablePhoto("student-photo", layout.layers.find(l=>l.id==="student-photo")?.source || data.studentPhoto, "STUDENT", layout.layers.find(layer => layer.id === "student-photo"), layout.photoFrames)}
            ${renderEditablePhoto("coach-photo", layout.layers.find(l=>l.id==="coach-photo")?.source || data.coachPhoto, "COACH", layout.layers.find(layer => layer.id === "coach-photo"), layout.photoFrames)}

            ${layout.baseTemplateId === "classic" ? REPORT_TEMPLATE_BULLET_MASKS.map(mask => `
              <div class="template-bullet-mask" style="left:${mask.left}%;top:${mask.top}%;"></div>
            `).join("") : ""}

            ${renderPlainBulletOverlays(data.bullets.whatTaught, [
              { left: 55.4, top: 44.9, width: 38.5, height: 4.4 },
              { left: 55.4, top: 47.48, width: 38.5, height: 4.4 }
            ], layout.whatTaught, "whatTaught")}
            ${renderPlainBulletOverlays(data.bullets.beforeCoaching, [
              { left: 11.8, top: 44.9, width: 35.2, height: 4.4 },
              { left: 11.8, top: 47.48, width: 35.2, height: 4.4 }
            ], layout.beforeCoaching, "beforeCoaching")}
            ${renderPlainBulletOverlays(data.bullets.afterTraining, [
              { left: 11.8, top: 52.8, width: 35.2, height: 4.4 },
              { left: 11.8, top: 55.35, width: 35.2, height: 4.4 }
            ], layout.afterTraining, "afterTraining")}
            ${renderPlainBulletOverlays(data.bullets.nextLesson, [
              { left: 55.4, top: 52.8, width: 38.5, height: 4.4 },
              { left: 55.4, top: 55.35, width: 38.5, height: 4.4 }
            ], layout.nextLesson, "nextLesson")}

            ${renderPlainBulletOverlays(data.remarksLines, REPORT_TEMPLATE_REMARK_TOPS.map(top => ({ left: 10.1, top, width: 86, height: 2.5 })), layout.remarks, "remarks")}

            ${renderEditableOverlay("contact", escapeHtml(data.centreContact), layout.contact)}
            ${renderEditableOverlay("address", escapeHtml(data.address).replace(/\n/g, "<br>"), layout.address)}
            ${renderCustomCertificateLayers(layout)}
          </div>
          ${renderEditableQr(layout.layers.find(layer => layer.id === "qr"), layout.qrUrl)}
        </div>
      `;
    }

    function getStudentById(studentId) {
      return state.students.find(student => student.id === studentId)
        || adminReportContext?.students?.find(student => student.id === studentId);
    }

    function getCoachById(coachId) {
      return state.coaches.find(coach => coach.id === coachId)
        || adminReportContext?.coaches?.find(coach => coach.id === coachId);
    }

    function getReportCentreId() {
      return state.auth.role === "admin" ? activeReportCentreId : state.auth.centreId;
    }

    function getReportCoaches() {
      if (isCertificatePreview) return [getCurrentCoach()];
      if (state.auth.role === "coach") return state.driveConnection?.status === "connected" ? [getCurrentCoach()].filter(coach => coach?.id) : [];
      const allCoaches = state.auth.role === "admin"
        ? adminReportContext?.coaches || []
        : state.coaches.filter(coach => coach.centreId === state.auth.centreId || coach.id === state.auth.userId);
      const connected = new Set(connectedCoachDriveIds);
      return allCoaches.filter(coach => connected.has(coach.id));
    }

    function getReportStudents() {
      return state.auth.role === "admin" ? adminReportContext?.students || [] : state.students;
    }

    async function selectAdminReportCentre(centreId) {
      invalidateReportReads();
      activeReportCentreId = adminReportCentres.some(centre => centre.id === centreId) ? centreId : "";
      adminReportContext = null;
      adminReportContextCentreId = "";
      connectedCoachDriveIds = [];
      state.reports = [];
      state.reportDrafts = {};
      reportStoreError = "";
      refreshReportsInBackground();
      render();
    }

    function handleReportCentreChange(centreId) {
      if (!centreId) {
        invalidateReportReads();
        activeReportCentreId = "";
        adminReportContext = null;
        adminReportContextCentreId = "";
        state.reports = [];
        state.reportDrafts = {};
        reportStoreStatus = "idle";
        reportLoadedAt = 0;
        reportStoreError = "";
        return render();
      }
      return selectAdminReportCentre(centreId);
    }

    function statusBadge(status) {
      const normalizedStatus = REPORT_STATUSES.includes(status) || status === "Draft" ? status : "Pending";
      const key = normalizedStatus === "Generated" ? "green" : normalizedStatus === "Draft" ? "grey" : "amber";
      const label = normalizedStatus === "Generated" ? "Sent" : normalizedStatus;
      return `<span class="badge ${key}"><span class="dot"></span>${label}</span>`;
    }

    function avatarMarkup(name, photo, size = "avatar") {
      const imageUrl = safeImageUrl(photo);
      const content = imageUrl
        ? ""
        : escapeHtml(initials(name));
      const style = imageUrl ? `style="background-image:url(&quot;${escapeHtml(imageUrl)}&quot;);"` : "";
      return `<span class="${size}" ${style}>${content}</span>`;
    }

    function safeImageUrl(value) {
      try {
        const url = new URL(String(value || ""));
        if (url.protocol !== "https:") return "";
        return url.href.replace(/[()'";\\\s]/g, character => encodeURIComponent(character));
      } catch {
        return "";
      }
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
      if (error) {
        isSigningIn = false;
        loginError = error.message || "Unable to sign in.";
        return render();
      }
      await applyAuthUser(data.user);
      if (requestedCentre && (!state.auth.centreId || state.auth.centreId !== requestedCentre.id)) {
        await supabase.auth.signOut();
        state.auth = { role: null, coachId: null, userId: null, centreId: null, email: "" };
        isSigningIn = false;
        loginError = authHomeCentre?.name
          ? `This account belongs to ${authHomeCentre.name}, not ${requestedCentre.name}. Use your centre's own link to sign in.`
          : `This account does not belong to ${requestedCentre.name}.`;
        return render();
      }
      const targetId = dashboardStateId();
      state = await loadState(targetId);
      await applyAuthUser(data.user);
      if (requestedCentre && state.auth.centreId !== requestedCentre.id) {
        await supabase.auth.signOut();
        state.auth = { role: null, coachId: null, userId: null, centreId: null, email: "" };
        isSigningIn = false;
        loginError = authHomeCentre?.name
          ? `This account belongs to ${authHomeCentre.name}, not ${requestedCentre.name}. Use your centre's own link to sign in.`
          : `This account does not belong to ${requestedCentre.name}.`;
        return render();
      }
      await Promise.all([
        refreshCoachesFromSupabase(),
        refreshStudentsFromSupabase(),
        refreshCoachAccountCount(),
        refreshPrivilegedState().catch(() => {}),
      ]);
      state.ui.page = "overview";
      state.ui.avatarMenuOpen = false;
      state.ui.reportViewId = null;
      isSigningIn = false;
      refreshReportsInBackground();
      render();
    }

    function renderEditableOverlay(id, content, layout, extra = "") {
      if (layout.visible === false) return "";
      const displayContent = layout.textOverride !== undefined ? escapeHtml(String(layout.textOverride)).replace(/\n/g, "<br>") : content;
      return `<div class="template-text report-overlay-item ${reportLayoutEditing ? "is-editing" : ""} ${reportLayoutEditing && selectedReportOverlay === id ? "is-selected" : ""} ${layout.locked === true ? "is-locked" : ""}" data-overlay-id="${id}" data-overlay-text="true" style="${overlayStyle(layout, extra)}">${displayContent}${reportLayoutEditing ? renderCertificateResizeHandles() : ""}</div>`;
    }

    function renderCustomCertificateLayers(layout) {
      const builtInLayerIds = new Set([
        ...Object.keys(DEFAULT_REPORT_LAYOUT),
        "student-photo",
        "coach-photo",
        "qr"
      ]);
      return (layout.layers || []).filter(layer => !builtInLayerIds.has(layer.id) && layer.id !== "footer-bar-art" && layer.visible !== false).map(layer => {
        const isEditableHeading = Object.prototype.hasOwnProperty.call(ARTWORK_EDITABLE_TEXT, layer.id);
        const slice = ARTWORK_SLICES[layer.id];
        if (slice && !isEditableHeading && layer.type !== "text") {
          // The old TTAM badge is no longer printed. The slot stays available
          // in the editor so a coach can drop in their own logo.
          const isEmptyBadge = layer.id === "certification-badge" && !layer.source;
          if (isEmptyBadge) return "";
          const left = Number(layer.left ?? slice.left) || 0;
          const top = Number(layer.top ?? slice.top) || 0;
          const width = Number(layer.width ?? slice.width) || slice.width;
          const height = Number(layer.height ?? slice.height) || slice.height;
          // The default TTAM badge is a high-resolution transparent logo. Use
          // a new cache key only for this layer so updated deployments do not
          // display the previous certification seal from browser cache.
          const assetVersion = layer.id === "certification-badge" ? 2 : 1;
          // The default logo slot shows the centre's own logo when it has one.
          const centreLogo = layer.id === "brand-logo-art" && !layer.source ? certificateCentreLogo() : "";
          const source = layer.source || centreLogo || `${REPORT_TEMPLATE_LAYER_ROOT}/${encodeURIComponent(layer.id)}.png?v=${assetVersion}`;
          const zIndex = Number(layer.zIndex) || 2;
          // Preserve the supplied TTAM logo proportions. The remaining
          // artwork slices continue to fill their pre-cut template geometry.
          const objectFit = layer.objectFit || (layer.id === "certification-badge" || layer.source || centreLogo ? "contain" : "fill");
          const imageTarget = reportLayoutEditing && layer.type === "image" && layer.id !== "qr" && layer.locked !== true
            ? `data-certificate-image-target tabindex="0" role="button" aria-label="Replace image in ${escapeHtml(layer.name || layer.id)}"`
            : "";
          const hasArtworkTextOverride = typeof layer.textOverride === "string";
          const artworkText = hasArtworkTextOverride ? layer.textOverride : "";
          const textStyle = ARTWORK_TEXT_STYLE[layer.id] || {};
          const displayFont = layer.fontFamily || textStyle.fontFamily || "Arial";
          const displaySize = Number(layer.fontSize) || textStyle.fontSize || 2;
          const displayWeight = Number(layer.fontWeight) || textStyle.fontWeight || 400;
          const displayStyle = layer.fontStyle || textStyle.fontStyle || "normal";
          return `<div class="template-art-slice report-overlay-item ${reportLayoutEditing ? "is-editing" : ""} ${reportLayoutEditing && selectedReportOverlay === layer.id ? "is-selected" : ""} ${layer.locked === true ? "is-locked" : ""}" data-overlay-id="${escapeHtml(layer.id)}" ${imageTarget} ${hasArtworkTextOverride ? 'data-overlay-text="true"' : ""} style="left:${left}%;top:${top}%;width:${width}%;height:${height}%;z-index:${zIndex};opacity:${layer.opacity ?? 1};font-family:${escapeHtml(displayFont)};font-size:${displaySize}cqw;color:${escapeHtml(layer.color || textStyle.color || "#111111")};font-weight:${displayWeight};font-style:${escapeHtml(displayStyle)};">${isEmptyBadge ? `<span class="template-empty-logo" aria-hidden="true">Your logo</span>` : `<img src="${escapeHtml(source)}" alt="" ${hasArtworkTextOverride ? "hidden" : ""} style="width:100%;height:100%;object-fit:${objectFit};object-position:center;">`}<span class="template-art-text" ${hasArtworkTextOverride ? "" : "hidden"}>${escapeHtml(artworkText)}</span>${reportLayoutEditing ? renderCertificateResizeHandles() : ""}</div>`;
        }
        const isFooterText = layer.id === "footer-text-overlay";
        const isCustomText = layer.type === "text" && !isFooterText;
        const fill = layer.type === "text" ? "transparent" : layer.fill || "transparent";
        const style = `left:${Number(layer.left) || 0}%;top:${Number(layer.top) || 0}%;width:${Number(layer.width) || 10}%;height:${Number(layer.height) || 8}%;z-index:${Number(layer.zIndex) || 2};opacity:${layer.opacity ?? 1};font-family:${escapeHtml(layer.fontFamily || "Arial")};font-size:${Number(layer.fontSize) || 2}cqw;color:${escapeHtml(layer.color || "#111111")};font-weight:${Number(layer.fontWeight) || 400};font-style:${escapeHtml(layer.fontStyle || "normal")};text-decoration:${escapeHtml(layer.textDecoration || "none")};background:${escapeHtml(fill)};`;
        const content = layer.type === "image" || layer.type === "photo"
          ? (layer.source ? `<img src="${escapeHtml(layer.source)}" alt="" style="width:100%;height:100%;object-fit:${escapeHtml(layer.objectFit || "cover")};object-position:${escapeHtml(layer.objectPosition || "center")};">` : "")
          : isFooterText
            ? (() => {
              const [title = "", ...subtitleParts] = String(footerTextForCentre(layer.text) || "").split(/\n+/);
              // Long centre names shrink to stay on one line inside the bar.
              const scale = Math.max(0.4, Math.min(1, 8.5 / Math.max(1, title.trim().length)));
              return `<span class="template-footer-title" style="font-size:${(3.5 * scale).toFixed(2)}cqw">${escapeHtml(title)}</span>${subtitleParts.length ? `<span class="template-footer-subtitle">${escapeHtml(subtitleParts.join(" "))}</span>` : ""}`;
            })()
          : escapeHtml(isEditableHeading ? headingTextForCentre(layer) : (layer.text || ""));
        const isSelected = reportLayoutEditing && selectedReportOverlay === layer.id;
        const objectTools = reportLayoutEditing && isSelected && isCustomText ? renderCertificateObjectTools(layer) : "";
        const innerContent = isCustomText ? `<span class="template-custom-layer-content">${content}</span>` : content;
        const imageTarget = reportLayoutEditing && layer.type === "image" && layer.locked !== true
          ? `data-certificate-image-target tabindex="0" role="button" aria-label="Replace image in ${escapeHtml(layer.name || layer.id)}"`
          : "";
        return `<div class="template-custom-layer ${isEditableHeading ? "template-heading" : ""} ${isFooterText ? "template-footer-text" : ""} ${isCustomText && isSelected && reportLayoutEditing ? "has-object-tools" : ""} report-overlay-item ${reportLayoutEditing ? "is-editing" : ""} ${isSelected ? "is-selected" : ""} ${layer.locked === true ? "is-locked" : ""}" data-overlay-id="${escapeHtml(layer.id)}" ${isEditableHeading ? 'data-editable-heading="true" title="Double-click to edit text"' : ""} ${imageTarget} ${layer.type === "text" ? 'data-overlay-text="true"' : ""} style="${style}">${innerContent}${objectTools}${reportLayoutEditing ? renderCertificateResizeHandles() : ""}</div>`;
      }).join("");
    }

    async function signInWithGoogle() {
      if (!supabase) {
        loginError = "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.";
        return render();
      }
      isSigningIn = true;
      loginError = "";
      render();
      const callbackPath = requestedCentre?.slug
        ? `/auth/callback?centre=${encodeURIComponent(requestedCentre.slug)}`
        : "/auth/callback";
      if (requestedCentre?.slug) sessionStorage.setItem("pendingCentreSlug", requestedCentre.slug);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}${callbackPath}` }
      });
      if (error) {
        isSigningIn = false;
        loginError = error.message || "Unable to sign in with Google.";
        render();
      }
    }

    async function submitCentreActivation() {
      const code = document.getElementById("centreActivationCode")?.value.trim().toUpperCase();
      if (!code || !requestedCentre?.id) return;
      isActivatingCentre = true;
      activationError = "";
      render();
      try {
        await invokePrivileged("dev-console", { action: "redeem-activation", centre_id: requestedCentre.id, code });
        requestedCentre = { ...requestedCentre, activated_at: new Date().toISOString() };
        isActivatingCentre = false;
        render();
      } catch (error) {
        isActivatingCentre = false;
        activationError = error.message || "Unable to activate this centre.";
        render();
      }
    }

    async function applyAuthUser(user) {
      const previousUserId = state.auth.userId;
      const previousCentreId = state.auth.centreId;
      if (!user) {
        if (wizardDraftId && state.reportDrafts[wizardDraftId] && hybridWorkspace) {
          updateWizardDraftFromInputs({ schedule: false });
          try { await flushDraftSave(state.reportDrafts[wizardDraftId]); } catch {}
        }
        invalidateReportReads();
        state.auth = { role: null, coachId: null, userId: null, centreId: null, email: "" };
        state.reports = [];
        state.reportDrafts = {};
        reportStoreStatus = "idle";
        reportLoadedAt = 0;
        reportStoreError = "";
        wizardDraftId = null;
        dirtyReportDraftId = "";
        activeReportCentreId = "";
        adminReportCentres = [];
        adminReportCentresLoaded = false;
        adminReportContext = null;
        adminReportContextCentreId = "";
        reportStartOpen = false;
        return;
      }
      const appRole = user.app_metadata?.role;
      const coachId = user.app_metadata?.coach_id;
      const metadataCentreId = user.app_metadata?.centre_id || null;
      const isGoogleUser = user.app_metadata?.provider === "google"
        || user.identities?.some(identity => identity.provider === "google");
      let centreId = supabase ? null : metadataCentreId;
      let centreMembership = null;
      authHomeCentre = null;
      if (supabase) {
        // An account can have several membership rows (older data). Read them
        // all instead of expecting exactly one, then prefer the centre being
        // opened, then the centre saved on the account, then any.
        const { data: memberships, error: membershipError } = await supabase
          .from("centre_memberships")
          .select("centre_id, role, centres(name, slug)")
          .eq("user_id", user.id);
        const list = Array.isArray(memberships) ? memberships : [];
        centreMembership = (requestedCentre && list.find(item => item.centre_id === requestedCentre.id))
          || (metadataCentreId && list.find(item => item.centre_id === metadataCentreId))
          || list[0]
          || null;
        if (centreMembership) centreId = centreMembership.centre_id;
        if (requestedCentre && centreMembership && centreMembership.centre_id !== requestedCentre.id) {
          authHomeCentre = { name: centreMembership.centres?.name || "", slug: centreMembership.centres?.slug || "" };
        }
        // Only a brand-new Google account (no centre, no staff role) joins the
        // centre whose link it opened, as a coach. Existing accounts are never
        // moved to another centre or given a different role.
        const canJoin = !membershipError && !list.length && requestedCentre && isGoogleUser
          && !["dev", "admin", "centre_admin"].includes(String(appRole || ""));
        if (canJoin) {
          try {
            const result = await invokePrivileged("dev-console", { action: "provision-google-member", centre_id: requestedCentre.id });
            centreMembership = result.membership || null;
            if (centreMembership) centreId = centreMembership.centre_id;
          } catch (error) {
            if (error?.code === "other_centre" && error.centre) authHomeCentre = error.centre;
            console.warn("Unable to provision Google centre membership", error);
          }
        }
      }
      let coach = state.coaches.find(item => item.id === coachId)
        || state.coaches.find(item => item.email?.toLowerCase() === user.email?.toLowerCase());
      if (!coach && supabase) {
        // OAuth account provisioning runs in a database trigger and can lag
        // behind the auth session by a few hundred milliseconds.
        // Centre admins don't need a coach row, so don't wait for one.
        const coachAttempts = centreMembership?.role === "centre_admin" || ["dev", "admin"].includes(String(appRole || "")) ? 1 : 10;
        for (let attempt = 0; attempt < coachAttempts && !coach; attempt += 1) {
          const { data } = await supabase.from("coaches").select("*").eq("id", user.id).maybeSingle();
          if (data) {
            coach = normalizeCoach(data);
            state.coaches = [coach, ...state.coaches.filter(item => item.id !== coach.id)];
          } else if (attempt < coachAttempts - 1) {
            await new Promise(resolve => window.setTimeout(resolve, 300));
          }
        }
      }
      if (!coach && centreId) {
        coach = normalizeCoach({
          id: user.id,
          name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Coach",
          email: user.email || "",
          branch: requestedCentre?.name || "Centre",
          branchAddress: requestedCentre?.name || "Centre"
        });
        state.coaches = [coach, ...state.coaches.filter(item => item.id !== coach.id)];
      }
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
      if (previousUserId && (previousUserId !== user.id || previousCentreId !== centreId)) {
        invalidateReportReads();
        state.reports = [];
        state.reportDrafts = {};
        reportStoreStatus = "idle";
        reportStoreError = "";
        wizardDraftId = null;
        dirtyReportDraftId = "";
        activeReportCentreId = "";
        adminReportCentres = [];
        adminReportCentresLoaded = false;
        adminReportContext = null;
        adminReportContextCentreId = "";
        reportStartOpen = false;
      }
      state.auth = {
        role: appRole === "dev" || appRole === "admin"
          ? appRole
          : centreMembership?.role === "centre_admin" ? "centre_admin" : centreId && coach ? "coach" : null,
        coachId: coach?.id || null,
        userId: user.id,
        centreId,
        email: user.email || ""
      };
      if (state.auth.role === "dev") {
        state.ui.page = "centre-settings";
      }
      if (!state.auth.role) {
        await supabase.auth.signOut();
        loginError = requestedCentre
          ? `This account isn't part of ${requestedCentre.name} yet. Ask your centre admin to add you.`
          : "This account isn't part of a centre yet. Sign in from your centre's link, or ask your centre admin to add you.";
      }
    }

    function bindAuthStateListener() {
      if (!supabase) return;
      supabase.auth.onAuthStateChange((event, session) => {
        window.setTimeout(async () => {
          // Bootstrap and password sign-in already restore this same session.
          if (authInitializing || isSigningIn) return;
          await applyAuthUser(session?.user || null);
          await Promise.all([
            refreshCoachesFromSupabase(),
            refreshStudentsFromSupabase(),
            refreshCoachAccountCount(),
          ]);
          if (event === "SIGNED_IN" && !authInitializing) {
            await refreshPrivilegedState().catch(() => {});
            refreshReportsInBackground();
          }
          if (!authInitializing) render();
        }, 0);
      });
    }

    async function logout() {
      // The setup reminder comes back on the next login.
      setupCardDismissed = false;
      try { sessionStorage.removeItem("setupCardDismissed"); } catch { /* storage may be blocked */ }
      if (wizardDraftId && state.reportDrafts[wizardDraftId] && reportLocalStore) {
        updateWizardDraftFromInputs({ schedule: false });
        try { await flushDraftSave(state.reportDrafts[wizardDraftId]); }
        catch { alert("Your latest edits could not be saved. Keep this tab open and retry before signing out."); return; }
      }
      invalidateReportReads();
      if (supabase) await supabase.auth.signOut();
      state.auth = { role: null, coachId: null, userId: null, centreId: null, email: "" };
      loginError = "";
      driveConnectionError = "";
      state.ui.page = "overview";
      state.ui.avatarMenuOpen = false;
      state.ui.reportViewId = null;
      state.reports = [];
      state.reportDrafts = {};
      activeReportCentreId = "";
      adminReportCentres = [];
      adminReportCentresLoaded = false;
      adminReportContext = null;
      adminReportContextCentreId = "";
      connectedCoachDriveIds = [];
      state.driveConnection = null;
      reportStartOpen = false;
      reportStoreStatus = "idle";
      reportLoadedAt = 0;
      reportStoreError = "";
      reportPdfError = "";
      dirtyReportDraftId = "";
      persist();
      wizardDraftId = null;
      scheduleRender();
    }

    function navigate(page) {
      if (page === "centre-settings" && !["admin", "coach", "centre_admin", "dev"].includes(state.auth.role)) {
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
      if (page === "reports" && reportRepository) {
        refreshReportsInBackground();
      }
    }

    function getVisibleCoaches() {
      return state.auth.role === "admin" || state.auth.role === "centre_admin"
        ? state.coaches
        : state.coaches.filter(coach => coach.id === getCurrentCoach().id);
    }

    function getVisibleStudents() {
      return state.auth.role === "admin" || state.auth.role === "centre_admin"
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
      const reportsLoading = reportStoreStatus === "loading" || reportUsingLocalCache;
      const draftCount = getVisibleDrafts().length;
      const totalReports = getVisibleReports().length;
      const stats = [
        { title: "Reports this month", value: reportsLoading ? "…" : reportsThisMonth, footnote: reportsLoading ? "Checking Google Drive totals…" : `Last month: ${reportsLastMonth}`, tone: reportsThisMonth >= reportsLastMonth ? "positive" : "" },
        { title: "Drafts to finish", value: draftCount, footnote: draftCount ? "Finish and send to parents" : "All caught up", tone: draftCount ? "warn" : "" },
        { title: "Active students", value: activeStudents, footnote: "" },
        { title: "Total reports", value: reportsLoading ? "…" : totalReports, footnote: "All time" }
      ];
      if (state.auth.role === "admin") {
        stats.push({ title: "Total Coaches", value: coachAccountCount, footnote: "" });
      }
      return stats;
    }

    function getVisibleDrafts() {
      return Object.values(state.reportDrafts || {})
        .filter(draft => state.auth.role !== "coach" || draft.coachId === state.auth.coachId);
    }

    // Students with no report in the last 14 days (or none at all), oldest first.
    function getStudentsNeedingReport(limit = 5) {
      const lastByStudent = {};
      getVisibleReports().forEach(report => {
        if (!lastByStudent[report.studentId] || report.date > lastByStudent[report.studentId]) lastByStudent[report.studentId] = report.date;
      });
      const cutoff = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
      return getVisibleStudents()
        .filter(student => student.status !== "Inactive")
        .map(student => ({ student, last: lastByStudent[student.id] || "" }))
        .filter(item => !item.last || item.last < cutoff)
        .sort((a, b) => (a.last || "").localeCompare(b.last || ""))
        .slice(0, limit);
    }

    function sortReportsDesc(reports) {
      return [...reports].sort((a, b) => {
        const aStamp = `${a.date}T${a.time}`;
        const bStamp = `${b.date}T${b.time}`;
        return bStamp.localeCompare(aStamp);
      });
    }

    function getVisibleReports() {
      const reports = state.auth.role === "admin" || state.auth.role === "centre_admin"
        ? state.reports
        : state.reports.filter(report => report.coachId === getCurrentCoach().id);
      return sortReportsDesc(reports);
    }

    // Light login screen: the centre's sport plays softly in the background
    // and the sign-in card floats in front with the centre's logo on top.
    function loginScreen(inner, extraClass = "") {
      const sport = requestedCentre?.sport || "";
      return `<section class="login-screen has-scene ${extraClass}"><div class="sport-scene" data-sport-scene="${escapeHtml(sport)}" aria-hidden="true"></div>${inner}</section>`;
    }

    function loginLogoBadge() {
      const logo = requestedCentre?.logo_url || "/Logo_with_Changes_made.png";
      const alt = requestedCentre ? `${requestedCentre.name} logo` : "JomNittaku logo";
      return `<div class="login-logo-badge"><img src="${escapeHtml(logo)}" alt="${escapeHtml(alt)}"></div>`;
    }

    let stopLoginScene = null;
    function mountLoginScene() {
      const host = document.querySelector("[data-sport-scene]");
      if (stopLoginScene) { stopLoginScene(); stopLoginScene = null; }
      if (host) stopLoginScene = mountSportScene(host, host.dataset.sportScene);
    }

    // The centre's logo (set by the dev account), or its initials.
    function sidebarBrandMark() {
      const logo = requestedCentre?.logo_url || "";
      if (logo) return `<span class="sidebar-brand-mark has-logo" aria-hidden="true"><img src="${escapeHtml(logo)}" alt=""></span>`;
      const name = requestedCentre?.name || "JomNittaku";
      return `<span class="sidebar-brand-mark" aria-hidden="true">${escapeHtml(initials(name))}</span>`;
    }

    function renderLogin() {
      const name = requestedCentre?.name || "JomNittaku";
      const sport = requestedCentre?.sport && !/^other$/i.test(requestedCentre.sport) ? requestedCentre.sport : "";
      return loginScreen(`
          <div class="login-panel login-card">
            ${loginLogoBadge()}
            <div class="login-card-head">
              <h1>${escapeHtml(name)}</h1>
              <p>${escapeHtml([sport, "Coach Training Reporting System"].filter(Boolean).join(" · "))}</p>
            </div>
            <form class="login-form">
              <button class="google-btn" type="button" data-action="sign-in-google" ${isSigningIn ? "disabled" : ""}>
                <span class="google-mark" aria-hidden="true">G</span>
                Continue with Google
              </button>
              <div class="login-divider"><span>or sign in with email</span></div>
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
            </form>
          </div>`);
    }

    // Shown when someone is signed in, but opened another centre's link.
    // Nothing about the account is changed.
    function renderWrongCentre() {
      const home = authHomeCentre?.slug ? authHomeCentre : null;
      const isStaff = ["dev", "admin"].includes(state.auth.role);
      const message = isStaff
        ? "You're signed in with a JomNittaku staff account. To use this centre's page, sign out and sign in with a centre account."
        : home
          ? `You're signed in with an account that belongs to ${home.name || "another centre"}. Each account can only use its own centre.`
          : "You're signed in with an account from another centre. Each account can only use its own centre.";
      const primary = isStaff
        ? `<a class="primary-btn" href="/">Go to dashboard</a>`
        : home ? `<a class="primary-btn" href="/centre/${encodeURIComponent(home.slug)}">Go to ${escapeHtml(home.name || "my centre")}</a>` : "";
      return loginScreen(`
          <div class="login-panel login-card wrong-centre-panel">
            ${loginLogoBadge()}
            <div class="brand-copy">
              <h1>${escapeHtml(requestedCentre?.name || "Centre")}</h1>
              <p class="muted">${escapeHtml(message)}</p>
              ${state.auth.email ? `<p class="muted">Signed in as <strong>${escapeHtml(state.auth.email)}</strong></p>` : ""}
            </div>
            <div class="wrong-centre-actions">
              ${primary}
              <button type="button" class="secondary-btn" data-action="logout">Sign out</button>
            </div>
          </div>`);
    }

    function renderCentreActivationGate() {
      const logo = requestedCentre?.logo_url || "/Logo_with_Changes_made.png";
      return `<section class="login-screen"><div class="login-panel"><div class="brand-lockup"><div class="brand-logo-crop"><img class="brand-logo" src="${escapeHtml(logo)}" alt="${escapeHtml(requestedCentre?.name || "Centre")} logo"></div><p class="brand-system-title">Centre activation required</p><div class="brand-copy"><h1>${escapeHtml(requestedCentre?.name || "Centre")}</h1><p class="muted">Enter the activation code provided by your administrator to unlock this centre.</p></div></div><form class="login-form" data-centre-activation-form><div class="field"><label for="centreActivationCode">Activation code</label><input id="centreActivationCode" class="text-input" autocomplete="one-time-code" autocapitalize="characters" required></div>${activationError ? `<p class="form-error" role="alert">${escapeHtml(activationError)}</p>` : ""}<button class="primary-btn" type="submit" ${isActivatingCentre ? "disabled" : ""}>${isActivatingCentre ? "Activating..." : "Activate centre"}</button><button class="ghost-btn" type="button" data-action="centre-activation-logout">Sign out</button></form></div></section>`;
    }

    function renderCentreActivationOverlay() {
      const logo = requestedCentre?.logo_url || "/Logo_with_Changes_made.png";
      return `<div class="centre-lock-overlay"><div class="centre-lock-modal" role="dialog" aria-modal="true" aria-labelledby="centre-lock-title"><div class="brand-logo-crop centre-lock-logo"><img class="brand-logo" src="${escapeHtml(logo)}" alt="${escapeHtml(requestedCentre?.name || "Centre")} logo"></div><p class="brand-system-title">Centre activation required</p><h2 id="centre-lock-title">Unlock ${escapeHtml(requestedCentre?.name || "your centre")}</h2><p class="muted">You are signed in. Enter the activation key provided by your administrator to unlock the dashboard.</p><form class="login-form" data-centre-activation-form><div class="field"><label for="centreActivationCode">Activation key</label><input id="centreActivationCode" class="text-input" autocomplete="one-time-code" autocapitalize="characters" required></div>${activationError ? `<p class="form-error" role="alert">${escapeHtml(activationError)}</p>` : ""}<button class="primary-btn" type="submit" ${isActivatingCentre ? "disabled" : ""}>${isActivatingCentre ? "Activating..." : "Unlock dashboard"}</button><button class="ghost-btn" type="button" data-action="centre-activation-logout">Sign out</button></form></div></div>`;
    }

    function renderEditablePhoto(id, photo, label, layer, frames = null) {
      if (layer?.visible === false) return "";
      const geometry = layer || DEFAULT_LAYER_GEOMETRY[id];
      const style = `left:${geometry.left}%;top:${geometry.top}%;width:${geometry.width}%;height:${geometry.height}%;`;
      return `<div class="template-editable-photo report-overlay-item ${reportLayoutEditing ? "is-editing" : ""} ${reportLayoutEditing && selectedReportOverlay === id ? "is-selected" : ""} ${geometry.locked === true ? "is-locked" : ""}" data-overlay-id="${id}" style="${style}">${renderTemplatePhoto(photo, label, frames)}${reportLayoutEditing ? renderCertificateResizeHandles() : ""}</div>`;
    }

    function renderEditableQr(layer, qrUrl) {
      if (layer?.visible === false) return "";
      const geometry = layer || DEFAULT_LAYER_GEOMETRY.qr;
      return `<div class="template-report-qr-pocket report-overlay-item ${reportLayoutEditing ? "is-editing" : ""} ${reportLayoutEditing && selectedReportOverlay === "qr" ? "is-selected" : ""} ${geometry.locked === true ? "is-locked" : ""}" data-overlay-id="qr" style="left:${geometry.left}%;top:${geometry.top}%;width:${geometry.width}%;height:${geometry.height}%;right:auto;bottom:auto;z-index:${geometry.zIndex || 50};opacity:${geometry.opacity ?? 1};"><img class="template-report-qr" data-qr-centre data-qr-url="${escapeHtml(qrUrl || "https://jom-nittaku-webapp.vercel.app/centre")}" src="" alt="Scan to open the report QR link">${reportLayoutEditing ? renderCertificateResizeHandles() : ""}</div>`;
    }

    function renderSidebar() {
      const role = state.auth.role;
      const items = role === "dev"
        ? [["centre-settings", "⚙", "Licensing Console"]]
        : role === "admin"
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
                <span>Coach reporting</span>
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

    function syncReportStatusChips() {
      const value = document.getElementById("reportsStatusFilter")?.value || "";
      document.querySelectorAll("[data-report-status]").forEach(chip => {
        const active = chip.dataset.reportStatus === value;
        chip.classList.toggle("is-active", active);
        chip.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }

    function plural(count, word) {
      return `${count} ${word}${count === 1 ? "" : "s"}`;
    }

    function sidebarNavIcon(page) {
      const paths = {
        overview: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
        reports: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h3"/>',
        students: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.3 0 4 1.5 4.5 4"/>',
        coaches: '<circle cx="12" cy="7" r="3.5"/><path d="M5 21c.8-4 3.5-6.5 7-6.5s6.2 2.5 7 6.5"/><path d="M9 14.8l3 3 3-3"/>',
        "certificate-design": '<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>',
        "centre-settings": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
        "centre-coaches": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4h5M16 8h5M17 12h4"/>'
      };
      return `<svg class="sidebar-nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[page] || paths.overview}</svg>`;
    }

    function renderTopbar() {
      const profile = getUserProfile();
      return `
        <div class="topbar">
          <div class="topbar-actions">
            ${state.auth.role && state.auth.role !== "dev" ? `<button class="primary-btn topbar-new-report" data-action="new-report" aria-label="New report"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg><span>New report</span></button>` : ""}
            <button class="avatar-btn" data-action="toggle-avatar-menu" ${profile.photo ? `style="background-image:url('${profile.photo}');"` : ""}>
              ${profile.photo ? "" : initials(profile.name)}
            </button>
            <div class="avatar-dropdown ${state.ui.avatarMenuOpen ? "" : "hidden"}">
              ${state.auth.role === "dev" ? "" : `<button class="dropdown-item" data-action="open-profile">Profile</button>`}
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
              <div class="stat-footnote ${stat.tone || ""}">${escapeHtml(String(stat.footnote || ""))}</div>
            </article>
          `).join("")}
        </section>
      `;
    }

    function renderOverviewPage() {
      const reportMonths = [...new Set(getVisibleReports().map(report => report.date.slice(0, 7)))].sort().reverse();
      const visibleReports = getVisibleReports().filter(report => withinOverviewDateFilter(report.date)).slice(0, 5);
      return `
        <section class="page ${state.ui.page === "overview" ? "active" : ""}">
          ${renderSetupReminders()}
          ${renderStats()}
          ${reportStoreStatus === "loading" ? '<p class="report-drive-notice" role="status">Loading reports from Google Drive. You can use the dashboard while they load.</p>' : reportStoreError ? `<p class="report-drive-notice is-error" role="alert">${escapeHtml(reportStoreError)} <button class="plain-link" data-nav="reports">Open reports</button></p>` : ""}
          <div class="overview-columns">
          <div class="table-card">
            <div class="table-topline">
              <div class="section-title">
                <h2>Recent reports</h2>
              </div>
              <div class="overview-card-tools">
            <div class="overview-filter-bar" aria-label="Filter overview reports">
              <select id="overviewDateFilter" class="filter-select" aria-label="Overview date filter">
                <option value="" ${overviewDateFilter === "" ? "selected" : ""}>All dates</option>
                <option value="month" ${overviewDateFilter === "month" ? "selected" : ""}>By month</option>
                <option value="week" ${overviewDateFilter === "week" ? "selected" : ""}>By week</option>
                <option value="custom" ${overviewDateFilter === "custom" ? "selected" : ""}>Custom range</option>
              </select>
              <select id="overviewMonthFilter" class="filter-select ${overviewDateFilter === "month" || overviewDateFilter === "week" ? "" : "hidden"}" aria-label="Overview month">
                <option value="">All months</option>
                ${reportMonths.map(month => `<option value="${month}" ${overviewMonthFilter === month ? "selected" : ""}>${escapeHtml(new Date(`${month}-01T00:00:00`).toLocaleDateString("en-MY", { month: "long", year: "numeric" }))}</option>`).join("")}
              </select>
              <select id="overviewWeekFilter" class="filter-select ${overviewDateFilter === "week" ? "" : "hidden"}" aria-label="Overview week">
                <option value="week1" ${overviewWeekFilter === "week1" ? "selected" : ""}>1st - 7th</option>
                <option value="week2" ${overviewWeekFilter === "week2" ? "selected" : ""}>8th - 14th</option>
                <option value="week3" ${overviewWeekFilter === "week3" ? "selected" : ""}>15th - 21st</option>
                <option value="week4" ${overviewWeekFilter === "week4" ? "selected" : ""}>22nd - end of month</option>
              </select>
              <div id="overviewCustomDates" class="overview-custom-dates ${overviewDateFilter === "custom" ? "" : "hidden"}">
                <input id="overviewDateFrom" class="text-input" type="date" value="${escapeHtml(overviewDateFrom)}" aria-label="Overview start date">
                <input id="overviewDateTo" class="text-input" type="date" value="${escapeHtml(overviewDateTo)}" aria-label="Overview end date">
              </div>
            </div>
              <button class="plain-link table-title-link" data-nav="reports">View all <span aria-hidden="true">→</span></button>
              </div>
            </div>
            <div class="table-wrap">
              <table class="compact-rows">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Lesson</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${visibleReports.length ? visibleReports.map(report => {
                    const student = getStudentById(report.studentId);
                    return `
                      <tr>
                        <td class="cell-student"><div class="person-cell">${avatarMarkup(student?.name || "Student", student?.photo)}<span class="person-cell-copy"><strong>${escapeHtml(student?.name || "Student")}</strong><small class="row-sub">Lesson ${escapeHtml(report.lessonNumber)} · ${escapeHtml(formatShortDate(report.date))}, ${formatTime(report.time)}</small></span></div></td>
                        <td class="cell-lesson">Lesson ${escapeHtml(report.lessonNumber)}</td>
                        <td class="cell-date">${escapeHtml(formatShortDate(report.date))}, ${formatTime(report.time)}</td>
                        <td class="cell-status">${statusBadge(report.status)}</td>
                        <td class="cell-action"><button class="icon-btn" data-action="view-report" data-report-id="${report.id}" aria-label="View report"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button></td>
                      </tr>
                    `;
                  }).join("") : `<tr><td colspan="5" class="muted overview-empty">No reports yet. Tap Generate Report to make your first one.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
          ${renderNeedsAttention()}
          </div>
        </section>
      `;
    }

    function renderNeedsAttention() {
      if (state.auth.role === "dev") return "";
      const items = getStudentsNeedingReport();
      return `
        <aside class="table-card needs-attention">
          <div class="section-title"><h2>Needs attention</h2><p>Students due for a report.</p></div>
          ${items.length ? items.map(({ student, last }) => `
            <div class="needs-attention-row">
              ${avatarMarkup(student.name, student.photo)}
              <span class="needs-attention-copy"><strong>${escapeHtml(student.name)}</strong><small>${last ? `Last report ${escapeHtml(formatShortDate(last))}` : "No report yet"}</small></span>
              <button class="secondary-btn" data-action="new-report">Report</button>
            </div>`).join("") : `<p class="needs-attention-empty">All caught up. Every student has a recent report.</p>`}
        </aside>
      `;
    }

    function withinOverviewDateFilter(date) {
      if (!overviewDateFilter) return true;
      if (overviewDateFilter === "month") return !overviewMonthFilter || date.startsWith(overviewMonthFilter);
      if (overviewDateFilter === "custom") return (!overviewDateFrom || date >= overviewDateFrom) && (!overviewDateTo || date <= overviewDateTo);
      if (overviewDateFilter === "week") {
        if (overviewMonthFilter && !date.startsWith(overviewMonthFilter)) return false;
        return withinDateBucket(date, overviewWeekFilter);
      }
      return true;
    }

    function renderReportsPage() {
      const reportMonths = [...new Set([
        ...state.reports.map(report => report.date),
        ...Object.values(state.reportDrafts).map(draft => draft.date)
      ].filter(date => /^\d{4}-\d{2}/.test(date || "")).map(date => date.slice(0, 7)))].sort().reverse();
      const studentOptions = getReportStudents()
        .filter(student => state.auth.role !== "coach" || student.coachId === getCurrentCoach().id)
        .map(student => `<option value="${escapeHtml(student.id)}">${escapeHtml(student.name)}</option>`).join("");
      const reportNotice = state.auth.role === "admin" && reportStoreError
        ? `<p class="report-drive-notice is-error" role="alert">${escapeHtml(reportStoreError)}</p>`
        : state.auth.role === "admin" && adminReportCentresLoaded && !adminReportCentres.length
        ? '<p class="report-drive-notice">No centres have coaches with connected Google Drive accounts.</p>'
        : state.auth.role === "admin" && !activeReportCentreId
          ? '<p class="report-drive-notice">Select a centre with connected coach accounts to view or generate reports.</p>'
        : state.auth.role === "centre_admin" && reportStoreStatus === "ready" && !connectedCoachDriveIds.length
        ? '<p class="report-drive-notice">No coaches have connected Google Drive yet. Each coach can connect from their own settings.</p>'
        : reportStoreStatus === "loading"
        ? '<p class="report-drive-notice" role="status">Loading reports from Google Drive…</p>'
        : reportStoreError
          ? `<p class="report-drive-notice is-error" role="alert">${escapeHtml(reportStoreError)}${state.auth.role === "coach" ? ' <button class="secondary-btn" data-action="connect-drive">Connect my Google Drive</button>' : ""}</p>`
          : "";
      return `
        <section class="page ${state.ui.page === "reports" ? "active" : ""}">
          ${state.auth.role === "admin" ? `<div class="reports-filter-bar"><label class="field"><span>Centre</span><select class="filter-select" id="adminReportCentre" aria-label="Report centre"><option value="">Select a connected centre</option>${adminReportCentres.map(centre => `<option value="${escapeHtml(centre.id)}" ${activeReportCentreId === centre.id ? "selected" : ""}>${escapeHtml(centre.name)}</option>`).join("")}</select></label></div>` : ""}
          ${reportNotice}
          <div class="table-card">
            <div class="table-topline">
              <div class="section-title">
                <h2>Reports</h2>
              </div>
              <div class="profile-actions">${state.auth.role && state.auth.role !== "dev" ? `<button class="primary-btn" data-action="new-report" ${state.auth.role === "admin" && !activeReportCentreId ? "disabled" : ""}>Generate Report</button>` : ""}</div>
            </div>
            <div class="reports-filter-bar">
              <label class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M20 20l-3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><input id="reportsSearch" class="search-input" type="search" placeholder="Search name or ref number" aria-label="Search reports"></label>
              <div class="status-chips" role="group" aria-label="Filter by status">
                <button type="button" class="status-chip is-active" data-report-status="" aria-pressed="true">All</button>
                <button type="button" class="status-chip" data-report-status="Draft" aria-pressed="false">Drafts</button>
                <button type="button" class="status-chip" data-report-status="Generated" aria-pressed="false">Sent</button>
              </div>
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
              <select id="reportsStatusFilter" class="filter-select status-filter-select" aria-label="Report status" tabindex="-1">
                <option value="">All statuses</option>
                <option value="Generated">Sent</option>
                <option value="Draft">Drafts</option>
              </select>
            </div>
            <div class="table-wrap" style="margin-top:18px;">
              <table id="reportsTable" class="compact-rows">
                <thead>
                  <tr>
                    <th>Ref #</th>
                    <th>Student</th>
                    ${state.auth.role === "coach" ? "" : "<th>Coach</th>"}
                    <th>Lesson</th>
                    <th>Date</th>
                    <th>Status</th>
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
                <p>${getVisibleCoaches().filter(coach => coach.status !== "Inactive").length} active coaches · ${coachAccountCount} total accounts</p>
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
              <input id="studentSearch" class="search-input" type="search" placeholder="Search student" aria-label="Search students">
              ${filter}
            </div>
            <div class="table-wrap" style="margin-top:18px;">
              <table id="studentsTable" class="students-card-table">
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
        return `<section class="page ${state.ui.page === "report-view" ? "active" : ""}"><div class="report-view-wrap"><p class="report-drive-notice" role="status">${reportStoreStatus === "loading" ? "Loading report from Google Drive…" : "This report is not available in the coach's connected Google Drive."}</p><button class="ghost-btn" data-action="close-report-view">Back to reports</button></div></section>`;
      }
      const student = getStudentById(report.studentId);
      const coach = getCoachById(report.coachId);
      if (report.certificateDesign) reportLayoutEditing = false;
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
                  ${reportPdfError ? `<p class="report-drive-notice is-error" role="alert">${escapeHtml(reportPdfError)}</p><button class="secondary-btn" data-action="retry-report-pdf">Retry Drive PDF save</button>` : ""}
                  ${state.auth.role === "coach" && !report.certificateDesign ? `<button class="secondary-btn" data-action="toggle-report-layout">${reportLayoutEditing ? "Done Editing" : "Edit Layout"}</button>` : ""}
                  <button class="primary-btn" data-action="download-report-pdf">Download PDF</button>
                  <button class="secondary-btn" data-action="download-report-png">Export PNG</button>
                  <button class="secondary-btn whatsapp-share-btn" data-action="share-report-whatsapp" aria-label="Share report to WhatsApp">Share to WhatsApp</button>
                </div>
              </div>
              ${reportLayoutEditing ? renderReportLayoutToolbar(coach) : ""}
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
                      <small>${escapeHtml(certificateCentreName() || "Coach Training Reports")}</small>
                      <h2>${escapeHtml(certificateCentreSport() ? `${certificateCentreSport().toUpperCase()} TRAINING` : "TRAINING REPORT")}</h2>
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
                  <div class="footer-badge"></div>
                  <div class="footer-center">
                    <strong>${coach.centreContact}</strong><br>
                    ${escapeHtml(certificateCentreName() || "Training Report")}
                  </div>
                    <div>
                    </div>
                  </div>
                </div>
                <div class="report-bottom-bar">${escapeHtml((certificateCentreName() || "JomNittaku").toUpperCase())}</div>
              </div>
            </div>
          </div>
        </section>
      `;
    }

    function getCertificateDesignPreviewReport(coach) {
      const existing = state.reports.find(report => report.coachId === coach.id);
      if (existing) return existing;
      const student = state.students.find(item => item.coachId === coach.id);
      const today = new Date();
      return {
        id: "certificate-design-preview",
        ref: "PREVIEW",
        coachId: coach.id,
        studentId: student?.id || "",
        lessonNumber: 1,
        date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
        time: "10:00",
        summary: { whatTaught: "Forehand drive", beforeCoaching: "Developing", afterTraining: "More consistent contact", nextLesson: "Backhand control", remarks: "Keep building consistency." }
      };
    }

    function renderCertificateDesignPage() {
      const coach=getCurrentCoach();
      reportLayoutEditing=studioView==="editor";
      if (studioView==="editor") return renderCertificateEditor({
        renderStrip:()=>renderCertificateToolStrip(),
        renderPanel:()=>renderCertificateToolPanel(coach),
        renderToolbar:()=>renderReportLayoutToolbar(coach),
        renderCanvas:()=>renderReportTemplate(getCertificateDesignPreviewReport(coach), getReportLayout(coach))
      });
      return renderStudio({layout:getReportLayout(coach),view:"templates",filter:studioFilter,preview:false,zoom:studioZoom,tool:certificateEditorTool,isDemo:isCertificatePreview,escape:escapeHtml,renderMini:renderStudioMini});
    }

    function renderCertificateToolStrip() {
      return renderCertificateEditorTools(certificateEditorTool);
    }

    function renderCertificateToolPanel(coach) {
      if (certificateEditorTool === "templates") {
        const layout=getReportLayout(coach);
        return `<div class="certificate-tool-panel"><strong>Templates</strong><div class="certificate-template-list">${[...REPORT_TEMPLATES,...layout.designs].map(t=>`<button class="certificate-template-choice ${layout.templateId===t.id?'is-selected':''}" data-studio-template="${escapeHtml(t.id)}"><span class="certificate-template-thumbnail">${renderStudioMini(t.id)}</span><span>${escapeHtml(t.name)}</span></button>`).join('')}</div><button class="certificate-panel-action certificate-template-upload" data-action="studio-upload-background">Upload design</button></div>`;
      }
      if (certificateEditorTool === "frames") return `<div class="certificate-tool-panel studio-frames-panel">${renderPhotoFramesPanel(getReportLayout(coach), true)}</div>`;
      if (certificateEditorTool === "qr") {
        const layout=getReportLayout(coach);
        const qrHidden = layout.layers.find(l=>l.id==='qr')?.visible===false;
        return `<div class="certificate-tool-panel"><strong>Add QR</strong><button class="certificate-panel-action ${qrHidden?'is-primary':''}" data-action="studio-toggle-qr">${qrHidden?'Add QR':'Hide QR'}</button></div>`;
      }

      if (certificateEditorTool === "elements") return `<div class="certificate-tool-panel"><strong>Elements</strong><button type="button" class="certificate-panel-action" data-action="add-certificate-shape"><span aria-hidden="true">□</span>Add shape</button></div>`;
      if (certificateEditorTool === "text") return `<div class="certificate-tool-panel"><strong>Text</strong><button type="button" class="certificate-panel-action" data-action="add-certificate-text"><span aria-hidden="true">T</span>Add Text Box</button></div>`;
      if (certificateEditorTool === "uploads") {
        const uploads = getReportLayout(coach).uploads || [];
        return `<div class="certificate-tool-panel"><strong>Uploads</strong><button class="certificate-panel-action" data-action="studio-upload-picture">Upload image</button>${uploads.length ? `<div class="certificate-upload-list" aria-label="Uploaded images">${uploads.map(asset => `<button type="button" class="certificate-upload-asset ${selectedCertificateUploadId === asset.id ? "is-selected" : ""}" draggable="true" data-certificate-asset-id="${escapeHtml(asset.id)}" aria-pressed="${selectedCertificateUploadId === asset.id}" aria-label="Select or drag ${escapeHtml(asset.name)} to an image frame"><img src="${escapeHtml(asset.source)}" alt=""><span title="${escapeHtml(asset.name)}">${escapeHtml(asset.name)}</span></button>`).join("")}</div>` : `<p class="certificate-upload-empty">No uploads</p>`}</div>`;
      }
      if (certificateEditorTool === "position") return `<div class="certificate-tool-panel"><strong>Position</strong><button type="button" class="certificate-panel-action" data-action="raise-certificate-layer">Bring forward</button><button type="button" class="certificate-panel-action" data-action="lower-certificate-layer">Send backward</button><button type="button" class="certificate-panel-action" data-action="toggle-certificate-lock">Lock or unlock</button></div>`;
      return renderCertificateLayerPanel(coach);
    }

    function renderCertificateLayerPanel(coach) {
      const reportLayout = getReportLayout(coach);
      const layers = reportLayout.layers || [];
      return `<div class="certificate-layer-panel" aria-label="Certificate layers">
        <strong>Layers</strong>
        <div class="certificate-layer-list">${layers.map(layer => `<button type="button" class="certificate-layer-row ${reportLayoutEditing && selectedReportOverlay === layer.id ? "is-selected" : ""}" data-layer-select="${escapeHtml(layer.id)}"><span>${escapeHtml(layer.name || layer.id)}</span><small>${(reportLayout[layer.id] || layer).locked === true ? "Locked" : escapeHtml(layer.type || "layer")}</small></button>`).join("")}</div>
      </div>`;
    }

    function renderCertificateObjectTools(layer) {
      if(state.ui.page==="certificate-design"&&studioView==="editor")return "";
      const locked = layer.locked === true;
      return `<span class="certificate-object-toolbar" role="group" aria-label="Text box actions"><button type="button" class="certificate-object-action" data-action="toggle-certificate-lock" title="${locked ? "Unlock" : "Lock"}" aria-label="${locked ? "Unlock" : "Lock"}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></button><button type="button" class="certificate-object-action" data-action="duplicate-certificate-layer" title="Duplicate" aria-label="Duplicate"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg></button><button type="button" class="certificate-object-action is-danger" data-action="delete-certificate-layer" title="Delete text box" aria-label="Delete text box"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v7m6-7v7"/></svg></button></span>`;
    }

    function renderCertificateResizeHandles() {
      return `<span class="certificate-resize-handle is-resize-edge-left" data-resize-edge="left" aria-hidden="true"></span><span class="certificate-resize-handle is-resize-edge-right" data-resize-edge="right" aria-hidden="true"></span><span class="certificate-resize-handle is-resize-corner" data-resize-edge="corner" aria-hidden="true"></span>`;
    }

    function addCertificateUpload(layout, source, name = "Uploaded image") {
      if (!validStudioImageSource(source)) throw new Error("The uploaded image URL is invalid.");
      const existing = (layout.uploads || []).find(asset => asset.source === source);
      if (existing) return existing;
      const asset = {
        id: `upload-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
        name: String(name || "Uploaded image").slice(0, 120),
        source
      };
      layout.uploads = [...(layout.uploads || []), asset].slice(-40);
      return asset;
    }

    async function uploadCertificateImageToLibrary(file) {
      const coach = getCurrentCoach();
      if (!coach) return;
      const source = await uploadProfileImage(file, "certificate", coach.id);
      const layout = getReportLayout(coach);
      addCertificateUpload(layout, source, file.name);
      coach.reportLayout = layout;
      await saveReportLayout(coach);
    }

    function applyCertificateUpload(assetId, layerId) {
      const coach = getCurrentCoach();
      if (!coach || layerId === "qr") return;
      const layout = getReportLayout(coach);
      const asset = layout.uploads.find(item => item.id === assetId);
      const layer = layout.layers.find(item => item.id === layerId);
      if (!asset || layer?.locked === true || !(layer?.type === "image" || layer?.type === "photo" || ARTWORK_SLICES[layerId])) return;
      layer.source = asset.source;
      layer.objectFit = "contain";
      layer.objectPosition = "center";
      layer.textOverride = "";
      selectedCertificateUploadId = "";
      selectedReportOverlay = layerId;
      coach.reportLayout = layout;
      return saveReportLayout(coach);
    }

    function editCertificateHeading(id) {
      if (!Object.prototype.hasOwnProperty.call(ARTWORK_EDITABLE_TEXT, id)) return;
      const item = [...document.querySelectorAll("[data-overlay-id]")].find(element => element.dataset.overlayId === id);
      if (item) beginCertificateTextEditing(item);
    }

    function restoreCertificateHeading(id) {
      const coach = getCurrentCoach();
      if (!coach || !Object.prototype.hasOwnProperty.call(ARTWORK_EDITABLE_TEXT, id)) return;
      const layout = getReportLayout(coach);
      const layer = layout.layers.find(entry => entry.id === id);
      if (!layer) return;
      if (layer.locked === true) return;
      layer.text = ARTWORK_EDITABLE_TEXT[id];
      delete layer.textOverride;
      coach.reportLayout = layout;
      saveReportLayout(coach);
    }

    function beginCertificateTextEditing(item) {
      const coach = getCurrentCoach();
      if (!coach || item.dataset.overlayId === "qr" || item.contentEditable === "true" || item.querySelector('[contenteditable="true"]')) return;
      const fullLayout = getReportLayout(coach);
      const layer = fullLayout.layers.find(entry => entry.id === item.dataset.overlayId);
      const layout = fullLayout[item.dataset.overlayId] || layer;
      if (!layout || layout.locked === true) return;
      if (layer && layer.type !== "text" && !layer.type.includes("text") && layer.type !== "image") return;
      selectedReportOverlay = item.dataset.overlayId;
      syncCertificateTextToolbar(layout, layer);
      let editor = item.querySelector(".template-custom-layer-content") || item;
      if (layer?.type === "image") {
        editor = item.querySelector(".template-art-text") || document.createElement("span");
        editor.className = "template-art-text";
        if (!editor.isConnected) item.append(editor);
        editor.hidden = false;
        if (!editor.textContent.trim() && !Object.prototype.hasOwnProperty.call(layer, "textOverride")) {
          editor.textContent = ARTWORK_EDITABLE_TEXT[item.dataset.overlayId] || "";
        }
        item.classList.add("is-art-text-editing");
      }
      editor.contentEditable = "true";
      editor.setAttribute("contenteditable", "true");
      const artworkStyle = ARTWORK_TEXT_STYLE[item.dataset.overlayId];
      if (artworkStyle && editor.classList.contains("template-art-text")) {
        editor.style.fontFamily = layer?.fontFamily || artworkStyle.fontFamily;
        editor.style.fontWeight = layer?.fontWeight || artworkStyle.fontWeight;
        editor.style.fontStyle = layer?.fontStyle || artworkStyle.fontStyle;
      }
      editor.classList.add("is-text-editing");
      editor.setAttribute("role", "textbox");
      editor.setAttribute("aria-label", `Edit ${layout.name || layer?.name || item.dataset.overlayId} text`);
      editor.focus({ preventScroll: true });
      const selectionIsInsideEditor = () => {
        const selection = window.getSelection();
        return Boolean(selection?.rangeCount && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode));
      };
      const selectEditorContents = () => {
        if (!editor.isConnected || editor.contentEditable !== "true") return;
        editor.focus({ preventScroll: true });
        const range = document.createRange();
        range.selectNodeContents(editor);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      };
      const finish = () => {
        const keepDom=activeCertificateEditor?.editor===editor&&activeCertificateEditor.keepDomOnBlur===true;
        if (activeCertificateEditor?.editor === editor) activeCertificateEditor = null;
        if (!item.isConnected) return;
        const value = item.classList.contains("template-bullet-group")
          ? [...item.querySelectorAll(".template-bullet span")].map(span => span.textContent.trim()).filter(Boolean).join("\n").slice(0, 500)
          : (editor.innerText || editor.textContent).trim().slice(0, 500);
        if (layer?.type === "text") {
          layer.text = value;
        } else {
          layout.textOverride = value;
        }
        editor.contentEditable = "false";
        editor.setAttribute("contenteditable", "false");
        editor.classList.remove("is-text-editing", "is-art-text-ghost");
        item.classList.remove("is-art-text-editing");
        editor.removeEventListener("keydown", onKeydown);
        editor.removeEventListener("input", onInput);
        coach.reportLayout = fullLayout;
        saveReportLayout(coach,{render:!keepDom});
      };
      const onKeydown = event => handleCertificateEditorKeydown(event);
      const onBeforeInput = event => {
        if (event.inputType !== "deleteContentBackward" && event.inputType !== "deleteContentForward") return;
        const handled = deleteCertificateTextAtCaret(editor, event.inputType === "deleteContentBackward" ? -1 : 1);
        if (handled) {
          event.preventDefault();
          event.stopPropagation();
          // Manual deletion bypasses the browser's normal input event.
          // Notify the editor so edits are visible and saved immediately.
          editor.dispatchEvent(new Event("input", { bubbles: true }));
        }
      };
      const onInput = () => {
        const value = (editor.innerText || editor.textContent).trim().slice(0, 500);
        if (layer?.type === "text") layer.text = value;
        else layout.textOverride = value;
        coach.reportLayout = fullLayout;
        fitCustomCertificateHeadingText();
      };
      activeCertificateEditor = { editor, item, finish };
      editor.addEventListener("keydown", onKeydown);
      editor.addEventListener("beforeinput", onBeforeInput);
      editor.addEventListener("input", onInput);
      editor.addEventListener("blur", () => {
        if (activeCertificateEditor?.editor === editor) finish();
      }, { once: true });
      editor.addEventListener("blur", () => {
        editor.removeEventListener("beforeinput", onBeforeInput);
      }, { once: true });
      // Select the current label so ordinary typing replaces it. Users can
      // still place the caret or select a smaller range after editing begins.
      if (!selectionIsInsideEditor()) selectEditorContents();
      requestAnimationFrame(() => {
        if (!selectionIsInsideEditor()) selectEditorContents();
      });
    }

    function syncCertificateTextToolbar(layout, layer) {
      const style = ARTWORK_TEXT_STYLE[selectedReportOverlay] || {};
      const nameInput = document.querySelector("[data-layout-name]");
      const fontSelect = document.querySelector("[data-layout-font]");
      const sizeInput = document.querySelector("[data-layout-size]");
      const colorInput = document.querySelector("[data-layout-color]");
      if (nameInput) nameInput.value = layout.name || layer?.name || selectedReportOverlay;
      if (fontSelect) fontSelect.value = layout.fontFamily || style.fontFamily || "Arial";
      if (sizeInput) sizeInput.value = layout.fontSize ?? style.fontSize ?? 2;
      if (colorInput) colorInput.value = layout.color || style.color || "#111111";
      document.querySelector('[data-text-format="bold"]')?.classList.toggle("is-active", Number(layout.fontWeight ?? style.fontWeight) >= 600);
      document.querySelector('[data-text-format="italic"]')?.classList.toggle("is-active", (layout.fontStyle || style.fontStyle) === "italic");
      document.querySelector('[data-text-format="underline"]')?.classList.toggle("is-active", (layout.textDecoration || style.textDecoration) === "underline");
    }

    function handleCertificateEditorKeydown(event) {
      const active = activeCertificateEditor;
      if (!active?.editor?.isConnected || active.editor.contentEditable !== "true") return;
      if (event.currentTarget !== active.editor) return;
      if (event.key === "Backspace" || event.key === "Delete") {
        const handled = deleteCertificateTextAtCaret(active.editor, event.key === "Backspace" ? -1 : 1);
        if (handled) {
          event.preventDefault();
          event.stopPropagation();
          active.editor.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        active.editor.blur();
      } else if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        active.editor.blur();
      }
    }

    function deleteCertificateTextAtCaret(editor, direction) {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return false;
      const activeRange = selection.getRangeAt(0);
      if (!editor.contains(activeRange.startContainer) || !editor.contains(activeRange.endContainer)) return false;

      if (!activeRange.collapsed) {
        activeRange.deleteContents();
        activeRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(activeRange);
        return true;
      }

      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      if (!textNodes.length) return false;

      // Selection endpoints can be text nodes or the editable element itself.
      // Convert either shape to a flat text offset before choosing the previous
      // code point, including when markup splits the text into several nodes.
      const beforeCaret = document.createRange();
      beforeCaret.selectNodeContents(editor);
      beforeCaret.setEnd(activeRange.startContainer, activeRange.startOffset);
      const caretOffset = beforeCaret.toString().length;
      const textLength = textNodes.reduce((total, node) => total + node.textContent.length, 0);
      const rawStart = direction < 0 ? caretOffset - 1 : caretOffset;
      if (rawStart < 0 || rawStart >= textLength) return false;
      let deleteStart = rawStart;
      let deleteEnd = rawStart + 1;
      const flatText = textNodes.map(node => node.textContent).join("");
      if (direction < 0 && /[\uDC00-\uDFFF]/.test(flatText[deleteStart]) && deleteStart > 0 && /[\uD800-\uDBFF]/.test(flatText[deleteStart - 1])) {
        deleteStart -= 1;
      } else if (direction > 0 && /[\uD800-\uDBFF]/.test(flatText[deleteStart]) && deleteEnd < textLength && /[\uDC00-\uDFFF]/.test(flatText[deleteEnd])) {
        deleteEnd += 1;
      }
      const locate = (offset, preferNext = false) => {
        let remaining = offset;
        for (const node of textNodes) {
          if (remaining < node.textContent.length || (!preferNext && remaining === node.textContent.length)) {
            return { node, offset: remaining };
          }
          remaining -= node.textContent.length;
        }
        const last = textNodes[textNodes.length - 1];
        return { node: last, offset: last.textContent.length };
      };
      const start = locate(deleteStart, direction > 0);
      const end = locate(deleteEnd);
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      range.deleteContents();
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }

    function renderReportWizard() {
      const draft = wizardDraftId ? state.reportDrafts[wizardDraftId] : null;
      if (!draft) {
        if (!reportStartOpen) return `<div id="wizardModal" class="modal-backdrop"></div>`;
        const coaches = getReportCoaches();
        return `
          <div id="wizardModal" class="modal-backdrop open">
            <div class="modal-card">
              <div class="wizard-close-row"><button class="ghost-btn" type="button" aria-label="Close report wizard" data-action="save-close-wizard">Ã—</button></div>
              <div class="section-title"><h2>Generate Report</h2><p>Select the coach responsible for this lesson.</p></div>
              <div class="field"><label for="reportStartCoach">Coach</label><select id="reportStartCoach" class="filter-select"><option value="">Select a coach</option>${coaches.map(coach => `<option value="${escapeHtml(coach.id)}">${escapeHtml(coach.name)}</option>`).join("")}</select></div>
              ${coaches.length ? "" : '<p class="report-drive-notice is-error" role="alert">No eligible coaches are available in this workspace.</p>'}
              <div class="wizard-footer"><span></span><button class="primary-btn" data-action="confirm-report-start" ${coaches.length ? "" : "disabled"}>Continue</button></div>
            </div>
          </div>
        `;
      }

      const coach = getCoachById(draft.coachId);
      const coachStudents = getReportStudents().filter(student => student.coachId === coach.id);
      const selectedStudent = getStudentById(draft.studentId || "");
      const step = draft.step || 1;
      const coachStudentOptions = coachStudents.map(student => `
        <button class="student-pick ${draft.studentId === student.id ? "active" : ""}" data-action="pick-student" data-student-id="${escapeHtml(student.id)}">
          <div class="person-cell">
            ${avatarMarkup(student.name, student.photo)}
            <div>
              <strong>${escapeHtml(student.name)}</strong>
              <div class="muted">Lesson count: ${escapeHtml(student.lessons)}</div>
            </div>
          </div>
          <strong>${draft.studentId === student.id ? "Selected" : "Choose"}</strong>
        </button>
      `).join("");

      return `
        <div id="wizardModal" class="modal-backdrop open">
          <div class="modal-card">
            <div class="wizard-close-row"><button class="ghost-btn" type="button" aria-label="Close report wizard" data-action="save-close-wizard">×</button></div>
            <p id="reportSaveStatus" class="report-drive-notice ${reportStoreError ? "is-error" : ""}" role="status" aria-live="polite">${escapeHtml(reportStoreError || reportSaveMessage())}</p>
            ${renderHybridNotice()}
            <div class="wizard-steps">
              ${[
                ["Step 1", "Select Student"],
                ["Step 2", "Session Details"],
                ["Step 3", "Training Summary"],
                ["Step 4", "Coach Remarks"]
              ].map((item, index) => {
                const stepNumber = index + 1;
                const klass = stepNumber < step ? "done" : stepNumber === step ? "active" : "";
                const canNavigate = stepNumber <= step;
                return `<button class="wizard-step ${klass} ${canNavigate ? "is-clickable" : ""}" type="button" data-action="wizard-go-step" data-step="${stepNumber}" ${canNavigate ? "" : "disabled"}>${item[0]}<strong>${item[1]}</strong></button>`;
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
                  ${renderTimePicker(draft.time)}
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
                  <label for="wizardBeforeCoaching">Before Coaching – Skill Level</label>
                  <textarea id="wizardBeforeCoaching" class="text-area" placeholder="One bullet point per line">${draft.summary.beforeCoaching || ""}</textarea>
                </div>
                <div class="field">
                  <label for="wizardWhatTaught">What Was Taught Today</label>
                  <textarea id="wizardWhatTaught" class="text-area" placeholder="One bullet point per line">${draft.summary.whatTaught || ""}</textarea>
                </div>
                <div class="field">
                  <label for="wizardAfterTraining">After Training – Areas of Improvement</label>
                  <textarea id="wizardAfterTraining" class="text-area" placeholder="One bullet point per line">${draft.summary.afterTraining || ""}</textarea>
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
              ${step === 4 ? renderDraftTemplatePicker(draft) : ""}
            </div>

            <div class="wizard-footer">
              <div>
                ${step > 1 ? `<button class="secondary-btn" data-action="wizard-back">Back</button>` : ""}
              </div>
              <div style="display:flex;gap:12px;">
                ${step > 1 ? `<button class="secondary-btn" data-action="wizard-save-draft">Save</button>` : ""}
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

    function renderCentreOnboardingModal() {
      if (!centreOnboardingModal) return "";
      const values = centreOnboardingModal.values;
      const result = centreOnboardingModal.result;
      const step = centreOnboardingModal.step;
      const stepTitle = step === 1 ? "Choose sport" : step === 2 ? "Centre details" : "Centre created";
      return `
        <div class="onboarding-backdrop open">
          <div class="onboarding-modal centre-onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="centre-onboarding-title">
            <div class="onboarding-head">
              <div class="section-title"><h2 id="centre-onboarding-title">${stepTitle}</h2><p>${step === 1 ? "Start by selecting the sport for this centre." : step === 2 ? "Add the centre name to create its login entry." : "Save these access details for the centre administrator."}</p></div>
              ${step === 3 ? "" : `<button class="close-btn" data-action="close-centre-onboarding" aria-label="Close modal">×</button>`}
            </div>
            <div class="step-dots" aria-label="Centre setup progress"><span class="step-dot ${step === 1 ? "active" : ""}"></span><span class="step-dot ${step === 2 ? "active" : ""}"></span><span class="step-dot ${step === 3 ? "active" : ""}"></span></div>
            ${step === 1 ? `
              <div class="onboarding-grid"><div class="field"><label for="centre-onboarding-sport">Sport</label><select id="centre-onboarding-sport" class="text-input"><option value="">Select sport</option>${LOGIN_SPORTS.map(sport => `<option ${values.sport === sport ? "selected" : ""}>${sport}</option>`).join("")}</select></div></div>
              <div class="onboarding-actions end"><button class="primary-btn" data-action="centre-onboarding-continue">Continue →</button></div>
            ` : step === 2 ? `
              <div class="onboarding-grid"><div class="field"><label for="centre-onboarding-name">Centre name</label><input id="centre-onboarding-name" class="text-input" autocomplete="organization" value="${escapeHtml(values.name)}" required></div><div class="field"><label for="centre-onboarding-logo">Centre logo <span class="muted">(optional)</span></label><input id="centre-onboarding-logo" class="text-input" type="file" accept="image/*"><small class="muted">PNG or JPG, up to 5 MB.</small>${values.logoPreview ? `<img class="dev-centre-logo-preview onboarding-logo-preview" src="${escapeHtml(values.logoPreview)}" alt="Selected centre logo preview">` : ""}</div></div>
              <div class="onboarding-actions"><button class="ghost-btn" data-action="centre-onboarding-back">← Back</button><button class="primary-btn" data-action="centre-onboarding-submit">Create centre</button></div>
            ` : `
              <div class="review-card centre-onboarding-result">
                <div class="review-row"><strong>Centre</strong><span>${escapeHtml(result?.centre?.name || values.name)}</span></div>
                <div class="review-row"><strong>Sport</strong><span>${escapeHtml(result?.centre?.sport || values.sport)}</span></div>
                <div class="review-row"><strong>Centre login link</strong><a href="${escapeHtml(result?.login_url || "#")}" target="_blank" rel="noreferrer">${escapeHtml(result?.login_url || "")}</a></div>
                <div class="review-row"><strong>1-year licence key</strong><code>${escapeHtml(result?.activation_key || "")}</code></div>
              </div>
              <div class="onboarding-actions end"><button class="primary-btn" data-action="close-centre-onboarding">Done</button></div>
            `}
          </div>
        </div>
      `;
    }

    function renderDashboard() {
      const navItems = state.auth.role === "dev"
        ? [["centre-settings", "Centres"], ["centre-coaches", "Centre coaches"]]
        : state.auth.role === "admin"
        ? [
            ["overview", "Overview"],
            ["reports", "Reports"],
            ["coaches", "Coaches"],
            ["students", "Students"]
          ]
        : [
            ["overview", "Overview"],
            ["reports", "Reports"],
            ["students", "Students"],
            ["certificate-design", "Certificates"]
          ];
      navItems.push(["centre-settings", state.auth.role === "dev" ? "Licensing Console" : state.auth.role === "centre_admin" ? "Centre & Drive" : "Settings"]);
      // Resolve the active page explicitly. The dev coach view is a separate
      // console surface and must never fall through to the dashboard overview.
      let pageContent;
      if (state.auth.role === "dev" && state.ui.page === "centre-coaches") {
        pageContent = renderDevCentreCoachesPage();
      } else if (state.ui.page === "reports") {
        pageContent = renderReportsPage();
      } else if (state.ui.page === "coaches") {
        pageContent = state.auth.role === "admin" ? renderCoachesPage() : renderOverviewPage();
      } else if (state.ui.page === "students") {
        pageContent = renderStudentsPage();
      } else if (state.ui.page === "centre-settings") {
        pageContent = renderCentreSettingsPage();
      } else if (state.ui.page === "settings") {
        pageContent = renderAdminProfilePage();
      } else if (state.ui.page === "profile") {
        pageContent = renderCoachProfilePage();
      } else if (state.ui.page === "report-view") {
        pageContent = renderReportViewPage();
      } else if (state.ui.page === "certificate-design") {
        pageContent = renderCertificateDesignPage();
      } else {
        pageContent = renderOverviewPage();
      }
      const centreName = requestedCentre?.name || "JomNittaku";
      const activeNav = navItems.find(([page]) => page === state.ui.page);
      const firstName = String((state.auth.role === "dev" ? "" : getUserProfile().name) || "").trim().split(/\s+/)[0] || "Coach";
      const hour = new Date().getHours();
      const pageTitle = state.ui.page === "overview" ? `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ${firstName}`
        : state.ui.page === "report-view" ? "Report"
        : state.ui.page === "profile" || state.ui.page === "settings" ? "Profile"
        : activeNav ? activeNav[1] : "Overview";
      const pageSubtitle = state.ui.page === "overview" ? new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
        : state.ui.page === "reports" ? `${plural(getVisibleReports().length, "report")} · ${plural(getVisibleDrafts().length, "draft")}`
        : state.ui.page === "students" ? `${plural(getVisibleStudents().filter(student => student.status !== "Inactive").length, "active student")}`
        : state.ui.page === "certificate-design" ? "Pick how your reports look to parents."
        : state.ui.page === "centre-settings" && state.auth.role === "coach" ? "Storage, links and your setup guide."
        : `${centreName} Coach Reporting System`;
      const sidebarProfile = state.auth.role === "dev" ? { name: "Developer", photo: "" } : getUserProfile();
      const sidebarPhoto = safeImageUrl(sidebarProfile.photo);
      return `
        <div class="dashboard">
          <aside class="sidebar">
            <div class="sidebar-brand">
              ${sidebarBrandMark()}
              <span class="sidebar-brand-copy"><strong>${escapeHtml(centreName)}</strong><small>${escapeHtml(sidebarProfile.name || "Coach Training Reports")}</small></span>
            </div>
            <nav class="sidebar-nav" aria-label="Dashboard sections">
              ${navItems.map(([page, label]) => `<button class="sidebar-nav-item ${state.ui.page === page ? "active" : ""}" data-nav="${page}">${sidebarNavIcon(page)}<span class="sidebar-nav-label">${label}</span><span class="sidebar-nav-short" aria-hidden="true">${{ "certificate-design": "Certificates", "centre-settings": "Settings", "centre-coaches": "Coaches" }[page] || label}</span></button>`).join("")}
            </nav>
            <div class="sidebar-account">
              <div class="avatar-dropdown sidebar-account-menu ${state.ui.avatarMenuOpen ? "" : "hidden"}">
                ${state.auth.role === "dev" ? "" : `<button class="dropdown-item" data-action="open-profile">Profile</button>`}
                <button class="dropdown-item" data-action="logout">Logout</button>
              </div>
              <button class="sidebar-profile" type="button" data-action="toggle-avatar-menu" aria-label="Account menu">
                <span class="sidebar-profile-avatar" ${sidebarPhoto ? `style="background-image:url('${escapeHtml(sidebarPhoto)}');"` : ""}>${sidebarPhoto ? "" : escapeHtml(initials(sidebarProfile.name || "Coach"))}</span>
                <span class="sidebar-profile-copy"><strong>${escapeHtml(sidebarProfile.name || "Coach")}</strong><small>${escapeHtml(centreName)}</small></span>
              </button>
            </div>
          </aside>
          <main class="main">
            <header class="page-header">
              <div class="header-copy">
                <span class="mobile-brand" aria-hidden="true">${sidebarBrandMark()}${escapeHtml(centreName)}</span>
                <h1>${escapeHtml(pageTitle)} ${state.ui.page === "overview" ? centreSportEmojiMarkup(requestedCentre?.sport) : ""}</h1>
                <p>${escapeHtml(pageSubtitle)}</p>
              </div>
              ${renderTopbar()}
            </header>
            ${renderHybridNotice()}
            ${pageContent}
          </main>
        </div>
        ${renderReportWizard()}
        ${renderOnboardingModal()}
        ${state.auth.role === "dev" ? renderCentreOnboardingModal() : ""}
        ${state.auth.role === "dev" ? renderDevCentreDetailModal() : ""}
        ${renderStudentEditModal()}
        <input id="hiddenStudentUpload" type="file" accept="image/*" class="hidden">
        <input id="hiddenProfileUpload" type="file" accept="image/*" class="hidden">
        <input id="hiddenCertificateUpload" type="file" accept="image/*" class="hidden">
        <input id="hiddenCentreLogoUpload" type="file" accept="image/*" class="hidden">
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
      if (state.auth.role === "dev") return renderDevConsolePage();
      const isCoach = state.auth.role === "coach";
      const links = isCoach ? (getCurrentCoach().links || []) : (state.centreProfile.links || []);
      const drive = state.driveConnection || {};
      return `
        <section class="page ${state.ui.page === "centre-settings" ? "active" : ""}">
          ${isCoach ? renderSetupGuideSettingsCard() : ""}
          ${isCoach ? `<div class="profile-card centre-settings-card drive-connection-card ${drive.status === "connected" ? "is-connected" : ""}" style="margin-bottom:16px;">
            <div class="drive-card-head">
              <span class="drive-card-logo"><svg class="drive-logo" viewBox="0 0 48 40" aria-hidden="true" focusable="false"><path fill="#0F9D58" d="M16 2h12l16 28H32z"/><path fill="#4285F4" d="M8 30h24l-6 10H2z"/><path fill="#F4B400" d="M16 2 2 30h12L28 2z"/></svg></span>
              <div class="drive-card-title"><div class="drive-heading"><h2>My Google Drive</h2>${drive.status === "connected" ? `<span class="status-pill status-active">Connected</span>` : `<span class="status-pill drive-pill-off">Not connected</span>`}</div><p>Your report drafts and PDFs are saved to your own Google Drive.</p></div>
            </div>
            ${driveConnectionError || drive.last_error ? `<p class="report-drive-notice is-error" role="alert">${escapeHtml(driveConnectionError || drive.last_error)}</p>` : ""}
            ${drive.status === "connected" ? `<div class="drive-info-grid">
                <div class="drive-info-tile"><span class="drive-info-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg></span><span class="drive-info-copy"><small>Google account</small><strong>${escapeHtml(drive.google_account_email || "Connected")}</strong></span></div>
                <div class="drive-info-tile"><span class="drive-info-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></span><span class="drive-info-copy"><small>Report folder</small><a href="${escapeHtml(drive.root_folder_url || "#")}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(drive.root_folder_name || "Open my Drive folder")}">${escapeHtml(drive.root_folder_name || "Open my Drive folder")} ↗</a></span></div>
                <div class="drive-info-tile"><span class="drive-info-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span><span class="drive-info-copy"><small>Last saved</small><strong>${drive.last_successful_sync_at ? escapeHtml(new Date(drive.last_successful_sync_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })) : "Not yet"}</strong></span></div>
              </div>
              <div class="profile-actions"><button class="secondary-btn" data-action="connect-drive">Reconnect Drive</button><button class="ghost-btn drive-disconnect-btn" data-action="disconnect-drive">Disconnect</button></div>` : `<p class="muted">Connect your own Google Drive to create and save reports without a centre admin connecting first.</p><button class="primary-btn drive-connect-btn" data-action="connect-drive"><svg class="drive-logo" viewBox="0 0 48 40" aria-hidden="true" focusable="false"><path fill="#0F9D58" d="M16 2h12l16 28H32z"/><path fill="#4285F4" d="M8 30h24l-6 10H2z"/><path fill="#F4B400" d="M16 2 2 30h12L28 2z"/></svg><span>Connect My Google Drive</span></button>`}
          </div>` : state.auth.role === "centre_admin" ? `<div class="profile-card centre-settings-card drive-connection-card" style="margin-bottom:16px;"><div class="section-title"><h2>Coach Google Drives</h2><p>Coaches authorize their own accounts. You do not need to connect a Drive for the centre.</p></div><p class="muted">${connectedCoachDriveIds.length} coach account(s) connected.</p></div>` : ""}
          <div class="profile-card centre-settings-card">
            <div class="links-card-head">
              <div class="section-title"><h2>${isCoach ? "Add links for your QR" : "Centre Links"}</h2>${isCoach ? `<p>When parents scan the QR on a report, they see a page with these links.</p>` : ""}</div>
              ${isCoach ? `<button class="secondary-btn qr-preview-btn" type="button" data-action="preview-qr-page"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>How QR looks like</button>` : ""}
            </div>
            ${isCoach ? `<div class="links-field-labels" aria-hidden="true"><span>Platform</span><span>Link</span></div>` : ""}
            <div class="centre-links-editor">
              ${links.map(link => `
                <div class="centre-link-row" data-link-id="${escapeHtml(link.id)}">
                  ${isCoach ? (() => {
                    const current = String(link.label || link.title || "").trim();
                    const options = LINK_PLATFORM_CHOICES.includes(current) || !current ? LINK_PLATFORM_CHOICES : [current, ...LINK_PLATFORM_CHOICES];
                    return `<select class="filter-select centre-link-label" data-link-field="label" aria-label="Platform"><option value="" ${current ? "" : "selected"} disabled>Choose platform</option>${options.map(name => `<option value="${escapeHtml(name)}" ${name === current ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select>`;
                  })() : `<input class="text-input centre-link-label" data-link-field="label" value="${escapeHtml(link.label || link.title || "")}" placeholder="Label">`}
                  <input class="text-input centre-link-url" data-link-field="url" type="url" value="${escapeHtml(link.url)}" placeholder="https://..." aria-label="Link">
                  <button class="ghost-btn link-delete-btn" data-action="delete-centre-link" data-link-id="${escapeHtml(link.id)}" aria-label="Delete link" title="Delete link"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v7m6-7v7"/></svg></button>
                </div>
              `).join("")}
            </div>
            <div class="profile-actions">
              <button class="secondary-btn" data-action="add-centre-link">+ Add link</button>
              <button class="primary-btn" type="button" data-action="save-centre-profile">Save</button>
            </div>
          </div>
        </section>
      `;
    }

    function renderDevConsolePage() {
      const centres = Array.isArray(state.devCentres) ? state.devCentres : [];
      const activeCentres = centres.filter(centre => centre.status === "active").length;
      const suspendedCentres = centres.filter(centre => centre.status === "suspended").length;
      return `<section class="page ${state.ui.page === "centre-settings" ? "active" : ""}">
        <section class="stats-grid dev-centre-stats" aria-label="Centre summary">
          <article class="stat-card"><h3>Total centres</h3><div class="value">${centres.length}</div></article>
          <article class="stat-card"><h3>Active centres</h3><div class="value">${activeCentres}</div></article>
          <article class="stat-card"><h3>Suspended centres</h3><div class="value">${suspendedCentres}</div></article>
        </section>
        <div class="profile-card centre-settings-card dev-licensing-console">
          <div class="section-title"><h2>Dev licensing console</h2></div>
          <div class="profile-actions"><button class="primary-btn" data-action="open-centre-onboarding">Create centre</button></div>
          <div class="table-wrap" style="margin-top:20px;"><table class="dev-centres-table"><thead><tr><th>Centre</th><th>Sport</th><th>Logo test</th><th>Centre link</th><th>Status</th><th>Licence expiry</th><th>Activation code</th><th>Actions</th></tr></thead><tbody>
            ${centres.length ? centres.map(centre => {
              const licence = getLatestCentreLicence(centre);
              const key = getLatestActivationKey(centre);
              const loginUrl = centre.login_url || `${window.location.origin}/centre/${encodeURIComponent(centre.slug || "")}`;
              const sport = centre.sport || "Not set";
              const status = String(centre.status || "").toLowerCase() === "active" ? "Active" : "Inactive";
              return `<tr><td data-label="Centre"><strong>${escapeHtml(centre.name)}</strong></td><td data-label="Sport">${centreSportMarkup(sport)}</td><td data-label="Logo test">${centre.logo_url ? `<a class="dev-centre-logo-test" href="${escapeHtml(loginUrl)}" target="_blank" rel="noreferrer" aria-label="Test ${escapeHtml(centre.name)} login logo"><img src="${escapeHtml(centre.logo_url)}" alt="${escapeHtml(centre.name)} logo"></a>` : `<span class="muted">No logo</span>`}</td><td data-label="Centre link"><a href="${escapeHtml(loginUrl)}" target="_blank" rel="noreferrer">Open login link</a></td><td data-label="Status"><span class="status-pill ${status === "Active" ? "status-active" : "status-inactive"}">${status}</span></td><td data-label="Licence expiry">${licence?.expires_at ? escapeHtml(new Date(licence.expires_at).toLocaleDateString()) : "No licence"}</td><td data-label="Activation code"><code>${escapeHtml(key?.key_value || "Unavailable")}</code></td><td class="dev-centre-actions" data-label="Actions"><button class="secondary-btn" data-action="view-centre-details" data-centre-id="${centre.id}">View details</button><button class="secondary-btn" data-action="upload-centre-logo" data-centre-id="${centre.id}">Upload logo</button><button class="secondary-btn" data-action="renew-centre" data-centre-id="${centre.id}">Renew 1 year</button><button class="icon-btn" data-action="delete-centre" data-centre-id="${centre.id}" title="Delete centre" aria-label="Delete ${escapeHtml(centre.name)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="dev-centre-delete-label">Delete</span></button></td></tr>`;
            }).join("") : `<tr><td colspan="8" class="muted">No centres yet.</td></tr>`}
          </tbody></table></div>
        </div>
      </section>`;
    }

    function centreSportMarkup(sport, options = {}) {
      const label = String(sport || "Not set");
      const key = label.toLowerCase().replace(/\s+/g, " ").trim();
      const emoji = key.includes("badminton") ? "🏸"
        : key.includes("football") || key.includes("futsal") ? "⚽"
        : key.includes("table tennis") ? "🏓"
        : key.includes("pickleball") ? "🏓"
        : key.includes("tennis") || key.includes("squash") ? "🎾"
        : key.includes("basketball") || key.includes("netball") ? "🏀"
        : key.includes("volleyball") || key.includes("takraw") ? "🏐"
        : key.includes("hockey") ? "🏑"
        : key.includes("swim") ? "🏊"
        : "🏅";
      const emojiMarkup = options.emoji === false ? "" : `<span class="centre-sport-emoji" aria-hidden="true">${emoji}</span>`;
      return `<span class="centre-sport">${emojiMarkup}<span>${escapeHtml(label)}</span></span>`;
    }

    function centreSportEmojiMarkup(sport) {
      const key = String(sport || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const emoji = key.includes("badminton") ? "🏸"
        : key.includes("football") || key.includes("soccer") || key.includes("futsal") ? "⚽"
        : key.includes("sepak takraw") || key.includes("takraw") || key.includes("volleyball") ? "🏐"
        : key.includes("table tennis") || key.includes("ping pong") ? "🏓"
        : key.includes("pickleball") || key.includes("tennis") ? "🎾"
        : key.includes("basketball") ? "🏀"
        : key.includes("rugby") ? "🏉"
        : key.includes("cricket") ? "🏏"
        : key.includes("hockey") ? "🏑"
        : key.includes("golf") ? "⛳"
        : key.includes("bowling") ? "🎳"
        : key.includes("swim") ? "🏊"
        : key.includes("cycling") || key.includes("bike") ? "🚴"
        : key.includes("run") || key.includes("athletic") || key.includes("track") ? "🏃"
        : key.includes("archery") ? "🏹"
        : key.includes("boxing") ? "🥊"
        : key.includes("martial") || key.includes("karate") || key.includes("taekwondo") || key.includes("silat") ? "🥋"
        : key.includes("gym") || key.includes("fitness") ? "🏋️"
        : "🏅";
      return `<span class="dashboard-sport-emoji" aria-label="${escapeHtml(sport || "Sport")}">${emoji}</span>`;
    }

    function getLatestCentreLicence(centre) {
      return (centre?.centre_licences || []).slice().sort((a, b) => String(b.expires_at || "").localeCompare(String(a.expires_at || "")))[0] || null;
    }

    function getLatestActivationKey(centre) {
      return (centre?.activation_keys || []).slice().sort((a, b) => String(b.generated_at || "").localeCompare(String(a.generated_at || "")))[0] || null;
    }

    function getActivationKeyStatus(key) {
      if (!key) return "No key";
      if (key.revoked_at) return "Revoked";
      if (key.redeemed_at) return "Activated";
      if (key.expires_at && new Date(key.expires_at).getTime() <= Date.now()) return "Expired";
      return "Not activated";
    }

    function activationKeyStatusClass(key) {
      const status = getActivationKeyStatus(key);
      return status === "Activated" ? "status-active" : status === "Not activated" ? "status-pending" : "status-muted";
    }

    function renderDevCentreDetailModal() {
      if (!devCentreDetailModal) return "";
      const centre = (state.devCentres || []).find(item => item.id === devCentreDetailModal.centreId);
      if (!centre) return "";
      const licence = getLatestCentreLicence(centre);
      const key = getLatestActivationKey(centre);
      const loginUrl = centre.login_url || `${window.location.origin}/centre/${encodeURIComponent(centre.slug || "")}`;
      const members = centre.centre_memberships || [];
      return `<div class="onboarding-backdrop open"><div class="onboarding-modal dev-centre-detail-modal" role="dialog" aria-modal="true" aria-labelledby="dev-centre-detail-title">
        <div class="onboarding-head"><div class="section-title"><h2 id="dev-centre-detail-title">${escapeHtml(centre.name)} details</h2><p>Review centre access, licensing, and activation state.</p></div><button class="close-btn" data-action="close-centre-details" aria-label="Close details">X</button></div>
        <div class="review-card dev-centre-detail-grid">
          <div class="review-row"><strong>Sport</strong><span class="dev-sport-edit"><select id="dev-centre-sport" class="text-input" aria-label="Centre sport">${LOGIN_SPORTS.map(option => `<option ${String(centre.sport || "").toLowerCase() === option.toLowerCase() ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}${centre.sport && !LOGIN_SPORTS.some(option => option.toLowerCase() === String(centre.sport).toLowerCase()) ? `<option selected>${escapeHtml(centre.sport)}</option>` : ""}</select><button class="secondary-btn" data-action="update-centre-sport" data-centre-id="${centre.id}">Save sport</button></span></div>
          <div class="review-row"><strong>Centre logo</strong><span>${centre.logo_url ? "Configured" : "Not configured"}</span></div>
          ${centre.logo_url ? `<div class="review-row"><strong>Logo preview</strong><img class="dev-centre-logo-preview" src="${escapeHtml(centre.logo_url)}" alt="${escapeHtml(centre.name)} logo preview"></div>` : ""}
          <div class="review-row"><strong>Centre link</strong><a href="${escapeHtml(loginUrl)}" target="_blank" rel="noreferrer">${escapeHtml(loginUrl)}</a></div>
          <div class="review-row"><strong>Centre status</strong><span>${escapeHtml(centre.status || "Unknown")}</span></div>
          <div class="review-row"><strong>Centre created</strong><span>${centre.created_at ? escapeHtml(new Date(centre.created_at).toLocaleDateString()) : "Not available"}</span></div>
          <div class="review-row"><strong>Licence</strong><span>${licence?.status ? escapeHtml(licence.status) : "No licence"}${licence?.expires_at ? ` · expires ${escapeHtml(new Date(licence.expires_at).toLocaleDateString())}` : ""}</span></div>
          <div class="review-row"><strong>Activation code</strong><code>${escapeHtml(key?.key_value || "Unavailable")}</code></div>
          <div class="review-row"><strong>Activation status</strong><span class="status-pill ${activationKeyStatusClass(key)}">${escapeHtml(getActivationKeyStatus(key))}</span></div>
          ${key?.generated_at ? `<div class="review-row"><strong>Key generated</strong><span>${escapeHtml(new Date(key.generated_at).toLocaleDateString())}</span></div>` : ""}
          ${key?.redeemed_at ? `<div class="review-row"><strong>Key activated</strong><span>${escapeHtml(new Date(key.redeemed_at).toLocaleDateString())}</span></div>` : ""}
          ${key?.redeemed_by_email ? `<div class="review-row"><strong>Activated by</strong><span>${escapeHtml(key.redeemed_by_email)}</span></div>` : ""}
          <div class="review-row"><strong>Centre accounts</strong><span>${members.length}</span></div>
        </div>
        <div class="onboarding-actions end"><button class="secondary-btn" data-action="upload-centre-logo" data-centre-id="${centre.id}">Upload centre logo</button><button class="primary-btn" data-action="close-centre-details">Done</button></div>
      </div></div>`;
    }

    function renderDevCentreCoachesPage() {
      const centres = (Array.isArray(state.devCentres) ? state.devCentres : [])
        .filter(Boolean)
        .map(centre => ({
          ...centre,
          id: String(centre.id || ""),
          name: String(centre.name || "Unnamed centre"),
          centre_memberships: Array.isArray(centre.centre_memberships) ? centre.centre_memberships : []
        }));
      const memberships = centres.flatMap(centre => centre.centre_memberships
        .filter(Boolean)
        .map(member => ({
          ...member,
          user_id: String(member.user_id || member.id || ""),
          name: String(member.name || member.email || "Coach"),
          email: String(member.email || "No email"),
          centre
        })));
      const filteredMemberships = devCentreCoachFilter
        ? memberships.filter(member => member.centre.id === String(devCentreCoachFilter))
        : memberships;
      const sortedCentres = centres.slice().sort((a, b) => a.name.localeCompare(b.name));
      const normalizedMemberships = filteredMemberships;
      const searchedMemberships = normalizedMemberships.filter(member => [member.name, member.email, member.centre.name].join(" ").toLowerCase().includes(devCentreCoachSearch));
      return `<section class="page ${state.ui.page === "centre-coaches" ? "active" : ""}"><div class="table-card"><div class="table-topline"><div class="section-title"><h2>Centre coaches</h2><p>${searchedMemberships.length} centre account${searchedMemberships.length === 1 ? "" : "s"} · Promote a coach to centre admin when needed.</p></div></div><div class="students-filter-bar"><input id="devCentreCoachSearch" class="search-input" type="search" placeholder="Search coach, email or centre" value="${escapeHtml(devCentreCoachSearch)}"><select id="dev-centre-coach-filter" class="filter-select" data-dev-centre-filter><option value="">All centres</option>${sortedCentres.map(centre => `<option value="${escapeHtml(centre.id)}" ${devCentreCoachFilter === centre.id ? "selected" : ""}>${escapeHtml(centre.name)}</option>`).join("")}</select></div><div class="table-wrap" style="margin-top:18px;"><table id="devCentreCoachesTable"><thead><tr><th>COACH</th><th>EMAIL</th><th>CENTRE</th><th>ROLE</th><th>ACTION</th></tr></thead><tbody>${searchedMemberships.length ? searchedMemberships.map(member => { const photo = member.photo || member.photo_url || ""; const roleLabel = member.role === "centre_admin" ? "Admin" : "Coach"; return `<tr><td data-label="Coach"><div class="person-cell">${avatarMarkup(member.name, photo)}<strong>${escapeHtml(member.name)}</strong></div></td><td data-label="Email">${escapeHtml(member.email)}</td><td data-label="Centre">${escapeHtml(member.centre.name)}</td><td data-label="Role"><span class="badge ${member.role === "centre_admin" ? "green" : "grey"}">${roleLabel}</span></td><td>${member.role === "centre_admin" ? `<button class="secondary-btn" data-action="set-centre-coach" data-centre-id="${member.centre.id}" data-user-id="${member.user_id}">Make coach</button>` : `<button class="secondary-btn" data-action="set-centre-admin" data-centre-id="${member.centre.id}" data-user-id="${member.user_id}">Make admin</button>`}</td></tr>`; }).join("") : `<tr><td colspan="5" class="muted">No centre accounts match this filter.</td></tr>`}</tbody></table></div></div></section>`;
    }

    // The centre QR page uses the same light link page as coaches.
    function renderCentrePage() {
      const profile = state.centreProfile || { links: [] };
      return renderCoachLinkPage({
        status: "ready",
        page: {
          name: requestedCentre?.name || "JomNittaku",
          role: "Table Tennis Centre",
          photo: "",
          centre_logo: requestedCentre?.logo_url || "",
          centre_name: "",
          links: (profile.links || []).map((link, index) => ({ id: link.id, title: link.label, url: centreLinkUrl(link), order: index + 1 }))
        }
      });
    }

    function renderPublicCoachPage(coach) {
      return renderCoachLinkPage({
        status: "ready",
        page: { name: coach.name, role: coach.role, bio: coach.bio, photo: coach.photo_url || coach.photo, links: coach.links, centre_name: requestedCentre?.name || coach.branch || "", centre_logo: requestedCentre?.logo_url || "" }
      });
    }

    const LINK_PLATFORMS = [
      { id: "whatsapp", label: "WhatsApp", badge: "WA", color: "#25d366", test: /(^|\.)(wa\.me|whatsapp\.com)$/i },
      { id: "instagram", label: "Instagram", badge: "IG", color: "#d6249f", test: /(^|\.)instagram\.com$/i },
      { id: "tiktok", label: "TikTok", badge: "TT", color: "#111111", test: /(^|\.)tiktok\.com$/i },
      { id: "facebook", label: "Facebook", badge: "FB", color: "#1877f2", test: /(^|\.)(facebook\.com|fb\.com)$/i },
      { id: "youtube", label: "YouTube", badge: "YT", color: "#ff0000", test: /(^|\.)(youtube\.com|youtu\.be)$/i },
      { id: "x", label: "X", badge: "X", color: "#111111", test: /(^|\.)(x\.com|twitter\.com)$/i },
      { id: "threads", label: "Threads", badge: "@", color: "#111111", test: /(^|\.)threads\.net$/i }
    ];
    // Which platform a link points to, for its icon. Unknown links are "website".
    const LINK_PLATFORM_CHOICES = ["Facebook", "Instagram", "WhatsApp", "TikTok", "YouTube", "X", "Threads", "Website", "Email", "Phone"];

    function linkPlatform(url) {
      const text = String(url || "").trim();
      if (/^mailto:/i.test(text)) return { id: "email", label: "Email", badge: "@", color: "#c81e45" };
      if (/^tel:/i.test(text)) return { id: "phone", label: "Call", badge: "☎", color: "#162a4a" };
      try {
        const host = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`).hostname;
        return LINK_PLATFORMS.find(platform => platform.test.test(host)) || { id: "website", label: "Website", badge: "W", color: "#c81e45" };
      } catch {
        return { id: "website", label: "Website", badge: "W", color: "#c81e45" };
      }
    }
    // Links a parent can actually open (skips old placeholders like "/reports" or an empty "mailto:").
    function publicCoachLinks(links) {
      return (Array.isArray(links) ? links : [])
        .filter(link => link && link.visible !== false)
        .map(link => ({ ...link, url: String(link.url || "").trim(), title: String(link.title || link.label || "").trim() }))
        .filter(link => /^https?:\/\/[^/\s]+\.[^/\s]+/i.test(link.url) || /^mailto:[^@\s]+@[^@\s]+$/i.test(link.url) || /^tel:\+?[0-9 ()-]{6,}$/i.test(link.url))
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    // Style B link page: light background, coach photo on top, one main
    // button, then the rest. The footer shows the centre name.
    function renderCoachLinkPage(result) {
      if (result.status === "loading") return '<main class="link-page"><div class="link-page-card"><div class="app-loading" role="status">Loading…</div></div></main>';
      if (result.status !== "ready") {
        const title = result.status === "error" ? "Couldn\'t load this page" : "Page not found";
        const text = result.status === "error" ? "Check your internet connection and try again." : "This link may be out of date. Ask your coach for a new one.";
        return `<main class="link-page"><div class="link-page-card"><h1>${title}</h1><p class="link-page-bio">${text}</p>${result.status === "error" ? '<a class="link-btn is-main" href="">Try again</a>' : ""}</div></main>`;
      }
      const page = result.page || {};
      const links = publicCoachLinks(page.links);
      const socials = [];
      links.forEach(link => {
        const platform = linkPlatform(link.url);
        if (!["website", "email", "phone"].includes(platform.id) && !socials.some(item => item.platform.id === platform.id)) socials.push({ link, platform });
      });
      const centre = page.centre_name || "";
      const photo = page.photo || "";
      return `
        <main class="link-page">
          <div class="link-page-card">
            <div class="link-page-photo ${!photo && page.centre_logo ? "is-logo" : ""}">${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(page.name || "Coach")}">` : page.centre_logo ? `<img src="${escapeHtml(page.centre_logo)}" alt="${escapeHtml(centre || "Centre")} logo">` : `<span>${escapeHtml(initials(page.name || "Coach"))}</span>`}</div>
            <h1>${escapeHtml(page.name || "Coach")}</h1>
            <p class="link-page-sub">${escapeHtml([page.role || "Coach", centre].filter(Boolean).join(" · "))}</p>
            ${page.bio ? `<p class="link-page-bio">${escapeHtml(page.bio)}</p>` : ""}
            ${socials.length ? `<div class="link-page-socials">${socials.map(({ link, platform }) => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(platform.label)}" style="--brand:${platform.color}">${escapeHtml(platform.badge)}</a>`).join("")}</div>` : ""}
            <div class="link-page-buttons">
              ${links.length ? links.map((link, index) => {
                const platform = linkPlatform(link.url);
                const external = /^https?:/i.test(link.url);
                return `<a class="link-btn ${index === 0 ? "is-main" : ""}" href="${escapeHtml(link.url)}" ${external ? 'target="_blank" rel="noopener noreferrer"' : ""} style="--i:${index};--brand:${platform.color}"><span class="link-btn-icon">${escapeHtml(platform.badge)}</span><span>${escapeHtml(link.title || platform.label)}</span></a>`;
              }).join("") : '<p class="link-page-empty">No links added yet.</p>'}
            </div>
            ${centre ? `<footer class="link-page-footer">${page.centre_logo ? `<img src="${escapeHtml(page.centre_logo)}" alt="">` : ""}<span>${escapeHtml(centre)}</span></footer>` : ""}
          </div>
        </main>`;
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
      // Browser tab shows the centre's name on its own pages.
      const pageTitle = requestedCentre?.name ? `${requestedCentre.name} · Coach Reports` : "JomNittaku · Coach Reports";
      if (document.title !== pageTitle) document.title = pageTitle;
      const app = document.getElementById("app");
      if (!authReady) {
        app.innerHTML = '<div class="app-loading" role="status" aria-live="polite">Loading…</div>';
        return;
      }
      // A re-render replaces the whole subtree, so anything the user has
      // half-typed into the login form (and the caret position) is lost
      // unless it is carried across explicitly.
      const activeElement = document.activeElement;
      // A Drive list may finish while a report search/date filter is in use.
      // Carry these values and the caret across that asynchronous render.
      const reportFilterIds = ["reportsSearch", "reportsDateFilter", "reportsStatusFilter", "reportsStudentFilter", "reportsMonthFilter", "reportsDayFilter", "reportsDateFrom", "reportsDateTo", "overviewDateFrom", "overviewDateTo"];
      const reportFilterState = {
        values: Object.fromEntries(reportFilterIds.map(id => document.getElementById(id)).filter(Boolean).map(input => [input.id, input.value])),
        activeId: reportFilterIds.includes(activeElement?.id) ? activeElement.id : null,
        selectionStart: typeof activeElement?.selectionStart === "number" ? activeElement.selectionStart : null,
        selectionEnd: typeof activeElement?.selectionEnd === "number" ? activeElement.selectionEnd : null,
      };
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
      if (publicMatch && publicCoachPage) {
        app.innerHTML = renderCoachLinkPage(publicCoachPage);
        return;
      }
      const publicCoach = publicMatch ? getCoachBySlug(decodeURIComponent(publicMatch[1])) : null;
      if (centreRouteLoadFailed) {
        app.innerHTML = loginScreen('<div class="login-panel login-card"><div class="brand-copy"><h1>Couldn\'t load this centre</h1><p class="muted">Check your internet connection and try again.</p></div><div class="wrong-centre-actions"><button type="button" class="primary-btn" data-action="reload-page">Try again</button></div></div>');
        attachEvents();
        return;
      }
      if (centreRouteUnavailable) {
        app.innerHTML = loginScreen('<div class="login-panel login-card"><div class="brand-copy"><h1>Centre not found</h1><p class="muted">This centre link is invalid or no longer active. Check the link with your centre.</p></div></div>');
        mountLoginScene();
        return;
      }
      const isMatchingCentreSession = requestedCentre
        && state.auth.centreId === requestedCentre.id
        && ["centre_admin", "coach"].includes(state.auth.role);
      if (requestedCentre && !isMatchingCentreSession) {
        app.innerHTML = state.auth.userId && state.auth.role ? renderWrongCentre() : renderLogin();
        attachEvents();
        return;
      }
      if (isMatchingCentreSession && !requestedCentre.activated_at) {
        app.innerHTML = `${renderDashboard()}${renderCentreActivationOverlay()}`;
        attachEvents();
        return;
      }
      // New coaches finish the guided setup before using the dashboard.
      if (state.auth.role === "coach" && !publicCoach && (isMatchingCentreSession || !requestedCentre) && !/^\/centre\/?$/i.test(window.location.pathname) && (coachOnboardingInstance?.isOpen() || (needsCoachOnboarding(getOnboardingCoach()) && !autoCompleteOnboardingIfActive(getOnboardingCoach())))) {
        renderCoachOnboarding(app);
        return;
      }
      if (!requestedCentre && /^\/centre\/?$/i.test(window.location.pathname)) {
        app.innerHTML = renderCentrePage();
        return;
      }
      app.innerHTML = publicCoach ? renderPublicCoachPage(publicCoach) : state.auth.role ? renderDashboard() : renderLogin();
      if (publicCoach) return;
      attachEvents();
      Object.entries(reportFilterState.values).forEach(([id, value]) => {
        const input = document.getElementById(id);
        if (input) input.value = value;
      });
      const reportDateFilter = document.getElementById("reportsDateFilter")?.value;
      document.getElementById("reportsMonthFilter")?.classList.toggle("hidden", reportDateFilter !== "month");
      document.getElementById("reportsDayFilter")?.classList.toggle("hidden", reportDateFilter !== "day");
      document.getElementById("reportsCustomDates")?.classList.toggle("hidden", reportDateFilter !== "custom");
      fitCustomCertificateHeadingText();
      // Fonts requested by styles.css can finish loading after first paint.
      // Refit after readiness without changing font size or saved geometry.
      if (document.fonts?.ready) {
        void document.fonts.ready.then(() => {
          requestAnimationFrame(() => {
            if (app.isConnected) fitCustomCertificateHeadingText();
          });
        }).catch(() => {});
      }
      if (state.auth.role) {
        hydrateReportsTable();
        hydrateCoachesTable();
        hydrateStudentsTable();
        hydrateQrImages();
        // Covers server-rendered tables (e.g. overview "Recent Reports")
        // that have no hydrate step of their own.
        stampTableLabels();
      }
      for (const formState of [loginFormState, reportFilterState].filter(Boolean)) {
        Object.entries(formState.values).forEach(([id, value]) => {
          const input = document.getElementById(id);
          if (input && value) input.value = value;
        });
        const nextFocus = formState.activeId ? document.getElementById(formState.activeId) : null;
        if (nextFocus && typeof nextFocus.focus === "function") {
          nextFocus.focus({ preventScroll: true });
          if (typeof nextFocus.setSelectionRange === "function" && formState.selectionStart !== null && formState.selectionEnd !== null) {
            try {
              nextFocus.setSelectionRange(formState.selectionStart, formState.selectionEnd);
            } catch {
              // Some input types (e.g. email) disallow selection APIs.
            }
          }
        }
      }
    }

    function fitCustomCertificateHeadingText() {
      for (const span of document.querySelectorAll('.template-heading .template-custom-layer-content')) {
        const box = span.parentElement;
        if (!box?.clientWidth || !box.clientHeight) continue;
        const style = window.getComputedStyle(box);
        const baseSize = Number.parseFloat(style.fontSize) || 18;
        const ctx = document.createElement("canvas").getContext("2d");
        if (!ctx) continue;
        ctx.font = `${style.fontStyle} ${style.fontWeight} ${baseSize}px ${style.fontFamily}`;
        const lines = (span.innerText || span.textContent || "").split("\n");
        const textWidth = Math.max(...lines.map(line => {
          const metrics = ctx.measureText(line);
          return Math.max(metrics.width, (metrics.actualBoundingBoxLeft || 0) + (metrics.actualBoundingBoxRight || 0));
        }), 1);
        const widthScale = box.clientWidth * 0.94 / textWidth;
        const heightScale = box.clientHeight * 0.94 / (baseSize * 1.15 * lines.length);
        // Fit the complete text, including glyph overhang, inside its box.
        // Never crop a title by imposing a minimum horizontal scale.
        // Relative sizing also scales correctly in the full-resolution
        // html2canvas clone and when the preview changes width.
        span.style.fontSize = `${Math.min(1, widthScale, heightScale)}em`;
        span.style.transform = "none";
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
        getQrCodeLib().then(QRCode=>QRCode.toDataURL(image.dataset.qrUrl || "https://jom-nittaku-webapp.vercel.app/centre", {width:320,margin:0,errorCorrectionLevel:"M"})).then(dataUrl => {
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
      mountLoginScene();
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
        app.addEventListener("change", event => {
          if (event.target.matches('input[data-action^="studio-frame-"]')) {
            handleStudioAction(event.target.dataset.action, event.target);
            return;
          }
          if (event.target.matches('input[name="reportTemplate"]')) {
            selectDraftTemplate(event.target.value);
            return;
          }
          const reportCentre = event.target.closest("#adminReportCentre");
          if (reportCentre) {
            handleReportCentreChange(reportCentre.value);
            return;
          }
          const filter = event.target.closest("[data-dev-centre-filter]");
          if (!filter) return;
          devCentreCoachFilter = filter.value;
          render();
        });
        app.addEventListener("input", event => {
          if (event.target.id !== "devCentreCoachSearch") return;
          devCentreCoachSearch = event.target.value.trim().toLowerCase();
          const selectionStart = event.target.selectionStart;
          render();
          requestAnimationFrame(() => {
            const search = document.getElementById("devCentreCoachSearch");
            if (!search) return;
            search.focus();
            search.setSelectionRange(selectionStart, selectionStart);
          });
        });
        app.addEventListener("dragstart", event => {
          const asset = event.target.closest("[data-certificate-asset-id]");
          if (!asset || !event.dataTransfer) return;
          event.dataTransfer.setData("application/x-certificate-asset", asset.dataset.certificateAssetId);
          event.dataTransfer.setData("text/plain", asset.dataset.certificateAssetId);
          event.dataTransfer.effectAllowed = "copy";
        });
        app.addEventListener("dragover", event => {
          const target = event.target.closest("[data-overlay-id]");
          const types = Array.from(event.dataTransfer?.types || []);
          if (!target || (!types.includes("application/x-certificate-asset") && !types.includes("text/plain"))) return;
          const layout = getReportLayout(getCurrentCoach());
          const layer = layout.layers.find(item => item.id === target.dataset.overlayId);
          if (target.dataset.overlayId === "qr" || layer?.locked === true || !(layer?.type === "image" || layer?.type === "photo" || ARTWORK_SLICES[target.dataset.overlayId])) return;
          event.preventDefault();
          target.classList.add("is-image-drop-target");
          event.dataTransfer.dropEffect = "copy";
        });
        app.addEventListener("dragleave", event => {
          event.target.closest("[data-overlay-id]")?.classList.remove("is-image-drop-target");
        });
        app.addEventListener("drop", event => {
          const target = event.target.closest("[data-overlay-id]");
          if (!target) return;
          target.classList.remove("is-image-drop-target");
          const assetId = event.dataTransfer?.getData("application/x-certificate-asset") || event.dataTransfer?.getData("text/plain");
          if (!assetId) return;
          event.preventDefault();
          event.stopPropagation();
          applyCertificateUpload(assetId, target.dataset.overlayId);
        });
        app.addEventListener("pointerdown", event => {
          const item = event.target.closest(".report-overlay-item.is-editing");
          const preview = document.querySelector("#reportTemplatePreview");
          if (!item || !preview) return;
          if (event.target.closest(".certificate-object-toolbar")) return;
          if (event.target.closest('[contenteditable="true"]')) return;
          if (event.detail > 1 && event.target.closest('[data-overlay-text="true"]')) return;
          selectedReportOverlay = item.dataset.overlayId;
          const coach = getCurrentCoach();
          const fullLayout = getReportLayout(coach);
          const layout = fullLayout[selectedReportOverlay] || (fullLayout.layers || []).find(layer => layer.id === selectedReportOverlay);
          if (!layout) return;
          if (layout.locked === true) return;
          const startX = event.clientX;
          const startY = event.clientY;
          const startLeft = Number(layout.left) || 0;
          const startTop = Number(layout.top) || 0;
          const startWidth = Number(layout.width) || 10;
          const startHeight = Number(layout.height) || 8;
          const linkedIds = selectedReportOverlay === "contact-frame" ? ["contact", "address"] : [];
          const linkedStarts = linkedIds.map(id => {
            const linkedLayout = fullLayout[id];
            return linkedLayout ? { id, layout: linkedLayout, left: Number(linkedLayout.left) || 0, top: Number(linkedLayout.top) || 0 } : null;
          }).filter(Boolean);
          const resizeHandle = event.target.closest(".certificate-resize-handle");
          const resizeEdge = resizeHandle?.dataset.resizeEdge || "corner";
          const resizing = Boolean(resizeHandle);
          const rect = preview.getBoundingClientRect();
          reportOverlayDragged = false;
          item.classList.add("is-dragging");
          item.setPointerCapture?.(event.pointerId);
          const preserveTextClick = event.target.closest('[data-overlay-text="true"]') && !resizeHandle;
          if (!preserveTextClick) event.preventDefault();
          const move = moveEvent => {
            if (Math.abs(moveEvent.clientX - startX) > 2 || Math.abs(moveEvent.clientY - startY) > 2) {
              reportOverlayDragged = true;
              if (preserveTextClick) window.getSelection()?.removeAllRanges();
            }
            const dx = ((moveEvent.clientX - startX) / rect.width) * 100;
            const dy = ((moveEvent.clientY - startY) / rect.height) * 100;
            if (resizing) {
              if (resizeEdge === "left") {
                const right = startLeft + startWidth;
                layout.left = Math.max(0, Math.min(right - 2, startLeft + dx));
                layout.width = right - layout.left;
              } else if (resizeEdge === "right") {
                layout.width = Math.max(2, Math.min(100 - startLeft, startWidth + dx));
              } else {
                layout.width = Math.max(2, Math.min(100 - startLeft, startWidth + dx));
                layout.height = Math.max(2, Math.min(100 - startTop, startHeight + dy));
              }
            } else {
              layout.left = Math.max(0, Math.min(100 - startWidth, startLeft + dx));
              layout.top = Math.max(0, Math.min(100 - startHeight, startTop + dy));
              linkedStarts.forEach(({ id, layout: linkedLayout, left, top }) => {
                linkedLayout.left = Math.max(0, Math.min(100 - (Number(linkedLayout.width) || 10), left + dx));
                linkedLayout.top = Math.max(0, Math.min(100 - (Number(linkedLayout.height) || 8), top + dy));
                const linkedItem = preview.querySelector(`[data-overlay-id="${id}"]`);
                if (linkedItem) {
                  linkedItem.style.left = `${linkedLayout.left}%`;
                  linkedItem.style.top = `${linkedLayout.top}%`;
                }
              });
            }
            item.style.left = `${layout.left}%`;
            item.style.top = `${layout.top}%`;
            if (resizing) {
              item.style.width = `${layout.width}%`;
              item.style.height = `${layout.height}%`;
              fitCustomCertificateHeadingText();
            }
          };
          const up = () => {
            document.removeEventListener("pointermove", move);
            document.removeEventListener("pointerup", up);
            document.removeEventListener("pointercancel", up);
            item.releasePointerCapture?.(event.pointerId);
            item.classList.remove("is-dragging");
            if (reportOverlayDragged || resizing) {
              coach.reportLayout = fullLayout;
              saveReportLayout(coach);
            }
          };
          document.addEventListener("pointermove", move);
          document.addEventListener("pointerup", up, { once: true });
          document.addEventListener("pointercancel", up, { once: true });
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

      const overviewDate = document.getElementById("overviewDateFilter");
      const overviewMonth = document.getElementById("overviewMonthFilter");
      const overviewWeek = document.getElementById("overviewWeekFilter");
      const overviewFrom = document.getElementById("overviewDateFrom");
      const overviewTo = document.getElementById("overviewDateTo");
      overviewDate?.addEventListener("change", () => {
        overviewDateFilter = overviewDate.value;
        scheduleRender();
      });
      overviewMonth?.addEventListener("change", () => {
        overviewMonthFilter = overviewMonth.value;
        scheduleRender();
      });
      overviewWeek?.addEventListener("change", () => {
        overviewWeekFilter = overviewWeek.value;
        scheduleRender();
      });
      [overviewFrom, overviewTo].filter(Boolean).forEach(input => input.addEventListener("change", () => {
        overviewDateFrom = overviewFrom?.value || "";
        overviewDateTo = overviewTo?.value || "";
        scheduleRender();
      }));

      document.querySelectorAll("[data-report-status]").forEach(chip => {
        chip.addEventListener("click", () => {
          if (!reportsStatus) return;
          reportsStatus.value = chip.dataset.reportStatus;
          reportsStatus.dispatchEvent(new Event("change"));
        });
      });

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
        if (loginForm.hasAttribute("data-centre-activation-form")) return submitCentreActivation();
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
          uploadProfileImage(file, "student", event.target.dataset.studentId).then(async url => {
            const student = getStudentById(event.target.dataset.studentId);
            if (student) {
              student.photo = url;
              const savedStudent = await saveStudentRecord(student);
              state.students = state.students.map(item => item.id === savedStudent.id ? savedStudent : item);
            }
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
          uploadProfileImage(file, context, targetId).then(async url => {
            if (context === "admin") {
              state.adminProfile.photo = url;
            } else {
              const coach = getCurrentCoach();
              coach.photo = url;
              coach.photo_url = url;
              const savedCoach = await saveCoachRecord(coach);
              state.coaches = state.coaches.map(item => item.id === savedCoach.id ? savedCoach : item);
            }
            draftProfileUploadContext = null;
            event.target.value = "";
            persist();
            render();
          }).catch(error => alert(error.message || "Unable to upload photo."));
        });
      }

      const hiddenCentreLogoUpload = document.getElementById("hiddenCentreLogoUpload");
      hiddenCentreLogoUpload?.addEventListener("change", async event => {
        const [file] = event.target.files || [];
        const centreId = event.target.dataset.centreId;
        if (!file || !centreId) return;
        try {
          const logoUrl = await uploadProfileImage(file, "centre-logo", centreId);
          await invokePrivileged("dev-console", { action: "update-centre-logo", centre_id: centreId, logo_url: logoUrl });
          await refreshPrivilegedState();
          render();
        } catch (error) {
          alert(error.message || "Unable to upload centre logo.");
        } finally {
          event.target.value = "";
        }
      });

      document.getElementById("centre-onboarding-logo")?.addEventListener("change", event => {
        const [file] = event.target.files || [];
        if (!file || !centreOnboardingModal) return;
        if (!file.type.startsWith("image/")) return alert("Choose an image file.");
        if (file.size > 5 * 1024 * 1024) return alert("Images must be 5 MB or smaller.");
        centreOnboardingModal.values.logoFile = file;
        centreOnboardingModal.values.logoPreview = URL.createObjectURL(file);
        render();
      });

      document.querySelectorAll("[data-time-picker]").forEach(picker => picker.addEventListener("change", () => {
        const part = name => picker.querySelector(`[data-time-part="${name}"]`)?.value;
        const hour12 = Number(part("hour")) || 12;
        const hour24 = (hour12 % 12) + (part("ampm") === "PM" ? 12 : 0);
        const hidden = picker.querySelector("#wizardTime");
        hidden.value = `${String(hour24).padStart(2, "0")}:${String(Number(part("minute")) || 0).padStart(2, "0")}`;
        hidden.dispatchEvent(new Event("input"));
      }));
      ["wizardDate", "wizardTime", "wizardLessonNumber", "wizardWhatTaught", "wizardAfterTraining", "wizardBeforeCoaching", "wizardNextLesson", "wizardRemarks"].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
          element.addEventListener("input", updateWizardDraftFromInputs);
        }
      });
      document.querySelectorAll("[data-overlay-id]").forEach(item => item.addEventListener("click", event => {
        if (event.target.closest(".certificate-object-toolbar")) return;
        event.stopPropagation();
        if (selectedCertificateUploadId) {
          const targetLayer = getReportLayout(getCurrentCoach()).layers.find(layer => layer.id === item.dataset.overlayId);
          if ((targetLayer?.type === "image" || targetLayer?.type === "photo") && targetLayer.locked !== true && item.dataset.overlayId !== "qr") {
            const assetId = selectedCertificateUploadId;
            selectedCertificateUploadId = "";
            applyCertificateUpload(assetId, item.dataset.overlayId);
            return;
          }
        }
        if (reportOverlayDragged) {
          reportOverlayDragged = false;
          return;
        }
        selectedReportOverlay = item.dataset.overlayId;
        const layer = getReportLayout(getCurrentCoach()).layers.find(entry => entry.id === item.dataset.overlayId);
        if (reportLayoutEditing && item.dataset.overlayText === "true") {
          refreshCertificateSelection();
          return;
        }
        if (reportLayoutEditing) render();
      }));
      document.querySelector("#reportTemplatePreview")?.addEventListener("click", event => {
        if (!event.target.closest(".report-overlay-item")) {
          selectedReportOverlay = "";
          render();
        }
      });
      document.querySelectorAll("[data-layer-select]").forEach(item => item.addEventListener("click", () => { selectedReportOverlay = item.dataset.layerSelect; render(); }));
      document.querySelectorAll(".certificate-tool-button[data-certificate-tool]").forEach(item => item.addEventListener("click", () => {
        certificateEditorTool = item.dataset.certificateTool;
        render();
      }));
      document.querySelectorAll("[data-certificate-asset-id]").forEach(item => item.addEventListener("click", () => {
        selectedCertificateUploadId = item.dataset.certificateAssetId;
        render();
        requestAnimationFrame(() => {
          [...document.querySelectorAll("[data-certificate-asset-id]")]
            .find(asset => asset.dataset.certificateAssetId === selectedCertificateUploadId)
            ?.focus();
        });
      }));
      document.querySelectorAll("[data-certificate-image-target]").forEach(item => item.addEventListener("keydown", event => {
        if (!selectedCertificateUploadId || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        const assetId = selectedCertificateUploadId;
        selectedCertificateUploadId = "";
        applyCertificateUpload(assetId, item.dataset.overlayId);
      }));
      document.querySelectorAll('[data-overlay-text="true"][data-overlay-id]').forEach(item => item.addEventListener("dblclick", event => {
        event.stopPropagation();
        beginCertificateTextEditing(item);
      }));
      attachCertificateToolbarEvents();
      attachStudioEvents();
      document.getElementById("hiddenCertificateUpload")?.addEventListener("change", event => {
        const [file] = event.target.files || [];
        if (!file) return;
        if (certificateLogoUploadTarget) {
          const target = certificateLogoUploadTarget;
          certificateLogoUploadTarget = null;
          event.target.value = "";
          return replaceCertificateLogo(file, target);
        }
        if (certificateUploadToLibrary) {
          certificateUploadToLibrary = false;
          uploadCertificateImageToLibrary(file).catch(error => alert(error.message || "Unable to upload certificate image."));
          event.target.value = "";
          return;
        }
        uploadProfileImage(file, "certificate", getCurrentCoach().id).then(url => {
          const coach = getCurrentCoach();
          const layout = getReportLayout(coach);
          const layer = (layout.layers || []).find(entry => entry.id === selectedReportOverlay);
          if (!layer || layer.type !== "image") throw new Error("Select an image layer before uploading.");
          addCertificateUpload(layout, url, file.name);
          layer.source = url;
          layer.objectFit = "contain";
          layer.objectPosition = "center";
          coach.reportLayout = layout;
          event.target.value = "";
          return saveReportLayout(coach);
        }).catch(error => { event.target.value = ""; alert(error.message || "Unable to upload certificate image."); });
      });
      const logoDropzone = document.querySelector("[data-logo-dropzone]");
      if (logoDropzone) {
        const openUpload = () => {
          certificateUploadToLibrary = true;
          certificateLogoUploadTarget = null;
          document.getElementById("hiddenCertificateUpload")?.click();
        };
        logoDropzone.addEventListener("click", openUpload);
        logoDropzone.addEventListener("dragover", event => { event.preventDefault(); logoDropzone.classList.add("is-dragging"); });
        logoDropzone.addEventListener("dragleave", () => logoDropzone.classList.remove("is-dragging"));
        logoDropzone.addEventListener("drop", event => {
          event.preventDefault();
          logoDropzone.classList.remove("is-dragging");
          const file = [...(event.dataTransfer?.files || [])].find(item => item.type.startsWith("image/"));
          if (file) uploadCertificateImageToLibrary(file).catch(error => alert(error.message || "Unable to upload certificate image."));
        });
        logoDropzone.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openUpload();
          }
        });
      }
    }

    function attachCertificateToolbarEvents() {
      document.querySelectorAll(".certificate-reference-toolbar select, .certificate-reference-toolbar input").forEach(control=>control.addEventListener("mousedown",()=>{if(activeCertificateEditor)activeCertificateEditor.keepDomOnBlur=true;}));
      document.querySelectorAll(".certificate-reference-toolbar [data-certificate-tool]").forEach(button=>button.addEventListener("click",()=>{certificateEditorTool=button.dataset.certificateTool;render();}));
      document.querySelectorAll(".certificate-reference-toolbar button, .certificate-reference-toolbar summary").forEach(button=>button.addEventListener("mousedown",event=>event.preventDefault()));
      document.querySelector("[data-layout-field]")?.addEventListener("change", event => { selectedReportOverlay = event.target.value; render(); });
      document.querySelector("[data-layout-name]")?.addEventListener("change", event => updateSelectedReportLayout({ name: event.target.value.trim().slice(0, 80) || selectedReportOverlay }));
      document.querySelector("[data-layout-font]")?.addEventListener("change", event => updateSelectedReportLayout({ fontFamily: event.target.value }));
      document.querySelector("[data-layout-size]")?.addEventListener("change", event => updateSelectedReportLayout({ fontSize: Number(event.target.value) || 1 }));
      document.querySelector("[data-layout-color]")?.addEventListener("input", event => updateSelectedReportLayout({ color: event.target.value }));
      document.querySelectorAll("[data-font-step]").forEach(button => button.addEventListener("click", () => {
        const input = document.querySelector("[data-layout-size]");
        if (!input) return;
        const nextSize = Math.max(0.6, Math.min(8, (Number(input.value) || 1) + Number(button.dataset.fontStep || 0)));
        updateSelectedReportLayout({ fontSize: Number(nextSize.toFixed(1)) });
      }));
      document.querySelectorAll("[data-text-format]").forEach(button => button.addEventListener("click", () => {
        const format = button.dataset.textFormat;
        if (format === "bold") {
          const coach = getCurrentCoach();
          const layout = getReportLayout(coach)[selectedReportOverlay] || (getReportLayout(coach).layers || []).find(layer => layer.id === selectedReportOverlay);
          updateSelectedReportLayout({ fontWeight: Number(layout?.fontWeight) >= 600 ? 400 : 700 });
        }
        if (format === "italic") updateSelectedReportLayout({ fontStyle: button.classList.contains("is-active") ? "normal" : "italic" });
        if (format === "underline") updateSelectedReportLayout({ textDecoration: button.classList.contains("is-active") ? "none" : "underline" });
      }));
      document.querySelectorAll(".certificate-object-toolbar button").forEach(button => button.addEventListener("mousedown", event => event.preventDefault()));
      document.querySelector("[data-layout-left]")?.addEventListener("change", event => updateSelectedReportLayout({ left: Number(event.target.value) || 0 }));
      document.querySelector("[data-layout-top]")?.addEventListener("change", event => updateSelectedReportLayout({ top: Number(event.target.value) || 0 }));
      document.querySelector("[data-layout-width]")?.addEventListener("change", event => updateSelectedReportLayout({ width: Number(event.target.value) || 1 }));
      document.querySelector("[data-layout-height]")?.addEventListener("change", event => updateSelectedReportLayout({ height: Number(event.target.value) || 0.5 }));
      document.querySelector("[data-layout-opacity]")?.addEventListener("change", event => updateSelectedReportLayout({ opacity: Math.max(0, Math.min(1, Number(event.target.value))) }));
    }

    function refreshCertificateSelection() {
      const coach = getCurrentCoach();
      const layout = getReportLayout(coach);
      document.querySelectorAll("[data-overlay-id]").forEach(item => {
        const selected = reportLayoutEditing && item.dataset.overlayId === selectedReportOverlay;
        item.classList.toggle("is-selected", selected);
        item.querySelector(".certificate-object-toolbar")?.remove();
        const layer = layout.layers.find(entry => entry.id === item.dataset.overlayId);
        const showTools = selected && reportLayoutEditing && layer?.type === "text" && layer.id !== "footer-text-overlay";
        item.classList.toggle("has-object-tools", showTools);
        if (showTools) item.insertAdjacentHTML("beforeend", renderCertificateObjectTools(layer));
      });
      const toolbar = document.querySelector(".report-layout-toolbar");
      if (toolbar) toolbar.outerHTML = renderReportLayoutToolbar(coach);
      attachCertificateToolbarEvents();
    }

    function updateSelectedReportLayout(changes) {
      const coach = getCurrentCoach();
      if (!coach || !selectedReportOverlay) return;
      coach.reportLayout = getReportLayout(coach);
      const layerTarget = (coach.reportLayout.layers || []).find(layer => layer.id === selectedReportOverlay);
      const target = coach.reportLayout[selectedReportOverlay] || layerTarget;
      if (!target) return;
      if (Object.prototype.hasOwnProperty.call(changes, "text") && !layerTarget?.type?.includes("text")) {
        changes = { ...changes, textOverride: changes.text };
        delete changes.text;
      }

      Object.assign(target, changes);
      if (changes.name && layerTarget) layerTarget.name = changes.name;
      saveReportLayout(coach);
    }

    async function saveReportLayout(coach,options={}) {
      try {
        if (isCertificatePreview) await previewLayoutStore("save", coach.reportLayout);
        else if (supabase && coach?.id && state.auth.role === "coach") {
          const savedCoach=await saveCoachRecord(coach);
          state.coaches=state.coaches.map(item=>item.id===savedCoach.id?savedCoach:item);
          persist();
        } else persist();
        if(options.render!==false)render(); return true;
      } catch(error) { if(options.render!==false)render(); studioToast(error.message || "Your design could not be saved. Please try again."); return false; }
    }

    async function copyCertificateEditorLayer() {
      const coach=getCurrentCoach();const layout=getReportLayout(coach);
      const layer=layout.layers.find(l=>l.id===selectedReportOverlay);const target=layout[selectedReportOverlay]||layer;
      if(!target||selectedReportOverlay==="qr")return;
      const data=getReportTemplateData(getCertificateDesignPreviewReport(coach));
      const values={date:data.session.date,time:data.session.time,centre:data.session.centre,coach:data.session.coachName,whatTaught:data.bullets.whatTaught.join("\n"),beforeCoaching:data.bullets.beforeCoaching.join("\n"),afterTraining:data.bullets.afterTraining.join("\n"),nextLesson:data.bullets.nextLesson.join("\n"),remarks:data.remarksLines.join("\n"),contact:data.centreContact,address:data.address};
      const id=`custom-${crypto.randomUUID()}`;
      const copy={...layer,...target,id,name:`${layer?.name||"Element"} copy`,visible:true,locked:false,left:Math.min(100-Number(target.width||10),Number(target.left||0)+2),top:Math.min(100-Number(target.height||4),Number(target.top||0)+2),height:Number(target.height)||4,zIndex:Math.max(...layout.layers.map(l=>Number(l.zIndex)||1),1)+1};
      if(layout[selectedReportOverlay]||layer?.type?.includes("text")||typeof target.textOverride==="string"){
        copy.type="text";copy.text=target.textOverride??target.text??values[selectedReportOverlay]??"";delete copy.textOverride;
      }else{
        copy.type="image";copy.source=target.source||(selectedReportOverlay==="student-photo"?data.studentPhoto:selectedReportOverlay==="coach-photo"?data.coachPhoto:ARTWORK_SLICES[selectedReportOverlay]?`${REPORT_TEMPLATE_LAYER_ROOT}/${encodeURIComponent(selectedReportOverlay)}.png?v=1`:"");
        if(!copy.source)copy.source=`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(PHOTO_PLACEHOLDER_SVG)}`;
      }
      layout.layers.push(copy);coach.reportLayout=layout;selectedReportOverlay=id;return saveReportLayout(coach);
    }
    async function deleteCertificateEditorLayer() {
      const coach=getCurrentCoach();const layout=getReportLayout(coach);
      const layer=layout.layers.find(l=>l.id===selectedReportOverlay);const target=layout[selectedReportOverlay]||layer;
      if(!target||target.locked)return;
      if(selectedReportOverlay.startsWith("custom-"))layout.layers=layout.layers.filter(l=>l.id!==selectedReportOverlay);
      else{target.visible=false;if(layer)layer.visible=false;}
      coach.reportLayout=layout;selectedReportOverlay="";return saveReportLayout(coach);
    }

    function handleAction(event) {
      const action = event.currentTarget.dataset.action;
      if(action==="simple-copy-layer")return copyCertificateEditorLayer();
      if(action==="simple-delete-layer")return deleteCertificateEditorLayer();
      if (action?.startsWith("studio-")) return handleStudioAction(action, event.currentTarget);
      if (action === "reload-page") return window.location.reload();
      if (action === "setup-open") return getCoachOnboarding().openAt(event.currentTarget.dataset.step || "profile");
      if (action === "setup-dismiss") {
        setupCardDismissed = true;
        try { sessionStorage.setItem("setupCardDismissed", "1"); } catch { /* storage may be blocked */ }
        return render();
      }
      if (action === "open-centre-onboarding") return openCentreOnboarding();
      if (action === "close-centre-onboarding") return closeCentreOnboarding();
      if (action === "centre-onboarding-continue") return continueCentreOnboarding();
      if (action === "centre-onboarding-back") { if (centreOnboardingModal) { centreOnboardingModal.step = 1; render(); } return; }
      if (action === "centre-onboarding-submit") return submitCentreOnboarding();
      if (action === "view-centre-details") { devCentreDetailModal = { centreId: event.currentTarget.dataset.centreId }; return render(); }
      if (action === "close-centre-details") { devCentreDetailModal = null; return render(); }
      if (action === "delete-centre") return (async () => {
        const centreId = event.currentTarget.dataset.centreId;
        const centre = (state.devCentres || []).find(item => String(item.id) === String(centreId));
        if (!centre || !window.confirm(`Delete ${centre.name}? This permanently removes the centre, its memberships, licences, activation keys, and Drive data.`)) return;
        try {
          await invokePrivileged("dev-console", { action: "delete-centre", centre_id: centreId });
          await refreshPrivilegedState();
          render();
        } catch (error) {
          alert(error.message || "Unable to delete centre.");
        }
      })();
      if (action === "centre-activation-logout") return logout();
      if (action === "update-centre-sport") {
        const centreId = event.currentTarget.dataset.centreId;
        const sport = document.getElementById("dev-centre-sport")?.value || "";
        if (!centreId || !sport) return;
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = "Saving…";
        invokePrivileged("dev-console", { action: "update-centre-sport", centre_id: centreId, sport })
          .then(() => refreshPrivilegedState())
          .catch(error => alert(error.message || "Unable to update the sport."))
          .finally(() => render());
        return;
      }
      if (action === "upload-centre-logo") {
        const input = document.getElementById("hiddenCentreLogoUpload");
        if (input) { input.dataset.centreId = event.currentTarget.dataset.centreId; input.click(); }
        return;
      }
      if (action === "set-centre-admin" || action === "set-centre-coach") return (async () => { try { await invokePrivileged("dev-console", { action: "update-member-role", centre_id: event.currentTarget.dataset.centreId, user_id: event.currentTarget.dataset.userId, role: action === "set-centre-admin" ? "centre_admin" : "coach" }); await refreshPrivilegedState(); render(); } catch (error) { alert(error.message || "Unable to update centre role."); } })();
      if (action === "renew-centre") return (async () => { try { await invokePrivileged("dev-console", { action: "renew-licence", centre_id: event.currentTarget.dataset.centreId }); await refreshPrivilegedState(); render(); } catch (error) { alert(error.message || "Unable to renew centre licence."); } })();
      if (action === "connect-drive") return (async () => {
        if (state.auth.role !== "coach") return;
        try {
          driveConnectionError = "";
          const result = await invokePrivileged("google-drive-oauth", { action: "connect", centre_id: state.auth.centreId });
          if (!result?.authorization_url) throw new Error("Google Drive did not return an authorization URL.");
          if (requestedCentre?.slug) sessionStorage.setItem("pendingCentreSlug", requestedCentre.slug);
          window.location.assign(result.authorization_url);
        } catch (error) {
          const message = error.message || "Unable to start Google Drive connection.";
          driveConnectionError = /centre admin role required/i.test(message)
            ? "The Google Drive service still requires a centre admin. Deploy the per-coach google-drive-oauth function and the coach Drive migration, then reconnect from this coach account."
            : message;
          render();
        }
      })();
      if (action === "disconnect-drive") return (async () => {
        if (state.auth.role !== "coach") return;
        if (!confirm("Disconnect your Google Drive? Existing reports remain in your Google account, but the dashboard will no longer be able to load or save them until you reconnect.")) return;
        try {
          await invokePrivileged("google-drive-oauth", { action: "disconnect", centre_id: state.auth.centreId });
          invalidateReportReads();
          await refreshPrivilegedState();
          state.reports = []; state.reportDrafts = {}; reportStoreStatus = "disconnected";
          reportLoadedAt = 0;
          reportStoreError = driveConnectionError || "Connect your Google Drive to view or create your reports.";
          render();
        } catch (error) { alert(error.message || "Unable to disconnect Google Drive."); }
      })();
      if (action === "refresh-reports") {
        refreshReportsInBackground({ force: true });
        return render();
      }
      if (action === "retry-local-sync") return syncLocalDrafts();
      if (action === "export-local-drafts") return (async () => {
        if (!hybridWorkspace) return;
        const local = await hybridWorkspace.snapshot();
        const pendingIds = new Set(local.pending.map(item => item.id));
        const records = local.records.filter(record => pendingIds.has(record.id));
        downloadBlob(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), records }, null, 2)], { type: "application/json" }), "local-report-drafts.json");
      })();
      if (action === "copy-local-draft") return (async () => {
        if (!hybridWorkspace) return;
        try {
          const id = event.currentTarget.dataset.draftId;
          const copy = await hybridWorkspace.copyDraft(id);
          const local = await hybridWorkspace.snapshot();
          applyReportRecords(local.records, getReportCentreId());
          if (wizardDraftId === id) wizardDraftId = copy.id;
          scheduleHybridSync();
          render();
        } catch (error) { alert(error.message); }
      })();
      if (action === "clear-report-cache") return (async () => {
        if (!hybridWorkspace) return;
        await hybridWorkspace.clearSynced();
        hybridCacheLoadedScope = "";
        updateHybridNotice();
      })();
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
      if (action === "confirm-report-start") return confirmReportStart();
      if (action === "save-close-wizard") return closeWizard();
      if (action === "wizard-save-draft") return saveWizardDraftNow(event.currentTarget);
      if (action === "wizard-next") return advanceWizard();
      if (action === "wizard-back") return retreatWizard();
      if (action === "wizard-go-step") return goToWizardStep(event.currentTarget.dataset.step);
      if (action === "wizard-generate") return finalizeWizard();
      if (action === "pick-student") return pickStudent(event.currentTarget.dataset.studentId);
      if (action === "view-report") return openReportView(event.currentTarget.dataset.reportId);
      if (action === "continue-report-draft") {
        const draftId = event.currentTarget.dataset.draftId;
        if (!state.reportDrafts[draftId] || reportStoreStatus !== "ready") return;
        wizardDraftId = draftId;
        return render();
      }
      if (action === "close-report-view") return navigate("reports");
      if (action === "download-report-pdf") return downloadReportPdf();
      if (action === "download-report-png") return downloadReportPng();
      if (action === "retry-report-pdf") {
        const report = state.reports.find(item => item.id === state.ui.reportViewId);
        if (report) return syncReportToDrive(report);
      }
      if (action === "share-report-whatsapp") return shareReportToWhatsApp();
      if (action === "replace-certificate-logo") return triggerCertificateLogoUpload();
      if (action === "save-report-layout") {
        const coach = getCurrentCoach();
        if (!coach) return;
        return saveReportLayout(coach);
      }
      if (action === "edit-certificate-heading") {
        editCertificateHeading(selectedReportOverlay);
        return;
      }
      if (action === "restore-certificate-heading") {
        restoreCertificateHeading(selectedReportOverlay);
        return;
      }
      if (action === "toggle-report-layout") { reportLayoutEditing = !reportLayoutEditing; return render(); }
      if (action === "reset-report-layout") {
        const coach = getCurrentCoach();
        coach.reportLayout = resetLayoutPositions(getReportLayout(coach));
        return saveReportLayout(coach);
      }
      if (["toggle-certificate-layer", "lower-certificate-layer", "raise-certificate-layer"].includes(action)) {
        const coach = getCurrentCoach();
        const layout = getReportLayout(coach);
          const target = layout[selectedReportOverlay] || (layout.layers || []).find(layer => layer.id === selectedReportOverlay);
        if (!target) return;
        if (action === "toggle-certificate-layer") target.visible = target.visible === false;
        if (action === "lower-certificate-layer") target.zIndex = Math.max(1, Number(target.zIndex || 20) - 1);
        if (action === "raise-certificate-layer") target.zIndex = Number(target.zIndex || 20) + 1;
        coach.reportLayout = layout;
        return saveReportLayout(coach);
      }
      if (["toggle-certificate-lock", "duplicate-certificate-layer", "delete-certificate-layer"].includes(action)) {
        const coach = getCurrentCoach();
        const layout = getReportLayout(coach);
          const index = (layout.layers || []).findIndex(layer => layer.id === selectedReportOverlay);
        const selectedLayer = index >= 0 ? layout.layers[index] : null;
        const target = layout[selectedReportOverlay] || selectedLayer;
        if (!target) return;
        if (action === "toggle-certificate-lock") {
          target.locked = target.locked !== true;
        } else if (action === "duplicate-certificate-layer" && selectedLayer && (selectedLayer.id.startsWith("custom-") || selectedLayer.type === "text")) {
          const copy = { ...selectedLayer, id: `custom-${Date.now()}`, name: `${selectedLayer.name || "Layer"} copy`, left: Math.min(100 - (Number(selectedLayer.width) || 10), (Number(selectedLayer.left) || 0) + 2), top: Math.min(100 - (Number(selectedLayer.height) || 8), (Number(selectedLayer.top) || 0) + 2), zIndex: Math.max(...layout.layers.map(layer => Number(layer.zIndex) || 1), 1) + 1, locked: false };
          layout.layers.push(copy);
          selectedReportOverlay = copy.id;
        } else if (action === "delete-certificate-layer" && selectedLayer && (selectedLayer.id.startsWith("custom-") || selectedLayer.type === "text")) {
          if (selectedLayer.id.startsWith("custom-")) layout.layers.splice(index, 1);
          else selectedLayer.visible = false;
          selectedReportOverlay = layout.layers[0]?.id || "date";
        } else {
          return;
        }
        coach.reportLayout = layout;
        return saveReportLayout(coach);
      }
      if (action === "add-certificate-image") {
        certificateUploadToLibrary = true;
        certificateLogoUploadTarget = null;
        document.getElementById("hiddenCertificateUpload")?.click();
        return;
      }
      if (["add-certificate-text", "add-certificate-shape", "add-certificate-frame"].includes(action)) {
        const coach = getCurrentCoach();
        const layout = getReportLayout(coach);
        const id = `custom-${Date.now()}`;
        const type = action === "add-certificate-text" ? "text" : action === "add-certificate-shape" ? "shape" : "image";
        layout.layers.push({ id, name: type === "text" ? "New text" : type === "shape" ? "Rectangle" : "New image", type, text: "", left: 38, top: 40, width: 24, height: 8, visible: true, zIndex: layout.layers.length + 2, fontFamily: "Arial", fontSize: 2.2, color: "#111111", fill: "transparent", opacity: 1 });
        coach.reportLayout = layout; selectedReportOverlay = id;
        return saveReportLayout(coach).then(() => {
          if (type === "text") requestAnimationFrame(() => {
            const item = document.querySelector(`[data-overlay-id="${id}"]`);
            if (item) beginCertificateTextEditing(item);
          });
        });
      }
      if (action === "upload-admin-photo") return triggerProfileUpload("admin");
      if (action === "upload-coach-photo") return triggerProfileUpload("coach");
      if (action === "save-admin-profile") return saveAdminProfile();
      if (action === "save-coach-profile") return saveCoachProfile();
      if (action === "add-centre-link") {
        if (state.auth.role === "coach") {
          const coach = getCurrentCoach();
          coach.links = [...(coach.links || []), { id: crypto.randomUUID ? crypto.randomUUID() : `link-${Date.now()}`, title: "", url: "", icon: "↗", visible: true, order: (coach.links || []).length + 1 }];
        } else {
          state.centreProfile.links.push({ id: crypto.randomUUID ? crypto.randomUUID() : `link-${Date.now()}`, label: "", url: "" });
        }
        return render();
      }
      if (action === "delete-centre-link") {
        const linkId = event.currentTarget.dataset.linkId;
        if (state.auth.role === "coach") {
          const coach = getCurrentCoach();
          coach.links = (coach.links || []).filter(link => link.id !== linkId);
        } else {
          state.centreProfile.links = state.centreProfile.links.filter(link => link.id !== linkId);
        }
        return render();
      }
      if (action === "save-centre-profile") return saveCentreProfileFromInputs();
      if (action === "preview-qr-page") return openQrPagePreview();
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
      syncReportStatusChips();
      const statusFilter = document.getElementById("reportsStatusFilter")?.value || "";
      const studentFilter = document.getElementById("reportsStudentFilter")?.value || "";
      const monthFilter = document.getElementById("reportsMonthFilter")?.value || "";
      const dateFrom = document.getElementById("reportsDateFrom")?.value || "";
      const dateTo = document.getElementById("reportsDateTo")?.value || "";

      const drafts = Object.values(state.reportDrafts)
        .filter(draft => state.auth.role !== "coach" || draft.coachId === state.auth.coachId)
        .map(draft => ({
          isDraft: true,
          id: draft.id,
          ref: draft.ref || "Untitled report",
          studentId: draft.studentId,
          coachId: draft.coachId,
          lessonLabel: "",
          lessonNumber: draft.lessonNumber,
          date: draft.date || "",
          time: draft.time || "",
          status: "Draft"
        }));
      let rows = [...getVisibleReports(), ...drafts].filter(report => {
        const student = getStudentById(report.studentId);
        const coach = getCoachById(report.coachId);
        const searchOk = !search || [report.ref, student?.name || "", coach?.name || "", report.lessonLabel, `Lesson ${report.lessonNumber}`].join(" ").toLowerCase().includes(search);
        const statusOk = !statusFilter || report.status === statusFilter;
        const studentOk = !studentFilter || report.studentId === studentFilter;
        const dateOk = !dateFilter || withinDateBucket(report.date, dateFilter, dateFrom, dateTo, monthFilter);
        return searchOk && statusOk && studentOk && dateOk;
      });
      rows.sort((a, b) => `${b.date || ""}T${b.time || ""}`.localeCompare(`${a.date || ""}T${a.time || ""}`));

      tbody.innerHTML = rows.map(report => {
        const student = getStudentById(report.studentId);
        const coach = getCoachById(report.coachId);
        return `
          <tr>
            <td class="cell-ref">${escapeHtml(report.ref)}</td>
            <td class="cell-student"><div class="person-cell">${avatarMarkup(student?.name || "?", student?.photo)}<span class="person-cell-copy"><strong>${escapeHtml(student?.name || "Not selected")}</strong><small class="row-sub">${report.lessonNumber ? `Lesson ${escapeHtml(report.lessonNumber)}` : "No lesson"}${report.date ? ` · ${escapeHtml(formatShortDate(report.date))}, ${formatTime(report.time)}` : ""}</small></span></div></td>
            ${state.auth.role === "coach" ? "" : `<td class="cell-coach">${escapeHtml(coach?.name || "Unknown")}</td>`}
            <td class="cell-lesson">${report.lessonNumber ? `Lesson ${escapeHtml(report.lessonNumber)}` : "—"}</td>
            <td class="cell-date">${report.date ? `${escapeHtml(formatShortDate(report.date))}, ${formatTime(report.time)}` : "—"}</td>
            <td class="cell-status">${statusBadge(report.status)}</td>
            <td class="cell-action">${report.isDraft
              ? `<button class="primary-btn table-finish-btn" data-action="continue-report-draft" data-draft-id="${escapeHtml(report.id)}" aria-label="Continue draft">Finish</button>`
              : `<button class="icon-btn" data-action="view-report" data-report-id="${escapeHtml(report.id)}" aria-label="View report"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button>`}</td>
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

      const lastReportDateByStudent = {};
      getVisibleReports().forEach(report => {
        if (!lastReportDateByStudent[report.studentId] || report.date > lastReportDateByStudent[report.studentId]) lastReportDateByStudent[report.studentId] = report.date;
      });
      tbody.innerHTML = visibleStudents.map(student => {
        const coach = getCoachById(student.coachId);
        const last = lastReportDateByStudent[student.id];
        return `
          <tr class="student-card-row">
            <td class="student-card" colspan="7">
              <div class="student-card-top">
                ${avatarMarkup(student.name, student.photo)}
                <div class="student-card-name"><strong>${escapeHtml(student.name)}</strong><small>${student.parentHp ? escapeHtml(student.parentHp) : "No parent phone"}</small></div>
              </div>
              <dl class="student-card-facts">
                <div><dt>Lessons</dt><dd>${escapeHtml(student.lessons)}</dd></div>
                <div><dt>Last report</dt><dd>${last ? escapeHtml(formatShortDate(last)) : "—"}</dd></div>
                ${state.auth.role === "admin" ? `<div><dt>Coach</dt><dd>${escapeHtml(coach?.name || "—")}</dd></div>` : ""}
              </dl>
              <div class="photo-cell">
                ${student.photo
                  ? `<span class="badge green"><span class="dot"></span>Photo added</span>`
                  : `<button class="upload-chip" data-action="student-upload" data-student-id="${student.id}">+ Upload photo</button>`}
              </div>
              <div class="student-card-actions">
                <button class="secondary-btn" data-action="student-edit" data-student-id="${student.id}">Edit</button>
                ${state.auth.role && state.auth.role !== "dev" ? `<button class="primary-btn" data-action="new-report">New report</button>` : ""}
              </div>
            </td>
          </tr>
        `;
      }).join("") || `<tr class="student-card-row"><td class="student-card student-card-empty" colspan="7">No students found.</td></tr>`;
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

    async function saveStudentEdit() {
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
      try {
        const savedStudent = await saveStudentRecord(student);
        state.students = state.students.map(item => item.id === savedStudent.id ? savedStudent : item);
        studentEditModal = null;
        persist();
        render();
      } catch (error) {
        alert(error.message || "Unable to save student.");
      }
    }

    function renderReportLayoutToolbar(coach) {
      const reportLayout = getReportLayout(coach);
      if(state.ui.page==="certificate-design"&&studioView==="editor")return renderCertificateEditorToolbar({layout:reportLayout,selectedId:selectedReportOverlay,escape:escapeHtml});
      const layout = reportLayout[selectedReportOverlay] || (reportLayout.layers || []).find(layer => layer.id === selectedReportOverlay);
      if (!layout) return `<div class="report-layout-toolbar is-empty" aria-hidden="true"></div>`;
      const selectedLayer = (reportLayout.layers || []).find(layer => layer.id === selectedReportOverlay);
      const isCustomLayer = Boolean(selectedLayer?.id?.startsWith("custom-"));
      const isHeading = Object.prototype.hasOwnProperty.call(ARTWORK_EDITABLE_TEXT, selectedReportOverlay);
      const isTextLayer = Boolean(reportLayout[selectedReportOverlay] || selectedLayer?.type?.includes("text") || typeof selectedLayer?.textOverride === "string");
      return `<div class="report-layout-toolbar">
        <label class="toolbar-text toolbar-meta-field"><span>Name</span><input type="text" data-layout-name value="${escapeHtml(layout.name || selectedLayer?.name || selectedReportOverlay)}" aria-label="Element name" maxlength="80"></label>
        ${isTextLayer ? `<label class="toolbar-font"><span class="sr-only">Font</span><select data-layout-font aria-label="Font family">${["Arial", "Kalam", "Outfit", "Montserrat", "Lato", "Georgia", "Cinzel Decorative"].map(font => `<option ${(layout.fontFamily || ARTWORK_TEXT_STYLE[selectedReportOverlay]?.fontFamily) === font ? "selected" : ""}>${font}</option>`).join("")}</select></label><div class="toolbar-font-stepper" aria-label="Font size"><button type="button" data-font-step="-0.1" aria-label="Decrease font size">−</button><input type="number" min="0.6" max="8" step="0.1" data-layout-size value="${layout.fontSize ?? ARTWORK_TEXT_STYLE[selectedReportOverlay]?.fontSize ?? 2}" aria-label="Font size"><button type="button" data-font-step="0.1" aria-label="Increase font size">+</button></div><label class="toolbar-colour" title="Text colour"><span class="sr-only">Text colour</span><span class="toolbar-colour-letter" aria-hidden="true">A</span><input type="color" data-layout-color value="${layout.color || ARTWORK_TEXT_STYLE[selectedReportOverlay]?.color || "#111111"}"></label><span class="toolbar-format-group" role="group" aria-label="Text formatting"><button type="button" class="toolbar-format-button ${Number(layout.fontWeight ?? ARTWORK_TEXT_STYLE[selectedReportOverlay]?.fontWeight) >= 600 ? "is-active" : ""}" data-text-format="bold" aria-label="Bold">B</button><button type="button" class="toolbar-format-button ${(layout.fontStyle || ARTWORK_TEXT_STYLE[selectedReportOverlay]?.fontStyle) === "italic" ? "is-active" : ""}" data-text-format="italic" aria-label="Italic"><em>I</em></button><button type="button" class="toolbar-format-button ${(layout.textDecoration || ARTWORK_TEXT_STYLE[selectedReportOverlay]?.textDecoration) === "underline" ? "is-active" : ""}" data-text-format="underline" aria-label="Underline"><u>U</u></button></span>` : ""}
        <span class="toolbar-divider" aria-hidden="true"></span>
        ${Object.prototype.hasOwnProperty.call(ARTWORK_EDITABLE_TEXT, selectedReportOverlay) ? '<button type="button" class="certificate-icon-action" data-action="edit-certificate-heading" title="Edit heading text" aria-label="Edit heading text">Edit text</button><button type="button" class="certificate-icon-action" data-action="restore-certificate-heading" title="Reset heading to the default wording" aria-label="Reset heading wording">Reset wording</button>' : ""}
        <span class="toolbar-divider" aria-hidden="true"></span>
        <button class="certificate-icon-action" data-action="lower-certificate-layer" title="Send backward" aria-label="Send backward">↓</button>
          <button class="certificate-icon-action" data-action="raise-certificate-layer" title="Bring forward" aria-label="Bring forward">↑</button>
          <button class="certificate-icon-action" data-action="toggle-certificate-lock" title="${layout.locked === true ? "Unlock" : "Lock"}" aria-label="${layout.locked === true ? "Unlock" : "Lock"}">${layout.locked === true ? "Unlock" : "Lock"}</button>
          ${isCustomLayer || isHeading ? `<button type="button" class="certificate-icon-action" data-action="duplicate-certificate-layer" title="Duplicate" aria-label="Duplicate">Duplicate</button><button type="button" class="certificate-icon-action is-danger" data-action="delete-certificate-layer" title="Delete" aria-label="Delete">Delete</button>` : ""}
          <button class="certificate-icon-action" data-action="toggle-certificate-layer">${layout.visible === false ? "Show" : "Hide"}</button>
      </div>`;
    }

    function scheduleDraftSave(draft) {
      dirtyReportDraftId = draft.id;
      const revision = (draftRevisions.get(draft.id) || 0) + 1;
      draftRevisions.set(draft.id, revision);
      updateReportSaveStatus(isCertificatePreview ? "Preview" : "Saving…");
      clearTimeout(draftSaveTimer);
      draftSaveTimer = window.setTimeout(() => {
        draftSaveTimer = null;
        const current = state.reportDrafts[draft.id];
        if (!current) return;
        saveReportRecord({ ...current, recordType: "draft" }, { centreId: current.centreId || getReportCentreId() })
          .then(() => {
            if (draftRevisions.get(draft.id) === revision && !draftSaveTimer) dirtyReportDraftId = "";
            updateReportSaveStatus(reportSaveMessage());
          })
          .catch(() => {});
      }, reportLocalStore ? 200 : 500);
    }

    async function flushDraftSave(draft) {
      const scope = reportReadScope();
      clearTimeout(draftSaveTimer);
      draftSaveTimer = null;
      const revision = draftRevisions.get(draft.id) || 0;
      dirtyReportDraftId = draft.id;
      const saved = await saveReportRecord({ ...draft, recordType: "draft" }, { centreId: draft.centreId || getReportCentreId() });
      if (scope !== reportReadScope()) return saved;
      if (draftRevisions.get(draft.id) === revision && !draftSaveTimer) dirtyReportDraftId = "";
      updateReportSaveStatus(reportSaveMessage());
      return saved;
    }

    window.addEventListener("beforeunload", event => {
      if (!dirtyReportDraftId && !draftSaveTimer) return;
      event.preventDefault();
      event.returnValue = "";
    });
    window.addEventListener("online", () => {
      if (hybridWorkspace) refreshPrivilegedState().catch(() => {}).then(() => syncLocalDrafts());
    });
    window.addEventListener("offline", () => updateHybridNotice());
    if (typeof document !== "undefined") document.addEventListener?.("visibilitychange", () => {
      if (document.visibilityState === "visible" && hybridWorkspace) syncLocalDrafts();
    });

    async function startReportFlow() {
      if (!state.auth.role || state.auth.role === "dev") return;
      if (isCertificatePreview) {
        reportStoreStatus = "ready";
        return createReportDraft(getCurrentCoach());
      }
      if (reportLoadPromise || reportStoreStatus === "loading") await loadReportsFromDrive();
      if (state.auth.role === "admin" && !activeReportCentreId) {
        state.ui.page = "reports";
        await loadReportsFromDrive();
        render();
        return;
      }
      const driveConnected = state.auth.role !== "coach" || state.driveConnection?.status === "connected";
      const hasLocalDraft = hybridWorkspace && Object.values(state.reportDrafts).some(draft => draft.coachId === state.auth.coachId);
      const listUnavailable = reportStoreStatus === "error" && reportStoreError === "Google Drive returned an invalid report list";
      if ((!driveConnected && !hasLocalDraft) || (reportStoreStatus !== "ready" && !listUnavailable)) {
        alert(reportStoreError || "Connect Google Drive and wait for reports to load before starting a report.");
        return;
      }
      // A stale function deployment may fail only while listing old records.
      // New drafts and finalized reports still use the authenticated Drive
      // save actions, so let connected users continue creating a report.
      if (listUnavailable) reportStoreStatus = "ready";
      if (state.auth.role !== "coach" && getReportCoaches().length === 0) {
        alert("No coaches have connected their own Google Drive yet. Ask a coach to connect from their dashboard settings.");
        return;
      }
      if (state.auth.role !== "coach") {
        reportStartOpen = true;
        return render();
      }
      return createReportDraft(getCurrentCoach());
    }

    async function createReportDraft(coach) {
      if (!coach?.id || !getReportCoaches().some(candidate => candidate.id === coach.id)) return;
      const reusableDraft = Object.values(state.reportDrafts)
        .filter(draft => draft.coachId === coach.id && !draft.studentId)
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.time || "").localeCompare(String(a.time || "")))[0];
      if (reusableDraft) {
        wizardDraftId = reusableDraft.id;
        render();
        return;
      }
      const now = new Date();
      const id = `draft-${crypto.randomUUID()}`;
      const refNumber = state.reports.length + Object.keys(state.reportDrafts).length + 1;
      state.reportDrafts[id] = {
        schemaVersion: 1,
        recordType: "draft",
        id,
        ref: `DSM-26-${String(refNumber).padStart(4, "0")}`,
        centreId: getReportCentreId(),
        coachId: coach.id,
        studentId: "",
        date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
        time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        lessonNumber: "",
        step: 1,
        status: "Pending",
        summary: blankSummary()
      };
      ensureDraftCertificateDesign(state.reportDrafts[id]);
      wizardDraftId = id;
      render();
      flushDraftSave(state.reportDrafts[id]).catch(error => {
        reportStoreError = error.message || "Unable to save report draft.";
        updateReportSaveStatus(reportStoreError);
      });
    }

    function confirmReportStart() {
      const coachId = document.getElementById("reportStartCoach")?.value || "";
      const coach = getReportCoaches().find(item => item.id === coachId);
      if (!coach) {
        alert("Select a coach before continuing.");
        return;
      }
      reportStartOpen = false;
      return createReportDraft(coach);
    }

    function updateWizardDraftFromInputs({ schedule = true } = {}) {
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
      if (schedule) scheduleDraftSave(draft);
    }

    function pickStudent(studentId) {
      const draft = state.reportDrafts[wizardDraftId];
      if (!draft) return;
      const student = getStudentById(studentId);
      if (!student || student.coachId !== draft.coachId) return;
      draft.studentId = studentId;
      draft.lessonNumber = (Number(student.lessons) || 0) + 1;
      render();
      flushDraftSave(draft).catch(error => {
        reportStoreError = error.message || "Unable to save report draft.";
        updateReportSaveStatus(reportStoreError);
      });
    }

    function changeWizardStep(nextStep) {
      const draft = state.reportDrafts[wizardDraftId];
      if (!draft) return;
      updateWizardDraftFromInputs({ schedule: false });
      const previousStep = draft.step;
      draft.step = nextStep;
      render();
      flushDraftSave(draft).catch(error => {
        draft.step = previousStep;
        reportStoreError = error.message || "Unable to save report draft.";
        render();
      });
    }

    function advanceWizard() {
      const draft = state.reportDrafts[wizardDraftId];
      if (!draft) return;
      updateWizardDraftFromInputs({ schedule: false });
      if (draft.step === 1 && !draft.studentId) {
        alert("Select a student before continuing.");
        return;
      }
      if (draft.step === 2 && (!draft.date || !draft.time || !draft.lessonNumber)) {
        alert("Complete date, time and lesson number.");
        return;
      }
      return changeWizardStep(Math.min(4, draft.step + 1));
    }

    function retreatWizard() {
      const draft = state.reportDrafts[wizardDraftId];
      if (!draft) return;
      return changeWizardStep(Math.max(1, draft.step - 1));
    }

    function goToWizardStep(targetStep) {
      const draft = state.reportDrafts[wizardDraftId];
      const nextStep = Number(targetStep);
      if (!draft || !Number.isInteger(nextStep) || nextStep < 1 || nextStep > draft.step) return;
      return changeWizardStep(nextStep);
    }

    async function finalizeWizard() {
      if (reportGenerating) return;
      const draft = state.reportDrafts[wizardDraftId];
      if (!draft) return;
      const finalScope = reportReadScope();
      const finalGeneration = reportLoadGeneration;
      updateWizardDraftFromInputs({ schedule: false });
      if (!draft.studentId) {
        alert("Select a student first.");
        return;
      }
      const reportId = `report-${draft.id.slice("draft-".length)}`;
      const finalReport = {
        schemaVersion: 1,
        recordType: "report",
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
        certificateDesign: structuredClone(ensureDraftCertificateDesign(draft)),
        summary: { ...draft.summary }
      };
      clearTimeout(draftSaveTimer);
      draftSaveTimer = null;
      reportGenerating = true;
      // Keep the confirmed snapshot stable while its draft/report is uploading.
      document.querySelectorAll("#wizardModal input, #wizardModal textarea, #wizardModal select, #wizardModal button").forEach(control => { control.disabled = true; });
      document.getElementById("wizardModal")?.setAttribute("aria-busy", "true");
      document.querySelector('[data-action="wizard-generate"]')?.setAttribute("disabled", "");
      dirtyReportDraftId = draft.id;
      let savedReport;
      try {
        // A pending draft write must finish before finalization removes it.
        if (!isCertificatePreview && ensureHybridWorkspace()) {
          await flushDraftSave(draft);
          if (navigator.onLine === false) throw new Error("This draft is saved on this device. Go online to sync and generate the report.");
          await hybridWorkspace.confirmDraft(draft.id);
        } else await reportWriteQueues.get(draft.id);
        if (finalScope !== reportReadScope() || finalGeneration !== reportLoadGeneration) return;
        savedReport = await saveReportRecord(finalReport, { draftId: draft.id, centreId: draft.centreId || getReportCentreId() });
      } catch (error) {
        if (finalScope !== reportReadScope() || finalGeneration !== reportLoadGeneration) return;
        reportStoreError = error.message || "Sync this draft to Google Drive before generating the report.";
        reportGenerating = false;
        render();
        return;
      }
      if (finalScope !== reportReadScope() || finalGeneration !== reportLoadGeneration) return;
      state.reports.unshift({ ...normalizeReport(savedReport), centreId: draft.centreId || getReportCentreId() });
      if (hybridWorkspace) {
        try { await hybridWorkspace.complete(savedReport, draft.id); }
        catch (error) { hybridLocalError = `Report saved to Drive; local cache update failed: ${error.message}`; }
      }
      delete state.reportDrafts[draft.id];
      dirtyReportDraftId = "";
      const student = getStudentById(draft.studentId);
      if (student && !isCertificatePreview) {
        student.lessons = Math.max(Number(student.lessons) || 0, finalReport.lessonNumber);
        try {
          const savedStudent = await saveStudentRecord(student);
          state.students = state.students.map(item => item.id === savedStudent.id ? savedStudent : item);
        } catch (error) {
          console.warn("Report saved to Drive, but the student lesson count was not updated", error);
        }
      }
      wizardDraftId = null;
      reportGenerating = false;
      reportLayoutEditing = false;
      state.ui.page = "report-view";
      state.ui.reportViewId = reportId;
      persist();
      render();
      if (!isCertificatePreview) window.requestAnimationFrame(() => syncReportToDrive(savedReport));
    }

    // Save button on steps 2–4: saves now and keeps the report open.
    async function saveWizardDraftNow(button) {
      const draft = state.reportDrafts[wizardDraftId];
      if (!draft) return;
      updateWizardDraftFromInputs({ schedule: false });
      if (button) { button.disabled = true; button.textContent = "Saving…"; }
      try {
        await flushDraftSave(draft);
        updateReportSaveStatus("Saved");
        if (button) { button.textContent = "Saved ✓"; setTimeout(() => { button.textContent = "Save"; button.disabled = false; }, 1500); }
      } catch (error) {
        updateReportSaveStatus(error?.message || "Couldn't save. Please try again.", true);
        if (button) { button.textContent = "Save"; button.disabled = false; }
      }
    }

    async function closeWizard() {
      if (reportStartOpen && !wizardDraftId) {
        reportStartOpen = false;
        return render();
      }
      const draft = state.reportDrafts[wizardDraftId];
      if (!draft) return;
      updateWizardDraftFromInputs({ schedule: false });
      try {
        await flushDraftSave(draft);
        wizardDraftId = null;
        render();
      } catch {
        render();
      }
    }

    function openReportView(reportId) {
      reportLayoutEditing = false;
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
          clonedReportTemplate.querySelectorAll(".certificate-resize-handle, .certificate-object-toolbar").forEach(control => control.remove());
          clonedReportTemplate.querySelectorAll(".report-overlay-item").forEach(item => {
            item.classList.remove("is-selected", "is-editing", "is-text-editing", "is-dragging", "has-object-tools");
            item.style.outline = "none";
            item.style.boxShadow = "none";
          });
          clonedReportTemplate.querySelectorAll("[contenteditable]").forEach(item => item.removeAttribute("contenteditable"));
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
            // Circle frames stay round in the download (square box).
            const frameHeight = frame.closest(".template-photo-card.is-circle") ? photoCardWidthPx : photoCardHeightPx;
            frame.style.width = "100%";
            frame.style.height = `${frameHeight}px`;
            frame.style.minHeight = `${frameHeight}px`;
            frame.style.maxHeight = `${frameHeight}px`;
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

    async function syncReportToDrive(report) {
      const centreId = report?.centreId || getReportCentreId();
      if (!reportRepository || !centreId || (state.auth.role === "coach" && state.driveConnection?.status !== "connected")) return;
      try {
        const canvas = await getReportExportCanvas(report);
        const jsPDF = await getJsPdfLib();
        const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [canvas.width, canvas.height], hotfixes: ["px_scaling"] });
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
        const blob = pdf.output("blob");
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Unable to prepare report for Drive"));
          reader.readAsDataURL(blob);
        });
        await reportRepository.savePdf(report.id, dataUrl, { centreId, coachId: report.coachId });
        reportPdfError = "";
        if (state.auth.role === "coach") state.driveConnection = { ...state.driveConnection, status: "connected", last_successful_sync_at: new Date().toISOString(), last_error: null };
      } catch (error) {
        reportPdfError = error.message || "Report saved, but its PDF could not be saved to Google Drive.";
        console.warn("Unable to save report PDF to Google Drive", error);
        if (state.ui.page === "report-view") scheduleRender();
      }
    }

    // Shows the page parents see after scanning the QR, using the links typed
    // on screen right now (saved or not). Built straight into the DOM so the
    // settings form keeps any unsaved edits.
    function openQrPagePreview() {
      document.querySelector(".qr-preview-overlay")?.remove();
      const coach = getCurrentCoach();
      const coachPhoto = safeImageUrl(coach.photo || coach.photo_url);
      const links = [...document.querySelectorAll(".centre-link-row")].map((row, index) => ({
        title: row.querySelector('[data-link-field="label"]')?.value.trim() || "",
        url: row.querySelector('[data-link-field="url"]')?.value.trim() || "",
        visible: true,
        order: index + 1
      }));
      const typedLinks = links.filter(link => link.title || link.url);
      const validLinks = publicCoachLinks(links);
      const skipped = typedLinks.length - validLinks.length;
      const useExamples = !validLinks.length;
      const exampleLinks = [
        { title: "Facebook", url: "https://facebook.com/", visible: true, order: 1 },
        { title: "WhatsApp me", url: "https://wa.me/", visible: true, order: 2 },
        { title: "Instagram", url: "https://instagram.com/", visible: true, order: 3 }
      ];
      const page = {
        name: coach.name,
        photo: coachPhoto || onboardingIllustration("coach"),
        role: "Coach",
        bio: coach.bio || "",
        centre_name: requestedCentre?.name || "",
        centre_logo: requestedCentre?.logo_url || "",
        links: useExamples ? exampleLinks : validLinks
      };
      const notes = [
        coachPhoto ? "" : "Sample photo shown: add your own photo in Profile.",
        useExamples ? "Example links shown: add your own links and press Save." : "",
        !useExamples && skipped > 0 ? `${skipped} link${skipped === 1 ? " is" : "s are"} hidden because ${skipped === 1 ? "it is" : "they are"} not a full web address (https://...).` : "",
        !useExamples ? "Remember to press Save." : ""
      ].filter(Boolean).join(" ");
      const overlay = document.createElement("div");
      overlay.className = "qr-preview-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "How QR looks like");
      overlay.innerHTML = `
        <div class="qr-preview-box">
          <div class="qr-preview-top"><strong>How QR looks like</strong><button type="button" class="qr-preview-close" aria-label="Close preview">&times;</button></div>
          <p class="qr-preview-note">This is the page that opens when a parent scans the QR on a report. ${escapeHtml(notes)}</p>
          <div class="qr-preview-phone"><div class="qr-preview-screen">${renderCoachLinkPage({ status: "ready", page })}</div></div>
        </div>`;
      const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey); };
      const onKey = event => { if (event.key === "Escape") close(); };
      overlay.addEventListener("click", event => { if (event.target === overlay || event.target.closest(".qr-preview-close")) close(); });
      overlay.querySelectorAll(".qr-preview-screen a").forEach(link => link.addEventListener("click", event => event.preventDefault()));
      document.addEventListener("keydown", onKey);
      document.body.appendChild(overlay);
      overlay.querySelector(".qr-preview-close")?.focus();
    }

    async function saveCentreProfileFromInputs() {
      const links = [...document.querySelectorAll(".centre-link-row")].map(row => ({
        id: row.dataset.linkId || `link-${Date.now()}-${Math.random()}`,
        label: row.querySelector('[data-link-field="label"]')?.value.trim() || "",
        url: row.querySelector('[data-link-field="url"]')?.value.trim() || ""
      }));
      if (state.auth.role === "coach") {
        const coach = getCurrentCoach();
        coach.links = links.map((link, index) => ({
          id: link.id,
          title: link.label,
          url: link.url,
          icon: "↗",
          visible: true,
          order: index + 1
        }));
        try {
          const savedCoach = await saveCoachRecord(coach);
          state.coaches = state.coaches.map(item => item.id === savedCoach.id ? savedCoach : item);
          const button = document.querySelector('[data-action="save-centre-profile"]');
          if (button) {
            button.textContent = "Saved";
            window.setTimeout(() => { if (button.isConnected) button.textContent = "Save"; }, 1500);
          }
        } catch (error) {
          alert(error.message || "Unable to save coach links.");
        }
        return;
      }
      state.centreProfile = { links };
      try {
        await saveCentreProfile();
        const button = document.querySelector('[data-action="save-centre-profile"]');
        if (button) {
          button.textContent = "Saved";
          window.setTimeout(() => { if (button.isConnected) button.textContent = "Save"; }, 1500);
        }
      } catch (error) {
        alert(error.message || "Unable to save centre links.");
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

    async function downloadReportPng() {
      const report = state.reports.find(item => item.id === state.ui.reportViewId) || getCertificateDesignPreviewReport(getCurrentCoach());
      if (!report) return;
      const canvas = await renderReportCanvas();
      canvas.toBlob(blob => { if (blob) downloadBlob(blob, `${report.ref || report.id}-training-report.png`); }, "image/png");
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

    function triggerCertificateLogoUpload() {
      certificateUploadToLibrary = false;
      certificateLogoUploadTarget = "brand-logo-art";
      document.getElementById("hiddenCertificateUpload")?.click();
    }

    async function replaceCertificateLogo(file, targetId = "brand-logo-art") {
      const coach = getCurrentCoach();
      if (!coach) return;
      try {
        const url = await uploadProfileImage(file, "certificate", coach.id);
        const layout = getReportLayout(coach);
        const layer = (layout.layers || []).find(entry => entry.id === targetId);
        if (!layer) throw new Error("The logo layer is unavailable.");
        addCertificateUpload(layout, url, file.name);
        layer.source = url;
        layer.objectFit = "contain";
        layer.objectPosition = "center";
        layer.textOverride = "";
        selectedReportOverlay = targetId;
        coach.reportLayout = layout;
        await saveReportLayout(coach);
        render();
      } catch (error) {
        alert(error.message || "Unable to replace logo.");
      }
    }

    function shareReportToWhatsApp() {
      const report = state.reports.find(item => item.id === state.ui.reportViewId);
      if (!report) return;
      const student = getStudentById(report.studentId);
      const coach = getCoachById(report.coachId);
      const text = `Training report ${report.ref || report.id}\nStudent: ${student?.name || "Student"}\nLesson ${report.lessonNumber} · ${formatDate(report.date)}\nCoach: ${coach?.name || "Coach"}\n${window.location.origin}/reports`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    }

    async function uploadProfileImage(file, kind, recordId) {
      if (isCertificatePreview) return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Unable to read this image."));reader.readAsDataURL(file);});
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

    // ---------- Coach onboarding helpers ----------
    // Strict lookup: never fall back to another coach's record.
    function getOnboardingCoach() {
      return state.coaches.find(coach => coach.id === state.auth.coachId) || null;
    }

    function renderCoachOnboarding(app) {
      const onboarding = getCoachOnboarding();
      onboarding.rememberFocus();
      app.innerHTML = onboarding.render();
      onboarding.attach(app);
      fitCustomCertificateHeadingText();
      hydrateQrImages();
      if (document.fonts?.ready) {
        void document.fonts.ready.then(() => requestAnimationFrame(() => fitCustomCertificateHeadingText())).catch(() => {});
      }
    }

    function onboardingAvatar(initials, background) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="${background}"/><circle cx="60" cy="46" r="22" fill="#ffffff" opacity=".9"/><path d="M18 120c4-26 22-40 42-40s38 14 42 40z" fill="#ffffff" opacity=".9"/><text x="60" y="54" text-anchor="middle" font-family="Arial" font-size="20" font-weight="700" fill="${background}">${initials}</text></svg>`;
      return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    }

    // Base: the plain template with no photos or report details.
    // Example: the same template filled in with sample details.
    function onboardingIllustration(kind) {
      const svg = kind === "student"
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#fde7c8"/><circle cx="60" cy="50" r="24" fill="#e9b48a"/><path d="M34 44c3-22 49-22 52 0-9-9-43-9-52 0z" fill="#2b2b2b"/><circle cx="51" cy="52" r="2.6" fill="#2b2b2b"/><circle cx="69" cy="52" r="2.6" fill="#2b2b2b"/><path d="M52 62q8 6 16 0" stroke="#a5523a" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M16 120c5-28 24-40 44-40s39 12 44 40z" fill="#c81e45"/><circle cx="98" cy="84" r="14" fill="#162a4a"/><rect x="94" y="96" width="8" height="18" rx="3" fill="#8b5a2b"/><circle cx="22" cy="78" r="5" fill="#ffffff" stroke="#e2e2e2"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#dbe6f7"/><circle cx="60" cy="48" r="24" fill="#d79b72"/><path d="M36 42c4-20 44-20 48 0-11-7-37-7-48 0z" fill="#1d1d1d"/><circle cx="51" cy="50" r="2.6" fill="#1d1d1d"/><circle cx="69" cy="50" r="2.6" fill="#1d1d1d"/><path d="M52 60q8 6 16 0" stroke="#8a4a32" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M12 120c5-30 26-42 48-42s43 12 48 42z" fill="#162a4a"/><path d="M60 78l-8 16h16z" fill="#c81e45"/></svg>`;
      return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    }

    // base: the empty design, with no photos or QR.
    // example: filled in with sample photos, notes and a QR code.
    // final: the coach's own design, name, photo and QR, with a sample student.
    function renderOnboardingCertificate(templateId, mode, previewId, options = null) {
      const coach = getOnboardingCoach();
      const base = mode === "base";
      const final = mode === "final";
      const layout = final && coach && getReportLayout(coach).templateId === templateId
        ? normalizeReportLayout(layoutSnapshot(getReportLayout(coach)))
        : defaultStudioLayout(templateId);
      if (base) layout.layers.forEach(layer => { if (["student-photo", "coach-photo", "qr"].includes(layer.id)) layer.visible = false; });
      if (options) {
        const qr = layout.layers.find(layer => layer.id === "qr");
        if (qr) qr.visible = options.qrVisible !== false;
        if (options.qrUrl && validStudioQrUrl(options.qrUrl)) layout.qrUrl = options.qrUrl;
      }
      // "Make it yours": the coach's own heading and slogan replace the defaults
      // on the example. Empty boxes keep the default words.
      const brand = options?.brand || null;
      if (brand && !base) {
        const heading = String(brand.heading || "").trim();
        const slogan = String(brand.slogan || "").trim();
        layout.layers.forEach(layer => {
          if (layer.id === "brand-name" && heading) layer.text = heading;
          if (layer.id === "brand-tagline" && slogan) layer.text = slogan;
        });
      }
      if (mode === "example") {
        const qr = layout.layers.find(layer => layer.id === "qr");
        if (qr) qr.visible = true;
        const coachQr = getReportLayout(coach || {}).qrUrl;
        layout.qrUrl = coachQr && !/vercel\.app\/centre$/.test(coachQr) ? coachQr : "https://instagram.com/yourcentre";
      }
      const today = new Date();
      const coachName = coach?.name && coach.name !== "Coach" ? coach.name : "Coach Ahmad";
      const report = base ? {
        id: "onboarding-base",
        coachId: coach?.id || "",
        previewCoach: { name: "", branch: "", centreContact: "", branchAddress: "", photo: "" },
        previewStudent: { name: "", photo: "" },
        date: "", time: "", lessonNumber: 1,
        summary: { whatTaught: "", beforeCoaching: "", afterTraining: "", nextLesson: "", remarks: "" }
      } : {
        id: `onboarding-${mode}`,
        coachId: coach?.id || "",
        previewCoach: {
          name: coachName,
          branch: certificateCentreName() || "Your Centre",
          centreContact: String(brand?.contact || "").trim() || coach?.centreContact || coach?.phone || "+60 12-345 6789",
          branchAddress: String(brand?.address || "").trim() || (coach?.branchAddress && coach.branchAddress !== "Centre address" ? coach.branchAddress : "") || certificateCentreName() || "Your Centre",
          photo: final && coach?.photo ? coach.photo : onboardingIllustration("coach")
        },
        previewStudent: { name: "Mei Sim", photo: onboardingIllustration("student") },
        date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
        time: "10:00",
        lessonNumber: 4,
        summary: {
          whatTaught: "Forehand drive\nFootwork drills",
          beforeCoaching: "Short strokes\nLate to the ball",
          afterTraining: "Full swing\nBetter timing",
          nextLesson: "Backhand push\nServe practice",
          remarks: "Great effort today. Mei kept her focus and her forehand is getting stronger. Keep practising at home."
        }
      };
      const editing = reportLayoutEditing;
      const selection = selectedReportOverlay;
      reportLayoutEditing = false;
      selectedReportOverlay = "";
      try {
        return renderReportTemplate(report, layout, previewId);
      } finally {
        reportLayoutEditing = editing;
        selectedReportOverlay = selection;
      }
    }

    const DEFAULT_QR_URL_PATTERN = /^https:\/\/jom-nittaku-webapp\.vercel\.app\/centre\/?$/;
    function getOnboardingQr() {
      const coach = getOnboardingCoach();
      const layout = getReportLayout(coach || {});
      const layer = layout.layers.find(item => item.id === "qr");
      const pageUrl = coach ? coachPublicUrl(coach) : "";
      const links = publicCoachLinks(coach?.links).map(link => ({ id: link.id, title: link.title, url: link.url }));
      const customUrl = layout.qrUrl && !DEFAULT_QR_URL_PATTERN.test(layout.qrUrl) && layout.qrUrl !== pageUrl ? layout.qrUrl : "";
      const mode = layer?.visible === false ? "none" : customUrl ? "custom" : "page";
      return { mode, url: customUrl, links };
    }

    // mode "page": the QR opens the coach's link page and the links are saved
    // as the page's buttons. "custom": one link. "none": no QR printed.
    async function applyOnboardingQr({ mode, url, links }) {
      const coach = getOnboardingCoach();
      if (!coach) throw new Error("Your coach profile could not be found.");
      const current = getReportLayout(coach);
      const layers = current.layers.map(layer => layer.id === "qr" ? { ...layer, visible: mode !== "none" } : layer);
      const qrUrl = mode === "page" ? coachPublicUrl(coach) : mode === "custom" && validStudioQrUrl(url) ? url : current.qrUrl;
      coach.reportLayout = { ...current, layers, qrUrl };
      if (mode === "page") {
        coach.links = (links || []).map((link, index) => {
          const title = link.title || linkPlatform(link.url).label;
          return { id: link.id || `link-${index + 1}`, title, label: title, url: link.url, icon: "", visible: true, order: index + 1 };
        });
      }
      if (isCertificatePreview) return;
      const saved = await saveCoachRecord(coach);
      state.coaches = state.coaches.map(item => item.id === saved.id ? saved : item);
      persist();
    }

    async function saveOnboardingProfile(values) {
      const coach = getOnboardingCoach();
      if (!coach) throw new Error("Your coach profile could not be found.");
      const updated = { ...coach, name: values.name, phone: values.phone, photo: values.photo || "", photo_url: values.photo || "" };
      if (isCertificatePreview) {
        Object.assign(coach, updated);
        return;
      }
      const saved = await saveCoachRecord(updated);
      state.coaches = state.coaches.map(item => item.id === saved.id ? saved : item);
      persist();
    }

    // What the coach already has, to prefill "Make it yours". Default words
    // come back as empty so the box shows the default as its placeholder.
    function getOnboardingBrand() {
      const coach = getOnboardingCoach();
      const layout = getReportLayout(coach || {});
      const text = id => {
        const layer = layout.layers.find(item => item.id === id);
        const value = String(layer?.text ?? "").trim();
        return value && value !== ARTWORK_EDITABLE_TEXT[id] ? value : "";
      };
      return {
        heading: text("brand-name"),
        slogan: text("brand-tagline"),
        contact: coach?.centreContact && coach.centreContact !== "+60 12-345 6789" ? coach.centreContact : "",
        address: coach?.branchAddress && coach.branchAddress !== "Centre address" ? coach.branchAddress : "",
        defaults: {
          heading: certificateCentreName() || ARTWORK_EDITABLE_TEXT["brand-name"],
          slogan: ARTWORK_EDITABLE_TEXT["brand-tagline"],
          contact: "+60 12-345 6789",
          address: certificateCentreName() || "Your centre address"
        }
      };
    }

    async function applyOnboardingTemplate(templateId, brand = null) {
      const coach = getOnboardingCoach();
      if (!coach) throw new Error("Your coach profile could not be found.");
      const current = getReportLayout(coach);
      const variants = { ...(current.variants || {}), [current.templateId]: layoutSnapshot(current) };
      const next = current.templateId === templateId ? normalizeReportLayout(layoutSnapshot(current)) : normalizeReportLayout(variants[templateId] || defaultStudioLayout(templateId));
      // Save "Make it yours" words into the design. Empty boxes leave the
      // default words, which still turn into the centre's name and sport.
      if (brand) {
        const heading = String(brand.heading || "").trim();
        const slogan = String(brand.slogan || "").trim();
        next.layers = next.layers.map(layer => {
          if (layer.id === "brand-name") return { ...layer, text: heading || ARTWORK_EDITABLE_TEXT["brand-name"] };
          if (layer.id === "brand-tagline") return { ...layer, text: slogan || ARTWORK_EDITABLE_TEXT["brand-tagline"] };
          return layer;
        });
        if (String(brand.contact || "").trim()) coach.centreContact = String(brand.contact).trim();
        if (String(brand.address || "").trim()) coach.branchAddress = String(brand.address).trim();
      }
      coach.reportLayout = { ...next, variants, designs: current.designs || [], uploads: current.uploads || [] };
      if (isCertificatePreview) return;
      const saved = await saveCoachRecord(coach);
      state.coaches = state.coaches.map(item => item.id === saved.id ? saved : item);
      persist();
    }

    async function addOnboardingStudent(values) {
      const coach = getOnboardingCoach();
      if (!coach) throw new Error("Your coach profile could not be found.");
      const student = {
        id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)),
        name: values.name,
        coachId: coach.id,
        centreId: state.auth.centreId || null,
        lessons: 0,
        parentHp: values.parentHp || "",
        photo: "",
        status: "Active",
        age: values.age || "",
        centre: requestedCentre?.name || ""
      };
      const saved = isCertificatePreview ? normalizeStudent(student) : await saveStudentRecord(student);
      state.students.push(saved);
      coach.studentIds = [...(coach.studentIds || []), saved.id];
      if (!isCertificatePreview) persist();
      return saved;
    }

    async function saveOnboardingProgress({ step, skipped, completed = false }) {
      const coach = getOnboardingCoach();
      if (!coach) return;
      const changes = { onboarding_step: step };
      if (Array.isArray(skipped)) changes.onboarding_skipped = normalizeSkipped(skipped);
      if (completed) changes.onboarding_completed_at = new Date().toISOString();
      if (!isCertificatePreview && supabase) {
        let { error } = await supabase.from("coaches").update(changes).eq("id", coach.id);
        // If the newer skipped-steps column is not deployed yet, save the rest.
        // If the newer migration (skip list, 7 steps) is not deployed yet,
        // save what the older columns allow.
        if (error && /onboarding_skipped|onboarding_step_range/.test(error.message || "")) {
          const { onboarding_skipped: _skipped, ...rest } = changes;
          rest.onboarding_step = Math.min(rest.onboarding_step, 5);
          ({ error } = await supabase.from("coaches").update(rest).eq("id", coach.id));
        }
        if (error) throw new Error(completed ? "Your setup could not be saved. Try again." : error.message);
      }
      Object.assign(coach, changes);
    }

    // Coaches who already use the app (students or reports) skip the guide.
    // They only get a reminder to connect Drive if it is missing.
    let onboardingAutoCompleting = false;
    function autoCompleteOnboardingIfActive(coach) {
      if (onboardingAutoCompleting || isCertificatePreview) return false;
      const hasActivity = state.students.some(student => student.coachId === coach.id) || state.reports.some(report => report.coachId === coach.id);
      if (!hasActivity || coachOnboardingInstance?.isOpen()) return false;
      onboardingAutoCompleting = true;
      const skipped = state.driveConnection?.status === "connected" ? [] : ["drive"];
      Object.assign(coach, { onboarding_completed_at: new Date().toISOString(), onboarding_skipped: skipped });
      void saveOnboardingProgress({ step: 0, skipped, completed: true }).catch(error => console.warn("Unable to save setup state", error)).finally(() => { onboardingAutoCompleting = false; });
      return true;
    }

    function getSetupItems() {
      const coach = state.auth.role === "coach" ? getOnboardingCoach() : null;
      if (!coach) return [];
      const driveStatus = isCertificatePreview ? (previewDriveConnected ? "connected" : "disconnected") : state.driveConnection?.status === "connected" ? "connected" : state.driveConnection ? "disconnected" : "unknown";
      return pendingSetupItems(coach, { driveStatus, studentCount: state.students.filter(student => student.coachId === coach.id).length });
    }

    function renderSetupGuideSettingsCard() {
      if (!getOnboardingCoach()) return "";
      const items = getSetupItems();
      return `<div class="profile-card centre-settings-card setup-guide-card" style="margin-bottom:16px;">
        <div class="section-title"><h2>Setup guide</h2><p>${items.length ? `${items.length} step${items.length === 1 ? "" : "s"} left. Pick up where you stopped.` : "Your setup is complete. You can go through the guide again anytime."}</p></div>
        <button type="button" class="${items.length ? "primary-btn" : "secondary-btn"}" data-action="setup-open" data-step="${items[0] || "profile"}">${items.length ? "Finish setup" : "Open setup guide"}</button>
      </div>`;
    }

    let setupCardDismissed = (() => { try { return sessionStorage.getItem("setupCardDismissed") === "1"; } catch { return false; } })();
    function renderSetupReminders() {
      const items = getSetupItems();
      if (!items.length) return "";
      const driveMissing = items.includes("drive") && state.driveConnection;
      const others = items.filter(id => id !== "drive" || !driveMissing);
      const total = 5;
      const done = total - items.length;
      return `
        ${driveMissing ? `<div class="setup-drive-alert" role="status">
          <div><strong>Connect Google Drive</strong><span>Reports can't be saved until Drive is connected.</span></div>
          <button type="button" class="primary-btn" data-action="setup-open" data-step="drive">Connect now</button>
        </div>` : ""}
        ${others.length && !setupCardDismissed ? `<section class="table-card setup-reminder" aria-label="Finish your setup">
          <div class="setup-reminder-head">
            <div class="setup-reminder-ring" style="--setup-done:${Math.round((done / total) * 100)}%" aria-hidden="true"><span>${done}/${total}</span></div>
            <div class="setup-reminder-copy"><h3>Finish your setup</h3><span>${items.length} step${items.length === 1 ? "" : "s"} left. It takes about 2 minutes.</span></div>
            <button type="button" class="icon-btn setup-reminder-close" data-action="setup-dismiss" aria-label="Close setup reminder">&times;</button>
          </div>
          <div class="setup-reminder-bar"><span style="width:${(done / total) * 100}%"></span></div>
          <div class="setup-reminder-items">
            ${others.map(id => `<button type="button" data-action="setup-open" data-step="${id}">${setupItemIcon(id)}<span>${escapeHtml(SETUP_ITEM_LABELS[id])}</span><b aria-hidden="true">&rsaquo;</b></button>`).join("")}
          </div>
        </section>` : ""}`;
    }

    async function onboardingConnectDrive() {
      if (isCertificatePreview) {
        await new Promise(resolve => setTimeout(resolve, 700));
        previewDriveConnected = true;
        return;
      }
      driveConnectionError = "";
      const result = await invokePrivileged("google-drive-oauth", { action: "connect", centre_id: state.auth.centreId });
      if (!result?.authorization_url) throw new Error("Google Drive did not return a sign-in link. Try again.");
      if (requestedCentre?.slug) sessionStorage.setItem("pendingCentreSlug", requestedCentre.slug);
      window.location.assign(result.authorization_url);
      // Keep the button busy while the browser leaves the page.
      await new Promise(() => {});
    }

    async function saveCoachRecord(coach) {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error } = await supabase
        .from("coaches")
        .update({
          name: coach.name,
          branch: coach.branch,
          centre_contact: coach.centreContact || "",
          branch_address: coach.branchAddress || "",
          email: coach.email || "",
          phone: coach.phone || "",
          slug: coach.slug,
          bio: coach.bio || "",
          photo: coach.photo || "",
          links: Array.isArray(coach.links) ? coach.links : [],
          report_layout: coach.reportLayout || DEFAULT_REPORT_LAYOUT
        })
        .eq("id", coach.id)
        .select("*")
        .single();
      if (error) throw error;
      return normalizeCoach(data);
    }

    async function saveStudentRecord(student) {
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error } = await supabase
        .from("students")
        .upsert({
          id: student.id,
          coach_id: student.coachId,
          centre_id: state.auth.centreId || null,
          name: student.name,
          lessons: Number(student.lessons) || 0,
          parent_hp: student.parentHp || "",
          photo: student.photo || "",
          status: student.status || "Active",
          age: student.age || "",
          centre: student.centre || ""
        }, { onConflict: "id" })
        .select("*")
        .single();
      if (error) throw error;
      return normalizeStudent(data);
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

    async function saveCoachProfile() {
      const coach = getCurrentCoach();
      if (!coach) {
        alert("Coach profile could not be found.");
        return;
      }
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
      try {
        const savedCoach = await saveCoachRecord(coach);
        state.coaches = state.coaches.map(item => item.id === savedCoach.id ? savedCoach : item);
        persist();
        render();
      } catch (error) {
        alert(error.message || "Unable to save coach profile.");
      }
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

    function openCentreOnboarding() {
      centreOnboardingModal = { step: 1, values: { sport: "", name: "", coachName: "", email: "", password: "" }, result: null };
      render();
    }

    function closeCentreOnboarding() {
      centreOnboardingModal = null;
      render();
    }

    function readCentreOnboardingInputs() {
      if (!centreOnboardingModal) return;
      const ids = { sport: "centre-onboarding-sport", name: "centre-onboarding-name", coachName: "centre-onboarding-coach", email: "centre-onboarding-email", password: "centre-onboarding-password" };
      Object.entries(ids).forEach(([key, id]) => {
        const input = document.getElementById(id);
        if (input) centreOnboardingModal.values[key] = input.value.trim();
      });
      const logoInput = document.getElementById("centre-onboarding-logo");
      if (logoInput?.files?.[0]) centreOnboardingModal.values.logoFile = logoInput.files[0];
    }

    function continueCentreOnboarding() {
      if (!centreOnboardingModal) return;
      readCentreOnboardingInputs();
      if (!centreOnboardingModal.values.sport) return alert("Select a sport to continue.");
      centreOnboardingModal.step = 2;
      render();
    }

    async function submitCentreOnboarding() {
      if (!centreOnboardingModal) return;
      readCentreOnboardingInputs();
      const values = centreOnboardingModal.values;
      if (!values.name) return alert("Enter a centre name before creating the centre.");
      try {
        const slug = values.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "centre";
        const result = await invokePrivileged("dev-console", {
          action: "create-centre",
          name: values.name,
          sport: values.sport,
          coach_name: `${values.name} Coach`,
          email: `centre-${slug}-${Date.now()}@accounts.jomnittaku.app`,
          password: `${crypto.randomUUID()}${crypto.randomUUID()}`
        });
        if (values.logoFile && result?.centre?.id) {
          const logoUrl = await uploadProfileImage(values.logoFile, "centre-logo", result.centre.id);
          await invokePrivileged("dev-console", { action: "update-centre-logo", centre_id: result.centre.id, logo_url: logoUrl });
        }
        centreOnboardingModal.result = result;
        centreOnboardingModal.step = 3;
        await refreshPrivilegedState();
        render();
      } catch (error) {
        alert(error.message || "Unable to create centre.");
      }
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
      if (state.auth.role === "centre_admin" || state.auth.role === "coach") return getCurrentCoach().id;
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

    async function submitStudentOnboarding(values) {
      const name = [values.firstName, values.lastName].filter(Boolean).join(" ").trim() || "—";
      const coachId = resolveCoachIdForStudent(values.centre || "");
      const student = {
        id: crypto.randomUUID(),
        name,
        coachId,
        centreId: state.auth.centreId || null,
        lessons: 1,
        parentHp: values.phone || "—",
        photo: "",
        status: "Active",
        age: values.age || "",
        centre: values.centre || ""
      };
      const savedStudent = await saveStudentRecord(student);
      state.students.unshift(savedStudent);
      const coach = getCoachById(coachId);
      if (coach) {
        coach.studentIds = coach.studentIds || [];
        coach.studentIds.unshift(savedStudent.id);
      }
    }

    async function submitOnboarding() {
      if (!onboardingModal) return;
      const values = onboardingModal.values;
      try {
        if (onboardingModal.type === "coach") {
          submitCoachOnboarding(values);
        } else {
          await submitStudentOnboarding(values);
        }
        onboardingModal = null;
        persist();
        render();
      } catch (error) {
        alert(error.message || "Unable to save student.");
      }
    }

    function saveStudentFromModal() {
      submitOnboarding();
    }

    (async function bootstrap() {
      if (isCertificatePreview) {
        let saved; try { saved=await previewLayoutStore("load"); } catch {}
        state.auth={role:"coach",coachId:"preview-coach",userId:"preview-user",centreId:"",email:""};
        state.ui.page="certificate-design";
        state.coaches=[normalizeCoach({id:"preview-coach",name:"Daniel Lim",branch:"JomNittaku Academy",centreContact:"+60 12-345 6789",branchAddress:"JomNittaku Table Tennis Academy",slug:"daniel-lim",reportLayout:saved || defaultStudioLayout("classic")})];
        state.students=[normalizeStudent({id:"preview-student",name:"Alex Tan",coachId:"preview-coach",lessons:7})];
        state.reports=[{id:"sample-report",ref:"TRAINING PREVIEW",coachId:"preview-coach",studentId:"preview-student",date:"2026-10-29",time:"10:00",lessonNumber:8,summary:{whatTaught:"Forehand drive technique\nFootwork and recovery",beforeCoaching:"Inconsistent contact point\nDeveloping balance",afterTraining:"Improved shot consistency\nConfident weight transfer",nextLesson:"Backhand control\nServe and receive",remarks:"Great focus and effort throughout the session.\nKeep practising your footwork for 10 minutes daily.\nSmall improvements lead to lasting progress."}}];
        // Preview the coach setup guide with /preview.html?onboarding
        if (new URLSearchParams(window.location.search).has("onboarding")) {
          Object.assign(state.coaches[0],{name:"",photo:"",photo_url:"",onboarding_step:0,onboarding_completed_at:null,onboarding_skipped:[]});
          state.students=[];state.reports=[];
        }
        authReady=true;authInitializing=false;render();return;
      }

      let callbackError = "";
      let driveOAuthCode = "";
      let driveOAuthState = "";
      const centrePath = window.location.pathname.match(/^\/centre\/([^/]+)\/?$/i);
      if (centrePath && supabase) {
        let slug = "";
        try { slug = decodeURIComponent(centrePath[1]); } catch { slug = ""; }
        const result = await fetchCentreBySlug(slug);
        if (result.centre) requestedCentre = result.centre;
        else if (result.error) centreRouteLoadFailed = true;
        else centreRouteUnavailable = true;
      } else if (centrePath) {
        centreRouteUnavailable = true;
      }
      const isDriveCallbackPath = window.location.pathname === "/api/auth/google-drive/callback";
      if (supabase && (window.location.pathname === "/auth/callback" || isDriveCallbackPath)) {
        const callbackParams = new URLSearchParams(window.location.search);
        callbackError = callbackParams.get("error_description") || callbackParams.get("error") || "";
        driveOAuthCode = driveCallback ? callbackParams.get("code") || "" : "";
        driveOAuthState = driveCallback ? callbackParams.get("state") || "" : "";
        const callbackCentreSlug = callbackParams.get("centre") || driveOAuthState.split("|")[1] || sessionStorage.getItem("pendingCentreSlug");
        if (callbackCentreSlug) {
          const { centre: data, error: lookupError } = await fetchCentreBySlug(callbackCentreSlug);
          if (lookupError) {
            centreRouteLoadFailed = true;
          } else if (data?.status === "active") {
            requestedCentre = data;
            sessionStorage.removeItem("pendingCentreSlug");
            // Let Supabase consume its own sign-in callback before removing
            // the code. Drive callbacks are cleaned up after the exchange.
          } else {
            centreRouteUnavailable = true;
          }
        }
      }
      if (!requestedCentre && /^\/centre\/?$/i.test(window.location.pathname)) {
        authReady = true;
        authInitializing = false;
        render();
        state.centreProfile = await loadPublicCentreProfile();
        render();
        return;
      }
      // Coach link page (opened from the certificate QR). Anyone can view it,
      // so it loads without waiting for a sign-in.
      const coachPagePath = window.location.pathname.match(/^\/coach\/([^/]+)\/?$/i);
      if (coachPagePath && supabase) {
        let slug = "";
        try { slug = decodeURIComponent(coachPagePath[1]); } catch { slug = ""; }
        publicCoachPage = { status: "loading" };
        authReady = true;
        authInitializing = false;
        render();
        publicCoachPage = await fetchPublicCoachPage(slug);
        render();
        return;
      }
      const initialSessionPromise = supabase
        ? (bindAuthStateListener(), supabase.auth.getSession())
        : Promise.resolve({ data: { session: null }, error: null });
      loadState("dashboard")
        .then(async nextState => {
          // loadState() returns a fresh state whose auth is blank, so the
          // session resolved above has to be carried over. Otherwise a
          // signed-in user gets dropped back on the login screen on reload.
          const liveAuth = state.auth;
          state = nextState;
          state.auth = liveAuth;
          if (supabase) {
            // Wait for URL callback processing/session persistence before the
            // first authenticated render.
            const { data, error } = await initialSessionPromise;
            if (error && !callbackError) callbackError = error.message;
            await applyAuthUser(data.session?.user || null);
            if (state.auth.centreId) {
              const tenantState = await loadState(`centre:${state.auth.centreId}`);
              const liveAuth = state.auth;
              state = tenantState;
              state.auth = liveAuth;
            }
            await Promise.all([
              refreshCoachesFromSupabase(),
              refreshStudentsFromSupabase(),
              refreshCoachAccountCount(),
              refreshPrivilegedState().catch(() => {}),
            ]);
            if (driveCallback) {
              if (!callbackError) {
                try {
                  if (!driveOAuthCode || !driveOAuthState) throw new Error("Google Drive authorization is incomplete. Please reconnect your account.");
                  if (state.auth.role !== "coach" || !state.auth.centreId) throw new Error("Sign in to the coach account that started this Google Drive connection, then reconnect.");
                  const driveResult = await invokePrivileged("google-drive-oauth", { action: "callback", code: driveOAuthCode, state: driveOAuthState, centre_id: state.auth.centreId });
                  // The callback's saved row is authoritative. A subsequent
                  // status-read failure must not erase a successful connection.
                  if (driveResult?.connection) state.driveConnection = driveResult.connection;
                  else await refreshPrivilegedState();
                  invalidateReportReads();
                  reportStoreStatus = "idle";
                } catch (error) {
                  callbackError = error.message || "Unable to connect Google Drive.";
                }
              }
              driveConnectionError = callbackError;
              if (state.auth.role === "coach") state.ui.page = "centre-settings";
            }
            if (window.location.pathname === "/auth/callback" || isDriveCallbackPath) {
              window.history.replaceState({}, document.title, requestedCentre?.slug
                ? `/centre/${encodeURIComponent(requestedCentre.slug)}` : "/");
              sessionStorage.removeItem("pendingCentreSlug");
            }
            state.centreProfile = await loadPublicCentreProfile();
          } else {
            state.centreProfile = normalizeCentreProfile(state.centreProfile);
          }
          authInitializing = false;
          authReady = true;
          if (callbackError) loginError = callbackError;
          refreshReportsInBackground();
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

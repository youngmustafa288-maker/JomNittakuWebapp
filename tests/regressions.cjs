// Focused regressions for the attached vanilla-DOM application.
// Run with: node tests/regressions.cjs (no dependencies required).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../src/legacy-app.js'), 'utf8');
const driveSource = fs.readFileSync(path.join(__dirname, '../src/report-drive.js'), 'utf8');
const localSource = fs.readFileSync(path.join(__dirname, '../src/report-local.js'), 'utf8');
const designSource = fs.readFileSync(path.join(__dirname, '../supabase/functions/_shared/certificate-design.js'), 'utf8');
const certEditorSource = fs.readFileSync(path.join(__dirname, '../src/certificate-editor.js'), 'utf8');
const certTemplatesSource = fs.readFileSync(path.join(__dirname, '../src/certificate-templates.js'), 'utf8');
const certStudioSource = fs.readFileSync(path.join(__dirname, '../src/certificate-studio.js'), 'utf8');
const templatePickerSource = fs.readFileSync(path.join(__dirname, '../src/report-template-picker.js'), 'utf8');
const headings = ['brand-name', 'brand-subtitle', 'brand-tagline', 'report-title-art'];

class Element {
  constructor(id = '') {
    this.dataset = { overlayId: id };
    this.style = {};
    this.listeners = {};
    this.textContent = '';
    this.innerText = '';
    this.isConnected = true;
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(n => this.classes.add(n)),
      remove: (...names) => names.forEach(n => this.classes.delete(n)),
      contains: n => this.classes.has(n),
      toggle: (n, on = !this.classes.has(n)) => on ? this.classes.add(n) : this.classes.delete(n)
    };
  }
  addEventListener(type, fn, opts = {}) { (this.listeners[type] ||= []).push({ fn, once: opts.once }); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(x => x.fn !== fn); }
  dispatchEvent(event) {
    for (const entry of [...(this.listeners[event.type] || [])]) {
      entry.fn(event);
      if (entry.once) this.removeEventListener(event.type, entry.fn);
    }
    return true;
  }
  setAttribute(name, value) { this[name] = value; }
  querySelector(selector) { return selector === '.template-custom-layer-content' ? this.content || null : null; }
  querySelectorAll() { return []; }
  contains(node) { return node === this || node === this.content; }
  focus() {}
  blur() { this.dispatchEvent({ type: 'blur' }); }
  closest(selector) {
    if (selector === '.report-overlay-item.is-editing') return this;
    if (selector === '[data-overlay-text="true"]' && this.dataset.overlayText) return this;
    return null;
  }
  getBoundingClientRect() { return { width: 896, height: 1200 }; }
  insertAdjacentHTML() {}
}
function memoryStorage() {
  const map = new Map();
  return { getItem: k => map.get(k) || null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
}
function harness({ url = 'https://example.test/', bootstrap = false, user = null, invoke = null, localDB = null } = {}) {
  const location = new URL(url);
  location.assign = value => { location.assigned = value; };
  const app = new Element();
  const preview = new Element();
  const document = new Element();
  let overlayItems = [], headingSpans = [];
  document.title = 'Regression fixture';
  document.querySelector = q => q === '#reportTemplatePreview' ? preview : null;
  document.querySelectorAll = q => q === '[data-overlay-id]' ? overlayItems
    : q === '.template-heading .template-custom-layer-content' ? headingSpans : [];
  document.getElementById = id => id === 'app' ? app : null;
  document.createRange = () => ({ selectNodeContents() {} });
  document.createElement = () => ({ getContext: () => ({
    measureText: line => ({ width: line.length * 30, actualBoundingBoxLeft: 5, actualBoundingBoxRight: line.length * 30 + 5 })
  }) });
  const storage = memoryStorage();
  const sessionStorage = memoryStorage();
  const calls = [], history = [], sessionUrls = [];
  let clientOptions;
  const centre = { id: 'centre-1', slug: 'test-centre', name: 'Test Centre', status: 'active', activated_at: '2026-01-01' };
  const coach = { id: 'coach-1', email: 'coach@example.test', name: 'Test Coach', centre_id: centre.id };
  const defaultUser = { id: coach.id, email: coach.email, app_metadata: { centre_id: centre.id }, user_metadata: {} };
  if (user === true) user = defaultUser;
  function query(table) {
    const q = {
      select() { return q; }, eq() { return q; }, order() { return q; },
      single: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: table === 'centres' ? centre : table === 'centre_memberships' ? { centre_id: centre.id, role: 'coach' } : table === 'coaches' ? coach : null }),
      then(resolve, reject) { return Promise.resolve({ data: table === 'coaches' ? [coach] : [], error: null }).then(resolve, reject); }
    };
    return q;
  }
  const sandbox = {
    console, URLSearchParams, Date, Map, Set, Event,
    setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto,
    ...(localDB ? { indexedDB: localDB } : {}), navigator: { onLine: true }, structuredClone, TextEncoder,
    localStorage: storage, sessionStorage, document,
    requestAnimationFrame: fn => fn(),
    alert: message => { throw Error(`Unexpected alert: ${message}`); },
    __skipBootstrap: !bootstrap,
    createClient: (_url, _key, opts) => {
      clientOptions = opts;
      return {
        from: query,
        auth: {
          getSession: async () => {
            sessionUrls.push(location.search);
            return { data: { session: user ? { user } : null }, error: null };
          },
          onAuthStateChange() {}, signOut: async () => ({})
        },
        functions: { invoke: async (_name, { body }) => {
          calls.push(body);
          return invoke ? invoke(body) : { data: body.action === 'report-list' ? { records: [] } : { connection: { status: 'connected' } }, error: null };
        } }
      };
    }
  };
  sandbox.window = {
    location, addEventListener() {}, setTimeout, requestAnimationFrame: () => {},
    history: { replaceState: (_s, _t, url) => { history.push(url); const next = new URL(url, location); location.pathname = next.pathname; location.search = next.search; } },
    getComputedStyle: () => ({ fontSize: '48', fontFamily: 'Arial', fontStyle: 'normal', fontWeight: '700' }),
    getSelection: () => ({ rangeCount: 0, removeAllRanges() {}, addRange() {} })
  };
  const hook = `
    globalThis.__api = {
      normalizeReportLayout, renderCustomCertificateLayers, renderEditableQr,
      renderReportLayoutToolbar, beginCertificateTextEditing, fitCustomCertificateHeadingText,
      updateSelectedReportLayout, handleAction, attachEvents, renderCentreSettingsPage,
      finalizeWizard, closeWizard, ensureHybridWorkspace, resetHybridSession,
      get wizardId() { return wizardDraftId; },
      get reportError() { return reportStoreError; },
      seedWizard() {
        state.driveConnection = { status: 'connected', root_folder_id: 'root-1' };
        const draft = { schemaVersion: 1, recordType: 'draft', id: 'draft-hybrid-flow', ref: 'TEST', coachId: 'coach-1', studentId: 'student-1', date: '2026-10-29', time: '10:00', lessonNumber: 1, summary: blankSummary(), step: 4 };
        state.students = [{ id: 'student-1', coachId: 'coach-1', name: 'Student', lessons: 0 }];
        state.reportDrafts[draft.id] = draft;
        wizardDraftId = draft.id;
      },
      get state() { return state; }, get driveError() { return driveConnectionError; },
      get reportStatus() { return reportStoreStatus; },
      seed(coach) { state.coaches = [coach]; state.auth = { role: 'coach', coachId: coach.id, userId: coach.id, centreId: 'centre-1' }; reportLayoutEditing = true; },
      select(id) { selectedReportOverlay = id; },
      saves: 0, renders: 0
    };
    render = () => { globalThis.__api.renders++; };
    subscribeToRealtime = () => {};
    persist = () => {};
    saveReportLayout = async () => { globalThis.__api.saves++; };
    saveStudentRecord = async student => student;
    if (globalThis.__skipBootstrap) return;
  `;
  const cleanModule = (str) => str.replace(/^import .*;\r?\n/gm, '').replace(/^export (default )?/gm, '');
  let code = cleanModule(source)
    .replace('    (async function bootstrap() {', hook + '\n    (async function bootstrap() {');
  const context = vm.createContext(sandbox);
  const bundle = [
    cleanModule(designSource),
    cleanModule(certTemplatesSource),
    cleanModule(certEditorSource),
    cleanModule(certStudioSource),
    cleanModule(templatePickerSource),
    cleanModule(driveSource),
    cleanModule(localSource),
    code
  ].join('\n;\n');
  vm.runInContext(bundle, context);
  context.initApp(bootstrap || localDB ? { supabaseUrl: 'https://supabase.example.test', supabaseKey: 'publishable-fixture' } : {});
  return { api: context.__api, context, document, app, preview, calls, history, sessionUrls, location,
    get clientOptions() { return clientOptions; },
    items: values => { overlayItems = values; }, spans: values => { headingSpans = values; } };
}
async function settled(h) {
  for (let i = 0; i < 30 && !h.api.renders; i++) await new Promise(resolve => setImmediate(resolve));
  assert.ok(h.api.renders, 'bootstrap reached rendering');
}
function seeded() {
  const h = harness();
  const coach = { id: 'coach-1', name: 'Coach', reportLayout: h.api.normalizeReportLayout() };
  h.api.seed(coach);
  return { ...h, coach };
}
function itemFor(id, text) {
  const item = new Element(id);
  item.dataset.overlayText = 'true';
  item.content = new Element();
  item.content.parentElement = item;
  item.content.textContent = text;
  item.content.innerText = text;
  return item;
}

test('all built-in layers start unlocked and old forced locks/geometry upgrade without losing placement', () => {
  const h = harness();
  const fresh = h.api.normalizeReportLayout();
  assert.ok(fresh.layers.every(l => !l.locked));
  const old = { layers: [
    { id: 'report-title-art', left: 8, top: 9, width: 80, height: 7, locked: true, textOverride: 'THIS IS MY REPORT' },
    { id: 'qr', left: 70, top: 80, width: 12, height: 10, locked: true },
    { id: 'certification-badge', left: 3, top: 70, width: 22, height: 16, locked: true }
  ] };
  const layout = h.api.normalizeReportLayout(old);
  for (const prior of old.layers) {
    const layer = layout.layers.find(l => l.id === prior.id);
    assert.equal(layer.locked, false);
    for (const field of ['left', 'top', 'width', 'height']) assert.equal(layer[field], prior[field]);
  }
  const title = layout.layers.find(l => l.id === 'report-title-art');
  assert.equal(title.text, 'THIS IS MY REPORT');
  assert.equal(title.type, 'text');
  title.locked = true;
  assert.equal(h.api.normalizeReportLayout(JSON.parse(JSON.stringify(layout))).layers.find(l => l.id === title.id).locked, true);
});

test('all four headings render the same text-box wrapper, controls, and formatting as added text', () => {
  const { api, coach } = seeded();
  for (const id of headings) {
    api.select(id);
    const html = api.renderCustomCertificateLayers(coach.reportLayout);
    assert.match(html, new RegExp(`class="template-custom-layer template-heading [^"]*" data-overlay-id="${id}"[^>]*>[\\s\\S]*?template-custom-layer-content`));
    assert.match(html, /data-action="duplicate-certificate-layer"/);
    const toolbar = api.renderReportLayoutToolbar(coach);
    for (const token of ['data-layout-font', 'data-layout-size', 'data-layout-color', 'data-text-format="bold"', 'toggle-certificate-lock']) assert.ok(toolbar.includes(token), `${id}: ${token}`);
    api.updateSelectedReportLayout({ fontFamily: 'Lato', color: '#123456', fontWeight: 700 });
    assert.ok(api.renderCustomCertificateLayers(coach.reportLayout).includes('font-family:Lato;'));
  }
});

test('four headings edit inline, preserve full text including T, and save on blur', () => {
  const { api, coach } = seeded();
  for (const id of headings) {
    const original = coach.reportLayout.layers.find(l => l.id === id).text;
    const item = itemFor(id, original);
    api.beginCertificateTextEditing(item);
    assert.equal(item.content.contentEditable, 'true');
    item.content.textContent = item.content.innerText = 'THIS IS A TRAINING REPORT';
    item.content.dispatchEvent(new Event('input'));
    item.content.blur();
    assert.equal(coach.reportLayout.layers.find(l => l.id === id).text, 'THIS IS A TRAINING REPORT');
    assert.equal(item.content.contentEditable, 'false');
  }
  assert.equal(api.saves, 4);
  assert.equal(api.normalizeReportLayout(coach.reportLayout).layers.find(l => l.id === 'report-title-art').text[0], 'T');
});

test('empty heading edits stay empty across save/load; text is escaped in rendered output', () => {
  const { api, coach } = seeded();
  api.select('brand-name');
  api.updateSelectedReportLayout({ text: '' });
  assert.equal(api.normalizeReportLayout(coach.reportLayout).layers.find(l => l.id === 'brand-name').text, '');
  api.updateSelectedReportLayout({ text: '<script>alert(1)</script>' });
  const html = api.renderCustomCertificateLayers(coach.reportLayout);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>'));
});

test('long headings fit width and height without a minimum scale clipping the first glyph', () => {
  const { api, spans } = seeded();
  for (const width of [90, 250, 627]) {
    const item = itemFor('report-title-art', 'THIS IS A TRAINING REPORT WITH A MUCH LONGER TITLE');
    item.clientWidth = width; item.clientHeight = 40;
    spans([item.content]);
    api.fitCustomCertificateHeadingText();
    const px = 48 * Number.parseFloat(item.content.style.fontSize);
    assert.ok(item.content.style.fontSize.endsWith('em'), 'fitting scales with the export clone');
    const measuredAt48 = item.content.textContent.length * 30 + 10;
    assert.ok(measuredAt48 * px / 48 <= width * 0.94 + 0.001);
    assert.ok(px * 1.15 <= 40 * 0.94 + 0.001);
    assert.equal(item.content.style.transform, 'none');
    assert.equal(item.content.textContent[0], 'T');
  }
});

test('pointer dragging moves and persists headings, artwork, badge and QR; manual locks stop dragging', () => {
  const h = seeded();
  h.api.attachEvents();
  for (const id of [...headings, 'session-divider', 'contact-title-art', 'certification-badge', 'qr']) {
    const before = h.coach.reportLayout.layers.find(l => l.id === id);
    const left = before.left, top = before.top;
    const item = itemFor(id, before.text || '');
    h.app.dispatchEvent({ type: 'pointerdown', target: item, detail: 1, clientX: 100, clientY: 100, pointerId: 1, preventDefault() {} });
    h.document.dispatchEvent({ type: 'pointermove', clientX: 109, clientY: 112 });
    h.document.dispatchEvent({ type: 'pointerup' });
    const moved = h.coach.reportLayout.layers.find(l => l.id === id);
    assert.ok(moved.left > left, id);
    assert.ok(moved.top > top, id);
    const restored = h.api.normalizeReportLayout(JSON.parse(JSON.stringify(h.coach.reportLayout))).layers.find(l => l.id === id);
    assert.equal(restored.left, moved.left);
  }
  h.api.select('qr'); h.api.handleAction({ currentTarget: { dataset: { action: 'toggle-certificate-lock' } } });
  const before = h.coach.reportLayout.layers.find(l => l.id === 'qr').left;
  const item = itemFor('qr', '');
  h.app.dispatchEvent({ type: 'pointerdown', target: item, detail: 1, clientX: 100, clientY: 100, pointerId: 1 });
  h.document.dispatchEvent({ type: 'pointermove', clientX: 200, clientY: 200 });
  h.document.dispatchEvent({ type: 'pointerup' });
  assert.equal(h.coach.reportLayout.layers.find(l => l.id === 'qr').left, before);
  assert.match(h.api.renderEditableQr(h.coach.reportLayout.layers.find(l => l.id === 'qr')), /certificate-resize-handle/);
});

test('Google login code is left for Supabase and never submitted as a Drive authorization code', async () => {
  const h = harness({ url: 'https://example.test/auth/callback?code=supabase-code&centre=test-centre', bootstrap: true, user: true });
  await settled(h);
  assert.equal(h.clientOptions.auth.detectSessionInUrl, true);
  assert.ok(h.sessionUrls[0].includes('code=supabase-code'));
  assert.equal(h.calls.filter(c => c.action === 'callback').length, 0);
  assert.equal(h.history.at(-1), '/centre/test-centre');
});

test('Drive callback keeps the coach session and exchanges code/state exactly once for the owning centre', async () => {
  for (const callbackPath of ['/api/auth/google-drive/callback', '/auth/callback']) {
    const h = harness({ url: `https://example.test${callbackPath}?code=drive-code&state=nonce%7Ctest-centre`, bootstrap: true, user: true });
    await settled(h);
    assert.equal(h.clientOptions.auth.detectSessionInUrl, false);
    const callbacks = h.calls.filter(c => c.action === 'callback');
    assert.equal(callbacks.length, 1);
    assert.equal(callbacks[0].code, 'drive-code');
    assert.equal(callbacks[0].state, 'nonce|test-centre');
    assert.equal(callbacks[0].centre_id, 'centre-1');
    assert.equal(h.api.state.auth.role, 'coach');
    assert.equal(h.api.state.driveConnection.status, 'connected');
    assert.equal(h.api.state.ui.page, 'centre-settings');
    assert.ok(!h.location.search);
  }
});

test('Drive denial and server errors are visible in coach settings and callback parameters are removed', async () => {
  const denied = harness({ url: 'https://example.test/api/auth/google-drive/callback?error=access_denied&state=nonce%7Ctest-centre', bootstrap: true, user: true });
  await settled(denied);
  assert.equal(denied.calls.filter(c => c.action === 'callback').length, 0);
  assert.ok(denied.api.renderCentreSettingsPage().includes('access_denied'));
  assert.equal(denied.location.search, '');
  const failed = harness({ url: 'https://example.test/api/auth/google-drive/callback?code=drive&state=nonce%7Ctest-centre', bootstrap: true, user: true,
    invoke: body => body.action === 'callback'
      ? { data: null, error: { message: 'OAuth state expired' } }
      : { data: body.action === 'report-list' ? { records: [] } : { connection: null } }
  });
  await settled(failed);
  assert.ok(failed.api.renderCentreSettingsPage().includes('OAuth state expired'));
  assert.equal(failed.location.search, '');
});

test('Drive callback without a coach session does not exchange authorization or fabricate a connected account', async () => {
  const h = harness({ url: 'https://example.test/api/auth/google-drive/callback?code=drive&state=nonce%7Ctest-centre', bootstrap: true });
  await settled(h);
  assert.equal(h.calls.filter(c => c.action === 'callback').length, 0);
  assert.equal(h.api.state.driveConnection, null);
  assert.equal(h.api.state.auth.role, null);
});

test('QR and headings resize and persist through the same pointer controls', () => {
  const h = seeded();
  h.api.attachEvents();
  for (const id of ['qr', 'brand-name', 'report-title-art']) {
    const prior = h.coach.reportLayout.layers.find(l => l.id === id);
    const width = prior.width, height = prior.height;
    const item = itemFor(id, prior.text || '');
    const handle = { dataset: { resizeEdge: 'corner' } };
    const target = { closest: selector => selector === '.report-overlay-item.is-editing' ? item
      : selector === '.certificate-resize-handle' ? handle : null };
    h.app.dispatchEvent({ type: 'pointerdown', target, detail: 1, clientX: 100, clientY: 100, pointerId: 1, preventDefault() {} });
    h.document.dispatchEvent({ type: 'pointermove', clientX: 105, clientY: 105 });
    h.document.dispatchEvent({ type: 'pointerup' });
    const resized = h.coach.reportLayout.layers.find(l => l.id === id);
    assert.ok(resized.width > width, id);
    assert.ok(resized.height > height, id);
    const restored = h.api.normalizeReportLayout(JSON.parse(JSON.stringify(h.coach.reportLayout))).layers.find(l => l.id === id);
    assert.equal(restored.width, resized.width);
  }
});

test('a successful Drive exchange survives an initial status-read failure', async () => {
  const h = harness({ url: 'https://example.test/api/auth/google-drive/callback?code=drive&state=nonce%7Ctest-centre', bootstrap: true, user: true,
    invoke: body => body.action === 'connection-status'
      ? { data: null, error: { message: 'Temporary status-read failure' } }
      : { data: body.action === 'report-list' ? { records: [] } : { connection: { status: 'connected', google_account_email: 'coach@example.test' } } }
  });
  await settled(h);
  assert.equal(h.api.state.driveConnection.status, 'connected');
  assert.equal(h.api.driveError, '');
  assert.equal(h.api.reportStatus, 'ready');
});

test('Drive connect validates the response and shows a coach-specific backend rejection', async () => {
  for (const response of [{ data: {} }, { error: { message: 'Centre admin role required' } }]) {
    const h = harness({ bootstrap: true, user: true, invoke: body => body.action === 'connect' ? response
      : { data: body.action === 'report-list' ? { records: [] } : { connection: null } } });
    await settled(h);
    await h.api.handleAction({ currentTarget: { dataset: { action: 'connect-drive' } } });
    assert.ok(h.api.driveError);
    assert.ok(!h.location.assigned);
    if (response.error) assert.ok(h.api.driveError.includes('per-coach'));
    else assert.ok(h.api.driveError.includes('authorization URL'));
  }
});

test('closing the hybrid wizard persists its draft without waiting for Drive', async () => {
  const { IDBFactory } = require('fake-indexeddb');
  const h = harness({ localDB: new IDBFactory(), invoke: () => { throw Error('Offline'); } });
  const coach = { id: 'coach-1', name: 'Coach', reportLayout: h.api.normalizeReportLayout() };
  h.api.seed(coach);
  h.api.seedWizard();
  await h.api.closeWizard();
  assert.equal(h.api.wizardId, null);
  assert.equal(h.calls.length, 0);
  const local = await h.api.ensureHybridWorkspace().snapshot();
  assert.equal(local.pending[0].id, 'draft-hybrid-flow');
  h.api.resetHybridSession();
});

test('hybrid finalization waits for draft sync, then confirms the report on Drive', async () => {
  const { IDBFactory } = require('fake-indexeddb');
  const h = harness({ localDB: new IDBFactory(), invoke: body => ({ data: body.action === 'report-template-capabilities'
    ? { certificateDesignVersion: 1, hybridDraftVersion: 1 } : { record: body.record }, error: null }) });
  h.api.seed({ id: 'coach-1', name: 'Coach', reportLayout: h.api.normalizeReportLayout() });
  h.api.seedWizard();
  h.context.navigator.onLine = false;
  await h.api.finalizeWizard();
  assert.equal(h.api.state.reports.length, 0);
  assert.match(h.api.reportError, /Go online/);
  assert.equal(h.calls.length, 0);
  h.context.navigator.onLine = true;
  await h.api.finalizeWizard();
  const writes = h.calls.filter(call => call.action === 'report-save');
  assert.deepEqual(writes.map(call => call.record.recordType), ['draft', 'report']);
  assert.equal(writes[0].hybrid_draft.actor_id, 'coach-1');
  assert.equal(writes[1].draft_id, 'draft-hybrid-flow');
  assert.equal(h.api.state.reports[0].id, 'report-hybrid-flow');
  assert.equal(h.api.wizardId, null);
  const local = await h.api.ensureHybridWorkspace().snapshot();
  assert.equal(local.pending.length, 0);
  assert.equal(local.records[0].recordType, 'report');
  h.api.resetHybridSession();
});

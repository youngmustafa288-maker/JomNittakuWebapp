// Tests the supplied controller/repository directly, with no certificate-studio
// files or installed packages required. Run: node --test tests/drive-performance.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const controller = fs.readFileSync(path.join(__dirname, '../src/legacy-app.js'), 'utf8');
const repository = fs.readFileSync(path.join(__dirname, '../src/report-drive.js'), 'utf8');
const localSource = fs.readFileSync(path.join(__dirname, '../src/report-local.js'), 'utf8');
const clean = source => source.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const record = (id = 'report-first') => ({
  schemaVersion: 1, recordType: 'report', id, coachId: 'coach-1', studentId: 'student-1',
  date: '2026-10-20', time: '10:30', lessonNumber: 1, summary: { remarks: id },
});
function harness({ bootstrap = false, invoke = async () => ({ records: [] }), localDB = null } = {}) {
  const calls = [], renders = [];
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  const user = { id: 'coach-1', email: 'coach@example.test', app_metadata: { centre_id: 'centre-1' }, user_metadata: {} };
  const coach = { id: user.id, name: 'Coach', centre_id: 'centre-1' };
  const inputs = { loginEmail: { value: user.email }, loginPassword: { value: 'fixture' } };
  function query(table) {
    const q = {
      select() { return q; }, eq() { return q; }, order() { return q; },
      single: async () => ({ data: null }),
      maybeSingle: async () => ({ data: table === 'centre_memberships' ? { centre_id: 'centre-1', role: 'coach' } : table === 'coaches' ? coach : null }),
      then(yes, no) { return Promise.resolve({ data: table === 'coaches' ? [coach] : [], error: null }).then(yes, no); },
    };
    return q;
  }
  const document = { getElementById: id => inputs[id] || null, activeElement: null, querySelectorAll: () => [] };
  const sandbox = {
    console, URLSearchParams, Date, Map, Set, setTimeout, clearTimeout,
    localStorage: storage, sessionStorage: storage, document,
    requestAnimationFrame: fn => fn(), __bootstrap: bootstrap,
    ...(localDB ? { indexedDB: localDB } : {}),
    navigator: { onLine: true }, structuredClone, crypto: require('node:crypto').webcrypto,
    createClient: () => ({
      from: query,
      auth: {
        getSession: async () => ({ data: { session: { user } } }),
        signInWithPassword: async () => ({ data: { user }, error: null }),
        signOut: async () => ({}), onAuthStateChange() {},
      },
      functions: { invoke: async (_name, { body }) => {
        calls.push(body);
        const data = body.action === 'connection-status' ? { connection: { status: 'connected', root_folder_id: 'root-1' } } : await invoke(body);
        return { data, error: null };
      } },
    }),
    __render: snapshot => renders.push(snapshot),
  };
  sandbox.window = { location: new URL('https://app.example.test/'), addEventListener() {}, setTimeout };
  const hook = `
    globalThis.api = {
      loadReportsFromDrive, refreshReportsInBackground, invalidateReportReads,
      saveReportRecord, logout, signIn, selectAdminReportCentre,
      ensureHybridWorkspace, syncLocalDrafts, resetHybridSession,
      get state() { return state; },
      get status() { return reportStoreStatus; },
      get error() { return reportStoreError; },
      get pending() { return reportLoadPromise; },
      get ready() { return authReady && !authInitializing; },
      seed(role = 'coach', centreId = 'centre-1') {
        state.auth = { userId: 'coach-1', role, coachId: 'coach-1', centreId };
        state.driveConnection = { status: 'connected', root_folder_id: 'root-1' };
        state.ui.page = 'overview';
      },
      setUser(id) { state.auth.userId = id; },
      setCentre(id) { state.auth.centreId = id; invalidateReportReads(); state.reports = []; state.reportDrafts = {}; },
      setWizard(id) { wizardDraftId = id; },
      setAdminCentre(id) { activeReportCentreId = id; },
    };
    render = () => __render({ ready: authReady && !authInitializing, status: reportStoreStatus, user: state.auth.userId });
    scheduleRender = () => render();
    subscribeToRealtime = () => {};
    persist = () => {};
    if (!globalThis.__bootstrap) return;
  `;
  vm.runInNewContext(clean(repository) + '\n' + clean(localSource) + '\n' + clean(controller).replace('    (async function bootstrap() {', hook + '\n    (async function bootstrap() {'), sandbox);
  sandbox.initApp({ supabaseUrl: 'https://fixture.supabase.test', supabaseKey: 'publishable-fixture' });
  return { api: sandbox.api, calls, renders, document };
}

test('bootstrap renders an authenticated dashboard before a slow Drive list completes', async () => {
  const list = deferred();
  const h = harness({ bootstrap: true, invoke: () => list.promise });
  for (let i = 0; i < 20 && !h.api.ready; i++) await tick();
  assert.equal(h.api.ready, true);
  assert.equal(h.renders.at(-1).user, 'coach-1');
  assert.equal(h.renders.at(-1).status, 'loading');
  assert.equal(h.calls.filter(c => c.action === 'report-list').length, 1);
  const pending = h.api.pending;
  list.resolve({ records: [record()] });
  await pending;
  assert.equal(h.api.state.reports.length, 1);
});

test('password sign-in finishes while the Drive list is still pending', async () => {
  const list = deferred();
  const h = harness({ invoke: () => list.promise });
  await h.api.signIn();
  assert.equal(h.api.state.auth.userId, 'coach-1');
  assert.equal(h.renders.at(-1).status, 'loading');
  assert.ok(h.api.pending);
  const pending = h.api.pending;
  list.resolve({ records: [] });
  await pending;
});

test('concurrent list calls share one request and repeat navigation uses session memory', async () => {
  const list = deferred();
  const h = harness({ invoke: () => list.promise });
  h.api.seed();
  const a = h.api.loadReportsFromDrive(), b = h.api.loadReportsFromDrive();
  await tick();
  assert.equal(h.calls.length, 1);
  list.resolve({ records: [record()] });
  await Promise.all([a, b]);
  await h.api.loadReportsFromDrive();
  assert.equal(h.calls.length, 1);
});

test('forced refresh keeps visible records and a failed refresh preserves them', async () => {
  const refresh = deferred();
  let count = 0;
  const h = harness({ invoke: () => ++count === 1 ? { records: [record()] } : refresh.promise });
  h.api.seed();
  await h.api.loadReportsFromDrive();
  const pending = h.api.loadReportsFromDrive({ force: true });
  assert.equal(h.api.status, 'ready');
  assert.equal(h.api.state.reports[0].id, 'report-first');
  refresh.reject(Error('Google unavailable'));
  await pending;
  assert.equal(h.api.status, 'ready');
  assert.equal(h.api.state.reports[0].id, 'report-first');
  assert.match(h.api.error, /Google unavailable/);
});

test('a successful refresh replaces stale records after it completes', async () => {
  let count = 0;
  const h = harness({ invoke: () => ({ records: [record(++count === 1 ? 'report-first' : 'report-new')] }) });
  h.api.seed();
  await h.api.loadReportsFromDrive();
  await h.api.loadReportsFromDrive({ force: true });
  assert.equal(h.api.state.reports[0].id, 'report-new');
});

test('a late response after logout cannot restore report content', async () => {
  const list = deferred();
  const h = harness({ invoke: () => list.promise });
  h.api.seed();
  const pending = h.api.loadReportsFromDrive();
  await tick();
  await h.api.logout();
  list.resolve({ records: [record()] });
  await pending;
  assert.equal(h.api.state.auth.userId, null);
  assert.equal(h.api.state.reports.length, 0);
  assert.equal(h.api.status, 'idle');
});

test('late failures and finalizers from another centre do not affect its new request', async () => {
  const old = deferred(), current = deferred();
  const h = harness({ invoke: body => body.centre_id === 'centre-1' ? old.promise : current.promise });
  h.api.seed('centre_admin');
  const a = h.api.loadReportsFromDrive();
  await tick();
  h.api.setCentre('centre-2');
  const b = h.api.loadReportsFromDrive();
  const currentPromise = h.api.pending;
  await tick();
  old.reject(Error('old centre failed'));
  await a;
  assert.equal(h.api.error, '');
  assert.equal(h.api.pending, currentPromise);
  current.resolve({ records: [record('report-current')] });
  await b;
  assert.equal(h.api.state.reports[0].centreId, 'centre-2');
});

test('an old success cannot overwrite a newer centre snapshot', async () => {
  const old = deferred();
  const h = harness({ invoke: body => body.centre_id === 'centre-1' ? old.promise : { records: [record('report-new')] } });
  h.api.seed('centre_admin');
  const pending = h.api.loadReportsFromDrive();
  await tick();
  h.api.setCentre('centre-2');
  await h.api.loadReportsFromDrive();
  old.resolve({ records: [record('report-old')] });
  await pending;
  assert.equal(h.api.state.reports[0].id, 'report-new');
});

test('admin workspace discovery is deduplicated before a centre has been selected', async () => {
  const context = deferred();
  const h = harness({ invoke: () => context.promise });
  h.api.seed('admin', null);
  const a = h.api.loadReportsFromDrive(), b = h.api.loadReportsFromDrive();
  await tick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].action, 'admin-report-context');
  context.resolve({ centres: [{ id: 'centre-1', name: 'One' }] });
  await Promise.all([a, b]);
  assert.equal(h.api.status, 'idle');
});

test('a new write makes an already running list response obsolete', async () => {
  const list = deferred();
  let listCount = 0;
  const h = harness({ invoke: body => body.action === 'report-save' ? { record: body.record }
    : ++listCount === 1 ? { records: [record()] } : list.promise });
  h.api.seed();
  await h.api.loadReportsFromDrive();
  const pending = h.api.loadReportsFromDrive({ force: true });
  await tick();
  await h.api.saveReportRecord({ schemaVersion: 1, recordType: 'draft', id: 'draft-new', coachId: 'coach-1', summary: { remarks: 'new edit' } });
  list.resolve({ records: [] });
  await pending;
  assert.equal(h.api.state.reportDrafts['draft-new'].summary.remarks, 'new edit');
  assert.equal(h.api.state.reports.length, 1);
});

test('refresh does not fetch or overwrite an active wizard', async () => {
  const h = harness();
  h.api.seed();
  h.api.setWizard('draft-editing');
  await h.api.loadReportsFromDrive({ force: true });
  assert.equal(h.calls.length, 0);
});

test('background completion does not rerender a profile form', async () => {
  const list = deferred();
  const h = harness({ invoke: () => list.promise });
  h.api.seed();
  const pending = h.api.refreshReportsInBackground();
  h.api.state.ui.page = 'profile';
  list.resolve({ records: [record()] });
  await pending;
  await tick();
  assert.equal(h.api.state.reports.length, 1);
  assert.equal(h.renders.length, 0);
});

test('the controller displays cached records before a slow Drive response after reload', async () => {
  const { IDBFactory } = require('fake-indexeddb');
  const localDB = new IDBFactory();
  const first = harness({ localDB });
  first.api.seed();
  await first.api.ensureHybridWorkspace().cache([record('report-cached')]);
  first.api.resetHybridSession();
  const list = deferred();
  const next = harness({ bootstrap: true, localDB, invoke: () => list.promise });
  for (let i = 0; i < 100 && !next.api.state.reports.length; i++) await tick();
  assert.equal(next.api.state.reports[0]?.id, 'report-cached');
  assert.equal(next.api.status, 'ready');
  const pending = next.api.pending;
  list.resolve({ records: [record('report-fresh')] });
  await pending;
  assert.equal(next.api.state.reports[0].id, 'report-fresh');
  next.api.resetHybridSession();
});

test('controller draft saves finish locally while Drive is unavailable', async () => {
  const { IDBFactory } = require('fake-indexeddb');
  const h = harness({ localDB: new IDBFactory(), invoke: () => { throw Error('Offline'); } });
  h.api.seed();
  const input = { schemaVersion: 1, recordType: 'draft', id: 'draft-offline', coachId: 'coach-1', summary: { remarks: 'Keep my edits' } };
  h.api.state.reportDrafts[input.id] = input;
  await h.api.saveReportRecord(input);
  assert.equal(h.calls.length, 0);
  await h.api.syncLocalDrafts();
  const state = await h.api.ensureHybridWorkspace().snapshot();
  assert.equal(state.pending.length, 1);
  assert.equal(state.records[0].summary.remarks, 'Keep my edits');
  h.api.resetHybridSession();
});

test('caching a large Drive collection does not truncate the online report list', async () => {
  const { IDBFactory } = require('fake-indexeddb');
  const records = Array.from({ length: 130 }, (_, i) => record(`report-${i}`));
  const h = harness({ localDB: new IDBFactory(), invoke: () => ({ records }) });
  h.api.seed();
  await h.api.loadReportsFromDrive();
  assert.equal(h.api.state.reports.length, 130);
  assert.equal((await h.api.ensureHybridWorkspace().snapshot()).records.length, 100);
  h.api.resetHybridSession();
});

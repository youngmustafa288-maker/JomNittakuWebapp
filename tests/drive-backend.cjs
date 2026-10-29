// Isolated tests of the actual Edge Function using Auth, database and Google mocks.
// Requires Node 24+ for built-in TypeScript stripping; no packages are installed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const { webcrypto } = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/google-drive-oauth/index.ts'), 'utf8');
const centreId = '11111111-1111-4111-8111-111111111111';
const otherCentreId = '22222222-2222-4222-8222-222222222222';
const coachId = '33333333-3333-4333-8333-333333333333';
const secondCoachId = '44444444-4444-4444-8444-444444444444';

function fixture({ role = 'coach', config = {}, email = 'coach@google.test', tokens = {}, stored = null, authFailure = false } = {}) {
  const tables = {
    centre_memberships: [{ centre_id: centreId, user_id: coachId, role }, { centre_id: centreId, user_id: secondCoachId, role: 'coach' }],
    centres: [{ id: centreId, slug: 'test-centre', name: 'Test Centre', status: 'active' }],
    coaches: [{ id: coachId, name: 'Coach' }],
    coach_drive_connections: stored ? [{ coach_id: coachId, centre_id: centreId, ...stored }] : [],
    coach_drive_oauth_states: [], audit_logs: [], students: []
  };
  const env = {
    SUPABASE_URL: 'https://fixture.supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key',
    GOOGLE_CLIENT_ID: 'fixture-client-id', GOOGLE_CLIENT_SECRET: 'fixture-google-secret',
    GOOGLE_REDIRECT_URI: 'https://app.test/api/auth/google-drive/callback',
    DRIVE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString('base64'), ...config
  };
  const googleCalls = [], authCalls = [], databaseCalls = [];
  function query(table) {
    databaseCalls.push(table);
    let selection = '*', op = 'read', values, max = Infinity;
    const filters = [];
    const q = {
      select(fields = '*') { selection = fields; return q; },
      eq(field, value) { filters.push(row => row[field] === value); return q; },
      gt(field, value) { filters.push(row => row[field] > value); return q; },
      in(field, values) { filters.push(row => values.includes(row[field])); return q; },
      limit(n) { max = n; return q; }, order() { return q; },
      delete() { op = 'delete'; return q; },
      insert(value) { op = 'insert'; values = value; return q; },
      upsert(value) { op = 'upsert'; values = value; return q; },
      update(value) { op = 'update'; values = value; return q; },
      maybeSingle: async () => execute(true), single: async () => execute(true),
      then(resolve, reject) { return Promise.resolve(execute(false)).then(resolve, reject); }
    };
    function execute(single) {
      const tableRows = tables[table] ||= [];
      let rows = tableRows.filter(row => filters.every(f => f(row))).slice(0, max);
      if (op === 'delete') tables[table] = tableRows.filter(row => !rows.includes(row));
      if (op === 'insert') { rows = [structuredClone(values)]; tableRows.push(...rows); }
      if (op === 'upsert') {
        let existing = tableRows.find(row => row.coach_id === values.coach_id);
        if (existing) Object.assign(existing, structuredClone(values));
        else { existing = structuredClone(values); tableRows.push(existing); }
        rows = [existing];
      }
      if (op === 'update') rows.forEach(row => Object.assign(row, values));
      rows = rows.map(row => selection === '*' ? structuredClone(row)
        : Object.fromEntries(selection.split(',').map(f => f.trim()).filter(f => f in row).map(f => [f, row[f]])));
      return { data: single ? rows[0] || null : rows, error: null };
    }
    return q;
  }
  const admin = {
    from: query,
    auth: { getUser: async token => {
      authCalls.push(token);
      if (authFailure) throw Error('Auth unavailable');
      return token === 'valid-coach-session'
        ? { data: { user: { id: coachId, app_metadata: {} } }, error: null }
        : token === 'other-coach-session'
          ? { data: { user: { id: secondCoachId, app_metadata: {} } }, error: null }
          : { data: { user: null }, error: { message: 'Expired session' } };
    } }
  };
  const sandbox = {
    console, Request, Response, URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array, Date, Map, Set,
    atob, btoa, crypto: webcrypto,
    createClient: () => admin,
    Deno: { env: { get: key => env[key] }, serve: handler => { sandbox.handler = handler; } },
    fetch: async (url, options = {}) => {
      googleCalls.push({ url: String(url), options });
      if (String(url) === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'fixture-access-token', refresh_token: 'fixture-refresh-token', expires_in: 3600, ...tokens });
      if (String(url) === 'https://openidconnect.googleapis.com/v1/userinfo') return Response.json({ email, email_verified: true });
      if (String(url).startsWith('https://www.googleapis.com/drive/v3/files')) return Response.json({ id: 'fixture-root-folder' });
      throw Error(`Unexpected Google request: ${url}`);
    }
  };
  const context = vm.createContext(sandbox);
  const code = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, '').replace(/^export /gm, ''), { mode: 'strip' });
  vm.runInContext(code + '\nglobalThis.decryptStoredToken = decryptRefreshToken;', context);
  return {
    tables, env, googleCalls, authCalls, databaseCalls,
    decryptStored: sealed => context.decryptStoredToken(sealed, env.DRIVE_TOKEN_ENCRYPTION_KEY),
    request: async (body, { token = 'valid-coach-session', method = 'POST', authorization = null } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (authorization !== null) headers.authorization = authorization;
      else if (token) headers.authorization = `Bearer ${token}`;
      const response = await sandbox.handler(new Request('https://fixture.supabase.test/functions/v1/google-drive-oauth', {
        method, headers, ...(method === 'POST' ? { body: JSON.stringify(body) } : {})
      }));
      return { status: response.status, headers: response.headers,
        body: method === 'OPTIONS' ? await response.text() : await response.json() };
    }
  };
}
async function start(f) {
  const connected = await f.request({ action: 'connect', centre_id: centreId });
  assert.equal(connected.status, 200, JSON.stringify(connected.body));
  return new URL(connected.body.authorization_url).searchParams.get('state');
}
async function finish(f, state, options = {}) {
  return f.request({ action: 'callback', centre_id: centreId, code: 'fixture-code', state }, options);
}

test('coach membership authorizes connect without admin metadata and binds state to that coach', async () => {
  const f = fixture();
  const state = await start(f);
  assert.ok(state.startsWith(`${centreId}|test-centre|`));
  const pending = f.tables.coach_drive_oauth_states[0];
  assert.equal(pending.user_id, coachId);
  assert.equal(pending.centre_id, centreId);
  assert.ok(pending.expires_at > new Date().toISOString());
  const response = await f.request({ action: 'connect', coach_id: secondCoachId });
  assert.equal(response.status, 200, 'centre resolves from verified membership');
  assert.equal(f.tables.coach_drive_oauth_states.at(-1).user_id, coachId);
  assert.match(response.headers.get('x-dao-drive-api-version'), /^coach-v/);
});

test('missing, malformed and expired sessions are rejected before any database or Google operations', async () => {
  const f = fixture();
  for (const options of [{ token: '' }, { token: 'invalid' }, { authorization: 'Basic abc' }]) {
    const response = await f.request({ action: 'connect', centre_id: centreId }, options);
    assert.equal(response.status, 401);
  }
  assert.equal(f.databaseCalls.length, 0);
  assert.equal(f.googleCalls.length, 0);
  const down = fixture({ authFailure: true });
  assert.equal((await down.request({ action: 'connect' })).status, 503);
});

test('centre admins cannot substitute their accounts for a coach and foreign centres remain isolated', async () => {
  const admin = fixture({ role: 'centre_admin' });
  assert.equal((await admin.request({ action: 'connect', centre_id: centreId })).status, 403);
  const coach = fixture();
  assert.equal((await coach.request({ action: 'connect', centre_id: otherCentreId })).status, 403);
  assert.equal(coach.tables.coach_drive_oauth_states.length, 0);
});

test('callback encrypts the coach token and returns only public connection fields', async () => {
  const f = fixture();
  const state = await start(f);
  const response = await finish(f, state);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.connection.coach_id, coachId);
  assert.equal(response.body.connection.centre_id, centreId);
  assert.equal(response.body.connection.status, 'connected');
  assert.ok(!JSON.stringify(response.body).includes('refresh_token'));
  const sealed = f.tables.coach_drive_connections[0].encrypted_refresh_token;
  assert.ok(!sealed.includes('fixture-refresh-token'));
  assert.equal(await f.decryptStored(sealed), 'fixture-refresh-token');
  assert.equal(f.tables.coach_drive_oauth_states.length, 0);
  const status = await f.request({ action: 'connection-status', centre_id: centreId });
  assert.equal(status.body.connection.coach_id, coachId);
  assert.ok(!JSON.stringify(status.body).includes(sealed));
});

test('expired, replayed, different-coach and mismatched-centre callbacks cannot exchange tokens', async () => {
  const f = fixture();
  const state = await start(f);
  assert.equal((await finish(f, state, { token: 'other-coach-session' })).status, 403);
  assert.equal(f.tables.coach_drive_oauth_states.length, 1, 'foreign user did not consume the coach state');
  assert.equal((await f.request({ action: 'callback', centre_id: otherCentreId, code: 'code', state })).status, 403);
  assert.equal(f.googleCalls.length, 0);
  f.tables.coach_drive_oauth_states[0].expires_at = '2000-01-01T00:00:00.000Z';
  assert.equal((await finish(f, state)).status, 403);
  assert.equal(f.googleCalls.length, 0);
  const replay = fixture();
  const valid = await start(replay);
  assert.equal((await finish(replay, valid)).status, 200);
  assert.equal((await finish(replay, valid)).status, 403);
  assert.equal(replay.googleCalls.filter(c => c.url === 'https://oauth2.googleapis.com/token').length, 1);
});

test('concurrent callback attempts consume a state only once', async () => {
  const f = fixture();
  const state = await start(f);
  const responses = await Promise.all([finish(f, state), finish(f, state)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 403]);
  assert.equal(f.googleCalls.filter(c => c.url === 'https://oauth2.googleapis.com/token').length, 1);
});

test('same-account reconnect without a new refresh token preserves the original folder and encrypted token', async () => {
  const f = fixture({ tokens: { refresh_token: undefined }, stored: {
    google_account_email: 'coach@google.test', encrypted_refresh_token: 'existing.encrypted-token',
    root_folder_id: 'old-root', root_folder_name: 'Original coach reports', root_folder_url: 'https://drive.google.com/drive/folders/old-root'
  } });
  const response = await finish(f, await start(f));
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(f.tables.coach_drive_connections[0].encrypted_refresh_token, 'existing.encrypted-token');
  assert.equal(response.body.connection.root_folder_id, 'old-root');
  assert.equal(f.googleCalls.filter(c => c.url.startsWith('https://www.googleapis.com/drive/v3/files') && c.options.method === 'POST').length, 0);
});

test('switching Google accounts cannot reuse the previous account refresh token', async () => {
  const f = fixture({ email: 'different@google.test', tokens: { refresh_token: undefined }, stored: {
    google_account_email: 'coach@google.test', encrypted_refresh_token: 'existing.encrypted-token', root_folder_id: 'old-root'
  } });
  const response = await finish(f, await start(f));
  assert.equal(response.status, 409);
  assert.equal(f.tables.coach_drive_connections[0].google_account_email, 'coach@google.test');
  assert.equal(f.tables.coach_drive_connections[0].encrypted_refresh_token, 'existing.encrypted-token');
});

test('incomplete OAuth configuration is caught before creating pending state', async () => {
  for (const key of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'DRIVE_TOKEN_ENCRYPTION_KEY']) {
    const f = fixture({ config: { [key]: undefined } });
    assert.equal((await f.request({ action: 'connect', centre_id: centreId })).status, 503, key);
    assert.equal(f.tables.coach_drive_oauth_states.length, 0);
  }
});

test('a coach cannot save a report into another coach account', async () => {
  const f = fixture();
  const response = await f.request({ action: 'report-save', centre_id: centreId, record: {
    schemaVersion: 1, recordType: 'draft', id: 'draft-fixture', coachId: secondCoachId, summary: {}
  } });
  assert.equal(response.status, 403);
  assert.equal(f.googleCalls.length, 0);
});

test('CORS preflight is public but Google actions require POST and a verified session', async () => {
  const f = fixture();
  const preflight = await f.request(null, { method: 'OPTIONS', token: '' });
  assert.equal(preflight.status, 200);
  assert.ok(preflight.headers.get('access-control-allow-methods').includes('POST'));
  assert.equal((await f.request(null, { method: 'GET' })).status, 405);
  assert.equal(f.authCalls.length, 0);
});

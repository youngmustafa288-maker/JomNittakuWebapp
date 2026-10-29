import { normalizeReportRecord } from "./report-drive.js";

const DB_NAME = "dao-report-hybrid-v1";
const CACHE_LIMIT = 100;
const emptyWorkspace = scope => ({ scope, entries: {}, updatedAt: 0 });

export function reportWorkspaceKey({ project, userId, role, centreId }) {
  if (!project || !userId || !centreId || !["coach", "centre_admin", "admin"].includes(role)) {
    throw new Error("An authenticated report workspace is required");
  }
  return JSON.stringify([project, userId, role, centreId]);
}

// All changes are read/modify/write transactions, including outbox claims and
// acknowledgements. Two tabs must not erase edits made while a sync is running.
export function createIndexedDbReportStore(indexedDB = globalThis.indexedDB) {
  let opening;
  function open() {
    if (!indexedDB) return Promise.reject(new Error("Local report storage is unavailable"));
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("workspaces", { keyPath: "scope" });
        const entries = request.result.createObjectStore("entries", { keyPath: "key" });
        entries.createIndex("scope", "scope");
        entries.createIndex("pending", ["scope", "pending"]);
      };
      request.onerror = () => { opening = null; reject(request.error); };
      request.onblocked = () => { opening = null; reject(new Error("Close other app tabs to enable local saving")); };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); opening = null; };
        resolve(db);
      };
    });
    return opening;
  }
  async function transact(scope, change, { id = null, pendingOnly = false, readonly = false } = {}) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(["workspaces", "entries"], readonly ? "readonly" : "readwrite");
        const meta = tx.objectStore("workspaces"), entries = tx.objectStore("entries");
        const get = id ? entries.get([scope, id]) : pendingOnly ? entries.index("pending").getAll([scope, 1]) : entries.index("scope").getAll(scope);
        const getMeta = meta.get(scope);
        let result, failure, loaded = 0;
        const apply = () => {
          if (++loaded !== 2) return;
          try {
            const rows = id ? get.result ? [get.result] : [] : get.result;
            const state = { ...emptyWorkspace(scope), ...getMeta.result, entries: Object.fromEntries(rows.map(row => [row.entry.record.id, row.entry])) };
            result = change(state);
            if (readonly) return;
            for (const row of rows) if (!state.entries[row.entry.record.id]) entries.delete(row.key);
            for (const entry of Object.values(state.entries)) entries.put({ key: [scope, entry.record.id], scope, pending: entry.dirty ? 1 : 0, entry });
            meta.put({ scope, updatedAt: state.updatedAt });
          } catch (error) { failure = error; tx.abort(); }
        };
        get.onsuccess = getMeta.onsuccess = apply;
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error("Local report save failed"));
      });
  }
  return {
    update: (scope, change) => transact(scope, change),
    updateEntry: (scope, id, change) => transact(scope, change, { id }),
    updatePending: (scope, change) => transact(scope, change, { pendingOnly: true }),
    read: scope => transact(scope, state => state, { readonly: true }),
    async summary(scope) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("entries", "readonly");
        const index = tx.objectStore("entries").index("pending");
        const dirty = index.getAll([scope, 1]), clean = index.getAllKeys([scope, 0]);
        tx.oncomplete = () => resolve({
          pending: dirty.result.map(({ entry }) => ({ id: entry.record.id, error: entry.error || "", blocked: Boolean(entry.blocked) })),
          syncedDraftIds: clean.result.map(key => key[1]).filter(id => id.startsWith("draft-")),
        });
        tx.onabort = tx.onerror = () => reject(tx.error || new Error("Local sync status unavailable"));
      });
    },
  };
}

export function createHybridReportWorkspace({ store, scope, actorId, remote, getRoot, isActive = () => true, onChange = () => {}, now = Date.now, uuid = () => crypto.randomUUID() }) {
  let syncing = null;
  const update = change => store.update(scope, change);
  const updateEntry = (id, change) => store.updateEntry ? store.updateEntry(scope, id, change) : update(change);
  const updatePending = change => store.updatePending ? store.updatePending(scope, change) : update(change);
  function view(state) {
    return {
      records: Object.values(state.entries).filter(entry => entry.dirty || !getRoot(entry.record.coachId) || entry.root === getRoot(entry.record.coachId)).map(entry => normalizeReportRecord(entry.record)),
      pending: Object.values(state.entries).filter(entry => entry.dirty).map(entry => ({
        id: entry.record.id, error: entry.error || "", blocked: Boolean(entry.blocked),
      })),
      updatedAt: state.updatedAt,
    };
  }
  async function snapshot() { return store.read ? view(await store.read(scope)) : update(state => view(state)); }
  async function notify() { const data = store.summary ? await store.summary(scope) : await snapshot(); if (isActive()) onChange(data); }
  function prune(state) {
    const synced = Object.values(state.entries).filter(entry => !entry.dirty)
      .sort((a, b) => `${b.record.date || ""}T${b.record.time || ""}`.localeCompare(`${a.record.date || ""}T${a.record.time || ""}`));
    for (const entry of synced.slice(CACHE_LIMIT)) delete state.entries[entry.record.id];
  }
  return {
    snapshot,
    async cache(records, { complete = true } = {}) {
      const normalized = records.map(normalizeReportRecord);
      await update(state => {
        const seen = new Set(normalized.map(record => record.id));
        for (const record of normalized) {
          const old = state.entries[record.id];
          if (old?.dirty) continue;
          state.entries[record.id] = { record, base: record, root: getRoot(record.coachId) || "", dirty: false };
        }
        if (complete) for (const [id, entry] of Object.entries(state.entries)) {
          if (!entry.dirty && !seen.has(id)) delete state.entries[id];
        }
        state.updatedAt = now();
        prune(state);
      });
      return snapshot();
    },
    async queue(record, { baseRecord = null } = {}) {
      if (!isActive()) throw new Error("Sign in to this workspace before saving");
      const normalized = normalizeReportRecord(record);
      if (normalized.recordType !== "draft") throw new Error("Only drafts can be saved locally before Drive confirmation");
      const root = getRoot(normalized.coachId);
      await updateEntry(normalized.id, state => {
        const old = state.entries[normalized.id];
        if (!root && !old?.root) throw new Error("Connect this coach's Drive before creating a local draft");
        state.entries[normalized.id] = {
          ...old, record: normalized, base: old ? old.base : baseRecord ? normalizeReportRecord(baseRecord) : null, root: old?.root || root,
          dirty: true, revision: uuid(), error: old?.blocked ? old.error : "", blocked: Boolean(old?.blocked),
        };
      });
      await notify();
      return normalized;
    },
    async sync() {
      if (syncing) return syncing;
      syncing = (async () => {
        // A finite pass prevents constant typing from monopolizing the worker.
        for (let count = 0; count < 20 && isActive(); count++) {
          const token = uuid();
          const job = await updatePending(state => {
            const entry = Object.values(state.entries).sort((a, b) => (a.lastAttemptAt || 0) - (b.lastAttemptAt || 0))
              .find(item => item.dirty && !item.blocked && getRoot(item.record.coachId) && (!item.lease || item.lease.until < now()));
            if (!entry) return null;
            const root = getRoot(entry.record.coachId);
            if (!root) return null;
            if (entry.root !== root) {
              entry.blocked = true;
              entry.error = "The connected Google account changed. Save a copy to the current Drive or export your local draft.";
              return { skipped: true };
            }
            entry.lease = { token, until: now() + 120000 };
            entry.lastAttemptAt = now();
            return structuredClone(entry);
          });
          if (!job) break;
          if (job.skipped) continue;
          try {
            if (!isActive()) {
              await updateEntry(job.record.id, state => { const entry = state.entries[job.record.id]; if (entry?.lease?.token === token) entry.lease = null; });
              break;
            }
            const saved = await remote.save(job.record, {
              centreId: JSON.parse(scope)[3],
              hybrid: { version: 1, actor_id: actorId, root_folder_id: job.root, base_record: job.base },
            });
            await updateEntry(job.record.id, state => {
              const entry = state.entries[job.record.id];
              if (entry?.lease?.token !== token) return;
              entry.base = normalizeReportRecord(saved);
              entry.lease = null;
              entry.error = "";
              if (entry.revision === job.revision) { entry.record = entry.base; entry.dirty = false; }
            });
          } catch (error) {
            await updateEntry(job.record.id, state => {
              const entry = state.entries[job.record.id];
              if (entry?.lease?.token !== token) return;
              entry.lease = null;
              entry.error = error.message || "Google Drive sync failed";
              entry.blocked = ["DRAFT_CONFLICT", "DRIVE_SOURCE_CHANGED"].includes(error.code)
                || /^(Draft conflict:|Drive account changed:)/.test(entry.error);
            });
            break; // Network/config failures retry later, rather than in a loop.
          }
        }
        await notify();
        return store.summary ? store.summary(scope) : snapshot();
      })();
      try { return await syncing; } finally { syncing = null; }
    },
    async confirmDraft(id) {
      await this.sync();
      const entry = await updateEntry(id, state => structuredClone(state.entries[id] || null));
      if (!entry || entry.dirty) throw new Error(entry?.error || "This draft is saved on this device. Sync it to Google Drive before generating the report.");
      return entry.record;
    },
    async complete(report, draftId) {
      const normalized = normalizeReportRecord(report);
      await update(state => {
        delete state.entries[draftId];
        state.entries[normalized.id] = { record: normalized, base: normalized, root: getRoot(normalized.coachId) || "", dirty: false };
        state.updatedAt = now();
        prune(state);
      });
      await notify();
    },
    async copyDraft(id) {
      const record = await update(state => {
        const old = state.entries[id];
        if (!old?.dirty) throw new Error("No local draft needs copying");
        const root = getRoot(old.record.coachId);
        if (!root) throw new Error("Connect the coach's Drive before saving a copy");
        const copy = normalizeReportRecord({ ...old.record, id: `draft-${uuid()}`, ref: `${old.record.ref || "Draft"} (copy)`.slice(0, 80) });
        state.entries[copy.id] = { record: copy, base: null, root, dirty: true, revision: uuid() };
        if (old.base) state.entries[id] = { record: old.base, base: old.base, root: old.root, dirty: false };
        else delete state.entries[id];
        return copy;
      });
      await notify();
      return record;
    },
    async clearSynced() {
      await update(state => {
        for (const [id, entry] of Object.entries(state.entries)) if (!entry.dirty) delete state.entries[id];
      });
      return snapshot();
    },
  };
}

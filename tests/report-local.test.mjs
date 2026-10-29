import { test } from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { createIndexedDbReportStore, createHybridReportWorkspace, reportWorkspaceKey } from "../src/report-local.js";
import { createReportDriveRepository } from "../src/report-drive.js";

const draft = (id = "draft-local", text = "Local edit") => ({ schemaVersion: 1, recordType: "draft", id, coachId: "coach-1", studentId: "student-1", date: "2026-10-29", summary: { remarks: text } });
const report = id => ({ ...draft(id), recordType: "report" });
const key = values => reportWorkspaceKey({ project: "https://project.test", userId: "user-1", role: "coach", centreId: "centre-1", ...values });
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function setup(options = {}) {
  const store = options.store || createIndexedDbReportStore(options.indexedDB || new IDBFactory());
  let active = true, root = "root-1";
  const calls = [];
  const workspace = createHybridReportWorkspace({
    store, scope: options.scope || key(), actorId: "user-1",
    remote: { save: async (record, context) => { calls.push({ record, context }); return options.save ? options.save(record, context) : record; } },
    getRoot: () => root, isActive: () => active, ...options,
  });
  return { workspace, store, calls, setRoot: value => { root = value; }, deactivate: () => { active = false; } };
}

test("draft queue commits to IndexedDB without waiting for or contacting Drive", async () => {
  const h = setup({ save: () => new Promise(() => {}) });
  await h.workspace.queue(draft());
  assert.equal(h.calls.length, 0);
  const state = await h.workspace.snapshot();
  assert.equal(state.pending.length, 1);
  assert.equal(state.records[0].summary.remarks, "Local edit");
});

test("new store/workspace instances recover durable edits after a reload", async () => {
  const indexedDB = new IDBFactory();
  const first = setup({ indexedDB });
  await first.workspace.queue(draft());
  const second = setup({ indexedDB });
  assert.equal((await second.workspace.snapshot()).records[0].summary.remarks, "Local edit");
  await second.workspace.sync();
  assert.equal(second.calls[0].context.hybrid.root_folder_id, "root-1");
  assert.equal((await second.workspace.snapshot()).pending.length, 0);
});

test("project, user, centre and role each isolate the local workspace", async () => {
  const store = createIndexedDbReportStore(new IDBFactory());
  const first = setup({ store });
  await first.workspace.queue(draft());
  for (const change of [{ project: "other" }, { userId: "other" }, { centreId: "other" }, { role: "centre_admin" }]) {
    assert.equal((await setup({ store, scope: key(change) }).workspace.snapshot()).records.length, 0);
  }
  assert.throws(() => key({ userId: "" }), /authenticated/);
});

test("failed sync retains edits and retry acknowledges the confirmed Drive version", async () => {
  let offline = true;
  const h = setup({ save: record => { if (offline) throw Error("Offline"); return record; } });
  await h.workspace.queue(draft());
  await h.workspace.sync();
  assert.match((await h.workspace.snapshot()).pending[0].error, /Offline/);
  await assert.rejects(h.workspace.confirmDraft("draft-local"), /Offline/);
  offline = false;
  await h.workspace.sync();
  assert.equal((await h.workspace.snapshot()).pending.length, 0);
  assert.equal((await h.workspace.confirmDraft("draft-local")).id, "draft-local");
});

test("edits during an upload are not erased by its acknowledgement", async () => {
  const waiting = deferred();
  let count = 0;
  const h = setup({ save: record => ++count === 1 ? waiting.promise : record });
  await h.workspace.queue(draft());
  const syncing = h.workspace.sync();
  while (!h.calls.length) await tick();
  await h.workspace.queue(draft("draft-local", "Newer typing"));
  waiting.resolve(h.calls[0].record);
  await syncing;
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].context.hybrid.base_record.summary.remarks, "Local edit");
  assert.equal((await h.workspace.snapshot()).records[0].summary.remarks, "Newer typing");
});

test("two tabs claim a pending draft once using real IndexedDB transactions", async () => {
  const indexedDB = new IDBFactory(), waiting = deferred();
  const one = setup({ indexedDB, save: () => waiting.promise });
  const two = setup({ indexedDB });
  await one.workspace.queue(draft());
  const firstSync = one.workspace.sync();
  while (!one.calls.length) await tick();
  await two.workspace.sync();
  assert.equal(two.calls.length, 0);
  waiting.resolve(one.calls[0].record);
  await firstSync;
  assert.equal((await two.workspace.snapshot()).pending.length, 0);
});

test("refresh merges pending edits and preserves missing coaches on a partial result", async () => {
  const h = setup();
  await h.workspace.cache([draft(), report("report-cached")]);
  await h.workspace.queue(draft("draft-local", "Unsynced"));
  await h.workspace.cache([draft("draft-local", "Older cloud")], { complete: false });
  const state = await h.workspace.snapshot();
  assert.equal(state.records.find(r => r.id === "draft-local").summary.remarks, "Unsynced");
  assert.equal(state.records.some(r => r.id === "report-cached"), true);
});

test("detected conflicts are held locally and can be copied without overwriting Drive", async () => {
  const h = setup({ save: () => { throw Object.assign(Error("Draft conflict: changed elsewhere"), { code: "DRAFT_CONFLICT" }); } });
  await h.workspace.cache([draft("draft-local", "Original")]);
  await h.workspace.queue(draft("draft-local", "Offline work"));
  await h.workspace.sync();
  await h.workspace.sync();
  assert.equal(h.calls.length, 1);
  assert.equal((await h.workspace.snapshot()).pending[0].blocked, true);
  const copy = await h.workspace.copyDraft("draft-local");
  assert.notEqual(copy.id, "draft-local");
  assert.equal(copy.summary.remarks, "Offline work");
  assert.equal((await h.workspace.snapshot()).records.find(r => r.id === "draft-local").summary.remarks, "Original");
});

test("changing Google accounts hides old synced cache and blocks the old outbox", async () => {
  const h = setup();
  await h.workspace.cache([report("report-old")]);
  await h.workspace.queue(draft());
  h.setRoot("different-root");
  await h.workspace.sync();
  const state = await h.workspace.snapshot();
  assert.equal(h.calls.length, 0);
  assert.equal(state.records.some(r => r.id === "report-old"), false);
  assert.equal(state.pending[0].blocked, true);
});

test("finalization requires a synced draft and completion removes only that draft", async () => {
  const h = setup();
  await h.workspace.queue(draft());
  await h.workspace.confirmDraft("draft-local");
  await h.workspace.queue(draft("draft-other"));
  await h.workspace.complete(report("report-local"), "draft-local");
  const state = await h.workspace.snapshot();
  assert.equal(state.records.some(r => r.id === "draft-local"), false);
  assert.equal(state.records.some(r => r.id === "report-local"), true);
  assert.equal(state.pending[0].id, "draft-other");
});

test("cache bounds and clear never evict unsynced drafts", async () => {
  const h = setup();
  await h.workspace.queue(draft());
  await h.workspace.cache(Array.from({ length: 130 }, (_, i) => report(`report-${i}`)));
  assert.equal((await h.workspace.snapshot()).records.length, 101);
  await h.workspace.clearSynced();
  const state = await h.workspace.snapshot();
  assert.equal(state.records.length, 1);
  assert.equal(state.pending[0].id, "draft-local");
});

test("inactive workspaces cannot queue or start uploads", async () => {
  const h = setup();
  await h.workspace.queue(draft());
  h.deactivate();
  await h.workspace.sync();
  assert.equal(h.calls.length, 0);
  await assert.rejects(h.workspace.queue(draft()), /Sign in/);
});

test("quota failures reject local saving without claiming persistence or contacting Drive", async () => {
  const h = setup({ store: { update: async () => { throw Error("Quota exceeded"); } } });
  await assert.rejects(h.workspace.queue(draft()), /Quota exceeded/);
  assert.equal(h.calls.length, 0);
});

test("older backends cannot silently discard the draft conflict/source safeguards", async () => {
  const actions = [];
  const remote = createReportDriveRepository(async body => { actions.push(body.action); return { certificateDesignVersion: 1 }; });
  await assert.rejects(remote.save(draft(), { centreId: "centre-1", hybrid: { version: 1 } }), /Update the report service/);
  assert.deepEqual(actions, ["report-template-capabilities"]);
});

test("saving and syncing one draft does not read or rewrite the cached report collection", async () => {
  const h = setup();
  await h.workspace.cache(Array.from({ length: 100 }, (_, i) => report(`report-${i}`)));
  h.store.read = () => { throw Error("Full cache read during an edit"); };
  h.store.update = () => { throw Error("Full cache rewrite during an edit"); };
  await h.workspace.queue(draft());
  await h.workspace.sync();
  assert.equal(h.calls.length, 1);
  assert.equal((await h.workspace.confirmDraft("draft-local")).id, "draft-local");
});

test("a disconnected coach does not block another coach's pending draft", async () => {
  const roots = { "coach-1": "root-1", "coach-2": "root-2" };
  const h = setup({ scope: key({ role: "centre_admin" }), getRoot: id => roots[id] || "" });
  await h.workspace.queue(draft());
  await h.workspace.queue({ ...draft("draft-second"), coachId: "coach-2" });
  delete roots["coach-1"];
  await h.workspace.sync();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].record.coachId, "coach-2");
  assert.equal((await h.workspace.snapshot()).pending[0].id, "draft-local");
});

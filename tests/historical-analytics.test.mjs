import test from "node:test";
import assert from "node:assert/strict";
import { HistoricalStore } from "../src/core/storage/historical-store.js";
import { summarizeAnalytics } from "../src/core/analytics/statistics-engine.js";
import { CollectionCoordinator } from "../src/core/collection/collection-coordinator.js";
import { collectionModeFor } from "../src/core/collection/collection-state.js";
import { RenderedHistoryAdapter, extractRenderedAuthor } from "../src/integrations/betterdiscord/rendered-history-adapter.js";
import { getSelectedConversationId } from "../src/integrations/betterdiscord/conversation-selection.js";
import { groupDailyCounts, busiestHour } from "../src/core/analytics/time-series.js";
import { discoverCurrentUserId, resolveParticipant, UNRESOLVED_AUTHOR_ID } from "../src/core/identity/participant-resolver.js";

function memoryStore(options = {}) {
  let data = null;
  const store = new HistoricalStore({ load: () => data, save: next => { data = structuredClone(next); }, now: () => 1_800_000_000_000, ...options });
  return { store, read: () => data };
}

test("participant resolver separates current user, other participants, and unresolved identities", () => {
  assert.deepEqual(resolveParticipant({ authorId: "self", currentUserId: "self" }), { authorId: "self", isResolved: true, isSelf: true, role: "current-user" });
  assert.deepEqual(resolveParticipant({ authorId: "other", currentUserId: "self" }), { authorId: "other", isResolved: true, isSelf: false, role: "other-participant" });
  assert.deepEqual(resolveParticipant({ authorId: null, currentUserId: "self" }), { authorId: UNRESOLVED_AUTHOR_ID, isResolved: false, isSelf: null, role: "unresolved" });
  const document = { querySelectorAll: selector => {
    if (selector.includes("a[href")) return [{ getAttribute: () => "/users/123456789012345678", closest: () => ({}) }];
    return [];
  } };
  assert.equal(discoverCurrentUserId(document), "123456789012345678");
  assert.equal(discoverCurrentUserId({ querySelectorAll: selector => selector.includes('img[src*="/avatars/"]')
    ? [{ getAttribute: () => "https://cdn.discordapp.com/avatars/123456789012345678/hash.png", closest: () => ({}) }]
    : [] }), null);
});

test("historical store aggregates direction and time while persisting no raw message data", () => {
  const { store, read } = memoryStore();
  const records = [
    { messageId: "raw-msg-1", authorId: "p1", authorName: "Pat", timestamp: Date.UTC(2026, 0, 1, 2), isSelf: false, content: "private body" },
    { messageId: "raw-msg-2", authorId: "self", authorName: "Me", timestamp: Date.UTC(2026, 0, 1, 3), isSelf: true, content: "private body 2" },
    { messageId: "raw-msg-3", authorId: "p1", authorName: "Pat", timestamp: null, isSelf: null, content: "private body 3" },
  ];
  assert.equal(store.applyBatch("conversation-1", records).added, 3);
  assert.equal(store.applyBatch("conversation-1", records).duplicates, 3);
  const entry = store.getConversation("conversation-1");
  assert.deepEqual(entry.totals, { sent: 1, received: 1, unknown: 1 });
  assert.equal(entry.people.p1.total, 2);
  assert.equal(entry.people.p1.firstTimestamp, Date.UTC(2026, 0, 1, 2));
  assert.equal(entry.people.p1.lastTimestamp, Date.UTC(2026, 0, 1, 2));
  assert.equal(entry.daily["2026-01-01"], 2);
  assert.equal(entry.hourly[2], 1);
  assert.equal(entry.coverage.complete, false);
  const serialized = JSON.stringify(read());
  assert.equal(serialized.includes("private body"), false);
  assert.equal(serialized.includes("raw-msg-1"), false);
});

test("storage canonicalizes and reconciles duplicate person keys without merging distinct users", () => {
  let data = { version: 1, conversations: { "100": {
    conversationId: "100", navigationPath: "/channels/@me/100", people: {
      " u1 ": { authorId: " u1 ", name: "Old Name", username: "old", total: 2, sent: 2, received: 0, unknown: 0, daily: { "2026-01-01": 2 } },
      u1: { authorId: "u1", name: "New Name", username: "new", total: 3, sent: 1, received: 2, unknown: 0, daily: { "2026-01-02": 3 } },
      u2: { authorId: "u2", name: "New Name", total: 1, sent: 0, received: 1, unknown: 0 },
    }, totals: { sent: 3, received: 3, unknown: 0 }
  } } };
  const store = new HistoricalStore({ load: () => data, save: next => { data = structuredClone(next); } });
  const entry = store.getConversation("100");
  assert.equal(Object.keys(entry.people).length, 2);
  assert.equal(entry.people.u1.total, 4);
  assert.equal(entry.people.u1.sent, 2);
  assert.equal(entry.people.u1.received, 2);
  assert.deepEqual(entry.totals, { sent: 2, received: 3, unknown: 0 });
  assert.equal(entry.people.u1.name, "New Name");
  assert.equal(entry.people.u2.total, 1);

  store.applyBatch("100", [{ messageId: "new-1", authorId: "u1", authorName: "Latest Name", timestamp: Date.UTC(2026, 0, 3), isSelf: true }]);
  store.applyBatch("100", [{ messageId: "new-1", authorId: " u1 ", authorName: "Latest Name", timestamp: Date.UTC(2026, 0, 3), isSelf: true }]);
  const repeated = store.getConversation("100");
  assert.equal(repeated.people.u1.total, 5);
  assert.equal(repeated.people.u1.name, "Latest Name");
  assert.equal(repeated.people.u2.total, 1);

  store.applyBatch("100", [{ messageId: "missing-author", authorId: "", authorName: "Nobody", timestamp: Date.UTC(2026, 0, 4), isSelf: false }]);
  assert.equal(store.getConversation("100").totals.received, 3);
});

test("snapshot reconciles duplicate stable conversation IDs without summing copied history", () => {
  let data = { version: 1, conversations: {
    "123456789012345678": {
      conversationId: "123456789012345678", navigationPath: "/channels/@me/123456789012345678",
      totals: { sent: 0, received: 2, unknown: 0 }, people: {
        "user-a": { authorId: "user-a", name: "Same Name", total: 2, sent: 0, received: 2, unknown: 0, daily: { "2026-01-01": 2 } },
      }, seenMessageKeys: ["a", "b"], updatedAt: 10,
    },
    " 123456789012345678 ": {
      conversationId: " 123456789012345678 ", navigationPath: "/channels/@me/123456789012345678",
      totals: { sent: 0, received: 2, unknown: 0 }, people: {
        "user-a": { authorId: "user-a", name: "Same Name", total: 2, sent: 0, received: 2, unknown: 0, daily: { "2026-01-01": 2 } },
      }, seenMessageKeys: ["b", "c"], updatedAt: 20,
    },
  } };
  let writes = 0;
  const store = new HistoricalStore({ load: () => data, save: next => { writes++; data = structuredClone(next); } });
  const snapshot = store.snapshot();
  assert.deepEqual(Object.keys(snapshot.conversations), ["123456789012345678"]);
  assert.equal(snapshot.conversations["123456789012345678"].people["user-a"].total, 2);
  assert.deepEqual(snapshot.conversations["123456789012345678"].seenMessageKeys.sort(), ["a", "b", "c"]);
  assert.equal(writes, 1);
  store.snapshot();
  assert.equal(writes, 1, "reconciliation is idempotent");
});

test("legacy records without stable user IDs remain unattributed instead of being dropped", () => {
  const data = { version: 1, conversations: { thread: {
    conversationId: "thread", totals: { sent: 0, received: 0, unknown: 2 },
    people: { unknown: { name: "Old Display Name", total: 2, unknown: 2 } },
  } } };
  const store = new HistoricalStore({ load: () => data, save: () => {} });
  const person = store.getConversation("thread").people[UNRESOLVED_AUTHOR_ID];
  assert.equal(person.total, 2);
  assert.equal(person.name, "Unresolved sender");
});

test("store clears one conversation or all saved statistics", () => {
  const { store } = memoryStore();
  store.applyBatch("a", [{ messageId: "1", authorId: "p" }]);
  store.applyBatch("b", [{ messageId: "2", authorId: "q" }]);
  store.clearConversation("a");
  assert.equal(store.getConversation("a"), null);
  assert.ok(store.getConversation("b"));
  store.clearAll();
  assert.deepEqual(store.snapshot().conversations, {});
});

test("saved aggregates survive a new store instance and stored data is schema-sanitized", () => {
  let data = null;
  const save = next => { data = structuredClone(next); };
  const first = new HistoricalStore({ load: () => data, save });
  first.applyBatch("c", [{ messageId: "one", authorId: "u", timestamp: Date.UTC(2026, 0, 1), content: "must not persist" }]);
  const second = new HistoricalStore({ load: () => data, save });
  assert.equal(second.getConversation("c").people.u.total, 1);
  data.conversations.c.rawMessages = [{ content: "poison" }];
  const safe = second.snapshot();
  assert.equal(JSON.stringify(safe).includes("poison"), false);
  assert.equal("rawMessages" in safe.conversations.c, false);
});

test("statistics summarize per-person totals, date filters, and exclusions", () => {
  const { store } = memoryStore();
  store.applyBatch("a", [
    { messageId: "1", authorId: "p", authorName: "Pat", timestamp: Date.UTC(2026, 1, 1), isSelf: false },
    { messageId: "2", authorId: "self", authorName: "Me", timestamp: Date.UTC(2026, 1, 2), isSelf: true },
  ]);
  let result = summarizeAnalytics(store.snapshot());
  assert.deepEqual(result.totals, { sent: 1, received: 1, unknown: 0, tracked: 2 });
  assert.equal(result.people[0].name, "Pat");
  store.setAuthorExcluded("a", "p", true);
  assert.equal(summarizeAnalytics(store.snapshot()).people.some(person => person.authorId === "p"), false);
  result = summarizeAnalytics(store.snapshot(), { since: Date.UTC(2026, 1, 2) });
  assert.equal(result.daily.length, 1);
  assert.deepEqual(result.totals, { sent: 1, received: 0, unknown: 0, tracked: 1 });
  assert.equal(result.people[0].name, "Me");
});

test("statistics can safely classify existing unknown aggregates when the current user ID is verified", () => {
  const { store } = memoryStore();
  store.applyBatch("verified-thread", [
    { messageId: "self-unknown", authorId: "self", timestamp: Date.UTC(2026, 1, 1), isSelf: null },
    { messageId: "other-unknown", authorId: "other", timestamp: Date.UTC(2026, 1, 1), isSelf: null },
    { messageId: "unresolved", authorId: UNRESOLVED_AUTHOR_ID, timestamp: Date.UTC(2026, 1, 2), isSelf: null },
  ]);
  const result = summarizeAnalytics(store.snapshot(), { currentUserId: "self" });
  assert.deepEqual(result.totals, { sent: 1, received: 1, unknown: 1, tracked: 3 });
  const filtered = summarizeAnalytics(store.snapshot(), { currentUserId: "self", since: Date.UTC(2026, 1, 1), until: Date.UTC(2026, 1, 1, 23, 59, 59, 999) });
  assert.deepEqual(filtered.totals, { sent: 1, received: 1, unknown: 0, tracked: 2 });
});

test("time series groups weekly and monthly totals and identifies the busiest hour", () => {
  const daily = { "2026-02-01": 2, "2026-02-02": 3, "2026-03-03": 4 };
  assert.deepEqual(groupDailyCounts(daily, "month"), [{ period: "2026-02", count: 5 }, { period: "2026-03", count: 4 }]);
  assert.deepEqual(groupDailyCounts(daily, "week"), [
    { period: "2026-W05", count: 2 },
    { period: "2026-W06", count: 3 },
    { period: "2026-W10", count: 4 },
  ]);
  assert.deepEqual(busiestHour([0, 2, 5, 1]), { hour: 2, count: 5 });
});

test("collection coordinator handles selected source batches, duplicate refreshes, and partial coverage", async () => {
  const { store } = memoryStore();
  let calls = 0;
  const adapter = {
    async startScan({ conversationId }) { assert.equal(conversationId, "c1"); },
    async getNextBatch() { calls++; return { records: [{ id: "m1", author_id: "u1", timestamp: "2026-02-01T00:00:00Z", content: "secret" }], done: true, complete: false, source: "rendered-test" }; },
    async dispose() {},
  };
  const coordinator = new CollectionCoordinator({ adapter, store });
  const results = await Promise.all([coordinator.collect("c1"), coordinator.collect("c1")]);
  assert.equal(calls, 1);
  assert.equal(results[0].status, "partial");
  assert.equal(store.getConversation("c1").people.u1.total, 1);
  assert.equal(store.getConversation("c1").coverage.complete, false);
  await coordinator.collect("c1");
  assert.equal(store.getConversation("c1").people.u1.total, 1);
});

test("collection coordinator passes the current-user identity into sender normalization", async () => {
  const { store } = memoryStore();
  const adapter = {
    async startScan() {},
    async getNextBatch() { return { records: [
      { messageId: "mine", authorId: "self-id", isSelf: false },
      { messageId: "theirs", authorId: "other-id", isSelf: true },
    ], done: true, complete: false, stopReason: "visible-edge" }; },
    async dispose() {},
  };
  await new CollectionCoordinator({ adapter, store, getCurrentUserId: () => "self-id" }).collect("thread");
  assert.deepEqual(store.getConversation("thread").totals, { sent: 1, received: 1, unknown: 0 });
});

test("rendered author extraction never treats an avatar URL as identity", () => {
  const row = {
    getAttribute: () => null,
    querySelector: selector => selector.includes("img[src")
      ? { getAttribute: () => "https://cdn.discordapp.com/avatars/123456789012345678/hash.png" }
      : null,
  };
  assert.equal(extractRenderedAuthor(row), null);
});

test("multi-batch scans count overlap once, persist run coverage, and remain idempotent after reload", async () => {
  let saved = null;
  const load = () => saved;
  const save = value => { saved = structuredClone(value); };
  const store = new HistoricalStore({ load, save });
  const batches = [
    { records: [{ id: "a", author_id: "p", timestamp: Date.UTC(2026, 0, 1) }, { id: "b", author_id: "p" }], done: false },
    { records: [{ id: "b", author_id: "p" }, { id: "c", author_id: "q" }], done: true, stopReason: "oldest-visible-edge-stable" },
  ];
  const adapter = { async startScan() {}, async getNextBatch() { return batches.shift(); }, async dispose() {} };
  const result = await new CollectionCoordinator({ adapter, store }).collect("c");
  assert.equal(result.status, "partial");
  assert.equal(result.processed, 3);
  assert.equal(result.duplicates, 1);
  assert.equal(result.encountered, 4);
  assert.equal(result.batches, 2);
  assert.equal(store.getConversation("c").coverage.stopReason, "oldest-visible-edge-stable");
  assert.equal(store.getConversation("c").coverage.duplicatesIgnored, 1);

  const restarted = new HistoricalStore({ load, save });
  const repeat = await new CollectionCoordinator({ adapter: {
    async startScan() {}, async getNextBatch() { return { records: [{ id: "a", author_id: "p" }], done: true }; },
  }, store: restarted }).collect("c");
  assert.equal(repeat.processed, 0);
  assert.equal(repeat.duplicates, 1);
  assert.equal(restarted.getConversation("c").people.p.total, 2);
});

test("initial collection completes only at its observable edge and later opens use incremental batches", async () => {
  let data = null;
  const save = value => { data = structuredClone(value); };
  const store = new HistoricalStore({ load: () => data, save });
  const events = [];
  let receivedMode;
  const adapter = {
    async startScan({ mode }) { receivedMode = mode; },
    async getNextBatch({ mode }) {
      return mode === "initial"
        ? { records: [{ id: "first", author_id: "person" }], done: true, stopReason: "oldest-visible-edge-stable" }
        : { records: [{ id: "first", author_id: "person" }, { id: "new", author_id: "person" }], done: true, stopReason: "incremental-visible-batch" };
    },
    async dispose() {},
  };
  const coordinator = new CollectionCoordinator({ adapter, store, onProgress: event => events.push(event) });

  assert.equal(collectionModeFor(store.getConversation("c")?.collection), "initial");
  const first = await coordinator.collect("c", { mode: "initial" });
  assert.equal(first.collectionState, "completed");
  assert.equal(store.getConversation("c").collection.state, "initial_completed");
  assert.equal(store.getConversation("c").collection.attempts, 1);
  assert.ok(store.getConversation("c").collection.initialCompletedAt);
  assert.equal(events[0].phase, "start");
  assert.equal(events.at(-1).phase, "finish");
  assert.equal(events.at(-1).collectionState, "completed");

  assert.equal(collectionModeFor(store.getConversation("c").collection), "incremental");
  const next = await coordinator.collect("c", { mode: "incremental" });
  assert.equal(receivedMode, "incremental");
  assert.equal(next.processed, 1);
  assert.equal(next.duplicates, 1);
  assert.equal(store.getConversation("c").people.person.total, 2);
  assert.equal(store.getConversation("c").collection.state, "initial_completed");
  assert.equal(store.getConversation("c").collection.attempts, 1);

  const reloaded = new HistoricalStore({ load: () => data, save });
  assert.equal(collectionModeFor(reloaded.getConversation("c").collection), "incremental");
  assert.equal(reloaded.getConversation("c").people.person.total, 2);
});

test("incomplete and interrupted initial attempts remain retryable and independent per conversation", async () => {
  let data = null;
  const save = value => { data = structuredClone(value); };
  const store = new HistoricalStore({ load: () => data, save });
  let stopReason = "batch-limit";
  const adapter = {
    async startScan() {},
    async getNextBatch() { return { records: [{ id: "kept", author_id: "person" }], done: true, stopReason }; },
  };
  const coordinator = new CollectionCoordinator({ adapter, store });
  const incomplete = await coordinator.collect("a", { mode: "initial" });
  assert.equal(incomplete.collectionState, "incomplete");
  assert.equal(collectionModeFor(store.getConversation("a").collection), "initial");
  stopReason = "oldest-visible-edge-stable";
  const retried = await coordinator.collect("a", { mode: "initial" });
  assert.equal(retried.processed, 0);
  assert.equal(retried.duplicates, 1);
  assert.equal(store.getConversation("a").collection.state, "initial_completed");
  assert.equal(store.getConversation("a").people.person.total, 1);

  const other = await coordinator.collect("b", { mode: "initial" });
  assert.equal(other.collectionState, "completed");
  assert.equal(store.getConversation("a").collection.attempts, 2);
  assert.equal(store.getConversation("b").collection.attempts, 1);
  assert.notEqual(store.getConversation("a").conversationId, store.getConversation("b").conversationId);
});

test("rendered author extraction supports stable links and ignores missing identities", () => {
  const row = {
    getAttribute: name => name === "data-author-id" ? " 123456789012345678 " : null,
    querySelector: () => null,
  };
  assert.equal(extractRenderedAuthor(row).authorId, "123456789012345678");
  const missing = { getAttribute: () => null, querySelector: () => null };
  assert.equal(extractRenderedAuthor(missing), null);
  const linkRow = {
    getAttribute: () => null,
    querySelector: selector => selector.includes("/users/") ? { getAttribute: () => "https://discord.com/users/987654321098765432" } : null,
  };
  assert.equal(extractRenderedAuthor(linkRow).authorId, "987654321098765432");
});

test("rendered adapter reads only the selected conversation's rendered message metadata", async () => {
  const row = {
    id: "chat-messages-123456789012345678",
    getAttribute: () => null,
    querySelector(selector) {
      if (selector.includes("/users/")) return { getAttribute: () => "/users/987654321098765432" };
      if (selector.includes("/avatars/")) return null;
      if (selector.includes("username")) return { textContent: "Pat" };
      if (selector.includes("time")) return { getAttribute: () => "2026-02-01T00:00:00Z" };
      return null;
    },
  };
  const root = mockMessageRoot(() => [row]);
  const adapter = new RenderedHistoryAdapter({
    getSelectedConversation: () => "456789012345678901",
    getCurrentUserId: () => "111111111111111111",
    getConversationPath: () => "/channels/123456789012345678/456789012345678901",
    getDocument: () => root.document,
    maxBatches: 1,
    wait: async () => {},
  });
  const scanContext = await adapter.startScan({ conversationId: "456789012345678901" });
  assert.equal(scanContext.navigationPath, "/channels/123456789012345678/456789012345678901");
  const batch = await adapter.getNextBatch({ conversationId: "456789012345678901" });
  assert.equal(batch.records.length, 1);
  assert.equal(batch.records[0].authorId, "987654321098765432");
  assert.equal(batch.records[0].content, undefined);
  assert.equal(batch.complete, false);
  await assert.rejects(adapter.startScan({ conversationId: "wrong" }), /no longer selected/);
});

test("rendered adapter scrolls the selected message list to load older rows then restores the reading position", async () => {
  let rows = [];
  const row = id => ({
    id: `chat-messages-${id}`,
    getAttribute: () => null,
    querySelector: selector => selector.includes("/users/") ? { getAttribute: () => "/users/987654321098765432" }
      : selector.includes("username") ? { textContent: "Pat" }
        : selector.includes("time") ? { getAttribute: () => "2026-02-01T00:00:00Z" } : null,
  });
  rows = [row("123456789012345678")];
  const dom = mockMessageRoot(() => rows, { initialTop: 400 });
  let waits = 0;
  const adapter = new RenderedHistoryAdapter({
    getSelectedConversation: () => "456789012345678901", getCurrentUserId: () => null,
    getDocument: () => dom.document,
    wait: async () => { waits++; if (waits === 1) { rows = [row(`${123456789012345678n - BigInt(waits)}`), ...rows]; dom.scroller.scrollHeight += 100; } else if(waits===2) { rows = [row(`${123456789012345678n - BigInt(waits)}`), rows[0]]; dom.scroller.scrollHeight += 100; } },
    maxBatches: 20, stablePasses: 3,
  });
  await adapter.startScan({ conversationId: "456789012345678901" });
  let batch;
  do { batch = await adapter.getNextBatch({ conversationId: "456789012345678901" }); } while (!batch.done);
  assert.equal(waits, 5);
  assert.equal(batch.complete, false);
  assert.equal(dom.scroller.scrollTop, 0);
  await adapter.dispose({ conversationId: "456789012345678901" });
  assert.equal(dom.scroller.scrollTop, 600);
  assert.equal(adapter.scan, null);
});

test("rendered adapter incremental refresh reads visible rows without scrolling or waiting", async () => {
  const rows = [{
    id: "chat-messages-123456789012345678", getAttribute: () => null,
    querySelector: selector => selector.includes("/users/") ? { getAttribute: () => "/users/987654321098765432" } : null,
  }];
  const dom = mockMessageRoot(() => rows, { initialTop: 400 });
  let waits = 0;
  const adapter = new RenderedHistoryAdapter({
    getSelectedConversation: () => "456789012345678901", getCurrentUserId: () => null,
    getDocument: () => dom.document, wait: async () => { waits++; },
  });
  await adapter.startScan({ conversationId: "456789012345678901", mode: "incremental" });
  const batch = await adapter.getNextBatch({ conversationId: "456789012345678901" });
  assert.equal(batch.done, true);
  assert.equal(batch.stopReason, "incremental-visible-batch");
  assert.equal(batch.records.length, 1);
  assert.equal(dom.scroller.scrollTop, 400);
  assert.equal(waits, 0);
});

function mockMessageRoot(getRows, { initialTop = 0 } = {}) {
  const body = { parentElement: null };
  const scroller = { className: "scrollerBase", isConnected: true, parentElement: body,
    scrollTop: initialTop, scrollHeight: 1000, clientHeight: 500,
    getBoundingClientRect: () => ({ top: 0 }), dispatchEvent: () => {} };
  const root = { className: "scrollerInner", isConnected: true, parentElement: scroller,
    getClientRects: () => [{}], querySelector: selector => selector.includes("messageListItem") ? getRows()[0] || null : null,
    querySelectorAll: selector => selector.includes("messageListItem") ? getRows() : [] };
  const document = { body, defaultView: { getComputedStyle: () => ({ overflowY: "auto", overflow: "auto" }), Event },
    querySelectorAll: selector => selector.includes("scrollerInner") ? [root] : [] };
  return { root, scroller, document };
}

test("conversation selection reads the opened channel or DM route", () => {
  assert.equal(getSelectedConversationId("/channels/123456789012345678/234567890123456789"), "234567890123456789");
  assert.equal(getSelectedConversationId("/channels/@me/345678901234567890"), "345678901234567890");
  assert.equal(getSelectedConversationId("/settings/user"), null);
});

test("collection cancellation keeps prior data and marks coverage cancelled", async () => {
  const { store } = memoryStore();
  store.applyBatch("c", [{ messageId: "old", authorId: "u" }]);
  let release;
  const adapter = {
    async startScan() {},
    getNextBatch: () => new Promise(resolve => { release = resolve; }),
    async cancelScan() {},
  };
  const coordinator = new CollectionCoordinator({ adapter, store });
  const collecting = coordinator.collect("c");
  await new Promise(resolve => setImmediate(resolve));
  const cancelling = coordinator.cancel("c");
  release({ records: [{ messageId: "new", authorId: "u" }], done: true });
  const result = await collecting;
  await cancelling;
  assert.equal(result.status, "cancelled");
  assert.equal(store.getConversation("c").people.u.total, 1);
  assert.equal(store.getConversation("c").status, "cancelled");
});

test("storage failures are returned as collection errors instead of escaping", async () => {
  const store = new HistoricalStore({ load: () => null, save: () => { throw new Error("disk unavailable"); } });
  const coordinator = new CollectionCoordinator({ adapter: { async startScan() { throw new Error("should not run"); } }, store });
  const result = await coordinator.collect("c");
  assert.equal(result.status, "failed");
  assert.match(result.error, /disk unavailable/);
});

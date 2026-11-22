import test from "node:test";
import assert from "node:assert/strict";
import { HistoricalStore } from "../src/core/storage/historical-store.js";
import { summarizeAnalytics } from "../src/core/analytics/statistics-engine.js";
import { CollectionCoordinator } from "../src/core/collection/collection-coordinator.js";
import { RenderedHistoryAdapter } from "../src/integrations/betterdiscord/rendered-history-adapter.js";
import { getSelectedConversationId } from "../src/integrations/betterdiscord/conversation-selection.js";
import { groupDailyCounts, busiestHour } from "../src/core/analytics/time-series.js";

function memoryStore(options = {}) {
  let data = null;
  const store = new HistoricalStore({ load: () => data, save: next => { data = structuredClone(next); }, now: () => 1_800_000_000_000, ...options });
  return { store, read: () => data };
}

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
  assert.equal(entry.daily["2026-01-01"], 2);
  assert.equal(entry.hourly[2], 1);
  assert.equal(entry.coverage.complete, false);
  const serialized = JSON.stringify(read());
  assert.equal(serialized.includes("private body"), false);
  assert.equal(serialized.includes("raw-msg-1"), false);
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
  const adapter = new RenderedHistoryAdapter({
    getSelectedConversation: () => "456789012345678901",
    getCurrentUserId: () => "111111111111111111",
    getDocument: () => ({ querySelector: () => ({ querySelectorAll: () => [row] }) }),
  });
  await adapter.startScan({ conversationId: "456789012345678901" });
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
  const root = { scrollTop: 400, scrollHeight: 1000, clientHeight: 500, querySelectorAll: () => rows };
  let waits = 0;
  const adapter = new RenderedHistoryAdapter({
    getSelectedConversation: () => "456789012345678901", getCurrentUserId: () => null,
    getDocument: () => ({ body: {}, querySelector: () => root }),
    wait: async () => { waits++; if (waits <= 2) { rows = [row(`${123456789012345678n - BigInt(waits)}`), ...rows]; root.scrollHeight += 100; } },
    maxBatches: 20, stablePasses: 3,
  });
  await adapter.startScan({ conversationId: "456789012345678901" });
  let batch;
  do { batch = await adapter.getNextBatch({ conversationId: "456789012345678901" }); } while (!batch.done);
  assert.equal(waits, 5);
  assert.equal(batch.complete, false);
  assert.equal(root.scrollTop, 0);
  await adapter.dispose({ conversationId: "456789012345678901" });
  assert.equal(root.scrollTop, 600);
});

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

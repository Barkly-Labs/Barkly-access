import test from "node:test";
import assert from "node:assert/strict";
import { AggregationEngine } from "../src/core/history/aggregation-engine.js";
import { normalizeMessages } from "../src/core/history/normalizer.js";

test("counts authors and ranks descending", () => {
  const engine = new AggregationEngine();
  engine.processBatch([
    { messageId: "1", authorId: "a" },
    { messageId: "2", authorId: "b" },
    { messageId: "3", authorId: "a" },
  ]);
  assert.deepEqual(engine.getRanking(), [
    { rank: 1, userId: "a", count: 2 },
    { rank: 2, userId: "b", count: 1 },
  ]);
});

test("skips duplicate message ids", () => {
  const engine = new AggregationEngine();
  engine.processBatch([{ messageId: "1", authorId: "a" }]);
  engine.processBatch([{ messageId: "1", authorId: "b" }]);
  assert.deepEqual(engine.getRanking(), [
    { rank: 1, userId: "a", count: 1 },
  ]);
  assert.equal(engine.getStats().duplicatesSkipped, 1);
});

test("normalizer omits message body", () => {
  const normalized = normalizeMessages([{
    id: "1", author: { id: "a" }, channel_id: "c",
    content: "private text", attachments: ["secret"],
    timestamp: 123,
  }]);
  assert.deepEqual(normalized, [{
    messageId: "1", authorId: "a", authorName: "", conversationId: "c", timestamp: 123000, isSelf: null,
  }]);
  assert.equal("content" in normalized[0], false);
  assert.equal("attachments" in normalized[0], false);
});

test("ignores malformed records", () => {
  const engine = new AggregationEngine();
  assert.equal(engine.processBatch([null, {}, { messageId: "1" }]).added, 0);
  assert.deepEqual(engine.getRanking(), []);
});

test("normalizer drops malformed records and accepts common export field names", () => {
  const normalized = normalizeMessages([
    null,
    { message_id: "m1", author_id: "u1", channel: "c1", created_at: "today", content: "secret" },
    { id: "missing-author" },
  ], {
    getMessageId: m => m.id ?? m.message_id,
    getAuthorId: m => m.authorId ?? m.author_id,
    getConversationId: m => m.channel,
    getTimestamp: m => m.created_at,
  });
  assert.deepEqual(normalized, [{
    messageId: "m1", authorId: "u1", authorName: "", conversationId: "c1", timestamp: null, isSelf: null,
  }]);
  assert.equal(JSON.stringify(normalized).includes("secret"), false);
});

test("malformed top-level input is rejected", () => {
  assert.throws(() => normalizeMessages({ messages: [] }), /must be an array/);
  assert.throws(() => new AggregationEngine().processBatch({}), /must be an array/);
});

test("reset clears counts and scan stats", () => {
  const engine = new AggregationEngine();
  engine.processBatch([{ messageId: "1", authorId: "a" }]);
  engine.reset();
  assert.deepEqual(engine.getRanking(), []);
  assert.equal(engine.getStats().totalProcessed, 0);
});

test("bounded dedupe tracks only configured maximum", () => {
  const engine = new AggregationEngine({ dedupeLimit: 2 });
  engine.processBatch([
    { messageId: "1", authorId: "a" },
    { messageId: "2", authorId: "a" },
    { messageId: "3", authorId: "a" },
  ]);
  assert.equal(engine.getStats().dedupeTracked, 2);
  assert.equal(engine.getStats().totalProcessed, 3);
});

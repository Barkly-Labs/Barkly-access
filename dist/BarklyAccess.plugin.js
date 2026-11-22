/**
 * @name BarklyAccess
 * @author Barkly Labs
 * @version 0.8.0
 * @description Accessible Discord controls and local conversation analytics.
 */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/integrations/betterdiscord/BarklyAccess.plugin.js
var BarklyAccess_plugin_exports = {};
__export(BarklyAccess_plugin_exports, {
  default: () => BarklyAccess
});
module.exports = __toCommonJS(BarklyAccess_plugin_exports);

// src/core/history/aggregation-engine.js
var AggregationEngine = class {
  constructor({ dedupeLimit = 1e5 } = {}) {
    this.counts = /* @__PURE__ */ new Map();
    this.processedIds = /* @__PURE__ */ new Set();
    this.dedupeLimit = dedupeLimit;
    this.totalProcessed = 0;
    this.duplicatesSkipped = 0;
  }
  processBatch(messages) {
    if (!Array.isArray(messages)) {
      throw new TypeError("messages must be an array");
    }
    let added = 0;
    for (const message of messages) {
      if (!message || typeof message !== "object") continue;
      const { messageId, authorId } = message;
      if (messageId == null || authorId == null) continue;
      const id = String(messageId);
      const author = String(authorId);
      if (!id || !author) continue;
      if (this.processedIds.has(id)) {
        this.duplicatesSkipped++;
        continue;
      }
      if (this.dedupeLimit > 0 && this.processedIds.size >= this.dedupeLimit) {
        const oldest = this.processedIds.values().next().value;
        this.processedIds.delete(oldest);
      } else if (this.dedupeLimit <= 0) {
        this.counts.set(author, (this.counts.get(author) || 0) + 1);
        this.totalProcessed++;
        added++;
        continue;
      }
      this.processedIds.add(id);
      this.counts.set(author, (this.counts.get(author) || 0) + 1);
      this.totalProcessed++;
      added++;
    }
    return { added, duplicatesSkipped: this.duplicatesSkipped };
  }
  getRanking() {
    return [...this.counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([userId, count2], index) => ({ rank: index + 1, userId, count: count2 }));
  }
  getStats() {
    return {
      totalProcessed: this.totalProcessed,
      duplicatesSkipped: this.duplicatesSkipped,
      uniqueAuthors: this.counts.size,
      dedupeTracked: this.processedIds.size
    };
  }
  reset() {
    this.counts.clear();
    this.processedIds.clear();
    this.totalProcessed = 0;
    this.duplicatesSkipped = 0;
  }
};

// src/core/history/normalizer.js
function normalizeMessages(sourceMessages, {
  getMessageId = (m) => m.id ?? m.messageId,
  getAuthorId = (m) => m.author?.id ?? m.authorId,
  getAuthorName = (m) => m.author?.username ?? m.authorName ?? m.username ?? "",
  getConversationId = (m) => m.channel_id ?? m.conversationId ?? m.channelId,
  getTimestamp = (m) => m.timestamp ?? m.createdAt,
  getIsSelf = (m) => typeof m.isSelf === "boolean" ? m.isSelf : null
} = {}) {
  if (!Array.isArray(sourceMessages)) {
    throw new TypeError("sourceMessages must be an array");
  }
  return sourceMessages.flatMap((m) => {
    if (!m || typeof m !== "object") return [];
    const messageId = getMessageId(m);
    const authorId = getAuthorId(m);
    if (messageId == null || authorId == null) return [];
    const rawTimestamp = getTimestamp(m);
    let numericTimestamp = rawTimestamp == null ? null : typeof rawTimestamp === "number" ? rawTimestamp : Date.parse(rawTimestamp);
    if (typeof rawTimestamp === "number" && numericTimestamp > 0 && numericTimestamp < 1e12) numericTimestamp *= 1e3;
    return [{
      messageId: String(messageId),
      authorId: String(authorId),
      authorName: String(getAuthorName(m) ?? "").slice(0, 100),
      conversationId: getConversationId(m) == null ? null : String(getConversationId(m)),
      timestamp: Number.isFinite(numericTimestamp) ? numericTimestamp : null,
      isSelf: typeof getIsSelf(m) === "boolean" ? getIsSelf(m) : null
    }];
  });
}

// src/core/privacy/data-policy.js
var ANALYTICS_SCHEMA_VERSION = 1;
var MAX_DEDUPE_KEYS_PER_CONVERSATION = 25e4;
function fingerprintMessageId(messageId) {
  let hash = 0xcbf29ce484222325n;
  for (const char of String(messageId)) {
    hash ^= BigInt(char.codePointAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
function sanitizeAnalyticsRecord(record) {
  if (!record || typeof record !== "object") return null;
  const { messageId, authorId } = record;
  if (messageId == null || authorId == null) return null;
  const timestamp = record.timestamp == null ? null : Number(record.timestamp);
  return {
    messageId: String(messageId),
    authorId: String(authorId),
    authorName: typeof record.authorName === "string" ? record.authorName.slice(0, 100) : "",
    timestamp: Number.isFinite(timestamp) ? timestamp : null,
    isSelf: typeof record.isSelf === "boolean" ? record.isSelf : null
  };
}

// src/core/storage/historical-store.js
var emptyState = () => ({ version: ANALYTICS_SCHEMA_VERSION, conversations: {} });
var HistoricalStore = class {
  constructor({ load, save, now = () => Date.now(), dedupeLimit = MAX_DEDUPE_KEYS_PER_CONVERSATION }) {
    if (typeof load !== "function" || typeof save !== "function") {
      throw new TypeError("HistoricalStore requires load and save functions");
    }
    this.read = load;
    this.write = save;
    this.now = now;
    this.dedupeLimit = dedupeLimit;
  }
  snapshot() {
    let value;
    try {
      value = this.read();
    } catch (error) {
      this.lastError = error;
      return emptyState();
    }
    if (!value || value.version !== ANALYTICS_SCHEMA_VERSION || !value.conversations || typeof value.conversations !== "object") {
      return emptyState();
    }
    const conversations = {};
    for (const [id, raw] of Object.entries(value.conversations)) {
      if (!raw || typeof raw !== "object") continue;
      const people = {};
      for (const [personId, person] of Object.entries(raw.people || {})) {
        if (!person || typeof person !== "object") continue;
        people[String(personId)] = {
          authorId: String(personId),
          name: safeString(person.name, 100) || String(personId),
          sent: count(person.sent),
          received: count(person.received),
          unknown: count(person.unknown),
          total: count(person.total),
          firstTimestamp: finiteOrNull(person.firstTimestamp),
          lastTimestamp: finiteOrNull(person.lastTimestamp),
          daily: countMap(person.daily),
          dailySent: countMap(person.dailySent),
          dailyReceived: countMap(person.dailyReceived),
          dailyUnknown: countMap(person.dailyUnknown),
          hourly: countArray(person.hourly),
          hourlySent: countArray(person.hourlySent),
          hourlyReceived: countArray(person.hourlyReceived),
          hourlyUnknown: countArray(person.hourlyUnknown)
        };
      }
      conversations[String(id)] = {
        conversationId: String(id),
        status: validStatus(raw.status) ? raw.status : "partial",
        totals: { sent: count(raw.totals?.sent), received: count(raw.totals?.received), unknown: count(raw.totals?.unknown) },
        people,
        daily: countMap(raw.daily),
        dailySent: countMap(raw.dailySent),
        dailyReceived: countMap(raw.dailyReceived),
        dailyUnknown: countMap(raw.dailyUnknown),
        hourly: countArray(raw.hourly),
        hourlySent: countArray(raw.hourlySent),
        hourlyReceived: countArray(raw.hourlyReceived),
        hourlyUnknown: countArray(raw.hourlyUnknown),
        excludedAuthors: stringArray(raw.excludedAuthors, 500),
        seenMessageKeys: stringArray(raw.seenMessageKeys, this.dedupeLimit),
        coverage: {
          scope: "messages rendered in the selected conversation",
          complete: raw.coverage?.complete === true,
          recordsProcessed: count(raw.coverage?.recordsProcessed),
          oldestTimestamp: finiteOrNull(raw.coverage?.oldestTimestamp),
          newestTimestamp: finiteOrNull(raw.coverage?.newestTimestamp),
          source: safeString(raw.coverage?.source, 80),
          startedAt: finiteOrNull(raw.coverage?.startedAt),
          durationMs: count(raw.coverage?.durationMs),
          encountered: count(raw.coverage?.encountered),
          duplicatesIgnored: count(raw.coverage?.duplicatesIgnored),
          batches: count(raw.coverage?.batches),
          stopReason: safeString(raw.coverage?.stopReason, 80),
          interrupted: raw.coverage?.interrupted === true
        },
        updatedAt: count(raw.updatedAt),
        ...raw.error ? { error: safeString(raw.error, 240) } : {}
      };
    }
    return { version: ANALYTICS_SCHEMA_VERSION, conversations };
  }
  getConversation(conversationId) {
    const snapshot = this.snapshot();
    return structuredClone(snapshot.conversations[String(conversationId)] || null);
  }
  markStatus(conversationId, status, details = {}) {
    const state = this.snapshot();
    const id = String(conversationId);
    const entry = state.conversations[id] || this.newConversation(id);
    entry.status = status;
    entry.updatedAt = this.now();
    if (details.error) entry.error = String(details.error).slice(0, 240);
    if (details.coverage) entry.coverage = { ...entry.coverage, ...details.coverage };
    state.conversations[id] = entry;
    this.writeState(state);
    return structuredClone(entry);
  }
  applyBatch(conversationId, records, { status = "partial", complete = false } = {}) {
    if (!Array.isArray(records)) throw new TypeError("records must be an array");
    const state = this.snapshot();
    const id = String(conversationId);
    const entry = state.conversations[id] || this.newConversation(id);
    const seen = new Set(entry.seenMessageKeys);
    const accepted = [];
    let duplicates = 0;
    for (const input of records) {
      const record = sanitizeAnalyticsRecord(input);
      if (!record) continue;
      const key = fingerprintMessageId(record.messageId);
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      entry.seenMessageKeys.push(key);
      accepted.push(record);
      if (entry.seenMessageKeys.length > this.dedupeLimit) {
        const removed = entry.seenMessageKeys.shift();
        seen.delete(removed);
      }
    }
    for (const record of accepted) this.addRecord(entry, record);
    entry.status = complete ? "completed" : status;
    entry.coverage = {
      ...entry.coverage,
      scope: "messages rendered in the selected conversation",
      complete: complete === true,
      recordsProcessed: entry.coverage.recordsProcessed + accepted.length,
      oldestTimestamp: minDate(entry.coverage.oldestTimestamp, accepted.map((x) => x.timestamp)),
      newestTimestamp: maxDate(entry.coverage.newestTimestamp, accepted.map((x) => x.timestamp))
    };
    entry.updatedAt = this.now();
    delete entry.error;
    state.conversations[id] = entry;
    this.writeState(state);
    return { added: accepted.length, duplicates, conversation: structuredClone(entry) };
  }
  clearConversation(conversationId) {
    const state = this.snapshot();
    delete state.conversations[String(conversationId)];
    this.writeState(state);
  }
  setAuthorExcluded(conversationId, authorId, excluded) {
    const state = this.snapshot();
    const entry = state.conversations[String(conversationId)];
    if (!entry) return;
    const id = String(authorId);
    const values = new Set(entry.excludedAuthors);
    if (excluded) values.add(id);
    else values.delete(id);
    entry.excludedAuthors = [...values];
    entry.updatedAt = this.now();
    this.writeState(state);
  }
  clearAll() {
    this.writeState(emptyState());
  }
  writeState(value) {
    try {
      this.write(value);
      this.lastError = null;
    } catch (error) {
      this.lastError = error;
      throw error;
    }
  }
  newConversation(id) {
    return {
      conversationId: id,
      status: "ready",
      totals: { sent: 0, received: 0, unknown: 0 },
      people: {},
      daily: {},
      dailySent: {},
      dailyReceived: {},
      dailyUnknown: {},
      hourly: Array(24).fill(0),
      hourlySent: Array(24).fill(0),
      hourlyReceived: Array(24).fill(0),
      hourlyUnknown: Array(24).fill(0),
      excludedAuthors: [],
      seenMessageKeys: [],
      coverage: { scope: "messages rendered in the selected conversation", complete: false, recordsProcessed: 0, oldestTimestamp: null, newestTimestamp: null },
      updatedAt: this.now()
    };
  }
  addRecord(entry, record) {
    const authorId = record.authorId;
    const person = entry.people[authorId] || {
      authorId,
      name: record.authorName || authorId,
      sent: 0,
      received: 0,
      unknown: 0,
      total: 0,
      firstTimestamp: null,
      lastTimestamp: null,
      daily: {},
      dailySent: {},
      dailyReceived: {},
      dailyUnknown: {},
      hourly: Array(24).fill(0),
      hourlySent: Array(24).fill(0),
      hourlyReceived: Array(24).fill(0),
      hourlyUnknown: Array(24).fill(0)
    };
    if (record.authorName) person.name = record.authorName;
    const direction = record.isSelf === true ? "sent" : record.isSelf === false ? "received" : "unknown";
    person[direction]++;
    person.total++;
    if (record.timestamp != null) {
      person.firstTimestamp = Math.min(person.firstTimestamp ?? record.timestamp, record.timestamp);
      person.lastTimestamp = Math.max(person.lastTimestamp || 0, record.timestamp);
    }
    entry.people[authorId] = person;
    entry.totals[direction]++;
    if (record.timestamp != null) {
      const date = new Date(record.timestamp);
      if (!Number.isNaN(date.getTime())) {
        const day = date.toISOString().slice(0, 10);
        entry.daily[day] = (entry.daily[day] || 0) + 1;
        const suffix = direction[0].toUpperCase() + direction.slice(1);
        const directionalDay = `daily${suffix}`;
        entry[directionalDay][day] = (entry[directionalDay][day] || 0) + 1;
        entry.hourly[date.getUTCHours()]++;
        entry[`hourly${suffix}`][date.getUTCHours()]++;
        person.daily[day] = (person.daily[day] || 0) + 1;
        person[directionalDay][day] = (person[directionalDay][day] || 0) + 1;
        person.hourly[date.getUTCHours()]++;
        person[`hourly${suffix}`][date.getUTCHours()]++;
      }
    }
  }
};
var count = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0;
var finiteOrNull = (value) => Number.isFinite(Number(value)) && value != null ? Number(value) : null;
var safeString = (value, max) => typeof value === "string" ? value.slice(0, max) : "";
var stringArray = (value, max) => Array.isArray(value) ? value.filter((x) => typeof x === "string").slice(-max) : [];
var countMap = (value) => value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key)).map(([key, n]) => [key, count(n)])) : {};
var countArray = (value) => Array.isArray(value) ? Array.from({ length: 24 }, (_, i) => count(value[i])) : Array(24).fill(0);
var validStatus = (value) => ["ready", "collecting", "processing", "persisting", "completed", "partial", "cancelled", "failed"].includes(value);
function minDate(current, values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? Math.min(current ?? Infinity, ...valid) : current;
}
function maxDate(current, values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? Math.max(current ?? -Infinity, ...valid) : current;
}

// src/core/collection/collection-coordinator.js
var CollectionCoordinator = class {
  constructor({ adapter, store, onProgress = () => {
  } }) {
    this.adapter = adapter;
    this.store = store;
    this.onProgress = onProgress;
    this.active = /* @__PURE__ */ new Map();
  }
  collect(conversationId) {
    const id = String(conversationId);
    const sameConversation = this.active.get(id);
    if (sameConversation) {
      return sameConversation.controller.signal.aborted ? sameConversation.promise.then(() => this.collect(id)) : sameConversation.promise;
    }
    const other = this.active.values().next().value;
    if (other) {
      other.controller.abort();
      return other.promise.then(() => this.collect(id));
    }
    const controller = new AbortController();
    const job = { controller, promise: null };
    job.promise = this.run(id, controller.signal).finally(() => this.active.delete(id));
    this.active.set(id, job);
    return job.promise;
  }
  async run(conversationId, signal) {
    let processed = 0;
    let duplicates = 0;
    let encountered = 0;
    let batches = 0;
    const startedAt = Date.now();
    try {
      this.store.markStatus(conversationId, "collecting", { coverage: { startedAt, interrupted: false, stopReason: null, encountered: 0, duplicatesIgnored: 0, batches: 0 } });
      await this.adapter.startScan({ conversationId, signal });
      while (!signal.aborted) {
        const batch = await this.adapter.getNextBatch({ conversationId, signal });
        if (signal.aborted) break;
        if (!batch || !Array.isArray(batch.records)) throw new Error("Source returned an invalid batch");
        batches++;
        encountered += batch.records.length;
        this.store.markStatus(conversationId, "processing");
        const normalized = normalizeMessages(batch.records, {
          getMessageId: (m) => m.messageId ?? m.id ?? m.message_id,
          getAuthorId: (m) => m.authorId ?? m.author_id ?? m.user_id ?? m.author?.id ?? (typeof m.author === "string" ? m.author : null),
          getAuthorName: (m) => m.authorName ?? m.author?.username ?? m.author?.name ?? m.username ?? (typeof m.author === "string" ? m.author : ""),
          getConversationId: (m) => m.conversationId ?? m.channel_id ?? m.channelId,
          getTimestamp: (m) => m.timestamp ?? m.createdAt ?? m.created_at,
          getIsSelf: (m) => typeof m.isSelf === "boolean" ? m.isSelf : null
        }).map((record) => ({ ...record, conversationId }));
        const result = this.store.applyBatch(conversationId, normalized, { status: "partial", complete: batch.complete === true });
        processed += result.added;
        duplicates += result.duplicates;
        const state = batch.complete ? "completed" : batch.done ? "partial" : "collecting";
        const collection = {
          source: batch.source || "authorized-adapter",
          startedAt,
          durationMs: Date.now() - startedAt,
          encountered,
          duplicatesIgnored: duplicates,
          batches,
          stopReason: batch.stopReason || null,
          interrupted: false
        };
        this.store.markStatus(conversationId, state, { coverage: collection });
        try {
          this.onProgress({ conversationId, status: state, processed, duplicates, encountered, batches, progress: batch.progress || null });
        } catch {
        }
        if (batch.done) return { status: state, processed, duplicates, encountered, batches, stopReason: batch.stopReason || null };
      }
      await this.adapter.cancelScan?.({ conversationId });
      let entry = null;
      try {
        entry = this.store.markStatus(conversationId, "cancelled", { coverage: { startedAt, durationMs: Date.now() - startedAt, encountered, duplicatesIgnored: duplicates, batches, interrupted: true, stopReason: "cancelled" } });
      } catch {
      }
      try {
        this.onProgress({ conversationId, status: "cancelled", processed, duplicates, encountered, batches });
      } catch {
      }
      return { status: "cancelled", processed, duplicates, encountered, batches, conversation: entry };
    } catch (error) {
      const message = error?.message || "Collection failed";
      try {
        this.store.markStatus(conversationId, "failed", { error: message, coverage: { startedAt, durationMs: Date.now() - startedAt, encountered, duplicatesIgnored: duplicates, batches, interrupted: true, stopReason: "error" } });
      } catch {
      }
      try {
        this.onProgress({ conversationId, status: "failed", processed, error: message });
      } catch {
      }
      return { status: "failed", processed, duplicates, encountered, batches, error: message };
    } finally {
      try {
        await this.adapter.dispose?.({ conversationId });
      } catch {
      }
    }
  }
  async cancel(conversationId) {
    const job = this.active.get(String(conversationId));
    if (!job) return false;
    job.controller.abort();
    await job.promise;
    return true;
  }
};

// src/core/analytics/time-series.js
function groupDailyCounts(dailyCounts, granularity = "day", { since = null, until = null } = {}) {
  const groups = /* @__PURE__ */ new Map();
  for (const [date, count2] of Object.entries(dailyCounts || {})) {
    const start = Date.parse(`${date}T00:00:00Z`);
    const end = start + 864e5 - 1;
    if (since != null && end < since || until != null && start > until) continue;
    const key = granularity === "month" ? date.slice(0, 7) : granularity === "week" ? isoWeek(date) : date;
    groups.set(key, (groups.get(key) || 0) + count2);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, count2]) => ({ period, count: count2 }));
}
function busiestHour(hourlyCounts) {
  const values = Array.isArray(hourlyCounts) ? hourlyCounts : [];
  const count2 = Math.max(0, ...values);
  return count2 ? { hour: values.indexOf(count2), count: count2 } : null;
}
function isoWeek(day) {
  const date = /* @__PURE__ */ new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 864e5 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// src/core/analytics/statistics-engine.js
function summarizeAnalytics(snapshot, { since = null, until = null, search = "", granularity = "day" } = {}) {
  const conversations = Object.values(snapshot?.conversations || {});
  const totals = { sent: 0, received: 0, unknown: 0 };
  const people = /* @__PURE__ */ new Map();
  const daily = /* @__PURE__ */ new Map();
  const hourly = Array(24).fill(0);
  const query = search.trim().toLocaleLowerCase();
  let newestActivity = null;
  for (const conversation of conversations) {
    if (since == null && until == null) {
      totals.sent += conversation.totals.sent;
      totals.received += conversation.totals.received;
      totals.unknown += conversation.totals.unknown || 0;
    }
    conversation.hourly.forEach((count2, hour) => {
      hourly[hour] += count2;
    });
    for (const [day, count2] of Object.entries(conversation.daily)) {
      const dayEnd = Date.parse(`${day}T23:59:59.999Z`);
      const dayStart = Date.parse(`${day}T00:00:00.000Z`);
      if (since != null && dayEnd < since || until != null && dayStart > until) continue;
      daily.set(day, (daily.get(day) || 0) + count2);
      const inRange = (since == null || dayEnd >= since) && (until == null || dayStart <= until);
      if (inRange && (since != null || until != null)) {
        totals.sent += conversation.dailySent[day] || 0;
        totals.received += conversation.dailyReceived[day] || 0;
        totals.unknown += conversation.dailyUnknown[day] || 0;
      }
    }
    for (const person of Object.values(conversation.people)) {
      if (conversation.excludedAuthors.includes(person.authorId)) continue;
      if (query && !person.name.toLocaleLowerCase().includes(query)) continue;
      const current = people.get(person.authorId) || { authorId: person.authorId, name: person.name, sent: 0, received: 0, unknown: 0, total: 0, firstTimestamp: null, lastTimestamp: null };
      if (since == null && until == null) {
        current.sent += person.sent;
        current.received += person.received;
        current.unknown += person.unknown || 0;
      } else {
        for (const [day, count2] of Object.entries(person.daily || {})) {
          const start = Date.parse(`${day}T00:00:00.000Z`), end = start + 864e5 - 1;
          if (since != null && end < since || until != null && start > until) continue;
          current.sent += person.dailySent?.[day] || 0;
          current.received += person.dailyReceived?.[day] || 0;
          current.unknown += person.dailyUnknown?.[day] || 0;
        }
      }
      current.total = current.sent + current.received + current.unknown;
      current.firstTimestamp = person.firstTimestamp == null ? current.firstTimestamp : Math.min(current.firstTimestamp ?? person.firstTimestamp, person.firstTimestamp);
      current.lastTimestamp = Math.max(current.lastTimestamp || 0, person.lastTimestamp || 0) || null;
      people.set(person.authorId, current);
    }
    const last = conversation.coverage.newestTimestamp;
    if (last != null) newestActivity = Math.max(newestActivity || 0, last);
  }
  return {
    totals: { ...totals, tracked: totals.sent + totals.received + totals.unknown },
    trackedConversations: conversations.length,
    statuses: conversations.reduce((result, item) => {
      result[item.status] = (result[item.status] || 0) + 1;
      return result;
    }, {}),
    people: [...people.values()].sort((a, b) => b.received - a.received || a.name.localeCompare(b.name)),
    daily: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count2]) => ({ date, count: count2 })),
    hourly,
    busiestHour: busiestHour(hourly),
    activity: groupDailyCounts(Object.fromEntries(daily), granularity),
    newestActivity
  };
}

// src/integrations/betterdiscord/rendered-history-adapter.js
var RenderedHistoryAdapter = class {
  constructor({
    getSelectedConversation,
    getCurrentUserId,
    getDocument = () => document,
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    maxBatches = 250,
    stablePasses = 3,
    renderDelay = 450,
    scrollStepRatio = 0.72
  }) {
    this.getSelectedConversation = getSelectedConversation;
    this.getCurrentUserId = getCurrentUserId;
    this.getDocument = getDocument;
    this.wait = wait;
    this.maxBatches = maxBatches;
    this.stablePasses = stablePasses;
    this.renderDelay = renderDelay;
    this.scrollStepRatio = scrollStepRatio;
  }
  async startScan({ conversationId }) {
    if (String(this.getSelectedConversation()) !== String(conversationId)) throw new Error("Conversation is no longer selected");
    const root = this.findMessageRoot();
    if (!root) throw new Error("The selected conversation has no rendered message list");
    const scroller = this.getScrollContainer(root);
    const rect = scroller.getBoundingClientRect?.();
    const anchor = [...root.querySelectorAll('[class*="messageListItem"]')].find((row) => !rect || row.getBoundingClientRect?.().bottom > rect.top);
    this.scan = {
      conversationId: String(conversationId),
      root,
      scroller,
      initialTop: Number(scroller.scrollTop) || 0,
      initialHeight: Number(scroller.scrollHeight) || Number(root.scrollHeight) || 0,
      anchorId: this.rowId(anchor),
      anchorOffset: anchor && rect ? anchor.getBoundingClientRect().top - rect.top : null,
      previousSignature: "",
      previousTop: Number(scroller.scrollTop) || 0,
      noProgress: 0,
      batches: 0,
      encountered: 0,
      uniqueSeen: /* @__PURE__ */ new Set(),
      startedAt: Date.now(),
      stopReason: null
    };
  }
  async getNextBatch({ conversationId, signal }) {
    const scan = this.scan;
    if (!scan || String(this.getSelectedConversation()) !== String(conversationId) || signal?.aborted) {
      return { records: [], done: true, complete: false, stopReason: "interrupted", source: "rendered-discord-ui" };
    }
    let root = this.findMessageRoot() || scan.root;
    let scroller = this.getScrollContainer(root);
    if (!root.isConnected || !scroller.isConnected) return { records: [], done: true, complete: false, stopReason: "conversation-view-unavailable", source: "rendered-discord-ui" };
    scan.root = root;
    scan.scroller = scroller;
    const rows = [...root.querySelectorAll('[class*="messageListItem"]')];
    const selfId = this.getCurrentUserId?.() ?? null;
    const records = rows.flatMap((row) => {
      const messageId = this.rowId(row);
      if (!messageId) return [];
      const authorId = row.getAttribute("data-user-id") || row.querySelector('a[href*="/users/"]')?.getAttribute("href")?.match(/\/users\/(\d+)/)?.[1] || row.querySelector('img[src*="/avatars/"]')?.getAttribute("src")?.match(/\/avatars\/(\d+)/)?.[1];
      if (!authorId) return [];
      const authorName = row.querySelector('[class*="username"]')?.textContent?.trim() || "";
      const time = row.querySelector("time[datetime]")?.getAttribute("datetime");
      const parsed = time ? Date.parse(time) : NaN;
      return [{
        messageId,
        authorId,
        authorName,
        timestamp: Number.isFinite(parsed) ? parsed : null,
        isSelf: selfId == null ? null : String(authorId) === String(selfId)
      }];
    });
    scan.encountered += records.length;
    for (const record of records) scan.uniqueSeen.add(record.messageId);
    const beforeTop = Number(scroller.scrollTop) || 0;
    const beforeSignature = this.messageSignature(root);
    const beforeHeight = Number(scroller.scrollHeight) || Number(root.scrollHeight) || 0;
    const step = Math.max(160, Math.floor((Number(scroller.clientHeight) || 700) * this.scrollStepRatio));
    scroller.scrollTop = Math.max(0, beforeTop - step);
    try {
      scroller.dispatchEvent(new (this.getDocument().defaultView?.Event || Event)("scroll", { bubbles: true }));
    } catch {
    }
    await this.wait(this.renderDelay);
    if (String(this.getSelectedConversation()) !== String(conversationId) || signal?.aborted) {
      return { records, done: true, complete: false, stopReason: "interrupted", source: "rendered-discord-ui" };
    }
    root = this.findMessageRoot() || root;
    scroller = this.getScrollContainer(root);
    scan.root = root;
    scan.scroller = scroller;
    const afterTop = Number(scroller.scrollTop) || 0;
    const afterSignature = this.messageSignature(root);
    const afterHeight = Number(scroller.scrollHeight) || Number(root.scrollHeight) || 0;
    const changed = beforeSignature !== afterSignature || beforeHeight !== afterHeight;
    const moved = Math.abs(afterTop - beforeTop) > 1;
    scan.noProgress = changed || moved ? 0 : scan.noProgress + 1;
    scan.batches++;
    const atOldestVisibleEdge = afterTop <= 2;
    const stagnantAtEdge = atOldestVisibleEdge && scan.noProgress >= this.stablePasses;
    const stalled = !moved && !changed && scan.noProgress >= this.stablePasses;
    const exhausted = scan.batches >= this.maxBatches;
    const done = stagnantAtEdge || stalled || exhausted;
    const stopReason = exhausted ? "batch-limit" : stagnantAtEdge ? "oldest-visible-edge-stable" : stalled ? "scroll-stagnation" : null;
    if (done) scan.stopReason = stopReason;
    return {
      records,
      done,
      complete: false,
      stopReason,
      source: "rendered-discord-ui",
      progress: {
        batches: scan.batches,
        encountered: scan.encountered,
        uniqueInScan: scan.uniqueSeen.size,
        stablePasses: scan.noProgress,
        scrollTop: afterTop,
        atOldestVisibleEdge
      }
    };
  }
  findMessageRoot() {
    const doc = this.getDocument();
    const candidates = [...doc.querySelectorAll('[class*="scrollerInner"]')].filter((node) => node.querySelector('[class*="messageListItem"]'));
    if (!candidates.length) return null;
    return candidates.map((node) => ({
      node,
      count: node.querySelectorAll('[class*="messageListItem"]').length,
      visible: !!node.getClientRects?.().length
    })).sort((a, b) => Number(b.visible) - Number(a.visible) || b.count - a.count)[0].node;
  }
  rowId(row) {
    return row?.id?.match(/chat-messages-(\d+)/)?.[1] || row?.getAttribute("data-list-item-id")?.match(/(\d{15,})/)?.[1] || null;
  }
  messageSignature(root) {
    return [...root.querySelectorAll('[class*="messageListItem"]')].map((row) => this.rowId(row) || "").join("|");
  }
  getScrollContainer(root) {
    let current = root;
    while (current?.parentElement) {
      current = current.parentElement;
      const className = typeof current.className === "string" ? current.className : "";
      const style = this.getDocument().defaultView?.getComputedStyle?.(current);
      const scrollable = style && /(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflow}`) && current.scrollHeight > current.clientHeight + 2;
      if (className.includes("scrollerBase") || scrollable) return current;
      if (current === this.getDocument().body) break;
    }
    return root;
  }
  async cancelScan() {
    if (this.scan) this.scan.stopReason = "cancelled";
  }
  async dispose({ conversationId } = {}) {
    const scan = this.scan;
    if (!scan) return;
    const selected = String(this.getSelectedConversation()) === String(conversationId || scan.conversationId);
    const root = this.findMessageRoot() || scan.root;
    const scroller = this.getScrollContainer(root);
    const rect = scroller.getBoundingClientRect?.();
    const anchor = scan.anchorId && [...root.querySelectorAll('[class*="messageListItem"]')].find((row) => this.rowId(row) === scan.anchorId);
    if (selected && anchor && rect && scan.anchorOffset != null) {
      scroller.scrollTop += anchor.getBoundingClientRect().top - rect.top - scan.anchorOffset;
    } else if (selected) {
      const currentHeight = Number(scroller.scrollHeight) || Number(root.scrollHeight) || scan.initialHeight;
      const addedHeight = Math.max(0, currentHeight - scan.initialHeight);
      scroller.scrollTop = Math.min(scroller.scrollHeight, scan.initialTop + addedHeight);
    }
    this.scan = null;
  }
};

// src/integrations/betterdiscord/conversation-selection.js
function getSelectedConversationId(pathname) {
  return String(pathname || "").match(/\/channels\/(?:@me|\d+)\/(\d+)/)?.[1] || null;
}

// src/styles/frequent.css
var frequent_default = "/* Frequent panel: black, pink, and neutral colors with explicit non-color labels. */\n#barkly-access-panel .ba-file-label{display:block;padding:9px 10px;margin:6px 0;background:#ff4fa3;color:#090909;border-radius:8px;font-weight:700;cursor:pointer;text-align:center}\n#barkly-access-panel #ba-frequent-file{display:block;width:100%;padding:7px;margin:6px 0 10px;background:#101010;color:#f1f1f1;border:1px solid #555;border-radius:8px}\n#barkly-access-panel .ba-import-status{color:#eee;background:#181818;border-left:3px solid #ff4fa3;padding:8px;margin:8px 0;font-size:12px}\n#barkly-access-panel .ba-secondary{background:#292929;color:#f1f1f1}\n#barkly-access-panel .ba-frequent-list{list-style:none;padding:0;margin:8px 0;display:grid;gap:6px}\n#barkly-access-panel .ba-frequent-item{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px;background:#101010;border:1px solid #444;border-radius:8px}\n#barkly-access-panel .ba-rank{display:grid;place-items:center;background:#ff4fa3;color:#090909;border-radius:8px;font-weight:800;height:26px}\n#barkly-access-panel .ba-frequent-name{overflow-wrap:anywhere;font-weight:600}\n#barkly-access-panel .ba-frequent-count{color:#eee;font-size:11px;white-space:nowrap}\n#barkly-access-panel .ba-file-label:focus-within,#barkly-access-panel input:focus-visible,#barkly-access-panel button:focus-visible{outline:3px solid #fff;outline-offset:3px}\n@media(prefers-reduced-motion:reduce){#barkly-access-panel *,#barkly-access-panel *::before,#barkly-access-panel *::after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}\n#barkly-access-panel .ba-tabs button{flex:1;min-width:0;font-size:12px;padding-inline:5px}\n#barkly-access-panel .ba-stats-title{color:#ff8bc5;font-size:18px;margin:12px 2px 6px}\n#barkly-access-panel .ba-stat-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:10px 0}\n#barkly-access-panel .ba-stat-card{display:grid;gap:3px;padding:8px;background:#151515;border:1px solid #444;border-radius:8px}\n#barkly-access-panel .ba-stat-card strong{font-size:18px;color:#fff}\n#barkly-access-panel .ba-stat-card span{font-size:11px;color:#ddd}\n#barkly-access-panel #ba-stats-search,#barkly-access-panel #ba-stats-range{width:100%;padding:8px;margin:4px 0 8px;color:#f1f1f1;background:#101010;border:1px solid #666;border-radius:7px}\n#barkly-access-panel .ba-collection-status{padding:8px;margin:8px 0;background:#181818;border-left:3px solid #ff4fa3;color:#eee;font-size:12px}\n#barkly-access-panel .ba-stats-people{list-style:none;padding:0;display:grid;gap:6px}\n#barkly-access-panel .ba-stats-person-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px}\n#barkly-access-panel .ba-stats-person-row button{margin:0;font-size:11px;padding:7px}\n#barkly-access-panel .ba-daily-chart{list-style:none;padding:0;display:grid;gap:5px}\n#barkly-access-panel .ba-daily-row{display:grid;grid-template-columns:76px minmax(12px,1fr) 30px;align-items:center;gap:6px;font-size:11px}\n#barkly-access-panel .ba-daily-bar{height:10px;min-width:2px;background:#ff4fa3;border-radius:4px}\n#barkly-access-panel .ba-person-detail{margin:8px 0;padding:8px;background:#171717;border:1px solid #444;border-radius:8px}\n#barkly-access-panel .ba-person-detail p{font-size:12px;color:#eee}\n#barkly-access-panel select:focus-visible,#barkly-access-panel summary:focus-visible{outline:3px solid #fff;outline-offset:3px}\n#barkly-access-panel [hidden]{display:none!important}\n";

// src/integrations/betterdiscord/BarklyAccess.plugin.js
var BarklyAccess = class {
  constructor() {
    this.styleId = "barkly-access-quiet-view";
    this.panelId = "barkly-access-panel";
    this.memberTabId = "barkly-access-frequent";
    this.state = { quiet: false, layout: false, numbered: false, showMembers: false, showChannels: false, showToolbar: false };
    this.classes = { quiet: "ba-quiet", layout: "ba-readable-layout", numbered: "ba-numbered-chat", members: "ba-hide-members", channels: "ba-hide-channels", toolbar: "ba-hide-toolbar" };
    this.chunkClasses = ["ba-chunk-start", "ba-chunk-middle", "ba-chunk-end", "ba-chunk-single"];
  }
  start() {
    this.state = Object.assign(this.state, BdApi.Data.load("BarklyAccess", "state") || {});
    this.frequentEngine = new AggregationEngine();
    this.frequentLabels = /* @__PURE__ */ new Map();
    this.analyticsStore = new HistoricalStore({
      load: () => BdApi.Data.load("BarklyAccess", "historicalStats"),
      save: (value) => BdApi.Data.save("BarklyAccess", "historicalStats", value)
    });
    this.historyAdapter = new RenderedHistoryAdapter({
      getSelectedConversation: () => this.getSelectedConversation(),
      // The adapter deliberately avoids Discord Webpack/internal stores. If a
      // supported identity provider is added later it can be injected here.
      getCurrentUserId: () => null
    });
    this.collectionCoordinator = new CollectionCoordinator({
      adapter: this.historyAdapter,
      store: this.analyticsStore,
      onProgress: () => {
        this.renderStats();
        this.refreshFrequent();
      }
    });
    this.apply();
    this.createPanel();
    this.groupMessages();
    this.chunkObserver = new MutationObserver(() => this.groupMessages());
    this.chunkObserver.observe(document.querySelector("[class*=scrollerInner]") || document.body, { childList: true, subtree: true });
    this.historyObserver = new MutationObserver(() => this.bindHistoryObserver());
    this.historyObserver.observe(document.body, { childList: true, subtree: true });
    this.bindHistoryObserver();
    this.onKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        this.toggleQuiet();
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        this.restore();
      }
    };
    document.addEventListener("keydown", this.onKeyDown, true);
    BdApi.UI.showToast("Barkly Access \xB7 Ctrl+Shift+F quiet view \xB7 Ctrl+Shift+R restore", { type: "info" });
  }
  save() {
    BdApi.Data.save("BarklyAccess", "state", this.state);
  }
  toggleQuiet() {
    this.state.quiet = !this.state.quiet;
    this.apply();
    this.save();
    this.updatePanel();
  }
  toggle(key) {
    this.state[key] = !this.state[key];
    this.apply();
    this.save();
    this.updatePanel();
  }
  restore() {
    this.state = { quiet: false, layout: false, numbered: false, showMembers: false, showChannels: false, showToolbar: false };
    this.apply();
    this.save();
    this.updatePanel();
    BdApi.UI.showToast("Barkly Access \xB7 view restored", { type: "success" });
  }
  apply() {
    const b = document.body;
    b.classList.toggle(this.classes.quiet, !!this.state.quiet);
    b.classList.toggle(this.classes.layout, !!this.state.layout);
    b.classList.toggle(this.classes.numbered, !!this.state.numbered);
    b.classList.toggle(this.classes.members, !!this.state.quiet && !this.state.showMembers);
    b.classList.toggle(this.classes.channels, !!this.state.quiet && !this.state.showChannels);
    b.classList.toggle(this.classes.toolbar, !!this.state.quiet && !this.state.showToolbar);
    BdApi.DOM.addStyle(this.styleId, this.css());
  }
  createPanel() {
    if (document.getElementById(this.panelId)) return;
    const p = document.createElement("aside");
    p.id = this.panelId;
    p.setAttribute("aria-label", "Barkly Access");
    p.innerHTML = `<button class="ba-main" aria-expanded="false">Barkly Access <span aria-hidden="true">\uFF0B</span></button><div class="ba-options" hidden><div class="ba-tabs" role="tablist" aria-label="Barkly Access features"><button type="button" role="tab" aria-selected="true" data-tab="controls" class="ba-tab-active">Access</button><button type="button" role="tab" aria-selected="false" data-tab="frequent">Frequent</button><button type="button" role="tab" aria-selected="false" data-tab="stats">Stats</button></div><section data-pane="controls"><p class="ba-summary">Show less at once. Bring anything back anytime.</p><button data-action="quiet" aria-pressed="false">Quiet view</button><button data-action="layout" aria-pressed="false">Readable chat layout</button><button data-action="numbered" aria-pressed="false">Conversation cards</button><div class="ba-extra"><button data-action="showMembers">Member list</button><button data-action="showChannels">Channel list</button><button data-action="showToolbar">Chat toolbar</button></div><button data-action="restore" class="ba-restore">Restore Discord view</button><p class="ba-help">Ctrl+Shift+F \xB7 quiet view<br>Ctrl+Shift+R \xB7 restore</p></section><section data-pane="frequent" hidden><p class="ba-summary">Ranks authors from locally stored aggregates for conversations you select. No message text is saved.</p><details class="ba-import-fallback"><summary>Optional testing or fallback import</summary><label class="ba-file-label" for="ba-frequent-file">Choose JSON file</label><input id="ba-frequent-file" type="file" accept=".json,application/json" aria-label="Import message history JSON file"><button type="button" data-action="clearFrequent" class="ba-secondary">Clear imported ranking</button></details><div class="ba-import-status" role="status" aria-live="polite">Automatic stats update while a conversation is open.</div><ol class="ba-frequent-list" aria-label="Frequent authors by message count" aria-live="polite"></ol></section><section data-pane="stats" hidden><h2 class="ba-stats-title">Conversation analytics</h2><p class="ba-summary">Local, metadata-only summaries. Discord exposes only history rendered in the selected conversation, so coverage cannot be confirmed as complete.</p><div class="ba-collection-status" role="status" aria-live="polite"></div><button type="button" data-action="openAnalytics" class="ba-open-analytics">Open Analytics Dashboard</button><button type="button" data-action="collectNow" class="ba-secondary">Backfill selected conversation</button><button type="button" data-action="cancelCollection" class="ba-secondary" hidden>Stop collection</button><button type="button" data-action="clearConversation" class="ba-secondary">Clear this conversation</button><button type="button" data-action="clearAnalytics" class="ba-secondary">Clear all analytics</button></section></div>`;
    p.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-action], button[data-tab], button[data-author], button[data-exclude], button.ba-main");
      if (!b) return;
      if (b.dataset.tab) {
        p.querySelectorAll("[data-pane]").forEach((x) => x.hidden = x.dataset.pane !== b.dataset.tab);
        p.querySelectorAll("[data-tab]").forEach((x) => {
          const selected = x === b;
          x.classList.toggle("ba-tab-active", selected);
          x.setAttribute("aria-selected", String(selected));
        });
        if (b.dataset.tab === "stats") this.renderStats();
        if (b.dataset.tab === "frequent") this.refreshFrequent();
        return;
      }
      if (b.classList.contains("ba-main")) {
        const d = p.querySelector(".ba-options");
        d.hidden = !d.hidden;
        b.setAttribute("aria-expanded", String(!d.hidden));
        b.querySelector("span").textContent = d.hidden ? "\uFF0B" : "\u2212";
        return;
      }
      if (b.dataset.exclude) {
        this.toggleExcluded(b.dataset.exclude);
        return;
      }
      if (b.dataset.author) {
        this.showPersonDetail(b.dataset.author);
        return;
      }
      const a = b.dataset.action;
      if (a === "restore") this.restore();
      else if (a === "openAnalytics") this.openAnalyticsDashboard();
      else if (a === "collectNow") this.startCollectionNow();
      else if (a === "clearFrequent") this.clearFrequent();
      else if (a === "clearConversation") this.clearCurrentConversation();
      else if (a === "clearAnalytics") this.clearAllAnalytics();
      else if (a === "cancelCollection") this.cancelSelectedCollection();
      else if (a === "quiet") this.toggleQuiet();
      else if (a) this.toggle(a);
    });
    p.querySelector("#ba-frequent-file").addEventListener("change", (e) => this.importFrequentFile(e));
    document.body.appendChild(p);
    this.panel = p;
    this.updatePanel();
  }
  getSelectedConversation() {
    return getSelectedConversationId(window.location.pathname);
  }
  bindHistoryObserver() {
    if (!this.historyObserver) return;
    const selected = this.getSelectedConversation();
    if (selected !== this.activeConversationId) {
      if (this.activeConversationId) this.collectionCoordinator.cancel(this.activeConversationId);
      this.activeConversationId = selected;
      this.lastHistorySignature = "";
      this.queueHistoryCollection();
    }
    const root = document.querySelector('[class*="scrollerInner"]');
    if (root === this.messageRoot) return;
    this.messageObserver?.disconnect();
    this.messageRoot = root;
    if (root) {
      this.messageObserver = new MutationObserver(() => this.queueHistoryCollection());
      this.messageObserver.observe(root, { childList: true, subtree: true });
      this.lastHistorySignature = "";
      this.queueHistoryCollection();
    }
  }
  queueHistoryCollection() {
    if (!this.activeConversationId) return;
    clearTimeout(this.collectionTimer);
    this.collectionTimer = setTimeout(() => this.collectSelectedConversation(), 350);
  }
  startCollectionNow() {
    const id = this.getSelectedConversation();
    if (!id) return;
    this.activeConversationId = id;
    this.lastHistorySignature = "";
    this.collectSelectedConversation();
  }
  async collectSelectedConversation() {
    const conversationId = this.getSelectedConversation();
    if (!conversationId || conversationId !== this.activeConversationId) return;
    if (this.collectionCoordinator.active.has(String(conversationId))) return;
    const root = document.querySelector('[class*="scrollerInner"]');
    const signature = root ? [...root.querySelectorAll('[class*="messageListItem"]')].map((row) => row.id || row.getAttribute("data-list-item-id") || "").join("|") : "";
    if (!signature || signature === this.lastHistorySignature) return;
    const collection = this.collectionCoordinator.collect(conversationId);
    this.renderStats();
    const result = await collection;
    if (result.status !== "failed") {
      const finalRoot = document.querySelector('[class*="scrollerInner"]');
      this.lastHistorySignature = finalRoot ? [...finalRoot.querySelectorAll('[class*="messageListItem"]')].map((row) => row.id || row.getAttribute("data-list-item-id") || "").join("|") : signature;
    }
    this.renderStats();
    this.refreshFrequent();
  }
  renderStats() {
    if (!this.panel) return;
    const snapshot = this.analyticsStore.snapshot();
    const currentId = this.getSelectedConversation();
    const current = snapshot.conversations[currentId];
    this.panel.querySelector('[data-action="cancelCollection"]').hidden = !this.collectionCoordinator.active.has(String(currentId));
    const status = this.panel.querySelector(".ba-collection-status");
    const entry = current;
    status.textContent = entry ? `Conversation ${entry.conversationId}: ${entry.status}. ${entry.coverage.recordsProcessed.toLocaleString()} unique messages stored; ${entry.coverage.encountered.toLocaleString()} encountered this run; ${entry.coverage.duplicatesIgnored.toLocaleString()} duplicates ignored. Collection stops when the visible UI stops changing near its oldest exposed edge. Discord does not confirm whether older history exists.${entry.coverage.stopReason ? ` Stop reason: ${entry.coverage.stopReason}.` : ""}${entry.error ? ` Latest error: ${entry.error}` : ""}` : this.collectionCoordinator.active.has(String(currentId)) ? "Collecting visible message history for the selected conversation." : "Open a conversation in Discord to collect locally visible message metadata.";
    if (this.dashboard && !this.dashboard.hidden) this.renderAnalyticsDashboard();
  }
  openAnalyticsDashboard() {
    if (this.dashboard) {
      this.dashboard.hidden = false;
      this.renderAnalyticsDashboard();
      this.dashboard.querySelector("[data-dashboard-back]")?.focus();
      return;
    }
    const view = document.createElement("section");
    view.id = "ba-analytics-dashboard";
    view.className = "ba-dashboard";
    view.setAttribute("role", "dialog");
    view.setAttribute("aria-modal", "true");
    view.setAttribute("aria-labelledby", "ba-dashboard-title");
    view.innerHTML = `<header class="ba-dashboard-header"><button type="button" data-dashboard-back>\u2190 Back to Barkly Access</button><div><p class="ba-kicker">BARKLY ACCESS \xB7 LOCAL ANALYTICS</p><h1 id="ba-dashboard-title" tabindex="-1">Conversation analytics</h1><p class="ba-dashboard-intro">A readable view of the message metadata this plugin has collected on this device. Message text is not retained.</p></div><button type="button" data-dashboard-clear>Clear analytics</button></header>
      <section class="ba-dashboard-filters" aria-label="Analytics filters"><label>Conversation<select data-filter="conversation"><option value="all">All conversations</option></select></label><label>Person<select data-filter="person"><option value="all">All people</option></select></label><label>From<input type="date" data-filter="from"></label><label>Through<input type="date" data-filter="to"></label><label>Group activity<select data-filter="group"><option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select></label><label>Search people<input type="search" data-filter="search" placeholder="Name or user ID"></label><label>Sort people<select data-filter="sort"><option value="messages">Most messages</option><option value="name">Name</option><option value="recent">Most recent</option></select></label><label>Text size<select data-filter="text"><option value="normal">Normal</option><option value="large">Large</option><option value="xlarge">Extra large</option></select></label><label class="ba-check-filter"><input type="checkbox" data-filter="contrast"> Higher contrast</label></section>
      <main class="ba-dashboard-content"><section aria-labelledby="ba-overview-title"><h2 id="ba-overview-title">Overview</h2><p class="ba-coverage-note" data-dashboard-coverage role="status"></p><div class="ba-dashboard-metrics" data-dashboard-metrics></div></section>
      <div class="ba-dashboard-columns"><section><h2>Activity over time</h2><p class="ba-plain-note">Tables keep exact values available to screen readers and keyboard users.</p><div class="ba-table-wrap"><table><caption>Message activity grouped by selected interval (UTC)</caption><thead><tr><th scope="col">Period</th><th scope="col">Messages</th></tr></thead><tbody data-dashboard-activity></tbody></table></div></section><section><h2>Activity by hour</h2><p class="ba-plain-note" data-hour-note></p><div class="ba-table-wrap"><table><caption>Collected messages by hour of day (UTC)</caption><thead><tr><th scope="col">Hour</th><th scope="col">Messages</th></tr></thead><tbody data-dashboard-hours></tbody></table></div></section></div>
      <section><h2>Activity by day of week</h2><p class="ba-plain-note">Derived from stored UTC daily totals.</p><div class="ba-table-wrap"><table><caption>Messages recorded on each weekday (UTC)</caption><thead><tr><th scope="col">Weekday</th><th scope="col">Messages</th></tr></thead><tbody data-dashboard-weekdays></tbody></table></div></section>
      <section><h2>People</h2><p class="ba-plain-note">Select a person row to see their stored totals and activity range.</p><div class="ba-table-wrap"><table><caption>People in the selected conversation scope</caption><thead><tr><th scope="col">Person</th><th scope="col">Total</th><th scope="col">Sent</th><th scope="col">Received</th><th scope="col">Unknown</th><th scope="col">First recorded</th><th scope="col">Most recent</th></tr></thead><tbody data-dashboard-people></tbody></table></div><div class="ba-pagination" aria-label="People table pages"><button type="button" data-page-prev>Previous people</button><span data-page-status aria-live="polite"></span><button type="button" data-page-next>Next people</button><label>Rows per page<select data-filter="page-size"><option>25</option><option>50</option><option>100</option></select></label></div><section class="ba-person-detail" data-dashboard-person aria-live="polite"></section></section>
      <section><h2>Conversations and collection coverage</h2><div class="ba-table-wrap"><table><caption>Stored conversation totals and collection status</caption><thead><tr><th scope="col">Conversation ID</th><th scope="col">Messages</th><th scope="col">People</th><th scope="col">Status</th><th scope="col">Encountered</th><th scope="col">Duplicates</th><th scope="col">Oldest recorded</th><th scope="col">Newest recorded</th><th scope="col">Last stopping reason</th></tr></thead><tbody data-dashboard-conversations></tbody></table></div></section></main></section>`;
    document.body.appendChild(view);
    this.dashboard = view;
    this.dashboardReturnFocus = this.panel?.querySelector('[data-action="openAnalytics"]');
    view.addEventListener("click", (event) => {
      const button = event.target.closest("[data-dashboard-back],[data-dashboard-clear],[data-person-id],[data-page-prev],[data-page-next]");
      if (!button) return;
      if (button.hasAttribute("data-dashboard-back")) this.closeAnalyticsDashboard();
      else if (button.hasAttribute("data-dashboard-clear")) this.clearAllAnalytics();
      else if (button.hasAttribute("data-page-prev")) {
        this.dashboardPage = Math.max(0, (this.dashboardPage || 0) - 1);
        this.renderAnalyticsDashboard();
      } else if (button.hasAttribute("data-page-next")) {
        this.dashboardPage = (this.dashboardPage || 0) + 1;
        this.renderAnalyticsDashboard();
      } else this.renderPersonDetail(button.dataset.personId);
    });
    view.addEventListener("input", (event) => {
      if (event.target.matches("[data-filter]")) {
        this.dashboardPage = 0;
        this.renderAnalyticsDashboard();
      }
    });
    view.addEventListener("change", (event) => {
      if (event.target.matches("[data-filter]")) {
        this.dashboardPage = 0;
        view.classList.toggle("ba-text-large", view.querySelector('[data-filter="text"]').value === "large");
        view.classList.toggle("ba-text-xlarge", view.querySelector('[data-filter="text"]').value === "xlarge");
        view.classList.toggle("ba-high-contrast", view.querySelector('[data-filter="contrast"]').checked);
        this.renderAnalyticsDashboard();
      }
    });
    this.dashboardEscape = (event) => {
      if (event.key === "Escape" && this.dashboard && !this.dashboard.hidden) {
        event.preventDefault();
        this.closeAnalyticsDashboard();
      }
    };
    document.addEventListener("keydown", this.dashboardEscape, true);
    this.renderAnalyticsDashboard();
    view.querySelector("[data-dashboard-back]").focus();
  }
  closeAnalyticsDashboard() {
    if (!this.dashboard) return;
    this.dashboard.hidden = true;
    this.dashboardReturnFocus?.focus();
  }
  renderAnalyticsDashboard() {
    const view = this.dashboard;
    if (!view || view.hidden) return;
    const all = this.analyticsStore.snapshot();
    const entries = Object.values(all.conversations).sort((a, b) => a.conversationId.localeCompare(b.conversationId));
    const conversationSelect = view.querySelector('[data-filter="conversation"]');
    const oldConversation = conversationSelect.value || "all";
    conversationSelect.replaceChildren(new Option("All conversations", "all"));
    for (const item of entries) conversationSelect.add(new Option(`Conversation ${item.conversationId}`, item.conversationId));
    conversationSelect.value = [...conversationSelect.options].some((option) => option.value === oldConversation) ? oldConversation : "all";
    const allPeople = /* @__PURE__ */ new Map();
    for (const item of entries) for (const person of Object.values(item.people)) {
      const current = allPeople.get(person.authorId) || person;
      allPeople.set(person.authorId, current);
    }
    const personSelect = view.querySelector('[data-filter="person"]');
    const oldPerson = personSelect.value || "all";
    personSelect.replaceChildren(new Option("All people", "all"));
    [...allPeople.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach((person) => personSelect.add(new Option(person.name, person.authorId)));
    personSelect.value = [...personSelect.options].some((option) => option.value === oldPerson) ? oldPerson : "all";
    const selectedId = conversationSelect.value;
    const scope = selectedId === "all" ? entries : entries.filter((item) => item.conversationId === selectedId);
    const from = view.querySelector('[data-filter="from"]').value;
    const to = view.querySelector('[data-filter="to"]').value;
    const since = from ? Date.parse(`${from}T00:00:00.000Z`) : null;
    const until = to ? Date.parse(`${to}T23:59:59.999Z`) : null;
    const personFilter = personSelect.value;
    const analysisScope = personFilter === "all" ? scope : scope.map((item) => {
      const person = item.people[personFilter];
      if (!person) return { ...item, totals: { sent: 0, received: 0, unknown: 0 }, people: {}, daily: {}, dailySent: {}, dailyReceived: {}, dailyUnknown: {}, hourly: Array(24).fill(0) };
      return { ...item, totals: { sent: person.sent, received: person.received, unknown: person.unknown }, people: { [person.authorId]: person }, excludedAuthors: [], daily: person.daily, dailySent: person.dailySent, dailyReceived: person.dailyReceived, dailyUnknown: person.dailyUnknown, hourly: person.hourly };
    });
    const summary = summarizeAnalytics({ version: all.version, conversations: Object.fromEntries(analysisScope.map((item) => [item.conversationId, item])) }, { since, until, search: view.querySelector('[data-filter="search"]').value, granularity: view.querySelector('[data-filter="group"]').value });
    const people = summary.people;
    const sort = view.querySelector('[data-filter="sort"]').value;
    people.sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "recent" ? (b.lastTimestamp || 0) - (a.lastTimestamp || 0) : b.total - a.total || a.name.localeCompare(b.name));
    const totals = summary.totals;
    let dates = summary.daily.map((point) => Date.parse(`${point.date}T00:00:00.000Z`)).filter(Number.isFinite);
    if (!dates.length && !from && !to && personFilter === "all") dates = analysisScope.flatMap((item) => [item.coverage.oldestTimestamp, item.coverage.newestTimestamp]).filter(Number.isFinite);
    const firstDate = dates.length ? new Date(Math.min(...dates)).toLocaleString() : from || to ? "No timestamped messages in this range" : "No timestamp stored";
    const lastDate = dates.length ? new Date(Math.max(...dates) + 86399999).toLocaleString() : from || to ? "No timestamped messages in this range" : "No timestamp stored";
    const metrics = [["Messages tracked", totals.tracked.toLocaleString()], ["Sent", totals.sent.toLocaleString()], ["Received", totals.received.toLocaleString()], ["Direction unknown", totals.unknown.toLocaleString()], ["Conversations", String(scope.length)], ["Unique people", String(people.length)], ["First recorded", firstDate], ["Most recent", lastDate]];
    const metricRoot = view.querySelector("[data-dashboard-metrics]");
    metricRoot.replaceChildren();
    metrics.forEach(([label, value]) => {
      const card = document.createElement("article");
      card.className = "ba-metric";
      const caption = document.createElement("h3");
      caption.textContent = label;
      const amount = document.createElement("p");
      amount.textContent = value;
      card.append(caption, amount);
      metricRoot.append(card);
    });
    const coverage = view.querySelector("[data-dashboard-coverage]");
    const active = scope.filter((item) => this.collectionCoordinator.active.has(item.conversationId)).length;
    const complete = scope.filter((item) => item.coverage.complete).length;
    coverage.textContent = `Coverage is based on the visible UI only. ${scope.length} tracked conversation(s); ${active} collecting now; ${complete} marked complete by the source. Discord does not expose a definitive total-history count, so \u201Ccomplete\u201D is unavailable for this UI adapter. ${scope.reduce((n, item) => n + (item.coverage.recordsProcessed || 0), 0).toLocaleString()} unique message records have been processed. ${scope.reduce((n, item) => n + (item.coverage.encountered || 0), 0).toLocaleString()} records encountered in the latest saved runs; ${scope.reduce((n, item) => n + (item.coverage.duplicatesIgnored || 0), 0).toLocaleString()} duplicates ignored in those runs.`;
    this.fillTable(view.querySelector("[data-dashboard-activity]"), summary.activity.map((point) => [point.period, point.count]));
    const hours = view.querySelector("[data-dashboard-hours]");
    hours.replaceChildren();
    if (from || to) {
      view.querySelector("[data-hour-note]").textContent = "Hourly totals are retained overall, but are not stored per date. Clear the date filter to view all-date hourly totals.";
      this.fillTable(hours, [], "Not available for a date-filtered view.");
    } else {
      view.querySelector("[data-hour-note]").textContent = "Overall hourly distribution, in UTC.";
      const hourTotals = Array(24).fill(0);
      analysisScope.forEach((item) => item.hourly.forEach((count2, hour) => hourTotals[hour] += count2));
      this.fillTable(hours, hourTotals.map((count2, hour) => [`${String(hour).padStart(2, "0")}:00`, count2]));
    }
    const weekdayTotals = Array(7).fill(0);
    summary.daily.forEach(({ date, count: count2 }) => {
      const day = Date.parse(`${date}T00:00:00.000Z`);
      if (Number.isFinite(day)) weekdayTotals[new Date(day).getUTCDay()] += count2;
    });
    this.fillTable(view.querySelector("[data-dashboard-weekdays]"), weekdayTotals.map((count2, day) => [new Date(Date.UTC(2023, 0, 1 + day)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }), count2]));
    const peopleBody = view.querySelector("[data-dashboard-people]");
    peopleBody.replaceChildren();
    const pageSize = Number(view.querySelector('[data-filter="page-size"]').value) || 25;
    const pageCount = Math.max(1, Math.ceil(people.length / pageSize));
    this.dashboardPage = Math.min(this.dashboardPage || 0, pageCount - 1);
    const pagePeople = people.slice(this.dashboardPage * pageSize, (this.dashboardPage + 1) * pageSize);
    pagePeople.forEach((person) => {
      const row = document.createElement("tr");
      const nameCell = document.createElement("th");
      nameCell.scope = "row";
      const pick = document.createElement("button");
      pick.type = "button";
      pick.dataset.personId = person.authorId;
      pick.textContent = person.name || person.authorId;
      nameCell.append(pick);
      row.append(nameCell, ...[person.total, person.sent, person.received, person.unknown].map((value) => {
        const td = document.createElement("td");
        td.textContent = Number(value || 0).toLocaleString();
        return td;
      }), ...[[person.firstTimestamp, "No timestamp"], [person.lastTimestamp, "No timestamp"]].map(([value, fallback]) => {
        const td = document.createElement("td");
        td.textContent = value ? new Date(value).toLocaleString() : fallback;
        return td;
      }));
      peopleBody.append(row);
    });
    if (!people.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 7;
      cell.textContent = "No people match these filters.";
      row.append(cell);
      peopleBody.append(row);
    }
    const pageStatus = view.querySelector("[data-page-status]");
    pageStatus.textContent = people.length ? `Showing ${this.dashboardPage * pageSize + 1}\u2013${Math.min((this.dashboardPage + 1) * pageSize, people.length)} of ${people.length}` : "No matching people";
    view.querySelector("[data-page-prev]").disabled = this.dashboardPage === 0;
    view.querySelector("[data-page-next]").disabled = this.dashboardPage >= pageCount - 1;
    const conversationsBody = view.querySelector("[data-dashboard-conversations]");
    conversationsBody.replaceChildren();
    scope.forEach((item) => {
      const cells = [item.conversationId, (item.totals.sent + item.totals.received + item.totals.unknown).toLocaleString(), String(Object.keys(item.people).length), item.status, (item.coverage.encountered || 0).toLocaleString(), (item.coverage.duplicatesIgnored || 0).toLocaleString(), item.coverage.oldestTimestamp ? new Date(item.coverage.oldestTimestamp).toLocaleString() : "No timestamp", item.coverage.newestTimestamp ? new Date(item.coverage.newestTimestamp).toLocaleString() : "No timestamp", item.coverage.stopReason || "Not reported"];
      const row = document.createElement("tr");
      cells.forEach((value, index) => {
        const cell = document.createElement(index === 0 ? "th" : "td");
        if (index === 0) cell.scope = "row";
        cell.textContent = value;
        row.append(cell);
      });
      conversationsBody.append(row);
    });
    if (!scope.length) this.fillTable(conversationsBody, [], "No conversations have been collected yet. Open a conversation in Discord to begin.");
  }
  fillTable(body, rows, emptyText = "No timestamped records match these filters.") {
    body.replaceChildren();
    if (!rows.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 2;
      cell.textContent = emptyText;
      row.append(cell);
      body.append(row);
      return;
    }
    rows.forEach(([label, count2]) => {
      const row = document.createElement("tr");
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = String(label);
      const td = document.createElement("td");
      td.textContent = Number(count2 || 0).toLocaleString();
      row.append(th, td);
      body.append(row);
    });
  }
  renderPersonDetail(authorId) {
    const root = this.dashboard?.querySelector("[data-dashboard-person]");
    if (!root) return;
    root.replaceChildren();
    const snapshot = this.analyticsStore.snapshot();
    const records = Object.values(snapshot.conversations).flatMap((item) => item.people[authorId] ? [item.people[authorId]] : []);
    if (!records.length) {
      root.textContent = "No stored data is available for this person.";
      return;
    }
    const name = document.createElement("h3");
    name.textContent = `Details for ${records[0].name}`;
    const summary = document.createElement("p");
    const totals = records.reduce((out, item) => ({ sent: out.sent + item.sent, received: out.received + item.received, unknown: out.unknown + (item.unknown || 0), first: Math.min(out.first, item.firstTimestamp ?? Infinity), last: Math.max(out.last, item.lastTimestamp ?? 0) }), { sent: 0, received: 0, unknown: 0, first: Infinity, last: 0 });
    summary.textContent = `${totals.sent + totals.received + totals.unknown} total messages: ${totals.sent} sent, ${totals.received} received, ${totals.unknown} unknown direction. First recorded: ${Number.isFinite(totals.first) ? new Date(totals.first).toLocaleString() : "unavailable"}. Most recent: ${totals.last ? new Date(totals.last).toLocaleString() : "unavailable"}.`;
    const hours = Array(24).fill(0), days = /* @__PURE__ */ new Map();
    records.forEach((item) => {
      item.hourly.forEach((count2, hour) => hours[hour] += count2);
      Object.entries(item.daily).forEach(([day, count2]) => days.set(day, (days.get(day) || 0) + count2));
    });
    const detail = document.createElement("p");
    detail.textContent = `Most active hour (UTC): ${hours.indexOf(Math.max(...hours))}:00 (${Math.max(...hours)} messages). Most active recorded day: ${[...days].sort((a, b) => b[1] - a[1])[0]?.join(" \u2014 ") || "unavailable"}.`;
    root.append(name, summary, detail);
  }
  showPersonDetail(authorId) {
    const conversation = this.analyticsStore.getConversation(this.getSelectedConversation());
    const detail = this.panel.querySelector(".ba-person-detail");
    detail.replaceChildren();
    const person = conversation?.people?.[authorId];
    if (!person) {
      detail.textContent = "Open that person\u2019s conversation to see conversation-specific details.";
      return;
    }
    const title = document.createElement("h3");
    title.textContent = person.name;
    const totals = document.createElement("p");
    totals.textContent = `In this conversation: ${person.received} received, ${person.sent} sent, ${person.unknown || 0} direction unknown, ${person.total} total.`;
    const last = document.createElement("p");
    last.textContent = person.lastTimestamp ? `Last recorded activity: ${new Date(person.lastTimestamp).toLocaleString()}.` : "No valid timestamp was available.";
    const coverage = document.createElement("p");
    coverage.textContent = `Coverage: ${conversation.status}; ${conversation.coverage.recordsProcessed} unique rendered message records. Full-history coverage is not available.`;
    detail.append(title, totals, last, coverage);
  }
  async clearCurrentConversation() {
    const id = this.getSelectedConversation();
    if (!id) return;
    try {
      await this.collectionCoordinator.cancel(id);
      this.analyticsStore.clearConversation(id);
      this.lastHistorySignature = "";
      this.renderStats();
      this.refreshFrequent();
    } catch (error) {
      this.panel.querySelector(".ba-collection-status").textContent = `Could not clear this conversation: ${error.message}`;
    }
  }
  async cancelSelectedCollection() {
    const id = this.getSelectedConversation();
    if (!id) return;
    await this.collectionCoordinator.cancel(id);
    this.renderStats();
  }
  async clearAllAnalytics() {
    try {
      await Promise.all([...this.collectionCoordinator.active.keys()].map((id) => this.collectionCoordinator.cancel(id)));
      this.analyticsStore.clearAll();
      this.lastHistorySignature = "";
      this.renderStats();
      this.refreshFrequent();
    } catch (error) {
      this.panel.querySelector(".ba-collection-status").textContent = `Could not clear analytics: ${error.message}`;
    }
  }
  toggleExcluded(authorId) {
    const id = this.getSelectedConversation();
    if (!id) return;
    const entry = this.analyticsStore.getConversation(id);
    if (!entry) return;
    this.analyticsStore.setAuthorExcluded(id, authorId, !entry.excludedAuthors.includes(authorId));
    this.renderStats();
    this.refreshFrequent();
  }
  refreshFrequent() {
    if (!this.panel) return;
    const list = this.panel.querySelector(".ba-frequent-list");
    if (!list) return;
    list.replaceChildren();
    const stored = summarizeAnalytics(this.analyticsStore.snapshot()).people.filter((person) => person.received > 0).map((person, index) => ({ rank: index + 1, userId: person.authorId, name: person.name, count: person.received }));
    const ranking = (stored.length ? stored : this.frequentEngine.getRanking().map((person, index) => ({ ...person, name: this.frequentLabels.get(person.userId) || person.userId }))).slice(0, 100);
    if (!ranking.length) {
      const li = document.createElement("li");
      li.textContent = "No history collected yet. Open a conversation in Discord to begin.";
      list.appendChild(li);
      return;
    }
    ranking.forEach(({ rank, userId, count: count2, name }) => {
      const li = document.createElement("li");
      li.className = "ba-frequent-item";
      const rankLabel = document.createElement("span");
      rankLabel.className = "ba-rank";
      rankLabel.setAttribute("aria-label", `Rank ${rank}`);
      rankLabel.textContent = String(rank);
      const label = document.createElement("span");
      label.className = "ba-frequent-name";
      label.textContent = name || userId;
      const amount = document.createElement("span");
      amount.className = "ba-frequent-count";
      amount.textContent = `${count2.toLocaleString()} messages`;
      li.append(rankLabel, label, amount);
      list.appendChild(li);
    });
  }
  extractMessages(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") {
      if (Array.isArray(data.messages)) return data.messages;
      if (Array.isArray(data.data)) return data.data;
      if (Array.isArray(data.items)) return data.items;
    }
    throw new Error("Choose a JSON array or an object containing a messages array.");
  }
  async importFrequentFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const status = this.panel.querySelector(".ba-import-status");
    try {
      const parsed = JSON.parse(await file.text());
      const records = this.extractMessages(parsed);
      const normalized = normalizeMessages(records, {
        getMessageId: (m) => m.id ?? m.messageId ?? m.message_id,
        getAuthorId: (m) => m.author?.id ?? m.authorId ?? m.author_id ?? m.user_id ?? m.userId ?? (typeof m.author === "string" ? m.author : null),
        getConversationId: (m) => m.channel_id ?? m.conversationId ?? m.channelId ?? m.channel,
        getTimestamp: (m) => m.timestamp ?? m.createdAt ?? m.created_at
      });
      const labels = /* @__PURE__ */ new Map();
      records.forEach((m) => {
        if (!m || typeof m !== "object") return;
        const id = m.author?.id ?? m.authorId ?? m.author_id ?? m.user_id ?? m.userId ?? (typeof m.author === "string" ? m.author : null);
        const label = m.author?.username ?? m.author?.name ?? m.authorName ?? m.username ?? m.name ?? m.author;
        if (id != null && typeof label === "string" && label.trim()) labels.set(String(id), label.trim());
      });
      const engine = new AggregationEngine();
      engine.processBatch(normalized);
      this.frequentEngine = engine;
      this.frequentLabels = labels;
      this.refreshFrequent();
      status.textContent = `Imported ${normalized.length.toLocaleString()} valid records. Message text was discarded.`;
    } catch (error) {
      status.textContent = error instanceof SyntaxError ? "Could not read that JSON file. Check that it contains valid JSON." : error.message || "Could not import this file.";
    } finally {
      event.target.value = "";
    }
  }
  clearFrequent() {
    this.frequentEngine.reset();
    this.frequentLabels.clear();
    this.panel.querySelector(".ba-import-status").textContent = "Ranking cleared. No message data is retained.";
    this.refreshFrequent();
  }
  updatePanel() {
    if (!this.panel) return;
    this.panel.querySelectorAll("[data-action]").forEach((b) => {
      const k = b.dataset.action;
      if (!Object.hasOwn(this.state, k)) return;
      const on = !!this.state[k];
      b.setAttribute("aria-pressed", String(on));
      b.classList.toggle("ba-on", on);
      const labels = { quiet: "Quiet view", layout: "Readable chat layout", numbered: "Conversation cards", showMembers: "Member list", showChannels: "Channel list", showToolbar: "Chat toolbar" };
      b.textContent = k === "quiet" || k === "layout" || k === "numbered" ? `${labels[k]} \xB7 ${on ? "On" : "Off"}` : `${labels[k]} \xB7 ${on ? "Shown" : "Hidden"}`;
    });
  }
  stop() {
    document.removeEventListener("keydown", this.onKeyDown, true);
    document.removeEventListener("keydown", this.dashboardEscape, true);
    clearTimeout(this.collectionTimer);
    this.chunkObserver?.disconnect();
    this.historyObserver?.disconnect();
    this.messageObserver?.disconnect();
    for (const id of this.collectionCoordinator?.active.keys() || []) this.collectionCoordinator.cancel(id);
    document.querySelectorAll("[class*=messageListItem]").forEach((n) => this.chunkClasses.forEach((c) => n.classList.remove(c)));
    Object.values(this.classes).forEach((c) => document.body.classList.remove(c));
    BdApi.DOM.removeStyle(this.styleId);
    this.dashboard?.remove();
    document.getElementById(this.panelId)?.remove();
    this.frequentEngine?.reset();
    this.frequentLabels?.clear();
  }
  groupMessages() {
    const root = document.querySelector("[class*=scrollerInner]");
    if (!root) return;
    const nodes = [...root.querySelectorAll("[class*=messageListItem]")];
    if (!nodes.length) return;
    const readTime = (n) => {
      const t = n.querySelector("time");
      if (t) {
        const d = t.dateTime ? new Date(t.dateTime) : new Date(t.textContent);
        if (!Number.isNaN(d.getTime())) return d.getTime();
      }
      return null;
    };
    let group = 0, prevTime = null, prevNode = null, members = [];
    const finish = () => {
      if (!members.length) return;
      members.forEach((n, i) => {
        this.chunkClasses.forEach((c) => n.classList.remove(c));
        n.classList.add(members.length === 1 ? "ba-chunk-single" : i === 0 ? "ba-chunk-start" : i === members.length - 1 ? "ba-chunk-end" : "ba-chunk-middle");
      });
      members = [];
    };
    nodes.forEach((n) => {
      const t = readTime(n);
      const gap = t !== null && prevTime !== null ? t - prevTime : null;
      const split = !prevNode || gap === null || gap < 0 || gap > 15 * 60 * 1e3;
      if (split) {
        finish();
        group++;
      }
      members.push(n);
      prevNode = n;
      prevTime = t;
    });
    finish();
  }
  css() {
    return `${frequent_default}
    /* Numbered conversation chunks: group nearby messages into a cohesive unit. */
    body.${this.classes.numbered} [class*='scrollerInner'] {counter-reset:barkly-chunk;}
    body.${this.classes.numbered} [class*='messageListItem'] {position:relative; margin:0 12px !important; padding:12px 18px 12px 62px !important; background:#101010; border-left:3px solid #ff4fa3; border-right:1px solid #292929; min-height:64px; box-shadow:none;}
    body.${this.classes.numbered} [class*='messageListItem'].ba-chunk-start, body.${this.classes.numbered} [class*='messageListItem'].ba-chunk-single {counter-increment:barkly-chunk; margin-top:14px !important; border-top:1px solid #292929; border-radius:16px 16px 0 0; background:linear-gradient(110deg,#151015,#101010 42%);}
    body.${this.classes.numbered} [class*='messageListItem'].ba-chunk-start::before, body.${this.classes.numbered} [class*='messageListItem'].ba-chunk-single::before {content:counter(barkly-chunk); position:absolute; left:16px; top:16px; display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:10px; background:#ff4fa3; color:#090909; font-weight:800; font-size:14px;}
    body.${this.classes.numbered} [class*='messageListItem'].ba-chunk-middle, body.${this.classes.numbered} [class*='messageListItem'].ba-chunk-end {border-top:1px solid #292929; background:#101010;}
    body.${this.classes.numbered} [class*='messageListItem'].ba-chunk-end, body.${this.classes.numbered} [class*='messageListItem'].ba-chunk-single {border-bottom:1px solid #292929; border-radius:0 0 16px 16px; margin-bottom:14px !important;}
    body.${this.classes.numbered} [class*='messageListItem'].ba-chunk-single {border-radius:16px;}
    body.${this.classes.numbered} [class*='messageListItem']:hover {background:#171217;}
    body.${this.classes.numbered} [class*='messageListItem'] [class*='contents'] {min-width:0;}
    body.${this.classes.numbered} [class*='messageContent'] {line-height:1.65; max-width:72ch; overflow-wrap:anywhere;}
    body.${this.classes.numbered} [class*='messageListItem'] [class*='header'] {display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px; margin-bottom:5px;}
    body.${this.classes.numbered} [class*='messageListItem'] [class*='avatar'] {border-radius:12px;}
    body.${this.classes.numbered} [class*='messageListItem'] [class*='markup'] p {margin-block:4px;}
    body.${this.classes.numbered} [class*='messageListItem'] [class*='attachment'], body.${this.classes.numbered} [class*='messageListItem'] [class*='embed'] {margin-top:10px; border-radius:12px;}
    body.${this.classes.numbered} [class*='messageListItem'] [class*='repliedMessage'] {border-left:3px solid #ff8bc5; border-radius:6px; padding:6px 10px; margin-bottom:8px; background:#ff4fa308;}
    body.${this.classes.numbered} [class*='timestamp'] {opacity:.68; font-size:.82em;}
    body.${this.classes.layout} [class*="messageListItem"] {padding-block:8px !important;}
    body.${this.classes.layout} [class*="messageContent"] {line-height:1.6 !important;max-width:78ch;}
    body.${this.classes.layout} [class*="messageListItem"] [class*="avatar"] {margin-top:3px;}
    body.${this.classes.layout} [class*="messageListItem"] [class*="timestamp"] {opacity:.72;font-size:.82em;}
    body.${this.classes.layout} [class*="reaction"] {opacity:.88;}
    body.${this.classes.layout} [class*="messageListItem"] [class*="reply"] {border-left:2px solid #ff8bc5;padding-left:8px;}
    body.${this.classes.layout} [class*="messageListItem"] [class*="embed"] {margin-top:8px;border-radius:8px;}
    /* Quiet view: progressive disclosure, never remove chat content itself. */
    body.${this.classes.quiet} [class*="membersWrap"] {display:none !important;}
    body.${this.classes.channels} [class*="sidebar"] {display:none !important;}
    body.${this.classes.toolbar} [class*="chatContent"] [class*="toolbar"] {display:none !important;}
    body.${this.classes.quiet} [class*="messageListItem"] {padding-block:5px !important;}
    body.${this.classes.quiet} [class*="messageContent"] {line-height:1.65 !important;}
    body.${this.classes.quiet} [class*="channelTextArea"] {border:1px solid #ff4fa3 !important;}
    body.${this.classes.quiet} *:focus-visible {outline:2px solid #ff8bc5 !important;outline-offset:2px;}
    #${this.panelId}{position:fixed;z-index:99999;top:14px;right:16px;width:238px;max-height:80vh;overflow:auto;background:#090909;color:#f1f1f1;border:1px solid #ff4fa3;border-radius:12px;box-shadow:0 8px 28px #0009;font:14px/1.45 sans-serif;}
    #${this.panelId} button{display:block;width:100%;text-align:left;background:#101010;color:#f1f1f1;border:1px solid #444;border-radius:8px;padding:9px 10px;margin:6px 0;cursor:pointer;}
    #${this.panelId} button:focus-visible{outline:3px solid #ff8bc5;outline-offset:2px;}
    #${this.panelId} .ba-main{font-weight:700;background:#ff4fa3;color:#090909;border:0;margin:0;display:flex;justify-content:space-between;}
    #${this.panelId} .ba-options{padding:8px 10px 10px;} #${this.panelId} .ba-options[hidden]{display:none;}
    #${this.panelId} .ba-summary,#${this.panelId} .ba-help{color:#ccc;font-size:12px;margin:8px 2px;}
    #${this.panelId} .ba-extra{border-top:1px solid #292929;margin-top:8px;padding-top:4px;}
    #${this.panelId} .ba-tabs{display:flex;gap:6px;padding:8px 10px 0;}
    #${this.panelId} .ba-tabs button{flex:1;width:auto;text-align:center;margin:0;padding:8px;}
    #${this.panelId} .ba-tab-active{background:#ff4fa3!important;color:#090909!important;font-weight:700;}
    #${this.panelId} [data-pane][hidden]{display:none!important;}
    #${this.panelId} .ba-frequent-list{list-style:none;padding:0;margin:8px 0;display:grid;gap:6px;}
    #${this.panelId} .ba-frequent-item{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px;background:#101010;border:1px solid #292929;border-radius:8px;}
    #${this.panelId} .ba-rank{display:grid;place-items:center;background:#ff4fa3;color:#090909;border-radius:8px;font-weight:800;height:26px;}
    #${this.panelId} .ba-frequent-name{overflow-wrap:anywhere;font-weight:600;}
    #${this.panelId} .ba-frequent-count{color:#aaa;font-size:11px;white-space:nowrap;}
    #${this.panelId} button.ba-on{border-color:#ff8bc5;box-shadow:inset 3px 0 #ff4fa3;}
    #${this.panelId} .ba-restore{background:#ff8bc5;color:#090909;font-weight:700;}
    #${this.panelId} .ba-open-analytics{background:#ff4fa3;color:#090909;font-weight:800;text-align:center;}
    #${this.panelId} .ba-collection-status{color:#f4dce8;font-size:12px;line-height:1.5;padding:9px;background:#171217;border-radius:8px;}
    #ba-analytics-dashboard{position:fixed;inset:0;z-index:1000000;overflow:auto;background:#0e0b0e;color:#f5eef2;font:16px/1.55 system-ui,sans-serif;padding:clamp(16px,3vw,44px);--ba-accent:#ff69ad;--ba-panel:#171217;}
    #ba-analytics-dashboard[hidden]{display:none;}
    #ba-analytics-dashboard *{box-sizing:border-box;}
    #ba-analytics-dashboard button,#ba-analytics-dashboard input,#ba-analytics-dashboard select{font:inherit;color:inherit;}
    #ba-analytics-dashboard button,#ba-analytics-dashboard select,#ba-analytics-dashboard input{background:#211a20;border:1px solid #806879;border-radius:8px;padding:9px 12px;}
    #ba-analytics-dashboard button{cursor:pointer;}
    #ba-analytics-dashboard button:hover{border-color:var(--ba-accent);}
    #ba-analytics-dashboard :focus-visible{outline:3px solid #ff9bc9;outline-offset:3px;}
    .ba-dashboard-header{display:grid;grid-template-columns:minmax(180px,1fr) minmax(280px,3fr) minmax(140px,1fr);gap:24px;align-items:start;max-width:1500px;margin:0 auto 26px;padding-bottom:24px;border-bottom:1px solid #493a45;}
    .ba-dashboard-header>button:last-child{justify-self:end;}
    .ba-dashboard-header h1{font-size:clamp(28px,4vw,44px);line-height:1.1;margin:3px 0 8px;}
    .ba-kicker{color:#ff9bc9;font-size:12px;font-weight:800;letter-spacing:.12em;margin:0;}
    .ba-dashboard-intro,.ba-plain-note{color:#d3c7cf;margin:0;}
    .ba-dashboard-filters{max-width:1500px;margin:0 auto 28px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;padding:18px;background:#171217;border:1px solid #40323c;border-radius:14px;}
    .ba-dashboard-filters label{display:grid;gap:5px;font-size:13px;font-weight:650;}
    .ba-dashboard-filters .ba-check-filter{display:flex;align-items:center;gap:8px;}
    .ba-check-filter input{width:18px;height:18px;}
    .ba-dashboard-content{max-width:1500px;margin:auto;display:grid;gap:28px;}
    .ba-dashboard-content h2{font-size:22px;margin:0 0 12px;}
    .ba-coverage-note{background:#241a22;border-left:4px solid #ff69ad;border-radius:8px;padding:14px 16px;margin:0 0 14px;color:#f8edf3;}
    .ba-dashboard-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;}
    .ba-metric{background:#171217;border:1px solid #40323c;border-radius:12px;padding:15px;min-width:0;}
    .ba-metric h3{margin:0 0 8px;color:#d8c9d2;font-size:13px;font-weight:650;}
    .ba-metric p{font-size:clamp(19px,2vw,28px);font-weight:750;margin:0;overflow-wrap:anywhere;}
    .ba-dashboard-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;}
    .ba-dashboard-content>section,.ba-dashboard-columns>section{min-width:0;}
    .ba-table-wrap{max-width:100%;overflow:auto;border:1px solid #453743;border-radius:10px;background:#151115;}
    #ba-analytics-dashboard table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;}
    #ba-analytics-dashboard caption{text-align:left;padding:12px 14px;color:#d3c7cf;font-weight:650;}
    #ba-analytics-dashboard th,#ba-analytics-dashboard td{text-align:left;padding:10px 12px;border-top:1px solid #453743;white-space:nowrap;}
    #ba-analytics-dashboard thead th{background:#211a20;color:#ffd6e8;}
    #ba-analytics-dashboard tbody th{font-weight:600;}
    #ba-analytics-dashboard tbody tr:hover{background:#201820;}
    #ba-analytics-dashboard tbody button{border:0;background:transparent;color:#ff9bc9;text-decoration:underline;padding:2px 0;}
    .ba-person-detail{margin-top:14px;padding:16px;background:#171217;border-radius:10px;}
    .ba-person-detail:empty{display:none;}
    #ba-analytics-dashboard.ba-text-large{font-size:18px;}
    #ba-analytics-dashboard.ba-text-xlarge{font-size:20px;}
    #ba-analytics-dashboard.ba-high-contrast{background:#000;color:#fff;--ba-panel:#000;--ba-accent:#ffb8db;}
    #ba-analytics-dashboard.ba-high-contrast .ba-metric,#ba-analytics-dashboard.ba-high-contrast .ba-dashboard-filters,#ba-analytics-dashboard.ba-high-contrast .ba-table-wrap{background:#000;border-color:#fff;}
    @media(max-width:760px){.ba-dashboard-header{grid-template-columns:1fr;gap:12px}.ba-dashboard-header>button:last-child{justify-self:start}.ba-dashboard-columns{grid-template-columns:1fr}#ba-analytics-dashboard{padding:14px}.ba-dashboard-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(prefers-reduced-motion:reduce){#ba-analytics-dashboard *,#${this.panelId} *{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
  `;
  }
};
module.exports = module.exports.default;

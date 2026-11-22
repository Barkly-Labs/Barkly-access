import {
  ANALYTICS_SCHEMA_VERSION,
  MAX_DEDUPE_KEYS_PER_CONVERSATION,
  fingerprintMessageId,
  sanitizeAnalyticsRecord,
} from "../privacy/data-policy.js";

const emptyState = () => ({ version: ANALYTICS_SCHEMA_VERSION, conversations: {} });

/** Local aggregate store. Inject load/save to keep BetterDiscord out of the core. */
export class HistoricalStore {
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
    try { value = this.read(); } catch (error) { this.lastError = error; return emptyState(); }
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
          authorId: String(personId), name: safeString(person.name, 100) || String(personId),
          sent: count(person.sent), received: count(person.received), unknown: count(person.unknown),
          total: count(person.total), firstTimestamp: finiteOrNull(person.firstTimestamp), lastTimestamp: finiteOrNull(person.lastTimestamp),
          daily: countMap(person.daily), dailySent: countMap(person.dailySent), dailyReceived: countMap(person.dailyReceived), dailyUnknown: countMap(person.dailyUnknown),
          hourly: countArray(person.hourly), hourlySent: countArray(person.hourlySent), hourlyReceived: countArray(person.hourlyReceived), hourlyUnknown: countArray(person.hourlyUnknown),
        };
      }
      conversations[String(id)] = {
        conversationId: String(id),
        status: validStatus(raw.status) ? raw.status : "partial",
        totals: { sent: count(raw.totals?.sent), received: count(raw.totals?.received), unknown: count(raw.totals?.unknown) },
        people,
        daily: countMap(raw.daily), dailySent: countMap(raw.dailySent), dailyReceived: countMap(raw.dailyReceived), dailyUnknown: countMap(raw.dailyUnknown),
        hourly: countArray(raw.hourly), hourlySent: countArray(raw.hourlySent), hourlyReceived: countArray(raw.hourlyReceived), hourlyUnknown: countArray(raw.hourlyUnknown),
        excludedAuthors: stringArray(raw.excludedAuthors, 500),
        seenMessageKeys: stringArray(raw.seenMessageKeys, this.dedupeLimit),
        coverage: {
          scope: "messages rendered in the selected conversation", complete: raw.coverage?.complete === true,
          recordsProcessed: count(raw.coverage?.recordsProcessed), oldestTimestamp: finiteOrNull(raw.coverage?.oldestTimestamp),
          newestTimestamp: finiteOrNull(raw.coverage?.newestTimestamp), source: safeString(raw.coverage?.source, 80),
          startedAt: finiteOrNull(raw.coverage?.startedAt), durationMs: count(raw.coverage?.durationMs),
          encountered: count(raw.coverage?.encountered), duplicatesIgnored: count(raw.coverage?.duplicatesIgnored),
          batches: count(raw.coverage?.batches), stopReason: safeString(raw.coverage?.stopReason, 80),
          interrupted: raw.coverage?.interrupted === true,
        },
        updatedAt: count(raw.updatedAt),
        ...(raw.error ? { error: safeString(raw.error, 240) } : {}),
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
      if (seen.has(key)) { duplicates++; continue; }
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
      oldestTimestamp: minDate(entry.coverage.oldestTimestamp, accepted.map(x => x.timestamp)),
      newestTimestamp: maxDate(entry.coverage.newestTimestamp, accepted.map(x => x.timestamp)),
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
    if (excluded) values.add(id); else values.delete(id);
    entry.excludedAuthors = [...values];
    entry.updatedAt = this.now();
    this.writeState(state);
  }

  clearAll() { this.writeState(emptyState()); }

  writeState(value) {
    try { this.write(value); this.lastError = null; }
    catch (error) { this.lastError = error; throw error; }
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
      updatedAt: this.now(),
    };
  }

  addRecord(entry, record) {
    const authorId = record.authorId;
    const person = entry.people[authorId] || {
      authorId, name: record.authorName || authorId, sent: 0, received: 0, unknown: 0, total: 0, firstTimestamp: null, lastTimestamp: null,
      daily: {}, dailySent: {}, dailyReceived: {}, dailyUnknown: {}, hourly: Array(24).fill(0),
      hourlySent: Array(24).fill(0), hourlyReceived: Array(24).fill(0), hourlyUnknown: Array(24).fill(0),
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
}

const count = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0;
const finiteOrNull = value => Number.isFinite(Number(value)) && value != null ? Number(value) : null;
const safeString = (value, max) => typeof value === "string" ? value.slice(0, max) : "";
const stringArray = (value, max) => Array.isArray(value) ? value.filter(x => typeof x === "string").slice(-max) : [];
const countMap = value => value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key)).map(([key, n]) => [key, count(n)])) : {};
const countArray = value => Array.isArray(value) ? Array.from({ length: 24 }, (_, i) => count(value[i])) : Array(24).fill(0);
const validStatus = value => ["ready", "collecting", "processing", "persisting", "completed", "partial", "cancelled", "failed"].includes(value);

function minDate(current, values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? Math.min(current ?? Infinity, ...valid) : current;
}
function maxDate(current, values) {
  const valid = values.filter(Number.isFinite);
  return valid.length ? Math.max(current ?? -Infinity, ...valid) : current;
}

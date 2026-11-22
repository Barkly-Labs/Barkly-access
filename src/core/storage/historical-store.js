import {
  ANALYTICS_SCHEMA_VERSION,
  MAX_DEDUPE_KEYS_PER_CONVERSATION,
  fingerprintMessageId,
  sanitizeAnalyticsRecord,
} from "../privacy/data-policy.js";
import { INITIAL_COLLECTION_STATES } from "../collection/collection-state.js";
import { canonicalAuthorId, canonicalConversationId, mergeAuthorRecords } from "../identity/stable-author.js";
import { UNRESOLVED_AUTHOR_ID } from "../identity/participant-resolver.js";

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
    let needsWrite = false;
    for (const [id, raw] of Object.entries(value.conversations)) {
      if (!raw || typeof raw !== "object") continue;
      const stableId = canonicalConversationId(raw.conversationId) || canonicalConversationId(id) || String(id).trim();
      if (stableId !== String(id) || (raw.conversationId != null && String(raw.conversationId) !== stableId)) needsWrite = true;
      const people = {};
      let duplicatePerson = false;
      for (const [personId, person] of Object.entries(raw.people || {})) {
        if (!person || typeof person !== "object") continue;
        const stableAuthorId = canonicalAuthorId(person.authorId ?? personId);
        const canonicalId = stableAuthorId || UNRESOLVED_AUTHOR_ID;
        if (!stableAuthorId) needsWrite = true;
        const normalized = {
          authorId: canonicalId, name: stableAuthorId ? safeString(person.name, 100) || canonicalId : "Unresolved sender",
          username: safeString(person.username, 100), avatarUrl: safeAvatar(person.avatarUrl),
          sent: count(person.sent), received: count(person.received),
          unknown: person.sent == null && person.received == null && person.unknown == null ? count(person.total) : count(person.unknown),
          total: count(person.total), firstTimestamp: finiteOrNull(person.firstTimestamp), lastTimestamp: finiteOrNull(person.lastTimestamp),
          daily: countMap(person.daily), dailySent: countMap(person.dailySent), dailyReceived: countMap(person.dailyReceived), dailyUnknown: countMap(person.dailyUnknown),
          hourly: countArray(person.hourly), hourlySent: countArray(person.hourlySent), hourlyReceived: countArray(person.hourlyReceived), hourlyUnknown: countArray(person.hourlyUnknown),
        };
        if (String(personId) !== canonicalId || people[canonicalId]) needsWrite = true;
        if (people[canonicalId]) duplicatePerson = true;
        people[canonicalId] = mergeAuthorRecords(people[canonicalId], normalized);
      }
      const normalizedConversation = {
        conversationId: stableId,
        navigationPath: validConversationPath(raw.navigationPath, stableId),
        collection: sanitizeCollection(raw.collection),
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
      if (duplicatePerson) reconcileConversationTotals(normalizedConversation);
      if (conversations[stableId]) {
        needsWrite = true;
        conversations[stableId] = mergeConversationRecords(conversations[stableId], normalizedConversation, this.dedupeLimit);
      } else {
        conversations[stableId] = normalizedConversation;
      }
    }
    const reconciled = { version: ANALYTICS_SCHEMA_VERSION, conversations };
    if (needsWrite) {
      try { this.write(reconciled); this.lastError = null; } catch (error) { this.lastError = error; }
    }
    return reconciled;
  }

  getConversation(conversationId) {
    const snapshot = this.snapshot();
    return structuredClone(snapshot.conversations[storageConversationId(conversationId)] || null);
  }

  markStatus(conversationId, status, details = {}) {
    const state = this.snapshot();
    const id = storageConversationId(conversationId);
    const entry = state.conversations[id] || this.newConversation(id);
    entry.status = status;
    entry.updatedAt = this.now();
    if (details.error) entry.error = String(details.error).slice(0, 240);
    if (details.coverage) entry.coverage = { ...entry.coverage, ...details.coverage };
    if (details.navigationPath) entry.navigationPath = validConversationPath(details.navigationPath, id) || entry.navigationPath || null;
    if (details.collection) entry.collection = sanitizeCollection({ ...entry.collection, ...details.collection });
    state.conversations[id] = entry;
    this.writeState(state);
    return structuredClone(entry);
  }

  applyBatch(conversationId, records, { status = "partial", complete = false } = {}) {
    if (!Array.isArray(records)) throw new TypeError("records must be an array");
    const state = this.snapshot();
    const id = storageConversationId(conversationId);
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
    delete state.conversations[storageConversationId(conversationId)];
    this.writeState(state);
  }

  markCollection(conversationId, changes = {}) {
    const state = this.snapshot();
    const id = storageConversationId(conversationId);
    const entry = state.conversations[id] || this.newConversation(id);
    entry.collection = sanitizeCollection({ ...entry.collection, ...changes });
    entry.updatedAt = this.now();
    state.conversations[id] = entry;
    this.writeState(state);
    return structuredClone(entry.collection);
  }

  setAuthorExcluded(conversationId, authorId, excluded) {
    const state = this.snapshot();
    const entry = state.conversations[storageConversationId(conversationId)];
    if (!entry) return;
    const id = canonicalAuthorId(authorId);
    if (!id) return;
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
      navigationPath: null,
      collection: sanitizeCollection(null),
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
    const authorId = canonicalAuthorId(record.authorId);
    if (!authorId) return;
    const person = entry.people[authorId] || {
      authorId, name: record.authorName || authorId, username: record.authorUsername || "", avatarUrl: "", sent: 0, received: 0, unknown: 0, total: 0, firstTimestamp: null, lastTimestamp: null,
      daily: {}, dailySent: {}, dailyReceived: {}, dailyUnknown: {}, hourly: Array(24).fill(0),
      hourlySent: Array(24).fill(0), hourlyReceived: Array(24).fill(0), hourlyUnknown: Array(24).fill(0),
    };
    if (record.authorName) person.name = record.authorName;
    if (record.authorUsername) person.username = record.authorUsername;
    if (record.avatarUrl) person.avatarUrl = record.avatarUrl;
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
const storageConversationId = value => canonicalConversationId(value) || String(value).trim();
const safeAvatar = value => typeof value === "string" && /^https:\/\/[^\s]{1,500}$/.test(value) ? value : "";
const validConversationPath = (path, conversationId) => {
  if (typeof path !== "string") return null;
  const match = path.match(/^\/channels\/(?:@me|\d+)\/(\d+)\/?$/);
  return match && match[1] === String(conversationId) ? path.replace(/\/$/, "") : null;
};

function mergeConversationRecords(current, incoming, dedupeLimit) {
  const people = { ...current.people };
  for (const [authorId, person] of Object.entries(incoming.people)) {
    people[authorId] = mergeAuthorRecords(people[authorId], person);
  }
  const sumPeople = key => Object.values(people).reduce((total, person) => total + count(person[key]), 0);
  const mergeMap = (a, b) => {
    const result = { ...a };
    for (const [key, value] of Object.entries(b || {})) result[key] = Math.max(count(result[key]), count(value));
    return result;
  };
  const mergeArray = (a, b) => Array.from({ length: 24 }, (_, index) => Math.max(count(a?.[index]), count(b?.[index])));
  const latest = (a, b) => Math.max(count(a), count(b));
  const seenMessageKeys = [...new Set([...current.seenMessageKeys, ...incoming.seenMessageKeys])];
  const selected = incoming.updatedAt >= current.updatedAt ? incoming : current;
  const totals = {
    sent: sumPeople("sent"), received: sumPeople("received"), unknown: sumPeople("unknown"),
  };
  // Preserve old aggregate-only records when neither copy has author detail.
  if (!Object.keys(people).length) {
    totals.sent = Math.max(current.totals.sent, incoming.totals.sent);
    totals.received = Math.max(current.totals.received, incoming.totals.received);
    totals.unknown = Math.max(current.totals.unknown, incoming.totals.unknown);
  }
  return {
    ...selected,
    conversationId: current.conversationId,
    navigationPath: current.navigationPath || incoming.navigationPath,
    collection: incoming.collection.lastCollectionAt >= current.collection.lastCollectionAt ? incoming.collection : current.collection,
    status: incoming.updatedAt >= current.updatedAt ? incoming.status : current.status,
    totals,
    people,
    daily: mergeMap(current.daily, incoming.daily),
    dailySent: mergeMap(current.dailySent, incoming.dailySent),
    dailyReceived: mergeMap(current.dailyReceived, incoming.dailyReceived),
    dailyUnknown: mergeMap(current.dailyUnknown, incoming.dailyUnknown),
    hourly: mergeArray(current.hourly, incoming.hourly),
    hourlySent: mergeArray(current.hourlySent, incoming.hourlySent),
    hourlyReceived: mergeArray(current.hourlyReceived, incoming.hourlyReceived),
    hourlyUnknown: mergeArray(current.hourlyUnknown, incoming.hourlyUnknown),
    excludedAuthors: [...new Set([...current.excludedAuthors, ...incoming.excludedAuthors])],
    seenMessageKeys: seenMessageKeys.length > dedupeLimit ? seenMessageKeys.slice(Math.max(0, seenMessageKeys.length - dedupeLimit)) : seenMessageKeys,
    coverage: {
      ...current.coverage, ...incoming.coverage,
      recordsProcessed: latest(current.coverage.recordsProcessed, incoming.coverage.recordsProcessed),
      encountered: latest(current.coverage.encountered, incoming.coverage.encountered),
      duplicatesIgnored: latest(current.coverage.duplicatesIgnored, incoming.coverage.duplicatesIgnored),
      batches: latest(current.coverage.batches, incoming.coverage.batches),
      oldestTimestamp: minDate(current.coverage.oldestTimestamp, [incoming.coverage.oldestTimestamp]),
      newestTimestamp: maxDate(current.coverage.newestTimestamp, [incoming.coverage.newestTimestamp]),
    },
    updatedAt: latest(current.updatedAt, incoming.updatedAt),
  };
}

function reconcileConversationTotals(conversation) {
  const people = Object.values(conversation.people);
  conversation.totals = {
    sent: people.reduce((sum, person) => sum + count(person.sent), 0),
    received: people.reduce((sum, person) => sum + count(person.received), 0),
    unknown: people.reduce((sum, person) => sum + count(person.unknown), 0),
  };
  const sumMaps = field => {
    const result = {};
    for (const person of people) for (const [key, value] of Object.entries(person[field] || {})) result[key] = (result[key] || 0) + count(value);
    return result;
  };
  const sumArrays = field => Array.from({ length: 24 }, (_, hour) => people.reduce((sum, person) => sum + count(person[field]?.[hour]), 0));
  for (const field of ["daily", "dailySent", "dailyReceived", "dailyUnknown"]) conversation[field] = sumMaps(field);
  for (const field of ["hourly", "hourlySent", "hourlyReceived", "hourlyUnknown"]) conversation[field] = sumArrays(field);
}
const sanitizeCollection = raw => {
  const state = INITIAL_COLLECTION_STATES.includes(raw?.state) ? raw.state : "never_collected";
  const operation = ["idle", "collecting", "completed", "incomplete", "interrupted", "failed"].includes(raw?.lastOperationStatus)
    ? raw.lastOperationStatus : "idle";
  return {
    state,
    initialStartedAt: finiteOrNull(raw?.initialStartedAt),
    initialCompletedAt: finiteOrNull(raw?.initialCompletedAt),
    lastCollectionAt: finiteOrNull(raw?.lastCollectionAt),
    lastSuccessfulUpdateAt: finiteOrNull(raw?.lastSuccessfulUpdateAt),
    lastOperationStatus: operation,
    lastMode: raw?.lastMode === "incremental" ? "incremental" : raw?.lastMode === "initial" ? "initial" : null,
    attempts: count(raw?.attempts),
    interrupted: raw?.interrupted === true,
    stopReason: safeString(raw?.stopReason, 80),
    error: safeString(raw?.error, 240),
  };
};
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

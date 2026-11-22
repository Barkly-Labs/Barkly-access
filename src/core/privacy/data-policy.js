export const ANALYTICS_SCHEMA_VERSION = 1;
// Keep every fingerprint so revisiting old virtualized rows never increments
// message counts again. The local data file therefore grows with collected history.
export const MAX_DEDUPE_KEYS_PER_CONVERSATION = Number.MAX_SAFE_INTEGER;

/** Analytics storage deliberately excludes message bodies and raw message IDs. */
export function fingerprintMessageId(messageId) {
  // Stable 64-bit FNV-1a fingerprint for local duplicate detection, not a
  // cryptographic anonymization function. The bounded list is user-clearable.
  let hash = 0xcbf29ce484222325n;
  for (const char of String(messageId)) {
    hash ^= BigInt(char.codePointAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function sanitizeAnalyticsRecord(record) {
  if (!record || typeof record !== "object") return null;
  const { messageId, authorId } = record;
  if (messageId == null || authorId == null) return null;
  const timestamp = record.timestamp == null ? null : Number(record.timestamp);
  return {
    messageId: String(messageId),
    authorId: String(authorId),
    authorName: typeof record.authorName === "string" ? record.authorName.slice(0, 100) : "",
    authorUsername: typeof record.authorUsername === "string" ? record.authorUsername.slice(0, 100) : "",
    avatarUrl: typeof record.avatarUrl === "string" && /^https:\/\/[^\s]{1,500}$/.test(record.avatarUrl) ? record.avatarUrl : "",
    timestamp: Number.isFinite(timestamp) ? timestamp : null,
    isSelf: typeof record.isSelf === "boolean" ? record.isSelf : null,
  };
}

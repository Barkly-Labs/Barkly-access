import { canonicalAuthorId } from "../identity/stable-author.js";

/**
 * Normalizes source messages for count-only processing.
 * The returned objects intentionally omit message text and attachments.
 */
export function normalizeMessages(sourceMessages, {
  getMessageId = (m) => m.id ?? m.messageId,
  getAuthorId = (m) => m.author?.id ?? m.authorId,
  getAuthorName = (m) => m.author?.username ?? m.authorName ?? m.username ?? "",
  getAuthorUsername = (m) => m.authorUsername ?? m.username ?? m.author?.username ?? "",
  getAvatarUrl = (m) => m.avatarUrl ?? m.avatar_url ?? "",
  getConversationId = (m) => m.channel_id ?? m.conversationId ?? m.channelId,
  getTimestamp = (m) => m.timestamp ?? m.createdAt,
  getIsSelf = (m) => typeof m.isSelf === "boolean" ? m.isSelf : null,
} = {}) {
  if (!Array.isArray(sourceMessages)) {
    throw new TypeError("sourceMessages must be an array");
  }

  return sourceMessages.flatMap((m) => {
    if (!m || typeof m !== "object") return [];
    const messageId = getMessageId(m);
    const authorId = canonicalAuthorId(getAuthorId(m));
    if (messageId == null || !authorId) return [];

    const rawTimestamp = getTimestamp(m);
    let numericTimestamp = rawTimestamp == null ? null
      : typeof rawTimestamp === "number" ? rawTimestamp
        : Date.parse(rawTimestamp);
    if (typeof rawTimestamp === "number" && numericTimestamp > 0 && numericTimestamp < 1_000_000_000_000) numericTimestamp *= 1000;
    const avatarUrl = String(getAvatarUrl(m) ?? "").slice(0, 500);
    return [{
      messageId: String(messageId),
      authorId: String(authorId),
      authorName: String(getAuthorName(m) ?? "").slice(0, 100),
      authorUsername: String(getAuthorUsername(m) ?? "").slice(0, 100),
      ...(avatarUrl ? { avatarUrl } : {}),
      conversationId: getConversationId(m) == null
        ? null
        : String(getConversationId(m)),
      timestamp: Number.isFinite(numericTimestamp) ? numericTimestamp : null,
      isSelf: typeof getIsSelf(m) === "boolean" ? getIsSelf(m) : null,
    }];
  });
}

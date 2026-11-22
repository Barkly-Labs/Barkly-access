/**
 * Normalizes source messages for count-only processing.
 * The returned objects intentionally omit message text and attachments.
 */
export function normalizeMessages(sourceMessages, {
  getMessageId = (m) => m.id ?? m.messageId,
  getAuthorId = (m) => m.author?.id ?? m.authorId,
  getConversationId = (m) => m.channel_id ?? m.conversationId ?? m.channelId,
  getTimestamp = (m) => m.timestamp ?? m.createdAt,
} = {}) {
  if (!Array.isArray(sourceMessages)) {
    throw new TypeError("sourceMessages must be an array");
  }

  return sourceMessages.flatMap((m) => {
    if (!m || typeof m !== "object") return [];
    const messageId = getMessageId(m);
    const authorId = getAuthorId(m);
    if (messageId == null || authorId == null) return [];

    return [{
      messageId: String(messageId),
      authorId: String(authorId),
      conversationId: getConversationId(m) == null
        ? null
        : String(getConversationId(m)),
      timestamp: getTimestamp(m) == null
        ? null
        : getTimestamp(m),
    }];
  });
}

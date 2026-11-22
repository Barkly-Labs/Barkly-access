import { getConversationHref } from "../../integrations/betterdiscord/conversation-selection.js";

/** Builds the Frequent view from the same deduplicated aggregates used by Stats. */
export function buildFrequentContacts(snapshot, { search = "", sort = "messages" } = {}) {
  const query = String(search).trim().toLocaleLowerCase();
  const contacts = new Map();
  for (const conversation of Object.values(snapshot?.conversations || {})) {
    for (const [authorId, person] of Object.entries(conversation.people || {})) {
      const total = Number.isFinite(person.total)
        ? person.total
        : (person.sent || 0) + (person.received || 0) + (person.unknown || 0);
      if (total <= 0) continue;
      const key = `${conversation.conversationId}\u0000${authorId}`;
      const contact = {
        key,
        authorId: String(authorId),
        conversationId: String(conversation.conversationId),
        displayName: person.name || String(authorId),
        username: person.username || "",
        avatarUrl: person.avatarUrl || "",
        messageCount: total,
        lastTimestamp: person.lastTimestamp || null,
        conversationStatus: conversation.status,
        href: getConversationHref(conversation.navigationPath, conversation.conversationId),
      };
      const haystack = `${contact.displayName} ${contact.username} ${contact.authorId} ${contact.conversationId}`.toLocaleLowerCase();
      if (!query || haystack.includes(query)) contacts.set(key, contact);
    }
  }
  const result = [...contacts.values()];
  if (sort === "recent") result.sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0) || a.displayName.localeCompare(b.displayName));
  else if (sort === "name") result.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.authorId.localeCompare(b.authorId));
  else result.sort((a, b) => b.messageCount - a.messageCount || a.displayName.localeCompare(b.displayName));
  return result;
}

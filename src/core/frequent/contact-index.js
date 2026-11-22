import { getConversationHref } from "../../integrations/betterdiscord/conversation-selection.js";
import { canonicalAuthorId } from "../identity/stable-author.js";

/** Builds the Frequent view from the same deduplicated aggregates used by Stats. */
export function buildFrequentContacts(snapshot, { search = "", sort = "messages" } = {}) {
  const query = String(search).trim().toLocaleLowerCase();
  const contacts = new Map();
  for (const conversation of Object.values(snapshot?.conversations || {})) {
    for (const [authorId, person] of Object.entries(conversation.people || {})) {
      const stableId = canonicalAuthorId(person.authorId ?? authorId);
      if (!stableId) continue;
      const total = Number.isFinite(person.total)
        ? person.total
        : (person.sent || 0) + (person.received || 0) + (person.unknown || 0);
      if (total <= 0) continue;
      const key = `${conversation.conversationId}\u0000${stableId}`;
      const existing = contacts.get(key);
      if (existing) {
        existing.messageCount += total;
        const incomingTimestamp = person.lastTimestamp || 0;
        if (incomingTimestamp >= (existing.lastTimestamp || 0) && person.name) existing.displayName = person.name;
        existing.lastTimestamp = Math.max(existing.lastTimestamp || 0, incomingTimestamp) || null;
        if (incomingTimestamp >= (existing.lastTimestamp || 0) && person.username) existing.username = person.username;
        if (incomingTimestamp >= (existing.lastTimestamp || 0) && person.avatarUrl) existing.avatarUrl = person.avatarUrl;
        if (!existing.username && person.username) existing.username = person.username;
        if (!existing.avatarUrl && person.avatarUrl) existing.avatarUrl = person.avatarUrl;
        if (existing.displayName === String(existing.authorId) && person.name) existing.displayName = person.name;
        continue;
      }
      const contact = {
        key,
        authorId: stableId,
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

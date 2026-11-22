import { getConversationHref } from "../../integrations/betterdiscord/conversation-selection.js";
import { canonicalAuthorId } from "../identity/stable-author.js";
import { UNRESOLVED_AUTHOR_ID } from "../identity/participant-resolver.js";

/** Ranks DM partners by the current user's unique sent messages. */
export function buildFrequentContacts(snapshot, { search = "", sort = "messages", currentUserId = null } = {}) {
  const query = String(search).trim().toLocaleLowerCase();
  const selfId = canonicalAuthorId(currentUserId);
  if (!selfId) return [];
  const contacts = new Map();
  for (const conversation of Object.values(snapshot?.conversations || {})) {
    // This view ranks people in DMs. A guild-channel message is not an
    // individual interaction with every visible member of that channel.
    if (!/^\/channels\/@me\/\d+\/?$/.test(conversation.navigationPath || "")) continue;
    const peopleById = new Map();
    for (const [personKey, person] of Object.entries(conversation.people || {})) {
      const stableId = canonicalAuthorId(person.authorId ?? personKey);
      if (!stableId) continue;
      const existing = peopleById.get(stableId);
      if (!existing) peopleById.set(stableId, person);
      else {
        const existingRecent = Number(existing.lastTimestamp) || 0;
        const incomingRecent = Number(person.lastTimestamp) || 0;
        peopleById.set(stableId, {
          ...existing,
          ...(incomingRecent >= existingRecent ? person : {}),
          authorId: stableId,
          total: Math.max(Number(existing.total) || 0, Number(person.total) || 0),
          lastTimestamp: Math.max(existingRecent, incomingRecent) || null,
        });
      }
    }
    const self = peopleById.get(selfId);
    if (!self) continue;
    // Identity makes this total reliable even for older records collected
    // before direction classification was configured.
    const ownTotal = Number(self.total);
    const sentToConversation = Number.isFinite(ownTotal) && ownTotal >= 0
      ? ownTotal : (Number(self.sent) || 0) + (Number(self.received) || 0) + (Number(self.unknown) || 0);
    if (sentToConversation <= 0) continue;
    const recentConversationActivity = Math.max(Number(self.lastTimestamp) || 0,
      ...[...peopleById.values()].map(person => Number(person.lastTimestamp) || 0));

    for (const [stableId, person] of peopleById) {
      if (!stableId || stableId === UNRESOLVED_AUTHOR_ID || stableId === selfId) continue;
      const key = stableId;
      const existing = contacts.get(key);
      const isMoreRecent = recentConversationActivity >= (existing?.lastTimestamp || 0);
      if (existing) {
        existing.messageCount += sentToConversation;
        existing.lastTimestamp = Math.max(existing.lastTimestamp || 0, recentConversationActivity) || null;
        if (isMoreRecent) {
          existing.displayName = person.name || existing.displayName;
          existing.username = person.username || existing.username;
          existing.avatarUrl = person.avatarUrl || existing.avatarUrl;
          existing.conversationId = String(conversation.conversationId);
          existing.conversationStatus = conversation.status;
          existing.href = getConversationHref(conversation.navigationPath, conversation.conversationId);
        }
        continue;
      }
      const contact = {
        key,
        authorId: stableId,
        conversationId: String(conversation.conversationId),
        displayName: person.name || stableId,
        username: person.username || "",
        avatarUrl: person.avatarUrl || "",
        messageCount: sentToConversation,
        lastTimestamp: recentConversationActivity || null,
        conversationStatus: conversation.status,
        href: getConversationHref(conversation.navigationPath, conversation.conversationId),
      };
      contacts.set(key, contact);
    }
  }
  const result = [...contacts.values()].filter(contact => {
    const haystack = `${contact.displayName} ${contact.username} ${contact.authorId}`.toLocaleLowerCase();
    return !query || haystack.includes(query);
  });
  if (sort === "recent") result.sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0) || a.displayName.localeCompare(b.displayName));
  else if (sort === "name") result.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.authorId.localeCompare(b.authorId));
  else result.sort((a, b) => b.messageCount - a.messageCount || a.displayName.localeCompare(b.displayName));
  return result;
}

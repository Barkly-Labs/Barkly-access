/**
 * Build a native same-app anchor so Discord's ordinary route is activated by
 * mouse, keyboard, context menu, or assistive technology without private APIs.
 */
export function createDiscordConversationLink(document, contact) {
  if (!contact?.href) return null;
  const link = document.createElement("a");
  link.className = "ba-contact-link";
  link.href = contact.href;
  link.setAttribute("aria-label", `Open Discord conversation with ${contact.displayName}, ${contact.messageCount.toLocaleString()} collected messages`);
  link.textContent = contact.displayName;
  return link;
}

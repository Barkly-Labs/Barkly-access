/** Extract the active channel/DM identifier from the current Discord route. */
export function getSelectedConversationId(pathname) {
  return String(pathname || "").match(/\/channels\/(?:@me|\d+)\/(\d+)/)?.[1] || null;
}

/** Return a same-app conversation URL only when its channel ID matches. */
export function getConversationHref(pathname, conversationId) {
  const match = String(pathname || "").match(/^\/channels\/(?:@me|\d+)\/(\d+)\/?$/);
  if (!match || String(match[1]) !== String(conversationId)) return null;
  return `/channels/${String(pathname).match(/^\/channels\/(@me|\d+)\//)[1]}/${match[1]}`;
}

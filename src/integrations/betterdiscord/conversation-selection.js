/** Extract the active channel/DM identifier from the current Discord route. */
export function getSelectedConversationId(pathname) {
  return String(pathname || "").match(/\/channels\/(?:@me|\d+)\/(\d+)/)?.[1] || null;
}

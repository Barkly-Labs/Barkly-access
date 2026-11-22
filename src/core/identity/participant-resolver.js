import { canonicalAuthorId } from "./stable-author.js";

export const UNRESOLVED_AUTHOR_ID = "__unresolved_author__";

export function resolveParticipant({ authorId, currentUserId } = {}) {
  const stableAuthorId = canonicalAuthorId(authorId);
  if (!stableAuthorId) {
    return { authorId: UNRESOLVED_AUTHOR_ID, isResolved: false, isSelf: null, role: "unresolved" };
  }
  const stableCurrentUserId = canonicalAuthorId(currentUserId);
  if (stableCurrentUserId && stableAuthorId === stableCurrentUserId) {
    return { authorId: stableAuthorId, isResolved: true, isSelf: true, role: "current-user" };
  }
  if (!stableCurrentUserId) {
    return { authorId: stableAuthorId, isResolved: true, isSelf: null, role: "participant" };
  }
  return { authorId: stableAuthorId, isResolved: true, isSelf: false, role: "other-participant" };
}

export function discoverCurrentUserId(document) {
  if (!document?.querySelectorAll) return null;
  const candidates = [
    ...document.querySelectorAll('[data-user-id], [data-author-id]'),
    ...document.querySelectorAll('a[href*="/users/"]'),
  ];
  for (const node of candidates) {
    const direct = node.getAttribute?.("data-user-id") || node.getAttribute?.("data-author-id");
    const href = node.getAttribute?.("href") || "";
    const directId = /^\d{5,}$/.test(String(direct || "").trim()) ? String(direct).trim() : null;
    const id = canonicalAuthorId(directId || href.match(/\/users\/(\d{5,})/)?.[1]);
    if (id) {
      const accountContext = node.closest?.('[class*="account" i], [class*="panels" i]');
      if (accountContext) return id;
    }
  }
  return null;
}

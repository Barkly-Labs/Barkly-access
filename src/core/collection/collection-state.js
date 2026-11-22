export const INITIAL_COLLECTION_STATES = Object.freeze([
  "never_collected", "initial_in_progress", "initial_completed", "interrupted", "failed", "incomplete",
]);

/** A completed initial scan is followed by a viewport-only incremental check. */
export function collectionModeFor(collection) {
  return collection?.state === "initial_completed" ? "incremental" : "initial";
}

/** Classify an engine result without treating an arbitrary stop as success. */
export function classifyCollectionOutcome({ mode = "initial", stopReason = null, complete = false, interrupted = false, failed = false } = {}) {
  if (failed) return "failed";
  if (interrupted || ["cancelled", "interrupted", "conversation-view-unavailable"].includes(stopReason)) return "interrupted";
  if (complete || stopReason === "oldest-visible-edge-stable" || (mode === "incremental" && stopReason === "incremental-visible-batch")) return "completed";
  return "incomplete";
}

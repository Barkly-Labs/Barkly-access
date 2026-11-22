# Architecture

Barkly Access keeps UI integration, collection, aggregation, and persistence in separate modules.

- `src/integrations/betterdiscord/conversation-selection.js` gets the selected channel or DM ID from the visible route.
- `src/integrations/betterdiscord/rendered-history-adapter.js` observes the visible message list, extracts count-only metadata, progressively scrolls older rows during initial backfill, then performs viewport-only incremental refreshes after that backfill reaches its observable stopping condition.
- `src/core/collection/collection-coordinator.js` runs one scan at a time, normalizes batches, deduplicates through the store, persists each batch and per-conversation lifecycle state, reports status and progress, and handles cancellation/errors.
- `src/core/collection/collection-state.js` selects initial versus incremental collection and only classifies an initial backfill as completed when its observable oldest-edge condition is reached.
- `src/core/history/normalizer.js` converts supported source fields to a minimal metadata record and drops body text/attachments.
- `src/core/frequent/contact-index.js` rebuilds the Frequent list from the same persisted per-person aggregates, keyed by stable author ID and conversation ID.
- `src/core/storage/historical-store.js` maintains schema-versioned local aggregates and persistent ID fingerprints. It stores no message bodies or raw message IDs.
- `src/core/analytics/statistics-engine.js` calculates filtered totals and activity groupings from stored aggregates.
- `src/integrations/betterdiscord/BarklyAccess.plugin.js` supplies the accessible controls, collection-status popup, and full-screen dashboard.

The only history source is the user-visible Discord UI. The implementation makes no Discord private API or internal-store calls. Collection coverage remains partial/observable because the UI exposes no authoritative total-history cursor.

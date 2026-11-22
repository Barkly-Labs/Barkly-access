# Architecture

Barkly Access keeps UI integration, collection, aggregation, and persistence in separate modules.

- `src/integrations/betterdiscord/conversation-selection.js` gets the selected channel or DM ID from the visible route.
- `src/integrations/betterdiscord/rendered-history-adapter.js` observes the visible message list, locates its scroll container, extracts count-only metadata, progressively scrolls toward older rendered rows, reports observable stop conditions, and restores the user's reading context where possible.
- `src/core/collection/collection-coordinator.js` runs one scan at a time, normalizes batches, deduplicates through the store, persists each batch, reports status and progress, and handles cancellation/errors.
- `src/core/history/normalizer.js` converts supported source fields to a minimal metadata record and drops body text/attachments.
- `src/core/storage/historical-store.js` maintains schema-versioned local aggregates and bounded ID fingerprints. It stores no message bodies or raw message IDs.
- `src/core/analytics/statistics-engine.js` calculates filtered totals and activity groupings from stored aggregates.
- `src/integrations/betterdiscord/BarklyAccess.plugin.js` supplies the accessible controls and full-screen dashboard.

The only history source is the user-visible Discord UI. The implementation makes no Discord private API or internal-store calls. Collection coverage remains partial/observable because the UI exposes no authoritative total-history cursor.

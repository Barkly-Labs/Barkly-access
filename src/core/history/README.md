# Barkly Access — History and Analytics Core

The history core normalizes rendered message metadata. Collection, aggregate storage, and statistics are in separate modules. They do not need message bodies.

## Files
- `src/core/history/aggregation-engine.js`: aggregation, bounded duplicate tracking, reset and stats.
- `src/core/history/normalizer.js`: strips bodies and normalizes message metadata.
- `tests/aggregation-engine.test.mjs`: Node built-in test suite.
- `src/core/collection/collection-coordinator.js`: selected-conversation collection lifecycle.
- `src/core/storage/historical-store.js`: aggregate-only persistence and bounded duplicate fingerprints.
- `src/core/analytics/`: UTC summaries and time-series grouping.

## Run tests
```bash
node --test tests/aggregation-engine.test.mjs
```

The persisted fingerprint list is bounded to 20,000 message IDs per conversation. Older entries can be counted again after eviction. The current BetterDiscord source requests older messages through the selected conversation's visible UI; it cannot verify complete coverage.

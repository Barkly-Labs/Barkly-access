# Barkly Access — Aggregation Core

The aggregation core receives normalized message metadata and computes per-author counts. It does not need message bodies.

## Files
- `src/core/history/aggregation-engine.js`: aggregation, bounded duplicate tracking, reset and stats.
- `src/core/history/normalizer.js`: strips bodies and normalizes message metadata.
- `tests/aggregation-engine.test.mjs`: Node built-in test suite.

## Run tests
```bash
node --test tests/aggregation-engine.test.mjs
```

The deduplication set is bounded. When the limit is reached, old IDs are evicted, so repeated IDs beyond that window may be counted again. A production history adapter should ideally provide pagination/cursors with non-overlapping batches, or use a scan-scoped persisted dedupe strategy.

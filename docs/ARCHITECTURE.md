# Barkly Access — Architecture

## PAW-HC principle
People Are Worth Designing For. Reduce the user's effort, protect their data, provide clear control, and support accessible presentation.

## Current repository layout
```text
src/
├── integrations/
│   └── betterdiscord/
│       ├── BarklyAccess.plugin.js
│       └── README.md
├── core/
│   ├── history/
│   │   ├── normalizer.js
│   │   └── aggregation-engine.js
└── styles/
    └── frequent.css
scripts/
└── build.mjs
tests/
├── aggregation-engine.test.mjs
└── build.test.mjs
dist/
└── BarklyAccess.plugin.js (generated)
```

## Data flow
1. **User-selected JSON:** the prototype reads a local file selected in the Frequent panel.
2. **Normalizer:** maps compatible records to a count-only schema and discards bodies and attachments.
3. **Aggregation engine:** counts by author and skips duplicate IDs with a bounded in-memory set.
4. **Frequent view:** presents a numbered ranking, counts, status, import and clear controls.
5. **Clear/dispose:** clearing or stopping the plugin drops counts, dedupe IDs and display labels. No ranking store is implemented yet.

## Normalized message schema
```js
{
  messageId: "msg_001",
  authorId: "user_123",
  conversationId: "channel_456",
  timestamp: 1795360000
}
```
Message body is intentionally excluded from the normalized counting schema.

## Aggregation engine (initial illustration)
```js
class AggregationEngine {
  constructor() {
    this.counts = new Map();
    this.processedIds = new Set();
  }

  processBatch(messages) {
    for (const message of messages) {
      if (this.processedIds.has(message.messageId)) continue;
      this.processedIds.add(message.messageId);
      this.counts.set(
        message.authorId,
        (this.counts.get(message.authorId) || 0) + 1
      );
    }
  }

  getRanking() {
    return [...this.counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([userId, count], index) => ({
        rank: index + 1, userId, count
      }));
  }
}
```
For large histories, `processedIds` uses bounded FIFO eviction. An ID older than the deduplication window can be counted again. Current rankings are in-memory only.

## Interfaces

### Future history source adapter
- `startScan(options)` — starts an authorized scan.
- `getNextBatch()` — returns the next batch and cursor/progress metadata.
- `cancelScan()` — stops the scan.
- `dispose()` — releases resources.

An adapter may use only a supported, authorized source. It must not bypass platform authorization or automate access through private endpoints or personal tokens. The current implementation reads only a user-selected local file.

### Aggregation engine
- `processBatch(normalizedMessages)`
- `getRanking()`
- `reset()`

### Future ranking store
- `saveAggregate(snapshot)`
- `loadAggregate()`
- `clear()`

### Frequent UI (prototype)
- numbered ranked rows
- display name where available
- message count
- import status and clear/reset control
- accessible keyboard navigation and screen-reader labels

## Privacy and retention
- Do not store message text for this ranking feature.
- Process data in batches and release each batch after processing.
- Keep only aggregate totals, bounded dedupe IDs and optional author labels in memory.
- Do not persist Frequent data in the prototype.
- Provide a visible clear/reset action.
- Avoid logging message contents, personal tokens, or sensitive identifiers.
- Use authorized data sources; never collect credentials as a side effect.

## Accessibility requirements
- Keyboard-operable controls and visible focus.
- Semantic headings and labels.
- Contrast checked against WCAG guidance.
- Respect reduced-motion preferences.
- User-controlled density and grouping.
- Clear progress, cancellation and error messages.
- Avoid color as the sole indicator of rank or status.

## Initial milestones
1. Define adapter and normalized schema.
2. Implement and test aggregation/deduplication.
3. Implement privacy and retention behavior.
4. Build Frequent UI with mock data.
5. Connect an authorized source adapter.
6. Integrate into BetterDiscord module structure and test.

## Build pipeline

`npm run build` uses esbuild to bundle the BetterDiscord integration, normalizer, aggregation engine and Frequent styles into `dist/BarklyAccess.plugin.js`. The output uses BetterDiscord's CommonJS `module.exports` contract and includes plugin metadata. `npm test` builds first, then runs Node's built-in tests, including a check of the generated bundle.

# Barkly Access architecture

## Modules

```text
src/
├── core/
│   ├── analytics/       # summary, time range, daily/weekly/monthly series
│   ├── collection/      # source-independent lifecycle coordinator
│   ├── history/         # count-only normalizer and aggregate engine
│   ├── privacy/         # retained-field policy and message ID fingerprints
│   └── storage/         # local aggregate schema, validation, clear operations
├── integrations/betterdiscord/
│   ├── BarklyAccess.plugin.js
│   ├── conversation-selection.js
│   └── rendered-history-adapter.js
└── styles/frequent.css  # panel and Stats dashboard styles
scripts/build.mjs
tests/
```

The production entry bundles these modules into `dist/BarklyAccess.plugin.js`. The core collection, storage, and analytics modules have no BetterDiscord dependencies. The BetterDiscord adapter provides the current conversation ID and metadata from message elements rendered in that conversation.

## Collection flow

1. Opening a channel or DM changes the Discord route. The route adapter extracts its conversation ID.
2. A debounced mutation observer follows the active message list. On opening a conversation, the adapter scrolls that selected list toward older messages, then reads each rendered batch. It stops after 3 stable passes or 250 batches and restores the reading position where possible.
3. The rendered-history adapter reads message ID, author ID/name, timestamp, and selected conversation. It does not read message body text or attachments.
4. The coordinator normalizes each batch, associates it with the selected conversation, reports status, and passes it to the historical store.
5. The store uses bounded message-ID fingerprints to skip duplicates, updates aggregate counters, and persists each batch with BetterDiscord's local Data API.
6. The Stats and Frequent views read persisted aggregates. Clear operations cancel the active job before deleting stored data.

Every UI-derived collection is marked `partial`. The adapter can request older rows through the visible UI but cannot verify that Discord has rendered the complete conversation. New rendered records are added incrementally.

## Stored data

For each selected conversation the store keeps aggregate totals, per-author totals and display labels, UTC daily/hourly counts, exclusions, collection status and coverage timestamps, and up to 5,000 message-ID fingerprints for duplicate suppression. Raw message IDs and bodies are not stored. Fingerprints use a non-cryptographic 64-bit hash and must be treated as pseudonymous data, not anonymized data. See [Privacy](PRIVACY.md).

## Source adapter boundary

Adapters implement `startScan({conversationId, signal})`, `getNextBatch({conversationId, signal})`, optional `cancelScan`, and optional `dispose`. A batch contains normalized-compatible metadata records plus `done`, `complete`, and source metadata. The coordinator prevents overlapping scans for one conversation, processes batches, preserves prior aggregates on failures, and supports cancellation/retry.

The current BetterDiscord source reads only the selected conversation's rendered DOM. It does not call Discord private endpoints, patch Discord's internal message-fetching modules, or collect personal tokens. DOM selectors are unstable and this is not an official Discord history API.

## Build and tests

Run `npm test` to build and run Node's built-in tests. `npm run build` emits the BetterDiscord CommonJS plugin. See [Build](BUILD.md) and [Analytics](ANALYTICS.md).

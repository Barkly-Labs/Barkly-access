# Barkly Access — History and Analytics Core

The history core normalizes rendered message metadata. Collection, aggregate storage, contact indexing, and statistics are separate modules. Message bodies are not needed.

## Files

- `aggregation-engine.js`: legacy in-memory count helper, tested independently.
- `normalizer.js`: converts supported source fields to minimal message metadata.
- `../collection/collection-coordinator.js`: selected-conversation collection lifecycle and batch persistence.
- `../storage/historical-store.js`: aggregate persistence and persistent message-ID fingerprints.
- `../frequent/contact-index.js`: derives stable person/conversation contacts from the same historical store.
- `../analytics/`: UTC summaries and time-series grouping.
- `../../integrations/betterdiscord/conversation-selection.js`: validates same-app conversation routes.

## Run tests

```sh
npm test
```

The store retains one compact fingerprint for every distinct collected message ID, so overlapping or repeated scans do not inflate counts after reload. Storage grows with collected history. The BetterDiscord source uses only rendered UI records and cannot certify that Discord has exposed the full conversation history.

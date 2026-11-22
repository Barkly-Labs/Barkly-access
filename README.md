# Barkly Access

**Accessibility tools for Discord, built around PAW-HC: People Are Worth Designing For.** Barkly Access adds reversible reading controls and local, metadata-only conversation analytics.

## Features

- Quiet View, readable message spacing, and numbered conversation chunks.
- Progressive history backfill through the selected conversation's visible Discord UI, with cancellation and best-effort reading-position restoration.
- Locally persisted aggregate counts by conversation and person, UTC daily and hourly activity, collection status, and duplicate suppression.
- A full-screen Analytics Dashboard with conversation/person/date filters, search, sorting, pagination, readable data tables, person details, text-size choices, and higher-contrast mode.
- Clear-one-conversation and clear-all analytics controls.

## Open analytics

Open the Barkly Access panel, select **Stats**, then choose **Open Analytics Dashboard**. The dashboard shows stored totals and the collection limits. To backfill the selected conversation again, use **Backfill selected conversation**. The scan can be stopped at any time.

## Collection boundary

Collection observes the selected route and the visible message list. It scrolls upward in overlapping steps, waits for newly rendered rows, extracts minimal metadata, and stops after the oldest visible edge is stable, scrolling stagnates, or a 250-batch safety limit is reached. It restores the previous reading context with a rendered message anchor where possible. This stopping condition does not prove that all server history has loaded; Discord exposes no definitive total-history count to this adapter.

The integration does not call Discord private APIs, access internal stores, or use personal tokens. Direction remains unknown because this adapter does not obtain the current user identity from an approved source. Rows without stable message and author IDs are skipped. Discord and BetterDiscord can change their UI selectors and scrolling behavior. The client integration has not been validated against a running Discord client in this workspace.

## Privacy and persistence

Processing stays on the device. Message bodies and attachments are not read or stored. The local store keeps aggregates, author IDs and display labels needed for the dashboard, conversation IDs, collection metadata, and up to 250,000 compact non-cryptographic message-ID fingerprints per conversation for duplicate suppression. Fingerprints are pseudonymous local identifiers, not anonymization. Once that bound is reached, older fingerprints are evicted and a revisited old message could be counted again. Use the clear controls in Stats to erase saved analytics.

No raw message-by-message transcript is retained. The dashboard explores all aggregate data the plugin saves.

See [Privacy](docs/PRIVACY.md), [Analytics and collection](docs/ANALYTICS.md), and [Architecture](docs/ARCHITECTURE.md).

## Build, test, install

Requires Node.js and the platform-specific optional binary for the locked `esbuild` version.

```sh
npm ci
npm test
```

The test command builds the standalone plugin at `dist/BarklyAccess.plugin.js` and runs the tests. Copy that file into BetterDiscord's Plugins folder and reload plugins.

MIT License. See [LICENSE](LICENSE).

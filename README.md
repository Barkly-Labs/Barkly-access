# Barkly Access

**Accessibility tools for Discord, built around PAW-HC: People Are Worth Designing For.** Barkly Access adds reversible reading controls and locally stored conversation statistics.

## Features

- Quiet View, readable message spacing, and numbered conversation chunks.
- Automatic collection when a Discord conversation is opened: Barkly Access scrolls the selected UI to request older rows and counts each rendered batch.
- Locally persisted counts by author, sent/received/unknown direction, activity by UTC day and hour, Frequent ranking, and historical coverage status.
- Accessible Stats controls for search, time range, daily/weekly/monthly grouping, contact exclusions, and deletion.
- Per-conversation and all-analytics clear controls.

## Collection boundary

Barkly Access does not call Discord private APIs or use personal tokens. When a conversation opens, it uses that conversation's visible scroll container to request older rows from Discord's ordinary UI, processes each rendered batch, then attempts to restore the original reading position. The scan stops after 3 unchanged passes or 250 batches and can be cancelled from Stats. Coverage is always marked partial because the UI does not confirm that all historical messages are available. Direction is reported as unknown; this integration avoids Discord's internal user store.

Discord and BetterDiscord can change their client UI. Selectors and rendered metadata are experimental and may stop working. The client integration has not been validated against a running Discord client in this workspace.

## Privacy

Processing stays on the device. Raw message bodies are not read or persisted. The store keeps aggregates, author IDs and display labels needed for the dashboard, conversation IDs, and a bounded list of non-cryptographic message-ID fingerprints for duplicate suppression. Fingerprints are local pseudonymous identifiers, not anonymization. The list is limited to 20,000 entries per conversation, so older messages can be counted again after eviction. View preferences and analytics are saved locally through BetterDiscord's Data API. Use **Clear this conversation** or **Clear all analytics** to delete analytics.

See [Privacy](docs/PRIVACY.md), [Analytics and collection](docs/ANALYTICS.md), and [Architecture](docs/ARCHITECTURE.md).

## Build, test, install

Requires Node.js 20 or newer.

```sh
npm install
npm test
npm run build
```

The standalone plugin is generated at `dist/BarklyAccess.plugin.js`. Copy that file into BetterDiscord's Plugins folder using **User Settings → BetterDiscord → Plugins → Open Plugins Folder**, then enable **BarklyAccess**. BetterDiscord's [addon guide](https://docs.betterdiscord.app/users/guides/installing-addons) provides current installation steps.

## Limitations

- Counts represent messages that Discord rendered in the selected conversation during plugin use; full-history completeness cannot be verified.
- Collection automatically scrolls the selected conversation to load older history and restores the reading position when possible.
- Sent/received classification is unknown without a safe, supported current-user identity source.
- The UI adapter relies on unstable Discord DOM selectors.
- Optional JSON import remains available under Frequent for local testing; it is not required for automatic Stats collection.

MIT License. See [LICENSE](LICENSE).

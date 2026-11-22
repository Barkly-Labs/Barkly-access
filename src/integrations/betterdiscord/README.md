# BetterDiscord integration

The integration preserves Quiet View, readable chat layout, conversation cards, and reversible controls. It adds automatic local Stats collection for the conversation selected in Discord.

## Live collection boundary

Conversation selection comes from the current `/channels/...` UI route. A debounced observer watches that conversation's rendered list. The adapter scrolls the selected UI to request older rows, reads message/author identifiers, author name, and timestamp, then restores the previous reading position where possible. It stops after 3 stable passes or 250 batches and can be cancelled in Stats. It does not read body text, use Discord internal Webpack modules, call private endpoints, or access tokens. The coordinator sends metadata to the aggregate-only local store.

This captures rows rendered by Discord's UI, not verifiably complete history. Coverage remains partial. Discord DOM selectors and its scroll behavior can change and require live-client validation. The adapter also cannot safely identify the current account through a public stable API, so message direction is recorded as unknown.

## Stats and Frequent

**Stats** displays persistent totals, contact ranking/search, range filters, daily/weekly/monthly activity, busiest UTC hour, individual details, exclusions, and per-conversation/all-data clear controls. **Frequent** uses the same saved author aggregates. An optional JSON testing/fallback import is tucked into a disclosure and remains session-only; it is not needed for Stats.

Persistent analytics are stored with BetterDiscord's Data API. Bodies are discarded before storage. Up to 20,000 non-cryptographic message ID fingerprints per conversation are kept for duplicate suppression. See `docs/PRIVACY.md` for retention and its limitations.

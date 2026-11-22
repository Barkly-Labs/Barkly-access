# BetterDiscord integration

The plugin preserves Quiet View, readable message layout, numbered conversation cards, and reversible access controls. It collects locally visible message metadata for the selected route and exposes it through Stats and Frequent.

## Collection boundary

Conversation selection comes from the current `/channels/...` route. A debounced observer watches the visible message list. The adapter scrolls the selected conversation upward in overlapping steps, waits for newly rendered rows, then extracts message ID, author ID, visible author name, optional username metadata, and timestamp. It restores the previous reading position where possible and stops on visible-edge stability, stagnation, or the 250-batch limit. It can be cancelled in Stats. It does not read body text, use Discord internal Webpack modules, call private endpoints, or access tokens. The coordinator deduplicates and persists aggregates locally.

Coverage is only the rendered history observed by the UI; Discord provides no authoritative complete-history signal. UI selectors and scrolling behavior can change and require live-client validation. Direction remains unknown because the adapter does not read the current-user identity from Discord internals.

## Frequent and Stats

Stats remains the source for persistent per-conversation/per-person aggregates. Frequent rebuilds person-by-conversation entries from those same saved aggregates, keyed by stable author ID plus conversation ID. It counts all collected messages regardless of known direction and supports search and sorting.

During collection, the current ordinary Discord route is saved with its conversation aggregate. A Frequent contact with a validated matching route is rendered as a regular `/channels/...` link; activating it opens that Discord conversation through normal browser navigation. If the route is absent or does not match the conversation ID, Frequent displays an unavailable message instead of a misleading shortcut. The integration does not resolve a new DM from a user ID alone. Avatar assets are not retained.

Analytics, route metadata, and fingerprints persist through BetterDiscord's Data API. The plugin stores no message bodies or raw message IDs. It retains one compact message-ID fingerprint for each unique message so rediscovered rows do not inflate counts; storage grows with collected history. Use Stats clear controls to delete it.

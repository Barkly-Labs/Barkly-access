# Barkly Access · BetterDiscord adapter

Experimental client-mod adapter for cognitive decluttering. The goal is progressive disclosure: a single Quiet View toggle, with optional controls tucked away and a one-step restore. This is not officially supported by Discord and client selectors may break.

- `Ctrl+Shift+F`: toggle Quiet View
- `Ctrl+Shift+R`: restore view
- Quiet View applies spacing and hides selected peripheral areas; content/messages are not filtered. The control panel exposes individual restore switches.

PAW-HC: reversible, user-directed, dignity-preserving; WCAG checks still need manual testing in the client.

## Readable chat layout (0.4 experimental)

The **Readable chat layout** toggle adds a restrained message hierarchy: extra vertical space between message rows, a readable measure for message text, quieter timestamp styling, and clearer reply/embed presentation. It does not filter, summarize, or remove message content. Toggle it independently from Quiet View.

This relies on Discord's internal CSS class names, which are unstable. Validate selectors and keyboard/screen-reader behavior in the live client before relying on them.

## Conversation chunking (experimental)

When **Conversation cards** is enabled, the adapter groups a burst of adjacent messages into a single visual chunk, regardless of sender. A chunk ends when the timestamp gap exceeds 15 minutes (or timestamps cannot be read). The first message displays a pink numbered anchor; following messages share the chunk surface with subtle separators. This avoids treating every message as a separate card and makes short exchanges easier to scan. The grouping is presentation-only and does not change, filter, or reorder messages.

Discord's internal DOM and timestamps are unstable; verify this behavior in the client. The 15-minute boundary is a prototype heuristic.

## Frequent import prototype

The **Frequent** tab accepts a local JSON export as an array or an object with `messages`, `data`, or `items`. Each counted record must contain a stable message ID and author ID. The shared history normalizer discards body and attachment fields; the shared aggregation engine counts per author and skips duplicate IDs within its bounded in-memory deduplication window. Optional display names are shown when available. Counts are ranked, numbered, and announced through a live status region. **Clear ranking** removes aggregate counts, duplicate IDs, and labels; stopping/restarting the plugin also clears them. These values are never persisted or sent elsewhere.

This prototype does not collect messages from Discord automatically and does not access internal Discord APIs or user tokens. The user must select a local JSON file. Counts reflect only valid records in that file. Keep exports private and only import data you are authorized to use.

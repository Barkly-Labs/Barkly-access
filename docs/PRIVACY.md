# Analytics privacy and retention

## Data collection

Collection starts only for the conversation selected in Discord. Barkly Access progressively scrolls that conversation's visible interface to request older rendered rows, then inspects each rendered batch. Collection begins when a conversation is selected and its rendered message list changes; Stats explains the behavior and offers cancellation and manual backfill. It does not open unrelated conversations, call private endpoints, extract credentials, or store tokens. Processing is local. Analytics are not transmitted. The scan can temporarily move the conversation view and then tries to restore the previous position; a stop control cancels it.

## Data retained locally

The BetterDiscord Data API stores:

- Conversation IDs required to associate and clear conversation statistics.
- Author IDs, visible display names, and usernames when the rendered UI exposes them, needed to identify contacts in Frequent and the dashboard.
- Aggregate sent, received, unknown, daily, and hourly counts.
- Exclusion preferences, collection state, coverage timestamps, and the captured conversation route used for a same-app shortcut in Frequent.
- Non-cryptographic fingerprints of all collected message IDs for deduplication. The list grows with collected history.

The fingerprint is a deterministic 64-bit FNV-1a hash, not a cryptographic anonymizer. It is pseudonymous metadata and may be guessable. Fingerprints are retained for every unique collected message so older messages are not recounted when the UI virtualizes them. Storage grows with history. Raw message IDs are not kept in persistent analytics.

Raw message bodies, attachments, reactions, and embeds are not read into analytics records or persisted. Source records exist transiently while each visible batch is normalized and discarded. The user can clear one conversation or all analytics from Stats. Disabling the plugin stops collection but preserves aggregates so they remain available after restart.

## Direction and identity

The current safe UI adapter cannot obtain the current user's ID through a public, stable BetterDiscord API. It therefore marks direction unknown instead of using Discord's internal user store or guessing from a username. If a future authorized adapter provides identity, sent/received classification can be enabled there.

## Limits

BetterDiscord is an unofficial client modification, and Discord's DOM is not a stable data API. UI selectors can change. Current data means metadata visible in the selected conversation only; it does not mean complete history.

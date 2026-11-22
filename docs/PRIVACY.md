# Analytics privacy and retention

## Data collection

Collection starts only for the conversation selected in Discord. Barkly Access progressively scrolls that conversation's visible interface to request older rendered rows, then inspects each rendered batch. Collection begins when a conversation is selected and its rendered message list changes; Stats explains the behavior and offers cancellation and manual backfill. It does not open unrelated conversations, call private endpoints, extract credentials, or store tokens. Processing is local. Analytics are not transmitted. The scan can temporarily move the conversation view and then tries to restore the previous position; a stop control cancels it.

## Data retained locally

The BetterDiscord Data API stores:

- Conversation IDs required to associate and clear conversation statistics.
- Author IDs and display names needed to rank and identify people in the dashboard.
- Aggregate sent, received, unknown, daily, and hourly counts.
- Exclusion preferences, collection state, and coverage timestamps.
- Up to 250,000 non-cryptographic fingerprints of message IDs per conversation for deduplication.

The fingerprint is a deterministic 64-bit FNV-1a hash, not a cryptographic anonymizer. It is pseudonymous metadata and may be guessable. Fingerprints are bounded and older entries are discarded first. This means a previously seen message older than the window may be counted again if it reappears. Raw message IDs are not kept in persistent analytics.

Raw message bodies, attachments, reactions, and embeds are not read into analytics records or persisted. Source records exist transiently while each visible batch is normalized and discarded. The user can clear one conversation or all analytics from Stats. Disabling the plugin stops collection but preserves aggregates so they remain available after restart.

## Direction and identity

The current safe UI adapter cannot obtain the current user's ID through a public, stable BetterDiscord API. It therefore marks direction unknown instead of using Discord's internal user store or guessing from a username. If a future authorized adapter provides identity, sent/received classification can be enabled there.

## Limits

BetterDiscord is an unofficial client modification, and Discord's DOM is not a stable data API. UI selectors can change. Current data means metadata visible in the selected conversation only; it does not mean complete history.

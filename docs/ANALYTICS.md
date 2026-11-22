# Conversation analytics and collection

## Automatic workflow

When a person or channel conversation is open in Discord, Barkly Access reads the conversation ID from the visible route and observes that conversation's rendered message list. It temporarily scrolls the selected conversation's ordinary UI to the top to request older message rows, processes each newly rendered batch, then tries to restore the original reading position. A stop button cancels the scan. The adapter stops after 3 unchanged passes or 250 batches. It extracts only message ID, author ID, display name, and timestamp; it never asks for or stores body text or attachments. The coordinator normalizes records, deduplicates, and saves aggregate data.

No manual JSON export or import is required. A JSON import is tucked under **Frequent → Optional testing or fallback import** and is not used by automatic Stats collection.

## Coverage and limitations

The adapter requests older rows through the visible conversation scroller, but it still only sees rows Discord renders. It does not call a message-history endpoint or claim to represent all history. Discord may stop rendering before the beginning of a conversation, and UI selectors can change. Existing aggregates stay saved when the plugin restarts and are updated when newly rendered message IDs are not in the recent deduplication set.

The adapter's pagination state is “rendered rows observed,” not a server cursor. The dashboard labels coverage partial and shows the number of records accepted. After 20,000 message fingerprints per conversation, the oldest fingerprint is evicted to bound storage; an older row revisited later may be counted again.

## Statistics

- Total tracked, sent, received, and unknown-direction messages.
- Counts by author and conversation, sorted by received messages.
- UTC daily activity, with weekly and monthly grouping.
- UTC hourly activity and busiest hour.
- Search and 7/30/90-day time filters.
- Per-person conversation totals, last recorded activity, and coverage details.
- Contact exclusion from rankings and clear-this-conversation / clear-all controls.

Date-range summaries exclude records without valid timestamps. A message is sent only when a source can safely identify the current user. The current integration intentionally avoids Discord internal user stores, so it reports direction as unknown.

## Adapter contract

The core coordinator accepts an adapter with:

- `startScan({ conversationId, signal })`
- `getNextBatch({ conversationId, signal })` → `{ records, done, complete, source }`
- optional `cancelScan({ conversationId })`
- optional `dispose({ conversationId })`

The current adapter returns one non-complete batch of visible metadata. Another authorized provider can implement older-history pagination without changing the analytics/store modules.

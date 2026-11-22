# Conversation analytics and collection

## Collection behavior

When a conversation is open, Barkly Access reads its conversation ID from the visible Discord route and watches the rendered message list. The first collection for a conversation progressively scrolls upward in overlapping steps. A temporary non-modal status card reports actual collection events, message counts, duplicates, errors, and the stop condition; it can be cancelled and dismisses itself after a terminal result. It never estimates a completion percentage. It waits for the UI to render after each step, collects the next visible batch, and repeats until the list stops moving or changing near its oldest visible edge, scrolling stagnates for several passes, or the safety limit of 250 batches is reached. Reaching the oldest visible edge across stable passes marks the initial backfill complete for this adapter; this is not proof that all server history has loaded.

The adapter extracts only message ID (used transiently for deduplication), author ID, display name, and timestamp. It does not read message bodies, attachments, private Discord stores, or private endpoints. It tries to restore the original reading position using a visible message anchor; if the anchor was virtualized away, it estimates the position from the scroller's height change. The scan can be cancelled from **Stats → Stop collection**. A manual **Backfill selected conversation** action is also available.

Collection starts when a conversation becomes selected and its rendered message list changes. Each conversation stores an independent initial-backfill state. Once that observable stopping condition is reached, reopening the conversation performs a single viewport-only incremental refresh without scrolling back through history. New visible rows are processed, and previously seen IDs are ignored. An incomplete, failed, or interrupted initial attempt remains eligible for a later one-time retry; it is not retried repeatedly while the same route remains open. The Stats pane shows the current state and offers a manual retry/refresh. A route change or the Stop action interrupts collection. Previously processed batches are persisted as they arrive.

## Persistence and duplicate handling

BetterDiscord's local data store persists aggregate counts, daily and hourly totals, per-person totals, conversation status, per-conversation initial-backfill state and timestamps, coverage information, compact fingerprints of message IDs, and the last captured same-app conversation route. Message IDs and message contents are not retained as raw records. Every fingerprint is kept so repeated and overlapping visible batches remain deduplicated across plugin restarts. Fingerprint storage grows with the number of unique collected messages and can be removed with the analytics data.

The plugin keeps data local. It does not send conversation records or analytics to a server. Use **Clear this conversation** or **Clear all analytics** in Stats to erase stored data.

## Frequent and full-screen dashboard

Open the Barkly Access panel and choose **Frequent** to browse person-by-conversation entries. Counts include every successfully stored message, including records with unknown direction. Search checks display name, username, user ID, and conversation ID. Sort by collected message count, most recent interaction, or name. Clicking a linked contact uses an ordinary same-app `/channels/...` link to open the conversation whose route was captured during collection. If no matching route was saved, the row explains how to refresh it; it does not claim navigation succeeded. The optional avatar is omitted because the current adapter does not persist an avatar asset.

Open **Stats**, then select **Open Analytics Dashboard**. The dashboard is a full-screen in-app view with a return control, responsive layout, keyboard focus indicators, high-contrast and text-size settings, and reduced-motion support.

It displays actual stored aggregates: messages tracked, sent/received/unknown direction, conversations, people, first and most recent recorded dates, daily/weekly/monthly activity, activity by hour and weekday, people and conversation tables, and collection status/coverage. Filters include conversation, person, dates, grouping, search, sort, and page size. Person rows open stored per-person totals and activity details. The tables provide text equivalents for every chart-like summary.

Frequent is rebuilt from stored author aggregates, keyed by stable user ID plus conversation ID; it is not maintained in a second database. The dashboard does not display a raw message-by-message transcript. No raw message records or message text are stored; it explores the complete set of aggregates available to Barkly Access.

## Coverage and known limits

- The source is the visible Discord UI. Discord does not expose a definitive total-history count to this adapter, so the UI cannot certify full-history coverage.
- Collection status records batches, encountered rows, newly processed unique IDs, duplicate rows ignored, elapsed time, and its stopping reason. No percentage estimate is shown.
- Direction is marked unknown unless the current user's identity is safely available. The current adapter intentionally avoids Discord internal user stores and therefore reports direction as unknown.
- Rows without a stable message ID or author ID are skipped. Discord class names and virtual scrolling behavior can change, so selectors and scroll behavior may need maintenance.
- Hourly totals are stored overall, not per date. Date-filtered dashboard views say hourly results are unavailable for that range rather than presenting misleading values.
- Person daily/hourly aggregates include only messages with usable timestamps; undated messages still contribute to lifetime direction totals.

# Conversation analytics and collection

## Collection behavior

When a conversation is open, Barkly Access reads its conversation ID from the visible Discord route and watches the rendered message list. It collects visible message metadata and progressively scrolls the selected conversation upward in overlapping steps. It waits for the UI to render after each step, collects the next visible batch, and repeats until the list stops moving or changing near its oldest visible edge, scrolling stagnates for several passes, or the safety limit of 250 batches is reached. This is an observable UI stopping condition, not proof that all server history has loaded.

The adapter extracts only message ID (used transiently for deduplication), author ID, display name, and timestamp. It does not read message bodies, attachments, private Discord stores, or private endpoints. It tries to restore the original reading position using a visible message anchor; if the anchor was virtualized away, it estimates the position from the scroller's height change. The scan can be cancelled from **Stats → Stop collection**. A manual **Backfill selected conversation** action is also available.

Collection starts when a conversation becomes selected and its rendered message list changes. The Stats pane explains the behavior and shows the current status. The visible conversation can be scrolled while collection runs; a route change or the Stop action interrupts it. Previously processed batches are persisted as they arrive.

## Persistence and duplicate handling

BetterDiscord's local data store persists aggregate counts, daily and hourly totals, per-person totals, conversation status, coverage information, and compact fingerprints of message IDs. Message IDs and message contents are not retained as raw records. Repeated and overlapping visible batches are deduplicated, including across plugin restarts, for up to 250,000 fingerprints per conversation. After that bound, the oldest fingerprint is evicted; revisiting a very old message after eviction may count it again. Stored aggregates remain cumulative and are user-clearable.

The plugin keeps data local. It does not send conversation records or analytics to a server. Use **Clear this conversation** or **Clear all analytics** in Stats to erase stored data.

## Full-screen dashboard

Open the Barkly Access panel, choose **Stats**, then select **Open Analytics Dashboard**. The dashboard is a full-screen in-app view with a return control, responsive layout, keyboard focus indicators, high-contrast and text-size settings, and reduced-motion support.

It displays actual stored aggregates: messages tracked, sent/received/unknown direction, conversations, people, first and most recent recorded dates, daily/weekly/monthly activity, activity by hour and weekday, people and conversation tables, and collection status/coverage. Filters include conversation, person, dates, grouping, search, sort, and page size. Person rows open stored per-person totals and activity details. The tables provide text equivalents for every chart-like summary.

The dashboard does not display a raw message-by-message transcript. No raw message records or message text are stored; it explores the complete set of aggregates available to Barkly Access.

## Coverage and known limits

- The source is the visible Discord UI. Discord does not expose a definitive total-history count to this adapter, so the UI cannot certify full-history coverage.
- Collection status records batches, encountered rows, newly processed unique IDs, duplicate rows ignored, elapsed time, and its stopping reason. No percentage estimate is shown.
- Direction is marked unknown unless the current user's identity is safely available. The current adapter intentionally avoids Discord internal user stores and therefore reports direction as unknown.
- Rows without a stable message ID or author ID are skipped. Discord class names and virtual scrolling behavior can change, so selectors and scroll behavior may need maintenance.
- Hourly totals are stored overall, not per date. Date-filtered dashboard views say hourly results are unavailable for that range rather than presenting misleading values.
- Person daily/hourly aggregates include only messages with usable timestamps; undated messages still contribute to lifetime direction totals.

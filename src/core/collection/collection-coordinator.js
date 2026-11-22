import { normalizeMessages } from "../history/normalizer.js";

/** Coordinates batches from an authorized source adapter without UI dependencies. */
export class CollectionCoordinator {
  constructor({ adapter, store, onProgress = () => {} }) {
    this.adapter = adapter;
    this.store = store;
    this.onProgress = onProgress;
    this.active = new Map();
  }

  collect(conversationId) {
    const id = String(conversationId);
    const sameConversation = this.active.get(id);
    if (sameConversation) {
      return sameConversation.controller.signal.aborted
        ? sameConversation.promise.then(() => this.collect(id))
        : sameConversation.promise;
    }
    // The rendered UI adapter is stateful and tied to the selected route. Keep
    // one scan active globally so a route switch cannot cross-wire adapters.
    const other = this.active.values().next().value;
    if (other) {
      other.controller.abort();
      return other.promise.then(() => this.collect(id));
    }
    const controller = new AbortController();
    const job = { controller, promise: null };
    job.promise = this.run(id, controller.signal).finally(() => this.active.delete(id));
    this.active.set(id, job);
    return job.promise;
  }

  async run(conversationId, signal) {
    let processed = 0;
    try {
      this.store.markStatus(conversationId, "collecting");
      await this.adapter.startScan({ conversationId, signal });
      while (!signal.aborted) {
        const batch = await this.adapter.getNextBatch({ conversationId, signal });
        if (signal.aborted) break;
        if (!batch || !Array.isArray(batch.records)) throw new Error("Source returned an invalid batch");
        this.store.markStatus(conversationId, "processing");
        const normalized = normalizeMessages(batch.records, {
          getMessageId: m => m.messageId ?? m.id ?? m.message_id,
          getAuthorId: m => m.authorId ?? m.author_id ?? m.user_id ?? m.author?.id ?? (typeof m.author === "string" ? m.author : null),
          getAuthorName: m => m.authorName ?? m.author?.username ?? m.author?.name ?? m.username ?? (typeof m.author === "string" ? m.author : ""),
          getConversationId: m => m.conversationId ?? m.channel_id ?? m.channelId,
          getTimestamp: m => m.timestamp ?? m.createdAt ?? m.created_at,
          getIsSelf: m => typeof m.isSelf === "boolean" ? m.isSelf : null,
        }).map(record => ({ ...record, conversationId }));
        const result = this.store.applyBatch(conversationId, normalized, { status: "partial", complete: batch.complete === true });
        processed += result.added;
        const state = batch.complete ? "completed" : batch.done ? "partial" : "collecting";
        this.store.markStatus(conversationId, state, { coverage: { source: batch.source || "authorized-adapter" } });
        try { this.onProgress({ conversationId, status: state, processed, duplicates: result.duplicates }); } catch { /* UI callbacks do not affect stored data. */ }
        if (batch.done) return { status: state, processed };
      }
      await this.adapter.cancelScan?.({ conversationId });
      let entry = null;
      try { entry = this.store.markStatus(conversationId, "cancelled"); } catch { /* Preserve cancellation even if persistence is unavailable. */ }
      try { this.onProgress({ conversationId, status: "cancelled", processed }); } catch { /* Ignore presentation failures. */ }
      return { status: "cancelled", processed, conversation: entry };
    } catch (error) {
      const message = error?.message || "Collection failed";
      try { this.store.markStatus(conversationId, "failed", { error: message }); } catch { /* Report the storage error without retrying it. */ }
      try { this.onProgress({ conversationId, status: "failed", processed, error: message }); } catch { /* Ignore presentation failures. */ }
      return { status: "failed", processed, error: message };
    } finally {
      try { await this.adapter.dispose?.({ conversationId }); } catch { /* Disposal errors must not hide collection results. */ }
    }
  }

  async cancel(conversationId) {
    const job = this.active.get(String(conversationId));
    if (!job) return false;
    job.controller.abort();
    await job.promise;
    return true;
  }
}

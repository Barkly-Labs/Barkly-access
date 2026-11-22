import { normalizeMessages } from "../history/normalizer.js";
import { classifyCollectionOutcome } from "./collection-state.js";

/** Coordinates rendered-source batches without coupling collection to a UI. */
export class CollectionCoordinator {
  constructor({ adapter, store, getCurrentUserId = () => null, onProgress = () => {} }) {
    this.adapter = adapter;
    this.store = store;
    this.getCurrentUserId = getCurrentUserId;
    this.onProgress = onProgress;
    this.active = new Map();
  }

  collect(conversationId, { mode = "initial" } = {}) {
    const id = String(conversationId);
    const scanMode = mode === "incremental" ? "incremental" : "initial";
    const sameConversation = this.active.get(id);
    if (sameConversation) {
      return sameConversation.controller.signal.aborted
        ? sameConversation.promise.then(() => this.collect(id, { mode: scanMode }))
        : sameConversation.promise;
    }
    // This adapter is tied to the selected route; keep scans globally serialized.
    const other = this.active.values().next().value;
    if (other) {
      other.controller.abort();
      return other.promise.then(() => this.collect(id, { mode: scanMode }));
    }
    const controller = new AbortController();
    const job = { controller, mode: scanMode, promise: null };
    job.promise = this.run(id, controller.signal, scanMode).finally(() => this.active.delete(id));
    this.active.set(id, job);
    return job.promise;
  }

  emit(event) {
    try { this.onProgress(event); } catch { /* UI callbacks never affect collection. */ }
  }

  async run(conversationId, signal, mode) {
    let processed = 0;
    let duplicates = 0;
    let encountered = 0;
    let batches = 0;
    const startedAt = Date.now();
    const previous = this.store.getConversation(conversationId)?.collection || {};
    const initialAttempt = mode === "initial";
    try {
      this.store.markCollection(conversationId, {
      state: initialAttempt ? "initial_in_progress" : (previous.state || "initial_completed"),
      initialStartedAt: initialAttempt ? (previous.initialStartedAt || startedAt) : previous.initialStartedAt,
      lastCollectionAt: startedAt,
      lastOperationStatus: "collecting",
      lastMode: mode,
      attempts: initialAttempt ? (previous.attempts || 0) + 1 : previous.attempts || 0,
      interrupted: false,
      stopReason: "",
      error: "",
      });
      this.store.markStatus(conversationId, "collecting", { coverage: { startedAt, interrupted: false, stopReason: null, encountered: 0, duplicatesIgnored: 0, batches: 0 } });
      this.emit({ conversationId, mode, phase: "start", status: "collecting", processed, duplicates, encountered, batches });
      const scanContext = await this.adapter.startScan({ conversationId, signal, mode });
      if (scanContext?.navigationPath) this.store.markStatus(conversationId, "collecting", { navigationPath: scanContext.navigationPath });
      while (!signal.aborted) {
        const batch = await this.adapter.getNextBatch({ conversationId, signal, mode });
        if (signal.aborted) break;
        if (!batch || !Array.isArray(batch.records)) throw new Error("Source returned an invalid batch");
        batches++;
        encountered += batch.records.length;
        this.store.markStatus(conversationId, "processing");
        const normalized = normalizeMessages(batch.records, {
          getMessageId: m => m.messageId ?? m.id ?? m.message_id,
          getAuthorId: m => m.authorId ?? m.author_id ?? m.user_id ?? m.author?.id ?? null,
          getAuthorName: m => m.authorName ?? m.author?.username ?? m.author?.name ?? m.username ?? (typeof m.author === "string" ? m.author : ""),
          getAuthorUsername: m => m.authorUsername ?? m.username ?? m.author?.username ?? "",
          getAvatarUrl: m => m.avatarUrl ?? m.avatar_url ?? "",
          getConversationId: m => m.conversationId ?? m.channel_id ?? m.channelId,
          getTimestamp: m => m.timestamp ?? m.createdAt ?? m.created_at,
          getCurrentUserId: this.getCurrentUserId,
          getIsSelf: m => typeof m.isSelf === "boolean" ? m.isSelf : null,
        }).map(record => ({ ...record, conversationId }));
        const result = this.store.applyBatch(conversationId, normalized, { status: "partial", complete: batch.complete === true });
        processed += result.added;
        duplicates += result.duplicates;
        const collection = { source: batch.source || "authorized-adapter", startedAt,
          durationMs: Date.now() - startedAt, encountered, duplicatesIgnored: duplicates, batches,
          stopReason: batch.stopReason || null, interrupted: false };
        this.store.markStatus(conversationId, batch.done ? "partial" : "collecting", { coverage: collection });
        const progress = { conversationId, mode, phase: batch.done ? "finishing" : "progress",
          status: batch.done ? "partial" : "collecting", processed, duplicates, encountered, batches,
          progress: batch.progress || null, stopReason: batch.stopReason || null };
        this.emit(progress);
        if (!batch.done) continue;

        const outcome = classifyCollectionOutcome({ mode, stopReason: batch.stopReason, complete: batch.complete === true });
        this.persistOutcome(conversationId, { mode, outcome, startedAt, stopReason: batch.stopReason || "unknown", error: "" });
        const resultStatus = outcome === "interrupted" ? "cancelled" : outcome === "failed" ? "failed" : batch.complete ? "completed" : "partial";
        this.store.markStatus(conversationId, resultStatus, { coverage: { ...collection, interrupted: outcome === "interrupted" } });
        this.emit({ ...progress, phase: "finish", status: resultStatus, collectionState: outcome, durationMs: Date.now() - startedAt });
        return { status: resultStatus, collectionState: outcome, mode, processed, duplicates, encountered, batches, stopReason: batch.stopReason || null };
      }

      await this.adapter.cancelScan?.({ conversationId });
      this.persistOutcome(conversationId, { mode, outcome: "interrupted", startedAt, stopReason: "cancelled", error: "" });
      const entry = this.store.markStatus(conversationId, "cancelled", { coverage: { startedAt, durationMs: Date.now() - startedAt, encountered, duplicatesIgnored: duplicates, batches, interrupted: true, stopReason: "cancelled" } });
      this.emit({ conversationId, mode, phase: "finish", status: "cancelled", collectionState: "interrupted", processed, duplicates, encountered, batches, stopReason: "cancelled" });
      return { status: "cancelled", collectionState: "interrupted", mode, processed, duplicates, encountered, batches, conversation: entry };
    } catch (error) {
      const message = error?.message || "Collection failed";
      try { this.persistOutcome(conversationId, { mode, outcome: "failed", startedAt, stopReason: "error", error: message }); } catch { /* Storage failure is reported below. */ }
      try { this.store.markStatus(conversationId, "failed", { error: message, coverage: { startedAt, durationMs: Date.now() - startedAt, encountered, duplicatesIgnored: duplicates, batches, interrupted: true, stopReason: "error" } }); } catch { /* Preserve the original operation error. */ }
      this.emit({ conversationId, mode, phase: "finish", status: "failed", collectionState: "failed", processed, duplicates, encountered, batches, error: message });
      return { status: "failed", collectionState: "failed", mode, processed, duplicates, encountered, batches, error: message };
    } finally {
      try { await this.adapter.dispose?.({ conversationId }); } catch { /* Disposal errors do not mask collection results. */ }
    }
  }

  persistOutcome(conversationId, { mode, outcome, startedAt, stopReason, error }) {
    const previous = this.store.getConversation(conversationId)?.collection || {};
    const successful = outcome === "completed";
    const collectionState = mode === "initial"
      ? outcome === "completed" ? "initial_completed" : outcome
      : previous.state === "initial_completed" ? "initial_completed" : previous.state || "never_collected";
    this.store.markCollection(conversationId, {
      state: collectionState,
      initialStartedAt: previous.initialStartedAt || (mode === "initial" ? startedAt : null),
      initialCompletedAt: mode === "initial" && successful ? Date.now() : previous.initialCompletedAt,
      lastCollectionAt: startedAt,
      lastSuccessfulUpdateAt: successful ? Date.now() : previous.lastSuccessfulUpdateAt,
      lastOperationStatus: outcome,
      lastMode: mode,
      attempts: previous.attempts || 0,
      interrupted: outcome === "interrupted",
      stopReason,
      error,
    });
  }

  async cancel(conversationId) {
    const job = this.active.get(String(conversationId));
    if (!job) return false;
    job.controller.abort();
    await job.promise;
    return true;
  }
}

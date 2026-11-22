/**
 * Barkly Access — history aggregation engine
 * Counts normalized messages by author. Message bodies are not required.
 */
export class AggregationEngine {
  constructor({ dedupeLimit = 100_000 } = {}) {
    this.counts = new Map();
    this.processedIds = new Set();
    this.dedupeLimit = dedupeLimit;
    this.totalProcessed = 0;
    this.duplicatesSkipped = 0;
  }

  processBatch(messages) {
    if (!Array.isArray(messages)) {
      throw new TypeError("messages must be an array");
    }

    let added = 0;
    for (const message of messages) {
      if (!message || typeof message !== "object") continue;
      const { messageId, authorId } = message;
      if (messageId == null || authorId == null) continue;

      const id = String(messageId);
      const author = String(authorId);
      if (!id || !author) continue;

      if (this.processedIds.has(id)) {
        this.duplicatesSkipped++;
        continue;
      }

      // Bounded dedupe: FIFO eviction limits memory use.
      if (this.dedupeLimit > 0 && this.processedIds.size >= this.dedupeLimit) {
        const oldest = this.processedIds.values().next().value;
        this.processedIds.delete(oldest);
      } else if (this.dedupeLimit <= 0) {
        // Dedupe disabled when limit is zero or negative.
        this.counts.set(author, (this.counts.get(author) || 0) + 1);
        this.totalProcessed++;
        added++;
        continue;
      }

      this.processedIds.add(id);
      this.counts.set(author, (this.counts.get(author) || 0) + 1);
      this.totalProcessed++;
      added++;
    }
    return { added, duplicatesSkipped: this.duplicatesSkipped };
  }

  getRanking() {
    return [...this.counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([userId, count], index) => ({ rank: index + 1, userId, count }));
  }

  getStats() {
    return {
      totalProcessed: this.totalProcessed,
      duplicatesSkipped: this.duplicatesSkipped,
      uniqueAuthors: this.counts.size,
      dedupeTracked: this.processedIds.size,
    };
  }

  reset() {
    this.counts.clear();
    this.processedIds.clear();
    this.totalProcessed = 0;
    this.duplicatesSkipped = 0;
  }
}

import { getConversationHref } from "./conversation-selection.js";

/**
 * Backfills only message rows currently exposed by Discord's visible interface.
 * It intentionally does not read Discord's private stores or call its APIs.
 */
export class RenderedHistoryAdapter {
  constructor({ getSelectedConversation, getCurrentUserId, getDocument = () => document,
    getConversationPath = () => globalThis.location?.pathname || "",
    wait = ms => new Promise(resolve => setTimeout(resolve, ms)), maxBatches = 250,
    stablePasses = 3, renderDelay = 450, scrollStepRatio = 0.72 }) {
    this.getSelectedConversation = getSelectedConversation;
    this.getCurrentUserId = getCurrentUserId;
    this.getConversationPath = getConversationPath;
    this.getDocument = getDocument;
    this.wait = wait;
    this.maxBatches = maxBatches;
    this.stablePasses = stablePasses;
    this.renderDelay = renderDelay;
    this.scrollStepRatio = scrollStepRatio;
  }

  async startScan({ conversationId, mode = "initial" }) {
    if (String(this.getSelectedConversation()) !== String(conversationId)) throw new Error("Conversation is no longer selected");
    const root = this.findMessageRoot();
    if (!root) throw new Error("The selected conversation has no rendered message list");
    const scroller = this.getScrollContainer(root);
    const rect = scroller.getBoundingClientRect?.();
    const anchor = [...root.querySelectorAll('[class*="messageListItem"]')]
      .find(row => !rect || row.getBoundingClientRect?.().bottom > rect.top);
    this.scan = {
      conversationId: String(conversationId), mode: mode === "incremental" ? "incremental" : "initial", root, scroller,
      initialTop: Number(scroller.scrollTop) || 0,
      initialHeight: Number(scroller.scrollHeight) || Number(root.scrollHeight) || 0,
      anchorId: this.rowId(anchor),
      anchorOffset: anchor && rect ? anchor.getBoundingClientRect().top - rect.top : null,
      previousSignature: "", previousTop: Number(scroller.scrollTop) || 0,
      noProgress: 0, batches: 0, encountered: 0, uniqueSeen: new Set(),
      startedAt: Date.now(), stopReason: null,
    };
    return { navigationPath: getConversationHref(this.getConversationPath?.(), conversationId) };
  }

  async getNextBatch({ conversationId, signal }) {
    const scan = this.scan;
    if (!scan || String(this.getSelectedConversation()) !== String(conversationId) || signal?.aborted) {
      return { records: [], done: true, complete: false, stopReason: "interrupted", source: "rendered-discord-ui" };
    }
    let root = this.findMessageRoot() || scan.root;
    let scroller = this.getScrollContainer(root);
    if (!root.isConnected || !scroller.isConnected) return { records: [], done: true, complete: false, stopReason: "conversation-view-unavailable", source: "rendered-discord-ui" };
    scan.root = root;
    scan.scroller = scroller;

    const rows = [...root.querySelectorAll('[class*="messageListItem"]')];
    const selfId = this.getCurrentUserId?.() ?? null;
    const records = rows.flatMap(row => {
      const messageId = this.rowId(row);
      if (!messageId) return [];
      const authorId = row.getAttribute("data-user-id")
        || row.querySelector('a[href*="/users/"]')?.getAttribute("href")?.match(/\/users\/(\d+)/)?.[1]
        || row.querySelector('img[src*="/avatars/"]')?.getAttribute("src")?.match(/\/avatars\/(\d+)/)?.[1];
      if (!authorId) return [];
      const avatarUrl = row.querySelector('img[src*="/avatars/"]')?.getAttribute("src") || "";
      const nameNode = row.querySelector('[class*="username"]');
      const authorName = nameNode?.textContent?.trim() || "";
      const authorUsername = row.getAttribute("data-username") || row.getAttribute("data-user-name")
        || nameNode?.getAttribute?.("data-username") || "";
      const time = row.querySelector("time[datetime]")?.getAttribute("datetime");
      const parsed = time ? Date.parse(time) : NaN;
      return [{ messageId, authorId, authorName, authorUsername, timestamp: Number.isFinite(parsed) ? parsed : null,
        avatarUrl: avatarUrl,
        isSelf: selfId == null ? null : String(authorId) === String(selfId) }];
    });
    scan.encountered += records.length;
    for (const record of records) scan.uniqueSeen.add(record.messageId);

    if (scan.mode === "incremental") {
      scan.batches++;
      return { records, done: true, complete: false, stopReason: "incremental-visible-batch",
        source: "rendered-discord-ui",
        progress: { batches: scan.batches, encountered: records.length, uniqueInScan: scan.uniqueSeen.size,
          atOldestVisibleEdge: false, mode: "incremental" } };
    }

    const beforeTop = Number(scroller.scrollTop) || 0;
    const beforeSignature = this.messageSignature(root);
    const beforeHeight = Number(scroller.scrollHeight) || Number(root.scrollHeight) || 0;
    const step = Math.max(160, Math.floor((Number(scroller.clientHeight) || 700) * this.scrollStepRatio));
    // Moving by a fraction of the viewport causes overlapping render batches and
    // gives Discord time to expose intermediate history instead of skipping it.
    scroller.scrollTop = Math.max(0, beforeTop - step);
    try { scroller.dispatchEvent(new (this.getDocument().defaultView?.Event || Event)("scroll", { bubbles: true })); } catch { /* Native scroll assignment still works. */ }
    await this.wait(this.renderDelay);
    if (String(this.getSelectedConversation()) !== String(conversationId) || signal?.aborted) {
      return { records, done: true, complete: false, stopReason: "interrupted", source: "rendered-discord-ui" };
    }

    root = this.findMessageRoot() || root;
    scroller = this.getScrollContainer(root);
    scan.root = root; scan.scroller = scroller;
    const afterTop = Number(scroller.scrollTop) || 0;
    const afterSignature = this.messageSignature(root);
    const afterHeight = Number(scroller.scrollHeight) || Number(root.scrollHeight) || 0;
    const changed = beforeSignature !== afterSignature || beforeHeight !== afterHeight;
    const moved = Math.abs(afterTop - beforeTop) > 1;
    scan.noProgress = changed || moved ? 0 : scan.noProgress + 1;
    scan.batches++;
    const atOldestVisibleEdge = afterTop <= 2;
    const stagnantAtEdge = atOldestVisibleEdge && scan.noProgress >= this.stablePasses;
    const stalled = !moved && !changed && scan.noProgress >= this.stablePasses;
    const exhausted = scan.batches >= this.maxBatches;
    const done = stagnantAtEdge || stalled || exhausted;
    const stopReason = exhausted ? "batch-limit" : stagnantAtEdge ? "oldest-visible-edge-stable" : stalled ? "scroll-stagnation" : null;
    if (done) scan.stopReason = stopReason;
    return { records, done, complete: false, stopReason,
      source: "rendered-discord-ui",
      progress: { batches: scan.batches, encountered: scan.encountered, uniqueInScan: scan.uniqueSeen.size,
        stablePasses: scan.noProgress, scrollTop: afterTop, atOldestVisibleEdge } };
  }

  findMessageRoot() {
    const doc = this.getDocument();
    const candidates = [...doc.querySelectorAll('[class*="scrollerInner"]')]
      .filter(node => node.querySelector('[class*="messageListItem"]'));
    if (!candidates.length) return null;
    // Avoid sidebars and hidden panes by choosing the visible list with the most rows.
    return candidates.map(node => ({ node, count: node.querySelectorAll('[class*="messageListItem"]').length,
      visible: !!(node.getClientRects?.().length) }))
      .sort((a, b) => Number(b.visible) - Number(a.visible) || b.count - a.count)[0].node;
  }

  rowId(row) {
    return row?.id?.match(/chat-messages-(\d+)/)?.[1]
      || row?.getAttribute("data-list-item-id")?.match(/(\d{15,})/)?.[1]
      || null;
  }

  messageSignature(root) {
    return [...root.querySelectorAll('[class*="messageListItem"]')].map(row => this.rowId(row) || "").join("|");
  }

  getScrollContainer(root) {
    let current = root;
    while (current?.parentElement) {
      current = current.parentElement;
      const className = typeof current.className === "string" ? current.className : "";
      const style = this.getDocument().defaultView?.getComputedStyle?.(current);
      const scrollable = style && /(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflow}`)
        && current.scrollHeight > current.clientHeight + 2;
      if (className.includes("scrollerBase") || scrollable) return current;
      if (current === this.getDocument().body) break;
    }
    return root;
  }

  async cancelScan() { if (this.scan) this.scan.stopReason = "cancelled"; }

  async dispose({ conversationId } = {}) {
    const scan = this.scan;
    if (!scan) return;
    const selected = String(this.getSelectedConversation()) === String(conversationId || scan.conversationId);
    const root = this.findMessageRoot() || scan.root;
    const scroller = this.getScrollContainer(root);
    const rect = scroller.getBoundingClientRect?.();
    const anchor = scan.anchorId && [...root.querySelectorAll('[class*="messageListItem"]')]
      .find(row => this.rowId(row) === scan.anchorId);
    if (selected && anchor && rect && scan.anchorOffset != null) {
      scroller.scrollTop += anchor.getBoundingClientRect().top - rect.top - scan.anchorOffset;
    } else if (selected) {
      const currentHeight = Number(scroller.scrollHeight) || Number(root.scrollHeight) || scan.initialHeight;
      const addedHeight = Math.max(0, currentHeight - scan.initialHeight);
      scroller.scrollTop = Math.min(scroller.scrollHeight, scan.initialTop + addedHeight);
    }
    this.scan = null;
  }
}

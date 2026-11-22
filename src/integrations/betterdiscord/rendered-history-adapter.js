/** Scrolls the selected UI conversation to request older rendered rows and reads metadata only. */
export class RenderedHistoryAdapter {
  constructor({ getSelectedConversation, getCurrentUserId, getDocument = () => document, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), maxBatches = 250, stablePasses = 3 }) {
    this.getSelectedConversation = getSelectedConversation;
    this.getCurrentUserId = getCurrentUserId;
    this.getDocument = getDocument;
    this.wait = wait;
    this.maxBatches = maxBatches;
    this.stablePasses = stablePasses;
  }

  async startScan({ conversationId }) {
    if (String(this.getSelectedConversation()) !== String(conversationId)) throw new Error("Conversation is no longer selected");
    const root = this.getDocument().querySelector('[class*="scrollerInner"]');
    if (!root) throw new Error("The selected conversation has no rendered message list");
    const scroller = this.getScrollContainer(root);
    const rootRect = scroller.getBoundingClientRect?.();
    const anchor = [...root.querySelectorAll('[class*="messageListItem"]')]
      .find(row => !rootRect || row.getBoundingClientRect?.().bottom > rootRect.top);
    this.scan = {
      conversationId: String(conversationId), root, scroller,
      initialTop: scroller.scrollTop || 0,
      initialHeight: root.scrollHeight || 0,
      anchorId: anchor?.id || anchor?.getAttribute("data-list-item-id") || "",
      anchorOffset: anchor && rootRect ? anchor.getBoundingClientRect().top - rootRect.top : null,
      previousSignature: "", noProgress: 0, batches: 0, cancelled: false,
    };
  }

  async getNextBatch({ conversationId, signal }) {
    if (String(this.getSelectedConversation()) !== String(conversationId) || signal?.aborted) return { records: [], done: true, complete: false, source: "rendered-discord-ui" };
    const scan = this.scan;
    let root = this.getDocument().querySelector('[class*="scrollerInner"]');
    if (!root) return { records: [], done: true, complete: false, source: "rendered-discord-ui" };
    scan.root = root;
    const beforeSignature = this.messageSignature(root);
    const beforeHeight = root.scrollHeight || 0;
    // Use the selected conversation's ordinary scroll UI to ask Discord to
    // render older rows. No API request or private message store is accessed.
    const scroller = this.getScrollContainer(root);
    scroller.scrollTop = 0;
    await this.wait(500);
    if (String(this.getSelectedConversation()) !== String(conversationId) || signal?.aborted) return { records: [], done: true, complete: false, source: "rendered-discord-ui" };
    root = this.getDocument().querySelector('[class*="scrollerInner"]') || root;
    const rows = root ? [...root.querySelectorAll('[class*="messageListItem"]')] : [];
    const selfId = this.getCurrentUserId();
    const records = rows.flatMap(row => {
      const messageId = row.id?.match(/chat-messages-(\d+)/)?.[1]
        || row.getAttribute("data-list-item-id")?.match(/(\d{15,})/)?.[1];
      const userLink = row.querySelector('a[href*="/users/"]')?.getAttribute("href")?.match(/\/users\/(\d+)/)?.[1];
      const avatar = row.querySelector('img[src*="/avatars/"]')?.getAttribute("src")?.match(/\/avatars\/(\d+)/)?.[1];
      const authorId = row.getAttribute("data-user-id") || userLink || avatar;
      if (!messageId || !authorId) return [];
      const authorName = row.querySelector('[class*="username"]')?.textContent?.trim() || "";
      const timeElement = row.querySelector("time[datetime]");
      const timestamp = timeElement ? Date.parse(timeElement.getAttribute("datetime")) : NaN;
      return [{ messageId, authorId, authorName, timestamp: Number.isFinite(timestamp) ? timestamp : null, isSelf: selfId == null ? null : String(authorId) === String(selfId) }];
    });
    const afterSignature = this.messageSignature(root);
    const changed = beforeSignature !== afterSignature || beforeHeight !== (root.scrollHeight || 0);
    scan.noProgress = changed ? 0 : scan.noProgress + 1;
    scan.batches++;
    const done = scan.noProgress >= this.stablePasses || scan.batches >= this.maxBatches;
    return { records, done, complete: false, source: "rendered-discord-ui", progress: { batches: scan.batches, stablePasses: scan.noProgress } };
  }

  messageSignature(root) {
    return [...root.querySelectorAll('[class*="messageListItem"]')]
      .map(row => row.id || row.getAttribute("data-list-item-id") || "")
      .join("|");
  }

  getScrollContainer(root) {
    let current = root;
    while (current?.parentElement) {
      current = current.parentElement;
      const className = typeof current.className === "string" ? current.className : "";
      if (className.includes("scrollerBase")) return current;
      const style = this.getDocument().defaultView?.getComputedStyle?.(current);
      if (style && /(auto|scroll|overlay)/.test(`${style.overflowY} ${style.overflow}`)
          && current.scrollHeight > current.clientHeight + 2) return current;
      if (current === this.getDocument().body) break;
    }
    return root;
  }

  async cancelScan() { if (this.scan) this.scan.cancelled = true; }

  async dispose({ conversationId } = {}) {
    const scan = this.scan;
    if (!scan) return;
    const selected = String(this.getSelectedConversation()) === String(conversationId || scan.conversationId);
    const messageRoot = this.getDocument().querySelector('[class*="scrollerInner"]') || scan.root;
    const rootRect = scan.scroller.getBoundingClientRect?.();
    const anchor = scan.anchorId && [...messageRoot.querySelectorAll('[class*="messageListItem"]')]
      .find(row => row.id === scan.anchorId || row.getAttribute("data-list-item-id") === scan.anchorId);
    if (selected && anchor && rootRect && scan.anchorOffset != null) {
      const offsetNow = anchor.getBoundingClientRect().top - rootRect.top;
      scan.scroller.scrollTop += offsetNow - scan.anchorOffset;
    } else if (selected) {
      const addedHeight = Math.max(0, (messageRoot.scrollHeight || 0) - scan.initialHeight);
      scan.scroller.scrollTop = scan.initialTop + addedHeight;
    }
    this.scan = null;
  }
}

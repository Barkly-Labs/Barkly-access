/**
 * @name BarklyAccess
 * @author Barkly Labs
 * @description Count authors from a selected JSON file with a local Frequent panel.
 * @version 0.1.0
 */
module.exports = class BarklyAccess {
  start() {
    this.counts = new Map();
    this.panelId = "barkly-access-frequent-panel";
    this.styleId = "barkly-access-frequent-style";
    this.injectStyle();
    this.renderPanel();
  }

  stop() {
    document.getElementById(this.panelId)?.remove();
    document.getElementById(this.styleId)?.remove();
    this.counts?.clear();
  }

  injectStyle() {
    const style = document.createElement("style");
    style.id = this.styleId;
    style.textContent = `
      #${this.panelId} {
        position: fixed; right: 24px; bottom: 24px; z-index: 999999;
        width: 340px; max-height: 70vh; overflow: auto;
        background: #090909; color: #f1f1f1; border: 1px solid #ff4fa3;
        border-radius: 14px; box-shadow: 0 8px 32px rgba(0,0,0,.55);
        font-family: system-ui, sans-serif; padding: 16px;
      }
      #${this.panelId} * { box-sizing: border-box; }
      #${this.panelId} h2 { margin: 0 0 12px; color: #ff8bc5; font-size: 18px; }
      #${this.panelId} p { font-size: 12px; color: #aaa; }
      #${this.panelId} button {
        background: #ff4fa3; color: #090909; border: 0; border-radius: 8px;
        padding: 8px 12px; font-weight: 700; cursor: pointer; margin: 4px 4px 4px 0;
      }
      #${this.panelId} button.secondary { background: #292929; color: #f1f1f1; border: 1px solid #555; }
      #${this.panelId} .row { display:flex; justify-content:space-between; gap:10px;
        padding: 8px 0; border-bottom: 1px solid #292929; font-size: 13px; }
      #${this.panelId} .rank { color: #ff8bc5; font-weight: 800; min-width: 24px; }
      #${this.panelId} .count { color: #aaa; white-space:nowrap; }
      #${this.panelId} .status { color: #ff8bc5; margin-top: 8px; }
      #${this.panelId} input { display:none; }
    `;
    document.head.appendChild(style);
  }

  renderPanel() {
    const panel = document.createElement("section");
    panel.id = this.panelId;
    panel.setAttribute("aria-label", "Barkly Access Frequent");
    panel.innerHTML = `
      <h2>Barkly Access · Frequent</h2>
      <p>Local import prototype. Select JSON to count authors. Message text isn't displayed or stored by this panel.</p>
      <button id="ba-import">Import JSON</button>
      <button id="ba-clear" class="secondary">Clear</button>
      <button id="ba-close" class="secondary">Close</button>
      <input id="ba-file" type="file" accept=".json,application/json" />
      <div id="ba-status" class="status" role="status">Waiting for a file.</div>
      <div id="ba-list"></div>
    `;
    document.body.appendChild(panel);

    panel.querySelector("#ba-import").addEventListener("click", () => panel.querySelector("#ba-file").click());
    panel.querySelector("#ba-close").addEventListener("click", () => panel.remove());
    panel.querySelector("#ba-clear").addEventListener("click", () => {
      this.counts.clear();
      this.renderRanking(panel, "Ranking cleared.");
    });
    panel.querySelector("#ba-file").addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        const messages = this.extractMessages(data);
        const counts = new Map();
        for (const m of messages) {
          const author = this.authorId(m);
          if (author == null) continue;
          const key = String(author);
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        this.counts = counts;
        this.renderRanking(panel, `Counted ${messages.length} records in the selected file.`);
      } catch {
        panel.querySelector("#ba-status").textContent =
          "Could not parse this JSON. It must contain message records or a messages array.";
      } finally {
        event.target.value = "";
      }
    });
  }

  authorId(m) {
    return m?.author?.id ?? m?.authorId ?? m?.user_id ?? m?.userId ?? null;
  }

  extractMessages(data) {
    if (Array.isArray(data)) return data.filter((x) => x && typeof x === "object");
    if (data && typeof data === "object") {
      if (Array.isArray(data.messages)) return data.messages;
      if (Array.isArray(data.data)) return data.data;
      const found = [];
      const stack = [data];
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;
        if (Array.isArray(node)) {
          stack.push(...node);
        } else if (Array.isArray(node.messages)) {
          found.push(...node.messages);
        } else {
          stack.push(...Object.values(node));
        }
      }
      if (found.length) return found;
    }
    throw new Error("No message records found");
  }

  renderRanking(panel, status) {
    panel.querySelector("#ba-status").textContent = status;
    const list = panel.querySelector("#ba-list");
    list.replaceChildren();
    const ranking = [...this.counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 100);

    ranking.forEach(([userId, count], i) => {
      const row = document.createElement("div");
      row.className = "row";
      const left = document.createElement("div");
      const rank = document.createElement("span");
      rank.className = "rank";
      rank.textContent = `${i + 1}. `;
      const name = document.createElement("span");
      name.textContent = userId;
      left.append(rank, name);

      const right = document.createElement("span");
      right.className = "count";
      right.textContent = `${count.toLocaleString()} messages`;
      row.append(left, right);
      list.appendChild(row);
    });

    if (!ranking.length) {
      const empty = document.createElement("p");
      empty.textContent = "No ranking yet. Import a JSON file to begin.";
      list.appendChild(empty);
    }
  }
};

import test from "node:test";
import assert from "node:assert/strict";
import { buildFrequentContacts } from "../src/core/frequent/contact-index.js";
import { getConversationHref } from "../src/integrations/betterdiscord/conversation-selection.js";
import { createDiscordConversationLink } from "../src/integrations/betterdiscord/frequent-contact-link.js";
import { CollectionCoordinator } from "../src/core/collection/collection-coordinator.js";
import { HistoricalStore } from "../src/core/storage/historical-store.js";

const time = (day) => Date.UTC(2026, 0, day);

function contactSnapshot() {
  return { conversations: {
    "100": { conversationId: "100", navigationPath: "/channels/@me/100", status: "partial", people: {
      "u1": { name: "Zee", username: "zee", total: 3, sent: 0, received: 0, unknown: 3, lastTimestamp: time(3) },
      "u2": { name: "Ada", username: "ada", total: 1, sent: 0, received: 1, unknown: 0, lastTimestamp: time(1) },
    } },
    "200": { conversationId: "200", navigationPath: "/channels/999/200", status: "cancelled", people: {
      "u1": { name: "Zee", username: "zee", total: 2, sent: 0, received: 0, unknown: 2, lastTimestamp: time(5) },
    } },
  } };
}

test("Frequent creates one stable person/conversation entry and counts unknown direction", () => {
  const rows = buildFrequentContacts(contactSnapshot());
  assert.equal(rows.length, 3);
  assert.equal(rows.filter(row => row.authorId === "u1").length, 2);
  const dm = rows.find(row => row.authorId === "u1" && row.conversationId === "100");
  assert.equal(dm.messageCount, 3);
  assert.equal(dm.displayName, "Zee");
  assert.equal(dm.username, "zee");
  assert.equal(dm.href, "/channels/@me/100");
  assert.equal(rows.find(row => row.conversationId === "200").href, "/channels/999/200");
});

test("Frequent search is case insensitive and sorts by messages or recent activity", () => {
  const rows = buildFrequentContacts(contactSnapshot());
  assert.equal(buildFrequentContacts(contactSnapshot(), { search: "ADA" }).length, 1);
  assert.equal(buildFrequentContacts(contactSnapshot(), { search: "u1" }).length, 2);
  assert.equal(rows[0].authorId, "u1");
  const recent = buildFrequentContacts(contactSnapshot(), { sort: "recent" });
  assert.equal(recent[0].conversationId, "200");
  const names = buildFrequentContacts(contactSnapshot(), { sort: "name" });
  assert.equal(names[0].displayName, "Ada");
});

test("only a matching ordinary Discord channel route is offered as a navigation link", () => {
  assert.equal(getConversationHref("/channels/@me/100", "100"), "/channels/@me/100");
  assert.equal(getConversationHref("/channels/999/200", "200"), "/channels/999/200");
  assert.equal(getConversationHref("/settings/user", "100"), null);
  assert.equal(getConversationHref("/channels/@me/101", "100"), null);
});

test("Frequent renders an accessible native link to the captured conversation route", () => {
  const document = { createElement(tagName) { return {
    tagName: tagName.toUpperCase(), attributes: {}, setAttribute(name, value) { this.attributes[name] = value; },
  }; } };
  const [contact] = buildFrequentContacts(contactSnapshot());
  const link = createDiscordConversationLink(document, contact);
  assert.equal(link.tagName, "A");
  assert.equal(link.href, "/channels/@me/100");
  assert.equal(link.textContent, "Zee");
  assert.match(link.attributes["aria-label"], /Open Discord conversation/);
  assert.equal(createDiscordConversationLink(document, { ...contact, href: null }), null);
});

test("collected identities, counts, usernames, and route persist and reconcile after a reload", async () => {
  let data = null;
  const save = next => { data = structuredClone(next); };
  const store = new HistoricalStore({ load: () => data, save });
  const adapter = {
    async startScan() { return { navigationPath: "/channels/@me/100" }; },
    async getNextBatch() { return { done: true, records: [
      { messageId: "m1", authorId: "u1", authorName: "Zee", authorUsername: "zee", timestamp: time(1) },
      { messageId: "m1", authorId: "u1", authorName: "Zee", authorUsername: "zee", timestamp: time(1) },
    ] }; },
  };
  const result = await new CollectionCoordinator({ adapter, store }).collect("100");
  assert.equal(result.processed, 1);
  assert.equal(result.duplicates, 1);
  const afterReload = new HistoricalStore({ load: () => data, save });
  const contacts = buildFrequentContacts(afterReload.snapshot());
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].messageCount, 1);
  assert.equal(contacts[0].username, "zee");
  assert.equal(contacts[0].href, "/channels/@me/100");
});

test("missing or stale conversation route produces an explicit navigation fallback", () => {
  const snapshot = { conversations: { "42": { conversationId: "42", navigationPath: null, people: {
    "person-id": { name: "Pat", total: 2 },
  } } } };
  const [contact] = buildFrequentContacts(snapshot);
  assert.equal(contact.href, null);
  assert.equal(contact.authorId, "person-id");
});

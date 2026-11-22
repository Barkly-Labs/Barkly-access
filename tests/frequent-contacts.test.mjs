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
      self: { authorId: "self", name: "Me", total: 8, sent: 8, received: 0, unknown: 0, lastTimestamp: time(4) },
      u1: { authorId: "u1", name: "Zee", username: "zee", avatarUrl: "https://cdn.discordapp.com/avatars/u1/hash.png", total: 2, sent: 0, received: 2, unknown: 0, lastTimestamp: time(3) },
      u2: { authorId: "u2", name: "Ada", username: "ada", total: 4, sent: 0, received: 4, unknown: 0, lastTimestamp: time(1) },
    } },
    "200": { conversationId: "200", navigationPath: "/channels/999/200", status: "cancelled", people: {
      self: { authorId: "self", total: 100, sent: 100, lastTimestamp: time(6) },
      u1: { authorId: "u1", name: "Zee", username: "zee", total: 1, received: 1, lastTimestamp: time(5) },
    } },
    "300": { conversationId: "300", navigationPath: "/channels/@me/300", status: "partial", people: {
      self: { authorId: "self", name: "Me", total: 3, sent: 3, lastTimestamp: time(7) },
      u1: { authorId: "u1", name: "Zee newer", username: "zee", avatarUrl: "https://cdn.discordapp.com/avatars/u1/new.png", total: 1, received: 1, lastTimestamp: time(5) },
    } },
  } };
}

test("Most Contacted Users excludes self and aggregates sent-message counts by stable user ID", () => {
  const rows = buildFrequentContacts(contactSnapshot(), { currentUserId: "self" });
  assert.equal(rows.length, 2);
  assert.equal(rows.some(row => row.authorId === "self"), false);
  const zee = rows.find(row => row.authorId === "u1");
  assert.equal(zee.messageCount, 11);
  assert.equal(zee.displayName, "Zee newer");
  assert.equal(zee.username, "zee");
  assert.equal(zee.avatarUrl, "https://cdn.discordapp.com/avatars/u1/new.png");
  assert.equal(zee.lastTimestamp, time(7));
  assert.equal(zee.href, "/channels/@me/300");
  assert.equal(rows.find(row => row.authorId === "u2").messageCount, 8);
  assert.equal(rows.some(row => row.href === "/channels/999/200"), false);
});

test("Frequent search is case insensitive and sorts by messages or recent activity", () => {
  const options = { currentUserId: "self" };
  const rows = buildFrequentContacts(contactSnapshot(), options);
  assert.equal(buildFrequentContacts(contactSnapshot(), { ...options, search: "ADA" }).length, 1);
  assert.equal(buildFrequentContacts(contactSnapshot(), { ...options, search: "u1" }).length, 1);
  assert.equal(rows[0].authorId, "u1");
  const recent = buildFrequentContacts(contactSnapshot(), { ...options, sort: "recent" });
  assert.equal(recent[0].conversationId, "300");
  const names = buildFrequentContacts(contactSnapshot(), { ...options, sort: "name" });
  assert.equal(names[0].displayName, "Ada");
});

test("Frequent waits for a verified current-user ID instead of listing the owner as a contact", () => {
  assert.deepEqual(buildFrequentContacts(contactSnapshot()), []);
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
  const [contact] = buildFrequentContacts(contactSnapshot(), { currentUserId: "self" });
  const link = createDiscordConversationLink(document, contact);
  assert.equal(link.tagName, "A");
  assert.equal(link.href, "/channels/@me/300");
  assert.equal(link.textContent, "Zee newer");
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
      { messageId: "mine-1", authorId: "self", authorName: "Me", timestamp: time(1), isSelf: true },
      { messageId: "mine-1", authorId: "self", authorName: "Me", timestamp: time(1), isSelf: true },
      { messageId: "theirs-1", authorId: "u1", authorName: "Zee", authorUsername: "zee", timestamp: time(2), isSelf: false,
        avatarUrl: "https://cdn.discordapp.com/avatars/u1/hash.png" },
    ] }; },
  };
  const result = await new CollectionCoordinator({ adapter, store, getCurrentUserId: () => "self" }).collect("100");
  assert.equal(result.processed, 2);
  assert.equal(result.duplicates, 1);
  const afterReload = new HistoricalStore({ load: () => data, save });
  const contacts = buildFrequentContacts(afterReload.snapshot(), { currentUserId: "self" });
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].authorId, "u1");
  assert.equal(contacts[0].messageCount, 1);
  assert.equal(contacts[0].username, "zee");
  assert.equal(contacts[0].href, "/channels/@me/100");
});

test("Frequent reconciliation keeps stable identities and never merges identical names", () => {
  const snapshot = { conversations: { "100": { conversationId: "100", navigationPath: "/channels/@me/100", people: {
    self: { authorId: "self", name: "Me", total: 4, sent: 4 },
    "u1": { authorId: "u1", name: "Alex", username: "alex-old", avatarUrl: "https://cdn.discordapp.com/avatars/u1/old.png", total: 2, lastTimestamp: time(2) },
    " u1 ": { authorId: " u1 ", name: "Alex New", username: "alex-new", avatarUrl: "https://cdn.discordapp.com/avatars/u1/new.png", total: 3, lastTimestamp: time(4) },
    "u2": { authorId: "u2", name: "Alex", username: "alex-two", total: 1, lastTimestamp: time(3) },
  } } } };
  const rows = buildFrequentContacts(snapshot, { currentUserId: "self" });
  const alexes = rows.filter(row => row.displayName.startsWith("Alex"));
  assert.equal(rows.filter(row => row.authorId === "u1").length, 1);
  assert.equal(rows.find(row => row.authorId === "u1").messageCount, 4);
  assert.equal(rows.find(row => row.authorId === "u2").messageCount, 4);
  assert.equal(alexes.length, 2);
  assert.equal(rows.some(row => row.authorId === "unknown"), false);
});

test("Frequent excludes unresolved identities and never renders unresolved as a person", () => {
  const snapshot = { conversations: { "100": { conversationId: "100", navigationPath: "/channels/@me/100", people: {
    self: { authorId: "self", total: 2, sent: 2 },
    "__unresolved_author__": { authorId: "__unresolved_author__", name: "Unknown", total: 4 },
    u1: { authorId: "u1", name: "Pat", total: 2 },
  } } } };
  const rows = buildFrequentContacts(snapshot, { currentUserId: "self" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].authorId, "u1");
});

test("Frequent skips conversations without a confirmed direct-message route", () => {
  const snapshot = { conversations: { "42": { conversationId: "42", navigationPath: null, people: {
    self: { authorId: "self", total: 2, sent: 2 },
    "person-id": { name: "Pat", total: 2 },
  } } } };
  assert.deepEqual(buildFrequentContacts(snapshot, { currentUserId: "self" }), []);
});

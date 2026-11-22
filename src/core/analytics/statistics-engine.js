import { busiestHour, groupDailyCounts } from "./time-series.js";

export function summarizeAnalytics(snapshot, { since = null, until = null, search = "", granularity = "day" } = {}) {
  const conversations = Object.values(snapshot?.conversations || {});
  const totals = { sent: 0, received: 0, unknown: 0 };
  const people = new Map();
  const daily = new Map();
  const hourly = Array(24).fill(0);
  const query = search.trim().toLocaleLowerCase();
  let newestActivity = null;

  for (const conversation of conversations) {
    if (since == null && until == null) {
      totals.sent += conversation.totals.sent;
      totals.received += conversation.totals.received;
      totals.unknown += conversation.totals.unknown || 0;
    }
    conversation.hourly.forEach((count, hour) => { hourly[hour] += count; });
    for (const [day, count] of Object.entries(conversation.daily)) {
      const dayEnd = Date.parse(`${day}T23:59:59.999Z`);
      const dayStart = Date.parse(`${day}T00:00:00.000Z`);
      if ((since != null && dayEnd < since) || (until != null && dayStart > until)) continue;
      daily.set(day, (daily.get(day) || 0) + count);
      const inRange = (since == null || dayEnd >= since) && (until == null || dayStart <= until);
      if (inRange && (since != null || until != null)) {
        totals.sent += conversation.dailySent[day] || 0;
        totals.received += conversation.dailyReceived[day] || 0;
        totals.unknown += conversation.dailyUnknown[day] || 0;
      }
    }
    for (const person of Object.values(conversation.people)) {
      if (conversation.excludedAuthors.includes(person.authorId)) continue;
      if (query && !person.name.toLocaleLowerCase().includes(query)) continue;
      const current = people.get(person.authorId) || { authorId: person.authorId, name: person.name, sent: 0, received: 0, unknown: 0, total: 0, lastTimestamp: null };
      if (since == null && until == null) {
        current.sent += person.sent;
        current.received += person.received;
        current.unknown += person.unknown || 0;
      } else {
        for (const [day, count] of Object.entries(person.daily || {})) {
          const start = Date.parse(`${day}T00:00:00.000Z`), end = start + 86_400_000 - 1;
          if ((since != null && end < since) || (until != null && start > until)) continue;
          current.sent += person.dailySent?.[day] || 0;
          current.received += person.dailyReceived?.[day] || 0;
          current.unknown += person.dailyUnknown?.[day] || 0;
        }
      }
      current.total = current.sent + current.received + current.unknown;
      current.total += person.total;
      current.lastTimestamp = Math.max(current.lastTimestamp || 0, person.lastTimestamp || 0) || null;
      people.set(person.authorId, current);
    }
    const last = conversation.coverage.newestTimestamp;
    if (last != null) newestActivity = Math.max(newestActivity || 0, last);
  }
  return {
    totals: { ...totals, tracked: totals.sent + totals.received },
    trackedConversations: conversations.length,
    statuses: conversations.reduce((result, item) => { result[item.status] = (result[item.status] || 0) + 1; return result; }, {}),
    people: [...people.values()].sort((a, b) => b.received - a.received || a.name.localeCompare(b.name)),
    daily: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
    hourly,
    busiestHour: busiestHour(hourly),
    activity: groupDailyCounts(Object.fromEntries(daily), granularity),
    newestActivity,
  };
}

export function getPersonStats(conversation, authorId) {
  const person = conversation?.people?.[String(authorId)];
  if (!person) return null;
  return {
    name: person.name,
    sent: person.sent,
    received: person.received,
    total: person.total,
    lastTimestamp: person.lastTimestamp,
    daily: Object.entries(person.daily || {}).sort(([a], [b]) => a.localeCompare(b)),
    hourly: [...(person.hourly || Array(24).fill(0))],
    status: conversation.status,
    coverage: { ...conversation.coverage },
  };
}

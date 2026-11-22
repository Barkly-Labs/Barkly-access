export function isWithinRange(timestamp, { since = null, until = null } = {}) {
  return timestamp != null && (since == null || timestamp >= since) && (until == null || timestamp <= until);
}

export function groupDailyCounts(dailyCounts, granularity = "day", { since = null, until = null } = {}) {
  const groups = new Map();
  for (const [date, count] of Object.entries(dailyCounts || {})) {
    const start = Date.parse(`${date}T00:00:00Z`);
    const end = start + 86_400_000 - 1;
    if ((since != null && end < since) || (until != null && start > until)) continue;
    const key = granularity === "month" ? date.slice(0, 7)
      : granularity === "week" ? isoWeek(date)
        : date;
    groups.set(key, (groups.get(key) || 0) + count);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, count]) => ({ period, count }));
}

export function busiestHour(hourlyCounts) {
  const values = Array.isArray(hourlyCounts) ? hourlyCounts : [];
  const count = Math.max(0, ...values);
  return count ? { hour: values.indexOf(count), count } : null;
}

function isoWeek(day) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86_400_000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

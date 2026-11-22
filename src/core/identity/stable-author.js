export function canonicalAuthorId(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const id = String(value).trim();
  if (!id || id.length > 100) return null;
  if (/^(null|undefined|unknown|anonymous)$/i.test(id)) return null;
  return id;
}

export function mergeAuthorRecords(current, incoming) {
  if (!incoming || typeof incoming !== "object") return current;
  const result = current && typeof current === "object" ? structuredClone(current) : {};
  const authorId = canonicalAuthorId(incoming.authorId ?? incoming.author_id ?? result.authorId);
  if (!authorId) return null;
  result.authorId = authorId;
  const incomingName = typeof incoming.name === "string" ? incoming.name.trim() : "";
  const resultName = typeof result.name === "string" ? result.name.trim() : "";
  if (incomingName) result.name = incomingName;
  else if (!resultName) result.name = authorId;
  const incomingUsername = typeof incoming.username === "string" ? incoming.username.trim() : "";
  if (incomingUsername) result.username = incomingUsername;
  if (typeof incoming.avatarUrl === "string" && incoming.avatarUrl) result.avatarUrl = incoming.avatarUrl;
  for (const direction of ["sent", "received", "unknown"]) result[direction] = count(result[direction]) + count(incoming[direction]);
  result.total = result.sent + result.received + result.unknown;
  result.firstTimestamp = earliest(result.firstTimestamp, incoming.firstTimestamp);
  result.lastTimestamp = latest(result.lastTimestamp, incoming.lastTimestamp);
  result.daily = mergeCountMap(result.daily, incoming.daily);
  result.dailySent = mergeCountMap(result.dailySent, incoming.dailySent);
  result.dailyReceived = mergeCountMap(result.dailyReceived, incoming.dailyReceived);
  result.dailyUnknown = mergeCountMap(result.dailyUnknown, incoming.dailyUnknown);
  result.hourly = mergeCountArray(result.hourly, incoming.hourly);
  result.hourlySent = mergeCountArray(result.hourlySent, incoming.hourlySent);
  result.hourlyReceived = mergeCountArray(result.hourlyReceived, incoming.hourlyReceived);
  result.hourlyUnknown = mergeCountArray(result.hourlyUnknown, incoming.hourlyUnknown);
  return result;
}

const count = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0;
const earliest = (a, b) => { const values=[a,b].map(Number).filter(v=>Number.isFinite(v)&&v>=0); return values.length?Math.min(...values):null; };
const latest = (a, b) => { const values=[a,b].map(Number).filter(v=>Number.isFinite(v)&&v>=0); return values.length?Math.max(...values):null; };
const mergeCountMap=(a,b)=>{const r={};for(const s of [a,b])if(s&&typeof s==='object')for(const [k,v] of Object.entries(s))if(/^\d{4}-\d{2}-\d{2}$/.test(k))r[k]=count(r[k])+count(v);return r;};
const mergeCountArray=(a,b)=>Array.from({length:24},(_,h)=>count(a?.[h])+count(b?.[h]));

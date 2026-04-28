const express  = require("express");
const cors     = require("cors");
const path     = require("path");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { fetchReportCsv, fetchCampaignTypeMap } = require("./five9Client");
const {
  calls:        MOCK_CALLS,
  agents:       MOCK_AGENTS,
  campaigns:    MOCK_CAMPAIGNS,
  outboundANIs: MOCK_ANIS,
  agentSessions: MOCK_AGENT_SESSIONS,
} = require("./data/mockData");

const { applyGlobalFilters } = require("./utils/filters");

const app        = express();
const PORT       = process.env.PORT || 4000;
const REFRESH_MS = (parseInt(process.env.REFRESH_INTERVAL) || 300) * 1000;
const CACHE_DAYS = parseInt(process.env.CACHE_DAYS) || 30;

app.use(cors());
app.use(express.json());

// ── Outbound classification config ─────────────────────────────────────────
// RULE 1: ANI in outboundANIs  →  outbound
// RULE 2: campaignName in outbound campaigns  →  outbound
// Both rules are applied in classifyCall() — used by enrichCall() on every record.
const OUTBOUND_ANI_SET      = new Set(MOCK_ANIS.map((a) => a.number));
const OUTBOUND_CAMPAIGN_SET = new Set(
  MOCK_CAMPAIGNS.filter((c) => c.type === "outbound").map((c) => c.name)
);

// ── Campaign type map (fetched from Five9 config API) ──────────────────────
let _campaignTypeMap = new Map();

// ── Cache ──────────────────────────────────────────────────────────────────
let _cache     = null;
let _refreshing = false;

async function doRefresh() {
  if (_refreshing) return;
  _refreshing = true;
  try {
    const end   = new Date();
    const start = new Date();
    start.setDate(start.getDate() - CACHE_DAYS);
    start.setHours(0, 0, 0, 0);

    try {
      _campaignTypeMap = await fetchCampaignTypeMap();
    } catch (e) {
      console.warn("[Cache] Campaign type fetch failed:", e.message);
    }

    console.log(`[Cache] Fetching Five9 ${start.toISOString().slice(0,10)} → ${end.toISOString().slice(0,10)}`);
    const csv   = await fetchReportCsv(start, end);
    const calls = parseCallLog(csv);
    _cache = { calls, fetchedAt: new Date(), rangeStart: start, rangeEnd: end, usingMock: false };
    console.log(`[Cache] ${calls.length} calls loaded from Five9`);
  } catch (err) {
    console.error(`[Cache] Five9 fetch failed: ${err.message}`);
    if (!_cache) {
      const enriched = MOCK_CALLS.map(enrichCall);
      _cache = {
        calls: enriched,
        fetchedAt: new Date(),
        rangeStart: new Date(Math.min(...enriched.map((c) => new Date(c.timestamp)))),
        rangeEnd:   new Date(),
        usingMock: true,
      };
      console.log(`[Cache] Loaded ${_cache.calls.length} mock calls as fallback`);
    }
  } finally {
    _refreshing = false;
  }
}

function isCacheStale() {
  if (!_cache) return true;
  return Date.now() - _cache.fetchedAt.getTime() > REFRESH_MS;
}

// Primary data accessor — stale-while-revalidate.
// Pass this function to route factories so they never touch _cache directly.
async function getCalls() {
  if (!_cache) {
    await doRefresh();
  } else if (isCacheStale()) {
    doRefresh(); // return existing data immediately; refresh in background
  }
  return _cache.calls;
}

// Session data accessor — currently always returns mock data.
// Replace with a DB query when moving to PostgreSQL.
function getAgentSessions() {
  return MOCK_AGENT_SESSIONS;
}

// ── CSV parser ─────────────────────────────────────────────────────────────

const COL_ALIASES = {
  timestamp:   ["timestamp", "call timestamp", "date time", "datetime"],
  date:        ["date", "call date"],
  time:        ["time", "start time", "call start time"],
  type:        ["call type", "type", "call direction"],
  ani:         ["ani", "caller id", "from", "caller phone number"],
  dnis:        ["dnis", "dialed number", "to", "called number"],
  campaign:    ["campaign", "campaign name"],
  agent:       ["agent name", "agent full name"],
  agentkey:    ["agent"],
  duration:    ["talk time", "duration", "call duration", "handle time"],
  disposition: ["disposition", "call disposition", "final disposition"],
};

function normHeader(h) {
  return h.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

function mapHeaders(rawHeaders) {
  const normed = rawHeaders.map(normHeader);
  const idx = {};
  for (const [field, aliases] of Object.entries(COL_ALIASES)) {
    for (const alias of aliases) {
      const i = normed.indexOf(alias);
      if (i !== -1) { idx[field] = i; break; }
    }
  }
  return idx;
}

function parseDuration(val) {
  if (!val || !val.trim()) return 0;
  const s = val.trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function parseFive9Date(dateStr, timeStr) {
  if (!dateStr) return null;
  const mdy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const iso = `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
    return new Date(`${iso}T${timeStr || "00:00:00"}`);
  }
  return new Date(`${dateStr}T${timeStr || "00:00:00"}`);
}

function detectDelimiter(firstLine) {
  const pipes  = (firstLine.match(/\|/g) || []).length;
  const commas = (firstLine.match(/,/g)  || []).length;
  return pipes > commas ? "|" : ",";
}

function splitLine(line, delim) {
  if (delim === "|") return line.split("|").map((s) => s.trim());
  const result = [];
  let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      result.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

const _agentIds = new Map();
function agentIdFromName(name) {
  if (!name) return "unknown";
  if (!_agentIds.has(name)) {
    _agentIds.set(name, `agent_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`);
  }
  return _agentIds.get(name);
}

function parseCallLog(csv) {
  if (!csv || !csv.trim()) return [];

  const lines = csv.split("\n").map((l) => l.replace(/\r$/, ""));
  let hi = 0;
  while (hi < lines.length) {
    const lower = lines[hi].toLowerCase();
    if (lower.includes("timestamp") || lower.includes("date") || lower.includes("call type") || lower.includes("ani")) break;
    hi++;
  }
  if (hi >= lines.length) {
    console.warn("[CSV] Header row not found");
    return [];
  }

  const delim   = detectDelimiter(lines[hi]);
  const headers = splitLine(lines[hi], delim);
  const idx     = mapHeaders(headers);

  console.log(`[CSV] Delimiter: '${delim}' | Mapped columns:`, idx);

  if (idx.timestamp === undefined && idx.date === undefined) {
    console.warn("[CSV] No date/timestamp column found. Raw headers:", headers.join(" | "));
    return [];
  }

  const result = [];
  let counter  = 0;

  for (let i = hi + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = splitLine(line, delim);
    if (cols.length < 2) continue;

    let timestamp;
    if (idx.timestamp != null) {
      const raw = cols[idx.timestamp] || "";
      const d   = new Date(raw);
      timestamp = isNaN(d) ? new Date().toISOString() : d.toISOString();
    } else {
      const dateStr = idx.date != null ? cols[idx.date] : "";
      const timeStr = idx.time != null ? cols[idx.time] : "";
      const ts = parseFive9Date(dateStr, timeStr);
      timestamp = ts && !isNaN(ts) ? ts.toISOString() : new Date().toISOString();
    }

    const rawType     = idx.type        != null ? cols[idx.type]        : "";
    const ani         = idx.ani         != null ? cols[idx.ani]         : "";
    const dnis        = idx.dnis        != null ? cols[idx.dnis]        : "";
    const campaign    = idx.campaign    != null ? cols[idx.campaign]    : "";
    const agentName   = idx.agent       != null ? cols[idx.agent]       :
                        idx.agentkey    != null ? cols[idx.agentkey]    : "";
    const durRaw      = idx.duration    != null ? cols[idx.duration]    : "0";
    const disposition = idx.disposition != null ? cols[idx.disposition] : "Unknown";

    const typeUC = rawType.toUpperCase().trim();
    let five9Type;
    if (typeUC === "OUTBOUND" || typeUC === "OUTBOUND_MANUAL" || typeUC === "PREVIEW") {
      five9Type = "outbound";
    } else if (typeUC === "ABANDONED") {
      five9Type = "abandoned";
    } else {
      five9Type = "inbound";
    }

    const duration = parseDuration(durRaw);

    counter++;
    result.push(enrichCall({
      id:           `f9_${counter}`,
      timestamp,
      ani:          ani  || null,
      dnis:         dnis || null,
      campaignName: campaign    || "Unknown",
      agentId:      agentIdFromName(agentName),
      agentName:    agentName   || "Unknown",
      duration,
      disposition:  disposition || "Unknown",
      five9Type,
      // New fields — derived where possible from Five9 CSV; placeholders otherwise.
      // Full values come from mock data or a Five9 detail report.
      talkTimeSeconds:      duration,  // Five9 "talk time" col maps directly if present
      holdTimeSeconds:      0,
      wrapUpTimeSeconds:    0,
      queueWaitSeconds:     0,
      answeredWithinThreshold: null,
      pickupFlag:           null,
      conversionFlag:       false,
      saveFlag:             false,
      transferred:          false,
      escalatedToClinical:  false,
      campaignType:         null,
      dialedMarketingNumber: dnis || null,
      contactAttemptNumber: 1,
      abandoned:            five9Type === "abandoned",
    }));
  }

  return result;
}

// ── Call classification ────────────────────────────────────────────────────
// IMPORTANT: This is the single implementation of the dual-rule outbound logic.
// All routes use calls already enriched by this function (via getCalls()).
//   Rule 1: ANI in OUTBOUND_ANI_SET          → outbound
//   Rule 2: campaignName in Five9 config map → outbound
//   Rule 3: campaignName in OUTBOUND_CAMPAIGN_SET (from mock config)
//   Rule 4: campaignName contains "outbound" (heuristic fallback)
function classifyCall(call) {
  if (call.five9Type === "outbound") return "outbound";

  const mappedType = _campaignTypeMap.get(call.campaignName);
  if (mappedType === "outbound") return "outbound";
  if (mappedType === "inbound")  return "inbound";

  if (call.ani && OUTBOUND_ANI_SET.has(call.ani))               return "outbound";
  if (OUTBOUND_CAMPAIGN_SET.has(call.campaignName))             return "outbound";
  if (call.campaignName && /outbound/i.test(call.campaignName)) return "outbound";

  return call.five9Type || "inbound";
}

function enrichCall(call) {
  const callType = call.five9Type === "abandoned"
    ? "inbound"   // abandoned callers were trying to reach inbound
    : classifyCall(call);

  const campaignMeta = MOCK_CAMPAIGNS.find(c => c.name === call.campaignName);
  return {
    ...call,
    callType,
    campaignType: call.campaignType || (campaignMeta ? campaignMeta.type : callType),
  };
}

// ── Boot ───────────────────────────────────────────────────────────────────
doRefresh().catch(() => {});
setInterval(() => doRefresh().catch(() => {}), REFRESH_MS);

// ══════════════════════════════════════════════════════════════════════════════
//  EXISTING ENDPOINTS (preserved — no breaking changes)
// ══════════════════════════════════════════════════════════════════════════════

// Legacy helper — supports both old (start/end) and new global filter params.
async function getFiltered(req) {
  const all = await getCalls();
  return applyGlobalFilters(all, req.query);
}

app.get("/api/calls", async (req, res) => {
  try { res.json(await getFiltered(req)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/calls/summary", async (req, res) => {
  try {
    const filtered      = await getFiltered(req);
    const nonAbandoned  = filtered.filter(c => !c.abandoned);
    const totalCalls    = nonAbandoned.length;
    const totalInbound  = nonAbandoned.filter((c) => c.callType === "inbound").length;
    const totalOutbound = nonAbandoned.filter((c) => c.callType === "outbound").length;
    const totalDuration = nonAbandoned.reduce((s, c) => s + (c.duration || 0), 0);
    const avgDuration   = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
    res.json({ totalCalls, totalInbound, totalOutbound, avgDuration });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/calls/by-campaign", async (req, res) => {
  try {
    const outbound = (await getFiltered(req)).filter((c) => c.callType === "outbound");
    const map = {};
    for (const call of outbound) {
      if (!map[call.campaignName]) {
        map[call.campaignName] = { campaignName: call.campaignName, count: 0, totalDuration: 0 };
      }
      map[call.campaignName].count++;
      map[call.campaignName].totalDuration += call.duration || 0;
    }
    const result = Object.values(map)
      .map((g) => ({ ...g, avgDuration: Math.round(g.totalDuration / g.count) }))
      .sort((a, b) => b.count - a.count);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/calls/by-ani", async (req, res) => {
  try {
    const outbound = (await getFiltered(req)).filter((c) => c.callType === "outbound");
    const map = {};
    for (const call of outbound) {
      const key  = call.ani || "Manual Dial";
      const meta = MOCK_ANIS.find((a) => a.number === call.ani);
      if (!map[key]) map[key] = { ani: key, label: meta ? meta.label : key, count: 0 };
      map[key].count++;
    }
    res.json(Object.values(map).sort((a, b) => b.count - a.count));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/calls/by-disposition", async (req, res) => {
  try {
    const map = {};
    for (const call of await getFiltered(req)) {
      map[call.disposition] = (map[call.disposition] || 0) + 1;
    }
    const result = Object.entries(map)
      .map(([disposition, count]) => ({ disposition, count }))
      .sort((a, b) => b.count - a.count);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/calls/by-agent", async (req, res) => {
  try {
    const map = {};
    for (const call of await getFiltered(req)) {
      if (!call.agentId || call.agentId === "unknown") continue;
      if (!map[call.agentId]) {
        map[call.agentId] = {
          agentId: call.agentId, agentName: call.agentName,
          total: 0, inbound: 0, outbound: 0, totalDuration: 0,
        };
      }
      map[call.agentId].total++;
      if (call.callType === "inbound" || call.callType === "outbound") {
        map[call.agentId][call.callType]++;
      }
      map[call.agentId].totalDuration += call.duration || 0;
    }
    const result = Object.values(map)
      .map((a) => ({ ...a, avgDuration: Math.round(a.totalDuration / a.total) }))
      .sort((a, b) => b.total - a.total);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/calls/timeline", async (req, res) => {
  try {
    const map = {};
    for (const call of await getFiltered(req)) {
      const day = call.timestamp.slice(0, 10);
      if (!map[day]) map[day] = { date: day, total: 0, inbound: 0, outbound: 0, abandoned: 0, totalDuration: 0 };
      map[day].total++;
      map[day].totalDuration += call.duration || 0;
      if (call.abandoned)               map[day].abandoned++;
      if (call.callType === "inbound")  map[day].inbound++;
      if (call.callType === "outbound") map[day].outbound++;
    }
    res.json(
      Object.values(map)
        .map((d) => ({ ...d, avgDuration: d.total > 0 ? Math.round(d.totalDuration / d.total) : 0 }))
        .sort((a, b) => a.date.localeCompare(b.date))
    );
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Reference data ─────────────────────────────────────────────────────────

app.get("/api/agents", async (req, res) => {
  try {
    if (_cache && !_cache.usingMock && _cache.calls.length > 0) {
      const seen = new Map();
      for (const c of _cache.calls) {
        if (c.agentId !== "unknown" && !seen.has(c.agentId)) {
          seen.set(c.agentId, { id: c.agentId, name: c.agentName });
        }
      }
      return res.json(Array.from(seen.values()));
    }
    res.json(MOCK_AGENTS);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/campaigns", async (req, res) => {
  try {
    if (_cache && !_cache.usingMock && _cache.calls.length > 0) {
      const seen = new Map();
      for (const c of _cache.calls) {
        if (c.campaignName && c.campaignName !== "Unknown" && !seen.has(c.campaignName)) {
          const mapped = _campaignTypeMap.get(c.campaignName);
          seen.set(c.campaignName, {
            id: c.campaignName, name: c.campaignName,
            type: mapped || c.callType,
          });
        }
      }
      return res.json(Array.from(seen.values()));
    }
    res.json(MOCK_CAMPAIGNS.map((c) => ({ ...c, id: c.name })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/anis", async (req, res) => {
  try {
    if (_cache && !_cache.usingMock && _cache.calls.length > 0) {
      const seen = new Map();
      for (const c of _cache.calls) {
        if (c.ani && c.callType === "outbound" && !seen.has(c.ani)) {
          seen.set(c.ani, { number: c.ani, label: c.ani });
        }
      }
      return res.json(Array.from(seen.values()).sort((a, b) => a.number.localeCompare(b.number)));
    }
    res.json(MOCK_ANIS);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Status / health ────────────────────────────────────────────────────────
app.get("/api/status", (req, res) => {
  res.json({
    status:      "ok",
    usingMock:   _cache?.usingMock  ?? null,
    cachedAt:    _cache?.fetchedAt  ?? null,
    callCount:   _cache?.calls.length ?? 0,
    rangeStart:  _cache?.rangeStart ?? null,
    rangeEnd:    _cache?.rangeEnd   ?? null,
    nextRefresh: _cache
      ? new Date(_cache.fetchedAt.getTime() + REFRESH_MS).toISOString()
      : null,
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  NEW METRIC ROUTE GROUPS
// ══════════════════════════════════════════════════════════════════════════════

app.use(
  "/api/metrics/agent-efficiency",
  require("./routes/agentEfficiency")(getCalls, getAgentSessions)
);

app.use(
  "/api/metrics/outbound",
  require("./routes/outboundAni")(getCalls, MOCK_ANIS, MOCK_CAMPAIGNS)
);

app.use(
  "/api/metrics/inbound",
  require("./routes/inboundQueue")(getCalls)
);

app.use(
  "/api/metrics/dispositions",
  require("./routes/dispositions")(getCalls)
);

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\nFive9 Analytics API → http://localhost:${PORT}`);
  console.log(`  Refreshing every ${REFRESH_MS / 1000}s | Cache window: ${CACHE_DAYS} days`);
  console.log(`\n  ── Existing endpoints ──`);
  console.log(`  GET /api/status`);
  console.log(`  GET /api/calls                        ?startDateTime &endDateTime &agent &campaign &ANI &disposition &direction`);
  console.log(`  GET /api/calls/summary`);
  console.log(`  GET /api/calls/by-campaign`);
  console.log(`  GET /api/calls/by-ani`);
  console.log(`  GET /api/calls/by-disposition`);
  console.log(`  GET /api/calls/by-agent`);
  console.log(`  GET /api/calls/timeline`);
  console.log(`\n  ── Group 1: Agent Efficiency ──`);
  console.log(`  GET /api/metrics/agent-efficiency/aht`);
  console.log(`  GET /api/metrics/agent-efficiency/calls-per-hour`);
  console.log(`  GET /api/metrics/agent-efficiency/utilization`);
  console.log(`  GET /api/metrics/agent-efficiency/time-in-state`);
  console.log(`  GET /api/metrics/agent-efficiency/fcr`);
  console.log(`\n  ── Group 2: Outbound & ANI Health ──`);
  console.log(`  GET /api/metrics/outbound/pickup-rate`);
  console.log(`  GET /api/metrics/outbound/pickup-rate-by-ani`);
  console.log(`  GET /api/metrics/outbound/dial-attempts-by-ani`);
  console.log(`  GET /api/metrics/outbound/live-vs-no-answer-by-ani`);
  console.log(`  GET /api/metrics/outbound/abandon-rate`);
  console.log(`  GET /api/metrics/outbound/by-campaign`);
  console.log(`  GET /api/metrics/outbound/by-campaign-type`);
  console.log(`  GET /api/metrics/outbound/by-ani-and-campaign`);
  console.log(`\n  ── Group 3: Inbound Queue ──`);
  console.log(`  GET /api/metrics/inbound/median-response-time`);
  console.log(`  GET /api/metrics/inbound/avg-speed-of-answer`);
  console.log(`  GET /api/metrics/inbound/service-level              ?targetSeconds=30`);
  console.log(`  GET /api/metrics/inbound/abandon-rate`);
  console.log(`  GET /api/metrics/inbound/volume-by-marketing-number`);
  console.log(`  GET /api/metrics/inbound/avg-queue-wait`);
  console.log(`  GET /api/metrics/inbound/longest-wait`);
  console.log(`\n  ── Group 4: Dispositions & Outcomes ──`);
  console.log(`  GET /api/metrics/dispositions/conversion-rate`);
  console.log(`  GET /api/metrics/dispositions/save-rate`);
  console.log(`  GET /api/metrics/dispositions/outbound-breakdown`);
  console.log(`  GET /api/metrics/dispositions/inbound-breakdown`);
  console.log(`  GET /api/metrics/dispositions/transfer-rate`);
  console.log(`\n  All new endpoints accept: ?startDateTime &endDateTime &agent &campaign &ANI &disposition &direction`);
});

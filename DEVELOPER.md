# Developer Guide

Practical how-tos for the most common extension tasks.

---

## 1 — How outbound calls are classified

Five9's native **Call Type** column in the CSV export reports manually-dialled calls as `"INBOUND"` or leaves the field blank. A naive filter on that column would miscount ~30% of outbound calls as inbound.

**The dual-rule fix lives entirely in `server/server.js` inside `classifyCall()`:**

| Priority | Rule | Triggers when |
|---|---|---|
| 1 | Five9 native type | CSV field is `OUTBOUND`, `OUTBOUND_MANUAL`, or `PREVIEW` |
| 2 | Five9 config API | Campaign name maps to `"outbound"` in the campaign-type map fetched from Five9 |
| 3 | ANI set | `call.ani` is in `OUTBOUND_ANI_SET` (built from `outboundANIs` in mock data) |
| 4 | Campaign set | Campaign name is in `OUTBOUND_CAMPAIGN_SET` (campaigns with `type:"outbound"`) |
| 5 | Heuristic | Campaign name contains the word "outbound" (case-insensitive) |

`classifyCall()` is called once per call inside `enrichCall()`, which runs before any route sees the data. **All KPI functions in `server/utils/kpiCalculators.js` use `call.callType`, never `call.five9Type`.**

---

## 2 — How to add a new outbound ANI

**When:** You have a new caller-ID number the dialer should use for outbound calls.

1. Open `server/data/mockData.js` and add an entry to the `outboundANIs` array:
   ```js
   { number: "+15551234567", label: "New Outbound Line" }
   ```
2. That's it. `OUTBOUND_ANI_SET` is built from this array at startup in `server.js`.
3. When the server next restarts (or is refreshed), calls from this ANI will be classified as outbound.

> **Production note:** When connected to the real Five9 API, the campaign-type map (Rule 2) is fetched automatically. The ANI set and campaign set are fallbacks for unrecognised campaigns or when the config API is unavailable.

---

## 3 — How to add a new campaign type / dialer mode

Five9 supports predictive, preview, and progressive dialer modes. To ensure a campaign is treated as outbound regardless of ANI:

1. Open `server/data/mockData.js`, find the `campaigns` array.
2. Add or update the entry:
   ```js
   { id: "my-campaign", name: "Re-engagement Q3", type: "outbound" }
   ```
3. Restart the server. The campaign name lands in `OUTBOUND_CAMPAIGN_SET` (Rule 4).

If the campaign name matches what Five9 sends in the CSV `Campaign` column exactly (case-sensitive), no further change is needed.

---

## 4 — How to add a new metric card

Adding a metric involves five files. Follow the checklist:

### 4a — KPI calculator (`server/utils/kpiCalculators.js`)
Add a pure function that receives a filtered `calls` array (or `sessions`) and returns a plain object:
```js
function calcMyMetric(calls) {
  const total = calls.filter(c => c.callType === "outbound").length;
  return { total, rate: pct(total, calls.length) };
}
module.exports = { ..., calcMyMetric };
```

### 4b — Route (`server/routes/<group>.js`)
Wire the calculator to an Express route inside the appropriate router file:
```js
router.get("/my-metric", async (req, res) => {
  try {
    const { calls } = await resolve(req);
    res.json(kpi.calcMyMetric(calls));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
```

### 4c — API client (`client/src/api/client.js`)
Add a fetch function:
```js
export async function fetchMyMetric(filters = {}) {
  return apiFetch("/api/metrics/<group>/my-metric", filters);
}
```

### 4d — Metric registry (`client/src/constants/metrics.js`)
Add an entry to `METRICS`:
```js
myMetric: {
  id:           "myMetric",
  label:        "My Metric",
  description:  "One sentence describing what it measures",
  formula:      "numerator ÷ denominator × 100",
  endpoint:     "/api/metrics/<group>/my-metric",
  fetchKey:     "fetchMyMetric",
  tabs:         ["outbound"],        // which dashboard tabs show this
  format:       "percent",           // "duration" | "percent" | "count" | "text"
  unit:         "%",
  thresholdKey: null,                // or a key from client/src/config/thresholds.js
},
```

### 4e — Tab component
Import the fetch function and render a card in the appropriate tab (`client/src/tabs/`).

---

## 5 — How to change an alert threshold

All threshold values live in **`client/src/config/thresholds.js`**.

```js
export const THRESHOLDS = {
  avgQueueWaitSeconds: { warn: 45, crit: 90, direction: "high" },
  serviceLevel:        { warn: 70, crit: 60, direction: "low"  },
  // ...
};
```

- **`direction: "high"`** — alerts when the value exceeds `warn`/`crit`.
- **`direction: "low"`** — alerts when the value drops below `warn`/`crit`.

Change the numbers directly. `getLevel(key, value)` in `thresholds.js` re-evaluates on every `useAlerts` poll — no other file needs to change.

To add a threshold for a new metric:

1. Add an entry to `THRESHOLDS` with the matching `thresholdKey` from the metric registry.
2. Add an evaluation rule inside `evaluateAlerts()` in `client/src/utils/alertEngine.js`.

---

## Project layout (quick reference)

```
server/
  server.js              — Express app, cache, CSV parser, enrichCall / classifyCall
  routes/                — One file per metric group (agentEfficiency, outboundAni, inboundQueue, dispositions)
  services/callService.js — Filter-application wrapper used by routes
  utils/
    kpiCalculators.js    — Pure KPI math (no I/O)
    filters.js           — applyGlobalFilters, filterSessions
  data/mockData.js       — Mock calls, agents, campaigns, ANIs, sessions
  mock-data/mockData.js  — Re-export alias

client/src/
  App.jsx                — Root; mounts tabs and passes filters
  hooks/
    useFilters.js        — Global filter state (date presets + dimension filters)
    useAlerts.js         — Threshold polling, returns alerts[]
    useMetric.js         — Generic single-metric fetch hook
  constants/
    metrics.js           — METRICS registry (id, label, formula, endpoint, format, …)
    datePresets.js       — DATE_PRESETS with getRange() factories
  config/thresholds.js   — THRESHOLDS + getLevel() + levelColor()
  utils/
    alertEngine.js       — evaluateAlerts(data) → alerts[]
    formatters.js        — fmtDuration, fmtPercent, fmtCount, fmtDate, fmtDelta, fmtMetricValue
    reportGenerator.js   — generateReport() / generateWeeklyReport() → PDF or CSV
    csvExport.js         — exportReportCSV, exportTableCSV, toCSV (RFC 4180)
  api/client.js          — All fetch functions (one per metric endpoint)
  components/
    GlobalFilters.jsx    — Date presets + dimension selectors + active chips
    AlertBanner.jsx      — Collapsed/expanded alert list with severity pills
  tabs/                  — One file per dashboard tab
```

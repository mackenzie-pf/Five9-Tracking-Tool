/**
 * Metric Registry — single source of truth for every tracked KPI.
 *
 * Each entry describes:
 *   id           — stable camelCase key
 *   label        — human-readable display name
 *   description  — one-sentence explanation of what it measures
 *   formula      — plain-English formula so anyone can verify the math
 *   endpoint     — API path that returns this metric
 *   fetchKey     — name of the fetch function in api/client.js
 *   tabs         — which dashboard tabs display this metric
 *   format       — how to render the value:
 *                    "duration"  → fmtDuration()  → "4:32"
 *                    "percent"   → fmtPercent()   → "75.4%"
 *                    "count"     → fmtCount()     → "1,234"
 *                    "text"      → raw string
 *   unit         — short unit label for tooltips / export headers
 *   thresholdKey — key into THRESHOLDS config (null = no alert rule)
 *
 * To add a new metric:
 *   1. Add a KPI calculator in server/utils/kpiCalculators.js
 *   2. Add a route in the appropriate server/routes/ file
 *   3. Add a fetch function in client/src/api/client.js
 *   4. Add the entry below
 *   5. Add it to the relevant tab component
 *   6. Optionally add a threshold entry in client/src/config/thresholds.js
 */

// ── Group 1: Agent Efficiency ─────────────────────────────────────────────────

export const METRICS = {
  aht: {
    id:           "aht",
    label:        "Avg Handle Time",
    description:  "Average total time per call: talk + hold + wrap-up",
    formula:      "(talkTimeSeconds + holdTimeSeconds + wrapUpTimeSeconds) ÷ callCount",
    endpoint:     "/api/metrics/agent-efficiency/aht",
    fetchKey:     "fetchAHT",
    tabs:         ["agents"],
    format:       "duration",
    unit:         "seconds",
    thresholdKey: "ahtSeconds",
  },

  callsPerHour: {
    id:           "callsPerHour",
    label:        "Calls Per Hour",
    description:  "Handled calls divided by total logged-in hours",
    formula:      "handledCalls ÷ loggedInHours",
    endpoint:     "/api/metrics/agent-efficiency/calls-per-hour",
    fetchKey:     "fetchCallsPerHour",
    tabs:         ["agents"],
    format:       "count",
    unit:         "calls/hr",
    thresholdKey: null,
  },

  utilizationRate: {
    id:           "utilizationRate",
    label:        "Utilization Rate",
    description:  "Active handling time as a percentage of total logged-in time (excl. breaks)",
    formula:      "(on_call + on_hold + wrap_up) ÷ loggedInSeconds × 100",
    endpoint:     "/api/metrics/agent-efficiency/utilization",
    fetchKey:     "fetchUtilization",
    tabs:         ["agents", "realtime"],
    format:       "percent",
    unit:         "%",
    thresholdKey: "utilizationRate",
  },

  timeInState: {
    id:           "timeInState",
    label:        "Time in State",
    description:  "Seconds spent in each agent state per shift",
    formula:      "Summed directly from Five9 session state log",
    endpoint:     "/api/metrics/agent-efficiency/time-in-state",
    fetchKey:     "fetchTimeInState",
    tabs:         ["agents", "realtime"],
    format:       "duration",
    unit:         "seconds",
    thresholdKey: null,
  },

  fcr: {
    id:           "fcr",
    label:        "First Contact Resolution",
    description:  "Calls resolved without requiring a callback, transfer, or clinical escalation",
    formula:      "resolvedCalls ÷ handledCalls × 100",
    endpoint:     "/api/metrics/agent-efficiency/fcr",
    fetchKey:     "fetchFCR",
    tabs:         ["agents"],
    format:       "percent",
    unit:         "%",
    thresholdKey: null,
  },

  wrapUpTime: {
    id:           "wrapUpTime",
    label:        "Avg Wrap-Up Time",
    description:  "Average after-call work time before agent returns to available",
    formula:      "sum(wrapUpTimeSeconds) ÷ handledCalls",
    endpoint:     "/api/metrics/agent-efficiency/aht",
    fetchKey:     "fetchAHT",
    tabs:         ["agents"],
    format:       "duration",
    unit:         "seconds",
    thresholdKey: "wrapUpTimeSeconds",
  },

  // ── Group 2: Outbound & ANI Health ─────────────────────────────────────────

  pickupRate: {
    id:           "pickupRate",
    label:        "Pickup Rate",
    description:  "Outbound calls answered live as % of total dial attempts",
    formula:      "liveAnswers ÷ totalDialAttempts × 100",
    endpoint:     "/api/metrics/outbound/pickup-rate",
    fetchKey:     "fetchPickupRate",
    tabs:         ["outbound"],
    format:       "percent",
    unit:         "%",
    thresholdKey: "pickupRateOverall",
  },

  pickupRateByANI: {
    id:           "pickupRateByANI",
    label:        "Pickup Rate by ANI",
    description:  "Live-answer rate broken down per outbound caller ID",
    formula:      "liveAnswers ÷ dials × 100, grouped by ANI",
    endpoint:     "/api/metrics/outbound/pickup-rate-by-ani",
    fetchKey:     "fetchPickupRateByANI",
    tabs:         ["outbound"],
    format:       "percent",
    unit:         "%",
    thresholdKey: "pickupRatePerANI",
  },

  dialAttemptsByANI: {
    id:           "dialAttemptsByANI",
    label:        "Dial Attempts by ANI",
    description:  "Total outbound dials grouped by caller ID",
    formula:      "count(outboundCalls), grouped by ANI",
    endpoint:     "/api/metrics/outbound/dial-attempts-by-ani",
    fetchKey:     "fetchDialAttemptsByANI",
    tabs:         ["outbound"],
    format:       "count",
    unit:         "dials",
    thresholdKey: null,
  },

  liveVsNoAnswerByANI: {
    id:           "liveVsNoAnswerByANI",
    label:        "Live vs No Answer by ANI",
    description:  "Breakdown of live answers, no answers, and voicemails per ANI",
    formula:      "count(liveAnswers), count(noAnswers), count(voicemails), grouped by ANI",
    endpoint:     "/api/metrics/outbound/live-vs-no-answer-by-ani",
    fetchKey:     "fetchLiveVsNoAnswerByANI",
    tabs:         ["outbound"],
    format:       "count",
    unit:         "calls",
    thresholdKey: null,
  },

  outboundAbandonRate: {
    id:           "outboundAbandonRate",
    label:        "Outbound Abandon Rate",
    description:  "Outbound calls where dialer connected but call was dropped before agent joined",
    formula:      "droppedCalls ÷ dialAttempts × 100",
    endpoint:     "/api/metrics/outbound/abandon-rate",
    fetchKey:     "fetchOutboundAbandonRate",
    tabs:         ["outbound"],
    format:       "percent",
    unit:         "%",
    thresholdKey: "outboundAbandonRate",
  },

  outboundByCampaign: {
    id:           "outboundByCampaign",
    label:        "Outbound by Campaign",
    description:  "Outbound call volume grouped by campaign name",
    formula:      "count(outboundCalls), grouped by campaignName",
    endpoint:     "/api/metrics/outbound/by-campaign",
    fetchKey:     "fetchOutboundByCampaign",
    tabs:         ["outbound"],
    format:       "count",
    unit:         "calls",
    thresholdKey: null,
  },

  outboundByCampaignType: {
    id:           "outboundByCampaignType",
    label:        "Outbound by Campaign Type",
    description:  "Outbound volume split by dialer mode (predictive / preview / progressive)",
    formula:      "count(outboundCalls), grouped by dialerType",
    endpoint:     "/api/metrics/outbound/by-campaign-type",
    fetchKey:     "fetchOutboundByCampaignType",
    tabs:         ["outbound"],
    format:       "count",
    unit:         "calls",
    thresholdKey: null,
  },

  // ── Group 3: Inbound Queue ──────────────────────────────────────────────────

  medianResponseTime: {
    id:           "medianResponseTime",
    label:        "Median Response Time",
    description:  "Median seconds callers wait in queue before reaching an agent",
    formula:      "median(queueWaitSeconds) for answered inbound calls",
    endpoint:     "/api/metrics/inbound/median-response-time",
    fetchKey:     "fetchMedianResponseTime",
    tabs:         ["realtime"],
    format:       "duration",
    unit:         "seconds",
    thresholdKey: null,
  },

  avgSpeedOfAnswer: {
    id:           "avgSpeedOfAnswer",
    label:        "Avg Speed of Answer",
    description:  "Average queue wait for all answered inbound calls",
    formula:      "avg(queueWaitSeconds) for inbound calls where abandoned = false",
    endpoint:     "/api/metrics/inbound/avg-speed-of-answer",
    fetchKey:     "fetchASA",
    tabs:         ["realtime"],
    format:       "duration",
    unit:         "seconds",
    thresholdKey: "avgQueueWaitSeconds",
  },

  serviceLevel: {
    id:           "serviceLevel",
    label:        "Service Level",
    description:  "% of inbound calls answered within the target threshold (default 30 s)",
    formula:      "answeredWithinTarget ÷ totalAnswered × 100",
    endpoint:     "/api/metrics/inbound/service-level",
    fetchKey:     "fetchServiceLevel",
    tabs:         ["realtime"],
    format:       "percent",
    unit:         "%",
    thresholdKey: "serviceLevel",
  },

  inboundAbandonRate: {
    id:           "inboundAbandonRate",
    label:        "Inbound Abandon Rate",
    description:  "Callers who hung up before reaching an agent",
    formula:      "abandonedCalls ÷ totalInboundCalls × 100",
    endpoint:     "/api/metrics/inbound/abandon-rate",
    fetchKey:     "fetchInboundAbandonRate",
    tabs:         ["realtime"],
    format:       "percent",
    unit:         "%",
    thresholdKey: "inboundAbandonRate",
  },

  avgQueueWait: {
    id:           "avgQueueWait",
    label:        "Avg Queue Wait",
    description:  "Average queue wait across all inbound calls (answered + abandoned)",
    formula:      "avg(queueWaitSeconds) for all inbound calls",
    endpoint:     "/api/metrics/inbound/avg-queue-wait",
    fetchKey:     "fetchAvgQueueWait",
    tabs:         ["realtime"],
    format:       "duration",
    unit:         "seconds",
    thresholdKey: "avgQueueWaitSeconds",
  },

  longestWait: {
    id:           "longestWait",
    label:        "Longest Wait",
    description:  "Single longest queue wait recorded during the period",
    formula:      "max(queueWaitSeconds) for inbound calls",
    endpoint:     "/api/metrics/inbound/longest-wait",
    fetchKey:     "fetchLongestWait",
    tabs:         ["realtime"],
    format:       "duration",
    unit:         "seconds",
    thresholdKey: "longestWaitSeconds",
  },

  volumeByMarketingNumber: {
    id:           "volumeByMarketingNumber",
    label:        "Volume by Marketing Number",
    description:  "Inbound call volume grouped by the DNIS (dialed marketing number)",
    formula:      "count(inboundCalls), grouped by dialedMarketingNumber",
    endpoint:     "/api/metrics/inbound/volume-by-marketing-number",
    fetchKey:     "fetchVolumeByMktNumber",
    tabs:         ["outbound"],
    format:       "count",
    unit:         "calls",
    thresholdKey: null,
  },

  // ── Group 4: Dispositions & Outcomes ───────────────────────────────────────

  conversionRate: {
    id:           "conversionRate",
    label:        "Conversion Rate",
    description:  "Outbound calls that resulted in a subscription or appointment (conversionFlag = true)",
    formula:      "convertedCalls ÷ totalOutboundDialAttempts × 100",
    endpoint:     "/api/metrics/dispositions/conversion-rate",
    fetchKey:     "fetchConversionRate",
    tabs:         ["dispositions"],
    format:       "percent",
    unit:         "%",
    thresholdKey: "conversionRate",
  },

  saveRate: {
    id:           "saveRate",
    label:        "Save Rate",
    description:  "Retention calls where the patient was kept (saveFlag = true)",
    formula:      "savedCalls ÷ retentionAttempts × 100",
    endpoint:     "/api/metrics/dispositions/save-rate",
    fetchKey:     "fetchSaveRate",
    tabs:         ["dispositions"],
    format:       "percent",
    unit:         "%",
    thresholdKey: "saveRate",
  },

  transferRate: {
    id:           "transferRate",
    label:        "Transfer Rate",
    description:  "Handled calls that were transferred to another agent or queue",
    formula:      "transferredCalls ÷ handledCalls × 100",
    endpoint:     "/api/metrics/dispositions/transfer-rate",
    fetchKey:     "fetchTransferRate",
    tabs:         ["dispositions", "agents"],
    format:       "percent",
    unit:         "%",
    thresholdKey: null,
  },

  outboundDispositions: {
    id:           "outboundDispositions",
    label:        "Outbound Disposition Breakdown",
    description:  "Outbound call outcomes by disposition label",
    formula:      "count(outboundCalls), grouped by disposition",
    endpoint:     "/api/metrics/dispositions/outbound-breakdown",
    fetchKey:     "fetchOutboundDispositions",
    tabs:         ["dispositions"],
    format:       "count",
    unit:         "calls",
    thresholdKey: null,
  },

  inboundDispositions: {
    id:           "inboundDispositions",
    label:        "Inbound Disposition Breakdown",
    description:  "Inbound support calls grouped into billing / scheduling / medical / general",
    formula:      "count(inboundCalls), grouped by disposition category",
    endpoint:     "/api/metrics/dispositions/inbound-breakdown",
    fetchKey:     "fetchInboundDispositions",
    tabs:         ["dispositions"],
    format:       "count",
    unit:         "calls",
    thresholdKey: null,
  },
};

/** Flat array of all metric definitions. */
export const METRIC_LIST = Object.values(METRICS);

/** All metrics that appear on the given tab. */
export function metricsForTab(tabId) {
  return METRIC_LIST.filter((m) => m.tabs.includes(tabId));
}

/** Look up a metric by its fetchKey name. */
export function metricByFetchKey(fetchKey) {
  return METRIC_LIST.find((m) => m.fetchKey === fetchKey) ?? null;
}

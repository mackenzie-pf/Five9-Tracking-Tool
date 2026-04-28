const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

// Build query string from the global filters object.
// Passes all dimensions so server-side filtering is complete.
function qs(filters = {}) {
  const p = new URLSearchParams();
  if (filters.start) p.set("startDateTime", new Date(filters.start).toISOString());
  if (filters.end)   p.set("endDateTime",   new Date(filters.end).toISOString());
  if (filters.agentId    && filters.agentId    !== "all") p.set("agent",       filters.agentId);
  if (filters.campaignId && filters.campaignId !== "all") p.set("campaign",    filters.campaignId);
  if (filters.ani        && filters.ani        !== "all") p.set("ANI",         filters.ani);
  if (filters.disposition && filters.disposition !== "all") p.set("disposition", filters.disposition);
  if (filters.direction  && filters.direction  !== "all") p.set("direction",   filters.direction);
  return p.toString() ? `?${p}` : "";
}

const get = (url) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
});

// ── Existing endpoints (backward-compat, now pass all filters) ─────────────
export const fetchSummary         = (f) => get(`${BASE}/api/calls/summary${qs(f)}`);
export const fetchCallsByCampaign = (f) => get(`${BASE}/api/calls/by-campaign${qs(f)}`);
export const fetchCallsByANI      = (f) => get(`${BASE}/api/calls/by-ani${qs(f)}`);
export const fetchCallsByDisp     = (f) => get(`${BASE}/api/calls/by-disposition${qs(f)}`);
export const fetchCallsByAgent    = (f) => get(`${BASE}/api/calls/by-agent${qs(f)}`);
export const fetchTimeline        = (f) => get(`${BASE}/api/calls/timeline${qs(f)}`);
export const fetchCalls           = (f) => get(`${BASE}/api/calls${qs(f)}`);
export const fetchAgents          = ()  => get(`${BASE}/api/agents`);
export const fetchCampaigns       = ()  => get(`${BASE}/api/campaigns`);
export const fetchANIs            = ()  => get(`${BASE}/api/anis`);

// ── Group 1: Agent Efficiency ──────────────────────────────────────────────
export const fetchAHT             = (f) => get(`${BASE}/api/metrics/agent-efficiency/aht${qs(f)}`);
export const fetchCallsPerHour    = (f) => get(`${BASE}/api/metrics/agent-efficiency/calls-per-hour${qs(f)}`);
export const fetchUtilization     = (f) => get(`${BASE}/api/metrics/agent-efficiency/utilization${qs(f)}`);
export const fetchTimeInState     = (f) => get(`${BASE}/api/metrics/agent-efficiency/time-in-state${qs(f)}`);
export const fetchFCR             = (f) => get(`${BASE}/api/metrics/agent-efficiency/fcr${qs(f)}`);

// ── Group 2: Outbound & ANI Health ─────────────────────────────────────────
export const fetchPickupRate            = (f) => get(`${BASE}/api/metrics/outbound/pickup-rate${qs(f)}`);
export const fetchPickupRateByANI       = (f) => get(`${BASE}/api/metrics/outbound/pickup-rate-by-ani${qs(f)}`);
export const fetchDialAttemptsByANI     = (f) => get(`${BASE}/api/metrics/outbound/dial-attempts-by-ani${qs(f)}`);
export const fetchLiveVsNoAnswerByANI   = (f) => get(`${BASE}/api/metrics/outbound/live-vs-no-answer-by-ani${qs(f)}`);
export const fetchOutboundAbandonRate   = (f) => get(`${BASE}/api/metrics/outbound/abandon-rate${qs(f)}`);
export const fetchOutboundByCampaign    = (f) => get(`${BASE}/api/metrics/outbound/by-campaign${qs(f)}`);
export const fetchOutboundByCampaignType= (f) => get(`${BASE}/api/metrics/outbound/by-campaign-type${qs(f)}`);
export const fetchOutboundByANIAndCamp     = (f) => get(`${BASE}/api/metrics/outbound/by-ani-and-campaign${qs(f)}`);
export const fetchOutboundByANIAndCampaign = fetchOutboundByANIAndCamp; // alias used by OutboundTrackingTab

// ── Group 3: Inbound Queue ─────────────────────────────────────────────────
export const fetchMedianResponseTime    = (f) => get(`${BASE}/api/metrics/inbound/median-response-time${qs(f)}`);
export const fetchASA                   = (f) => get(`${BASE}/api/metrics/inbound/avg-speed-of-answer${qs(f)}`);
export const fetchServiceLevel          = (f, sla = 30) => get(`${BASE}/api/metrics/inbound/service-level${qs(f)}&targetSeconds=${sla}`);
export const fetchInboundAbandonRate    = (f) => get(`${BASE}/api/metrics/inbound/abandon-rate${qs(f)}`);
export const fetchVolumeByMktNumber     = (f) => get(`${BASE}/api/metrics/inbound/volume-by-marketing-number${qs(f)}`);
export const fetchAvgQueueWait          = (f) => get(`${BASE}/api/metrics/inbound/avg-queue-wait${qs(f)}`);
export const fetchLongestWait           = (f) => get(`${BASE}/api/metrics/inbound/longest-wait${qs(f)}`);

// ── Group 4: Dispositions & Outcomes ──────────────────────────────────────
export const fetchConversionRate        = (f) => get(`${BASE}/api/metrics/dispositions/conversion-rate${qs(f)}`);
export const fetchSaveRate              = (f) => get(`${BASE}/api/metrics/dispositions/save-rate${qs(f)}`);
export const fetchOutboundDispositions  = (f) => get(`${BASE}/api/metrics/dispositions/outbound-breakdown${qs(f)}`);
export const fetchInboundDispositions   = (f) => get(`${BASE}/api/metrics/dispositions/inbound-breakdown${qs(f)}`);
export const fetchTransferRate          = (f) => get(`${BASE}/api/metrics/dispositions/transfer-rate${qs(f)}`);

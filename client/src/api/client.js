const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

function qs(filters = {}) {
  const p = new URLSearchParams();
  if (filters.start) p.set("start", new Date(filters.start).toISOString());
  if (filters.end)   p.set("end",   new Date(filters.end).toISOString());
  return p.toString() ? `?${p}` : "";
}

const get = (url) => fetch(url).then((r) => r.json());

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

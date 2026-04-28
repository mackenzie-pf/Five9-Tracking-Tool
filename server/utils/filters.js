// server/utils/filters.js
// Single source of truth for all global query-param filtering.
// Swap the function body's data source for a SQL WHERE clause when moving to PostgreSQL.

/**
 * Filter a call array using the standard global query params supported by every endpoint:
 *   startDateTime / endDateTime  – exact datetime (ISO-8601 or JS date string)
 *   start / end                  – legacy aliases (same semantics)
 *   agent                        – agentId OR agentName (exact match)
 *   campaign                     – campaignName (exact match)
 *   ANI                          – ani field (exact match)
 *   disposition                  – disposition (exact match)
 *   direction                    – "inbound" | "outbound" (matches callType)
 *
 * All params are optional. Missing params = no filtering on that dimension.
 */
function applyGlobalFilters(calls, query = {}) {
  const {
    startDateTime, endDateTime,
    start, end,
    agent, campaign, ANI, disposition, direction,
  } = query;

  const startMs = startDateTime ? new Date(startDateTime).getTime()
                : start         ? new Date(start).getTime()
                :                 -Infinity;
  const endMs   = endDateTime   ? new Date(endDateTime).getTime()
                : end           ? new Date(end).getTime()
                :                 Infinity;

  return calls.filter(call => {
    const ts = new Date(call.timestamp).getTime();
    if (ts < startMs || ts > endMs)                                             return false;
    if (agent      && call.agentId !== agent && call.agentName !== agent)       return false;
    if (campaign   && call.campaignName !== campaign)                           return false;
    if (ANI        && call.ani !== ANI)                                         return false;
    if (disposition && call.disposition !== disposition)                        return false;
    if (direction  && call.callType !== direction)                              return false;
    return true;
  });
}

/**
 * Filter an agentSessions array using the subset of global params that apply to sessions:
 *   startDateTime / endDateTime / start / end  – matched against session.date (YYYY-MM-DD)
 *   agent                                       – agentId OR agentName
 */
function filterSessions(sessions, query = {}) {
  const {
    startDateTime, endDateTime,
    start, end,
    agent,
  } = query;

  const startDate = (startDateTime || start || "").slice(0, 10);
  const endDate   = (endDateTime   || end   || "").slice(0, 10);

  return sessions.filter(s => {
    if (startDate && s.date < startDate)                           return false;
    if (endDate   && s.date > endDate)                             return false;
    if (agent && s.agentId !== agent && s.agentName !== agent)     return false;
    return true;
  });
}

module.exports = { applyGlobalFilters, filterSessions };

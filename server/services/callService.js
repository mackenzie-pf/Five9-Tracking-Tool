/**
 * createCallService — factory that wraps raw data accessors with filter application.
 *
 * Routes call these methods instead of importing applyGlobalFilters themselves,
 * so the filter logic lives in one place and swapping the data source (mock → DB)
 * only requires changing what getCalls/getAgentSessions do.
 *
 * Usage in server.js:
 *   const { createCallService } = require("./services/callService");
 *   const callService = createCallService(getCalls, getAgentSessions);
 *   app.use("/api/metrics/agent-efficiency", require("./routes/agentEfficiency")(callService));
 */

const { applyGlobalFilters, filterSessions } = require("../utils/filters");

function createCallService(getCalls, getAgentSessions) {
  /** All calls after global date/direction/agent/campaign/ANI/disposition filters. */
  async function getFilteredCalls(query) {
    return applyGlobalFilters(await getCalls(), query);
  }

  /** Agent sessions filtered by date range and agent. */
  function getFilteredSessions(query) {
    return filterSessions(getAgentSessions(), query);
  }

  /** Both at once — the common case for agent efficiency routes. */
  async function resolve(query) {
    const calls    = await getFilteredCalls(query);
    const sessions = getFilteredSessions(query);
    return { calls, sessions };
  }

  return { getFilteredCalls, getFilteredSessions, resolve };
}

module.exports = { createCallService };

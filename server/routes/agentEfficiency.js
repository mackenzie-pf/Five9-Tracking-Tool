// server/routes/agentEfficiency.js
// Group 1: Agent Efficiency and State
//
// Factory function receives getCalls and getAgentSessions so this file
// has no direct data-source dependency — swap to DB queries without touching routes.
//
// Mount: app.use('/api/metrics/agent-efficiency', require('./routes/agentEfficiency')(getCalls, getAgentSessions))

const express = require("express");
const { applyGlobalFilters, filterSessions } = require("../utils/filters");
const kpi = require("../utils/kpiCalculators");

module.exports = function createAgentEfficiencyRouter(getCalls, getAgentSessions) {
  const router = express.Router();

  // Helper — resolve calls + sessions from data source then apply global filters
  async function resolve(req) {
    const calls    = applyGlobalFilters(await getCalls(), req.query);
    const sessions = filterSessions(getAgentSessions(), req.query);
    return { calls, sessions };
  }

  // ── GET /api/metrics/agent-efficiency/aht ─────────────────────────────────
  // Average Handle Time (talk + hold + wrap-up) overall and per agent.
  // Query params: all global filters
  router.get("/aht", async (req, res) => {
    try {
      const { calls } = await resolve(req);
      res.json(kpi.calcAHT(calls));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/agent-efficiency/calls-per-hour ─────────────────────
  // Calls handled per agent per logged-in hour (inbound and outbound split).
  // Query params: all global filters
  router.get("/calls-per-hour", async (req, res) => {
    try {
      const { calls, sessions } = await resolve(req);
      res.json(kpi.calcCallsPerAgentPerHour(calls, sessions));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/agent-efficiency/utilization ─────────────────────────
  // Agent utilization rate = active handling time / working time (logged-in minus breaks).
  // Query params: startDateTime, endDateTime, agent
  router.get("/utilization", async (req, res) => {
    try {
      const { sessions } = await resolve(req);
      res.json(kpi.calcUtilizationRate(sessions));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/agent-efficiency/time-in-state ──────────────────────
  // Seconds spent in available, on_call, on_hold, wrap_up, not_ready, on_break per agent.
  // Query params: startDateTime, endDateTime, agent
  router.get("/time-in-state", async (req, res) => {
    try {
      const { sessions } = await resolve(req);
      res.json(kpi.calcTimeInState(sessions));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/agent-efficiency/fcr ────────────────────────────────
  // First Contact Resolution rate (calls resolved without callback or transfer).
  // Query params: all global filters
  router.get("/fcr", async (req, res) => {
    try {
      const { calls } = await resolve(req);
      res.json(kpi.calcFCR(calls));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};

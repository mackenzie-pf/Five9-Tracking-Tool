// server/routes/inboundQueue.js
// Group 3: Inbound Queue Performance
//
// Mount: app.use('/api/metrics/inbound', require('./routes/inboundQueue')(getCalls))

const express = require("express");
const { applyGlobalFilters } = require("../utils/filters");
const kpi = require("../utils/kpiCalculators");

module.exports = function createInboundQueueRouter(getCalls) {
  const router = express.Router();

  async function getFiltered(req) {
    return applyGlobalFilters(await getCalls(), req.query);
  }

  // ── GET /api/metrics/inbound/median-response-time ─────────────────────────
  // Median queue wait time for answered inbound calls.
  // Query params: all global filters
  router.get("/median-response-time", async (req, res) => {
    try { res.json(kpi.calcMedianResponseTime(await getFiltered(req))); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/inbound/avg-speed-of-answer ─────────────────────────
  // Average Speed of Answer (ASA) for inbound calls actually picked up by an agent.
  router.get("/avg-speed-of-answer", async (req, res) => {
    try { res.json(kpi.calcAvgSpeedOfAnswer(await getFiltered(req))); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/inbound/service-level ────────────────────────────────
  // % of inbound calls answered within the target threshold.
  // Query param: targetSeconds (default 30). All global filters also supported.
  router.get("/service-level", async (req, res) => {
    try {
      const targetSeconds = parseInt(req.query.targetSeconds) || 30;
      res.json(kpi.calcServiceLevel(await getFiltered(req), targetSeconds));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/inbound/abandon-rate ─────────────────────────────────
  // Inbound abandonment rate (caller hung up before agent answered).
  router.get("/abandon-rate", async (req, res) => {
    try { res.json(kpi.calcInboundAbandonRate(await getFiltered(req))); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/inbound/volume-by-marketing-number ──────────────────
  // Inbound call volume and abandon rate grouped by the dialed marketing number.
  router.get("/volume-by-marketing-number", async (req, res) => {
    try { res.json(kpi.calcVolumeByMarketingNumber(await getFiltered(req))); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/inbound/avg-queue-wait ──────────────────────────────
  // Average time in queue before answer or abandon (all inbound queue entries).
  router.get("/avg-queue-wait", async (req, res) => {
    try { res.json(kpi.calcAvgQueueWait(await getFiltered(req))); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/inbound/longest-wait ────────────────────────────────
  // Single call with the longest queue wait in the filtered period.
  router.get("/longest-wait", async (req, res) => {
    try { res.json(kpi.calcLongestWait(await getFiltered(req))); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};

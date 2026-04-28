// server/routes/dispositions.js
// Group 4: Dispositions and Outcomes
//
// Mount: app.use('/api/metrics/dispositions', require('./routes/dispositions')(getCalls))

const express = require("express");
const { applyGlobalFilters } = require("../utils/filters");
const kpi = require("../utils/kpiCalculators");

module.exports = function createDispositionsRouter(getCalls) {
  const router = express.Router();

  async function getFiltered(req) {
    return applyGlobalFilters(await getCalls(), req.query);
  }

  // ── GET /api/metrics/dispositions/conversion-rate ─────────────────────────
  // Conversion rate for successful subscriptions from outbound calls.
  // Returns rate out of all dial attempts AND rate out of live-answer attempts.
  // Query params: all global filters
  router.get("/conversion-rate", async (req, res) => {
    try { res.json(kpi.calcConversionRate(await getFiltered(req))); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/dispositions/save-rate ───────────────────────────────
  // Save rate for cancellation / re-engagement calls that were retained.
  // Query params: all global filters
  router.get("/save-rate", async (req, res) => {
    try { res.json(kpi.calcSaveRate(await getFiltered(req))); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/dispositions/outbound-breakdown ─────────────────────
  // Outbound call dispositions: voicemail, no answer, not interested, appointment, etc.
  // Query params: all global filters
  router.get("/outbound-breakdown", async (req, res) => {
    try { res.json(kpi.calcOutboundDispositions(await getFiltered(req))); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/dispositions/inbound-breakdown ──────────────────────
  // Inbound support dispositions grouped into billing / scheduling / medical / general.
  // Query params: all global filters
  router.get("/inbound-breakdown", async (req, res) => {
    try { res.json(kpi.calcInboundDispositions(await getFiltered(req))); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/dispositions/transfer-rate ───────────────────────────
  // Transfer rate (any transfer) and clinical escalation rate.
  // Query params: all global filters
  router.get("/transfer-rate", async (req, res) => {
    try { res.json(kpi.calcTransferRate(await getFiltered(req))); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};

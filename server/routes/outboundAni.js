// server/routes/outboundAni.js
// Group 2: Outbound and ANI Health
//
// OUTBOUND CLASSIFICATION: Both ANI-based and campaign-based rules are already
// applied to each call's callType field before these routes see the data.
// No re-classification needed here — trust the enriched callType.
//
// Mount: app.use('/api/metrics/outbound', require('./routes/outboundAni')(getCalls, aniMeta, campaignMeta))

const express = require("express");
const { applyGlobalFilters } = require("../utils/filters");
const kpi = require("../utils/kpiCalculators");

module.exports = function createOutboundAniRouter(getCalls, aniMeta = [], campaignMeta = []) {
  const router = express.Router();

  async function getOutbound(req) {
    const all = await getCalls();
    return applyGlobalFilters(all, req.query);
  }

  // ── GET /api/metrics/outbound/pickup-rate ─────────────────────────────────
  // Overall pick-up rate across all outbound calls: live answers / dial attempts.
  // Query params: all global filters (direction="outbound" is implicit but overridable)
  router.get("/pickup-rate", async (req, res) => {
    try { res.json(kpi.calcOverallPickupRate(await getOutbound(req))); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/outbound/pickup-rate-by-ani ─────────────────────────
  // Pickup rate broken down per outbound caller ID (ANI).
  router.get("/pickup-rate-by-ani", async (req, res) => {
    try { res.json(kpi.calcPickupRateByANI(await getOutbound(req), aniMeta)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/outbound/dial-attempts-by-ani ───────────────────────
  // Total dial attempt count per ANI.
  router.get("/dial-attempts-by-ani", async (req, res) => {
    try { res.json(kpi.calcDialAttemptsByANI(await getOutbound(req), aniMeta)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/outbound/live-vs-no-answer-by-ani ───────────────────
  // Live answer vs no-answer vs voicemail volume per ANI.
  router.get("/live-vs-no-answer-by-ani", async (req, res) => {
    try { res.json(kpi.calcLiveVsNoAnswerByANI(await getOutbound(req), aniMeta)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/outbound/abandon-rate ────────────────────────────────
  // Outbound dialer abandon rate (connected but agent/dialer dropped immediately).
  router.get("/abandon-rate", async (req, res) => {
    try { res.json(kpi.calcOutboundAbandonRate(await getOutbound(req))); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/outbound/by-campaign ────────────────────────────────
  // Outbound calls grouped by campaign name with pickup rate and avg duration.
  router.get("/by-campaign", async (req, res) => {
    try { res.json(kpi.calcOutboundByCampaign(await getOutbound(req))); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/outbound/by-campaign-type ───────────────────────────
  // Outbound calls grouped by campaign dialer type (predictive, preview, progressive).
  router.get("/by-campaign-type", async (req, res) => {
    try { res.json(kpi.calcOutboundByCampaignType(await getOutbound(req), campaignMeta)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ── GET /api/metrics/outbound/by-ani-and-campaign ────────────────────────
  // Outbound calls grouped by ANI × campaign (cross-tab view for ANI health by campaign).
  router.get("/by-ani-and-campaign", async (req, res) => {
    try { res.json(kpi.calcOutboundByANIAndCampaign(await getOutbound(req), aniMeta)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
};

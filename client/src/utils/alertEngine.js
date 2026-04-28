import { THRESHOLDS, getLevel } from "../config/thresholds";

let _seq = 0;
const nextId = () => `alert_${++_seq}`;

function fmtSec(s) {
  if (!s && s !== 0) return "—";
  return `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;
}
function fmtPct(v) {
  return v != null ? `${Number(v).toFixed(1)}%` : "—";
}
function fmtMin(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}
function thr(key, lvl) {
  return THRESHOLDS[key]?.[lvl === "crit" ? "crit" : "warn"];
}

/**
 * Evaluates all KPI thresholds against a data bundle fetched from the API.
 * Returns an array of alert objects sorted CRITICAL first, then WARNING.
 *
 * Expected data shape:
 *   avgQueueWait     – fetchAvgQueueWait response
 *   longestWait      – fetchLongestWait response
 *   serviceLevel     – fetchServiceLevel response
 *   inboundAbandonRate – fetchInboundAbandonRate response
 *   pickupRate       – fetchPickupRate response
 *   aniHealth        – fetchPickupRateByANI response (array)
 *   outboundAbandonRate – fetchOutboundAbandonRate response
 *   utilization      – fetchUtilization response (array)
 *   aht              – fetchAHT response
 *   conversionRate   – fetchConversionRate response
 *   saveRate         – fetchSaveRate response
 */
export function evaluateAlerts(data = {}) {
  const alerts = [];

  function push(level, category, message, value, thresholdKey) {
    if (level === "ok") return;
    alerts.push({
      id:        nextId(),
      level:     level === "crit" ? "CRITICAL" : "WARNING",
      category,
      message,
      value,
      threshold: THRESHOLDS[thresholdKey] ?? null,
    });
  }

  // ── 1. Queue: average wait time ────────────────────────────────────────────
  const avgWait = data.avgQueueWait?.avgWaitAnswered ?? data.avgQueueWait?.avgWaitAll ?? null;
  if (avgWait != null) {
    const lvl = getLevel("avgQueueWaitSeconds", avgWait);
    push(lvl, "Queue",
      `Average queue wait is ${fmtSec(avgWait)} — exceeds the ${fmtSec(thr("avgQueueWaitSeconds", lvl))} threshold. Consider adding capacity or adjusting routing rules.`,
      avgWait, "avgQueueWaitSeconds");
  }

  // ── 2. Queue: longest single wait ──────────────────────────────────────────
  const longest = data.longestWait?.longestWaitSeconds ?? null;
  if (longest != null) {
    const lvl = getLevel("longestWaitSeconds", longest);
    push(lvl, "Queue",
      `Longest caller wait was ${fmtSec(longest)} — exceeds the ${fmtSec(thr("longestWaitSeconds", lvl))} threshold. One or more callers experienced extreme hold times.`,
      longest, "longestWaitSeconds");
  }

  // ── 3. Queue: service level ────────────────────────────────────────────────
  const slPct = data.serviceLevel?.pct ?? null;
  if (slPct != null) {
    const lvl = getLevel("serviceLevel", slPct);
    push(lvl, "Queue",
      `Service level is ${fmtPct(slPct)} — below the ${thr("serviceLevel", lvl)}% target. Too many callers waiting beyond ${data.serviceLevel?.targetSeconds ?? 30}s threshold.`,
      slPct, "serviceLevel");
  }

  // ── 4. Queue: inbound abandon rate ─────────────────────────────────────────
  const ibAbandon = data.inboundAbandonRate?.abandonRate ?? null;
  if (ibAbandon != null) {
    const lvl = getLevel("inboundAbandonRate", ibAbandon);
    push(lvl, "Queue",
      `Inbound abandon rate is ${fmtPct(ibAbandon)} — ${data.inboundAbandonRate?.abandoned ?? 0} callers hung up before reaching an agent. Exceeds ${thr("inboundAbandonRate", lvl)}% threshold.`,
      ibAbandon, "inboundAbandonRate");
  }

  // ── 5. Outbound: overall pickup rate ───────────────────────────────────────
  const pickupPct = data.pickupRate?.pickupRate ?? null;
  if (pickupPct != null) {
    const lvl = getLevel("pickupRateOverall", pickupPct);
    push(lvl, "Outbound",
      `Overall outbound pickup rate is ${fmtPct(pickupPct)} — below the ${thr("pickupRateOverall", lvl)}% target. Prospects may not be answering; review calling hours and ANI health.`,
      pickupPct, "pickupRateOverall");
  }

  // ── 6. Outbound: per-ANI pickup rate ───────────────────────────────────────
  if (Array.isArray(data.aniHealth)) {
    for (const ani of data.aniHealth) {
      if (!ani.dials || ani.dials < 5) continue;
      const lvl = getLevel("pickupRatePerANI", ani.pickupRate);
      if (lvl === "ok") continue;
      push(lvl, "ANI",
        `ANI ${ani.ani} pickup rate is ${fmtPct(ani.pickupRate)} across ${ani.dials} dials. ${
          lvl === "crit"
            ? "Likely spam-flagged — rotate or rest this number immediately."
            : `Monitor for spam flagging; below the ${thr("pickupRatePerANI", lvl)}% healthy threshold.`}`,
        ani.pickupRate, "pickupRatePerANI");
    }
  }

  // ── 7. Outbound: abandon rate ──────────────────────────────────────────────
  const obAbandon = data.outboundAbandonRate?.abandonRate ?? null;
  if (obAbandon != null) {
    const lvl = getLevel("outboundAbandonRate", obAbandon);
    push(lvl, "Outbound",
      `Outbound abandon rate is ${fmtPct(obAbandon)} — dialer may be dropping calls before agents connect. Exceeds ${thr("outboundAbandonRate", lvl)}% threshold.`,
      obAbandon, "outboundAbandonRate");
  }

  // ── 8 & 9. Agent: utilization + idle time (per agent) ─────────────────────
  if (Array.isArray(data.utilization)) {
    for (const agent of data.utilization) {
      const rate = agent.utilizationRate ?? null;
      const u    = agent.utilization;
      if (!u?.loggedIn) continue;

      // Utilization too low
      if (rate != null) {
        const lvl = getLevel("utilizationRate", rate);
        if (lvl !== "ok") {
          push(lvl, "Agent",
            `${agent.agentName} utilization is ${fmtPct(rate)} — below the ${thr("utilizationRate", lvl)}% floor. Agent may be idle, unavailable, or under-scheduled.`,
            rate, "utilizationRate");
        }
      }

      // Idle time too high (available + not_ready proportion)
      const idleSec = (u.available ?? 0) + (u.not_ready ?? 0);
      const idlePct = (idleSec / u.loggedIn) * 100;
      const idleLvl = getLevel("idleTimePct", idlePct);
      if (idleLvl !== "ok") {
        push(idleLvl, "Agent",
          `${agent.agentName} spent ${fmtPct(idlePct)} of their shift in available/not-ready state (${fmtMin(idleSec)}). Possible scheduling or workload imbalance.`,
          idlePct, "idleTimePct");
      }
    }
  }

  // ── 10. Agent: wrap-up time (per agent) ────────────────────────────────────
  if (Array.isArray(data.aht?.byAgent)) {
    for (const agent of data.aht.byAgent) {
      if (!agent.calls || agent.calls < 3) continue;
      const wu = agent.avgWrapUp ?? null;
      if (wu == null) continue;
      const lvl = getLevel("wrapUpTimeSeconds", wu);
      if (lvl !== "ok") {
        push(lvl, "Agent",
          `${agent.agentName} avg wrap-up time is ${fmtSec(wu)} — exceeds the ${fmtSec(thr("wrapUpTimeSeconds", lvl))} target. May indicate inefficient after-call work processes.`,
          wu, "wrapUpTimeSeconds");
      }
    }
  }

  // ── 11. Agent: overall AHT ────────────────────────────────────────────────
  if (Array.isArray(data.aht?.byAgent)) {
    for (const agent of data.aht.byAgent) {
      if (!agent.calls || agent.calls < 3) continue;
      const aht = agent.avgAHT ?? null;
      if (aht == null) continue;
      const lvl = getLevel("ahtSeconds", aht);
      if (lvl !== "ok") {
        push(lvl, "Agent",
          `${agent.agentName} avg handle time is ${fmtSec(aht)} — exceeds the ${fmtSec(thr("ahtSeconds", lvl))} target. Review call complexity or agent efficiency.`,
          aht, "ahtSeconds");
      }
    }
  }

  // ── 12. Outcomes: conversion rate ──────────────────────────────────────────
  const convRate = data.conversionRate?.overall?.conversionRateOfAttempts ?? null;
  if (convRate != null) {
    const lvl = getLevel("conversionRate", convRate);
    push(lvl, "Outcomes",
      `Outbound conversion rate is ${fmtPct(convRate)} — below the ${thr("conversionRate", lvl)}% target. Review scripts, call timing, and campaign targeting.`,
      convRate, "conversionRate");
  }

  // ── 13. Outcomes: save rate ────────────────────────────────────────────────
  const sr = data.saveRate?.saveRate ?? null;
  if (sr != null) {
    const lvl = getLevel("saveRate", sr);
    push(lvl, "Outcomes",
      `Retention save rate is ${fmtPct(sr)} — below the ${thr("saveRate", lvl)}% target. Cancellation prevention calls may need coaching or script updates.`,
      sr, "saveRate");
  }

  // Sort: CRITICAL first, then WARNING
  return alerts.sort((a, b) =>
    a.level === b.level ? 0 : a.level === "CRITICAL" ? -1 : 1
  );
}

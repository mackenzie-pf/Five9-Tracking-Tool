// server/utils/kpiCalculators.js
// Pure KPI calculation functions — no Express, no I/O, no side-effects.
// Input: filtered arrays of calls or agentSessions (already enriched with callType).
// Output: plain JS objects / arrays ready to be serialised as JSON.
//
// Every function is standalone; swap the arrays for DB query results and nothing here changes.
//
// ── HOW OUTBOUND CALLS ARE CLASSIFIED ─────────────────────────────────────────
// By the time calls reach any function in this file, each call already has a
// `callType` field set to "inbound" | "outbound" (set by enrichCall() in server.js).
//
// The dual-rule classification in server.js classifyCall():
//   Rule 1: call.five9Type === "outbound" (from Five9 CSV "Call Type" column)
//   Rule 2: campaign name appears in the Five9 config campaign-type map (fetched via API)
//   Rule 3: call.ani is in the OUTBOUND_ANI_SET (configured outbound ANIs from mockData)
//   Rule 4: campaign name is in OUTBOUND_CAMPAIGN_SET (campaigns flagged type:"outbound")
//   Rule 5: campaign name contains "outbound" (heuristic fallback for unlabelled campaigns)
//
// WHY the dual-rule approach exists:
//   Five9's native CALL TYPE field reports manually-dialled calls as "INBOUND" or blank.
//   Without ANI/campaign-name checks, ~30% of outbound calls would be miscategorised as
//   inbound, skewing pickup rates, abandon rates, and agent efficiency metrics.
//
// Do NOT filter on `call.five9Type` here. Always use `call.callType`.
// ──────────────────────────────────────────────────────────────────────────────

// ── Shared helpers ─────────────────────────────────────────────────────────

function sum(arr) { return arr.reduce((s, n) => s + n, 0); }

function avg(arr) { return arr.length ? sum(arr) / arr.length : 0; }

function median(sorted) {
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// pct(3, 10) → 30.00  (2 decimal places)
function pct(num, den) {
  if (!den) return 0;
  return parseFloat(((num / den) * 100).toFixed(2));
}

function r(n, decimals = 0) {
  return parseFloat(n.toFixed(decimals));
}

// ══════════════════════════════════════════════════════════════════════════════
//  GROUP 1: AGENT EFFICIENCY AND STATE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Average Handle Time (AHT) = talkTime + holdTime + wrapUpTime.
 * Returns overall KPIs plus a per-agent breakdown.
 */
function calcAHT(calls) {
  const handled = calls.filter(c => !c.abandoned && c.agentId);
  const byAgent = {};

  for (const call of handled) {
    const handle = (call.talkTimeSeconds || 0) + (call.holdTimeSeconds || 0) + (call.wrapUpTimeSeconds || 0);
    if (!byAgent[call.agentId]) {
      byAgent[call.agentId] = {
        agentId: call.agentId, agentName: call.agentName,
        count: 0, totalHandle: 0,
        inboundCount: 0, inboundHandle: 0,
        outboundCount: 0, outboundHandle: 0,
        totalTalk: 0, totalHold: 0, totalWrapUp: 0,
      };
    }
    const a = byAgent[call.agentId];
    a.count++;
    a.totalHandle += handle;
    a.totalTalk   += call.talkTimeSeconds  || 0;
    a.totalHold   += call.holdTimeSeconds  || 0;
    a.totalWrapUp += call.wrapUpTimeSeconds || 0;
    if (call.callType === "inbound")  { a.inboundCount++;  a.inboundHandle  += handle; }
    if (call.callType === "outbound") { a.outboundCount++; a.outboundHandle += handle; }
  }

  const agentRows = Object.values(byAgent).map(a => ({
    agentId:              a.agentId,
    agentName:            a.agentName,
    callCount:            a.count,
    avgHandleTimeSeconds: a.count ? r(a.totalHandle  / a.count) : 0,
    avgTalkTimeSeconds:   a.count ? r(a.totalTalk    / a.count) : 0,
    avgHoldTimeSeconds:   a.count ? r(a.totalHold    / a.count) : 0,
    avgWrapUpTimeSeconds: a.count ? r(a.totalWrapUp  / a.count) : 0,
    avgInboundAHT:        a.inboundCount  ? r(a.inboundHandle  / a.inboundCount)  : 0,
    avgOutboundAHT:       a.outboundCount ? r(a.outboundHandle / a.outboundCount) : 0,
  })).sort((a, b) => b.avgHandleTimeSeconds - a.avgHandleTimeSeconds);

  const totHandle = sum(handled.map(c => (c.talkTimeSeconds || 0) + (c.holdTimeSeconds || 0) + (c.wrapUpTimeSeconds || 0)));
  const overall = {
    callCount:            handled.length,
    avgHandleTimeSeconds: handled.length ? r(totHandle / handled.length) : 0,
    avgTalkTimeSeconds:   handled.length ? r(sum(handled.map(c => c.talkTimeSeconds  || 0)) / handled.length) : 0,
    avgHoldTimeSeconds:   handled.length ? r(sum(handled.map(c => c.holdTimeSeconds  || 0)) / handled.length) : 0,
    avgWrapUpTimeSeconds: handled.length ? r(sum(handled.map(c => c.wrapUpTimeSeconds || 0)) / handled.length) : 0,
  };

  return { overall, byAgent: agentRows };
}

/**
 * Calls handled per agent per hour, split by inbound / outbound.
 * Requires agentSessions to determine logged-in hours in the filtered period.
 */
function calcCallsPerAgentPerHour(calls, sessions) {
  const handled = calls.filter(c => !c.abandoned && c.agentId);

  // Map agentId → logged-in seconds from sessions
  const loggedIn = {};
  for (const s of sessions) {
    loggedIn[s.agentId] = (loggedIn[s.agentId] || 0) + s.loggedInSeconds;
  }

  const byAgent = {};
  for (const call of handled) {
    if (!byAgent[call.agentId]) {
      byAgent[call.agentId] = { agentId: call.agentId, agentName: call.agentName, total: 0, inbound: 0, outbound: 0 };
    }
    byAgent[call.agentId].total++;
    if (call.callType === "inbound")  byAgent[call.agentId].inbound++;
    if (call.callType === "outbound") byAgent[call.agentId].outbound++;
  }

  return Object.values(byAgent).map(a => {
    const loggedInHours = ((loggedIn[a.agentId] || 0) / 3600) || 1; // avoid ÷0
    return {
      agentId:             a.agentId,
      agentName:           a.agentName,
      loggedInHours:       r(loggedInHours, 2),
      callsPerHour:        r(a.total    / loggedInHours, 2),
      inboundPerHour:      r(a.inbound  / loggedInHours, 2),
      outboundPerHour:     r(a.outbound / loggedInHours, 2),
      totalCalls:          a.total,
      totalInbound:        a.inbound,
      totalOutbound:       a.outbound,
    };
  }).sort((a, b) => b.callsPerHour - a.callsPerHour);
}

/**
 * Agent utilization rate = (on_call + on_hold + wrap_up) / (loggedIn − on_break).
 * "Active handling time" divided by "available working time".
 */
function calcUtilizationRate(sessions) {
  const byAgent = {};
  for (const s of sessions) {
    if (!byAgent[s.agentId]) {
      byAgent[s.agentId] = { agentId: s.agentId, agentName: s.agentName, loggedIn: 0, active: 0, break: 0 };
    }
    const a = byAgent[s.agentId];
    const ss = s.stateSeconds;
    a.loggedIn += s.loggedInSeconds;
    a.active   += (ss.on_call || 0) + (ss.on_hold || 0) + (ss.wrap_up || 0);
    a.break    += ss.on_break || 0;
  }

  return Object.values(byAgent).map(a => {
    const workingSeconds = a.loggedIn - a.break;
    return {
      agentId:              a.agentId,
      agentName:            a.agentName,
      loggedInSeconds:      a.loggedIn,
      activeHandlingSeconds: a.active,
      breakSeconds:         a.break,
      workingSeconds:       workingSeconds,
      utilizationRate:      pct(a.active, workingSeconds),
    };
  }).sort((a, b) => b.utilizationRate - a.utilizationRate);
}

/**
 * Time in each state per agent, summed across all sessions in range.
 * States: available, on_call, on_hold, wrap_up, not_ready, on_break
 */
function calcTimeInState(sessions) {
  const byAgent = {};
  for (const s of sessions) {
    if (!byAgent[s.agentId]) {
      byAgent[s.agentId] = {
        agentId: s.agentId, agentName: s.agentName,
        loggedInSeconds: 0,
        stateSeconds: { available:0, on_call:0, on_hold:0, wrap_up:0, not_ready:0, on_break:0 },
      };
    }
    const a = byAgent[s.agentId];
    a.loggedInSeconds += s.loggedInSeconds;
    for (const [k, v] of Object.entries(s.stateSeconds)) {
      a.stateSeconds[k] = (a.stateSeconds[k] || 0) + (v || 0);
    }
  }

  return Object.values(byAgent).map(a => ({
    agentId:         a.agentId,
    agentName:       a.agentName,
    loggedInSeconds: a.loggedInSeconds,
    stateSeconds:    a.stateSeconds,
    statePct: Object.fromEntries(
      Object.entries(a.stateSeconds).map(([k, v]) => [k, pct(v, a.loggedInSeconds)])
    ),
  }));
}

/**
 * First Contact Resolution rate.
 * FCR = calls resolved without callback or transfer / total handled calls.
 * Non-FCR dispositions: "Callback Requested", "Transferred to Nurse", "Disconnected", "Abandoned"
 */
const NON_FCR_DISPOSITIONS = new Set(["Callback Requested", "Transferred to Nurse", "Disconnected", "Abandoned"]);

function calcFCR(calls) {
  const handled = calls.filter(c => !c.abandoned && c.agentId);
  const resolved = handled.filter(c => !NON_FCR_DISPOSITIONS.has(c.disposition));

  const byAgent = {};
  for (const call of handled) {
    if (!byAgent[call.agentId]) {
      byAgent[call.agentId] = { agentId: call.agentId, agentName: call.agentName, total: 0, resolved: 0 };
    }
    byAgent[call.agentId].total++;
    if (!NON_FCR_DISPOSITIONS.has(call.disposition)) byAgent[call.agentId].resolved++;
  }

  return {
    overall: {
      totalHandled: handled.length,
      resolved:     resolved.length,
      fcrRate:      pct(resolved.length, handled.length),
    },
    byAgent: Object.values(byAgent).map(a => ({
      agentId:   a.agentId,
      agentName: a.agentName,
      total:     a.total,
      resolved:  a.resolved,
      fcrRate:   pct(a.resolved, a.total),
    })).sort((a, b) => b.fcrRate - a.fcrRate),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  GROUP 2: OUTBOUND & ANI HEALTH
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Overall outbound pickup rate.
 * pickupFlag = true → live answer; false → no answer / voicemail; null = inbound (excluded).
 */
function calcOverallPickupRate(calls) {
  const outbound      = calls.filter(c => c.callType === "outbound");
  const dialAttempts  = outbound.length;
  const liveAnswers   = outbound.filter(c => c.pickupFlag === true).length;
  const noAnswer      = outbound.filter(c => c.disposition === "No Answer").length;
  const voicemail     = outbound.filter(c => c.disposition === "Voicemail Left").length;
  const wrongPerson   = outbound.filter(c => c.disposition === "Wrong Number").length;
  const notInterested = outbound.filter(c => c.disposition === "Not Interested").length;
  const alreadyPatient= outbound.filter(c => c.disposition === "Already a Patient").length;

  return {
    dialAttempts,
    liveAnswers,
    noAnswer,
    voicemail,
    wrongPerson,
    notInterested,
    alreadyPatient,
    pickupRate: pct(liveAnswers, dialAttempts),
  };
}

/**
 * Pickup rate grouped by ANI.
 * aniMeta: array of { number, label } from outboundANIs for labelling.
 */
function calcPickupRateByANI(calls, aniMeta = []) {
  const labelMap = new Map(aniMeta.map(a => [a.number, a.label]));
  const outbound  = calls.filter(c => c.callType === "outbound");
  const byAni     = {};

  for (const call of outbound) {
    const key = call.ani || "Manual Dial";
    if (!byAni[key]) {
      byAni[key] = {
        ani:   key,
        label: labelMap.get(key) || key,
        dialAttempts: 0, liveAnswers: 0, noAnswer: 0, voicemail: 0,
      };
    }
    byAni[key].dialAttempts++;
    if (call.pickupFlag === true)                        byAni[key].liveAnswers++;
    if (call.disposition === "No Answer")                byAni[key].noAnswer++;
    if (call.disposition === "Voicemail Left")           byAni[key].voicemail++;
  }

  return Object.values(byAni).map(a => ({
    ...a,
    pickupRate: pct(a.liveAnswers, a.dialAttempts),
  })).sort((a, b) => b.dialAttempts - a.dialAttempts);
}

/**
 * Total dial attempts per ANI.
 */
function calcDialAttemptsByANI(calls, aniMeta = []) {
  return calcPickupRateByANI(calls, aniMeta).map(({ ani, label, dialAttempts }) => ({ ani, label, dialAttempts }));
}

/**
 * Live answer vs no-answer volume per ANI.
 */
function calcLiveVsNoAnswerByANI(calls, aniMeta = []) {
  return calcPickupRateByANI(calls, aniMeta).map(({ ani, label, liveAnswers, noAnswer, voicemail }) => ({
    ani, label, liveAnswers, noAnswer, voicemail,
  }));
}

/**
 * Outbound dialer abandon rate.
 * An outbound abandoned call is one the dialer connected but no agent took
 * (or agent hung up immediately). Identified by: abandoned === true AND callType === "outbound",
 * OR (pickupFlag === true AND duration < 5).
 */
function calcOutboundAbandonRate(calls) {
  const outbound  = calls.filter(c => c.callType === "outbound");
  const abandoned = outbound.filter(c => c.abandoned || (c.pickupFlag && (c.duration || 0) < 5));
  return {
    totalOutbound: outbound.length,
    abandoned:     abandoned.length,
    abandonRate:   pct(abandoned.length, outbound.length),
  };
}

/**
 * Outbound calls grouped by campaign name.
 */
function calcOutboundByCampaign(calls) {
  const outbound = calls.filter(c => c.callType === "outbound");
  const byCamp   = {};
  for (const call of outbound) {
    const k = call.campaignName || "Unknown";
    if (!byCamp[k]) byCamp[k] = { campaignName: k, campaignType: call.campaignType || "outbound", count: 0, liveAnswers: 0, totalDuration: 0 };
    byCamp[k].count++;
    byCamp[k].totalDuration += call.duration || 0;
    if (call.pickupFlag) byCamp[k].liveAnswers++;
  }
  return Object.values(byCamp).map(g => ({
    ...g,
    avgDuration: g.count ? r(g.totalDuration / g.count) : 0,
    pickupRate:  pct(g.liveAnswers, g.count),
  })).sort((a, b) => b.count - a.count);
}

/**
 * Outbound calls grouped by campaign type (e.g., "predictive", "preview", "progressive").
 */
function calcOutboundByCampaignType(calls, campaignMeta = []) {
  const dialerMap = new Map(campaignMeta.map(c => [c.name, c.dialerType]));
  const outbound  = calls.filter(c => c.callType === "outbound");
  const byType    = {};

  for (const call of outbound) {
    const key = dialerMap.get(call.campaignName) || "unknown";
    if (!byType[key]) byType[key] = { dialerType: key, count: 0, liveAnswers: 0, totalDuration: 0 };
    byType[key].count++;
    byType[key].totalDuration += call.duration || 0;
    if (call.pickupFlag) byType[key].liveAnswers++;
  }

  return Object.values(byType).map(g => ({
    ...g,
    avgDuration: g.count ? r(g.totalDuration / g.count) : 0,
    pickupRate:  pct(g.liveAnswers, g.count),
  })).sort((a, b) => b.count - a.count);
}

/**
 * Outbound calls grouped by ANI + campaign together.
 */
function calcOutboundByANIAndCampaign(calls, aniMeta = []) {
  const labelMap = new Map(aniMeta.map(a => [a.number, a.label]));
  const outbound  = calls.filter(c => c.callType === "outbound");
  const byKey     = {};

  for (const call of outbound) {
    const ani      = call.ani || "Manual Dial";
    const campaign = call.campaignName || "Unknown";
    const key      = `${ani}__${campaign}`;
    if (!byKey[key]) {
      byKey[key] = {
        ani,
        aniLabel:     labelMap.get(ani) || ani,
        campaignName: campaign,
        count:        0,
        liveAnswers:  0,
      };
    }
    byKey[key].count++;
    if (call.pickupFlag) byKey[key].liveAnswers++;
  }

  return Object.values(byKey).map(g => ({
    ...g,
    pickupRate: pct(g.liveAnswers, g.count),
  })).sort((a, b) => b.count - a.count);
}

// ══════════════════════════════════════════════════════════════════════════════
//  GROUP 3: INBOUND QUEUE PERFORMANCE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Median time in queue before answer (excludes abandoned and outbound).
 */
function calcMedianResponseTime(calls) {
  const inboundAnswered = calls
    .filter(c => c.callType === "inbound" && !c.abandoned && c.queueWaitSeconds != null)
    .map(c => c.queueWaitSeconds)
    .sort((a, b) => a - b);

  return {
    medianQueueWaitSeconds: r(median(inboundAnswered), 1),
    sampleSize:             inboundAnswered.length,
  };
}

/**
 * Average Speed of Answer (ASA) = average queue wait for answered inbound calls.
 */
function calcAvgSpeedOfAnswer(calls) {
  const answered = calls.filter(
    c => c.callType === "inbound" && !c.abandoned && c.queueWaitSeconds != null
  );
  const waits = answered.map(c => c.queueWaitSeconds);
  return {
    avgSpeedOfAnswerSeconds: r(avg(waits), 1),
    sampleSize:              answered.length,
  };
}

/**
 * Service level = % of inbound calls answered within targetSeconds (default 30 s).
 */
function calcServiceLevel(calls, targetSeconds = 30) {
  const inbound   = calls.filter(c => c.callType === "inbound" && !c.abandoned);
  const withinSLA = inbound.filter(c => (c.queueWaitSeconds || 0) <= targetSeconds);
  return {
    targetSeconds,
    total:               inbound.length,
    answeredWithinTarget: withinSLA.length,
    serviceLevelPct:     pct(withinSLA.length, inbound.length),
  };
}

/**
 * Inbound abandonment rate = abandoned inbound / total inbound attempts.
 */
function calcInboundAbandonRate(calls) {
  const inbound  = calls.filter(c => c.callType === "inbound");
  const abandoned = inbound.filter(c => c.abandoned);
  const avgWait   = abandoned.length
    ? r(avg(abandoned.map(c => c.queueWaitSeconds || 0)), 1)
    : 0;
  return {
    totalInbound:  inbound.length,
    abandoned:     abandoned.length,
    answered:      inbound.length - abandoned.length,
    abandonRate:   pct(abandoned.length, inbound.length),
    avgAbandonWaitSeconds: avgWait,
  };
}

/**
 * Inbound call volume grouped by the marketing number the customer dialed (DNIS).
 */
function calcVolumeByMarketingNumber(calls) {
  const inbound = calls.filter(c => c.callType === "inbound");
  const byNum   = {};
  for (const call of inbound) {
    const key = call.dialedMarketingNumber || call.dnis || "Unknown";
    if (!byNum[key]) byNum[key] = { marketingNumber: key, total: 0, answered: 0, abandoned: 0 };
    byNum[key].total++;
    if (call.abandoned) byNum[key].abandoned++;
    else                byNum[key].answered++;
  }
  return Object.values(byNum).map(g => ({
    ...g,
    abandonRate: pct(g.abandoned, g.total),
  })).sort((a, b) => b.total - a.total);
}

/**
 * Average time in queue before answer or abandon (all inbound queue entries).
 */
function calcAvgQueueWait(calls) {
  const withWait = calls.filter(c => c.callType === "inbound" && c.queueWaitSeconds != null);
  const answered = withWait.filter(c => !c.abandoned);
  const abandoned = withWait.filter(c => c.abandoned);
  return {
    avgQueueWaitSecondsAll:      r(avg(withWait.map(c => c.queueWaitSeconds)), 1),
    avgQueueWaitSecondsAnswered: r(avg(answered.map(c => c.queueWaitSeconds)), 1),
    avgQueueWaitSecondsAbandoned:r(avg(abandoned.map(c => c.queueWaitSeconds)), 1),
    sampleSize:                  withWait.length,
  };
}

/**
 * Longest queue wait time across all inbound calls (answered or abandoned).
 */
function calcLongestWait(calls) {
  const inbound = calls.filter(c => c.callType === "inbound" && c.queueWaitSeconds != null);
  if (!inbound.length) return { longestWaitSeconds: 0, callId: null, timestamp: null, abandoned: null };
  const worst = inbound.reduce((best, c) => c.queueWaitSeconds > best.queueWaitSeconds ? c : best);
  return {
    longestWaitSeconds: worst.queueWaitSeconds,
    callId:             worst.id,
    timestamp:          worst.timestamp,
    agentName:          worst.agentName || null,
    abandoned:          worst.abandoned,
    campaignName:       worst.campaignName,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  GROUP 4: DISPOSITIONS AND OUTCOMES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Conversion rate for outbound new-subscription attempts.
 * conversionFlag === true means the call resulted in a subscription/appointment.
 */
function calcConversionRate(calls) {
  const outbound    = calls.filter(c => c.callType === "outbound");
  const converted   = outbound.filter(c => c.conversionFlag);
  const liveAnswers = outbound.filter(c => c.pickupFlag);

  const byAgent = {};
  for (const call of outbound) {
    if (!call.agentId) continue;
    if (!byAgent[call.agentId]) {
      byAgent[call.agentId] = { agentId: call.agentId, agentName: call.agentName, attempts: 0, conversions: 0, liveAnswers: 0 };
    }
    byAgent[call.agentId].attempts++;
    if (call.conversionFlag) byAgent[call.agentId].conversions++;
    if (call.pickupFlag)     byAgent[call.agentId].liveAnswers++;
  }

  return {
    overall: {
      outboundAttempts: outbound.length,
      liveAnswers:      liveAnswers.length,
      conversions:      converted.length,
      // Rate out of dial attempts
      conversionRateOfAttempts: pct(converted.length, outbound.length),
      // Rate out of live answers (calls where prospect actually picked up)
      conversionRateOfAnswers:  pct(converted.length, liveAnswers.length),
    },
    byAgent: Object.values(byAgent).map(a => ({
      ...a,
      conversionRateOfAttempts: pct(a.conversions, a.attempts),
      conversionRateOfAnswers:  pct(a.conversions, a.liveAnswers),
    })).sort((a, b) => b.conversions - a.conversions),
  };
}

/**
 * Save rate for cancellation/re-engagement calls that were retained.
 * saveFlag === true means the customer was kept.
 */
function calcSaveRate(calls) {
  // "Retention-type" calls: Re-engagement campaign OR disposition already set saveFlag
  const retentionCalls = calls.filter(c =>
    c.saveFlag ||
    (c.callType === "outbound" &&
      (c.campaignName === "Re-engagement Campaign" || c.disposition === "Already a Patient"))
  );
  const saved = retentionCalls.filter(c => c.saveFlag);

  return {
    retentionAttempts: retentionCalls.length,
    saved:             saved.length,
    saveRate:          pct(saved.length, retentionCalls.length),
  };
}

/**
 * Outbound disposition breakdown: voicemail, invalid number, wrong person, no answer, etc.
 */
function calcOutboundDispositions(calls) {
  const outbound = calls.filter(c => c.callType === "outbound");
  const byDisp   = {};
  for (const call of outbound) {
    const d = call.disposition || "Unknown";
    byDisp[d] = (byDisp[d] || 0) + 1;
  }
  const total = outbound.length;
  return Object.entries(byDisp)
    .map(([disposition, count]) => ({ disposition, count, pct: pct(count, total) }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Inbound support disposition breakdown, categorised into billing / scheduling / medical / general.
 */
const INBOUND_CATEGORIES = {
  billing:    /billing|invoice|payment/i,
  scheduling: /appointment|schedul/i,
  medical:    /medical|nurse|clinical/i,
};

function categoriseInboundDisposition(disposition) {
  for (const [cat, re] of Object.entries(INBOUND_CATEGORIES)) {
    if (re.test(disposition)) return cat;
  }
  return "general";
}

function calcInboundDispositions(calls) {
  const inbound    = calls.filter(c => c.callType === "inbound" && !c.abandoned);
  const byDisp     = {};
  const categories = { billing: 0, scheduling: 0, medical: 0, general: 0 };

  for (const call of inbound) {
    const d   = call.disposition || "Unknown";
    const cat = categoriseInboundDisposition(d);
    byDisp[d]    = (byDisp[d]    || 0) + 1;
    categories[cat]++;
  }

  const total = inbound.length;
  return {
    total,
    categories,
    categoryPct: Object.fromEntries(
      Object.entries(categories).map(([k, v]) => [k, pct(v, total)])
    ),
    breakdown: Object.entries(byDisp)
      .map(([disposition, count]) => ({
        disposition,
        count,
        pct:      pct(count, total),
        category: categoriseInboundDisposition(disposition),
      }))
      .sort((a, b) => b.count - a.count),
  };
}

/**
 * Transfer rate (any transfer) and clinical escalation rate.
 */
function calcTransferRate(calls) {
  const handled   = calls.filter(c => !c.abandoned && c.agentId);
  const transfers = handled.filter(c => c.transferred);
  const clinical  = handled.filter(c => c.escalatedToClinical);

  return {
    totalHandled:       handled.length,
    transfers:          transfers.length,
    escalatedToClinical: clinical.length,
    transferRate:       pct(transfers.length, handled.length),
    escalationRate:     pct(clinical.length,  handled.length),
  };
}

// ── Exports ────────────────────────────────────────────────────────────────
module.exports = {
  // Group 1
  calcAHT,
  calcCallsPerAgentPerHour,
  calcUtilizationRate,
  calcTimeInState,
  calcFCR,
  // Group 2
  calcOverallPickupRate,
  calcPickupRateByANI,
  calcDialAttemptsByANI,
  calcLiveVsNoAnswerByANI,
  calcOutboundAbandonRate,
  calcOutboundByCampaign,
  calcOutboundByCampaignType,
  calcOutboundByANIAndCampaign,
  // Group 3
  calcMedianResponseTime,
  calcAvgSpeedOfAnswer,
  calcServiceLevel,
  calcInboundAbandonRate,
  calcVolumeByMarketingNumber,
  calcAvgQueueWait,
  calcLongestWait,
  // Group 4
  calcConversionRate,
  calcSaveRate,
  calcOutboundDispositions,
  calcInboundDispositions,
  calcTransferRate,
};

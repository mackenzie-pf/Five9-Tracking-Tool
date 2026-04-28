import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  fetchSummary,
  fetchTimeline,
  fetchCalls,
  fetchCallsByAgent,
  fetchCallsByDisp,
  fetchAHT,
  fetchCallsPerHour,
  fetchUtilization,
  fetchFCR,
  fetchTransferRate,
  fetchPickupRate,
  fetchPickupRateByANI,
  fetchDialAttemptsByANI,
  fetchLiveVsNoAnswerByANI,
  fetchOutboundAbandonRate,
  fetchOutboundByCampaign,
  fetchOutboundByCampaignType,
  fetchMedianResponseTime,
  fetchASA,
  fetchServiceLevel,
  fetchInboundAbandonRate,
  fetchAvgQueueWait,
  fetchLongestWait,
  fetchVolumeByMktNumber,
  fetchConversionRate,
  fetchSaveRate,
  fetchInboundDispositions,
  fetchOutboundDispositions,
} from "../api/client";
import { evaluateAlerts } from "./alertEngine";
import { exportReportCSV } from "./csvExport";
import { THRESHOLDS } from "../config/thresholds";

// ── PDF Palette ───────────────────────────────────────────────────────────────
const NAVY  = [15,  23,  42];
const TEAL  = [0,   188, 212];
const WHITE = [255, 255, 255];
const SLATE = [30,  41,  59];
const MUTED = [100, 116, 139];
const GREEN = [34,  197, 94];
const YELL  = [234, 179, 8];
const RED   = [239, 68,  68];
const LIGHT = [241, 245, 249];

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtDate(d) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtDateTime(d) {
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function fmtSec(s) {
  if (!s && s !== 0) return "—";
  return `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;
}
function fmtMin(s) {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}
function pct(part, whole) {
  return whole > 0 ? ((part / whole) * 100).toFixed(1) : "0.0";
}
function safePct(v) {
  return v != null ? `${Number(v).toFixed(1)}%` : "—";
}
function chg(curr, prev) {
  if (!prev || prev === 0) return null;
  const delta = ((curr - prev) / prev) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generates and downloads a report for the given date range.
 *
 * @param {object} options
 * @param {string}   options.start         ISO datetime string (required)
 * @param {string}   options.end           ISO datetime string (required)
 * @param {object}   [options.extraFilters] Any additional global filter dims
 * @param {string}   [options.format]      'pdf' | 'csv'  (default 'pdf')
 * @param {string}   [options.title]       Cover title text
 * @param {Function} [options.onProgress]  Status callback (msg: string) => void
 * @returns {Promise<string>} Downloaded filename
 */
export async function generateReport({
  start,
  end,
  extraFilters = {},
  format = "pdf",
  title = "Operations Report",
  onProgress = () => {},
} = {}) {
  const filters = { start, end, ...extraFilters };

  // ── Fetch: current period ────────────────────────────────────────────────
  onProgress("Fetching current-period data…");
  const [
    summary, timeline, calls, callsByDisp,
    aht, callsPerHour, utilization, fcr, transferRate,
    pickupRate, aniPickupRate, dialAttempts, liveVsNo,
    obByCamp, obByCampType, obAbandonRate,
    medianResp, asa, serviceLevel, ibAbandonRate,
    avgQueueWait, longestWait, mktNumVolume,
    conversionRate, saveRate, inboundDisp, outboundDisp,
  ] = await Promise.all([
    fetchSummary(filters),
    fetchTimeline(filters),
    fetchCalls(filters),
    fetchCallsByDisp(filters),
    fetchAHT(filters),
    fetchCallsPerHour(filters),
    fetchUtilization(filters),
    fetchFCR(filters),
    fetchTransferRate(filters),
    fetchPickupRate(filters),
    fetchPickupRateByANI(filters),
    fetchDialAttemptsByANI(filters),
    fetchLiveVsNoAnswerByANI(filters),
    fetchOutboundByCampaign(filters),
    fetchOutboundByCampaignType(filters),
    fetchOutboundAbandonRate(filters),
    fetchMedianResponseTime(filters),
    fetchASA(filters),
    fetchServiceLevel(filters),
    fetchInboundAbandonRate(filters),
    fetchAvgQueueWait(filters),
    fetchLongestWait(filters),
    fetchVolumeByMktNumber(filters),
    fetchConversionRate(filters),
    fetchSaveRate(filters),
    fetchInboundDispositions(filters),
    fetchOutboundDispositions(filters),
  ]);

  // ── Fetch: previous period for % change ─────────────────────────────────
  onProgress("Fetching previous-period comparison…");
  const startMs  = new Date(start).getTime();
  const endMs    = new Date(end).getTime();
  const duration = endMs - startMs;
  const prevFilters = {
    start: new Date(startMs - duration).toISOString().slice(0, 16),
    end:   new Date(startMs).toISOString().slice(0, 16),
    ...extraFilters,
  };
  const prevSummary = await fetchSummary(prevFilters).catch(() => null);

  // ── Derive: busiest day ──────────────────────────────────────────────────
  const busiestDay = timeline.length
    ? timeline.reduce((best, d) => (d.total ?? 0) > (best.total ?? 0) ? d : best, timeline[0])
    : null;

  // ── Derive: busiest hour ─────────────────────────────────────────────────
  const hourMap = {};
  for (const call of calls ?? []) {
    const h = new Date(call.timestamp).getHours();
    hourMap[h] = (hourMap[h] ?? 0) + 1;
  }
  const busiestHour = Object.keys(hourMap).length
    ? Object.entries(hourMap).sort((a, b) => b[1] - a[1])[0]
    : null;
  function fmtHour(h) {
    const n = Number(h);
    const ampm = n >= 12 ? "PM" : "AM";
    const h12  = n % 12 || 12;
    return `${h12}:00–${(n + 1) % 12 || 12}:00 ${ampm}`;
  }

  // ── Derive: agent merged table ────────────────────────────────────────────
  const agentMap = {};
  const merge = (id, name, patch) => {
    if (!agentMap[id]) agentMap[id] = { agentId: id, agentName: name ?? id };
    Object.assign(agentMap[id], patch);
  };
  for (const a of (aht?.byAgent ?? []))         merge(a.agentId, a.agentName, { calls: a.calls, avgAHT: a.avgAHT, avgWrapUp: a.avgWrapUp });
  for (const a of (utilization ?? []))           merge(a.agentId, a.agentName, { utilizationRate: a.utilizationRate });
  for (const a of (callsPerHour ?? []))          merge(a.agentId, a.agentName, { callsPerHour: a.callsPerHour });
  for (const a of (fcr?.byAgent ?? []))          merge(a.agentId, a.agentName, { fcr: a.fcr });
  const agentRows = Object.values(agentMap).sort((a, b) => (b.calls ?? 0) - (a.calls ?? 0));

  const topPerformers = agentRows
    .filter((a) => (a.calls ?? 0) >= 3)
    .sort((a, b) => (b.fcr ?? 0) - (a.fcr ?? 0))
    .slice(0, 3);

  const underperformers = agentRows
    .filter((a) =>
      (a.calls ?? 0) >= 3 &&
      ((a.utilizationRate != null && a.utilizationRate < THRESHOLDS.utilizationRate.warn) ||
       (a.fcr != null && a.fcr < 70))
    )
    .sort((a, b) => (a.utilizationRate ?? 100) + (a.fcr ?? 100) - ((b.utilizationRate ?? 100) + (b.fcr ?? 100)))
    .slice(0, 3);

  // ── Derive: disposition totals ────────────────────────────────────────────
  const dispTotal = (callsByDisp ?? []).reduce((s, d) => s + (d.count ?? 0), 0);

  // ── Run alert engine for Section 6 ───────────────────────────────────────
  const alerts = evaluateAlerts({
    avgQueueWait, longestWait, serviceLevel, inboundAbandonRate: ibAbandonRate,
    pickupRate, aniHealth: aniPickupRate, outboundAbandonRate: obAbandonRate,
    utilization, aht, conversionRate, saveRate,
  });

  // ── Build active-filter label ─────────────────────────────────────────────
  const activeFilters = Object.entries(extraFilters)
    .filter(([, v]) => v && v !== "all")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");

  onProgress("Building report…");

  if (format === "csv") {
    return buildCSV({
      title, start, end, activeFilters, summary, prevSummary,
      busiestDay, busiestHour, fmtHour, agentRows, topPerformers,
      underperformers, pickupRate, aniPickupRate, obByCamp,
      obByCampType, obAbandonRate, dialAttempts, medianResp, asa,
      serviceLevel, ibAbandonRate, avgQueueWait, longestWait,
      mktNumVolume, conversionRate, saveRate, callsByDisp,
      dispTotal, inboundDisp, transferRate, alerts,
    });
  }

  return buildPDF({
    title, start, end, activeFilters, summary, prevSummary,
    busiestDay, busiestHour, fmtHour, agentRows, topPerformers,
    underperformers, transferRate, pickupRate, aniPickupRate,
    dialAttempts, liveVsNo, obByCamp, obByCampType, obAbandonRate,
    medianResp, asa, serviceLevel, ibAbandonRate, avgQueueWait,
    longestWait, mktNumVolume, conversionRate, saveRate, callsByDisp,
    dispTotal, inboundDisp, outboundDisp, alerts,
  });
}

/**
 * Backward-compatible weekly report (prior 7 days, PDF).
 */
export async function generateWeeklyReport(onProgress = () => {}) {
  const end   = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);
  return generateReport({
    start:      start.toISOString().slice(0, 16),
    end:        end.toISOString().slice(0, 16),
    format:     "pdf",
    title:      "Weekly Operations Report",
    onProgress,
  });
}

// ── PDF Builder ───────────────────────────────────────────────────────────────
function buildPDF(d) {
  const {
    title, start, end, activeFilters, summary, prevSummary,
    busiestDay, busiestHour, fmtHour, agentRows, topPerformers,
    underperformers, transferRate, pickupRate, aniPickupRate,
    dialAttempts, liveVsNo, obByCamp, obByCampType, obAbandonRate,
    medianResp, asa, serviceLevel, ibAbandonRate, avgQueueWait,
    longestWait, mktNumVolume, conversionRate, saveRate, callsByDisp,
    dispTotal, inboundDisp, outboundDisp, alerts,
  } = d;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW  = 210;
  const M   = 14;
  const CW  = PW - M * 2;
  let y     = 0;

  // ── Helpers ──────────────────────────────────────────────────────────────
  const need = (mm = 25) => {
    if (y + mm > 272) { doc.addPage(); y = 20; }
  };

  const section = (num, heading) => {
    need(30);
    doc.setFillColor(...TEAL);
    doc.rect(M, y, 3, 7, "F");
    doc.setFillColor(...LIGHT);
    doc.rect(M + 3, y, CW - 3, 7, "F");
    doc.setTextColor(...SLATE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${num}. ${heading}`, M + 7, y + 5.2);
    y += 12;
  };

  const note = (text) => {
    need(10);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(text, M, y);
    y += 6;
  };

  const tbl = (opts) =>
    autoTable(doc, {
      margin:              { left: M, right: M },
      headStyles:          { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 8.5 },
      alternateRowStyles:  { fillColor: [248, 250, 252] },
      bodyStyles:          { textColor: SLATE, fontSize: 8.5, cellPadding: 2.5 },
      didDrawPage:         () => { y = doc.lastAutoTable.finalY + 2; },
      ...opts,
    });

  // ── COVER HEADER ──────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PW, 50, "F");
  doc.setFillColor(...TEAL);
  doc.rect(0, 47, PW, 3, "F");

  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(title, PW / 2, 17, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184);
  doc.text("Five9 Call Center Analytics — JoinSkinny Customer Care", PW / 2, 26, { align: "center" });
  doc.text(`Period: ${fmtDateTime(start)} – ${fmtDateTime(end)}`, PW / 2, 33, { align: "center" });
  doc.text(`Generated: ${new Date().toLocaleString()}`, PW / 2, 40, { align: "center" });

  // Active filters label
  if (activeFilters) {
    doc.setFontSize(8.5);
    doc.setTextColor(94, 234, 212);
    doc.text(`Filters: ${activeFilters}`, PW / 2, 45, { align: "center" });
  }

  y = 60;

  // ── SECTION 1: Volume Summary ─────────────────────────────────────────────
  section(1, "Volume Summary");

  const inbPct  = pct(summary.totalInbound,  summary.totalCalls);
  const outPct  = pct(summary.totalOutbound, summary.totalCalls);
  const abandoned = ibAbandonRate?.abandoned ?? "—";
  const prevTot  = prevSummary?.totalCalls ?? null;
  const prevInb  = prevSummary?.totalInbound ?? null;
  const prevOut  = prevSummary?.totalOutbound ?? null;

  tbl({
    startY: y,
    head: [["Metric", "This Period", "Prev Period", "Change"]],
    body: [
      ["Total Calls",       summary.totalCalls ?? 0,    prevTot ?? "—",  chg(summary.totalCalls, prevTot)  ?? "—"],
      ["Inbound Calls",     summary.totalInbound ?? 0,  prevInb ?? "—",  chg(summary.totalInbound, prevInb)  ?? "—"],
      ["Outbound Calls",    summary.totalOutbound ?? 0, prevOut ?? "—",  chg(summary.totalOutbound, prevOut) ?? "—"],
      ["Abandoned/Missed",  abandoned,                  "—",             "—"],
      ["Avg Handle Time",   fmtSec(summary.avgDuration ?? 0), "—",      "—"],
    ],
  });
  y = doc.lastAutoTable.finalY + 6;

  if (busiestDay || busiestHour) {
    const infoRows = [];
    if (busiestDay?.date) infoRows.push(["Busiest Day",  busiestDay.date, `${busiestDay.total ?? 0} calls`]);
    if (busiestHour)      infoRows.push(["Busiest Hour", fmtHour(busiestHour[0]), `${busiestHour[1]} calls`]);
    if (infoRows.length) {
      tbl({ startY: y, head: [["", "Date / Time", "Volume"]], body: infoRows });
      y = doc.lastAutoTable.finalY + 8;
    }
  }

  // ── SECTION 2: Agent Efficiency ───────────────────────────────────────────
  section(2, "Agent Efficiency");

  if (agentRows.length) {
    tbl({
      startY: y,
      head: [["Agent", "Calls", "Avg AHT", "Avg Wrap-Up", "Util %", "Calls/Hr", "FCR %"]],
      body: agentRows.map((a) => [
        a.agentName,
        a.calls ?? "—",
        fmtSec(a.avgAHT),
        fmtSec(a.avgWrapUp),
        safePct(a.utilizationRate),
        a.callsPerHour != null ? Number(a.callsPerHour).toFixed(1) : "—",
        safePct(a.fcr),
      ]),
      didParseCell: (data) => {
        if (data.section !== "body") return;
        // Util % column (5)
        if (data.column.index === 5) {
          const v = parseFloat(data.cell.raw);
          if (!isNaN(v)) {
            data.cell.styles.textColor = v < 50 ? RED : v < 65 ? YELL : GREEN;
            data.cell.styles.fontStyle = "bold";
          }
        }
        // FCR % column (6)
        if (data.column.index === 6) {
          const v = parseFloat(data.cell.raw);
          if (!isNaN(v)) {
            data.cell.styles.textColor = v < 70 ? RED : v < 85 ? YELL : GREEN;
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });
    y = doc.lastAutoTable.finalY + 6;
  } else {
    note("No agent data for this period.");
  }

  // Transfer & escalation summary
  if (transferRate) {
    note(`Transfer rate: ${safePct(transferRate.transferRate)} · Clinical escalation rate: ${safePct(transferRate.escalationRate)} · Handled: ${transferRate.totalHandled ?? 0}`);
  }

  // Top performers
  if (topPerformers.length) {
    need(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...TEAL);
    doc.text("Top Performers", M, y);
    y += 5;
    tbl({
      startY: y,
      head: [["Agent", "FCR %", "Util %", "Calls/Hr"]],
      body: topPerformers.map((a) => [
        a.agentName, safePct(a.fcr), safePct(a.utilizationRate),
        a.callsPerHour != null ? Number(a.callsPerHour).toFixed(1) : "—",
      ]),
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // Needs attention
  if (underperformers.length) {
    need(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...RED);
    doc.text("Needs Attention", M, y);
    y += 5;
    tbl({
      startY: y,
      head: [["Agent", "FCR %", "Util %", "Calls/Hr"]],
      body: underperformers.map((a) => [
        a.agentName, safePct(a.fcr), safePct(a.utilizationRate),
        a.callsPerHour != null ? Number(a.callsPerHour).toFixed(1) : "—",
      ]),
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── SECTION 3: Outbound & ANI Health ──────────────────────────────────────
  section(3, "Outbound & ANI Health");

  // Overall outbound stats
  tbl({
    startY: y,
    head: [["Metric", "Value"]],
    body: [
      ["Total Dial Attempts",  pickupRate?.totalOutbound ?? "—"],
      ["Live Answers",         pickupRate?.liveAnswers ?? "—"],
      ["No Answers",           pickupRate?.noAnswers ?? "—"],
      ["Voicemails",           pickupRate?.voicemails ?? "—"],
      ["Overall Pickup Rate",  safePct(pickupRate?.pickupRate)],
      ["Outbound Abandon Rate",safePct(obAbandonRate?.abandonRate)],
    ],
    columnStyles: { 0: { cellWidth: 70 } },
  });
  y = doc.lastAutoTable.finalY + 6;

  // Per-ANI health
  if ((aniPickupRate ?? []).length) {
    need(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...SLATE);
    doc.text("ANI Pickup Rate", M, y);
    y += 5;

    const sortedANI = [...(aniPickupRate ?? [])].sort((a, b) => (a.pickupRate ?? 0) - (b.pickupRate ?? 0));
    tbl({
      startY: y,
      head: [["ANI / Number", "Dials", "Live Answers", "Pickup %", "Voicemail %", "Risk"]],
      body: sortedANI.map((r) => {
        const risk = (r.pickupRate ?? 0) < 25 ? "HIGH" : (r.pickupRate ?? 0) < 40 ? "Medium" : "Low";
        return [r.ani, r.dials ?? 0, r.liveAnswers ?? 0, safePct(r.pickupRate), safePct(r.voicemailRate), risk];
      }),
      didParseCell: (data) => {
        if (data.section !== "body") return;
        if (data.column.index === 3) {
          const v = parseFloat(data.cell.raw);
          if (!isNaN(v)) { data.cell.styles.textColor = v < 25 ? RED : v < 40 ? YELL : GREEN; data.cell.styles.fontStyle = "bold"; }
        }
        if (data.column.index === 5) {
          const v = data.cell.raw;
          data.cell.styles.textColor = v === "HIGH" ? RED : v === "Medium" ? YELL : GREEN;
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // Campaign breakdown
  if ((obByCamp ?? []).length) {
    need(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...SLATE);
    doc.text("Outbound by Campaign", M, y);
    y += 5;
    tbl({
      startY: y,
      head: [["Campaign Name", "Calls", "Live Answers", "Pickup %", "Avg Duration"]],
      body: obByCamp.map((c) => [
        c.campaignName ?? "Unknown", c.count ?? 0, c.liveAnswers ?? "—",
        safePct(c.pickupRate), fmtSec(c.avgDuration),
      ]),
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // Campaign type breakdown
  if ((obByCampType ?? []).length) {
    need(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...SLATE);
    doc.text("Outbound by Campaign Type / Dialer", M, y);
    y += 5;
    tbl({
      startY: y,
      head: [["Type", "Calls", "Pickup %"]],
      body: obByCampType.map((c) => [
        c.campaignType ?? c.type ?? "Unknown",
        c.count ?? 0,
        safePct(c.pickupRate),
      ]),
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── SECTION 4: Inbound Queue Performance ─────────────────────────────────
  section(4, "Inbound Queue Performance");

  tbl({
    startY: y,
    head: [["Metric", "Value", "Target"]],
    body: [
      ["Median Response Time",    fmtSec(medianResp?.median),               "≤ 30s"],
      ["Avg Speed of Answer",     fmtSec(asa?.asa),                         "≤ 30s"],
      ["Service Level (≤30s)",    safePct(serviceLevel?.pct),               `≥ ${THRESHOLDS.serviceLevel.warn}%`],
      ["Inbound Abandon Rate",    safePct(ibAbandonRate?.abandonRate),       `< ${THRESHOLDS.inboundAbandonRate.warn}%`],
      ["Avg Queue Wait",          fmtSec(avgQueueWait?.avgWaitAll),          `< ${THRESHOLDS.avgQueueWaitSeconds.warn}s`],
      ["Avg Wait (Answered)",     fmtSec(avgQueueWait?.avgWaitAnswered),     "—"],
      ["Longest Single Wait",     fmtSec(longestWait?.longestWaitSeconds),   `< ${THRESHOLDS.longestWaitSeconds.warn}s`],
      ["Total Inbound",           ibAbandonRate?.total ?? "—",               "—"],
      ["Answered",                ibAbandonRate?.answered ?? "—",            "—"],
      ["Abandoned",               ibAbandonRate?.abandoned ?? "—",           "—"],
    ],
    columnStyles: { 0: { cellWidth: 70 }, 2: { cellWidth: 40 } },
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index !== 1) return;
      const row = data.row.index;
      const v   = parseFloat(data.cell.raw);
      if (isNaN(v)) return;
      // Rows 2 (SL) and 3 (abandon): color them
      if (row === 2) { data.cell.styles.textColor = v < 60 ? RED : v < 70 ? YELL : GREEN; data.cell.styles.fontStyle = "bold"; }
      if (row === 3) { data.cell.styles.textColor = v > 10 ? RED : v > 5  ? YELL : GREEN; data.cell.styles.fontStyle = "bold"; }
    },
  });
  y = doc.lastAutoTable.finalY + 6;

  // Marketing number volume
  if ((mktNumVolume ?? []).length) {
    need(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...SLATE);
    doc.text("Inbound Volume by Marketing Number (DNIS)", M, y);
    y += 5;
    tbl({
      startY: y,
      head: [["DNIS / Marketing Number", "Calls", "% of Inbound"]],
      body: mktNumVolume.slice(0, 10).map((r) => [
        r.dnis ?? r.dialedMarketingNumber ?? "Unknown",
        r.count ?? 0,
        `${pct(r.count ?? 0, ibAbandonRate?.total ?? 1)}%`,
      ]),
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── SECTION 5: Outcomes & Dispositions ────────────────────────────────────
  section(5, "Outcomes & Dispositions");

  tbl({
    startY: y,
    head: [["Metric", "Value", "Target"]],
    body: [
      ["Conversion Rate (outbound)", safePct(conversionRate?.overall?.conversionRateOfAttempts), `≥ ${THRESHOLDS.conversionRate.warn}%`],
      ["Conv. Rate (of live answers)", safePct(conversionRate?.overall?.conversionRateOfAnswers), "—"],
      ["Save Rate (retention)",        safePct(saveRate?.saveRate),              `≥ ${THRESHOLDS.saveRate.warn}%`],
      ["Transfer Rate",                safePct(transferRate?.transferRate),       `< 20%`],
      ["Clinical Escalation Rate",     safePct(transferRate?.escalationRate),     "—"],
    ],
    columnStyles: { 0: { cellWidth: 85 }, 2: { cellWidth: 35 } },
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index !== 1) return;
      const v = parseFloat(data.cell.raw);
      if (isNaN(v)) return;
      if (data.row.index === 0 || data.row.index === 2) {
        data.cell.styles.textColor = v < 10 ? RED : v < 15 ? YELL : GREEN;
        data.cell.styles.fontStyle = "bold";
      }
    },
  });
  y = doc.lastAutoTable.finalY + 6;

  // Inbound disposition categories
  const ibCats = inboundDisp?.categories ?? {};
  if (Object.values(ibCats).some((v) => v > 0)) {
    need(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...SLATE);
    doc.text("Inbound Support Category Breakdown", M, y);
    y += 5;
    const ibTotal = Object.values(ibCats).reduce((s, v) => s + v, 0);
    tbl({
      startY: y,
      head: [["Category", "Count", "% of Inbound"]],
      body: Object.entries(ibCats)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, count]) => [
          cat.charAt(0).toUpperCase() + cat.slice(1),
          count,
          `${pct(count, ibTotal)}%`,
        ]),
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // Disposition count table (top 15)
  if ((callsByDisp ?? []).length) {
    need(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...SLATE);
    doc.text("All Disposition Counts", M, y);
    y += 5;
    tbl({
      startY: y,
      head: [["Disposition", "Count", "% of Calls"]],
      body: callsByDisp.slice(0, 15).map((d) => [
        d.disposition, d.count, `${pct(d.count, dispTotal)}%`,
      ]),
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── SECTION 6: Flags & Action Items ───────────────────────────────────────
  section(6, "Flags & Action Items");

  const flagsToShow = alerts.length
    ? alerts
    : [{ level: "INFO", category: "System", message: "No threshold breaches detected for this period. All tracked KPIs are within acceptable targets." }];

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  for (const flag of flagsToShow) {
    need(16);
    const isCrit  = flag.level === "CRITICAL";
    const isWarn  = flag.level === "WARNING";
    const pillClr = isCrit ? RED : isWarn ? YELL : TEAL;
    const pillLbl = isCrit ? "CRITICAL" : isWarn ? "WARNING" : "INFO";
    const catLbl  = flag.category ?? "";

    // Pill
    doc.setFillColor(...pillClr);
    doc.roundedRect(M, y - 3.5, 18, 5.5, 1, 1, "F");
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(pillLbl, M + 9, y + 0.3, { align: "center" });

    // Category label
    doc.setFillColor(51, 65, 85);
    doc.roundedRect(M + 20, y - 3.5, 20, 5.5, 1, 1, "F");
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(6.5);
    doc.text(catLbl.toUpperCase(), M + 30, y + 0.3, { align: "center" });

    // Message
    doc.setTextColor(...SLATE);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(flag.message, CW - 46);
    doc.text(lines, M + 43, y);
    y += lines.length * 5 + 4;
  }

  // ── PAGE FOOTER ───────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFillColor(...LIGHT);
    doc.rect(0, 285, PW, 12, "F");
    doc.setFillColor(...TEAL);
    doc.rect(0, 285, PW, 0.5, "F");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.text("Five9 Analytics — JoinSkinny Customer Care — Confidential", M, 292);
    doc.text(`Page ${i} of ${pages}`, PW - M, 292, { align: "right" });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const filename = `five9-report-${new Date(start).toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
}

// ── CSV Builder ───────────────────────────────────────────────────────────────
function buildCSV(d) {
  const {
    title, start, end, activeFilters, summary, prevSummary,
    busiestDay, busiestHour, fmtHour, agentRows,
    topPerformers, underperformers, pickupRate, aniPickupRate,
    obByCamp, obByCampType, obAbandonRate, dialAttempts,
    medianResp, asa, serviceLevel, ibAbandonRate, avgQueueWait,
    longestWait, mktNumVolume, conversionRate, saveRate,
    callsByDisp, dispTotal, inboundDisp, transferRate, alerts,
  } = d;

  const prevTot = prevSummary?.totalCalls ?? null;
  const prevInb = prevSummary?.totalInbound ?? null;
  const prevOut = prevSummary?.totalOutbound ?? null;

  const sections = [
    // ── Report Header ─────────────────────────────────────────────────────
    {
      title: `${title} — ${fmtDate(start)} to ${fmtDate(end)}${activeFilters ? ` — Filters: ${activeFilters}` : ""}`,
      rows: [[`Generated: ${new Date().toLocaleString()}`]],
    },

    // ── Section 1: Volume Summary ──────────────────────────────────────────
    {
      title: "1. Volume Summary",
      headers: ["Metric", "This Period", "Prev Period", "Change"],
      rows: [
        ["Total Calls",      summary.totalCalls ?? 0,    prevTot ?? "—", chg(summary.totalCalls, prevTot) ?? "—"],
        ["Inbound Calls",    summary.totalInbound ?? 0,  prevInb ?? "—", chg(summary.totalInbound, prevInb) ?? "—"],
        ["Outbound Calls",   summary.totalOutbound ?? 0, prevOut ?? "—", chg(summary.totalOutbound, prevOut) ?? "—"],
        ["Avg Handle Time",  fmtSec(summary.avgDuration ?? 0), "—", "—"],
        ["Busiest Day",      busiestDay?.date ?? "—",    `${busiestDay?.total ?? 0} calls`, ""],
        ["Busiest Hour",     busiestHour ? fmtHour(busiestHour[0]) : "—", `${busiestHour?.[1] ?? 0} calls`, ""],
      ],
    },

    // ── Section 2: Agent Efficiency ────────────────────────────────────────
    {
      title: "2. Agent Efficiency",
      headers: ["Agent", "Calls", "Avg AHT", "Avg Wrap-Up", "Util %", "Calls/Hr", "FCR %"],
      rows: agentRows.map((a) => [
        a.agentName, a.calls ?? "", fmtSec(a.avgAHT), fmtSec(a.avgWrapUp),
        safePct(a.utilizationRate), a.callsPerHour != null ? Number(a.callsPerHour).toFixed(1) : "",
        safePct(a.fcr),
      ]),
    },
    {
      title: "2b. Transfer & Escalation",
      headers: ["Metric", "Value"],
      rows: [
        ["Transfer Rate",      safePct(transferRate?.transferRate)],
        ["Escalation Rate",    safePct(transferRate?.escalationRate)],
        ["Total Handled",      transferRate?.totalHandled ?? ""],
      ],
    },

    // ── Section 3: Outbound & ANI Health ───────────────────────────────────
    {
      title: "3. Outbound Overview",
      headers: ["Metric", "Value"],
      rows: [
        ["Total Dials",        pickupRate?.totalOutbound ?? ""],
        ["Live Answers",       pickupRate?.liveAnswers ?? ""],
        ["Overall Pickup Rate",safePct(pickupRate?.pickupRate)],
        ["Outbound Abandon Rate", safePct(obAbandonRate?.abandonRate)],
      ],
    },
    {
      title: "3b. ANI Pickup Rates",
      headers: ["ANI", "Dials", "Live Answers", "Pickup %", "Voicemail %", "Risk"],
      rows: [...(aniPickupRate ?? [])].sort((a, b) => (a.pickupRate ?? 0) - (b.pickupRate ?? 0)).map((r) => [
        r.ani, r.dials ?? 0, r.liveAnswers ?? 0, safePct(r.pickupRate), safePct(r.voicemailRate),
        (r.pickupRate ?? 0) < 25 ? "HIGH" : (r.pickupRate ?? 0) < 40 ? "Medium" : "Low",
      ]),
    },
    {
      title: "3c. Outbound by Campaign",
      headers: ["Campaign", "Calls", "Live Answers", "Pickup %", "Avg Duration"],
      rows: (obByCamp ?? []).map((c) => [
        c.campaignName ?? "Unknown", c.count ?? 0, c.liveAnswers ?? "",
        safePct(c.pickupRate), fmtSec(c.avgDuration),
      ]),
    },
    {
      title: "3d. Outbound by Campaign Type",
      headers: ["Type", "Calls", "Pickup %"],
      rows: (obByCampType ?? []).map((c) => [
        c.campaignType ?? c.type ?? "Unknown", c.count ?? 0, safePct(c.pickupRate),
      ]),
    },

    // ── Section 4: Inbound Queue ───────────────────────────────────────────
    {
      title: "4. Inbound Queue Performance",
      headers: ["Metric", "Value"],
      rows: [
        ["Median Response Time",     fmtSec(medianResp?.median)],
        ["Avg Speed of Answer",      fmtSec(asa?.asa)],
        ["Service Level %",          safePct(serviceLevel?.pct)],
        ["Inbound Abandon Rate",     safePct(ibAbandonRate?.abandonRate)],
        ["Avg Queue Wait",           fmtSec(avgQueueWait?.avgWaitAll)],
        ["Longest Single Wait",      fmtSec(longestWait?.longestWaitSeconds)],
        ["Total Inbound",            ibAbandonRate?.total ?? ""],
        ["Answered",                 ibAbandonRate?.answered ?? ""],
        ["Abandoned",                ibAbandonRate?.abandoned ?? ""],
      ],
    },
    {
      title: "4b. Inbound Volume by Marketing Number",
      headers: ["DNIS", "Calls"],
      rows: (mktNumVolume ?? []).map((r) => [r.dnis ?? r.dialedMarketingNumber ?? "Unknown", r.count ?? 0]),
    },

    // ── Section 5: Outcomes & Dispositions ────────────────────────────────
    {
      title: "5. Outcomes",
      headers: ["Metric", "Value"],
      rows: [
        ["Conversion Rate (of dials)",    safePct(conversionRate?.overall?.conversionRateOfAttempts)],
        ["Conversion Rate (of answers)",  safePct(conversionRate?.overall?.conversionRateOfAnswers)],
        ["Save Rate",                     safePct(saveRate?.saveRate)],
        ["Transfer Rate",                 safePct(transferRate?.transferRate)],
        ["Clinical Escalation Rate",      safePct(transferRate?.escalationRate)],
      ],
    },
    {
      title: "5b. Inbound Support Categories",
      headers: ["Category", "Count"],
      rows: Object.entries(inboundDisp?.categories ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([cat, count]) => [cat, count]),
    },
    {
      title: "5c. All Dispositions",
      headers: ["Disposition", "Count", "% of Calls"],
      rows: (callsByDisp ?? []).map((d) => [d.disposition, d.count, `${pct(d.count, dispTotal)}%`]),
    },

    // ── Section 6: Flags ───────────────────────────────────────────────────
    {
      title: "6. Flags & Action Items",
      headers: ["Severity", "Category", "Message"],
      rows: alerts.length
        ? alerts.map((a) => [a.level, a.category, a.message])
        : [["INFO", "System", "No threshold breaches detected for this period."]],
    },
  ];

  const filename = `five9-report-${new Date(start).toISOString().slice(0, 10)}.csv`;
  exportReportCSV(sections, filename);
  return filename;
}

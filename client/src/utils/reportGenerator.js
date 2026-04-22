import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  fetchSummary,
  fetchCallsByCampaign,
  fetchCalls,
  fetchCallsByAgent,
  fetchCallsByDisp,
} from "../api/client";


const NAVY  = [15,  23,  42];
const TEAL  = [0,   188, 212];
const WHITE = [255, 255, 255];
const SLATE = [30,  41,  59];
const MUTED = [100, 116, 139];
const GREEN = [34,  197, 94];
const YELL  = [234, 179, 8];
const RED   = [239, 68,  68];

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Fetches the prior 7 days of data and downloads a formatted PDF report.
 * @param {(msg: string) => void} onProgress  Optional status callback.
 * @returns {Promise<string>} The filename that was downloaded.
 */
export async function generateWeeklyReport(onProgress = () => {}) {
  // ── 1. Date range: prior 7 days ─────────────────────────────────────────
  const end   = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);

  const filters = {
    start: start.toISOString().slice(0, 16),
    end:   end.toISOString().slice(0, 16),
  };

  // ── 2. Fetch all required data ──────────────────────────────────────────
  onProgress("Fetching call data…");
  const [summary, campaigns, calls, agentStats, dispositions] = await Promise.all([
    fetchSummary(filters),
    fetchCallsByCampaign(filters),
    fetchCalls(filters),
    fetchCallsByAgent(filters),
    fetchCallsByDisp(filters),
  ]);

  // ── 3. Compute ANI health from raw calls ────────────────────────────────
  const aniMap = {};
  for (const call of calls.filter((c) => c.callType === "outbound")) {
    const key = call.ani ?? "Manual Dial";
    if (!aniMap[key]) aniMap[key] = { ani: key, dials: 0, liveAnswers: 0, voicemails: 0 };
    aniMap[key].dials++;
    if (call.disposition === "Voicemail Left") aniMap[key].voicemails++;
    else if (call.disposition !== "No Answer")  aniMap[key].liveAnswers++;
  }
  const aniHealth = Object.values(aniMap).map((r) => ({
    ...r,
    pickupRate:    r.dials > 0 ? Math.round((r.liveAnswers / r.dials) * 100) : 0,
    voicemailRate: r.dials > 0 ? Math.round((r.voicemails  / r.dials) * 100) : 0,
  }));

  // ── 4. Build flags ──────────────────────────────────────────────────────
  const flags = [];
  aniHealth.forEach((r) => {
    if (r.pickupRate < 10)
      flags.push({ level: "CRITICAL", msg: `ANI ${r.ani} — pick-up rate ${r.pickupRate}% (< 10% threshold). Rotate or rest this number immediately.` });
    else if (r.pickupRate < 20)
      flags.push({ level: "WARNING",  msg: `ANI ${r.ani} — pick-up rate ${r.pickupRate}% (< 20%). Monitor for spam flagging.` });
  });
  agentStats.forEach((a) => {
    if (a.total > 10 && (a.avgDuration ?? 0) > 600)
      flags.push({ level: "WARNING", msg: `Agent ${a.agentName} — avg handle time ${fmtSec(a.avgDuration)} (above 10-minute target).` });
  });
  if (!flags.length)
    flags.push({ level: "INFO", msg: "No critical flags detected for this period. All tracked KPIs within acceptable thresholds." });

  // ── 5. Build PDF ────────────────────────────────────────────────────────
  onProgress("Building PDF…");

  const doc  = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW   = 210;   // page width mm
  const M    = 14;    // margin
  const CW   = PW - M * 2;
  let y      = 0;

  // Helper: add page if less than `needed` mm remain
  const need = (needed = 25) => {
    if (y + needed > 270) { doc.addPage(); y = 20; }
  };

  // ── COVER HEADER ─────────────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PW, 46, "F");
  doc.setFillColor(...TEAL);
  doc.rect(0, 43, PW, 3, "F");

  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Weekly Operations Report", PW / 2, 17, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184);
  doc.text("Five9 Call Center Analytics — Telemedicine Weight Loss", PW / 2, 25, { align: "center" });
  doc.text(`Period: ${fmt(start)} – ${fmt(end)}`, PW / 2, 32, { align: "center" });
  doc.text(`Generated: ${new Date().toLocaleString()}`, PW / 2, 38, { align: "center" });

  y = 56;

  // ── Section helper ────────────────────────────────────────────────────────
  const section = (title) => {
    need(28);
    doc.setFillColor(...TEAL);
    doc.rect(M, y, 3, 7, "F");
    doc.setFillColor(241, 245, 249);
    doc.rect(M + 3, y, CW - 3, 7, "F");
    doc.setTextColor(...SLATE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(title, M + 7, y + 5.2);
    y += 12;
  };

  const tableDefaults = {
    margin: { left: M, right: M },
    headStyles:          { fillColor: TEAL, textColor: WHITE, fontStyle: "bold", fontSize: 9 },
    alternateRowStyles:  { fillColor: [248, 250, 252] },
    bodyStyles:          { textColor: SLATE, fontSize: 9, cellPadding: 3 },
    didDrawPage:         () => { y = doc.lastAutoTable.finalY + 2; },
  };

  // ── SECTION 1: Volume Summary ─────────────────────────────────────────────
  section("1. Volume Summary");
  const inbPct = pct(summary.totalInbound,  summary.totalCalls);
  const outPct = pct(summary.totalOutbound, summary.totalCalls);

  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [["Metric", "Value", "% of Total"]],
    body: [
      ["Total Calls (filtered period)", summary.totalCalls,    "100%"],
      ["Inbound Calls",                 summary.totalInbound,  `${inbPct}%`],
      ["Outbound Calls",                summary.totalOutbound, `${outPct}%`],
      ["Avg Handle Time",               fmtSec(summary.avgDuration ?? 0), "—"],
    ],
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── SECTION 2: Campaign Outbound Volume ───────────────────────────────────
  section("2. Campaign Outbound Volume");
  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [["Campaign Name", "Calls", "Avg Duration", "Total Duration"]],
    body: campaigns.length
      ? campaigns.map((c) => [
          c.campaignName,
          c.count,
          fmtSec(c.avgDuration ?? 0),
          `${Math.round((c.totalDuration ?? 0) / 60)} min`,
        ])
      : [["No outbound campaign data for this period", "", "", ""]],
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── SECTION 3: Outbound Number Performance ────────────────────────────────
  section("3. Outbound Number Performance (ANI Health)");
  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [["ANI / Number", "Dials", "Live Answers", "Pick-Up %", "VM Rate %", "Risk"]],
    body: aniHealth.length
      ? aniHealth.map((r) => [
          r.ani,
          r.dials,
          r.liveAnswers,
          `${r.pickupRate}%`,
          `${r.voicemailRate}%`,
          r.pickupRate < 20 ? "HIGH" : r.pickupRate < 50 ? "Medium" : "Low",
        ])
      : [["No outbound calls found for this period", "", "", "", "", ""]],
    didParseCell: (d) => {
      if (d.section !== "body") return;
      // Pick-Up % column (index 3)
      if (d.column.index === 3) {
        const v = parseInt(d.cell.raw);
        d.cell.styles.textColor = v < 20 ? RED : v < 50 ? YELL : GREEN;
        d.cell.styles.fontStyle = "bold";
      }
      // Risk column (index 5)
      if (d.column.index === 5) {
        const v = d.cell.raw;
        d.cell.styles.textColor = v === "HIGH" ? RED : v === "Medium" ? YELL : GREEN;
        d.cell.styles.fontStyle = "bold";
      }
    },
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── SECTION 4: Agent Scorecards ───────────────────────────────────────────
  need(30);
  section("4. Agent Scorecards");
  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [["Agent", "Calls", "Inbound", "Outbound", "Avg Handle Time", "Total Talk Time"]],
    body: agentStats.length
      ? agentStats.map((a) => [
          a.agentName,
          a.total,
          a.inbound,
          a.outbound,
          fmtSec(a.avgDuration ?? 0),
          fmtMin(a.totalDuration ?? 0),
        ])
      : [["No agent data for this period", "", "", "", "", ""]],
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── SECTION 5: Disposition Breakdown ─────────────────────────────────────
  need(30);
  section("5. Disposition Breakdown");
  const total = dispositions.reduce((s, d) => s + d.count, 0);
  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [["Disposition", "Count", "% of Calls"]],
    body: dispositions.length
      ? dispositions.map((d) => [d.disposition, d.count, `${pct(d.count, total)}%`])
      : [["No disposition data for this period", "", ""]],
  });
  y = doc.lastAutoTable.finalY + 10;

  // ── SECTION 6: Flags & Action Items ──────────────────────────────────────
  need(30);
  section("6. Flags & Action Items");

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  flags.forEach((flag) => {
    need(14);
    const [lr, lg, lb] =
      flag.level === "CRITICAL" ? RED :
      flag.level === "WARNING"  ? YELL : TEAL;

    // Colored pill
    doc.setFillColor(lr, lg, lb);
    doc.roundedRect(M, y - 3.5, 18, 5.5, 1, 1, "F");
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(flag.level, M + 9, y + 0.5, { align: "center" });

    // Message
    doc.setTextColor(...SLATE);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(flag.msg, CW - 22);
    doc.text(lines, M + 21, y);
    y += lines.length * 5 + 4;
  });

  // ── PAGE FOOTER ───────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFillColor(241, 245, 249);
    doc.rect(0, 285, PW, 12, "F");
    doc.setFillColor(...TEAL);
    doc.rect(0, 285, PW, 0.5, "F");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.text("Five9 Analytics — Confidential & Proprietary", M, 292);
    doc.text(`Page ${i} of ${pages}`, PW - M, 292, { align: "right" });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const filename = `five9-weekly-report-${start.toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(d) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtSec(s) {
  if (!s) return "0:00";
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}
function fmtMin(s) {
  if (!s) return "0 min";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}
function pct(part, whole) {
  return whole > 0 ? ((part / whole) * 100).toFixed(1) : "0.0";
}

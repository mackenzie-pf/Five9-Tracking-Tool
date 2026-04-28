import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from "recharts";
import {
  fetchSummary, fetchCallsByAgent, fetchCallsByDisp, fetchTimeline,
  fetchServiceLevel, fetchInboundAbandonRate, fetchMedianResponseTime,
  fetchLongestWait, fetchTimeInState, fetchUtilization,
} from "../api/client";

// ── Shared helpers ────────────────────────────────────────────────────────────

function fmtSec(s) {
  if (!s) return "0:00";
  const sec = Math.round(s);
  return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`;
}
function fmtDate(d) {
  if (!d) return "";
  const [, m, day] = d.split("-");
  return `${["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(m)]} ${parseInt(day)}`;
}
function pct(n, d) { return d ? ((n / d) * 100).toFixed(1) : "0.0"; }

// ── Threshold badge ───────────────────────────────────────────────────────────
// lo/hi are the "good" bounds; direction = "up" (higher is better) | "down" (lower is better)
function StatusBadge({ value, label, lo, hi, direction = "up" }) {
  const v = parseFloat(value);
  const isGood    = direction === "up" ? v >= hi : v <= lo;
  const isWarning = direction === "up" ? v >= lo : v <= hi;
  const [color, bg] = isGood    ? ["#22C55E", "#22C55E18"]
                    : isWarning ? ["#EAB308", "#EAB30818"]
                    :             ["#EF4444", "#EF444418"];
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ color, background: bg }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {label ?? `${value}%`}
    </span>
  );
}

// ── KPI Tile ──────────────────────────────────────────────────────────────────
function KPITile({ label, value, sub, color, badge }) {
  return (
    <div className="bg-card rounded-xl border border-slate-700 p-4">
      <p className="text-xs text-slate-400 uppercase tracking-wider mb-1.5">{label}</p>
      <p className="text-2xl font-bold leading-tight mb-1" style={{ color }}>{value}</p>
      <div className="flex items-center gap-2">
        {badge}
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

function EmptyState({ loading, msg = "No data for this period" }) {
  return (
    <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
      {loading ? <span className="animate-pulse">Loading…</span> : msg}
    </div>
  );
}

// ── State colour map ──────────────────────────────────────────────────────────
const STATE_META = {
  available:  { label: "Available",  color: "#22C55E" },
  on_call:    { label: "On Call",    color: "#00BCD4" },
  on_hold:    { label: "On Hold",    color: "#3B82F6" },
  wrap_up:    { label: "Wrap-Up",    color: "#EAB308" },
  not_ready:  { label: "Not Ready",  color: "#F97316" },
  on_break:   { label: "On Break",   color: "#8B5CF6" },
};

// ─────────────────────────────────────────────────────────────────────────────

export default function RealTimeTab({ filters }) {
  const [summary,    setSummary]    = useState(null);
  const [agentCalls, setAgentCalls] = useState([]);
  const [dispositions, setDispData] = useState([]);
  const [timeline,   setTimeline]   = useState([]);
  const [sla,        setSla]        = useState(null);
  const [ibAbandon,  setIbAbandon]  = useState(null);
  const [medRT,      setMedRT]      = useState(null);
  const [longest,    setLongest]    = useState(null);
  const [stateData,  setStateData]  = useState([]);
  const [utilData,   setUtilData]   = useState([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchSummary(filters),
      fetchCallsByAgent(filters),
      fetchCallsByDisp(filters),
      fetchTimeline(filters),
      fetchServiceLevel(filters, 30),
      fetchInboundAbandonRate(filters),
      fetchMedianResponseTime(filters),
      fetchLongestWait(filters),
      fetchTimeInState(filters),
      fetchUtilization(filters),
    ]).then(([s, a, d, t, slaR, iba, mrt, lw, state, util]) => {
      setSummary(s);
      setAgentCalls(a);
      setDispData(d);
      setTimeline(t);
      setSla(slaR);
      setIbAbandon(iba);
      setMedRT(mrt);
      setLongest(lw);
      setStateData(state);
      setUtilData(util);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [filters.start, filters.end, filters.agentId, filters.campaignId,
      filters.ani, filters.disposition, filters.direction]);

  const total    = summary?.totalCalls    ?? 0;
  const inbound  = summary?.totalInbound  ?? 0;
  const outbound = summary?.totalOutbound ?? 0;
  const aht      = summary?.avgDuration   ?? 0;

  const slaPct   = sla?.serviceLevelPct ?? 0;
  const ibAbPct  = ibAbandon?.abandonRate ?? 0;
  const medWait  = medRT?.medianQueueWaitSeconds ?? 0;
  const longWait = longest?.longestWaitSeconds ?? 0;

  const avgUtil  = useMemo(() => {
    if (!utilData.length) return 0;
    return (utilData.reduce((s, a) => s + a.utilizationRate, 0) / utilData.length).toFixed(1);
  }, [utilData]);

  // State totals across all agents
  const stateTotals = useMemo(() => {
    const t = { available: 0, on_call: 0, on_hold: 0, wrap_up: 0, not_ready: 0, on_break: 0 };
    for (const a of stateData) {
      for (const k of Object.keys(t)) {
        t[k] += (a.stateSeconds?.[k] || 0);
      }
    }
    return t;
  }, [stateData]);

  const totalStateSeconds = Object.values(stateTotals).reduce((s, v) => s + v, 0) || 1;

  const chartData = useMemo(
    () => timeline.slice(-14).map((d) => ({ ...d, label: fmtDate(d.date) })),
    [timeline]
  );

  const alerts = buildAlerts(ibAbPct, aht, slaPct);

  return (
    <div className="space-y-4">

      {/* ── Row 1: Core KPI tiles ────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPITile
          label="Total Calls"
          value={loading ? "—" : total.toLocaleString()}
          sub={`${inbound} inbound · ${outbound} outbound`}
          color="#00BCD4"
        />
        <KPITile
          label="Avg Handle Time"
          value={loading ? "—" : fmtSec(aht)}
          sub="Talk + hold + wrap-up"
          color={aht > 600 ? "#F97316" : "#22C55E"}
          badge={aht > 600 ? <StatusBadge value={Math.round(aht/60)} label={`${Math.round(aht/60)}m — high`} lo={0} hi={5} direction="down" /> : null}
        />
        <KPITile
          label="Inbound"
          value={loading ? "—" : inbound.toLocaleString()}
          sub={total > 0 ? `${pct(inbound, total)}% of total` : ""}
          color="#3B82F6"
        />
        <KPITile
          label="Outbound"
          value={loading ? "—" : outbound.toLocaleString()}
          sub={total > 0 ? `${pct(outbound, total)}% of total` : ""}
          color="#8B5CF6"
        />
      </div>

      {/* ── Row 2: Queue + efficiency KPI tiles ─────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <KPITile
          label="Service Level"
          value={loading ? "—" : `${slaPct}%`}
          sub="Answered ≤ 30 s"
          color={slaPct >= 80 ? "#22C55E" : slaPct >= 60 ? "#EAB308" : "#EF4444"}
          badge={<StatusBadge value={slaPct} label={slaPct >= 80 ? "On Target" : slaPct >= 60 ? "Caution" : "Below Target"} lo={60} hi={80} />}
        />
        <KPITile
          label="Inbound Abandon"
          value={loading ? "—" : `${ibAbPct}%`}
          sub={`${ibAbandon?.abandoned ?? 0} of ${ibAbandon?.totalInbound ?? 0} calls`}
          color={ibAbPct <= 5 ? "#22C55E" : ibAbPct <= 10 ? "#EAB308" : "#EF4444"}
          badge={<StatusBadge value={ibAbPct} label={ibAbPct <= 5 ? "Healthy" : ibAbPct <= 10 ? "Warning" : "Critical"} lo={5} hi={10} direction="down" />}
        />
        <KPITile
          label="Median Wait"
          value={loading ? "—" : fmtSec(medWait)}
          sub="Before agent pickup"
          color={medWait <= 20 ? "#22C55E" : medWait <= 45 ? "#EAB308" : "#EF4444"}
        />
        <KPITile
          label="Longest Wait"
          value={loading ? "—" : fmtSec(longWait)}
          sub={longest?.campaignName ?? ""}
          color={longWait <= 60 ? "#22C55E" : longWait <= 120 ? "#EAB308" : "#EF4444"}
          badge={longWait > 120 ? <StatusBadge value={longWait} label="Alert" lo={0} hi={60} direction="down" /> : null}
        />
        <KPITile
          label="Avg Utilization"
          value={loading ? "—" : `${avgUtil}%`}
          sub="Active handling / working"
          color={avgUtil >= 65 && avgUtil <= 85 ? "#22C55E" : avgUtil > 85 ? "#F97316" : "#EAB308"}
          badge={<StatusBadge value={avgUtil} label={avgUtil >= 65 ? "Healthy" : "Low"} lo={60} hi={65} />}
        />
        <KPITile
          label="Agents w/ Data"
          value={loading ? "—" : utilData.length}
          sub={`${stateData.length} sessions loaded`}
          color="#00BCD4"
        />
      </div>

      {/* ── Row 3: Chart + dispositions ──────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-card rounded-xl border border-slate-700 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Call Volume by Day</p>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="inbound"  name="Inbound"   fill="#3B82F6" radius={[3,3,0,0]} maxBarSize={32} />
                <Bar dataKey="outbound" name="Outbound"  fill="#00BCD4" radius={[3,3,0,0]} maxBarSize={32} />
                <Bar dataKey="abandoned" name="Abandoned" fill="#EF4444" radius={[3,3,0,0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState loading={loading} />}
        </div>

        <div className="bg-card rounded-xl border border-slate-700 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Dispositions</p>
          {dispositions.length > 0 ? (
            <div className="space-y-1.5 overflow-y-auto max-h-[200px] scrollbar-none">
              {dispositions.map((d, i) => {
                const p = total > 0 ? (d.count / total) * 100 : 0;
                const C = ["#00BCD4","#3B82F6","#22C55E","#EAB308","#F97316","#EF4444","#8B5CF6","#EC4899"];
                return (
                  <div key={d.disposition}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-slate-300 truncate pr-2">{d.disposition}</span>
                      <span className="text-slate-400 shrink-0">{d.count} <span className="text-slate-600">({p.toFixed(0)}%)</span></span>
                    </div>
                    <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${p}%`, background: C[i % C.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState loading={loading} />}
        </div>
      </div>

      {/* ── Row 4: Agent State Summary + Time in State ───────────────── */}
      <div className="grid grid-cols-3 gap-4">

        {/* State totals panel */}
        <div className="bg-card rounded-xl border border-slate-700 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Team State Distribution
          </p>
          {stateData.length > 0 ? (
            <div className="space-y-2.5">
              {Object.entries(STATE_META).map(([key, meta]) => {
                const secs = stateTotals[key] || 0;
                const p    = Math.round((secs / totalStateSeconds) * 100);
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
                        <span className="text-slate-300">{meta.label}</span>
                      </span>
                      <span className="text-slate-400 font-mono">{fmtSec(secs)} · {p}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${p}%`, background: meta.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState loading={loading} />}
        </div>

        {/* Per-agent state breakdown */}
        <div className="col-span-2 bg-card rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              Agent State Breakdown
            </p>
            {loading && <span className="text-xs text-slate-500 animate-pulse">Loading…</span>}
          </div>
          {stateData.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800/40">
                    <th className="px-4 py-2.5 text-left text-slate-400 font-semibold uppercase tracking-wider w-32">Agent</th>
                    {Object.entries(STATE_META).map(([k, m]) => (
                      <th key={k} className="px-3 py-2.5 text-right font-semibold tracking-wider" style={{ color: m.color }}>
                        {m.label}
                      </th>
                    ))}
                    <th className="px-4 py-2.5 text-right text-slate-400 font-semibold uppercase tracking-wider">Util %</th>
                  </tr>
                </thead>
                <tbody>
                  {stateData.map((a, idx) => {
                    const util = utilData.find(u => u.agentId === a.agentId);
                    return (
                      <tr key={a.agentId} className={`border-b border-slate-700/50 hover:bg-slate-700/20 ${idx % 2 ? "bg-slate-800/20" : ""}`}>
                        <td className="px-4 py-2.5 text-white font-medium">{a.agentName.split(" ")[0]}</td>
                        {Object.keys(STATE_META).map(k => (
                          <td key={k} className="px-3 py-2.5 text-right text-slate-300">
                            {fmtSec(a.stateSeconds?.[k] || 0)}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-right">
                          {util ? (
                            <StatusBadge
                              value={util.utilizationRate}
                              label={`${util.utilizationRate}%`}
                              lo={60} hi={65}
                            />
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <EmptyState loading={loading} />}
        </div>
      </div>

      {/* ── Row 5: Agent activity table ──────────────────────────────── */}
      <div className="bg-card rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Agent Call Activity</p>
          {loading && <span className="text-xs text-slate-500 animate-pulse">Loading…</span>}
        </div>
        {agentCalls.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  {["Agent", "Total", "Inbound", "Outbound", "Avg Handle Time", "Share"].map((h, i) => (
                    <th key={h} className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agentCalls.map((a, idx) => {
                  const share = total > 0 ? (a.total / total) * 100 : 0;
                  return (
                    <tr key={a.agentId} className={`border-b border-slate-700/50 hover:bg-slate-700/20 ${idx % 2 ? "bg-slate-800/20" : ""}`}>
                      <td className="px-5 py-3 text-sm font-semibold text-white">{a.agentName}</td>
                      <td className="px-5 py-3 text-sm text-right text-teal font-bold">{a.total}</td>
                      <td className="px-5 py-3 text-sm text-right text-slate-300">{a.inbound}</td>
                      <td className="px-5 py-3 text-sm text-right text-slate-300">{a.outbound}</td>
                      <td className="px-5 py-3 text-sm text-right text-slate-300">{fmtSec(a.avgDuration)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-teal" style={{ width: `${share}%` }} />
                          </div>
                          <span className="text-xs text-slate-400 w-10 text-right">{share.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-slate-500 text-sm">
            {loading ? "Loading…" : "No agent data for the selected period."}
          </div>
        )}
      </div>

      {/* ── Alerts ───────────────────────────────────────────────────── */}
      {alerts.length > 0 && <AlertBar alerts={alerts} />}
    </div>
  );
}

// ── Shared tooltip ────────────────────────────────────────────────────────────
function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy border border-slate-600 rounded-lg px-3 py-2 text-xs">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="flex gap-2">
          <span>{p.name}:</span><span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function AlertBar({ alerts }) {
  const doubled = [...alerts, ...alerts];
  return (
    <div className="bg-card rounded-xl border border-slate-700 overflow-hidden flex items-stretch">
      <div className="bg-red-600 flex items-center px-4 shrink-0">
        <span className="text-xs font-bold uppercase tracking-widest text-white">Alerts</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="flex gap-10 animate-ticker whitespace-nowrap py-2.5 px-6">
          {doubled.map((a, i) => (
            <span key={i} className={`text-xs font-medium ${a.level === "red" ? "text-red-400" : "text-yellow-400"}`}>
              {a.level === "red" ? "● " : "◐ "}{a.message}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildAlerts(abandonRate, aht, slaPct) {
  const a = [];
  if (parseFloat(abandonRate) > 10)
    a.push({ level: "red",    message: `Abandon rate ${abandonRate}% — above 10% threshold` });
  else if (parseFloat(abandonRate) > 5)
    a.push({ level: "yellow", message: `Abandon rate ${abandonRate}% — approaching limit` });
  if (aht > 600)
    a.push({ level: "yellow", message: `Avg handle time ${fmtSec(aht)} — above 10-minute target` });
  if (parseFloat(slaPct) < 60)
    a.push({ level: "red",    message: `Service level ${slaPct}% — below 60% target` });
  return a;
}

import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, Cell,
} from "recharts";
import {
  fetchCallsByAgent, fetchAHT, fetchCallsPerHour,
  fetchUtilization, fetchFCR, fetchTimeInState, fetchTransferRate,
} from "../api/client";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtSec(s) {
  if (!s) return "0:00";
  const sec = Math.round(s);
  return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, "0")}`;
}
function fmtMin(s) {
  if (!s) return "0 min";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}
function short(name) { return name ? name.split(" ")[0] : "—"; }

// ── Threshold badge ───────────────────────────────────────────────────────────
function Badge({ value, lo, hi, direction = "up", fmt }) {
  const v = parseFloat(value);
  const good    = direction === "up" ? v >= hi : v <= lo;
  const warning = direction === "up" ? v >= lo : v <= hi;
  const [color, bg] = good    ? ["#22C55E", "#22C55E18"]
                    : warning ? ["#EAB308", "#EAB30818"]
                    :           ["#EF4444", "#EF444418"];
  return (
    <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ color, background: bg }}>
      {fmt ? fmt(v) : `${value}%`}
    </span>
  );
}

// ── Shared widget card ────────────────────────────────────────────────────────
function Card({ title, subtitle, loading, children, className = "" }) {
  return (
    <div className={`bg-card rounded-xl border border-slate-700 overflow-hidden ${className}`}>
      {title && (
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{title}</h2>
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {loading && <span className="text-xs text-slate-500 animate-pulse">Loading…</span>}
        </div>
      )}
      {children}
    </div>
  );
}

function Empty({ loading }) {
  return (
    <div className="flex items-center justify-center h-40 text-slate-500 text-sm p-4">
      {loading ? <span className="animate-pulse">Loading…</span> : "No data for this period"}
    </div>
  );
}

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy border border-slate-600 rounded-lg px-3 py-2 text-xs shadow-xl">
      {label && <p className="text-slate-400 mb-1.5">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color ?? p.fill }} className="flex gap-2">
          <span>{p.name}:</span><span className="font-bold">{typeof p.value === "number" ? p.value.toFixed(1) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ── State colour map ──────────────────────────────────────────────────────────
const STATE_META = {
  available:  { label: "Available", color: "#22C55E" },
  on_call:    { label: "On Call",   color: "#00BCD4" },
  on_hold:    { label: "On Hold",   color: "#3B82F6" },
  wrap_up:    { label: "Wrap-Up",   color: "#EAB308" },
  not_ready:  { label: "Not Ready", color: "#F97316" },
  on_break:   { label: "On Break",  color: "#8B5CF6" },
};

const CHART_COLORS = ["#00BCD4","#3B82F6","#22C55E","#EAB308","#F97316","#8B5CF6","#EC4899"];

// ═════════════════════════════════════════════════════════════════════════════
//  AGENT DETAIL MODAL
// ═════════════════════════════════════════════════════════════════════════════

function AgentModal({ agent, ahtData, stateData, onClose }) {
  if (!agent) return null;

  const ahtAgent   = ahtData?.byAgent?.find(a => a.agentId === agent.agentId);
  const stateAgent = stateData?.find(a => a.agentId === agent.agentId);

  // Disposition breakdown (we have agent-level totals from the calls summary)
  const timeParts = ahtAgent ? [
    { label: "Talk",    secs: ahtAgent.avgTalkTimeSeconds,   color: "#00BCD4" },
    { label: "Hold",    secs: ahtAgent.avgHoldTimeSeconds,   color: "#3B82F6" },
    { label: "Wrap-Up", secs: ahtAgent.avgWrapUpTimeSeconds, color: "#EAB308" },
  ] : [];
  const totalHandleTime = timeParts.reduce((s, p) => s + p.secs, 0) || 1;

  // Inbound vs outbound mini bar data
  const dirData = [
    { name: "Inbound",  value: agent.inbound,  fill: "#3B82F6" },
    { name: "Outbound", value: agent.outbound, fill: "#00BCD4" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}>
      <div
        className="bg-[#0F1929] border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-white">{agent.agentName}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Agent Detail · {agent.total} calls this period</p>
          </div>
          <button onClick={onClose}
            className="text-slate-400 hover:text-white text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 transition-colors">
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* Summary stats row */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total Calls",    value: agent.total },
              { label: "Inbound",        value: agent.inbound },
              { label: "Outbound",       value: agent.outbound },
              { label: "Avg Handle Time",value: fmtSec(agent.avgDuration) },
            ].map(s => (
              <div key={s.label} className="bg-slate-800/60 rounded-xl border border-slate-700 p-3">
                <p className="text-xs text-slate-400 mb-1">{s.label}</p>
                <p className="text-xl font-bold text-teal">{s.value}</p>
              </div>
            ))}
          </div>

          {/* AHT breakdown + Inbound vs Outbound */}
          <div className="grid grid-cols-2 gap-4">

            {/* Talk / Hold / Wrap-up */}
            <div className="bg-slate-800/40 rounded-xl border border-slate-700 p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Handle Time Breakdown</p>
              {timeParts.length > 0 ? (
                <div className="space-y-2.5">
                  {timeParts.map(p => (
                    <div key={p.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-300">{p.label}</span>
                        <span className="font-mono" style={{ color: p.color }}>{fmtSec(p.secs)} avg</span>
                      </div>
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full"
                          style={{ width: `${(p.secs / totalHandleTime) * 100}%`, background: p.color }} />
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-slate-500 pt-1">Overall AHT: {fmtSec(ahtAgent?.avgHandleTimeSeconds ?? agent.avgDuration)}</p>
                </div>
              ) : <p className="text-xs text-slate-500 pt-4">No AHT data</p>}
            </div>

            {/* Inbound vs Outbound chart */}
            <div className="bg-slate-800/40 rounded-xl border border-slate-700 p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Call Direction</p>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={dirData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<DarkTooltip />} />
                  <Bar dataKey="value" name="Calls" radius={[4,4,0,0]} maxBarSize={48}>
                    {dirData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Time in state */}
          {stateAgent && (
            <div className="bg-slate-800/40 rounded-xl border border-slate-700 p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">State Distribution</p>
              <div className="flex h-5 rounded-full overflow-hidden gap-px">
                {Object.entries(STATE_META).map(([k, m]) => {
                  const p = stateAgent.statePct?.[k] ?? 0;
                  return p > 0 ? (
                    <div key={k} style={{ width: `${p}%`, background: m.color }}
                      title={`${m.label}: ${p.toFixed(1)}%`} />
                  ) : null;
                })}
              </div>
              <div className="flex flex-wrap gap-3 mt-2.5">
                {Object.entries(STATE_META).map(([k, m]) => {
                  const secs = stateAgent.stateSeconds?.[k] ?? 0;
                  const p    = stateAgent.statePct?.[k] ?? 0;
                  return (
                    <div key={k} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2 h-2 rounded-full" style={{ background: m.color }} />
                      <span className="text-slate-400">{m.label}</span>
                      <span className="font-mono text-slate-300">{fmtSec(secs)}</span>
                      <span className="text-slate-600">({p.toFixed(0)}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

const MAIN_COLS = [
  { key: "agentName",   label: "Agent",        align: "left",  fmt: v => v                     },
  { key: "total",       label: "Calls",         align: "right", fmt: v => v                     },
  { key: "inbound",     label: "Inbound",       align: "right", fmt: v => v                     },
  { key: "outbound",    label: "Outbound",      align: "right", fmt: v => v                     },
  { key: "avgDuration", label: "Avg Handle",    align: "right", fmt: v => fmtSec(v)             },
  { key: "totalDuration",label:"Total Talk",    align: "right", fmt: v => fmtMin(v)             },
];

export default function AgentPerformanceTab({ filters }) {
  const [raw,        setRaw]        = useState([]);
  const [ahtData,    setAhtData]    = useState(null);
  const [cphData,    setCphData]    = useState([]);
  const [utilData,   setUtilData]   = useState([]);
  const [fcrData,    setFcrData]    = useState(null);
  const [stateData,  setStateData]  = useState([]);
  const [transData,  setTransData]  = useState(null);
  const [loading,    setLoading]    = useState(true);

  const [sortCol, setSortCol]   = useState("total");
  const [sortDir, setSortDir]   = useState("desc");
  const [selectedAgent, setSelectedAgent] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchCallsByAgent(filters),
      fetchAHT(filters),
      fetchCallsPerHour(filters),
      fetchUtilization(filters),
      fetchFCR(filters),
      fetchTimeInState(filters),
      fetchTransferRate(filters),
    ]).then(([calls, aht, cph, util, fcr, state, trans]) => {
      setRaw(calls);
      setAhtData(aht);
      setCphData(cph);
      setUtilData(util);
      setFcrData(fcr);
      setStateData(state);
      setTransData(trans);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [filters.start, filters.end, filters.agentId, filters.campaignId,
      filters.ani, filters.disposition, filters.direction]);

  const visible = useMemo(
    () => filters.agentId !== "all" ? raw.filter(a => a.agentId === filters.agentId) : raw,
    [raw, filters.agentId]
  );

  const sorted = useMemo(() => {
    return [...visible].sort((a, b) => {
      const va = a[sortCol], vb = b[sortCol];
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [visible, sortCol, sortDir]);

  const handleSort = (key) => {
    if (key === sortCol) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortCol(key); setSortDir("desc"); }
  };

  const totalCalls = visible.reduce((s, a) => s + a.total, 0);

  // ── Chart data transforms ──
  const ahtChartData = useMemo(
    () => (ahtData?.byAgent ?? []).map(a => ({
      name: short(a.agentName),
      AHT:  a.avgHandleTimeSeconds,
      Talk: a.avgTalkTimeSeconds,
      Hold: a.avgHoldTimeSeconds,
      WrapUp: a.avgWrapUpTimeSeconds,
    })),
    [ahtData]
  );

  const utilChartData = useMemo(
    () => utilData.map(a => ({
      name: short(a.agentName),
      Utilization: a.utilizationRate,
    })),
    [utilData]
  );

  const fcrChartData = useMemo(
    () => (fcrData?.byAgent ?? []).map(a => ({
      name: short(a.agentName),
      FCR:  a.fcrRate,
    })),
    [fcrData]
  );

  const cphChartData = useMemo(
    () => cphData.map(a => ({
      name:     short(a.agentName),
      Inbound:  a.inboundPerHour,
      Outbound: a.outboundPerHour,
    })),
    [cphData]
  );

  // Time in state stacked bars (percentages)
  const stateChartData = useMemo(
    () => stateData.map(a => ({
      name: short(a.agentName),
      ...Object.fromEntries(
        Object.entries(STATE_META).map(([k, m]) => [m.label, a.statePct?.[k] ?? 0])
      ),
    })),
    [stateData]
  );

  return (
    <>
      {/* ── Agent Detail Modal ──────────────────────────────────────── */}
      {selectedAgent && (
        <AgentModal
          agent={selectedAgent}
          ahtData={ahtData}
          stateData={stateData}
          onClose={() => setSelectedAgent(null)}
        />
      )}

      <div className="space-y-4">

        {/* ── Row 1: Table + Leaderboard ──────────────────────────────── */}
        <div className="grid grid-cols-4 gap-4">

          {/* Main sortable table */}
          <Card title="Agent Performance" subtitle={`${visible.length} agents · ${totalCalls.toLocaleString()} calls`}
            loading={loading} className="col-span-3">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800/40">
                    {MAIN_COLS.map(col => (
                      <th key={col.key} onClick={() => handleSort(col.key)}
                        className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer
                          select-none text-slate-400 hover:text-white transition-colors
                          ${col.align === "right" ? "text-right" : "text-left"}`}>
                        {col.label}
                        {sortCol === col.key && (
                          <span className="ml-1 text-teal">{sortDir === "desc" ? "▼" : "▲"}</span>
                        )}
                      </th>
                    ))}
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 text-right">Util %</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 text-right">FCR %</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((agent, idx) => {
                    const util = utilData.find(u => u.agentId === agent.agentId);
                    const fcr  = fcrData?.byAgent?.find(f => f.agentId === agent.agentId);
                    return (
                      <tr key={agent.agentId}
                        onClick={() => setSelectedAgent(agent)}
                        className={`border-b border-slate-700/50 hover:bg-slate-700/25 cursor-pointer transition-colors
                          ${idx % 2 ? "bg-slate-800/20" : ""}`}>
                        {MAIN_COLS.map(col => (
                          <td key={col.key}
                            className={`px-5 py-3.5 text-sm whitespace-nowrap
                              ${col.align === "right" ? "text-right" : "text-left"}
                              ${col.key === "agentName" ? "font-semibold text-white" : "text-slate-300"}`}>
                            {col.fmt(agent[col.key])}
                          </td>
                        ))}
                        <td className="px-5 py-3.5 text-right">
                          {util
                            ? <Badge value={util.utilizationRate} lo={60} hi={65} />
                            : <span className="text-slate-600 text-xs">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {fcr
                            ? <Badge value={fcr.fcrRate} lo={70} hi={85} />
                            : <span className="text-slate-600 text-xs">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {sorted.length === 0 && (
                    <tr><td colSpan={MAIN_COLS.length + 2} className="px-5 py-10 text-center text-slate-500 text-sm">
                      {loading ? "Loading…" : "No agent data for the selected period."}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-600 px-5 pb-3 pt-2">Click any row to view agent detail</p>
          </Card>

          {/* Leaderboard + Period Summary + Placeholders */}
          <div className="space-y-4">
            <Card title="Top Agents">
              <div className="p-4 space-y-3">
                {sorted.slice(0, 5).map((agent, idx) => {
                  const maxCalls = sorted[0]?.total || 1;
                  const medals = ["🥇", "🥈", "🥉"];
                  return (
                    <div key={agent.agentId}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 text-center text-sm">{medals[idx] ?? <span className="text-slate-500 text-xs font-bold">#{idx+1}</span>}</span>
                          <span className="text-sm font-medium text-white truncate max-w-[90px]">{short(agent.agentName)}</span>
                        </div>
                        <span className="text-sm font-bold text-teal">{agent.total}</span>
                      </div>
                      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${(agent.total / maxCalls) * 100}%`, background: idx === 0 ? "#F59E0B" : "#00BCD4" }} />
                      </div>
                    </div>
                  );
                })}
                {sorted.length === 0 && <p className="text-slate-500 text-xs text-center">No data</p>}
              </div>
            </Card>

            {/* QA / CSAT / Schedule placeholders */}
            <div className="bg-card rounded-xl border border-slate-700 p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Compliance & Quality</p>
              {[
                { label: "Schedule Adherence", note: "Connect Workforce Mgmt" },
                { label: "QA Score",           note: "Connect QA Platform" },
                { label: "CSAT Score",         note: "Connect Survey Tool" },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-1 border-b border-slate-700/50 last:border-0">
                  <span className="text-xs text-slate-400">{item.label}</span>
                  <span className="text-xs text-slate-600 italic">{item.note}</span>
                </div>
              ))}
            </div>

            {/* Transfer / escalation summary */}
            {transData && (
              <div className="bg-card rounded-xl border border-slate-700 p-4 space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Transfers</p>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Transfer rate</span>
                  <Badge value={transData.transferRate} lo={10} hi={20} direction="down" />
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Escalated clinical</span>
                  <span className="text-white font-semibold">{transData.escalatedToClinical}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Row 2: AHT / Utilization / FCR charts ───────────────────── */}
        <div className="grid grid-cols-3 gap-4">

          <Card title="Avg Handle Time by Agent" subtitle="Talk + Hold + Wrap-Up (seconds)" loading={loading}>
            {ahtChartData.length > 0 ? (
              <div className="p-4">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={ahtChartData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#94A3B8", fontSize: 9 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<DarkTooltip />} />
                    <Bar dataKey="Talk"   name="Talk"    stackId="a" fill="#00BCD4" radius={[0,0,0,0]} />
                    <Bar dataKey="Hold"   name="Hold"    stackId="a" fill="#3B82F6" />
                    <Bar dataKey="WrapUp" name="Wrap-Up" stackId="a" fill="#EAB308" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <Empty loading={loading} />}
          </Card>

          <Card title="Utilization Rate by Agent" subtitle="Active handling / working time" loading={loading}>
            {utilChartData.length > 0 ? (
              <div className="p-4">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={utilChartData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#94A3B8", fontSize: 9 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<DarkTooltip />} />
                    <Bar dataKey="Utilization" name="Utilization %" radius={[4,4,0,0]} maxBarSize={40}>
                      {utilChartData.map((d, i) => (
                        <Cell key={i}
                          fill={d.Utilization >= 65 && d.Utilization <= 85 ? "#22C55E" : d.Utilization > 85 ? "#F97316" : "#EAB308"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <Empty loading={loading} />}
          </Card>

          <Card title="First Contact Resolution" subtitle="% resolved without callback / transfer" loading={loading}>
            {fcrChartData.length > 0 ? (
              <div className="p-4">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={fcrChartData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#94A3B8", fontSize: 9 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<DarkTooltip />} />
                    <Bar dataKey="FCR" name="FCR %" radius={[4,4,0,0]} maxBarSize={40}>
                      {fcrChartData.map((d, i) => (
                        <Cell key={i} fill={d.FCR >= 85 ? "#22C55E" : d.FCR >= 70 ? "#EAB308" : "#EF4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <Empty loading={loading} />}
          </Card>
        </div>

        {/* ── Row 3: Calls per Hour + Time in State stacked bar ────────── */}
        <div className="grid grid-cols-2 gap-4">

          <Card title="Calls Handled per Agent per Hour" subtitle="Based on logged-in time" loading={loading}>
            {cphChartData.length > 0 ? (
              <div className="p-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={cphChartData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#94A3B8", fontSize: 9 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<DarkTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={v => <span style={{ color: "#94A3B8" }}>{v}</span>} />
                    <Bar dataKey="Inbound"  name="Inbound/hr"  fill="#3B82F6" radius={[3,3,0,0]} maxBarSize={28} />
                    <Bar dataKey="Outbound" name="Outbound/hr" fill="#00BCD4" radius={[3,3,0,0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <Empty loading={loading} />}
          </Card>

          <Card title="Time in State by Agent" subtitle="% of logged-in time per state" loading={loading}>
            {stateChartData.length > 0 ? (
              <div className="p-4">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stateChartData} margin={{ top: 4, right: 4, left: -16, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#94A3B8", fontSize: 9 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<DarkTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10 }} formatter={v => <span style={{ color: "#94A3B8" }}>{v}</span>} />
                    {Object.entries(STATE_META).map(([k, m]) => (
                      <Bar key={k} dataKey={m.label} stackId="s" fill={m.color}
                        radius={k === "on_break" ? [3,3,0,0] : [0,0,0,0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <Empty loading={loading} />}
          </Card>
        </div>
      </div>
    </>
  );
}

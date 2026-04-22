import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
} from "recharts";
import { fetchSummary, fetchCallsByAgent, fetchCallsByDisp, fetchTimeline } from "../api/client";

export default function RealTimeTab({ filters }) {
  const [summary,      setSummary]      = useState(null);
  const [agents,       setAgents]       = useState([]);
  const [dispositions, setDispositions] = useState([]);
  const [timeline,     setTimeline]     = useState([]);
  const [loading,      setLoading]      = useState(true);

  useEffect(() => {
    setLoading(true);
    const f = { start: filters.start, end: filters.end };
    Promise.all([
      fetchSummary(f),
      fetchCallsByAgent(f),
      fetchCallsByDisp(f),
      fetchTimeline(f),
    ]).then(([s, a, d, t]) => {
      setSummary(s);
      setAgents(a);
      setDispositions(d);
      setTimeline(t);
    }).finally(() => setLoading(false));
  }, [filters.start, filters.end]);

  const aht = summary?.avgDuration ?? 0;
  const total = summary?.totalCalls ?? 0;
  const inbound = summary?.totalInbound ?? 0;
  const outbound = summary?.totalOutbound ?? 0;

  // Abandonment: dispositions containing "Abandoned" or "Caller Disconnected"
  const abandonedCount = useMemo(() =>
    dispositions
      .filter((d) => /abandon|caller disc/i.test(d.disposition))
      .reduce((s, d) => s + d.count, 0),
    [dispositions]
  );
  const abandonRate = total > 0 ? ((abandonedCount / total) * 100).toFixed(1) : "0.0";

  // Bar chart: show timeline but cap at 14 most recent days for readability
  const chartData = useMemo(() =>
    timeline.slice(-14).map((d) => ({
      ...d,
      label: fmtDate(d.date),
    })), [timeline]
  );

  const alerts = buildAlerts(parseFloat(abandonRate), aht);

  return (
    <div className="space-y-4">

      {/* ── KPI Tiles ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        <KPITile
          label="Total Calls"
          value={loading ? "—" : total.toLocaleString()}
          sub={`${inbound} inbound · ${outbound} outbound`}
          color="#00BCD4"
        />
        <KPITile
          label="Avg Handle Time"
          value={loading ? "—" : fmtSec(aht)}
          sub="Talk time per call"
          color={aht > 600 ? "#F97316" : "#22C55E"}
        />
        <KPITile
          label="Inbound"
          value={loading ? "—" : inbound.toLocaleString()}
          sub={total > 0 ? `${((inbound/total)*100).toFixed(0)}% of calls` : ""}
          color="#3B82F6"
        />
        <KPITile
          label="Outbound"
          value={loading ? "—" : outbound.toLocaleString()}
          sub={total > 0 ? `${((outbound/total)*100).toFixed(0)}% of calls` : ""}
          color="#8B5CF6"
        />
      </div>

      {/* ── Row 2: Call Volume Chart + Disposition Breakdown ─────── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Volume bar chart */}
        <div className="col-span-2 bg-card rounded-xl border border-slate-700 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Call Volume by Day
          </p>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                  content={({ active, payload, label }) => {
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
                  }}
                />
                <Bar dataKey="inbound"  name="Inbound"  fill="#3B82F6" radius={[3,3,0,0]} maxBarSize={36} />
                <Bar dataKey="outbound" name="Outbound" fill="#00BCD4" radius={[3,3,0,0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState loading={loading} />
          )}
        </div>

        {/* Disposition list */}
        <div className="bg-card rounded-xl border border-slate-700 p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
            Dispositions
          </p>
          {dispositions.length > 0 ? (
            <div className="space-y-2 overflow-y-auto max-h-[210px] scrollbar-none">
              {dispositions.map((d, i) => {
                const pct = total > 0 ? (d.count / total) * 100 : 0;
                const COLORS = ["#00BCD4","#3B82F6","#22C55E","#EAB308","#F97316","#EF4444","#8B5CF6","#EC4899"];
                const color = COLORS[i % COLORS.length];
                return (
                  <div key={d.disposition}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-slate-300 truncate pr-2">{d.disposition}</span>
                      <span className="text-slate-400 shrink-0">{d.count} <span className="text-slate-600">({pct.toFixed(0)}%)</span></span>
                    </div>
                    <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState loading={loading} />
          )}
        </div>
      </div>

      {/* ── Row 3: Agent Table ────────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Agent Activity</p>
          {loading && <span className="text-xs text-slate-500 animate-pulse">Loading…</span>}
        </div>
        {agents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  {["Agent", "Total Calls", "Inbound", "Outbound", "Avg Handle Time", "Call Share"].map((h, i) => (
                    <th key={h} className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400 ${i === 0 ? "text-left" : "text-right"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agents.map((a, idx) => {
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
          <div className="px-5 py-10 text-center text-slate-500 text-sm">
            {loading ? "Loading…" : "No agent data for the selected period."}
          </div>
        )}
      </div>

      {/* ── Alerts ────────────────────────────────────────────────── */}
      {alerts.length > 0 && <AlertBar alerts={alerts} />}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KPITile({ label, value, sub, color }) {
  return (
    <div className="bg-card rounded-xl border border-slate-700 p-5">
      <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">{label}</p>
      <p className="text-3xl font-bold leading-tight mb-1" style={{ color }}>{value}</p>
      <p className="text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function EmptyState({ loading }) {
  return (
    <div className="flex items-center justify-center h-[200px] text-slate-500 text-sm">
      {loading ? "Loading…" : "No data for this period"}
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSec(s) {
  if (!s) return "0:00";
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  const months = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m)]} ${parseInt(d)}`;
}

function buildAlerts(abandonRate, aht) {
  const a = [];
  if (abandonRate > 10)
    a.push({ level: "red",    message: `Abandonment ${abandonRate}% — above 10% threshold` });
  else if (abandonRate > 5)
    a.push({ level: "yellow", message: `Abandonment ${abandonRate}% — approaching 10% threshold` });
  if (aht > 600)
    a.push({ level: "yellow", message: `Avg handle time ${fmtSec(aht)} — above 10-minute target` });
  return a;
}

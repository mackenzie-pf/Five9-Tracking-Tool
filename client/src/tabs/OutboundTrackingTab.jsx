import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { fetchTimeline, fetchCallsByCampaign, fetchCalls, fetchCallsByDisp } from "../api/client";

const PIE_COLORS = ["#22C55E", "#EAB308", "#EF4444", "#3B82F6", "#F97316", "#8B5CF6", "#EC4899", "#14B8A6"];

// ── Tooltip shared style ─────────────────────────────────────────────────────
function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0F172A] border border-slate-600 rounded-lg px-3 py-2 text-xs shadow-xl">
      {label && <p className="text-slate-400 mb-1.5 font-medium">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color ?? p.fill }} className="flex gap-2">
          <span>{p.name}:</span>
          <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function PieDarkTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { name, value, payload: inner } = payload[0];
  return (
    <div className="bg-[#0F172A] border border-slate-600 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{name}</p>
      <p style={{ color: inner.fill }} className="font-bold">{value} calls ({(inner.percent * 100).toFixed(1)}%)</p>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function OutboundTrackingTab({ filters }) {
  const [timeline,    setTimeline]    = useState([]);
  const [campaigns,   setCampaigns]   = useState([]);
  const [allCalls,    setAllCalls]    = useState([]);
  const [dispositions,setDispositions]= useState([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    setLoading(true);
    const f = { start: filters.start, end: filters.end };
    Promise.all([
      fetchTimeline(f),
      fetchCallsByCampaign(f),
      fetchCalls(f),
      fetchCallsByDisp(f),
    ]).then(([tl, camp, calls, disp]) => {
      setTimeline(tl);
      setCampaigns(camp);
      setAllCalls(calls);
      setDispositions(disp);
    }).finally(() => setLoading(false));
  }, [filters.start, filters.end]);

  // ── Derived: ANI health (computed from full call list) ───────────────────
  const aniHealth = useMemo(() => {
    const outbound = allCalls.filter((c) => c.callType === "outbound");
    const map = {};
    for (const call of outbound) {
      const key = call.ani ?? "Manual Dial";
      if (!map[key]) map[key] = { ani: key, dials: 0, liveAnswers: 0, voicemails: 0 };
      map[key].dials++;
      if (call.disposition === "Voicemail Left") map[key].voicemails++;
      else if (call.disposition !== "No Answer")  map[key].liveAnswers++;
    }
    return Object.values(map)
      .map((r) => ({
        ...r,
        pickupRate:    r.dials > 0 ? Math.round((r.liveAnswers / r.dials) * 100) : 0,
        voicemailRate: r.dials > 0 ? Math.round((r.voicemails  / r.dials) * 100) : 0,
        spamRisk:      r.dials > 0 && (r.liveAnswers / r.dials) < 0.20 ? "High"
                     : r.dials > 0 && (r.liveAnswers / r.dials) < 0.50 ? "Medium"
                     : "Low",
      }))
      .sort((a, b) => b.dials - a.dials);
  }, [allCalls]);

  // ── Filters applied to visuals ───────────────────────────────────────────
  const filteredAniHealth = useMemo(
    () => filters.ani !== "all" ? aniHealth.filter((r) => r.ani === filters.ani) : aniHealth,
    [aniHealth, filters.ani]
  );

  const filteredCampaigns = useMemo(
    () =>
      filters.campaignId !== "all"
        ? campaigns.filter((c) => c.campaignId === filters.campaignId)
        : campaigns,
    [campaigns, filters.campaignId]
  );

  // Direction filter for line chart
  const showInbound  = filters.direction !== "outbound";
  const showOutbound = filters.direction !== "inbound";

  return (
    <div className="grid grid-cols-2 gap-4">

      {/* ══ LEFT COLUMN ═══════════════════════════════════════════════════ */}
      <div className="space-y-4">

        {/* Line Chart: Inbound vs Outbound over time */}
        <ChartCard
          title="Call Volume Over Time"
          subtitle="Inbound vs Outbound"
          loading={loading}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={timeline} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fill: "#94A3B8", fontSize: 11 }}
                axisLine={{ stroke: "#334155" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#94A3B8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<DarkTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                formatter={(v) => <span style={{ color: "#94A3B8" }}>{v}</span>}
              />
              {showInbound && (
                <Line
                  type="monotone"
                  dataKey="inbound"
                  name="Inbound"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#3B82F6" }}
                  activeDot={{ r: 5 }}
                />
              )}
              {showOutbound && (
                <Line
                  type="monotone"
                  dataKey="outbound"
                  name="Outbound"
                  stroke="#00BCD4"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#00BCD4" }}
                  activeDot={{ r: 5 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Bar Chart: Outbound calls by Campaign */}
        <ChartCard
          title="Outbound Calls by Campaign"
          subtitle={`${filteredCampaigns.length} campaign${filteredCampaigns.length !== 1 ? "s" : ""}`}
          loading={loading}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={filteredCampaigns}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 8, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: "#94A3B8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="campaignName"
                tick={{ fill: "#94A3B8", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={160}
                tickFormatter={(v) => v.length > 22 ? v.slice(0, 21) + "…" : v}
              />
              <Tooltip content={<DarkTooltip />} />
              <Bar dataKey="count" name="Calls" radius={[0, 4, 4, 0]} fill="#00BCD4">
                {filteredCampaigns.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? "#00BCD4" : `${PIE_COLORS[i % PIE_COLORS.length]}`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ══ RIGHT COLUMN ══════════════════════════════════════════════════ */}
      <div className="space-y-4">

        {/* ANI Health Table */}
        <div className="bg-card rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Outbound Number Health
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Per-ANI dial performance</p>
            </div>
            {loading && <span className="text-xs text-slate-500 animate-pulse">Loading…</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  {["ANI / Label", "Dials", "Live Ans.", "Pick-Up %", "VM Rate", "Spam Risk"].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAniHealth.map((row, i) => (
                  <tr key={row.ani} className={`border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors ${i % 2 === 0 ? "" : "bg-slate-800/20"}`}>
                    <td className="px-4 py-3">
                      <p className="text-white text-xs font-medium font-mono">{row.ani}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-sm">{row.dials}</td>
                    <td className="px-4 py-3 text-slate-300 text-sm">{row.liveAnswers}</td>
                    <td className="px-4 py-3">
                      <PickupBadge value={row.pickupRate} />
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-sm">{row.voicemailRate}%</td>
                    <td className="px-4 py-3">
                      <SpamBadge risk={row.spamRisk} />
                    </td>
                  </tr>
                ))}
                {filteredAniHealth.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500 text-sm">
                      No outbound call data for the selected range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pie Chart: Disposition Breakdown */}
        <ChartCard title="Disposition Breakdown" subtitle="All call types" loading={loading}>
          {dispositions.length > 0 ? (
            <div className="flex gap-4 items-center">
              <ResponsiveContainer width="55%" height={200}>
                <PieChart>
                  <Pie
                    data={dispositions}
                    dataKey="count"
                    nameKey="disposition"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={2}
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {dispositions.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieDarkTooltip />} />
                </PieChart>
              </ResponsiveContainer>

              {/* Custom legend */}
              <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[200px] scrollbar-none">
                {dispositions.map((d, i) => {
                  const total = dispositions.reduce((s, x) => s + x.count, 0);
                  const pct = total > 0 ? ((d.count / total) * 100).toFixed(1) : 0;
                  return (
                    <div key={d.disposition} className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="text-xs text-slate-300 truncate flex-1">{d.disposition}</span>
                      <span className="text-xs text-slate-400 font-mono shrink-0">
                        {d.count} <span className="text-slate-600">({pct}%)</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-sm text-center py-8">No data</p>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

// ── Shared card wrapper ───────────────────────────────────────────────────────
function ChartCard({ title, subtitle, loading, children }) {
  return (
    <div className="bg-card rounded-xl border border-slate-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {loading && <span className="text-xs text-slate-500 animate-pulse">Loading…</span>}
      </div>
      {children}
    </div>
  );
}

// ── Cell badges ───────────────────────────────────────────────────────────────
function PickupBadge({ value }) {
  const [color, bg] =
    value >= 50 ? ["#22C55E", "#22C55E18"]
    : value >= 20 ? ["#EAB308", "#EAB30818"]
    : ["#EF4444", "#EF444418"];
  return (
    <span className="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded-full font-semibold"
      style={{ color, background: bg }}>
      {value}%
    </span>
  );
}

function SpamBadge({ risk }) {
  const [color, bg] =
    risk === "Low"    ? ["#22C55E", "#22C55E18"]
    : risk === "Medium" ? ["#EAB308", "#EAB30818"]
    : ["#EF4444", "#EF444418"];
  return (
    <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ color, background: bg }}>
      {risk}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(dateStr) {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m)]} ${parseInt(d)}`;
}

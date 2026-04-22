import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from "recharts";
import { fetchSummary, fetchTimeline } from "../api/client";
import { generateWeeklyReport } from "../utils/reportGenerator";

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy border border-slate-600 rounded-lg px-3 py-2 text-xs shadow-xl">
      {label && <p className="text-slate-400 mb-1 font-medium">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="flex gap-2">
          <span>{p.name}:</span><span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function StrategicTrendsTab({ filters }) {
  const [summary,    setSummary]    = useState({ totalCalls: 0, totalInbound: 0, totalOutbound: 0, avgDuration: 0 });
  const [timeline,   setTimeline]   = useState([]);
  const [totalCost,  setTotalCost]  = useState("");
  const [generating, setGenerating] = useState(false);
  const [genStatus,  setGenStatus]  = useState("");
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    setLoading(true);
    const f = { start: filters.start, end: filters.end };
    Promise.all([fetchSummary(f), fetchTimeline(f)]).then(([s, t]) => {
      setSummary(s);
      setTimeline(t);
    }).finally(() => setLoading(false));
  }, [filters.start, filters.end]);

  const chartData = useMemo(() =>
    timeline.slice(-30).map((d) => ({
      ...d,
      label: fmtDate(d.date),
      aht:   d.avgDuration ?? 0,
    })), [timeline]
  );

  // Cost calculator
  const costNum         = parseFloat(totalCost) || 0;
  const costPerCall     = costNum && summary.totalCalls    > 0 ? (costNum / summary.totalCalls).toFixed(2)    : null;
  const costPerInbound  = costNum && summary.totalInbound  > 0 ? (costNum / summary.totalInbound).toFixed(2)  : null;
  const costPerOutbound = costNum && summary.totalOutbound > 0 ? (costNum / summary.totalOutbound).toFixed(2) : null;

  // Channel mix from real data
  const channelMix = [
    { channel: "Inbound",  count: summary.totalInbound,  color: "#3B82F6" },
    { channel: "Outbound", count: summary.totalOutbound, color: "#00BCD4" },
  ];

  // KPI delta cards (first vs last day in range)
  const first = chartData[0];
  const last  = chartData[chartData.length - 1];

  const handleGenerate = async () => {
    setGenerating(true);
    setGenStatus("Fetching data…");
    try {
      const filename = await generateWeeklyReport((msg) => setGenStatus(msg));
      setGenStatus(`Saved: ${filename}`);
    } catch (err) {
      setGenStatus(`Error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">

      {/* ── Row 1: Trend KPI cards ─────────────────────────────────── */}
      {chartData.length >= 2 && (
        <div className="grid grid-cols-3 gap-4">
          <TrendCard
            label="Total Calls"
            current={last?.total ?? 0}
            previous={first?.total ?? 0}
            color="#00BCD4"
            note={`${chartData.length}-day range`}
          />
          <TrendCard
            label="Outbound Calls"
            current={last?.outbound ?? 0}
            previous={first?.outbound ?? 0}
            color="#8B5CF6"
            note={`${chartData.length}-day range`}
          />
          <TrendCard
            label="Avg Handle Time"
            current={last?.aht ?? 0}
            previous={first?.aht ?? 0}
            color="#22C55E"
            note="seconds · lower is better"
            lowerIsBetter
          />
        </div>
      )}

      {/* ── Row 2: Volume Trend + AHT Trend ───────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        <div className="bg-card rounded-xl border border-slate-700 p-4">
          <p className="text-sm font-semibold text-white mb-1">Call Volume Trend</p>
          <p className="text-xs text-slate-500 mb-3">Daily inbound vs outbound</p>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<DarkTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} formatter={(v) => <span style={{ color: "#94A3B8" }}>{v}</span>} />
                <Line type="monotone" dataKey="inbound"  name="Inbound"  stroke="#3B82F6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="outbound" name="Outbound" stroke="#00BCD4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart loading={loading} />}
        </div>

        <div className="bg-card rounded-xl border border-slate-700 p-4">
          <p className="text-sm font-semibold text-white mb-1">Avg Handle Time Trend</p>
          <p className="text-xs text-slate-500 mb-3">Seconds per call · daily average</p>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtSec(v)} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-navy border border-slate-600 rounded-lg px-3 py-2 text-xs">
                      <p className="text-slate-400 mb-1">{label}</p>
                      <p className="text-green-400 font-bold">{fmtSec(payload[0].value)}</p>
                    </div>
                  );
                }} />
                <Line type="monotone" dataKey="aht" name="AHT" stroke="#22C55E" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <EmptyChart loading={loading} />}
        </div>
      </div>

      {/* ── Row 3: Cost Calculator + Channel Mix ──────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Cost calculator */}
        <div className="bg-card rounded-xl border border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Cost Per Call Calculator</h2>
          <label className="text-xs text-slate-400 block mb-1">Total Operating Cost for Period ($)</label>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-slate-400 text-sm">$</span>
            <input
              type="number"
              min="0"
              value={totalCost}
              onChange={(e) => setTotalCost(e.target.value)}
              placeholder="e.g. 12500"
              className="flex-1 bg-navy border border-slate-600 text-white text-sm rounded-lg px-3 py-2
                         focus:border-teal outline-none placeholder-slate-600"
            />
          </div>

          {costPerCall ? (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <CostMetric label="Per Call"     value={`$${costPerCall}`}     total={summary.totalCalls}    />
              <CostMetric label="Per Inbound"  value={`$${costPerInbound}`}  total={summary.totalInbound}  />
              <CostMetric label="Per Outbound" value={`$${costPerOutbound}`} total={summary.totalOutbound} />
            </div>
          ) : (
            <p className="text-slate-500 text-xs mb-4">
              Enter a cost to calculate cost-per-call across {summary.totalCalls.toLocaleString()} calls.
            </p>
          )}

          <hr className="border-slate-700 mb-4" />
          <h3 className="text-xs text-slate-400 uppercase tracking-wider mb-2">Weekly Report</h3>
          <p className="text-xs text-slate-500 mb-3">
            Exports a PDF covering the prior 7 days — volume, campaigns, ANI health, agent scorecards.
          </p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full py-2.5 rounded-lg text-sm font-bold transition-all
                       bg-teal text-navy hover:bg-cyan-300 active:scale-95
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? "Generating PDF…" : "Generate Weekly Report"}
          </button>
          {genStatus && (
            <p className={`text-xs mt-2 text-center ${genStatus.startsWith("Saved") ? "text-green-400" : genStatus.startsWith("Error") ? "text-red-400" : "text-slate-400"}`}>
              {genStatus}
            </p>
          )}
        </div>

        {/* Channel mix — real inbound/outbound split */}
        <div className="bg-card rounded-xl border border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Call Direction Mix</h2>
          <p className="text-xs text-slate-500 mb-4">Inbound vs outbound for selected period</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={channelMix} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="channel" tick={{ fill: "#94A3B8", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<DarkTooltip />} />
              <Bar dataKey="count" name="Calls" radius={[6, 6, 0, 0]}>
                {channelMix.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="flex justify-around pt-3 border-t border-slate-700 mt-2">
            {channelMix.map((ch) => {
              const t = channelMix.reduce((s, c) => s + c.count, 0);
              const pct = t > 0 ? ((ch.count / t) * 100).toFixed(0) : 0;
              return (
                <div key={ch.channel} className="text-center">
                  <p className="text-xl font-bold" style={{ color: ch.color }}>{ch.count.toLocaleString()}</p>
                  <p className="text-xs text-slate-400">{ch.channel}</p>
                  <p className="text-xs text-slate-500">{pct}%</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TrendCard({ label, current, previous, color, note, lowerIsBetter }) {
  const change = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  const neutral = Math.abs(change) < 1;
  const improving = lowerIsBetter ? change < 0 : change > 0;
  const changeColor = neutral ? "#94A3B8" : improving ? "#22C55E" : "#EF4444";
  const arrow = change > 0 ? "↑" : "↓";

  return (
    <div className="bg-card rounded-xl border border-slate-700 p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
        <span className="text-xs font-semibold" style={{ color: changeColor }}>
          {neutral ? "—" : `${arrow} ${Math.abs(change).toFixed(1)}%`}
        </span>
      </div>
      <p className="text-2xl font-bold mb-1" style={{ color }}>
        {lowerIsBetter ? fmtSec(current) : current.toLocaleString()}
      </p>
      <p className="text-xs text-slate-500">
        {neutral ? "No change" : `${improving ? "Improved" : "Declined"} vs first day`} · {note}
      </p>
    </div>
  );
}

function CostMetric({ label, value, total }) {
  const num = parseFloat(value.replace("$", ""));
  const color = num < 5 ? "#22C55E" : num < 15 ? "#EAB308" : "#EF4444";
  return (
    <div className="bg-navy rounded-lg p-3 text-center border border-slate-700">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-lg font-bold" style={{ color }}>{value}</p>
      <p className="text-xs text-slate-600">{total?.toLocaleString()} calls</p>
    </div>
  );
}

function EmptyChart({ loading }) {
  return (
    <div className="flex items-center justify-center h-[200px] text-slate-500 text-sm">
      {loading ? "Loading…" : "No data for this period"}
    </div>
  );
}

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

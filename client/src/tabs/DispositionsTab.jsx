import { useState, useEffect } from "react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  fetchConversionRate,
  fetchSaveRate,
  fetchTransferRate,
  fetchOutboundDispositions,
  fetchInboundDispositions,
  fetchCallsByDisp,
} from "../api/client";

// ── Palette ──────────────────────────────────────────────────────────────────
const OUTBOUND_COLORS = ["#14b8a6","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#64748b"];
const INBOUND_COLORS  = ["#22c55e","#06b6d4","#a855f7","#f97316","#64748b"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(v, suffix = "%") {
  if (v == null) return "—";
  return `${Number(v).toFixed(1)}${suffix}`;
}

function thresholdColor(value, lo, hi, reverse = false) {
  if (value == null) return "text-slate-400";
  const good = reverse ? value <= lo : value >= hi;
  const bad  = reverse ? value >= hi : value <= lo;
  if (good) return "text-green-400";
  if (bad)  return "text-red-400";
  return "text-yellow-400";
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, suffix = "%", lo, hi, reverse = false, sub }) {
  const color = thresholdColor(value, lo, hi, reverse);
  return (
    <div className="bg-card rounded-xl p-4 border border-slate-700">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold font-mono ${color}`}>{fmt(value, suffix)}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

// ── Donut Chart ───────────────────────────────────────────────────────────────
function DonutChart({ title, data, colors, loading, error }) {
  if (loading) return (
    <div className="bg-card rounded-xl p-4 border border-slate-700 flex items-center justify-center h-72">
      <span className="text-slate-400 text-sm animate-pulse">Loading…</span>
    </div>
  );
  if (error) return (
    <div className="bg-card rounded-xl p-4 border border-slate-700 flex items-center justify-center h-72">
      <span className="text-red-400 text-sm">{error}</span>
    </div>
  );
  if (!data || data.length === 0) return (
    <div className="bg-card rounded-xl p-4 border border-slate-700 flex items-center justify-center h-72">
      <span className="text-slate-400 text-sm">No data</span>
    </div>
  );

  const total = data.reduce((s, d) => s + (d.count || d.value || 0), 0);

  return (
    <div className="bg-card rounded-xl p-4 border border-slate-700">
      <h3 className="text-sm font-semibold text-slate-200 mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            dataKey={data[0]?.count !== undefined ? "count" : "value"}
            nameKey="label"
            cx="50%" cy="50%"
            innerRadius={55} outerRadius={90}
            paddingAngle={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: "#1e293b", border: "1px solid #475569", borderRadius: 8 }}
            formatter={(v, name) => [`${v} (${total ? ((v/total)*100).toFixed(1) : 0}%)`, name]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(v) => <span style={{ color: "#94a3b8" }}>{v}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Disposition Bar Chart ─────────────────────────────────────────────────────
function DispositionBar({ data, loading, error }) {
  if (loading) return (
    <div className="bg-card rounded-xl p-4 border border-slate-700 flex items-center justify-center h-60">
      <span className="text-slate-400 text-sm animate-pulse">Loading…</span>
    </div>
  );
  if (error) return (
    <div className="bg-card rounded-xl p-4 border border-slate-700 flex items-center justify-center h-60">
      <span className="text-red-400 text-sm">{error}</span>
    </div>
  );
  if (!data || data.length === 0) return (
    <div className="bg-card rounded-xl p-4 border border-slate-700 flex items-center justify-center h-60">
      <span className="text-slate-400 text-sm">No data</span>
    </div>
  );

  const sorted = [...data].sort((a, b) => b.count - a.count).slice(0, 12);

  return (
    <div className="bg-card rounded-xl p-4 border border-slate-700">
      <h3 className="text-sm font-semibold text-slate-200 mb-3">All Dispositions — Volume</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={sorted} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
          <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="disposition"
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            width={140}
            tickFormatter={(v) => v.length > 22 ? `${v.slice(0, 22)}…` : v}
          />
          <Tooltip
            contentStyle={{ background: "#1e293b", border: "1px solid #475569", borderRadius: 8 }}
            cursor={{ fill: "#1e293b88" }}
          />
          <Bar dataKey="count" fill="#14b8a6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Raw Disposition Table ─────────────────────────────────────────────────────
function DispositionTable({ data, loading, error }) {
  const [sort, setSort] = useState({ col: "count", dir: "desc" });

  if (loading) return (
    <div className="bg-card rounded-xl p-4 border border-slate-700 flex items-center justify-center h-40">
      <span className="text-slate-400 text-sm animate-pulse">Loading…</span>
    </div>
  );
  if (error) return (
    <div className="bg-card rounded-xl p-4 border border-slate-700">
      <span className="text-red-400 text-sm">{error}</span>
    </div>
  );
  if (!data || data.length === 0) return (
    <div className="bg-card rounded-xl p-4 border border-slate-700">
      <span className="text-slate-400 text-sm">No disposition data available.</span>
    </div>
  );

  const total = data.reduce((s, d) => s + d.count, 0);

  const sorted = [...data].sort((a, b) => {
    const av = sort.col === "count" ? a.count : a.pct ?? ((a.count / total) * 100);
    const bv = sort.col === "count" ? b.count : b.pct ?? ((b.count / total) * 100);
    return sort.dir === "desc" ? bv - av : av - bv;
  });

  const toggle = (col) =>
    setSort((s) => ({ col, dir: s.col === col && s.dir === "desc" ? "asc" : "desc" }));

  const chevron = (col) =>
    sort.col === col ? (sort.dir === "desc" ? " ▼" : " ▲") : "";

  return (
    <div className="bg-card rounded-xl border border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700">
        <h3 className="text-sm font-semibold text-slate-200">Raw Disposition Breakdown</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase">
              <th className="px-4 py-2 text-left">Disposition</th>
              <th
                className="px-4 py-2 text-right cursor-pointer hover:text-white"
                onClick={() => toggle("count")}
              >
                Count{chevron("count")}
              </th>
              <th
                className="px-4 py-2 text-right cursor-pointer hover:text-white"
                onClick={() => toggle("pct")}
              >
                % of Total{chevron("pct")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const pct = ((row.count / total) * 100).toFixed(1);
              return (
                <tr key={row.disposition} className="border-b border-slate-800 hover:bg-slate-800/40">
                  <td className="px-4 py-2 text-slate-200">{row.disposition}</td>
                  <td className="px-4 py-2 text-right font-mono text-slate-300">{row.count}</td>
                  <td className="px-4 py-2 text-right font-mono">
                    <span className={Number(pct) >= 20 ? "text-teal" : "text-slate-400"}>
                      {pct}%
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr className="bg-slate-800/60 font-semibold">
              <td className="px-4 py-2 text-slate-300">Total</td>
              <td className="px-4 py-2 text-right font-mono text-white">{total}</td>
              <td className="px-4 py-2 text-right font-mono text-slate-400">100.0%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────
export default function DispositionsTab({ filters }) {
  const [conversionRate,      setConversionRate]      = useState(null);
  const [saveRate,            setSaveRate]            = useState(null);
  const [transferRate,        setTransferRate]        = useState(null);
  const [outboundDisp,        setOutboundDisp]        = useState([]);
  const [inboundDisp,         setInboundDisp]         = useState([]);
  const [allDispositions,     setAllDispositions]     = useState([]);
  const [loading,             setLoading]             = useState(true);
  const [error,               setError]               = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    Promise.all([
      fetchConversionRate(filters),
      fetchSaveRate(filters),
      fetchTransferRate(filters),
      fetchOutboundDispositions(filters),
      fetchInboundDispositions(filters),
      fetchCallsByDisp(filters),
    ])
      .then(([conv, save, xfer, outDisp, inDisp, allDisp]) => {
        if (!alive) return;
        setConversionRate(conv?.overall?.conversionRateOfAttempts ?? null);
        setSaveRate(save?.saveRate ?? null);
        setTransferRate(xfer?.transferRate ?? null);
        setOutboundDisp(outDisp ?? []);
        // inboundDisp comes back as { categories: { billing, scheduling, medical, general }, ... }
        const cats = inDisp?.categories ?? {};
        setInboundDisp(
          Object.entries(cats)
            .filter(([, v]) => v > 0)
            .map(([label, count]) => ({ label, count }))
        );
        setAllDispositions(allDisp ?? []);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e.message || "Failed to load data");
        setLoading(false);
      });

    return () => { alive = false; };
  }, [
    filters.start, filters.end,
    filters.agentId, filters.campaignId,
    filters.ani, filters.disposition, filters.direction,
  ]);

  // inboundDisp is already [{ label, count }] after transformation above
  const inboundDonutData = inboundDisp;

  // outboundDisp comes from server as [{ disposition, count, pct }]
  const outboundDonutData = (outboundDisp || []).map((d) => ({
    label: d.disposition || "Other",
    count: d.count ?? 0,
  }));

  return (
    <div className="space-y-4">

      {/* ── Row 1: KPI Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          label="Conversion Rate"
          value={loading ? null : conversionRate}
          lo={10} hi={25}
          sub="Calls with conversionFlag = true"
        />
        <KpiCard
          label="Save Rate"
          value={loading ? null : saveRate}
          lo={30} hi={60}
          sub="Calls with saveFlag = true"
        />
        <KpiCard
          label="Transfer Rate"
          value={loading ? null : transferRate}
          lo={5} hi={20}
          reverse
          sub="Calls transferred to another agent or queue"
        />
      </div>

      {/* ── Row 2: Donut Charts ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <DonutChart
          title="Outbound Disposition Breakdown"
          data={outboundDonutData}
          colors={OUTBOUND_COLORS}
          loading={loading}
          error={error}
        />
        <DonutChart
          title="Inbound Support Disposition Breakdown"
          data={inboundDonutData}
          colors={INBOUND_COLORS}
          loading={loading}
          error={error}
        />
      </div>

      {/* ── Row 3: Bar Chart ─────────────────────────────────────────── */}
      <DispositionBar
        data={allDispositions}
        loading={loading}
        error={error}
      />

      {/* ── Row 4: Raw Table ──────────────────────────────────────────── */}
      <DispositionTable
        data={allDispositions}
        loading={loading}
        error={error}
      />

    </div>
  );
}

import { useState, useEffect, useMemo } from "react";
import { fetchCallsByAgent } from "../api/client";

const COLS = [
  { key: "agentName",  label: "Agent",           align: "left",  fmt: (v) => v                  },
  { key: "total",      label: "Total Calls",      align: "right", fmt: (v) => v                  },
  { key: "inbound",    label: "Inbound",          align: "right", fmt: (v) => v                  },
  { key: "outbound",   label: "Outbound",         align: "right", fmt: (v) => v                  },
  { key: "avgDuration",label: "Avg Handle Time",  align: "right", fmt: fmtSec                    },
  { key: "totalDuration", label: "Total Talk Time", align: "right", fmt: (v) => fmtMin(v)        },
];

export default function AgentPerformanceTab({ filters }) {
  const [raw,     setRaw]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState("total");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    setLoading(true);
    fetchCallsByAgent({ start: filters.start, end: filters.end })
      .then(setRaw)
      .finally(() => setLoading(false));
  }, [filters.start, filters.end]);

  const visible = useMemo(
    () => filters.agentId !== "all" ? raw.filter((a) => a.agentId === filters.agentId) : raw,
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
    if (key === sortCol) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortCol(key); setSortDir("desc"); }
  };

  const totalCalls = visible.reduce((s, a) => s + a.total, 0);
  const totalTalk  = visible.reduce((s, a) => s + a.totalDuration, 0);
  const avgAHT     = visible.length > 0
    ? Math.round(visible.reduce((s, a) => s + a.avgDuration, 0) / visible.length)
    : 0;

  return (
    <div className="grid grid-cols-4 gap-4">

      {/* ── Table ─────────────────────────────────────────────────── */}
      <div className="col-span-3 bg-card rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Agent Performance</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {visible.length} agent{visible.length !== 1 ? "s" : ""} · {totalCalls.toLocaleString()} total calls
            </p>
          </div>
          {loading && <span className="text-xs text-slate-500 animate-pulse">Loading…</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/40">
                {COLS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer
                      select-none whitespace-nowrap text-slate-400 hover:text-white transition-colors
                      ${col.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {col.label}
                    {sortCol === col.key && (
                      <span className="ml-1 text-teal">{sortDir === "desc" ? "▼" : "▲"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((agent, idx) => (
                <tr
                  key={agent.agentId}
                  className={`border-b border-slate-700/50 hover:bg-slate-700/25 transition-colors
                    ${idx % 2 === 0 ? "" : "bg-slate-800/20"}`}
                >
                  {COLS.map((col) => (
                    <td
                      key={col.key}
                      className={`px-5 py-3.5 text-sm whitespace-nowrap
                        ${col.align === "right" ? "text-right" : "text-left"}
                        ${col.key === "agentName" ? "font-semibold text-white" : "text-slate-300"}`}
                    >
                      {col.fmt(agent[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
              {sorted.length === 0 && !loading && (
                <tr>
                  <td colSpan={COLS.length} className="px-5 py-10 text-center text-slate-500 text-sm">
                    No agent data for the selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Leaderboard + Summary ──────────────────────────────────── */}
      <div className="space-y-4">

        {/* Top agents */}
        <div className="bg-card rounded-xl border border-slate-700 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Top Agents</h2>
          <div className="space-y-4">
            {sorted.slice(0, 5).map((agent, idx) => {
              const maxCalls = sorted[0]?.total || 1;
              const pct = (agent.total / maxCalls) * 100;
              const medals = ["🥇", "🥈", "🥉"];
              return (
                <div key={agent.agentId}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-center text-sm">
                        {medals[idx] ?? <span className="text-slate-500 text-xs font-bold">#{idx+1}</span>}
                      </span>
                      <span className="text-sm font-medium text-white truncate max-w-[110px]">
                        {agent.agentName.split(" ")[0]}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-teal">{agent.total}</span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: idx === 0 ? "#F59E0B" : "#00BCD4" }}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">AHT {fmtSec(agent.avgDuration)}</p>
                </div>
              );
            })}
            {sorted.length === 0 && (
              <p className="text-slate-500 text-xs text-center">No data</p>
            )}
          </div>
        </div>

        {/* Period summary */}
        {visible.length > 0 && (
          <div className="bg-card rounded-xl border border-slate-700 p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Period Summary</h2>
            <div className="space-y-2.5">
              <SummaryRow label="Total Calls"    value={totalCalls.toLocaleString()} />
              <SummaryRow label="Agents Active"  value={visible.length} />
              <SummaryRow label="Avg AHT"        value={fmtSec(avgAHT)} />
              <SummaryRow label="Total Talk Time" value={fmtMin(totalTalk)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-white font-semibold">{value}</span>
    </div>
  );
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

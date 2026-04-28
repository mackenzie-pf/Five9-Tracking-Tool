import { useState } from "react";
import useAlerts from "../hooks/useAlerts";

const CATEGORY_ICONS = {
  Queue:    "⏱",
  Outbound: "📞",
  ANI:      "📡",
  Agent:    "👤",
  Outcomes: "📊",
};

export default function AlertBanner({ filters }) {
  const { alerts, loading, lastChecked, refresh } = useAlerts(filters);
  const [expanded, setExpanded] = useState(false);

  // Don't render while loading on first mount or when there's nothing to show
  if (loading && !alerts.length) return null;
  if (!loading && !alerts.length) return null;

  const critical = alerts.filter((a) => a.level === "CRITICAL");
  const warnings = alerts.filter((a) => a.level === "WARNING");

  return (
    <div className="border-b border-slate-700 bg-slate-900/80">
      {/* ── Collapsed summary bar ──────────────────────────────────────── */}
      <div className="px-6 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* Pulsing dot for critical */}
          {critical.length > 0 && (
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
          )}

          {critical.length > 0 && (
            <span className="text-xs font-bold text-red-400 flex-shrink-0">
              {critical.length} CRITICAL
            </span>
          )}
          {warnings.length > 0 && (
            <span className="text-xs font-bold text-yellow-400 flex-shrink-0">
              {warnings.length} WARNING
            </span>
          )}

          {/* Top alert preview */}
          {!expanded && alerts[0] && (
            <span className="text-xs text-slate-400 truncate hidden sm:block">
              — {alerts[0].message}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {lastChecked && (
            <span className="text-xs text-slate-600 hidden md:block">
              Checked {lastChecked.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={refresh}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            title="Refresh alerts"
          >
            ↻
          </button>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-0.5 rounded border border-slate-700 hover:border-slate-500"
          >
            {expanded ? "Collapse ▲" : `View all (${alerts.length}) ▼`}
          </button>
        </div>
      </div>

      {/* ── Expanded alert list ────────────────────────────────────────── */}
      {expanded && (
        <div className="px-6 pb-3 space-y-1.5 max-h-64 overflow-y-auto">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`flex items-start gap-2.5 text-xs py-1.5 px-3 rounded-lg border ${
                alert.level === "CRITICAL"
                  ? "bg-red-500/10 border-red-500/20"
                  : "bg-yellow-500/10 border-yellow-500/20"
              }`}
            >
              {/* Severity pill */}
              <span
                className={`font-bold flex-shrink-0 w-14 text-center py-0.5 rounded text-[10px] ${
                  alert.level === "CRITICAL"
                    ? "bg-red-500/30 text-red-300"
                    : "bg-yellow-500/30 text-yellow-300"
                }`}
              >
                {alert.level === "CRITICAL" ? "CRITICAL" : "WARN"}
              </span>

              {/* Category */}
              <span className="text-slate-500 flex-shrink-0 w-20">
                {CATEGORY_ICONS[alert.category] ?? ""} {alert.category}
              </span>

              {/* Message */}
              <span className="text-slate-300 flex-1 leading-relaxed">
                {alert.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

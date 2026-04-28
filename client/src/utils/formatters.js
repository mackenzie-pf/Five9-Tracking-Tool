/**
 * Shared display formatters.
 *
 * fmtMetricValue(value, format) dispatches to the correct formatter when
 * the format type is determined at runtime (e.g. driven by METRICS registry).
 * Prefer calling the specific formatter directly when the type is known statically.
 */

/** "4:32" or "1:04:32" from raw seconds */
export function fmtDuration(seconds) {
  if (seconds == null || isNaN(seconds)) return "—";
  const s   = Math.round(seconds);
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) {
    const h   = Math.floor(m / 60);
    const rem = m % 60;
    return `${h}:${String(rem).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** "75.4%" */
export function fmtPercent(value, decimals = 1) {
  if (value == null || isNaN(value)) return "—";
  return `${parseFloat(value).toFixed(decimals)}%`;
}

/** "1,234" */
export function fmtCount(value) {
  if (value == null || isNaN(value)) return "—";
  return Math.round(value).toLocaleString();
}

/** "Apr 28, 2026" */
export function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

/** "Apr 28, 2026 9:41 AM" */
export function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

/** "▲ 12.3%" or "▼ 4.1%" */
export function fmtDelta(value, decimals = 1) {
  if (value == null || isNaN(value)) return "—";
  const arrow = value >= 0 ? "▲" : "▼";
  return `${arrow} ${Math.abs(value).toFixed(decimals)}%`;
}

/**
 * Dispatch to the correct formatter using a metric's `format` field.
 *   "duration" → fmtDuration
 *   "percent"  → fmtPercent
 *   "count"    → fmtCount
 *   "text"     → raw string
 */
export function fmtMetricValue(value, format) {
  switch (format) {
    case "duration": return fmtDuration(value);
    case "percent":  return fmtPercent(value);
    case "count":    return fmtCount(value);
    default:         return value != null ? String(value) : "—";
  }
}

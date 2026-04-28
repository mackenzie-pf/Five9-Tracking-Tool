/**
 * Centralized KPI threshold configuration.
 * All alert logic, report color coding, and status badges read from here.
 * Change targets in one place — nothing else needs to be edited.
 *
 * direction: "high" = alert when value exceeds threshold (higher is worse)
 *            "low"  = alert when value falls below threshold (lower is worse)
 */
export const THRESHOLDS = {
  // ── Queue Performance ─────────────────────────────────────────────────────
  avgQueueWaitSeconds: { warn: 45,  crit: 90,  direction: "high", label: "Avg Queue Wait"        },
  longestWaitSeconds:  { warn: 90,  crit: 180, direction: "high", label: "Longest Wait"          },
  serviceLevel:        { warn: 70,  crit: 60,  direction: "low",  label: "Service Level %"       },
  inboundAbandonRate:  { warn: 5,   crit: 10,  direction: "high", label: "Inbound Abandon Rate %" },

  // ── Outbound / ANI ────────────────────────────────────────────────────────
  pickupRateOverall:   { warn: 40,  crit: 25,  direction: "low",  label: "Overall Pickup Rate %" },
  pickupRatePerANI:    { warn: 40,  crit: 25,  direction: "low",  label: "ANI Pickup Rate %"     },
  outboundAbandonRate: { warn: 5,   crit: 10,  direction: "high", label: "Outbound Abandon Rate %"},

  // ── Agent Efficiency ──────────────────────────────────────────────────────
  utilizationRate:     { warn: 65,  crit: 50,  direction: "low",  label: "Agent Utilization %"  },
  ahtSeconds:          { warn: 480, crit: 600, direction: "high", label: "AHT (s)"              },
  wrapUpTimeSeconds:   { warn: 120, crit: 180, direction: "high", label: "Wrap-Up Time (s)"     },
  idleTimePct:         { warn: 35,  crit: 50,  direction: "high", label: "Agent Idle Time %"    },

  // ── Outcomes ──────────────────────────────────────────────────────────────
  conversionRate:      { warn: 15,  crit: 10,  direction: "low",  label: "Conversion Rate %"   },
  saveRate:            { warn: 40,  crit: 30,  direction: "low",  label: "Save Rate %"          },
};

/**
 * Returns "ok" | "warn" | "crit" for a metric value against its threshold config.
 */
export function getLevel(key, value) {
  const t = THRESHOLDS[key];
  if (!t || value == null) return "ok";
  if (t.direction === "high") {
    if (value >= t.crit) return "crit";
    if (value >= t.warn) return "warn";
  } else {
    if (value <= t.crit) return "crit";
    if (value <= t.warn) return "warn";
  }
  return "ok";
}

/** Tailwind text color for a level string. */
export function levelColor(level) {
  if (level === "crit") return "text-red-400";
  if (level === "warn") return "text-yellow-400";
  return "text-green-400";
}

/** Tailwind bg+border classes for a level string. */
export function levelBg(level) {
  if (level === "crit") return "bg-red-500/10 border-red-500/30";
  if (level === "warn") return "bg-yellow-500/10 border-yellow-500/30";
  return "bg-green-500/10 border-green-500/30";
}

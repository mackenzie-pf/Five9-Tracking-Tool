import { useState, useEffect, useCallback } from "react";
import { evaluateAlerts } from "../utils/alertEngine";
import {
  fetchAvgQueueWait,
  fetchLongestWait,
  fetchServiceLevel,
  fetchInboundAbandonRate,
  fetchPickupRate,
  fetchPickupRateByANI,
  fetchOutboundAbandonRate,
  fetchUtilization,
  fetchAHT,
  fetchConversionRate,
  fetchSaveRate,
} from "../api/client";

/**
 * Fetches all KPI data needed for threshold evaluation and returns
 * a live alert list that refreshes whenever filters change.
 *
 * @param {object} filters  Global filter state from App
 * @returns {{ alerts, loading, lastChecked, refresh }}
 */
export default function useAlerts(filters) {
  const [alerts,      setAlerts]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [lastChecked, setLastChecked] = useState(null);
  const [tick,        setTick]        = useState(0);

  // Expose a manual refresh trigger
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    Promise.all([
      fetchAvgQueueWait(filters),
      fetchLongestWait(filters),
      fetchServiceLevel(filters),
      fetchInboundAbandonRate(filters),
      fetchPickupRate(filters),
      fetchPickupRateByANI(filters),
      fetchOutboundAbandonRate(filters),
      fetchUtilization(filters),
      fetchAHT(filters),
      fetchConversionRate(filters),
      fetchSaveRate(filters),
    ])
      .then(([
        avgQueueWait, longestWait, serviceLevel, inboundAbandonRate,
        pickupRate, aniHealth, outboundAbandonRate,
        utilization, aht, conversionRate, saveRate,
      ]) => {
        if (!alive) return;
        setAlerts(evaluateAlerts({
          avgQueueWait, longestWait, serviceLevel, inboundAbandonRate,
          pickupRate, aniHealth, outboundAbandonRate,
          utilization, aht, conversionRate, saveRate,
        }));
        setLastChecked(new Date());
      })
      .catch(() => { if (alive) setAlerts([]); })
      .finally(() => { if (alive) setLoading(false); });

    return () => { alive = false; };
  }, [
    filters.start, filters.end,
    filters.agentId, filters.campaignId,
    filters.ani, filters.disposition, filters.direction,
    tick,
  ]);

  return { alerts, loading, lastChecked, refresh };
}

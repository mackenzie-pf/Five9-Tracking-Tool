import { useState, useEffect } from "react";

/**
 * Fetches a single metric endpoint and tracks loading / error state.
 *
 * Usage:
 *   const { data, loading, error } = useMetric(fetchServiceLevel, filters);
 *
 * Re-fetches whenever any filter dimension changes.
 * Uses an "alive" flag so stale async results are discarded if the component
 * unmounts or filters change before the previous request completes.
 */
export default function useMetric(fetchFn, filters, extraDeps = []) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    fetchFn(filters)
      .then((d)  => { if (alive) { setData(d);  setLoading(false); } })
      .catch((e) => { if (alive) { setError(e.message || "Load failed"); setLoading(false); } });

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.start, filters.end,
    filters.agentId, filters.campaignId,
    filters.ani, filters.disposition, filters.direction,
    ...extraDeps,
  ]);

  return { data, loading, error };
}

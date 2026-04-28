import { useState, useCallback } from "react";
import { getPresetRange } from "../constants/datePresets";

function nowStr() {
  const d = new Date();
  return d.toISOString().slice(0, 16);
}

function todayStartStr() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

const DEFAULT_FILTERS = {
  start:       todayStartStr(),
  end:         nowStr(),
  direction:   "all",
  agentId:     "all",
  campaignId:  "all",
  ani:         "all",
  disposition: "all",
};

/**
 * Central filter state for all tabs.
 *
 * Returns:
 *   filters            — current filter values (start, end, direction, agentId, campaignId, ani, disposition)
 *   activePreset       — id of the active date preset, or "custom" if dates were set manually
 *   updateFilter(k,v)  — update a single filter; changes to start/end flip activePreset to "custom"
 *   clearFilter(k)     — reset one dimension filter to "all"
 *   clearAllDimensions — reset all dimension filters (direction, agent, campaign, ANI, disposition) to "all"
 *   applyPreset(id)    — apply a DATE_PRESETS entry by id; updates start/end automatically
 */
export function useFilters() {
  const [filters,      setFilters]      = useState(DEFAULT_FILTERS);
  const [activePreset, setActivePreset] = useState("today");

  const updateFilter = useCallback((key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    if (key === "start" || key === "end") {
      setActivePreset("custom");
    }
  }, []);

  const clearFilter = useCallback((key) => {
    setFilters((f) => ({ ...f, [key]: "all" }));
  }, []);

  const clearAllDimensions = useCallback(() => {
    setFilters((f) => ({
      ...f,
      direction:   "all",
      agentId:     "all",
      campaignId:  "all",
      ani:         "all",
      disposition: "all",
    }));
  }, []);

  const applyPreset = useCallback((presetId) => {
    setActivePreset(presetId);
    if (presetId === "custom") return; // user sets dates manually — don't overwrite
    const range = getPresetRange(presetId);
    if (range) {
      setFilters((f) => ({ ...f, start: range.start, end: range.end }));
    }
  }, []);

  return { filters, activePreset, updateFilter, clearFilter, clearAllDimensions, applyPreset };
}

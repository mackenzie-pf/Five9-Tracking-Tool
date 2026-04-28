/**
 * Date range presets for the global filter bar.
 *
 * Each preset has:
 *   id       — stable identifier used to track the active preset in state
 *   label    — display text on the button
 *   getRange — function returning { start, end } as "YYYY-MM-DDTHH:MM" strings,
 *              or null for the "Custom" sentinel (user sets dates manually)
 *
 * To add a new preset: append a new object here — GlobalFilters picks it up automatically.
 */

function toLocalISO(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export const DATE_PRESETS = [
  {
    id:    "today",
    label: "Today",
    getRange() {
      const s = new Date(); s.setHours(0, 0, 0, 0);
      return { start: toLocalISO(s), end: toLocalISO(new Date()) };
    },
  },
  {
    id:    "yesterday",
    label: "Yesterday",
    getRange() {
      const s = new Date(); s.setDate(s.getDate() - 1); s.setHours(0, 0, 0, 0);
      const e = new Date(s); e.setHours(23, 59, 0, 0);
      return { start: toLocalISO(s), end: toLocalISO(e) };
    },
  },
  {
    id:    "this_week",
    label: "This Week",
    getRange() {
      // Week starts Monday
      const s = new Date();
      const day = s.getDay();
      const diff = day === 0 ? -6 : 1 - day; // adjust Sun (0) back 6 days
      s.setDate(s.getDate() + diff); s.setHours(0, 0, 0, 0);
      return { start: toLocalISO(s), end: toLocalISO(new Date()) };
    },
  },
  {
    id:    "last_week",
    label: "Last Week",
    getRange() {
      const now  = new Date();
      const day  = now.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const s    = new Date(now); s.setDate(s.getDate() + diff - 7); s.setHours(0, 0, 0, 0);
      const e    = new Date(s);   e.setDate(e.getDate() + 6);        e.setHours(23, 59, 0, 0);
      return { start: toLocalISO(s), end: toLocalISO(e) };
    },
  },
  {
    id:    "this_month",
    label: "This Month",
    getRange() {
      const s = new Date(); s.setDate(1); s.setHours(0, 0, 0, 0);
      return { start: toLocalISO(s), end: toLocalISO(new Date()) };
    },
  },
  {
    id:    "last_month",
    label: "Last Month",
    getRange() {
      const s = new Date(); s.setDate(1); s.setMonth(s.getMonth() - 1); s.setHours(0, 0, 0, 0);
      const e = new Date(); e.setDate(0); e.setHours(23, 59, 0, 0); // last day of prev month
      return { start: toLocalISO(s), end: toLocalISO(e) };
    },
  },
  {
    id:       "custom",
    label:    "Custom",
    getRange: null, // sentinel — user sets start/end manually
  },
];

/** Returns the preset with the given id, or null. */
export function getPreset(id) {
  return DATE_PRESETS.find((p) => p.id === id) ?? null;
}

/**
 * Returns { start, end } for a named preset, or null if the preset has no getRange
 * (i.e. the "custom" sentinel).
 */
export function getPresetRange(id) {
  const preset = getPreset(id);
  return preset?.getRange ? preset.getRange() : null;
}

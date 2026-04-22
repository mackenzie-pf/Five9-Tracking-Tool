import { useMemo } from "react";

const DIRECTIONS = [
  { value: "all",      label: "All Directions" },
  { value: "inbound",  label: "Inbound Only"   },
  { value: "outbound", label: "Outbound Only"  },
];

function toLocalISO(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const QUICK_RANGES = [
  {
    label: "Today",
    get() {
      const s = new Date(); s.setHours(0,0,0,0);
      return { start: toLocalISO(s), end: toLocalISO(new Date()) };
    },
  },
  {
    label: "Yesterday",
    get() {
      const s = new Date(); s.setDate(s.getDate()-1); s.setHours(0,0,0,0);
      const e = new Date(); e.setDate(e.getDate()-1); e.setHours(23,59,0,0);
      return { start: toLocalISO(s), end: toLocalISO(e) };
    },
  },
  {
    label: "Last 7 Days",
    get() {
      const s = new Date(); s.setDate(s.getDate()-6); s.setHours(0,0,0,0);
      return { start: toLocalISO(s), end: toLocalISO(new Date()) };
    },
  },
  {
    label: "This Month",
    get() {
      const s = new Date(); s.setDate(1); s.setHours(0,0,0,0);
      return { start: toLocalISO(s), end: toLocalISO(new Date()) };
    },
  },
  {
    label: "Last 30 Days",
    get() {
      const s = new Date(); s.setDate(s.getDate()-29); s.setHours(0,0,0,0);
      return { start: toLocalISO(s), end: toLocalISO(new Date()) };
    },
  },
];

export default function GlobalFilters({ filters, refData, onUpdate, onClear }) {
  const { agents, campaigns, anis, dispositions = [] } = refData;

  const chips = useMemo(() => {
    const list = [];
    if (filters.direction !== "all")
      list.push({ key: "direction", label: `Direction: ${filters.direction}` });
    if (filters.agentId !== "all") {
      const a = agents.find((x) => x.id === filters.agentId);
      list.push({ key: "agentId", label: `Agent: ${a?.name ?? filters.agentId}` });
    }
    if (filters.campaignId !== "all")
      list.push({ key: "campaignId", label: `Campaign: ${filters.campaignId}` });
    if (filters.ani !== "all")
      list.push({ key: "ani", label: `ANI: ${filters.ani}` });
    if (filters.disposition !== "all")
      list.push({ key: "disposition", label: `Disposition: ${filters.disposition}` });
    return list;
  }, [filters, agents]);

  const clearAll = () =>
    ["direction", "agentId", "campaignId", "ani", "disposition"].forEach(onClear);

  const applyQuick = (range) => {
    const { start, end } = range.get();
    onUpdate("start", start);
    onUpdate("end", end);
  };

  return (
    <div className="bg-[#162032] border-b border-slate-700 px-6 py-3">

      {/* ── Quick-range buttons ────────────────────────────────────── */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {QUICK_RANGES.map((r) => (
          <button
            key={r.label}
            onClick={() => applyQuick(r)}
            className="text-xs px-3 py-1 rounded-full border border-slate-600 text-slate-300
                       hover:border-teal hover:text-teal transition-colors"
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* ── Filter row ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-end">

        <div className="flex items-end gap-2">
          <Field label="Start">
            <input
              type="datetime-local"
              value={filters.start}
              onChange={(e) => onUpdate("start", e.target.value)}
              className="input-dark"
            />
          </Field>
          <span className="text-slate-500 pb-1.5 text-sm">→</span>
          <Field label="End">
            <input
              type="datetime-local"
              value={filters.end}
              onChange={(e) => onUpdate("end", e.target.value)}
              className="input-dark"
            />
          </Field>
        </div>

        <Select
          label="Direction"
          value={filters.direction}
          onChange={(v) => onUpdate("direction", v)}
          options={DIRECTIONS}
        />

        <Select
          label="Agent"
          value={filters.agentId}
          onChange={(v) => onUpdate("agentId", v)}
          options={[
            { value: "all", label: "All Agents" },
            ...agents.map((a) => ({ value: a.id, label: a.name })),
          ]}
        />

        <Select
          label="Campaign"
          value={filters.campaignId}
          onChange={(v) => onUpdate("campaignId", v)}
          options={[
            { value: "all", label: "All Campaigns" },
            ...campaigns.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />

        <Select
          label="Phone (ANI)"
          value={filters.ani}
          onChange={(v) => onUpdate("ani", v)}
          options={[
            { value: "all", label: "All ANIs" },
            ...anis.map((a) => ({ value: a.number, label: a.number })),
          ]}
        />

        <Select
          label="Disposition"
          value={filters.disposition}
          onChange={(v) => onUpdate("disposition", v)}
          options={[
            { value: "all", label: "All Dispositions" },
            ...dispositions.map((d) => ({ value: d, label: d })),
          ]}
        />
      </div>

      {/* ── Active chips ───────────────────────────────────────────── */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          <span className="text-xs text-slate-500">Active:</span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              onClick={() => onClear(chip.key)}
              className="flex items-center gap-1 bg-teal/10 border border-teal/30 text-cyan-300
                         text-xs px-2.5 py-0.5 rounded-full hover:bg-teal/20 transition-colors"
            >
              {chip.label}
              <span className="text-teal text-base leading-none ml-0.5">×</span>
            </button>
          ))}
          <button
            onClick={clearAll}
            className="text-xs text-slate-500 hover:text-white transition-colors ml-1"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <Field label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-navy border border-slate-600 text-white text-xs rounded px-2 py-1.5
                   focus:border-teal outline-none cursor-pointer min-w-[150px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

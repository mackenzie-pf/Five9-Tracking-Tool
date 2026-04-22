import { useState, useEffect } from "react";
import GlobalFilters from "./components/GlobalFilters";
import RealTimeTab from "./tabs/RealTimeTab";
import AgentPerformanceTab from "./tabs/AgentPerformanceTab";
import OutboundTrackingTab from "./tabs/OutboundTrackingTab";
import StrategicTrendsTab from "./tabs/StrategicTrendsTab";
import { fetchAgents, fetchCampaigns, fetchANIs, fetchCallsByDisp } from "./api/client";
import { generateWeeklyReport } from "./utils/reportGenerator";

const TABS = [
  { id: "realtime",  label: "Real-Time Operations"   },
  { id: "outbound",  label: "Call Volume & Outbound" },
  { id: "agents",    label: "Agent Performance"      },
  { id: "strategic", label: "Strategic & Trends"     },
];

function nowStr() {
  return new Date().toISOString().slice(0, 16);
}
function todayStartStr() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export default function App() {
  const [activeTab, setActiveTab] = useState("realtime");
  const [time, setTime] = useState(new Date().toLocaleTimeString());

  const [filters, setFilters] = useState({
    start:       todayStartStr(),
    end:         nowStr(),
    direction:   "all",
    agentId:     "all",
    campaignId:  "all",
    ani:         "all",
    disposition: "all",
  });

  const [refData,   setRefData]   = useState({ agents: [], campaigns: [], anis: [], dispositions: [] });
  const [pdfStatus, setPdfStatus] = useState("");

  // Load reference data once
  useEffect(() => {
    Promise.all([fetchAgents(), fetchCampaigns(), fetchANIs(), fetchCallsByDisp({})]).then(
      ([agents, campaigns, anis, disp]) =>
        setRefData({ agents, campaigns, anis, dispositions: disp.map((d) => d.disposition) })
    );
  }, []);

  // Clock
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(id);
  }, []);

  const updateFilter = (key, value) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const clearFilter = (key) =>
    setFilters((f) => ({ ...f, [key]: "all" }));

  return (
    <div className="min-h-screen bg-navy text-white font-sans">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="bg-card border-b border-slate-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-8 bg-teal rounded-full" />
          <div>
            <h1 className="text-base font-bold tracking-wide">Five9 Call Center Analytics</h1>
            <p className="text-xs text-slate-400">Telemedicine Weight Loss Operations</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {pdfStatus && (
            <span className={`text-xs ${pdfStatus.startsWith("✓") ? "text-green-400" : pdfStatus.startsWith("Error") ? "text-red-400" : "text-slate-400"}`}>
              {pdfStatus}
            </span>
          )}
          <button
            onClick={async () => {
              setPdfStatus("Building PDF…");
              try {
                const f = await generateWeeklyReport((m) => setPdfStatus(m));
                setPdfStatus(`✓ ${f}`);
                setTimeout(() => setPdfStatus(""), 4000);
              } catch (e) {
                setPdfStatus(`Error: ${e.message}`);
              }
            }}
            className="text-xs px-3 py-1.5 rounded-lg border border-teal text-teal hover:bg-teal hover:text-navy transition-all font-medium"
          >
            📊 Weekly PDF
          </button>
          <span className="flex items-center gap-1.5 text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live
          </span>
          <span className="text-xs text-slate-400 font-mono">{time}</span>
        </div>
      </header>

      {/* ── Global Filters ─────────────────────────────────────────── */}
      <GlobalFilters
        filters={filters}
        refData={refData}
        onUpdate={updateFilter}
        onClear={clearFilter}
      />

      {/* ── Tab Navigation ─────────────────────────────────────────── */}
      <div className="bg-card border-b border-slate-700 px-6">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-teal text-teal"
                  : "border-transparent text-slate-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ────────────────────────────────────────────── */}
      <main className="p-4">
        {activeTab === "realtime"  && <RealTimeTab         filters={filters} />}
        {activeTab === "outbound"  && <OutboundTrackingTab filters={filters} />}
        {activeTab === "agents"    && <AgentPerformanceTab filters={filters} />}
        {activeTab === "strategic" && <StrategicTrendsTab  filters={filters} />}
      </main>
    </div>
  );
}

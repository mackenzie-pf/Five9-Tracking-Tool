/**
 * five9Client.js
 * Connects to the Five9 Configuration Web Services SOAP API (v13).
 * Runs the configured Call Log report and returns raw CSV text.
 *
 * Docs reference: runReport → isReportRunning (poll) → getReportResultCsv
 */

const soap = require("soap");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

const USERNAME = process.env.FIVE9_USERNAME;
const PASSWORD = process.env.FIVE9_PASSWORD;
const DC       = process.env.FIVE9_DATA_CENTER || "ca";
const FOLDER   = process.env.FIVE9_REPORT_FOLDER || "Call Log Reports";
const RNAME    = process.env.FIVE9_REPORT_NAME   || "Call Log";

const WSDL_URL = `https://api.five9.${DC}/wsadmin/v13/AdminWebService?wsdl&user=${USERNAME}`;

let _client = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── SOAP client (created once, reused) ───────────────────────────
async function getClient() {
  if (_client) return _client;

  if (!USERNAME || !PASSWORD) {
    throw new Error("FIVE9_USERNAME / FIVE9_PASSWORD not set in .env");
  }

  console.log(`[Five9] Connecting to ${WSDL_URL.split("?")[0]}...`);
  const client = await soap.createClientAsync(WSDL_URL);
  client.setSecurity(new soap.BasicAuthSecurity(USERNAME, PASSWORD));

  _client = client;
  console.log("[Five9] SOAP client ready");
  return client;
}

// ── Run report and return CSV string ─────────────────────────────
async function fetchReportCsv(startDate, endDate) {
  const client = await getClient();

  const startISO = toISO(startDate);
  const endISO   = toISO(endDate);

  console.log(`[Five9] Running "${FOLDER}/${RNAME}" [${startISO} → ${endISO}]`);

  // 1. Start the report job
  let runRes;
  try {
    [runRes] = await client.runReportAsync({
      folderName: FOLDER,
      reportName: RNAME,
      criteria: {
        time: { start: startISO, end: endISO }
      }
    });
  } catch (err) {
    // Unwrap SOAP fault message for readability
    const msg = err.root?.Envelope?.Body?.Fault?.faultstring || err.message;
    throw new Error(`runReport failed: ${msg}`);
  }

  const identifier = runRes?.return;
  if (!identifier) throw new Error("Five9 returned no report identifier");

  // 2. Poll until the report finishes (max 5 minutes)
  let running = true;
  let polls   = 0;
  const MAX_POLLS = 150; // 150 × 2 s = 5 min

  while (running && polls < MAX_POLLS) {
    await sleep(2000);
    const [statusRes] = await client.isReportRunningAsync({ identifier, timeout: 5 });
    running = !!statusRes?.return;
    polls++;
    if (running) process.stdout.write(".");
  }

  if (running) throw new Error("Report timed out after 5 minutes");
  console.log(`\n[Five9] Report ready (polled ${polls}x)`);

  // 3. Retrieve CSV
  const [csvRes] = await client.getReportResultCsvAsync({ identifier });
  const csv = csvRes?.return || "";
  console.log(`[Five9] Received ${csv.length} bytes of CSV`);
  return csv;
}

// ── Fetch campaign type map ───────────────────────────────────────
// Returns Map<campaignName, "inbound"|"outbound"> from Five9 config.
// Tries several v13 SOAP methods in order; returns empty map if none work.
async function fetchCampaignTypeMap() {
  const client  = await getClient();
  const result  = new Map();
  const toArray = (v) => (Array.isArray(v) ? v : v != null ? [v] : []);

  // getCampaignProfiles — returns profiles with type field
  try {
    const [res] = await client.getCampaignProfilesAsync({});
    for (const p of toArray(res?.return)) {
      if (p.name && p.type) result.set(p.name, p.type.toLowerCase());
    }
    if (result.size > 0) {
      console.log(`[Five9] getCampaignProfiles → ${result.size} campaigns`);
      return result;
    }
  } catch {}

  // getDialingRules — outbound-only, no explicit type field needed
  try {
    const [res] = await client.getDialingRulesAsync({});
    for (const r of toArray(res?.return)) {
      const name = r.name || r.campaignName;
      if (name) result.set(name, "outbound");
    }
    if (result.size > 0) {
      console.log(`[Five9] getDialingRules → ${result.size} outbound campaigns`);
      return result;
    }
  } catch {}

  // getCampaigns — generic list, check for a type field
  try {
    const [res] = await client.getCampaignsAsync({});
    for (const c of toArray(res?.return)) {
      const name = c.name || c.campaignName;
      const type = (c.type || c.campaignType || "").toLowerCase();
      if (name && type) result.set(name, type.includes("outbound") ? "outbound" : "inbound");
    }
    if (result.size > 0) {
      console.log(`[Five9] getCampaigns → ${result.size} campaigns`);
      return result;
    }
  } catch {}

  console.log("[Five9] No campaign-type API available; classification will use name heuristics");
  return result; // empty — caller falls back to regex
}

function toISO(val) {
  if (val instanceof Date) return val.toISOString();
  const d = new Date(val);
  return isNaN(d) ? String(val) : d.toISOString();
}

module.exports = { fetchReportCsv, fetchCampaignTypeMap };

// data/mockData.js
// Structured so every array can be swapped for a PostgreSQL query later.
// callType is deliberately absent from call records — it is derived at
// runtime by the backend classification rules in server.js.

const agents = [
  { id: "agent_1", name: "Sarah Johnson",   role: "Patient Coordinator",   extension: "1001" },
  { id: "agent_2", name: "Mike Chen",       role: "Sales Rep",             extension: "1002" },
  { id: "agent_3", name: "Emily Rodriguez", role: "Medical Scheduler",     extension: "1003" },
  { id: "agent_4", name: "David Williams",  role: "Follow-up Specialist",  extension: "1004" },
  { id: "agent_5", name: "Ashley Brown",    role: "Insurance Coordinator", extension: "1005" },
  { id: "agent_6", name: "James Martinez",  role: "Outreach Specialist",   extension: "1006" },
];

// Numbers owned by the organization and used as outbound caller IDs.
// Rule 1: any call whose ANI matches an entry here is classified as outbound.
const outboundANIs = [
  { number: "+18662141522", label: "Sales Line A"  },
  { number: "+18662141523", label: "Sales Line B"  },
  { number: "+18559871100", label: "Follow-up Line" },
];

// Rule 2: any call whose campaignName matches an outbound campaign is classified
// as outbound, even if its ANI is null (manual dial, no auto-flagging).
const campaigns = [
  { id: "camp_ob1", name: "Weight Loss Outreach",    type: "outbound" },
  { id: "camp_ob2", name: "Follow-Up Campaign",      type: "outbound" },
  { id: "camp_ob3", name: "Prescription Renewal",    type: "outbound" },
  { id: "camp_ob4", name: "New Patient Acquisition", type: "outbound" },
  { id: "camp_ob5", name: "Re-engagement Campaign",  type: "outbound" },
  { id: "camp_ib1", name: "Patient Support",         type: "inbound"  },
  { id: "camp_ib2", name: "Appointment Scheduling",  type: "inbound"  },
  { id: "camp_ib3", name: "General Inquiry",         type: "inbound"  },
  { id: "camp_ib4", name: "Insurance Verification",  type: "inbound"  },
];

// 55 calls spread across two weeks (2026-04-08 → 2026-04-22).
// Calls with ani: null are manual dials — classified via campaign name (Rule 2).
const calls = [

  // ── April 8 (Tuesday) ───────────────────────────────────────────────────
  { id:"c001", timestamp:"2026-04-08T09:15:22", ani:"+18662141522", dnis:"+13055559001", agentId:"agent_2", agentName:"Mike Chen",       campaignId:"camp_ob1", campaignName:"Weight Loss Outreach",    duration:245, disposition:"Appointment Scheduled" },
  { id:"c002", timestamp:"2026-04-08T10:32:44", ani:"+13055551234", dnis:"+18005550100", agentId:"agent_1", agentName:"Sarah Johnson",   campaignId:"camp_ib1", campaignName:"Patient Support",         duration:180, disposition:"Transferred to Nurse"   },
  { id:"c003", timestamp:"2026-04-08T13:45:10", ani:"+18662141523", dnis:"+17865552211", agentId:"agent_6", agentName:"James Martinez",  campaignId:"camp_ob4", campaignName:"New Patient Acquisition", duration: 90, disposition:"No Answer"              },
  { id:"c004", timestamp:"2026-04-08T15:20:33", ani:"+17865559876", dnis:"+18005550101", agentId:"agent_3", agentName:"Emily Rodriguez", campaignId:"camp_ib2", campaignName:"Appointment Scheduling",  duration:320, disposition:"Appointment Scheduled" },

  // ── April 9 (Wednesday) ─────────────────────────────────────────────────
  { id:"c005", timestamp:"2026-04-09T09:01:55", ani:"+18559871100", dnis:"+13055557788", agentId:"agent_4", agentName:"David Williams",  campaignId:"camp_ob2", campaignName:"Follow-Up Campaign",      duration:410, disposition:"Prescription Sent"      },
  { id:"c006", timestamp:"2026-04-09T11:30:00", ani:"+13055558765", dnis:"+18005550100", agentId:"agent_1", agentName:"Sarah Johnson",   campaignId:"camp_ib3", campaignName:"General Inquiry",         duration:125, disposition:"Callback Requested"     },
  // Manual dial — ANI is null, classified outbound via campaign name (Rule 2)
  { id:"c007", timestamp:"2026-04-09T14:15:20", ani:null,           dnis:"+13055554433", agentId:"agent_6", agentName:"James Martinez",  campaignId:"camp_ob5", campaignName:"Re-engagement Campaign",  duration:185, disposition:"Not Interested"         },

  // ── April 10 (Thursday) ─────────────────────────────────────────────────
  { id:"c008", timestamp:"2026-04-10T08:45:00", ani:"+18662141522", dnis:"+13055551122", agentId:"agent_2", agentName:"Mike Chen",       campaignId:"camp_ob1", campaignName:"Weight Loss Outreach",    duration:300, disposition:"Appointment Scheduled" },
  { id:"c009", timestamp:"2026-04-10T09:55:30", ani:"+13055553344", dnis:"+18005550102", agentId:"agent_5", agentName:"Ashley Brown",    campaignId:"camp_ib4", campaignName:"Insurance Verification",  duration:540, disposition:"Transferred to Nurse"   },
  { id:"c010", timestamp:"2026-04-10T11:10:15", ani:"+18559871100", dnis:"+17865556677", agentId:"agent_4", agentName:"David Williams",  campaignId:"camp_ob3", campaignName:"Prescription Renewal",    duration:220, disposition:"Prescription Sent"      },
  { id:"c011", timestamp:"2026-04-10T13:25:42", ani:"+17865554321", dnis:"+18005550100", agentId:"agent_3", agentName:"Emily Rodriguez", campaignId:"camp_ib2", campaignName:"Appointment Scheduling",  duration:195, disposition:"Appointment Scheduled" },
  { id:"c012", timestamp:"2026-04-10T15:50:09", ani:"+18662141523", dnis:"+13055558899", agentId:"agent_6", agentName:"James Martinez",  campaignId:"camp_ob4", campaignName:"New Patient Acquisition", duration: 55, disposition:"No Answer"              },

  // ── April 11 (Friday) ───────────────────────────────────────────────────
  { id:"c013", timestamp:"2026-04-11T09:30:00", ani:"+18662141522", dnis:"+13055552233", agentId:"agent_2", agentName:"Mike Chen",       campaignId:"camp_ob1", campaignName:"Weight Loss Outreach",    duration:380, disposition:"Appointment Scheduled" },
  { id:"c014", timestamp:"2026-04-11T10:45:22", ani:"+13055556677", dnis:"+18005550101", agentId:"agent_1", agentName:"Sarah Johnson",   campaignId:"camp_ib1", campaignName:"Patient Support",         duration:265, disposition:"Callback Requested"     },
  // Manual dial — classified outbound via campaign name (Rule 2)
  { id:"c015", timestamp:"2026-04-11T13:00:00", ani:null,           dnis:"+17865551122", agentId:"agent_4", agentName:"David Williams",  campaignId:"camp_ob2", campaignName:"Follow-Up Campaign",      duration:490, disposition:"Prescription Sent"      },
  { id:"c016", timestamp:"2026-04-11T16:10:55", ani:"+17865558765", dnis:"+18005550100", agentId:"agent_5", agentName:"Ashley Brown",    campaignId:"camp_ib4", campaignName:"Insurance Verification",  duration:310, disposition:"Transferred to Nurse"   },

  // ── April 14 (Monday) ───────────────────────────────────────────────────
  { id:"c017", timestamp:"2026-04-14T08:30:10", ani:"+18662141522", dnis:"+13055554455", agentId:"agent_2", agentName:"Mike Chen",       campaignId:"camp_ob1", campaignName:"Weight Loss Outreach",    duration:205, disposition:"Voicemail Left"         },
  { id:"c018", timestamp:"2026-04-14T09:45:30", ani:"+13055559988", dnis:"+18005550100", agentId:"agent_1", agentName:"Sarah Johnson",   campaignId:"camp_ib2", campaignName:"Appointment Scheduling",  duration:445, disposition:"Appointment Scheduled" },
  { id:"c019", timestamp:"2026-04-14T11:00:00", ani:"+18559871100", dnis:"+13055551199", agentId:"agent_4", agentName:"David Williams",  campaignId:"camp_ob3", campaignName:"Prescription Renewal",    duration:330, disposition:"Prescription Sent"      },
  { id:"c020", timestamp:"2026-04-14T13:30:45", ani:"+18662141523", dnis:"+17865553344", agentId:"agent_6", agentName:"James Martinez",  campaignId:"camp_ob4", campaignName:"New Patient Acquisition", duration:175, disposition:"Not Interested"         },
  { id:"c021", timestamp:"2026-04-14T15:45:00", ani:"+13055557890", dnis:"+18005550101", agentId:"agent_3", agentName:"Emily Rodriguez", campaignId:"camp_ib3", campaignName:"General Inquiry",         duration:240, disposition:"Callback Requested"     },

  // ── April 15 (Tuesday) ──────────────────────────────────────────────────
  { id:"c022", timestamp:"2026-04-15T08:55:00", ani:"+18662141522", dnis:"+13055556688", agentId:"agent_2", agentName:"Mike Chen",       campaignId:"camp_ob1", campaignName:"Weight Loss Outreach",    duration:415, disposition:"Appointment Scheduled" },
  { id:"c023", timestamp:"2026-04-15T10:10:22", ani:"+17865552233", dnis:"+18005550102", agentId:"agent_5", agentName:"Ashley Brown",    campaignId:"camp_ib4", campaignName:"Insurance Verification",  duration:580, disposition:"Transferred to Nurse"   },
  { id:"c024", timestamp:"2026-04-15T11:20:45", ani:"+18559871100", dnis:"+13055554466", agentId:"agent_4", agentName:"David Williams",  campaignId:"camp_ob2", campaignName:"Follow-Up Campaign",      duration:270, disposition:"Appointment Scheduled" },
  { id:"c025", timestamp:"2026-04-15T13:05:10", ani:"+13055553322", dnis:"+18005550100", agentId:"agent_1", agentName:"Sarah Johnson",   campaignId:"camp_ib1", campaignName:"Patient Support",         duration:155, disposition:"Transferred to Nurse"   },
  // Manual dial — classified outbound via campaign name (Rule 2)
  { id:"c026", timestamp:"2026-04-15T14:30:00", ani:null,           dnis:"+13055551177", agentId:"agent_6", agentName:"James Martinez",  campaignId:"camp_ob5", campaignName:"Re-engagement Campaign",  duration:220, disposition:"Already a Patient"      },
  { id:"c027", timestamp:"2026-04-15T16:00:30", ani:"+18662141523", dnis:"+17865556655", agentId:"agent_2", agentName:"Mike Chen",       campaignId:"camp_ob4", campaignName:"New Patient Acquisition", duration: 65, disposition:"No Answer"              },

  // ── April 16 (Wednesday) ────────────────────────────────────────────────
  { id:"c028", timestamp:"2026-04-16T09:00:00", ani:"+13055558833", dnis:"+18005550100", agentId:"agent_3", agentName:"Emily Rodriguez", campaignId:"camp_ib2", campaignName:"Appointment Scheduling",  duration:395, disposition:"Appointment Scheduled" },
  { id:"c029", timestamp:"2026-04-16T10:30:15", ani:"+18559871100", dnis:"+13055552255", agentId:"agent_4", agentName:"David Williams",  campaignId:"camp_ob3", campaignName:"Prescription Renewal",    duration:285, disposition:"Prescription Sent"      },
  { id:"c030", timestamp:"2026-04-16T12:45:33", ani:"+17865559900", dnis:"+18005550101", agentId:"agent_5", agentName:"Ashley Brown",    campaignId:"camp_ib1", campaignName:"Patient Support",         duration:210, disposition:"Callback Requested"     },
  { id:"c031", timestamp:"2026-04-16T15:00:00", ani:"+18662141522", dnis:"+13055557766", agentId:"agent_2", agentName:"Mike Chen",       campaignId:"camp_ob1", campaignName:"Weight Loss Outreach",    duration:330, disposition:"Appointment Scheduled" },

  // ── April 17 (Thursday) ─────────────────────────────────────────────────
  { id:"c032", timestamp:"2026-04-17T09:15:00", ani:"+18662141523", dnis:"+13055558811", agentId:"agent_6", agentName:"James Martinez",  campaignId:"camp_ob4", campaignName:"New Patient Acquisition", duration:245, disposition:"Appointment Scheduled" },
  { id:"c033", timestamp:"2026-04-17T10:30:45", ani:"+13055551144", dnis:"+18005550100", agentId:"agent_1", agentName:"Sarah Johnson",   campaignId:"camp_ib3", campaignName:"General Inquiry",         duration:170, disposition:"Callback Requested"     },
  { id:"c034", timestamp:"2026-04-17T11:45:22", ani:"+18559871100", dnis:"+17865554455", agentId:"agent_4", agentName:"David Williams",  campaignId:"camp_ob2", campaignName:"Follow-Up Campaign",      duration:365, disposition:"Prescription Sent"      },
  { id:"c035", timestamp:"2026-04-17T14:00:10", ani:"+17865557788", dnis:"+18005550102", agentId:"agent_5", agentName:"Ashley Brown",    campaignId:"camp_ib4", campaignName:"Insurance Verification",  duration:490, disposition:"Transferred to Nurse"   },
  // Manual dial — classified outbound via campaign name (Rule 2)
  { id:"c036", timestamp:"2026-04-17T15:30:00", ani:null,           dnis:"+13055553388", agentId:"agent_2", agentName:"Mike Chen",       campaignId:"camp_ob1", campaignName:"Weight Loss Outreach",    duration:135, disposition:"Voicemail Left"         },

  // ── April 18 (Friday) ───────────────────────────────────────────────────
  { id:"c037", timestamp:"2026-04-18T09:45:00", ani:"+18662141522", dnis:"+13055559922", agentId:"agent_2", agentName:"Mike Chen",       campaignId:"camp_ob4", campaignName:"New Patient Acquisition", duration:280, disposition:"Appointment Scheduled" },
  { id:"c038", timestamp:"2026-04-18T11:00:30", ani:"+13055556644", dnis:"+18005550100", agentId:"agent_3", agentName:"Emily Rodriguez", campaignId:"camp_ib2", campaignName:"Appointment Scheduling",  duration:355, disposition:"Appointment Scheduled" },
  { id:"c039", timestamp:"2026-04-18T13:15:00", ani:"+18662141523", dnis:"+17865558844", agentId:"agent_6", agentName:"James Martinez",  campaignId:"camp_ob5", campaignName:"Re-engagement Campaign",  duration:195, disposition:"Not Interested"         },
  { id:"c040", timestamp:"2026-04-18T15:30:22", ani:"+17865553322", dnis:"+18005550101", agentId:"agent_1", agentName:"Sarah Johnson",   campaignId:"camp_ib1", campaignName:"Patient Support",         duration:225, disposition:"Transferred to Nurse"   },

  // ── April 21 (Monday) ───────────────────────────────────────────────────
  { id:"c041", timestamp:"2026-04-21T08:30:00", ani:"+18662141522", dnis:"+13055557711", agentId:"agent_2", agentName:"Mike Chen",       campaignId:"camp_ob1", campaignName:"Weight Loss Outreach",    duration:355, disposition:"Appointment Scheduled" },
  { id:"c042", timestamp:"2026-04-21T09:15:44", ani:"+13055554422", dnis:"+18005550100", agentId:"agent_1", agentName:"Sarah Johnson",   campaignId:"camp_ib2", campaignName:"Appointment Scheduling",  duration:420, disposition:"Appointment Scheduled" },
  { id:"c043", timestamp:"2026-04-21T10:00:00", ani:"+18559871100", dnis:"+13055556699", agentId:"agent_4", agentName:"David Williams",  campaignId:"camp_ob3", campaignName:"Prescription Renewal",    duration:305, disposition:"Prescription Sent"      },
  { id:"c044", timestamp:"2026-04-21T11:30:15", ani:"+17865551133", dnis:"+18005550102", agentId:"agent_5", agentName:"Ashley Brown",    campaignId:"camp_ib4", campaignName:"Insurance Verification",  duration:615, disposition:"Transferred to Nurse"   },
  { id:"c045", timestamp:"2026-04-21T13:00:00", ani:"+18662141523", dnis:"+13055553311", agentId:"agent_6", agentName:"James Martinez",  campaignId:"camp_ob4", campaignName:"New Patient Acquisition", duration:195, disposition:"Appointment Scheduled" },
  { id:"c046", timestamp:"2026-04-21T14:15:30", ani:"+13055558866", dnis:"+18005550100", agentId:"agent_3", agentName:"Emily Rodriguez", campaignId:"camp_ib3", campaignName:"General Inquiry",         duration:145, disposition:"Wrong Number"           },
  { id:"c047", timestamp:"2026-04-21T16:00:00", ani:"+18559871100", dnis:"+17865557711", agentId:"agent_4", agentName:"David Williams",  campaignId:"camp_ob2", campaignName:"Follow-Up Campaign",      duration:270, disposition:"Prescription Sent"      },

  // ── April 22 (Tuesday — today) ──────────────────────────────────────────
  { id:"c048", timestamp:"2026-04-22T08:15:00", ani:"+18662141522", dnis:"+13055552277", agentId:"agent_2", agentName:"Mike Chen",       campaignId:"camp_ob1", campaignName:"Weight Loss Outreach",    duration:315, disposition:"Appointment Scheduled" },
  { id:"c049", timestamp:"2026-04-22T09:00:22", ani:"+13055559955", dnis:"+18005550100", agentId:"agent_1", agentName:"Sarah Johnson",   campaignId:"camp_ib2", campaignName:"Appointment Scheduling",  duration:260, disposition:"Appointment Scheduled" },
  { id:"c050", timestamp:"2026-04-22T09:45:00", ani:"+18559871100", dnis:"+13055557733", agentId:"agent_4", agentName:"David Williams",  campaignId:"camp_ob3", campaignName:"Prescription Renewal",    duration:345, disposition:"Prescription Sent"      },
  { id:"c051", timestamp:"2026-04-22T10:30:15", ani:"+17865556611", dnis:"+18005550101", agentId:"agent_5", agentName:"Ashley Brown",    campaignId:"camp_ib4", campaignName:"Insurance Verification",  duration:520, disposition:"Transferred to Nurse"   },
  { id:"c052", timestamp:"2026-04-22T11:00:00", ani:"+18662141523", dnis:"+13055554477", agentId:"agent_6", agentName:"James Martinez",  campaignId:"camp_ob4", campaignName:"New Patient Acquisition", duration:185, disposition:"No Answer"              },
  { id:"c053", timestamp:"2026-04-22T11:45:30", ani:"+13055551166", dnis:"+18005550100", agentId:"agent_3", agentName:"Emily Rodriguez", campaignId:"camp_ib1", campaignName:"Patient Support",         duration:200, disposition:"Callback Requested"     },
  { id:"c054", timestamp:"2026-04-22T13:00:00", ani:"+18662141522", dnis:"+17865558833", agentId:"agent_2", agentName:"Mike Chen",       campaignId:"camp_ob5", campaignName:"Re-engagement Campaign",  duration:165, disposition:"Already a Patient"      },
  { id:"c055", timestamp:"2026-04-22T13:30:00", ani:"+17865554422", dnis:"+18005550102", agentId:"agent_1", agentName:"Sarah Johnson",   campaignId:"camp_ib3", campaignName:"General Inquiry",         duration:140, disposition:"Disconnected"           },
];

module.exports = { agents, outboundANIs, campaigns, calls };

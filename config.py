import os
from dotenv import load_dotenv

load_dotenv()

# ── Five9 Credentials ──────────────────────────────────────────────
FIVE9_USERNAME = os.getenv("FIVE9_USERNAME", "")
FIVE9_PASSWORD = os.getenv("FIVE9_PASSWORD", "")

# ── Five9 API ──────────────────────────────────────────────────────
# Data center: "ca" (Canada), "us", or "eu" — determines API base URL.
FIVE9_DATA_CENTER = os.getenv("FIVE9_DATA_CENTER", "ca")

_BASE_URLS = {
    "us": "https://api.five9.com/wsadmin/v13/AdminWebService",
    "ca": "https://api.five9.ca/wsadmin/v13/AdminWebService",
    "eu": "https://api.five9.eu/wsadmin/v13/AdminWebService",
}
FIVE9_API_BASE = _BASE_URLS.get(FIVE9_DATA_CENTER, _BASE_URLS["ca"])
FIVE9_WSDL_URL = f"{FIVE9_API_BASE}?wsdl&user={{username}}"

# ── Default Report Settings ────────────────────────────────────────
FIVE9_REPORT_FOLDER = os.getenv("FIVE9_REPORT_FOLDER", "Call Log Reports")
FIVE9_REPORT_NAME   = os.getenv("FIVE9_REPORT_NAME",   "Call Log")

# ── Dashboard ──────────────────────────────────────────────────────
REFRESH_INTERVAL = int(os.getenv("REFRESH_INTERVAL", "300"))

"""
five9_client.py — Low-level SOAP transport for the Five9 Configuration
Web Services API (v13).

Responsibilities:
  * Authenticate via HTTP Basic Auth over HTTPS.
  * Execute any named Five9 report (runReport → poll → getReportResultCsv).
  * Parse the returned CSV into a pandas DataFrame.

This module knows nothing about *which* reports to run or how to
interpret the columns — that logic lives in five9_reports.py.
"""

import csv
import io
import logging
import time
from datetime import datetime

import pandas as pd
from requests import Session
from requests.auth import HTTPBasicAuth
from zeep import Client
from zeep.exceptions import Fault as ZeepFault
from zeep.transports import Transport

import config

logger = logging.getLogger(__name__)

# ── Exceptions ─────────────────────────────────────────────────────

class Five9Error(Exception):
    """Base exception for Five9 API errors."""


class Five9AuthError(Five9Error):
    """Raised when authentication fails."""


class Five9ReportError(Five9Error):
    """Raised when a report fails to run or return data."""


# ── Client ─────────────────────────────────────────────────────────

class Five9Client:
    """
    Thin wrapper around the Five9 Configuration Web Services SOAP API.

    Usage:
        client = Five9Client()                       # reads .env creds
        client = Five9Client("user@co.com", "pass")  # explicit creds

        df = client.run_report(
            folder_name="Call Log Reports",
            report_name="Call Log",
            start=datetime(2026, 3, 26),
            end=datetime(2026, 3, 26, 23, 59, 59),
        )
    """

    REPORT_TIMEOUT = 300
    POLL_INTERVAL = 2

    def __init__(self, username: str = None, password: str = None):
        self.username = username or config.FIVE9_USERNAME
        self.password = password or config.FIVE9_PASSWORD
        if not self.username or not self.password:
            raise Five9AuthError(
                "Five9 credentials not found. Set FIVE9_USERNAME and "
                "FIVE9_PASSWORD in your .env file."
            )
        self._client: Client | None = None

    # ── SOAP plumbing ──────────────────────────────────────────────

    def _get_client(self) -> Client:
        """Create (and cache) the zeep SOAP client with Basic Auth."""
        if self._client is None:
            session = Session()
            session.auth = HTTPBasicAuth(self.username, self.password)
            transport = Transport(session=session, timeout=120)
            wsdl_url = config.FIVE9_WSDL_URL.format(username=self.username)
            try:
                self._client = Client(wsdl_url, transport=transport)
                logger.info("Five9 SOAP client initialised for %s", self.username)
            except Exception as exc:
                raise Five9AuthError(
                    f"Failed to connect to Five9 API: {exc}"
                ) from exc
        return self._client

    # ── Public API ─────────────────────────────────────────────────

    def run_report(
        self,
        folder_name: str,
        report_name: str,
        start: datetime,
        end: datetime,
    ) -> pd.DataFrame:
        """
        Execute a Five9 report and return the results as a DataFrame.

        Steps (per Five9 API docs):
          1. runReport      → returns an identifier string
          2. isReportRunning → poll until False
          3. getReportResultCsv → CSV text

        Raises:
            Five9AuthError   – bad credentials / permissions
            Five9ReportError – report not found, timed out, or empty
        """
        client = self._get_client()
        service = client.service

        time_type = client.get_type("ns0:reportTimeCriteria")
        criteria_type = client.get_type("ns0:customReportCriteria")

        time_criteria = time_type(start=start, end=end)
        criteria = criteria_type(time=time_criteria)

        # 1. Start the report ------------------------------------------------
        try:
            identifier = service.runReport(
                folderName=folder_name,
                reportName=report_name,
                criteria=criteria,
            )
        except ZeepFault as exc:
            msg = str(exc)
            if "authorization" in msg.lower() or "authenticate" in msg.lower() or "incorrect" in msg.lower():
                raise Five9AuthError(
                    "Five9 rejected your credentials. Verify FIVE9_USERNAME "
                    "and FIVE9_PASSWORD in .env."
                ) from exc
            raise Five9ReportError(
                f"runReport failed for '{folder_name}/{report_name}': {exc}"
            ) from exc

        logger.info("Report started — identifier: %s", identifier)

        # 2. Poll until finished ---------------------------------------------
        elapsed = 0
        while True:
            still_running = service.isReportRunning(
                identifier=identifier, timeout=5,
            )
            if not still_running:
                break
            elapsed += self.POLL_INTERVAL
            if elapsed >= self.REPORT_TIMEOUT:
                raise Five9ReportError(
                    f"Report '{report_name}' did not finish within "
                    f"{self.REPORT_TIMEOUT}s."
                )
            time.sleep(self.POLL_INTERVAL)

        logger.info("Report finished after ~%ds", elapsed)

        # 3. Retrieve CSV results --------------------------------------------
        csv_data = service.getReportResultCsv(identifier=identifier)
        return self._parse_csv(csv_data)

    # ── Internal helpers ───────────────────────────────────────────

    @staticmethod
    def _parse_csv(csv_text: str | None) -> pd.DataFrame:
        """Turn Five9's CSV string into a DataFrame."""
        if not csv_text:
            return pd.DataFrame()

        reader = csv.reader(io.StringIO(csv_text))
        rows = list(reader)
        if len(rows) < 2:
            return pd.DataFrame()

        return pd.DataFrame(rows[1:], columns=rows[0])

"""
five9_reports.py — High-level data access layer.

Each public function answers one business question
("how many inbound calls today?") and returns a clean result.

To add a new widget later:
  1. Add a function here (e.g. get_calls_by_skill).
  2. Call it from app.py.
  That's it — no need to touch five9_client.py.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

import pandas as pd

import config
from five9_client import Five9Client

logger = logging.getLogger(__name__)


# ── Helpers ────────────────────────────────────────────────────────

def _find_column(df: pd.DataFrame, candidates: list[str]) -> str | None:
    """Return the first column name from *candidates* that exists in *df*."""
    for col in candidates:
        if col in df.columns:
            return col
    # Fall back to case-insensitive match
    lower_map = {c.lower(): c for c in df.columns}
    for col in candidates:
        if col.lower() in lower_map:
            return lower_map[col.lower()]
    return None


_CALL_TYPE_COLS = ["Call Type", "CALL TYPE", "call type", "Type"]
_ANI_COLS = ["ANI", "Ani", "ani", "CALLER ID", "Caller Id", "Caller ID"]


def _filter_by_call_type(df: pd.DataFrame, keyword: str) -> pd.DataFrame:
    """Filter rows where the call-type column contains *keyword* (case-insensitive)."""
    if df.empty:
        return df
    col = _find_column(df, _CALL_TYPE_COLS)
    if col is None:
        logger.warning("No call-type column found in report. Columns: %s", list(df.columns))
        return pd.DataFrame(columns=df.columns)
    return df[df[col].str.upper().str.contains(keyword.upper(), na=False)]


# ── Data container ─────────────────────────────────────────────────

@dataclass
class DashboardData:
    """Everything the dashboard needs in a single fetch."""
    call_log: pd.DataFrame
    inbound: pd.DataFrame
    outbound: pd.DataFrame
    outbound_by_ani: pd.DataFrame
    total_calls: int
    total_inbound: int
    total_outbound: int


# ── Public API (one function per metric) ───────────────────────────

def fetch_call_log(
    client: Five9Client,
    start: datetime | None = None,
    end: datetime | None = None,
) -> pd.DataFrame:
    """
    Fetch the raw Call Log report for a time range.
    Defaults to today (midnight → now) when no range is given.
    """
    if start is None:
        start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    if end is None:
        end = datetime.now()

    return client.run_report(
        folder_name=config.FIVE9_REPORT_FOLDER,
        report_name=config.FIVE9_REPORT_NAME,
        start=start,
        end=end,
    )


def get_inbound_calls(call_log: pd.DataFrame) -> pd.DataFrame:
    """Filter the call log to inbound calls only."""
    return _filter_by_call_type(call_log, "INBOUND")


def get_outbound_calls(call_log: pd.DataFrame) -> pd.DataFrame:
    """Filter the call log to outbound calls only."""
    return _filter_by_call_type(call_log, "OUTBOUND")


def get_outbound_by_ani(call_log: pd.DataFrame) -> pd.DataFrame:
    """
    Group outbound calls by ANI and return a DataFrame with:
        ANI   — the caller-ID number
        Count — how many outbound calls used that ANI
    Sorted descending by Count.
    """
    outbound = get_outbound_calls(call_log)
    if outbound.empty:
        return pd.DataFrame(columns=["ANI", "Count"])

    ani_col = _find_column(outbound, _ANI_COLS)
    if ani_col is None:
        logger.warning("No ANI column found. Columns: %s", list(outbound.columns))
        return pd.DataFrame(columns=["ANI", "Count"])

    counts = (
        outbound[ani_col]
        .value_counts()
        .reset_index()
    )
    counts.columns = ["ANI", "Count"]
    return counts


def get_dashboard_data(
    client: Five9Client,
    start: datetime | None = None,
    end: datetime | None = None,
) -> DashboardData:
    """
    Single call that fetches the report once and derives every metric.
    Use this from app.py to avoid redundant API calls.
    """
    call_log = fetch_call_log(client, start, end)
    inbound = get_inbound_calls(call_log)
    outbound = get_outbound_calls(call_log)
    by_ani = get_outbound_by_ani(call_log)

    return DashboardData(
        call_log=call_log,
        inbound=inbound,
        outbound=outbound,
        outbound_by_ani=by_ani,
        total_calls=len(call_log),
        total_inbound=len(inbound),
        total_outbound=len(outbound),
    )

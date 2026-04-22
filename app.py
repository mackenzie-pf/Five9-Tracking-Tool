"""
app.py — Dashboard layout orchestrator.

This file controls *where* widgets appear on the page.
All widget rendering logic lives in widgets.py.

To add a new widget:
  1. Create render_xxx() in widgets.py
  2. Call it below inside whatever column / section you want.
"""

import streamlit as st
from streamlit_autorefresh import st_autorefresh
from datetime import datetime

from five9_client import Five9Client, Five9AuthError, Five9ReportError
from five9_reports import get_dashboard_data, DashboardData
from widgets import (
    inject_widget_styles,
    render_total_calls_kpi,
    render_inbound_kpi,
    render_outbound_kpi,
    render_ani_pie_chart,
    render_call_type_bar,
    render_raw_data_table,
)
import config

# ── Page config ────────────────────────────────────────────────────
st.set_page_config(
    page_title="Five9 Call Tracker",
    page_icon="📞",
    layout="wide",
)
inject_widget_styles()

# ── Sidebar: credentials & controls ───────────────────────────────
st.sidebar.title("Five9 Connection")

username = st.sidebar.text_input("Username", value=config.FIVE9_USERNAME)
password = st.sidebar.text_input(
    "Password", value=config.FIVE9_PASSWORD, type="password"
)
refresh_interval = st.sidebar.number_input(
    "Auto-refresh (seconds)", min_value=60, value=config.REFRESH_INTERVAL, step=60
)

st.sidebar.markdown("---")
st.sidebar.subheader("Report Range")
today = datetime.now().date()
start_date = st.sidebar.date_input("Start date", value=today)
end_date = st.sidebar.date_input("End date", value=today)

start_dt = datetime.combine(start_date, datetime.min.time())
end_dt = datetime.combine(end_date, datetime.max.time().replace(microsecond=0))

st.sidebar.button("Fetch Data", type="primary", use_container_width=True)

# Auto-refresh triggers a full page rerun on the configured interval
st_autorefresh(interval=refresh_interval * 1000, key="data_refresh")

# ── Header ─────────────────────────────────────────────────────────
st.title("Five9 Call Statistics Dashboard")

if not username or not password:
    st.warning("Enter your Five9 admin credentials in the sidebar to get started.")
    st.stop()

# ── Data fetch (cached) ───────────────────────────────────────────

@st.cache_data(ttl=refresh_interval, show_spinner="Fetching data from Five9...")
def _fetch(
    _username: str, _password: str, start: datetime, end: datetime
) -> DashboardData:
    client = Five9Client(username=_username, password=_password)
    return get_dashboard_data(client, start, end)


try:
    data = _fetch(username, password, start_dt, end_dt)
except Five9AuthError as e:
    st.error(f"Authentication failed: {e}")
    st.stop()
except Five9ReportError as e:
    st.error(f"Report error: {e}")
    st.stop()
except Exception as e:
    st.error(f"Failed to connect to Five9: {e}")
    st.info(
        "Verify your credentials and ensure your account has admin API access. "
        "The Five9 API may also throttle requests — wait a moment and retry."
    )
    st.stop()

if data.call_log.empty:
    st.info("No call data returned for the selected date range.")
    st.stop()

# ══════════════════════════════════════════════════════════════════
#  WIDGET LAYOUT — edit below to rearrange / add widgets
# ══════════════════════════════════════════════════════════════════

# Row 1: KPI cards
kpi1, kpi2, kpi3 = st.columns(3)
with kpi1:
    render_total_calls_kpi(data.total_calls)
with kpi2:
    render_inbound_kpi(data.total_inbound)
with kpi3:
    render_outbound_kpi(data.total_outbound)

st.markdown("---")

# Row 2: Charts
chart_left, chart_right = st.columns([3, 2])
with chart_left:
    render_ani_pie_chart(data.outbound_by_ani)
with chart_right:
    render_call_type_bar(data)

st.markdown("---")

# Row 3: Raw data
render_raw_data_table(data.call_log)

# ── Sidebar footer ────────────────────────────────────────────────
st.sidebar.markdown("---")
st.sidebar.caption(
    f"Auto-refreshing every {refresh_interval}s  \n"
    f"Last fetch: {datetime.now().strftime('%H:%M:%S')}"
)

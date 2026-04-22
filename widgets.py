"""
widgets.py — Reusable dashboard widget functions.

Each function renders one self-contained widget.
To add a new widget:
  1. Write a render_xxx(data, ...) function here.
  2. Call it from app.py inside whatever column/container you want.
"""

from __future__ import annotations

import streamlit as st
import plotly.express as px
import plotly.graph_objects as go
import pandas as pd

from five9_reports import DashboardData


# ── Shared CSS injected once ───────────────────────────────────────

def inject_widget_styles():
    """Call once at the top of app.py to load custom card styles."""
    st.markdown(
        """
        <style>
        /* KPI card styling */
        .kpi-card {
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            border: 1px solid #dee2e6;
            border-radius: 12px;
            padding: 24px 20px;
            text-align: center;
        }
        .kpi-label {
            font-size: 0.85rem;
            font-weight: 600;
            color: #6c757d;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 4px;
        }
        .kpi-value {
            font-size: 2.4rem;
            font-weight: 700;
            margin: 0;
            line-height: 1.2;
        }
        .kpi-inbound  .kpi-value { color: #1976D2; }
        .kpi-outbound .kpi-value { color: #388E3C; }
        .kpi-total    .kpi-value { color: #5E35B1; }
        </style>
        """,
        unsafe_allow_html=True,
    )


# ── KPI widgets ────────────────────────────────────────────────────

def render_inbound_kpi(total_inbound: int):
    """Large inbound call count card."""
    st.markdown(
        f"""
        <div class="kpi-card kpi-inbound">
            <p class="kpi-label">Inbound Calls Today</p>
            <p class="kpi-value">{total_inbound:,}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_outbound_kpi(total_outbound: int):
    """Large outbound call count card."""
    st.markdown(
        f"""
        <div class="kpi-card kpi-outbound">
            <p class="kpi-label">Outbound Calls Today</p>
            <p class="kpi-value">{total_outbound:,}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_total_calls_kpi(total_calls: int):
    """Large total call count card."""
    st.markdown(
        f"""
        <div class="kpi-card kpi-total">
            <p class="kpi-label">Total Calls Today</p>
            <p class="kpi-value">{total_calls:,}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )


# ── Pie chart: Outbound by ANI ────────────────────────────────────

def render_ani_pie_chart(outbound_by_ani: pd.DataFrame, top_n: int = 15):
    """
    Donut chart of outbound calls grouped by ANI.
    Each slice shows: ANI number, raw call count, and percentage.
    """
    st.subheader("Outbound Calls by ANI")

    if outbound_by_ani.empty:
        st.info("No outbound call data available for today.")
        return

    # Collapse low-volume ANIs into "Other" to keep the chart readable
    if len(outbound_by_ani) > top_n:
        top = outbound_by_ani.head(top_n).copy()
        other_count = int(outbound_by_ani.iloc[top_n:]["Count"].sum())
        other_row = pd.DataFrame([{"ANI": "Other", "Count": other_count}])
        chart_data = pd.concat([top, other_row], ignore_index=True)
    else:
        chart_data = outbound_by_ani.copy()

    fig = px.pie(
        chart_data,
        names="ANI",
        values="Count",
        hole=0.4,
        color_discrete_sequence=px.colors.qualitative.Set2,
    )

    # Show ANI, raw count, AND percentage on every slice
    fig.update_traces(
        textposition="auto",
        textinfo="label+value+percent",
        texttemplate="<b>%{label}</b><br>%{value} calls<br>(%{percent})",
        hovertemplate="<b>%{label}</b><br>Calls: %{value}<br>Share: %{percent}<extra></extra>",
    )

    fig.update_layout(
        margin=dict(t=10, b=10, l=10, r=10),
        height=480,
        legend=dict(
            orientation="h",
            yanchor="top",
            y=-0.05,
            xanchor="center",
            x=0.5,
        ),
    )

    st.plotly_chart(fig, use_container_width=True)


# ── Bar chart: Call Type Breakdown ─────────────────────────────────

def render_call_type_bar(data: DashboardData):
    """Vertical bar chart comparing Inbound / Outbound / Other."""
    st.subheader("Call Type Breakdown")

    other = data.total_calls - data.total_inbound - data.total_outbound
    breakdown = pd.DataFrame({
        "Type": ["Inbound", "Outbound"] + (["Other"] if other > 0 else []),
        "Count": [data.total_inbound, data.total_outbound] + ([other] if other > 0 else []),
    })

    fig = px.bar(
        breakdown,
        x="Type",
        y="Count",
        color="Type",
        text="Count",
        color_discrete_map={
            "Inbound": "#1976D2",
            "Outbound": "#388E3C",
            "Other": "#9E9E9E",
        },
    )
    fig.update_traces(textposition="outside", texttemplate="%{text:,}")
    fig.update_layout(
        showlegend=False,
        margin=dict(t=10, b=10, l=10, r=10),
        height=480,
        yaxis_title="Calls",
    )
    st.plotly_chart(fig, use_container_width=True)


# ── Raw data table ─────────────────────────────────────────────────

def render_raw_data_table(call_log: pd.DataFrame):
    """Expandable table showing every row from the call log."""
    with st.expander("View Raw Call Log Data"):
        st.dataframe(call_log, use_container_width=True, height=400)

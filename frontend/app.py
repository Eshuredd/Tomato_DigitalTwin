from __future__ import annotations

import sys
from datetime import date, datetime, time, timezone
from pathlib import Path
from typing import Any, Callable

import streamlit as st

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from frontend.api_client import (  # noqa: E402
    DEFAULT_API_BASE_URL,
    DISEASE_MODEL_VERSION,
    CropTwinAPIClient,
    CropTwinAPIError,
)
from frontend.ui_helpers import (  # noqa: E402
    ACTION_OPTIONS,
    SOIL_TEXTURE_OPTIONS,
    action_help_text,
    badge_tone_for_moisture,
    badge_tone_for_stress,
    badge_tone_for_uncertainty,
    detect_weather_manual_overrides,
    drip_runtime_to_litres_and_depth,
    encode_image_bytes_to_base64,
    escape_html,
    format_action_label,
    format_percent,
    friendly_wetness_risk_label,
    generate_water_update_id,
    humanize_disease_label,
    irrigation_depth_from_litres_area,
    keys_to_clear_after,
    top_class_probabilities,
    water_update_payload_signature,
    weather_values_from_snapshot,
    workflow_progress_states,
)


WORKFLOW_TABS = [
    "Session",
    "Disease",
    "Water & Twin",
    "Simulate & Recommend",
    "Narration & Records",
]

SESSION_KEYS = {
    "workflow_tab": WORKFLOW_TABS[0],
    "api_base_url": DEFAULT_API_BASE_URL,
    "active_state_id": "",
    "session_response": None,
    "disease_response": None,
    "water_response": None,
    "twin_response": None,
    "simulation_response": None,
    "recommendation_response": None,
    "narration_response": None,
    "history_response": None,
    "session_state_response": None,
    "health_response": None,
    "system_info_response": None,
    "weather_snapshot_response": None,
    "weather_fetched_values": None,
    "weather_manual_overrides": None,
    "water_update_id": None,
    "water_update_signature": None,
    "latest_water_observation_id": None,
    "latest_water_sequence": 0,
    "pending_water_base_observation_id": None,
    "pending_water_base_sequence": 0,
    "water_current_date": date.today(),
    "weather_tmin_c": 22.0,
    "weather_tmax_c": 32.0,
    "weather_humidity_pct": 65.0,
    "weather_wind_speed_mps": 2.0,
    "weather_rainfall_mm": 0.0,
    "weather_shortwave_radiation_sum_mj_m2": 18.0,
    "weather_eto_reference_feed": 0.0,
}

WEATHER_SESSION_FIELD_KEYS = {
    "tmin_c": "weather_tmin_c",
    "tmax_c": "weather_tmax_c",
    "humidity_pct": "weather_humidity_pct",
    "wind_speed_mps": "weather_wind_speed_mps",
    "rainfall_mm": "weather_rainfall_mm",
    "shortwave_radiation_sum_mj_m2": "weather_shortwave_radiation_sum_mj_m2",
    "eto_reference_feed": "weather_eto_reference_feed",
}

WEATHER_FIELD_LABELS = {
    "tmin_c": "Minimum temperature",
    "tmax_c": "Maximum temperature",
    "humidity_pct": "Mean humidity",
    "wind_speed_mps": "Wind speed normalized to 2 m",
    "rainfall_mm": "Rainfall",
    "shortwave_radiation_sum_mj_m2": "Sunlight energy",
    "eto_reference_feed": "Reference ETo",
}

IRRIGATION_INPUT_MODES = [
    "No recent irrigation",
    "I know the depth in millimetres",
    "I know total litres and irrigated area",
    "I know drip runtime and emitter details",
]


def main() -> None:
    st.set_page_config(
        page_title="CropTwin",
        page_icon="C",
        layout="wide",
        initial_sidebar_state="expanded",
    )
    _init_session_state()
    inject_custom_css()
    _render_header()
    _render_active_session_bar()

    client = CropTwinAPIClient(st.session_state.api_base_url)
    try:
        _render_sidebar(client)

        next_tab = st.session_state.pop("workflow_tab_next", None)
        if next_tab in WORKFLOW_TABS:
            st.session_state.workflow_tab = next_tab

        session_tab, disease_tab, water_tab, decision_tab, records_tab = st.tabs(
            WORKFLOW_TABS,
            key="workflow_tab",
            default=st.session_state.workflow_tab,
            on_change="rerun",
        )

        with session_tab:
            _render_session_tab(client)
            _render_next_part_button("Session")
        with disease_tab:
            _render_disease_tab(client)
            _render_next_part_button("Disease")
        with water_tab:
            _render_water_tab(client)
            _render_next_part_button("Water & Twin")
        with decision_tab:
            _render_decision_tab(client)
            _render_next_part_button("Simulate & Recommend")
        with records_tab:
            _render_records_tab(client)
    finally:
        client.close()


def _init_session_state() -> None:
    for key, value in SESSION_KEYS.items():
        st.session_state.setdefault(key, value)


def inject_custom_css() -> None:
    st.markdown(
        """
        <style>
        :root {
            --ct-bg: #101810;
            --ct-surface: #17271D;
            --ct-surface-2: #213427;
            --ct-sidebar: #131F18;
            --ct-green: #95C89E;
            --ct-green-hover: #B0D2B4;
            --ct-sage: #9EBA9B;
            --ct-sage-soft: #2D463B;
            --ct-tomato: #CF8A73;
            --ct-text: #EDF6EB;
            --ct-muted: #A8B9A9;
            --ct-muted-2: #889988;
            --ct-border: #2F4B3F;
            --ct-success: #86C98D;
            --ct-warning: #D8A55A;
            --ct-error: #DB7A6B;
        }

        html, body, [data-testid="stAppViewContainer"] {
            background: var(--ct-bg);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
        }

        .block-container {
            max-width: 1120px;
            padding-top: 1.6rem;
            padding-bottom: 3rem;
            background: transparent;
        }

        [data-testid="stSidebar"] {
            background: var(--ct-sidebar);
            border-right: 1px solid var(--ct-border);
        }

        [data-testid="stSidebar"] [data-testid="stVerticalBlock"] {
            gap: 0.75rem;
        }

        h1, h2, h3 {
            color: var(--ct-text);
            letter-spacing: 0;
        }

        .ct-hero {
            background: linear-gradient(180deg, #17271D 0%, #1E372D 100%);
            border: 1px solid var(--ct-border);
            border-radius: 16px;
            padding: 22px 24px;
            margin-bottom: 14px;
            box-shadow: 0 8px 22px rgba(0, 0, 0, 0.18);
        }

        .ct-eyebrow {
            color: var(--ct-green);
            font-size: 0.78rem;
            font-weight: 800;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin-bottom: 4px;
        }

        .ct-title-row {
            display: flex;
            align-items: center;
            gap: 12px;
            flex-wrap: wrap;
        }

        .ct-title {
            font-size: clamp(2.1rem, 4vw, 3.2rem);
            line-height: 1;
            font-weight: 800;
            color: var(--ct-text);
            margin: 0;
        }

        .ct-symbol {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 38px;
            height: 38px;
            border-radius: 999px;
            background: #F7E7E3;
            color: var(--ct-tomato);
            border: 1px solid #E7C7BF;
            font-weight: 800;
        }

        .ct-session-bar {
            background: var(--ct-surface);
            border: 1px solid var(--ct-border);
            border-radius: 14px;
            padding: 12px 14px;
            margin: 12px 0 18px 0;
            box-shadow: 0 6px 16px rgba(31, 41, 35, 0.045);
        }

        .ct-session-bar.empty {
            background: var(--ct-surface-2);
            box-shadow: none;
        }

        .ct-session-grid {
            display: grid;
            grid-template-columns: minmax(110px, 150px) minmax(0, 1fr) auto;
            align-items: center;
            gap: 12px;
        }

        .ct-session-label {
            color: var(--ct-muted);
            font-size: 0.82rem;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .ct-session-id {
            color: var(--ct-text);
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            font-size: 0.84rem;
            overflow-wrap: anywhere;
            white-space: normal;
            line-height: 1.45;
        }

        .ct-subtitle {
            color: var(--ct-text);
            font-size: 1.1rem;
            font-weight: 700;
            margin-top: 8px;
        }

        .ct-description {
            color: var(--ct-muted);
            font-size: 0.98rem;
            margin-top: 3px;
        }

        .ct-notice {
            background: var(--ct-surface-2);
            border: 1px solid var(--ct-border);
            border-left: 4px solid var(--ct-green);
            border-radius: 12px;
            color: var(--ct-text);
            padding: 12px 14px;
            margin-bottom: 18px;
        }

        .ct-sidebar-section {
            border-top: 1px solid var(--ct-border);
            padding-top: 12px;
            margin-top: 8px;
        }

        .ct-sidebar-title {
            color: var(--ct-text);
            font-size: 0.86rem;
            font-weight: 800;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            margin: 0 0 8px 0;
        }

        .ct-status-pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            border-radius: 999px;
            border: 1px solid var(--ct-border);
            background: #FFFFFF;
            padding: 6px 10px;
            color: var(--ct-text);
            font-size: 0.9rem;
            font-weight: 650;
            margin: 2px 0 6px 0;
        }

        .ct-dot {
            width: 10px;
            height: 10px;
            border-radius: 999px;
            display: inline-block;
        }

        .ct-dot.success { background: var(--ct-success); }
        .ct-dot.warning { background: var(--ct-warning); }
        .ct-dot.danger { background: var(--ct-error); }

        .ct-card-title {
            color: var(--ct-text);
            font-size: 1.15rem;
            font-weight: 800;
            margin-bottom: 2px;
        }

        .ct-card-description {
            color: var(--ct-muted);
            font-size: 0.92rem;
            margin-bottom: 12px;
        }

        div[data-testid="stVerticalBlockBorderWrapper"] {
            background: var(--ct-surface);
            border-color: var(--ct-border);
            border-radius: 16px;
            box-shadow: 0 8px 22px rgba(31, 42, 36, 0.05);
        }

        div[data-testid="stMetric"] {
            background: var(--ct-surface-2);
            color: var(--ct-text) !important;
            border: 1px solid var(--ct-border);
            border-radius: 14px;
            padding: 12px 14px;
            box-shadow: 0 5px 14px rgba(31, 42, 36, 0.08);
        }

        div[data-testid="stMetric"] * {
            color: var(--ct-text) !important;
        }

        .stTabs [data-baseweb="tab-list"] {
            gap: 6px;
            border-bottom: 1px solid var(--ct-border);
            flex-wrap: wrap;
        }

        .stTabs [data-baseweb="tab"] {
            color: var(--ct-text);
            border-radius: 10px 10px 0 0;
            padding: 10px 13px;
            font-weight: 650;
        }

        .stTabs [aria-selected="true"] {
            color: var(--ct-green) !important;
            background: var(--ct-surface-2);
            border-bottom: 3px solid var(--ct-green);
        }

        .stButton > button,
        .stFormSubmitButton > button {
            border-radius: 10px;
            font-weight: 700;
            min-height: 2.7rem;
        }

        .stButton > button[kind="primary"],
        .stFormSubmitButton > button[kind="primary"] {
            background: var(--ct-green);
            border-color: var(--ct-green);
            color: #FFFFFF;
        }

        .stButton > button[kind="primary"]:hover,
        .stFormSubmitButton > button[kind="primary"]:hover {
            background: var(--ct-green-hover);
            border-color: var(--ct-green-hover);
            color: #FFFFFF;
        }

        input, textarea, [data-baseweb="select"] > div {
            border-color: var(--ct-border) !important;
            border-radius: 10px !important;
        }

        input:focus, textarea:focus {
            border-color: var(--ct-green) !important;
            box-shadow: 0 0 0 2px rgba(31, 107, 79, 0.18) !important;
        }

        .ct-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            border-radius: 999px;
            padding: 5px 10px;
            font-size: 0.82rem;
            font-weight: 800;
            border: 1px solid transparent;
            margin-right: 6px;
            margin-bottom: 6px;
        }

        .ct-badge.success {
            color: #1F5F39;
            background: #E5F2E8;
            border-color: #BFDCC8;
        }

        .ct-badge.warning {
            color: #76510F;
            background: #FFF3D7;
            border-color: #E8CF95;
        }

        .ct-badge.danger {
            color: #8F2F2F;
            background: #FBE7E4;
            border-color: #E7B8B1;
        }

        .ct-badge.neutral {
            color: var(--ct-muted);
            background: #F2F5F0;
            border-color: var(--ct-border);
        }

        .ct-badge.tomato {
            color: #984838;
            background: #F8E8E4;
            border-color: #E9C7C0;
        }

        .ct-mini-success {
            background: #E7F3EB;
            border: 1px solid #BFDCC8;
            border-radius: 12px;
            color: #1F5F39;
            padding: 8px 10px;
            font-weight: 700;
            margin: 8px 0;
        }

        .ct-mini-warning {
            background: #FFF3D7;
            border: 1px solid #E8CF95;
            border-radius: 12px;
            color: #76510F;
            padding: 10px 12px;
            margin: 10px 0;
        }

        .ct-prob-row {
            display: grid;
            grid-template-columns: minmax(130px, 260px) 1fr 64px;
            gap: 10px;
            align-items: center;
            margin: 8px 0;
        }

        .ct-prob-label {
            color: var(--ct-text);
            font-size: 0.9rem;
            overflow-wrap: anywhere;
        }

        .ct-bar-track {
            height: 10px;
            background: #E8EEE5;
            border-radius: 999px;
            overflow: hidden;
        }

        .ct-bar-fill {
            height: 100%;
            border-radius: 999px;
            background: var(--ct-sage);
        }

        .ct-bar-fill.top {
            background: var(--ct-green);
        }

        .ct-prob-value {
            color: var(--ct-muted);
            font-size: 0.86rem;
            text-align: right;
        }

        .ct-recommended {
            border: 2px solid var(--ct-green) !important;
            background: #F7FBF7 !important;
        }

        .ct-narration {
            line-height: 1.65;
            color: var(--ct-text);
            font-size: 1rem;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _render_header() -> None:
    st.markdown(
        """
        <div class="ct-hero">
            <div class="ct-eyebrow">TOMATO DECISION SUPPORT</div>
            <div class="ct-title-row">
                <span class="ct-symbol">T</span>
                <h1 class="ct-title">CropTwin</h1>
            </div>
            <div class="ct-subtitle">Tomato Irrigation and Disease Digital Twin</div>
            <div class="ct-description">Deterministic agronomy with AI-assisted disease evidence</div>
        </div>
        <div class="ct-notice">
            The disease classifier supplies supporting evidence only. The deterministic agronomy engine owns irrigation decisions.
        </div>
        """,
        unsafe_allow_html=True,
    )


def _render_active_session_bar() -> None:
    state_id = st.session_state.active_state_id
    if not state_id:
        st.markdown(
            """
            <div class="ct-session-bar empty">
                <div class="ct-session-grid">
                    <div class="ct-session-label">Active session</div>
                    <div class="ct-session-id">No active session. Create one in the Session tab or load an existing session.</div>
                    <span class="ct-badge neutral">Status: Waiting</span>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        return

    crop_type = None
    created_at = None
    if st.session_state.session_response:
        crop_type = st.session_state.session_response.get("crop_type")
        created_at = st.session_state.session_response.get("created_at")
    elif st.session_state.session_state_response:
        crop_type = st.session_state.session_state_response.get("crop_type")

    meta = "Ready"
    if crop_type:
        meta = f"Ready · {crop_type}"
    if created_at:
        meta = f"{meta} · {created_at}"

    st.markdown(
        '<div class="ct-session-bar">'
        '<div class="ct-session-grid">'
        '<div class="ct-session-label">Active session</div>'
        f'<div class="ct-session-id">{escape_html(state_id)}</div>'
        f'<span class="ct-badge success">Status: {escape_html(meta)}</span>'
        "</div>"
        "</div>",
        unsafe_allow_html=True,
    )


def _render_sidebar(client: CropTwinAPIClient) -> None:
    with st.sidebar:
        _sidebar_title("Workflow progress")
        _render_workflow_progress()

        _sidebar_title("Session")
        state_id_to_load = st.text_input(
            "Load existing state ID",
            value="",
            placeholder="state_...",
            help="Paste a saved state ID to load its current state.",
        )

        col_load, col_reset = st.columns(2)
        with col_load:
            if st.button("Load session", disabled=not state_id_to_load.strip(), use_container_width=True):
                st.session_state.active_state_id = state_id_to_load.strip()
                _call_api(
                    "Load session",
                    lambda: client.get_session(st.session_state.active_state_id),
                    store_as="session_state_response",
                )
        with col_reset:
            if st.button("Reset UI", use_container_width=True):
                _reset_ui()

        st.caption("Reset clears only this browser session. Backend sessions remain until the API restarts.")


def _sidebar_title(label: str) -> None:
    st.markdown(
        f'<div class="ct-sidebar-section"><div class="ct-sidebar-title">{escape_html(label)}</div></div>',
        unsafe_allow_html=True,
    )


def _render_workflow_progress() -> None:
    completed = {
        "session": bool(st.session_state.session_response or st.session_state.active_state_id),
        "disease": bool(st.session_state.disease_response),
        "water": bool(st.session_state.water_response),
        "twin": bool(st.session_state.twin_response),
        "simulation": bool(st.session_state.simulation_response),
        "recommendation": bool(st.session_state.recommendation_response),
        "narration": bool(st.session_state.narration_response),
    }
    states = workflow_progress_states(completed)
    lines = []
    for state in states:
        if state["state"] == "completed":
            marker = "✅"
        elif state["state"] == "active":
            marker = "➤"
        else:
            marker = "○"
        lines.append(f"{marker} {escape_html(state['label'])}")

    st.markdown("\n".join(lines))


def _render_session_tab(client: CropTwinAPIClient) -> None:
    with _card("Create session", "Define the crop, planting date, soil texture, and farm location."):
        with st.form("create_session_form"):
            col_a, col_b = st.columns(2)
            with col_a:
                planting_date = st.date_input("Planting date", value=date.today())
                soil_texture = st.selectbox("Soil texture", SOIL_TEXTURE_OPTIONS, index=1)
                location_name = st.text_input("Location name", value="Hyderabad Farm")
            with col_b:
                latitude = st.number_input(
                    "Latitude",
                    value=17.3850,
                    format="%.6f",
                    help="Latitude is used with longitude to identify the farm location.",
                )
                longitude = st.number_input(
                    "Longitude",
                    value=78.4867,
                    format="%.6f",
                    help="Longitude is used with latitude to identify the farm location.",
                )
                elevation_m = st.number_input(
                    "Elevation (m)",
                    value=542.0,
                    format="%.1f",
                    help="Manual elevation entry for the session location.",
                )

            submitted = st.form_submit_button("Create session", type="primary")
            if submitted:
                payload = {
                    "crop_type": "tomato",
                    "planting_date": planting_date.isoformat(),
                    "location": {
                        "name": location_name,
                        "latitude": latitude,
                        "longitude": longitude,
                        "elevation_m": elevation_m,
                    },
                    "soil_texture": soil_texture,
                }
                result = _call_api("Create session", lambda: client.create_session(payload))
                if result:
                    _clear_downstream("session")
                    st.session_state.session_response = result
                    st.session_state.active_state_id = result["state_id"]
                    st.rerun()

    if st.session_state.session_response:
        with _card("Session created successfully", "Use this state ID for the remaining workflow."):
            st.code(st.session_state.session_response["state_id"], language=None)
            _show_response("Session response", st.session_state.session_response)


def _render_disease_tab(client: CropTwinAPIClient) -> None:
    if not _has_state_id():
        st.info("Create or load a session first before moving to Disease evidence.")
        return

    with _card("Disease evidence", "Upload a tomato leaf image. The classifier supplies supporting evidence only."):
        uploaded = st.file_uploader("Tomato leaf image", type=["jpg", "jpeg", "png"])
        if uploaded:
            image_bytes = uploaded.getvalue()
            st.image(image_bytes, caption=uploaded.name, use_container_width=True)
            st.caption(f"{len(image_bytes):,} bytes")

        if st.button("Run disease prediction", disabled=uploaded is None, type="primary"):
            try:
                image_base64 = encode_image_bytes_to_base64(uploaded.getvalue())
            except ValueError as exc:
                st.error(str(exc))
            else:
                result = _call_api(
                    "Disease prediction",
                    lambda: client.predict_disease(
                        st.session_state.active_state_id,
                        image_base64,
                        model_version=DISEASE_MODEL_VERSION,
                    ),
                )
                if result:
                    _clear_downstream("disease")
                    st.session_state.disease_response = result
                    st.rerun()

    response = st.session_state.disease_response
    if response:
        with _card("Disease evidence result", "This is not a confirmed diagnosis. Use it with field inspection."):
            predicted_label = humanize_disease_label(response["predicted_label"])
            confidence = format_percent(response["confidence_calibrated"])
            uncertainty = response["uncertainty_band"]
            category = response["disease_category"]

            st.markdown(f"### {escape_html(predicted_label)}")
            st.markdown(
                _badge("Category", category, "tomato")
                + _badge("Confidence", confidence, "success")
                + _badge("Uncertainty", uncertainty, badge_tone_for_uncertainty(uncertainty)),
                unsafe_allow_html=True,
            )
            st.caption(f"Predicted at: {response.get('predicted_at', 'n/a')}")

            if uncertainty == "high":
                st.markdown(
                    '<div class="ct-mini-warning">Classification is uncertain. Capture a clearer tomato-leaf image and inspect the plant manually.</div>',
                    unsafe_allow_html=True,
                )

            with st.expander("Canonical label", expanded=False):
                st.code(response["predicted_label"])

            st.markdown("#### Top probabilities")
            _render_probability_bars(response.get("class_probs", {}))
            _show_response("Disease response", response)


def _render_water_tab(client: CropTwinAPIClient) -> None:
    if not st.session_state.disease_response:
        st.info("Complete Disease evidence before moving to Water & Twin.")
        return

    with _card(
        "Weather and recent irrigation",
        "Fetch farm weather, review the values, then compute the deterministic water state.",
    ):
        current_date = st.date_input("Selected date", key="water_current_date")
        st.caption(f"Selected date: {current_date.isoformat()}")

        if st.button("Fetch weather for this farm", type="primary", use_container_width=True):
            result = _call_api(
                "Weather lookup",
                lambda: client.get_weather_snapshot(
                    st.session_state.active_state_id,
                    st.session_state.water_current_date,
                ),
            )
            if result:
                _apply_weather_snapshot(result)
                st.session_state.water_response = None
                _clear_downstream("water")
                st.rerun()

        _render_weather_source_summary(st.session_state.weather_snapshot_response)
        _render_weather_inputs()
        irrigation_event = _render_irrigation_inputs()

        col_compute, col_new = st.columns([3, 1])
        with col_compute:
            compute_submitted = st.button(
                "Compute water state",
                type="primary",
                use_container_width=True,
            )
        with col_new:
            new_observation = st.button(
                "New observation",
                use_container_width=True,
            )
        if new_observation:
            _reset_water_update_id()
            _set_pending_water_base_from_latest()
            st.session_state.water_response = None
            _clear_downstream("water")
            st.rerun()

        if compute_submitted:
            if irrigation_event is False:
                st.error("Fix the recent irrigation details before computing water state.")
                return

            payload: dict[str, Any] = {
                "current_date": st.session_state.water_current_date.isoformat(),
                "weather": _current_weather_payload(),
            }
            if irrigation_event is not None:
                payload["last_irrigation_event"] = irrigation_event
            _apply_pending_water_base(payload)
            payload["water_update_id"] = _water_update_id_for_payload(payload)

            result = _call_api(
                "Water-state computation",
                lambda: client.compute_water_state(st.session_state.active_state_id, payload),
            )
            if result:
                _clear_downstream("water")
                st.session_state.water_response = result
                _remember_latest_water_base(result)
                st.rerun()

    _render_water_summary(st.session_state.water_response)
    _render_twin_state_card(client)


def _apply_weather_snapshot(snapshot: dict[str, Any]) -> None:
    values = weather_values_from_snapshot(snapshot)
    for field, value in values.items():
        st.session_state[WEATHER_SESSION_FIELD_KEYS[field]] = value

    st.session_state.weather_snapshot_response = snapshot
    st.session_state.weather_fetched_values = values
    st.session_state.weather_manual_overrides = {
        field: False
        for field in WEATHER_SESSION_FIELD_KEYS
    }


def _render_weather_source_summary(snapshot: dict[str, Any] | None) -> None:
    if not snapshot:
        st.info("Fetch weather for this farm, or open Advanced to enter values manually.")
        return

    st.markdown(
        '<div class="ct-mini-success">'
        "Weather source: Open-Meteo"
        f"<br>Requested date: {escape_html(snapshot.get('target_date', 'n/a'))}"
        f"<br>Source timezone: {escape_html(snapshot.get('source_timezone', 'n/a'))}"
        f"<br>Fetched at: {escape_html(snapshot.get('fetched_at', 'n/a'))}"
        "</div>",
        unsafe_allow_html=True,
    )
    _show_response("Weather snapshot response", snapshot)


def _render_weather_inputs() -> None:
    with st.expander(
        "Advanced: review or edit weather values",
        expanded=st.session_state.weather_snapshot_response is None,
    ):
        col_a, col_b, col_c = st.columns(3)
        with col_a:
            st.number_input(
                "Minimum temperature (C)",
                key="weather_tmin_c",
                format="%.1f",
            )
            st.number_input(
                "Maximum temperature (C)",
                key="weather_tmax_c",
                format="%.1f",
            )
            st.number_input(
                "Mean humidity (%)",
                min_value=0.0,
                max_value=100.0,
                key="weather_humidity_pct",
            )
        with col_b:
            st.number_input(
                "Wind speed at crop height (m/s)",
                min_value=0.0,
                key="weather_wind_speed_mps",
                help="Open-Meteo wind is fetched at 10 m and normalized to 2 m by the backend.",
            )
            st.number_input(
                "Rainfall (mm)",
                min_value=0.0,
                key="weather_rainfall_mm",
            )
            st.number_input(
                "Sunlight energy (MJ/m2)",
                min_value=0.0,
                key="weather_shortwave_radiation_sum_mj_m2",
            )
        with col_c:
            st.number_input(
                "Reference ETo (mm)",
                min_value=0.0,
                key="weather_eto_reference_feed",
                help=(
                    "Weather-driven reference water loss. CropTwin recomputes this "
                    "locally; the API value is used only for comparison."
                ),
            )

        overrides = detect_weather_manual_overrides(
            _current_weather_values(),
            st.session_state.weather_fetched_values,
        )
        st.session_state.weather_manual_overrides = overrides
        overridden_labels = [
            WEATHER_FIELD_LABELS[field]
            for field, is_override in overrides.items()
            if is_override
        ]
        if overridden_labels:
            st.warning("Manual overrides: " + ", ".join(overridden_labels))
        elif st.session_state.weather_snapshot_response:
            st.caption("Fetched weather values are unchanged.")


def _current_weather_values() -> dict[str, float]:
    return {
        field: float(st.session_state[key])
        for field, key in WEATHER_SESSION_FIELD_KEYS.items()
    }


def _current_weather_payload() -> dict[str, float]:
    values = _current_weather_values()
    return {
        "tmin_c": values["tmin_c"],
        "tmax_c": values["tmax_c"],
        "humidity_pct": values["humidity_pct"],
        "wind_speed_mps": values["wind_speed_mps"],
        "shortwave_radiation_sum_mj_m2": values["shortwave_radiation_sum_mj_m2"],
        "rainfall_mm": values["rainfall_mm"],
        "eto_reference_feed": values["eto_reference_feed"],
    }


def _render_irrigation_inputs() -> dict[str, Any] | None | bool:
    st.markdown("#### Recent irrigation")
    mode = st.selectbox(
        "How do you know the recent irrigation amount?",
        IRRIGATION_INPUT_MODES,
        key="irrigation_input_mode",
    )

    if mode == "No recent irrigation":
        st.caption("No recent irrigation event will be sent with this water-state request.")
        return None

    col_date, col_time = st.columns(2)
    with col_date:
        irrigation_date = st.date_input(
            "Irrigation date",
            value=date.today(),
            key=f"irrigation_date_{mode}",
        )
    with col_time:
        irrigation_time = st.time_input(
            "Irrigation time",
            value=time(6, 0),
            key=f"irrigation_time_{mode}",
        )

    if mode == "I know the depth in millimetres":
        amount_mm = st.number_input(
            "Irrigation depth (mm)",
            min_value=0.0,
            value=0.0,
            key="irrigation_depth_mm",
        )
        st.caption(f"Calculated irrigation depth: {amount_mm:.2f} mm from entered depth.")
        return _last_irrigation_event_payload(irrigation_date, irrigation_time, amount_mm)

    if mode == "I know total litres and irrigated area":
        col_litres, col_area = st.columns(2)
        with col_litres:
            total_litres = st.number_input(
                "Total water applied (litres)",
                min_value=0.0,
                value=0.0,
                key="irrigation_total_litres",
            )
        with col_area:
            irrigated_area_m2 = st.number_input(
                "Irrigated area (m2)",
                min_value=0.0,
                value=0.0,
                key="irrigation_area_m2_litres",
            )
        try:
            amount_mm = irrigation_depth_from_litres_area(
                total_litres=total_litres,
                irrigated_area_m2=irrigated_area_m2,
            )
        except ValueError as exc:
            st.caption(str(exc))
            return False

        st.caption(
            "Calculated irrigation depth: "
            f"{amount_mm:.2f} mm from {total_litres:.2f} litres over "
            f"{irrigated_area_m2:.2f} m2."
        )
        return _last_irrigation_event_payload(irrigation_date, irrigation_time, amount_mm)

    col_emitters, col_flow, col_runtime, col_area = st.columns(4)
    with col_emitters:
        emitter_count = st.number_input(
            "Emitter count",
            min_value=0,
            value=0,
            step=1,
            key="irrigation_emitter_count",
        )
    with col_flow:
        emitter_flow_lph = st.number_input(
            "Emitter flow (litres/hour)",
            min_value=0.0,
            value=0.0,
            key="irrigation_emitter_flow_lph",
        )
    with col_runtime:
        runtime_minutes = st.number_input(
            "Runtime (minutes)",
            min_value=0.0,
            value=0.0,
            key="irrigation_runtime_minutes",
        )
    with col_area:
        irrigated_area_m2 = st.number_input(
            "Irrigated area (m2)",
            min_value=0.0,
            value=0.0,
            key="irrigation_area_m2_drip",
        )

    try:
        conversion = drip_runtime_to_litres_and_depth(
            emitter_count=emitter_count,
            emitter_flow_lph=emitter_flow_lph,
            runtime_minutes=runtime_minutes,
            irrigated_area_m2=irrigated_area_m2,
        )
    except ValueError as exc:
        st.caption(str(exc))
        return False

    st.caption(
        "Calculated irrigation depth: "
        f"{conversion['amount_mm']:.2f} mm from {conversion['total_litres']:.2f} "
        f"litres over {irrigated_area_m2:.2f} m2."
    )
    return _last_irrigation_event_payload(
        irrigation_date,
        irrigation_time,
        conversion["amount_mm"],
    )


def _last_irrigation_event_payload(
    irrigation_date: date,
    irrigation_time: time,
    amount_mm: float,
) -> dict[str, Any]:
    timestamp = datetime.combine(irrigation_date, irrigation_time, tzinfo=timezone.utc)
    return {
        "timestamp": timestamp.isoformat().replace("+00:00", "Z"),
        "amount_mm": amount_mm,
    }


def _water_update_id_for_payload(payload: dict[str, Any]) -> str:
    signature = water_update_payload_signature(
        state_id=st.session_state.active_state_id,
        payload=payload,
    )
    retained_id = st.session_state.water_update_id
    if (
        not retained_id
        or st.session_state.water_update_signature != signature
    ):
        _set_pending_water_base_from_latest()
        _apply_pending_water_base(payload)
        signature = water_update_payload_signature(
            state_id=st.session_state.active_state_id,
            payload=payload,
        )
        retained_id = generate_water_update_id()
        st.session_state.water_update_id = retained_id
        st.session_state.water_update_signature = signature
    return retained_id


def _reset_water_update_id() -> None:
    st.session_state.water_update_id = None
    st.session_state.water_update_signature = None


def _set_pending_water_base_from_latest() -> None:
    st.session_state.pending_water_base_observation_id = (
        st.session_state.latest_water_observation_id
    )
    st.session_state.pending_water_base_sequence = int(
        st.session_state.latest_water_sequence or 0
    )


def _apply_pending_water_base(payload: dict[str, Any]) -> None:
    sequence = int(st.session_state.pending_water_base_sequence or 0)
    observation_id = st.session_state.pending_water_base_observation_id
    payload.pop("base_water_observation_id", None)
    payload.pop("base_water_sequence", None)
    if sequence > 0 and observation_id:
        payload["base_water_observation_id"] = observation_id
        payload["base_water_sequence"] = sequence


def _remember_latest_water_base(response: dict[str, Any]) -> None:
    sequence = int(response.get("water_sequence") or 0)
    observation_id = response.get("water_observation_id")
    if sequence > 0 and observation_id:
        st.session_state.latest_water_observation_id = observation_id
        st.session_state.latest_water_sequence = sequence


def _use_latest_water_base_from_error(details: dict[str, Any]) -> None:
    st.session_state.latest_water_observation_id = details.get(
        "current_base_water_observation_id"
    )
    st.session_state.latest_water_sequence = int(
        details.get("current_base_water_sequence") or 0
    )
    _reset_water_update_id()
    _set_pending_water_base_from_latest()


def _render_water_summary(response: dict[str, Any] | None) -> None:
    if not response:
        return
    with _card("Water-state results", "Root-zone depletion and stress bands from the deterministic water model."):
        col_a, col_b, col_c = st.columns(3)
        col_a.metric(
            "Reference water loss",
            f"{response['eto_computed']:.2f} mm",
            help=(
                "Weather-driven reference water loss. CropTwin recomputes this "
                "locally; the API value is used only for comparison."
            ),
        )
        col_b.metric(
            "Tomato crop water use",
            f"{response['etc']:.2f} mm",
            help="Estimated tomato-crop water use: ETo multiplied by the crop coefficient.",
        )
        col_c.metric(
            "Current root-zone deficit",
            f"{response['root_zone_depletion']:.2f} mm",
            help="Estimated water missing from the root zone relative to field capacity.",
        )
        col_d, col_e, col_f = st.columns(3)
        col_d.metric(
            "Unallocated excess water",
            f"{response.get('water_surplus_mm', 0.0):.2f} mm",
            help=(
                "Water input beyond the amount required to refill the simplified "
                "root-zone bucket. CropTwin does not yet divide this into runoff, "
                "deep drainage, or temporary storage."
            ),
        )
        col_e.metric(
            "Deficit beyond available-water capacity",
            f"{response.get('depletion_beyond_taw_mm', 0.0):.2f} mm",
            help=(
                "The calculated deficit beyond the assumed total plant-available "
                "water. This indicates that the simplified bucket has reached its dry limit."
            ),
        )
        col_f.markdown(
            _badge(
                "Moisture",
                response["estimated_moisture_state"],
                badge_tone_for_moisture(response["estimated_moisture_state"]),
            )
            + _badge(
                "Stress",
                response["stress_band"],
                badge_tone_for_stress(response["stress_band"]),
            ),
            unsafe_allow_html=True,
        )
        col_g, col_h, col_i = st.columns(3)
        col_g.metric(
            "Readily available water threshold",
            f"{response['raw_threshold']:.2f} mm",
        )
        col_h.metric(
            "Observed for",
            str(response.get("observed_at", "n/a")),
            help="When the submitted physical or weather condition applies.",
        )
        col_i.metric(
            "Computed by CropTwin at",
            str(response.get("computed_at", "n/a")),
            help="When CropTwin processed the observation.",
        )
        if response.get("observation_time_basis") == "DATE_ONLY_UTC_START":
            st.caption(
                "Exact observation time was not supplied; the API represented the "
                "date-only observation as 00:00 UTC for compatibility."
            )
        if response.get("irrigation_event_already_accounted_for"):
            st.info(
                "The reported irrigation event was already included in an earlier "
                "water balance, so 0 mm from that event was applied to this update."
            )
        with st.expander("Technical water lineage", expanded=False):
            st.json(
                {
                    "water_observation_id": response.get("water_observation_id"),
                    "water_sequence": response.get("water_sequence"),
                    "base_water_observation_id": response.get(
                        "base_water_observation_id"
                    ),
                    "base_water_sequence": response.get("base_water_sequence"),
                    "previous_root_zone_depletion_mm": response.get(
                        "previous_root_zone_depletion_mm"
                    ),
                    "water_update_id": response.get("water_update_id"),
                }
            )
        _show_response("Water response", response)


def _render_twin_state_card(client: CropTwinAPIClient) -> None:
    with _card("Digital twin state", "Assemble the canonical current state from disease and water outputs."):
        can_update = bool(st.session_state.disease_response and st.session_state.water_response)
        if st.button("Update digital twin", disabled=not can_update, type="primary"):
            result = _call_api(
                "Digital twin update",
                lambda: client.update_twin_state(st.session_state.active_state_id),
            )
            if result:
                if result.get("snapshot_created", True):
                    _clear_downstream("twin")
                else:
                    st.info("The twin state already reflects the latest observations.")
                st.session_state.twin_response = result
                st.rerun()
        if not can_update:
            st.caption("Disease evidence and water state are required before the twin state can be updated.")
        if st.session_state.twin_response:
            current = st.session_state.twin_response["current_state"]
            col_a, col_b, col_c = st.columns(3)
            col_a.metric("Growth stage", current["growth_stage"])
            col_b.metric("Current root-zone deficit", f"{current['root_zone_depletion']:.2f} mm")
            col_c.metric("History count", st.session_state.twin_response["state_history_count"])
            if st.session_state.twin_response.get("snapshot_created") is False:
                st.caption("The twin state already reflects the latest observations.")
            _show_response("Twin response", st.session_state.twin_response)


def _render_decision_tab(client: CropTwinAPIClient) -> None:
    if not st.session_state.twin_response:
        st.info("Complete Water & Twin before moving to Simulate & Recommend.")
        return

    with _card("Simulations", "Compare candidate irrigation actions before requesting the backend recommendation."):
        actions = st.multiselect("Candidate actions", ACTION_OPTIONS, default=ACTION_OPTIONS)
        if st.button(
            "Run simulations",
            disabled=not st.session_state.twin_response or not actions,
            type="primary",
        ):
            result = _call_api(
                "Action simulation",
                lambda: client.simulate_actions(st.session_state.active_state_id, actions),
            )
            if result:
                _clear_downstream("simulation")
                st.session_state.simulation_response = result
                st.rerun()

        if st.session_state.simulation_response:
            current = st.session_state.twin_response.get("current_state", {})
            if current.get("water_surplus_mm", 0.0) > 0.0:
                st.caption(
                    "Excess input water was detected in the latest balance. Its "
                    "division into runoff, drainage, and temporary storage is not modelled."
                )
            _render_simulation_results(
                st.session_state.simulation_response,
                st.session_state.recommendation_response,
            )
            _show_response("Simulation response", st.session_state.simulation_response)

    with _card("Deterministic irrigation recommendation", "The disease model did not choose this action."):
        if st.button("Generate recommendation", disabled=not st.session_state.simulation_response, type="primary"):
            result = _call_api(
                "Recommendation generation",
                lambda: client.recommend(st.session_state.active_state_id),
            )
            if result:
                _clear_downstream("recommendation")
                st.session_state.recommendation_response = result
                st.rerun()

        recommendation = st.session_state.recommendation_response
        if recommendation:
            col_a, col_b, col_c = st.columns(3)
            col_a.metric("Chosen action", format_action_label(recommendation["chosen_action"]))
            col_b.metric("Constraint", format_action_label(recommendation["irrigation_constraint"]))
            col_c.metric("Inspection advisory", "Yes" if recommendation["inspection_advisory"] else "No")
            if recommendation.get("caution_reasons"):
                st.markdown(
                    _badge("Disease caution", ", ".join(recommendation["caution_reasons"]), "tomato"),
                    unsafe_allow_html=True,
                )
            st.write("Reason codes:", ", ".join(recommendation.get("decision_reason_codes", [])))
            _show_response("Recommendation response", recommendation)


def _render_simulation_results(
    simulation_response: dict[str, Any],
    recommendation_response: dict[str, Any] | None,
) -> None:
    chosen_action = recommendation_response.get("chosen_action") if recommendation_response else None
    rows = simulation_response.get("simulations", [])
    for row_chunk in _chunks(rows, 2):
        cols = st.columns(len(row_chunk))
        for col, row in zip(cols, row_chunk):
            action = row["action"]
            recommended = action == chosen_action
            with col:
                with st.container(border=True):
                    if recommended:
                        st.markdown(_badge("Recommended", "Backend selected", "success"), unsafe_allow_html=True)
                    st.markdown(f"#### {escape_html(format_action_label(action))}")
                    help_text = action_help_text(action)
                    if help_text:
                        st.caption(help_text)
                    st.write(f"Root-zone depletion: {row['projected_root_zone_depletion']:.2f} mm")
                    st.write(f"Readily available water crossed: {'Yes' if row['projected_raw_crossing'] else 'No'}")
                    st.write(f"Predicted stress level: {row['projected_stress_band']}")
                    st.write(f"Simulated irrigation applied: {row['projected_water_use']:.2f} mm")
                    st.caption(
                        "This is the irrigation depth the simulator assumes would refill "
                        "the estimated deficit at the selected irrigation time."
                    )
                    st.caption(friendly_wetness_risk_label(row["disease_wetness_risk_note"]))


def _render_records_tab(client: CropTwinAPIClient) -> None:
    if not st.session_state.recommendation_response:
        st.info("Complete Simulate & Recommend before moving to Narration & Records.")
        return

    with _card("Narration", "Explain the current backend recommendation in farmer-readable language."):
        if st.button("Explain recommendation", disabled=not st.session_state.recommendation_response, type="primary"):
            result = _call_api(
                "Narration generation",
                lambda: client.narrate(st.session_state.active_state_id),
            )
            if result:
                st.session_state.narration_response = result
                st.rerun()

        narration = st.session_state.narration_response
        if narration:
            st.markdown(f"### {escape_html(narration['headline'])}")
            st.markdown(
                f'<div class="ct-narration">{escape_html(narration["rationale"])}</div>',
                unsafe_allow_html=True,
            )
            if narration.get("caution"):
                st.markdown(
                    f'<div class="ct-mini-warning">{escape_html(narration["caution"])}</div>',
                    unsafe_allow_html=True,
                )
            _show_response("Narration response", narration)

    with _card("State and history", "Refresh the current twin state and session history from the API."):
        col_a, col_b = st.columns(2)
        with col_a:
            if st.button("Refresh state", use_container_width=True):
                _call_api(
                    "State refresh",
                    lambda: client.get_session(st.session_state.active_state_id),
                    store_as="session_state_response",
                )
        with col_b:
            if st.button("Refresh history", use_container_width=True):
                _call_api(
                    "History refresh",
                    lambda: client.get_history(st.session_state.active_state_id),
                    store_as="history_response",
                )

        if st.session_state.session_state_response:
            _show_response("Current state response", st.session_state.session_state_response)
        if st.session_state.history_response:
            history = st.session_state.history_response.get("history", [])
            if history:
                st.dataframe(history, use_container_width=True, hide_index=True)
            _show_response("History response", st.session_state.history_response)


def _render_probability_bars(class_probs: dict[str, float]) -> None:
    for index, (label, probability) in enumerate(top_class_probabilities(class_probs, limit=3)):
        width = max(0.0, min(100.0, probability * 100.0))
        top_class = " top" if index == 0 else ""
        st.markdown(
            '<div class="ct-prob-row">'
            f'<div class="ct-prob-label">{escape_html(humanize_disease_label(label))}</div>'
            '<div class="ct-bar-track">'
            f'<div class="ct-bar-fill{top_class}" style="width: {width:.1f}%"></div>'
            "</div>"
            f'<div class="ct-prob-value">{escape_html(format_percent(probability))}</div>'
            "</div>",
            unsafe_allow_html=True,
        )


def _call_api(
    label: str,
    func: Callable[[], dict[str, Any]],
    *,
    store_as: str | None = None,
) -> dict[str, Any] | None:
    with st.spinner(label):
        try:
            result = func()
        except CropTwinAPIError as exc:
            if exc.code == "STALE_WATER_BASELINE":
                st.error(
                    "The crop's water state changed before this update was saved. "
                    "Refresh the latest state and recalculate this observation."
                )
                if st.button("Use latest water state", key="use_latest_water_state"):
                    _use_latest_water_base_from_error(exc.details)
                    st.session_state.water_response = None
                    st.rerun()
            elif exc.code == "OUT_OF_ORDER_WATER_OBSERVATION":
                st.error(
                    "This observation is earlier than the latest stored water state. "
                    "Historical observations cannot currently be inserted into the "
                    "canonical timeline."
                )
            else:
                st.error(f"{exc.code}: {exc.message}")
            if exc.status_code:
                st.caption(f"HTTP {exc.status_code}")
            if exc.details:
                with st.expander("Error details", expanded=False):
                    st.json(exc.details)
            return None
        except Exception as exc:
            st.error(f"Unexpected frontend error: {exc}")
            return None
    st.toast(f"{label} completed.")
    if store_as:
        st.session_state[store_as] = result
    return result


def _show_response(label: str, response: dict[str, Any] | None) -> None:
    if response is None:
        return
    with st.expander(label, expanded=False):
        st.json(response)


def _set_next_workflow_tab(next_tab: str) -> None:
    st.session_state.workflow_tab_next = next_tab


def _render_next_part_button(current_tab: str) -> None:
    if current_tab not in WORKFLOW_TABS:
        return

    current_index = WORKFLOW_TABS.index(current_tab)
    if current_index >= len(WORKFLOW_TABS) - 1:
        return

    next_tab = WORKFLOW_TABS[current_index + 1]
    st.button(
        "Next part",
        type="primary",
        use_container_width=True,
        key=f"next_{current_tab}",
        on_click=_set_next_workflow_tab,
        args=(next_tab,),
    )


def _badge(label: str, value: object, tone: str) -> str:
    return (
        f'<span class="ct-badge {escape_html(tone)}">'
        f'{escape_html(label)}: {escape_html(value)}'
        "</span>"
    )


def _card(title: str, description: str):
    container = st.container(border=True)
    with container:
        st.markdown(
            f'<div class="ct-card-title">{escape_html(title)}</div>'
            f'<div class="ct-card-description">{escape_html(description)}</div>',
            unsafe_allow_html=True,
        )
    return container


def _chunks(items: list[dict[str, Any]], size: int) -> list[list[dict[str, Any]]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def _clear_downstream(step: str) -> None:
    for key in keys_to_clear_after(step):
        st.session_state[key] = None


def _reset_ui() -> None:
    for key, value in SESSION_KEYS.items():
        st.session_state[key] = DEFAULT_API_BASE_URL if key == "api_base_url" else value
    st.rerun()


def _has_state_id() -> bool:
    return bool(st.session_state.active_state_id)


if __name__ == "__main__":
    main()

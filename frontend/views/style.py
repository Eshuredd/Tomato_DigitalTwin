from __future__ import annotations


class _StreamlitProxy:
    def __getattr__(self, name: str):
        import streamlit

        return getattr(streamlit, name)


st = _StreamlitProxy()


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


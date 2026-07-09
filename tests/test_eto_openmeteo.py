import json
from pathlib import Path

import pytest
from app.water.eto import compute_eto

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "openmeteo_eto_cases.json"


def load_cases():
    with FIXTURE_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


@pytest.mark.parametrize("case", load_cases(), ids=lambda c: c["name"])
def test_compute_eto_matches_frozen_openmeteo(case):
    result = compute_eto(
        tmin_c=case["tmin_c"],
        tmax_c=case["tmax_c"],
        humidity_pct=case["humidity_pct"],
        wind_speed_mps=case["wind_speed_mps"],
        shortwave_radiation_sum_mj_m2=case["shortwave_radiation_sum_mj_m2"],
        latitude_deg=case["latitude_deg"],
        elevation_m=case["elevation_m"],
        day_of_year=case["day_of_year"],
        eto_reference_feed=case["openmeteo_et0_mm_day"],
    )

    assert result["eto_method"] == "penman_monteith"
    assert result["eto_value"] >= 0
    assert result["eto_reference_feed"] == pytest.approx(case["openmeteo_et0_mm_day"], rel=0, abs=1e-9)
    assert result["eto_delta_pct"] is not None
    assert abs(result["eto_delta_pct"]) <= case["allowed_delta_pct"]
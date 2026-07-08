import math
import pytest

from app.water.eto import (
    atmospheric_pressure_kpa,
    clear_sky_radiation,
    compute_eto,
    compute_eto_hargreaves_samani,
    compute_eto_penman_monteith,
    day_of_year_from_date,
    extraterrestrial_radiation,
    net_longwave_radiation,
    net_shortwave_radiation,
    psychrometric_constant_kpa_c,
    saturation_vapor_pressure_kpa,
    slope_svp_curve_kpa_c,
)


def test_day_of_year_from_date_regular_year():
    assert day_of_year_from_date("2026-07-08") == 189


def test_day_of_year_from_date_leap_year():
    assert day_of_year_from_date("2024-12-31") == 366


def test_day_of_year_from_date_invalid_format():
    with pytest.raises(ValueError):
        day_of_year_from_date("08-07-2026")


def test_saturation_vapor_pressure_known_value():
    result = saturation_vapor_pressure_kpa(20.0)
    assert math.isclose(result, 2.338281270927446, rel_tol=1e-12)


def test_slope_svp_curve_known_value():
    result = slope_svp_curve_kpa_c(20.0)
    assert math.isclose(result, 0.14474018811241365, rel_tol=1e-12)


def test_atmospheric_pressure_sea_level():
    result = atmospheric_pressure_kpa(0.0)
    assert math.isclose(result, 101.3, rel_tol=1e-12)


def test_psychrometric_constant_known_value():
    result = psychrometric_constant_kpa_c(101.3)
    assert math.isclose(result, 0.0673645, rel_tol=1e-12)


def test_extraterrestrial_radiation_is_positive():
    result = extraterrestrial_radiation(17.385, 189)
    assert result > 0.0
    assert math.isclose(result, 38.84696137146504, rel_tol=1e-12)


def test_clear_sky_radiation_known_value():
    ra = extraterrestrial_radiation(17.385, 189)
    result = clear_sky_radiation(ra, 542.0)
    assert math.isclose(result, 29.55632208986546, rel_tol=1e-12)

def test_net_shortwave_radiation_known_value():
    result = net_shortwave_radiation(20.0)
    assert math.isclose(result, 15.4, rel_tol=1e-12)


def test_net_longwave_radiation_known_value_after_kelvin_fix():
    result = net_longwave_radiation(
        tmin_c=19.1,
        tmax_c=25.1,
        actual_vapor_pressure_kpa=2.1,
        shortwave_radiation_sum_mj_m2=14.5,
        clear_sky_radiation_mj_m2=18.8,
    )
    assert math.isclose(result, 3.534034815846814, rel_tol=1e-12)


def test_net_longwave_radiation_clamps_rs_rso_when_rso_nonpositive():
    result = net_longwave_radiation(
        tmin_c=10.0,
        tmax_c=20.0,
        actual_vapor_pressure_kpa=1.5,
        shortwave_radiation_sum_mj_m2=15.0,
        clear_sky_radiation_mj_m2=0.0,
    )
    assert result > 0.0


def test_compute_eto_penman_monteith_known_value():
    result = compute_eto_penman_monteith(
        tmin_c=19.1,
        tmax_c=25.1,
        humidity_pct=60.0,
        wind_speed_mps=2.0,
        shortwave_radiation_sum_mj_m2=14.5,
        latitude_deg=35.0,
        elevation_m=100.0,
        day_of_year=200,
    )
    assert math.isclose(result, 3.869246882493871, rel_tol=1e-12)


def test_compute_eto_hargreaves_samani_known_value():
    result = compute_eto_hargreaves_samani(
        tmin_c=19.1,
        tmax_c=25.1,
        latitude_deg=35.0,
        day_of_year=200,
    )
    assert math.isclose(result, 3.714152755890515, rel_tol=1e-12)


def test_compute_eto_returns_penman_monteith_payload():
    result = compute_eto(
        tmin_c=19.1,
        tmax_c=25.1,
        humidity_pct=60.0,
        wind_speed_mps=2.0,
        shortwave_radiation_sum_mj_m2=14.5,
        latitude_deg=35.0,
        elevation_m=100.0,
        day_of_year=200,
        eto_reference_feed=4.0,
    )
    expected_delta = ((3.869246882493871 - 4.0) / 4.0) * 100.0
    assert result["eto_method"] == "penman_monteith"
    assert result["eto_reference_feed"] == 4.0
    assert math.isclose(result["eto_value"], 3.869246882493871, rel_tol=1e-12)
    assert math.isclose(result["eto_delta_pct"], expected_delta, rel_tol=1e-12)


def test_compute_eto_returns_hargreaves_payload_when_shortwave_missing():
    result = compute_eto(
        tmin_c=19.1,
        tmax_c=25.1,
        humidity_pct=60.0,
        wind_speed_mps=2.0,
        shortwave_radiation_sum_mj_m2=None,
        latitude_deg=35.0,
        elevation_m=100.0,
        day_of_year=200,
        eto_reference_feed=None,
    )
    assert result["eto_method"] == "hargreaves_samani"
    assert result["eto_reference_feed"] is None
    assert result["eto_delta_pct"] is None
    assert math.isclose(result["eto_value"], 3.714152755890515, rel_tol=1e-12)


def test_compute_eto_delta_pct_none_for_nonpositive_feed():
    result = compute_eto(
        tmin_c=19.1,
        tmax_c=25.1,
        humidity_pct=60.0,
        wind_speed_mps=2.0,
        shortwave_radiation_sum_mj_m2=14.5,
        latitude_deg=35.0,
        elevation_m=100.0,
        day_of_year=200,
        eto_reference_feed=0.0,
    )
    assert result["eto_delta_pct"] is None


def test_invalid_humidity_raises():
    with pytest.raises(ValueError):
        compute_eto(
            tmin_c=10.0,
            tmax_c=20.0,
            humidity_pct=120.0,
            wind_speed_mps=2.0,
            shortwave_radiation_sum_mj_m2=15.0,
            latitude_deg=17.385,
            elevation_m=542.0,
            day_of_year=189,
        )


def test_tmax_less_than_tmin_raises():
    with pytest.raises(ValueError):
        compute_eto_penman_monteith(
            tmin_c=20.0,
            tmax_c=10.0,
            humidity_pct=50.0,
            wind_speed_mps=2.0,
            shortwave_radiation_sum_mj_m2=15.0,
            latitude_deg=17.385,
            elevation_m=542.0,
            day_of_year=189,
        )


def test_invalid_day_of_year_raises():
    with pytest.raises(ValueError):
        extraterrestrial_radiation(17.385, 367)


def test_bool_day_of_year_rejected():
    with pytest.raises(ValueError):
        extraterrestrial_radiation(17.385, True)
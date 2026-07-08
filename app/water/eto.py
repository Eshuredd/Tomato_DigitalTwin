from __future__ import annotations

import math
from datetime import date
from typing import Literal, TypedDict


# --- Scientific constants (FAO-56 daily ET0) ---
REFERENCE_CROP_ALBEDO: float = 0.23
SOLAR_CONSTANT_GSC_MJ_M2_MIN: float = 0.0820  # MJ m^-2 min^-1
STEFAN_BOLTZMANN_DAILY_MJ_K4_M2_DAY: float = 4.903e-9  # MJ K^-4 m^-2 day^-1


class EToResult(TypedDict):
    """Return payload for `compute_eto()`."""

    eto_value: float
    eto_method: Literal["penman_monteith", "hargreaves_samani"]
    eto_reference_feed: float | None
    eto_delta_pct: float | None


def _validate_finite_number(name: str, value: float) -> float:
    """Validate a value is finite and return it as float."""
    try:
        v = float(value)
    except (TypeError, ValueError) as e:
        raise ValueError(f"{name} must be a finite number.") from e
    if not math.isfinite(v):
        raise ValueError(f"{name} must be a finite number.")
    return v


def _validate_int_in_range(name: str, value: int, *, min_value: int, max_value: int) -> None:
    """Validate integer value is within [min_value, max_value]."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{name} must be an integer.")
    if not (min_value <= value <= max_value):
        raise ValueError(f"{name} must be between {min_value} and {max_value}.")


def _validate_common_inputs(
    tmin_c: float,
    tmax_c: float,
    humidity_pct: float,
    wind_speed_mps: float,
    shortwave_radiation_sum_mj_m2: float | None,
    latitude_deg: float,
    elevation_m: float,
    day_of_year: int,
) -> None:
    """Validate shared ET0 inputs for FAO-56 Penman–Monteith path."""
    tmin_c = _validate_finite_number("tmin_c", tmin_c)
    tmax_c = _validate_finite_number("tmax_c", tmax_c)
    if tmax_c < tmin_c:
        raise ValueError("tmax_c must be >= tmin_c.")

    humidity_pct = _validate_finite_number("humidity_pct", humidity_pct)
    if humidity_pct < 0.0 or humidity_pct > 100.0:
        raise ValueError("humidity_pct must be between 0 and 100 inclusive.")

    wind_speed_mps = _validate_finite_number("wind_speed_mps", wind_speed_mps)
    if wind_speed_mps < 0.0:
        raise ValueError("wind_speed_mps must be >= 0.")

    latitude_deg = _validate_finite_number("latitude_deg", latitude_deg)
    if latitude_deg < -90.0 or latitude_deg > 90.0:
        raise ValueError("latitude_deg must be between -90 and 90 inclusive.")

    elevation_m = _validate_finite_number("elevation_m", elevation_m)
    if elevation_m < -500.0:
        raise ValueError("elevation_m must be >= -500.")

    _validate_int_in_range("day_of_year", day_of_year, min_value=1, max_value=366)

    if shortwave_radiation_sum_mj_m2 is not None:
        shortwave = _validate_finite_number(
            "shortwave_radiation_sum_mj_m2", shortwave_radiation_sum_mj_m2
        )
        if shortwave < 0.0:
            raise ValueError("shortwave_radiation_sum_mj_m2 must be >= 0 when provided.")


def _validate_hargreaves_inputs(
    tmin_c: float,
    tmax_c: float,
    latitude_deg: float,
    day_of_year: int,
) -> None:
    """Validate inputs for Hargreaves–Samani ET0 path."""
    tmin_c = _validate_finite_number("tmin_c", tmin_c)
    tmax_c = _validate_finite_number("tmax_c", tmax_c)
    if tmax_c < tmin_c:
        raise ValueError("tmax_c must be >= tmin_c.")

    latitude_deg = _validate_finite_number("latitude_deg", latitude_deg)
    if latitude_deg < -90.0 or latitude_deg > 90.0:
        raise ValueError("latitude_deg must be between -90 and 90 inclusive.")

    _validate_int_in_range("day_of_year", day_of_year, min_value=1, max_value=366)


def day_of_year_from_date(date_str: str) -> int:
    """Convert an ISO date string (YYYY-MM-DD) to day-of-year (1-366)."""
    if not isinstance(date_str, str):
        raise ValueError("date_str must be a string in ISO format YYYY-MM-DD.")
    try:
        parsed = date.fromisoformat(date_str)
    except ValueError as e:
        raise ValueError("date_str must be a valid ISO date in YYYY-MM-DD format.") from e
    return int(parsed.timetuple().tm_yday)


def saturation_vapor_pressure_kpa(temp_c: float) -> float:
    """Saturation vapor pressure (kPa) for temperature in degrees Celsius."""
    T = _validate_finite_number("temp_c", temp_c)
    # es = 0.6108 * exp(17.27 * T / (T + 237.3))
    return 0.6108 * math.exp(17.27 * T / (T + 237.3))


def slope_svp_curve_kpa_c(temp_mean_c: float) -> float:
    """Slope of saturation vapor pressure curve (kPa/°C)."""
    temp = _validate_finite_number("temp_mean_c", temp_mean_c)
    # delta = 4098 * (
    #     0.6108 * exp(17.27 * temp_mean_c / (temp_mean_c + 237.3))
    #   ) / ((temp_mean_c + 237.3) ** 2)
    num = 0.6108 * math.exp(17.27 * temp / (temp + 237.3))
    return 4098.0 * num / ((temp + 237.3) ** 2)


def atmospheric_pressure_kpa(elevation_m: float) -> float:
    """Atmospheric pressure (kPa) from elevation in meters."""
    z = _validate_finite_number("elevation_m", elevation_m)
    # P = 101.3 * (((293 - 0.0065 * elevation_m) / 293) ** 5.26)
    return 101.3 * (((293.0 - 0.0065 * z) / 293.0) ** 5.26)


def psychrometric_constant_kpa_c(pressure_kpa: float) -> float:
    """Psychrometric constant (kPa/°C)."""
    P = _validate_finite_number("pressure_kpa", pressure_kpa)
    # gamma = 0.000665 * pressure_kpa
    return 0.000665 * P


def extraterrestrial_radiation(latitude_deg: float, day_of_year: int) -> float:
    """Extraterrestrial radiation Ra (MJ/m²/day) for latitude and day-of-year."""
    lat = _validate_finite_number("latitude_deg", latitude_deg)
    if lat < -90.0 or lat > 90.0:
        raise ValueError("latitude_deg must be between -90 and 90 inclusive.")
    _validate_int_in_range("day_of_year", day_of_year, min_value=1, max_value=366)

    phi = math.radians(lat)
    # dr = 1 + 0.033 * cos(2 * pi * day_of_year / 365)
    dr = 1.0 + 0.033 * math.cos(2.0 * math.pi * day_of_year / 365.0)
    # delta_solar = 0.409 * sin(2 * pi * day_of_year / 365 - 1.39)
    delta_solar = 0.409 * math.sin(2.0 * math.pi * day_of_year / 365.0 - 1.39)

    cos_omega_s = -math.tan(phi) * math.tan(delta_solar)
    # Guard against numerical issues in acos by clamping its input.
    cos_omega_s = max(-1.0, min(1.0, cos_omega_s))
    omega_s = math.acos(cos_omega_s)

    Ra = (24.0 * 60.0 / math.pi) * SOLAR_CONSTANT_GSC_MJ_M2_MIN * dr * (
        omega_s * math.sin(phi) * math.sin(delta_solar)
        + math.cos(phi) * math.cos(delta_solar) * math.sin(omega_s)
    )
    return Ra


def clear_sky_radiation(extraterrestrial_radiation_mj_m2: float, elevation_m: float) -> float:
    """Clear-sky radiation Rso (MJ/m²/day)."""
    Ra = _validate_finite_number("extraterrestrial_radiation_mj_m2", extraterrestrial_radiation_mj_m2)
    z = _validate_finite_number("elevation_m", elevation_m)
    # Rso = (0.75 + 2e-5 * elevation_m) * Ra
    return (0.75 + 2e-5 * z) * Ra


def net_shortwave_radiation(shortwave_radiation_sum_mj_m2: float) -> float:
    """Net shortwave radiation Rns (MJ/m²/day)."""
    Rs = _validate_finite_number("shortwave_radiation_sum_mj_m2", shortwave_radiation_sum_mj_m2)
    # Rns = (1 - albedo) * Rs
    return (1.0 - REFERENCE_CROP_ALBEDO) * Rs


def net_longwave_radiation(
    tmin_c: float,
    tmax_c: float,
    actual_vapor_pressure_kpa: float,
    shortwave_radiation_sum_mj_m2: float,
    clear_sky_radiation_mj_m2: float,
) -> float:
    """Net longwave radiation Rnl (MJ/m²/day) using FAO-56 daily form."""
    Tmin = _validate_finite_number("tmin_c", tmin_c)
    Tmax = _validate_finite_number("tmax_c", tmax_c)
    ea = _validate_finite_number("actual_vapor_pressure_kpa", actual_vapor_pressure_kpa)
    Rs = _validate_finite_number("shortwave_radiation_sum_mj_m2", shortwave_radiation_sum_mj_m2)
    Rso = _validate_finite_number("clear_sky_radiation_mj_m2", clear_sky_radiation_mj_m2)
    if ea < 0.0:
        raise ValueError("actual_vapor_pressure_kpa must be >= 0.")

    # cloudiness_factor = 1.35 * (Rs / Rso) - 0.35 with explicit clamping rules.
    if Rso <= 0.0:
        rs_to_rso = 1.0
    else:
        rs_to_rso = Rs / Rso

    rs_to_rso = max(0.3, min(1.0, rs_to_rso))
    cloudiness_factor = 1.35 * rs_to_rso - 0.35
    cloudiness_factor = max(0.05, min(1.0, cloudiness_factor))

    # Rnl = sigma * ((Tmax_K^4 + Tmin_K^4) / 2) * (0.34 - 0.14 * sqrt(ea)) * cloudiness_factor
    Tmax_K = Tmax + 273.16
    Tmin_K = Tmin + 273.16
    humidity_term = (0.34 - 0.14 * math.sqrt(ea))
    return STEFAN_BOLTZMANN_DAILY_MJ_K4_M2_DAY * ((Tmax_K**4 + Tmin_K**4) / 2.0) * humidity_term * cloudiness_factor


def net_radiation(
    shortwave_radiation_sum_mj_m2: float,
    clear_sky_radiation_mj_m2: float,
    tmin_c: float,
    tmax_c: float,
    actual_vapor_pressure_kpa: float,
) -> float:
    """Net radiation Rn (MJ/m²/day) = Rns - Rnl."""
    Rns = net_shortwave_radiation(shortwave_radiation_sum_mj_m2)
    Rnl = net_longwave_radiation(
        tmin_c=tmin_c,
        tmax_c=tmax_c,
        actual_vapor_pressure_kpa=actual_vapor_pressure_kpa,
        shortwave_radiation_sum_mj_m2=shortwave_radiation_sum_mj_m2,
        clear_sky_radiation_mj_m2=clear_sky_radiation_mj_m2,
    )
    return Rns - Rnl


def compute_eto_penman_monteith(
    tmin_c: float,
    tmax_c: float,
    humidity_pct: float,
    wind_speed_mps: float,
    shortwave_radiation_sum_mj_m2: float,
    latitude_deg: float,
    elevation_m: float,
    day_of_year: int,
) -> float:
    """Compute daily FAO-56 ET0 (mm/day) using Penman–Monteith."""
    _validate_common_inputs(
        tmin_c=tmin_c,
        tmax_c=tmax_c,
        humidity_pct=humidity_pct,
        wind_speed_mps=wind_speed_mps,
        shortwave_radiation_sum_mj_m2=shortwave_radiation_sum_mj_m2,
        latitude_deg=latitude_deg,
        elevation_m=elevation_m,
        day_of_year=day_of_year,
    )

    temp_mean_c = (tmin_c + tmax_c) / 2.0  # 1. mean temperature

    es = (saturation_vapor_pressure_kpa(tmin_c) + saturation_vapor_pressure_kpa(tmax_c)) / 2.0  # 2. mean saturation vapor pressure

    # 3. actual vapor pressure
    ea = (humidity_pct / 100.0) * es

    # 4. slope of vapor pressure curve
    delta = slope_svp_curve_kpa_c(temp_mean_c)

    # 5. atmospheric pressure
    pressure_kpa = atmospheric_pressure_kpa(elevation_m)

    # 6. psychrometric constant
    gamma = psychrometric_constant_kpa_c(pressure_kpa)

    # 7. extraterrestrial radiation
    Ra = extraterrestrial_radiation(latitude_deg, day_of_year)

    # 8. clear-sky radiation
    Rso = clear_sky_radiation(extraterrestrial_radiation_mj_m2=Ra, elevation_m=elevation_m)

    # 9. net radiation (via helper)
    Rn = net_radiation(
        shortwave_radiation_sum_mj_m2=shortwave_radiation_sum_mj_m2,
        clear_sky_radiation_mj_m2=Rso,
        tmin_c=tmin_c,
        tmax_c=tmax_c,
        actual_vapor_pressure_kpa=ea,
    )

    # 10. final ET0 (G = 0)
    et0_mm_day = (
        0.408 * delta * (Rn - 0.0)
        + gamma * (900.0 / (temp_mean_c + 273.0)) * wind_speed_mps * (es - ea)
    ) / (delta + gamma * (1.0 + 0.34 * wind_speed_mps))

    if et0_mm_day < 0.0:
        return 0.0
    return et0_mm_day


def compute_eto_hargreaves_samani(
    tmin_c: float,
    tmax_c: float,
    latitude_deg: float,
    day_of_year: int,
) -> float:
    """Compute daily ET0 (mm/day) using Hargreaves–Samani."""
    _validate_hargreaves_inputs(
        tmin_c=tmin_c,
        tmax_c=tmax_c,
        latitude_deg=latitude_deg,
        day_of_year=day_of_year,
    )

    Ra = extraterrestrial_radiation(latitude_deg, day_of_year)
    temp_mean_c = (tmin_c + tmax_c) / 2.0
    tdiff = max(tmax_c - tmin_c, 0.0)

    # ET0 = 0.0023 * (temp_mean_c + 17.8) * sqrt(max(tmax - tmin, 0.0)) * (0.408 * Ra)
    et0_mm_day = 0.0023 * (temp_mean_c + 17.8) * math.sqrt(tdiff) * (0.408 * Ra)

    if et0_mm_day < 0.0:
        return 0.0
    return et0_mm_day


def compute_eto(
    tmin_c: float,
    tmax_c: float,
    humidity_pct: float,
    wind_speed_mps: float,
    shortwave_radiation_sum_mj_m2: float | None,
    latitude_deg: float,
    elevation_m: float,
    day_of_year: int,
    eto_reference_feed: float | None = None,
) -> dict:
    """Compute daily ET0 (mm/day), using Penman–Monteith or Hargreaves–Samani fallback."""
    _validate_common_inputs(
        tmin_c=tmin_c,
        tmax_c=tmax_c,
        humidity_pct=humidity_pct,
        wind_speed_mps=wind_speed_mps,
        shortwave_radiation_sum_mj_m2=shortwave_radiation_sum_mj_m2,
        latitude_deg=latitude_deg,
        elevation_m=elevation_m,
        day_of_year=day_of_year,
    )

    # Also validate the exact path chosen (independent validation requirement).
    if shortwave_radiation_sum_mj_m2 is None:
        _validate_hargreaves_inputs(
            tmin_c=tmin_c,
            tmax_c=tmax_c,
            latitude_deg=latitude_deg,
            day_of_year=day_of_year,
        )

    feed: float | None
    if eto_reference_feed is None:
        feed = None
    else:
        feed = _validate_finite_number("eto_reference_feed", eto_reference_feed)

    if shortwave_radiation_sum_mj_m2 is not None:
        eto_value = compute_eto_penman_monteith(
            tmin_c=tmin_c,
            tmax_c=tmax_c,
            humidity_pct=humidity_pct,
            wind_speed_mps=wind_speed_mps,
            shortwave_radiation_sum_mj_m2=shortwave_radiation_sum_mj_m2,
            latitude_deg=latitude_deg,
            elevation_m=elevation_m,
            day_of_year=day_of_year,
        )
        method: Literal["penman_monteith", "hargreaves_samani"] = "penman_monteith"
    else:
        eto_value = compute_eto_hargreaves_samani(
            tmin_c=tmin_c,
            tmax_c=tmax_c,
            latitude_deg=latitude_deg,
            day_of_year=day_of_year,
        )
        method = "hargreaves_samani"

    if feed is not None and feed > 0.0:
        eto_delta_pct = ((eto_value - feed) / feed) * 100.0
    else:
        eto_delta_pct = None

    return {
        "eto_value": eto_value,
        "eto_method": method,
        "eto_reference_feed": feed,
        "eto_delta_pct": eto_delta_pct,
    }


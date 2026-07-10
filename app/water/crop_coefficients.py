"""Tomato crop coefficient helpers for the MVP water model.

This module uses flat per-stage Kc values as a simplified MVP representation
instead of the fuller FAO-56 Kc curve/interpolation workflow.
"""

from __future__ import annotations

import math

from app.schemas import GrowthStage


DEFAULT_TOMATO_KC_BY_STAGE: dict[GrowthStage, float] = {
    GrowthStage.INITIAL: 0.60,
    GrowthStage.DEVELOPMENT: 0.80,
    GrowthStage.MID_SEASON: 1.15,
    GrowthStage.LATE_SEASON: 0.80,
}

DEFAULT_KC_CONFIG_SOURCE = "mvp_fao56_style_tomato_assumed_kc_by_growth_stage"


def validate_kc_by_stage(kc_by_stage: dict[GrowthStage, float]) -> None:
    """Validate a tomato Kc configuration keyed by GrowthStage."""
    if not isinstance(kc_by_stage, dict):
        raise ValueError("kc_by_stage must be a dict of GrowthStage to float values.")

    stages = set(kc_by_stage.keys())
    expected_stages = set(GrowthStage)
    missing = expected_stages - stages
    extra = stages - expected_stages
    if missing or extra:
        raise ValueError(
            f"kc_by_stage must contain exactly the tomato GrowthStage keys; missing={missing}, extra={extra}."
        )

    for stage, value in kc_by_stage.items():
        if not isinstance(stage, GrowthStage):
            raise ValueError("All kc_by_stage keys must be GrowthStage enum members.")
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"Kc value for {stage.value} must be a numeric type.")
        if math.isnan(value) or not math.isfinite(value):
            raise ValueError(f"Kc value for {stage.value} must be a finite number.")
        if value <= 0:
            raise ValueError(f"Kc value for {stage.value} must be greater than 0.")


def get_kc_for_stage(
    growth_stage: GrowthStage,
    kc_by_stage: dict[GrowthStage, float] | None = None,
) -> float:
    """Return the Kc value for a tomato growth stage."""
    if not isinstance(growth_stage, GrowthStage):
        raise ValueError("growth_stage must be a GrowthStage enum member.")

    kc_config = kc_by_stage if kc_by_stage is not None else DEFAULT_TOMATO_KC_BY_STAGE
    validate_kc_by_stage(kc_config)
    return float(kc_config[growth_stage])


def get_kc_config_snapshot(
    kc_by_stage: dict[GrowthStage, float] | None = None,
) -> dict[str, float]:
    """Return a JSON-friendly Kc configuration snapshot keyed by stage name."""
    kc_config = kc_by_stage if kc_by_stage is not None else DEFAULT_TOMATO_KC_BY_STAGE
    validate_kc_by_stage(kc_config)
    return {stage.value: float(kc_config[stage]) for stage in GrowthStage}

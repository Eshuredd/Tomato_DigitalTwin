"""Deterministic counterfactual simulator for fixed irrigation actions."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
import math

from app.schemas import (
    ActionEnum,
    DiseaseCategory,
    SimulatedActionResult,
    SimulateActionsResponse,
    StressBand,
    TwinCurrentState,
    UncertaintyBand,
)
from app.water.water_balance import classify_stress_band

SIMULATION_HORIZON_HOURS = 24.0

DiseaseWetnessRiskNote = Literal[
    "fungal_disease_present_no_new_irrigation_wetness",
    "no_irrigation_wetness_added",
    "fungal_prediction_high_uncertainty_irrigation_wetness_caution",
    "fungal_disease_present_avoid_leaf_wetness",
    "no_fungal_wetness_risk_flagged",
]

FUNGAL_DISEASE_PRESENT_NO_NEW_IRRIGATION_WETNESS: DiseaseWetnessRiskNote = (
    "fungal_disease_present_no_new_irrigation_wetness"
)
NO_IRRIGATION_WETNESS_ADDED: DiseaseWetnessRiskNote = (
    "no_irrigation_wetness_added"
)
FUNGAL_PREDICTION_HIGH_UNCERTAINTY_IRRIGATION_WETNESS_CAUTION: DiseaseWetnessRiskNote = (
    "fungal_prediction_high_uncertainty_irrigation_wetness_caution"
)
FUNGAL_DISEASE_PRESENT_AVOID_LEAF_WETNESS: DiseaseWetnessRiskNote = (
    "fungal_disease_present_avoid_leaf_wetness"
)
NO_FUNGAL_WETNESS_RISK_FLAGGED: DiseaseWetnessRiskNote = (
    "no_fungal_wetness_risk_flagged"
)

DISEASE_WETNESS_RISK_NOTES: tuple[DiseaseWetnessRiskNote, ...] = (
    FUNGAL_DISEASE_PRESENT_NO_NEW_IRRIGATION_WETNESS,
    NO_IRRIGATION_WETNESS_ADDED,
    FUNGAL_PREDICTION_HIGH_UNCERTAINTY_IRRIGATION_WETNESS_CAUTION,
    FUNGAL_DISEASE_PRESENT_AVOID_LEAF_WETNESS,
    NO_FUNGAL_WETNESS_RISK_FLAGGED,
)


def _is_finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _validate_finite_non_negative_number(name: str, value: object) -> float:
    if not _is_finite_number(value):
        raise ValueError(f"{name} must be a finite number.")
    result = float(value)
    if result < 0.0:
        raise ValueError(f"{name} must be >= 0.")
    return result


def _clamp_depletion(*, depletion_mm: float, taw_mm: float) -> float:
    if not _is_finite_number(depletion_mm):
        raise ValueError("depletion_mm must be a finite number.")
    if not _is_finite_number(taw_mm):
        raise ValueError("taw_mm must be a finite number.")
    taw = float(taw_mm)
    if taw < 0.0:
        raise ValueError("taw_mm must be >= 0.")
    return min(max(float(depletion_mm), 0.0), taw)


def validate_current_state_for_simulation(current_state: TwinCurrentState) -> None:
    if not isinstance(current_state, TwinCurrentState):
        raise ValueError("current_state must be a TwinCurrentState instance.")
    etc = _validate_finite_non_negative_number("current_state.etc", current_state.etc)
    taw = _validate_finite_non_negative_number("current_state.taw", current_state.taw)
    raw_threshold = _validate_finite_non_negative_number("current_state.raw_threshold", current_state.raw_threshold)
    depletion = _validate_finite_non_negative_number("current_state.root_zone_depletion", current_state.root_zone_depletion)
    if depletion > taw:
        raise ValueError("current_state.root_zone_depletion must not be greater than current_state.taw.")
    if raw_threshold > taw:
        raise ValueError("current_state.raw_threshold must not be greater than current_state.taw.")
    if not isinstance(current_state.stress_band, StressBand):
        raise ValueError("current_state.stress_band must be a StressBand enum member.")
    if not isinstance(current_state.disease_category, DiseaseCategory):
        raise ValueError("current_state.disease_category must be a DiseaseCategory enum member.")
    if not isinstance(current_state.uncertainty_band, UncertaintyBand):
        raise ValueError("current_state.uncertainty_band must be an UncertaintyBand enum member.")


def _hours_until_irrigation(action: ActionEnum) -> float | None:
    if action is ActionEnum.IRRIGATE_NOW:
        return 0.0
    if action is ActionEnum.IRRIGATE_IN_6H:
        return 6.0
    if action is ActionEnum.IRRIGATE_TOMORROW_AM:
        return 24.0
    if action is ActionEnum.NO_IRRIGATION_24H:
        return None
    raise ValueError("action must be an ActionEnum.")


def _build_disease_wetness_risk_note(
    *,
    action: ActionEnum,
    current_state: TwinCurrentState,
) -> DiseaseWetnessRiskNote:
    if action is ActionEnum.NO_IRRIGATION_24H:
        if current_state.disease_category is DiseaseCategory.FUNGAL:
            return FUNGAL_DISEASE_PRESENT_NO_NEW_IRRIGATION_WETNESS
        return NO_IRRIGATION_WETNESS_ADDED

    if current_state.disease_category is DiseaseCategory.FUNGAL:
        if current_state.uncertainty_band is UncertaintyBand.HIGH:
            return FUNGAL_PREDICTION_HIGH_UNCERTAINTY_IRRIGATION_WETNESS_CAUTION
        return FUNGAL_DISEASE_PRESENT_AVOID_LEAF_WETNESS
    return NO_FUNGAL_WETNESS_RISK_FLAGGED


def simulate_single_action(
    *,
    current_state: TwinCurrentState,
    action: ActionEnum,
) -> SimulatedActionResult:
    """Simulate a single action over the next 24 hours.

    projected_raw_crossing=True for an irrigation action can mean the crop was
    already at or past RAW before irrigation took effect, not that the action
    failed to resolve stress. The final projected_root_zone_depletion indicates
    the end-of-horizon state.
    """
    validate_current_state_for_simulation(current_state)
    if not isinstance(action, ActionEnum):
        raise ValueError("action must be an ActionEnum.")

    current_depletion = _validate_finite_non_negative_number("current_state.root_zone_depletion", current_state.root_zone_depletion)
    taw = _validate_finite_non_negative_number("current_state.taw", current_state.taw)
    raw_threshold = _validate_finite_non_negative_number("current_state.raw_threshold", current_state.raw_threshold)
    etc_per_hour = current_state.etc / SIMULATION_HORIZON_HOURS

    if action is ActionEnum.NO_IRRIGATION_24H:
        projected_depletion = _clamp_depletion(
            depletion_mm=current_depletion + current_state.etc,
            taw_mm=taw,
        )
        projected_water_use = 0.0
        # current_depletion check is redundant for no-irrigation because depletion is monotonic,
        # but it is kept for symmetry with irrigation actions.
        projected_raw_crossing = (
            current_depletion >= raw_threshold or projected_depletion >= raw_threshold
        )
    else:
        hours_until_irrigation = _hours_until_irrigation(action)
        if hours_until_irrigation is None:
            raise ValueError("unexpected action for irrigation simulation.")
        depletion_at_irrigation_time = _clamp_depletion(
            depletion_mm=current_depletion + etc_per_hour * hours_until_irrigation,
            taw_mm=taw,
        )
        projected_water_use = depletion_at_irrigation_time
        remaining_hours = SIMULATION_HORIZON_HOURS - hours_until_irrigation
        projected_depletion = _clamp_depletion(
            depletion_mm=etc_per_hour * remaining_hours,
            taw_mm=taw,
        )
        projected_raw_crossing = (
            current_depletion >= raw_threshold
            or depletion_at_irrigation_time >= raw_threshold
            or projected_depletion >= raw_threshold
        )

    if raw_threshold <= 0.0:
        projected_raw_crossing = False

    projected_stress_band = classify_stress_band(
        root_zone_depletion_mm=projected_depletion,
        raw_threshold_mm=current_state.raw_threshold,
    )
    disease_wetness_risk_note = _build_disease_wetness_risk_note(
        action=action,
        current_state=current_state,
    )

    return SimulatedActionResult(
        action=action,
        projected_root_zone_depletion=projected_depletion,
        projected_raw_crossing=projected_raw_crossing,
        projected_stress_band=projected_stress_band,
        projected_water_use=projected_water_use,
        disease_wetness_risk_note=disease_wetness_risk_note,
    )


def simulate_actions(
    *,
    state_id: str,
    current_state: TwinCurrentState,
    actions: list[ActionEnum],
    simulated_at: datetime | None = None,
) -> SimulateActionsResponse:
    if not isinstance(state_id, str) or not state_id.strip():
        raise ValueError("state_id must be a non-empty string.")
    validate_current_state_for_simulation(current_state)
    if not isinstance(actions, list) or len(actions) == 0:
        raise ValueError("actions must be a non-empty list of ActionEnum values.")
    for action in actions:
        if not isinstance(action, ActionEnum):
            raise ValueError("every action must be an ActionEnum.")

    simulated_at_value = simulated_at if simulated_at is not None else datetime.now(timezone.utc)
    if not isinstance(simulated_at_value, datetime):
        raise ValueError("simulated_at must be a datetime.")

    simulations = [
        simulate_single_action(current_state=current_state, action=action)
        for action in actions
    ]

    return SimulateActionsResponse(
        state_id=state_id,
        simulations=simulations,
        simulated_at=simulated_at_value,
    )

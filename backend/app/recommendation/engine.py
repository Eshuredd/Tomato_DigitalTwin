"""Deterministic recommendation engine for tomato irrigation actions."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
import math

from app.schemas import (
    ActionEnum,
    CautionReason,
    DiseaseCategory,
    IrrigationConstraint,
    MoistureState,
    RecommendationResponse,
    SimulatedActionResult,
    SimulateActionsResponse,
    StressBand,
    TwinCurrentState,
    UncertaintyBand,
)


FUNGAL_CONFIDENCE_THRESHOLD = 0.80

FUNGAL_CONFIDENCE_THRESHOLD_BASIS = (
    "mvp_assumed_confidence_threshold_for_fungal_wetness_constraint"
)


DecisionReasonCode = Literal[
    "CURRENT_DEPLETION_EXCEEDS_RAW",
    "NO_IRRIGATION_SAFE_24H",
    "PROJECTED_TO_CROSS_RAW_WITHOUT_IRRIGATION",
    "CHOSE_EARLIEST_IRRIGATION_DUE_CURRENT_STRESS",
    "CHOSE_LATEST_SAFE_IRRIGATION",
    "ALL_IRRIGATION_ACTIONS_CROSS_RAW_CHOOSING_EARLIEST",
    "NO_IRRIGATION_ACTION_AVAILABLE_CHOOSING_LOWEST_DEPLETION",
    "FUNGAL_WETNESS_RISK",
    "HIGH_UNCERTAINTY_INSPECTION_ADVISED",
    "LOW_UNCERTAINTY_CONFIRMS_CONSTRAINT",
]


CURRENT_DEPLETION_EXCEEDS_RAW: DecisionReasonCode = (
    "CURRENT_DEPLETION_EXCEEDS_RAW"
)
NO_IRRIGATION_SAFE_24H: DecisionReasonCode = "NO_IRRIGATION_SAFE_24H"
PROJECTED_TO_CROSS_RAW_WITHOUT_IRRIGATION: DecisionReasonCode = (
    "PROJECTED_TO_CROSS_RAW_WITHOUT_IRRIGATION"
)
CHOSE_EARLIEST_IRRIGATION_DUE_CURRENT_STRESS: DecisionReasonCode = (
    "CHOSE_EARLIEST_IRRIGATION_DUE_CURRENT_STRESS"
)
CHOSE_LATEST_SAFE_IRRIGATION: DecisionReasonCode = "CHOSE_LATEST_SAFE_IRRIGATION"
ALL_IRRIGATION_ACTIONS_CROSS_RAW_CHOOSING_EARLIEST: DecisionReasonCode = (
    "ALL_IRRIGATION_ACTIONS_CROSS_RAW_CHOOSING_EARLIEST"
)
NO_IRRIGATION_ACTION_AVAILABLE_CHOOSING_LOWEST_DEPLETION: DecisionReasonCode = (
    "NO_IRRIGATION_ACTION_AVAILABLE_CHOOSING_LOWEST_DEPLETION"
)
FUNGAL_WETNESS_RISK: DecisionReasonCode = "FUNGAL_WETNESS_RISK"
HIGH_UNCERTAINTY_INSPECTION_ADVISED: DecisionReasonCode = (
    "HIGH_UNCERTAINTY_INSPECTION_ADVISED"
)
LOW_UNCERTAINTY_CONFIRMS_CONSTRAINT: DecisionReasonCode = (
    "LOW_UNCERTAINTY_CONFIRMS_CONSTRAINT"
)


DECISION_REASON_CODES: tuple[DecisionReasonCode, ...] = (
    CURRENT_DEPLETION_EXCEEDS_RAW,
    NO_IRRIGATION_SAFE_24H,
    PROJECTED_TO_CROSS_RAW_WITHOUT_IRRIGATION,
    CHOSE_EARLIEST_IRRIGATION_DUE_CURRENT_STRESS,
    CHOSE_LATEST_SAFE_IRRIGATION,
    ALL_IRRIGATION_ACTIONS_CROSS_RAW_CHOOSING_EARLIEST,
    NO_IRRIGATION_ACTION_AVAILABLE_CHOOSING_LOWEST_DEPLETION,
    FUNGAL_WETNESS_RISK,
    HIGH_UNCERTAINTY_INSPECTION_ADVISED,
    LOW_UNCERTAINTY_CONFIRMS_CONSTRAINT,
)


def _is_finite_number(value: object) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def _validate_finite_non_negative_number(name: str, value: object) -> float:
    if not _is_finite_number(value):
        raise ValueError(f"{name} must be a finite number.")

    result = float(value)

    if result < 0.0:
        raise ValueError(f"{name} must be >= 0.")

    return result


def _validate_probability(name: str, value: object) -> float:
    if not _is_finite_number(value):
        raise ValueError(f"{name} must be a finite number.")

    result = float(value)

    if result < 0.0 or result > 1.0:
        raise ValueError(f"{name} must be between 0.0 and 1.0 inclusive.")

    return result


def _is_irrigation_action(action: ActionEnum) -> bool:
    if action is ActionEnum.IRRIGATE_NOW:
        return True

    if action is ActionEnum.IRRIGATE_IN_6H:
        return True

    if action is ActionEnum.IRRIGATE_TOMORROW_AM:
        return True

    if action is ActionEnum.NO_IRRIGATION_24H:
        return False

    raise ValueError("action must be an ActionEnum.")


def _hours_until_irrigation_for_ordering(action: ActionEnum) -> float | None:
    if action is ActionEnum.IRRIGATE_NOW:
        return 0.0

    if action is ActionEnum.IRRIGATE_IN_6H:
        return 6.0

    if action is ActionEnum.IRRIGATE_TOMORROW_AM:
        return 24.0

    if action is ActionEnum.NO_IRRIGATION_24H:
        return None

    raise ValueError("action must be an ActionEnum.")


def _is_current_depletion_at_or_above_raw(current_state: TwinCurrentState) -> bool:
    depletion = _validate_finite_non_negative_number(
        "current_state.root_zone_depletion",
        current_state.root_zone_depletion,
    )
    raw_threshold = _validate_finite_non_negative_number(
        "current_state.raw_threshold",
        current_state.raw_threshold,
    )

    if raw_threshold <= 0.0:
        return False

    return depletion >= raw_threshold


def _is_confirmed_fungal_wetness_risk(current_state: TwinCurrentState) -> bool:
    if not isinstance(current_state.disease_category, DiseaseCategory):
        raise ValueError(
            "current_state.disease_category must be a DiseaseCategory enum member."
        )

    if not isinstance(current_state.uncertainty_band, UncertaintyBand):
        raise ValueError(
            "current_state.uncertainty_band must be an UncertaintyBand enum member."
        )

    confidence = _validate_probability(
        "current_state.confidence_calibrated",
        current_state.confidence_calibrated,
    )

    return (
        current_state.disease_category is DiseaseCategory.FUNGAL
        and confidence >= FUNGAL_CONFIDENCE_THRESHOLD
        and current_state.uncertainty_band is UncertaintyBand.LOW
    )


def _has_fungal_caution_risk(current_state: TwinCurrentState) -> bool:
    if not isinstance(current_state.disease_category, DiseaseCategory):
        raise ValueError(
            "current_state.disease_category must be a DiseaseCategory enum member."
        )

    if not isinstance(current_state.uncertainty_band, UncertaintyBand):
        raise ValueError(
            "current_state.uncertainty_band must be an UncertaintyBand enum member."
        )

    confidence = _validate_probability(
        "current_state.confidence_calibrated",
        current_state.confidence_calibrated,
    )

    return (
        current_state.disease_category is DiseaseCategory.FUNGAL
        and confidence >= FUNGAL_CONFIDENCE_THRESHOLD
        and current_state.uncertainty_band
        in (UncertaintyBand.LOW, UncertaintyBand.MEDIUM)
    )


def validate_current_state_for_recommendation(
    current_state: TwinCurrentState,
) -> None:
    """Validate that the current twin state can be used for recommendation."""
    if not isinstance(current_state, TwinCurrentState):
        raise ValueError("current_state must be a TwinCurrentState instance.")

    depletion = _validate_finite_non_negative_number(
        "current_state.root_zone_depletion",
        current_state.root_zone_depletion,
    )
    taw = _validate_finite_non_negative_number(
        "current_state.taw",
        current_state.taw,
    )
    raw_threshold = _validate_finite_non_negative_number(
        "current_state.raw_threshold",
        current_state.raw_threshold,
    )

    if depletion > taw:
        raise ValueError(
            "current_state.root_zone_depletion must not be greater than "
            "current_state.taw."
        )

    if raw_threshold > taw:
        raise ValueError(
            "current_state.raw_threshold must not be greater than current_state.taw."
        )

    _validate_probability(
        "current_state.confidence_calibrated",
        current_state.confidence_calibrated,
    )
    _validate_finite_non_negative_number(
        "current_state.uncertainty_score",
        current_state.uncertainty_score,
    )

    if not isinstance(current_state.disease_category, DiseaseCategory):
        raise ValueError(
            "current_state.disease_category must be a DiseaseCategory enum member."
        )

    if not isinstance(current_state.uncertainty_band, UncertaintyBand):
        raise ValueError(
            "current_state.uncertainty_band must be an UncertaintyBand enum member."
        )

    if not isinstance(current_state.stress_band, StressBand):
        raise ValueError("current_state.stress_band must be a StressBand enum member.")

    if not isinstance(current_state.estimated_moisture_state, MoistureState):
        raise ValueError(
            "current_state.estimated_moisture_state must be a MoistureState enum member."
        )


def validate_simulated_action_result(result: SimulatedActionResult) -> None:
    """Validate a single simulated action result."""
    if not isinstance(result, SimulatedActionResult):
        raise ValueError("result must be a SimulatedActionResult instance.")

    if not isinstance(result.action, ActionEnum):
        raise ValueError("result.action must be an ActionEnum.")

    _validate_finite_non_negative_number(
        "result.projected_root_zone_depletion",
        result.projected_root_zone_depletion,
    )
    _validate_finite_non_negative_number(
        "result.projected_water_use",
        result.projected_water_use,
    )

    if not isinstance(result.projected_raw_crossing, bool):
        raise ValueError("result.projected_raw_crossing must be a bool.")

    if not isinstance(result.projected_stress_band, StressBand):
        raise ValueError(
            "result.projected_stress_band must be a StressBand enum member."
        )

    if (
        not isinstance(result.disease_wetness_risk_note, str)
        or not result.disease_wetness_risk_note
    ):
        raise ValueError(
            "result.disease_wetness_risk_note must be a non-empty string."
        )


def validate_simulation_response(
    *,
    state_id: str,
    simulation: SimulateActionsResponse,
) -> None:
    """Validate simulation response before using it for recommendation."""
    if not isinstance(state_id, str) or not state_id.strip():
        raise ValueError("state_id must be a non-empty string.")

    if not isinstance(simulation, SimulateActionsResponse):
        raise ValueError("simulation must be a SimulateActionsResponse instance.")

    if simulation.state_id != state_id:
        raise ValueError("simulation.state_id must match state_id.")

    if not isinstance(simulation.simulations, list) or len(simulation.simulations) == 0:
        raise ValueError("simulation.simulations must be a non-empty list.")

    for result in simulation.simulations:
        validate_simulated_action_result(result)

    if not isinstance(simulation.simulated_at, datetime):
        raise ValueError("simulation.simulated_at must be a datetime.")


def _select_no_irrigation_result(
    simulations: list[SimulatedActionResult],
) -> SimulatedActionResult | None:
    for result in simulations:
        if result.action is ActionEnum.NO_IRRIGATION_24H:
            return result

    return None


def _select_irrigation_results(
    simulations: list[SimulatedActionResult],
) -> list[SimulatedActionResult]:
    return [result for result in simulations if _is_irrigation_action(result.action)]


def _select_earliest_irrigation_result(
    irrigation_results: list[SimulatedActionResult],
) -> SimulatedActionResult | None:
    if not irrigation_results:
        return None

    best: SimulatedActionResult | None = None
    best_key: tuple[float, int] | None = None

    for index, result in enumerate(irrigation_results):
        hours = _hours_until_irrigation_for_ordering(result.action)

        if hours is None:
            continue

        key = (hours, index)

        if best is None or best_key is None or key < best_key:
            best = result
            best_key = key

    return best


def _select_latest_safe_irrigation_result(
    irrigation_results: list[SimulatedActionResult],
) -> SimulatedActionResult | None:
    safe_results = [
        result for result in irrigation_results if not result.projected_raw_crossing
    ]

    if not safe_results:
        return None

    best: SimulatedActionResult | None = None
    best_key: tuple[float, int] | None = None

    for index, result in enumerate(safe_results):
        hours = _hours_until_irrigation_for_ordering(result.action)

        if hours is None:
            continue

        key = (hours, -index)

        if best is None or best_key is None or key > best_key:
            best = result
            best_key = key

    return best


def _select_lowest_projected_depletion_result(
    simulations: list[SimulatedActionResult],
) -> SimulatedActionResult:
    if not simulations:
        raise ValueError("simulations must be non-empty.")

    best: SimulatedActionResult | None = None
    best_key: tuple[float, int] | None = None

    for index, result in enumerate(simulations):
        key = (float(result.projected_root_zone_depletion), index)

        if best is None or best_key is None or key < best_key:
            best = result
            best_key = key

    if best is None:
        raise ValueError("simulations must contain at least one result.")

    return best


def choose_recommendation_action(
    *,
    current_state: TwinCurrentState,
    simulation: SimulateActionsResponse,
) -> tuple[SimulatedActionResult, list[DecisionReasonCode]]:
    """Choose a deterministic action from current state and simulation results."""
    validate_current_state_for_recommendation(current_state)
    validate_simulation_response(state_id=simulation.state_id, simulation=simulation)

    no_irrigation_result = _select_no_irrigation_result(simulation.simulations)
    irrigation_results = _select_irrigation_results(simulation.simulations)
    current_at_or_above_raw = _is_current_depletion_at_or_above_raw(current_state)
    reason_codes: list[DecisionReasonCode] = []

    if current_at_or_above_raw:
        reason_codes.append(CURRENT_DEPLETION_EXCEEDS_RAW)

        if irrigation_results:
            chosen = _select_earliest_irrigation_result(irrigation_results)

            if chosen is None:
                chosen = _select_lowest_projected_depletion_result(
                    simulation.simulations,
                )
                reason_codes.append(
                    NO_IRRIGATION_ACTION_AVAILABLE_CHOOSING_LOWEST_DEPLETION,
                )
            else:
                reason_codes.append(CHOSE_EARLIEST_IRRIGATION_DUE_CURRENT_STRESS)
        else:
            chosen = _select_lowest_projected_depletion_result(
                simulation.simulations,
            )
            reason_codes.append(
                NO_IRRIGATION_ACTION_AVAILABLE_CHOOSING_LOWEST_DEPLETION,
            )

        return chosen, reason_codes

    if (
        no_irrigation_result is not None
        and not no_irrigation_result.projected_raw_crossing
    ):
        chosen = no_irrigation_result
        reason_codes.append(NO_IRRIGATION_SAFE_24H)
        return chosen, reason_codes

    if (
        no_irrigation_result is not None
        and no_irrigation_result.projected_raw_crossing
    ):
        reason_codes.append(PROJECTED_TO_CROSS_RAW_WITHOUT_IRRIGATION)

        latest_safe = _select_latest_safe_irrigation_result(irrigation_results)

        if latest_safe is not None:
            chosen = latest_safe
            reason_codes.append(CHOSE_LATEST_SAFE_IRRIGATION)
            return chosen, reason_codes

        if irrigation_results:
            chosen = _select_earliest_irrigation_result(irrigation_results)

            if chosen is None:
                chosen = _select_lowest_projected_depletion_result(
                    simulation.simulations,
                )
                reason_codes.append(
                    NO_IRRIGATION_ACTION_AVAILABLE_CHOOSING_LOWEST_DEPLETION,
                )
            else:
                reason_codes.append(
                    ALL_IRRIGATION_ACTIONS_CROSS_RAW_CHOOSING_EARLIEST,
                )

            return chosen, reason_codes

        chosen = _select_lowest_projected_depletion_result(simulation.simulations)
        reason_codes.append(NO_IRRIGATION_ACTION_AVAILABLE_CHOOSING_LOWEST_DEPLETION)
        return chosen, reason_codes

    if no_irrigation_result is None:
        latest_safe = _select_latest_safe_irrigation_result(irrigation_results)

        if latest_safe is not None:
            chosen = latest_safe
            reason_codes.append(CHOSE_LATEST_SAFE_IRRIGATION)
            return chosen, reason_codes

        if irrigation_results:
            chosen = _select_earliest_irrigation_result(irrigation_results)

            if chosen is None:
                chosen = _select_lowest_projected_depletion_result(
                    simulation.simulations,
                )
                reason_codes.append(
                    NO_IRRIGATION_ACTION_AVAILABLE_CHOOSING_LOWEST_DEPLETION,
                )
            else:
                reason_codes.append(
                    ALL_IRRIGATION_ACTIONS_CROSS_RAW_CHOOSING_EARLIEST,
                )

            return chosen, reason_codes

        chosen = _select_lowest_projected_depletion_result(simulation.simulations)
        reason_codes.append(NO_IRRIGATION_ACTION_AVAILABLE_CHOOSING_LOWEST_DEPLETION)
        return chosen, reason_codes

    chosen = _select_lowest_projected_depletion_result(simulation.simulations)
    reason_codes.append(NO_IRRIGATION_ACTION_AVAILABLE_CHOOSING_LOWEST_DEPLETION)
    return chosen, reason_codes


def _build_caution_reasons(
    *,
    current_state: TwinCurrentState,
) -> list[CautionReason]:
    reasons: list[CautionReason] = []

    if current_state.uncertainty_band is UncertaintyBand.HIGH:
        reasons.append(CautionReason.HIGH_UNCERTAINTY)

    if _has_fungal_caution_risk(current_state):
        reasons.append(CautionReason.FUNGAL_DISEASE_RISK)

    return reasons


def _build_decision_reason_codes(
    *,
    base_reason_codes: list[DecisionReasonCode],
    current_state: TwinCurrentState,
    chosen_action: ActionEnum,
) -> list[str]:
    codes: list[str] = [code for code in base_reason_codes]

    if _has_fungal_caution_risk(current_state) and FUNGAL_WETNESS_RISK not in codes:
        codes.append(FUNGAL_WETNESS_RISK)

    if _is_confirmed_fungal_wetness_risk(
        current_state,
    ) and _is_irrigation_action(chosen_action):
        if LOW_UNCERTAINTY_CONFIRMS_CONSTRAINT not in codes:
            codes.append(LOW_UNCERTAINTY_CONFIRMS_CONSTRAINT)

    if current_state.uncertainty_band is UncertaintyBand.HIGH:
        if HIGH_UNCERTAINTY_INSPECTION_ADVISED not in codes:
            codes.append(HIGH_UNCERTAINTY_INSPECTION_ADVISED)

    return codes


def _build_irrigation_constraint(
    *,
    current_state: TwinCurrentState,
    chosen_action: ActionEnum,
) -> IrrigationConstraint:
    if not _is_irrigation_action(chosen_action):
        return IrrigationConstraint.NONE

    if _is_confirmed_fungal_wetness_risk(current_state):
        return IrrigationConstraint.AVOID_OVERHEAD_IRRIGATION

    return IrrigationConstraint.NONE


def _build_evidence_summary_structured(
    *,
    current_state: TwinCurrentState,
    chosen_result: SimulatedActionResult,
    simulation: SimulateActionsResponse,
) -> dict[str, object]:
    return {
        "predicted_label": current_state.predicted_label,
        "disease_category": current_state.disease_category.value,
        "confidence_calibrated": float(current_state.confidence_calibrated),
        "uncertainty_score": float(current_state.uncertainty_score),
        "uncertainty_band": current_state.uncertainty_band.value,
        "root_zone_depletion": float(current_state.root_zone_depletion),
        "raw_threshold": float(current_state.raw_threshold),
        "taw": float(current_state.taw),
        "stress_band": current_state.stress_band.value,
        "estimated_moisture_state": current_state.estimated_moisture_state.value,
        "chosen_action": chosen_result.action.value,
        "chosen_projected_root_zone_depletion": float(
            chosen_result.projected_root_zone_depletion,
        ),
        "chosen_projected_raw_crossing": bool(
            chosen_result.projected_raw_crossing,
        ),
        "chosen_projected_stress_band": chosen_result.projected_stress_band.value,
        "chosen_projected_water_use": float(chosen_result.projected_water_use),
        "available_actions": [
            result.action.value for result in simulation.simulations
        ],
    }


def recommend_action(
    *,
    state_id: str,
    current_state: TwinCurrentState,
    simulation: SimulateActionsResponse,
    recommended_at: datetime | None = None,
) -> RecommendationResponse:
    """Build a deterministic irrigation recommendation from current state and simulation."""
    if not isinstance(state_id, str) or not state_id.strip():
        raise ValueError("state_id must be a non-empty string.")

    validate_current_state_for_recommendation(current_state)
    validate_simulation_response(state_id=state_id, simulation=simulation)

    chosen_result, base_reason_codes = choose_recommendation_action(
        current_state=current_state,
        simulation=simulation,
    )
    caution_reasons = _build_caution_reasons(current_state=current_state)
    decision_reason_codes = _build_decision_reason_codes(
        base_reason_codes=base_reason_codes,
        current_state=current_state,
        chosen_action=chosen_result.action,
    )
    irrigation_constraint = _build_irrigation_constraint(
        current_state=current_state,
        chosen_action=chosen_result.action,
    )
    inspection_advisory = current_state.uncertainty_band is UncertaintyBand.HIGH
    evidence_summary_structured = _build_evidence_summary_structured(
        current_state=current_state,
        chosen_result=chosen_result,
        simulation=simulation,
    )

    recommended_at_value = (
        recommended_at if recommended_at is not None else datetime.now(timezone.utc)
    )

    if not isinstance(recommended_at_value, datetime):
        raise ValueError("recommended_at must be a datetime.")

    return RecommendationResponse(
        state_id=state_id,
        chosen_action=chosen_result.action,
        irrigation_constraint=irrigation_constraint,
        inspection_advisory=inspection_advisory,
        decision_reason_codes=decision_reason_codes,
        caution_reasons=caution_reasons,
        evidence_summary_structured=evidence_summary_structured,
        recommended_at=recommended_at_value,
    )
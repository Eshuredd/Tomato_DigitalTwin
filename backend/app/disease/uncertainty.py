from __future__ import annotations

import math

from app.schemas import UncertaintyBand


ACCEPTANCE_CONFIDENCE_THRESHOLD = 0.70
ACCEPTANCE_CONFIDENCE_THRESHOLD_BASIS = (
    "validation_split_threshold_0_70_coverage_0_9362_accepted_accuracy_"
    "0_9724_error_capture_0_5231"
)

LOW_UNCERTAINTY_CONFIDENCE_THRESHOLD = 0.90
LOW_UNCERTAINTY_CONFIDENCE_THRESHOLD_BASIS = (
    "stricter_low_uncertainty_boundary_for_mvp_manual_inspection_policy"
)

UNCERTAINTY_POLICY_BASIS = (
    "calibrated_confidence_bands_from_validation_split; no top-two-margin "
    "rule because validation analysis showed no meaningful practical "
    "advantage for this MVP"
)


def validate_confidence(confidence: object) -> float:
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
        raise ValueError("confidence must be a finite number.")

    value = float(confidence)

    if not math.isfinite(value):
        raise ValueError("confidence must be finite.")

    if value < 0.0 or value > 1.0:
        raise ValueError("confidence must be between 0.0 and 1.0 inclusive.")

    return value


def uncertainty_score_from_confidence(confidence: object) -> float:
    value = validate_confidence(confidence)
    score = 1.0 - value

    if not math.isfinite(score) or score < 0.0 or score > 1.0:
        raise ValueError("uncertainty score must be finite and in [0, 1].")

    return score


def uncertainty_band_from_confidence(confidence: object) -> UncertaintyBand:
    value = validate_confidence(confidence)

    if value < ACCEPTANCE_CONFIDENCE_THRESHOLD:
        return UncertaintyBand.HIGH

    if value < LOW_UNCERTAINTY_CONFIDENCE_THRESHOLD:
        return UncertaintyBand.MEDIUM

    return UncertaintyBand.LOW


def is_prediction_accepted(confidence: object) -> bool:
    return validate_confidence(confidence) >= ACCEPTANCE_CONFIDENCE_THRESHOLD

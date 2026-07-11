from __future__ import annotations

import math

import pytest

from app.disease.uncertainty import (
    is_prediction_accepted,
    uncertainty_band_from_confidence,
    uncertainty_score_from_confidence,
    validate_confidence,
)
from app.schemas import UncertaintyBand


@pytest.mark.parametrize(
    ("confidence", "band"),
    [
        (0.0, UncertaintyBand.HIGH),
        (0.699999, UncertaintyBand.HIGH),
        (0.70, UncertaintyBand.MEDIUM),
        (0.899999, UncertaintyBand.MEDIUM),
        (0.90, UncertaintyBand.LOW),
        (1.0, UncertaintyBand.LOW),
    ],
)
def test_uncertainty_bands(confidence: float, band: UncertaintyBand) -> None:
    assert uncertainty_band_from_confidence(confidence) is band


def test_uncertainty_score_is_one_minus_confidence() -> None:
    assert uncertainty_score_from_confidence(0.82) == pytest.approx(0.18)


def test_acceptance_begins_at_exactly_threshold() -> None:
    assert not is_prediction_accepted(0.699999)
    assert is_prediction_accepted(0.70)


@pytest.mark.parametrize(
    "value",
    [
        math.nan,
        math.inf,
        -math.inf,
        -0.1,
        1.1,
        True,
        False,
        "0.7",
        object(),
    ],
)
def test_invalid_confidence_values_are_rejected(value: object) -> None:
    with pytest.raises(ValueError):
        validate_confidence(value)

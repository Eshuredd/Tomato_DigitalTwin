from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.disease.model import CROPTWIN_DISEASE_ARTIFACT_DIR_ENV
from app.disease.uncertainty import (
    ACCEPTANCE_CONFIDENCE_THRESHOLD,
    LOW_UNCERTAINTY_CONFIDENCE_THRESHOLD,
)
from app.main import app


def _write_json(path: Path, data: object) -> None:
    path.write_text(json.dumps(data), encoding="utf-8")


def test_system_info_uses_overridden_artifact_directory(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    override_dir = tmp_path / "override_artifacts"
    override_dir.mkdir()
    _write_json(
        override_dir / "temperature.json",
        {
            "temperature": 2.5,
            "validation_after": {
                "expected_calibration_error": 0.1234,
            },
        },
    )
    _write_json(
        override_dir / "uncertainty_policy.json",
        {
            "confidence_threshold": 0.42,
        },
    )
    _write_json(
        override_dir / "test_metrics.json",
        {
            "classification": {
                "accuracy": 0.321,
                "macro_precision": 0.322,
                "macro_recall": 0.323,
                "macro_f1": 0.324,
            },
            "calibration": {
                "after": {
                    "expected_calibration_error": 0.325,
                },
            },
        },
    )
    monkeypatch.setenv(CROPTWIN_DISEASE_ARTIFACT_DIR_ENV, str(override_dir))

    with TestClient(app) as client:
        response = client.get("/system-info")

    assert response.status_code == 200
    disease_model = response.json()["disease_model"]
    assert disease_model["temperature"] == pytest.approx(2.5)
    assert disease_model["confidence_threshold"] == pytest.approx(0.42)
    assert disease_model["ece_validation_score"] == pytest.approx(0.1234)
    assert disease_model["ece_test_score"] == pytest.approx(0.325)
    assert disease_model["test_accuracy"] == pytest.approx(0.321)
    assert disease_model["macro_precision"] == pytest.approx(0.322)
    assert disease_model["macro_recall"] == pytest.approx(0.323)
    assert disease_model["macro_f1"] == pytest.approx(0.324)


def test_system_info_uncertainty_boundaries_match_policy() -> None:
    with TestClient(app) as client:
        response = client.get("/system-info")

    assert response.status_code == 200
    disease_model = response.json()["disease_model"]
    confidence_thresholds = disease_model["confidence_thresholds"]
    score_thresholds = disease_model["uncertainty_thresholds"]

    assert confidence_thresholds == {
        "acceptance_confidence_gte": ACCEPTANCE_CONFIDENCE_THRESHOLD,
        "low_uncertainty_confidence_gte": LOW_UNCERTAINTY_CONFIDENCE_THRESHOLD,
        "medium_uncertainty_confidence_gte": ACCEPTANCE_CONFIDENCE_THRESHOLD,
        "medium_uncertainty_confidence_lt": LOW_UNCERTAINTY_CONFIDENCE_THRESHOLD,
        "high_uncertainty_confidence_lt": ACCEPTANCE_CONFIDENCE_THRESHOLD,
    }
    assert score_thresholds == {
        "low_uncertainty_score_lte": pytest.approx(0.10),
        "medium_uncertainty_score_gt": pytest.approx(0.10),
        "medium_uncertainty_score_lte": pytest.approx(0.30),
        "high_uncertainty_score_gt": pytest.approx(0.30),
    }

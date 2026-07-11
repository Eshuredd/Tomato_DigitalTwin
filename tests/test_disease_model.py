from __future__ import annotations

import base64
import hashlib
import json
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image

from app.disease import model as disease_model
from app.disease.classes import TOMATO_DISEASE_CLASS_NAMES
from app.disease.model import (
    DiseaseArtifactValidationError,
    DiseaseInferenceError,
    DiseaseModelUnavailableError,
    InvalidDiseaseImageError,
    TorchTomatoDiseasePredictor,
    _decode_image_base64,
    _validate_runtime_artifacts,
)


def _tiny_jpeg_base64() -> str:
    buffer = BytesIO()
    Image.new("RGB", (2, 2), color=(180, 40, 30)).save(buffer, format="JPEG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _write_json(path: Path, data: object) -> None:
    path.write_text(json.dumps(data), encoding="utf-8")


def _fake_artifact_dir(tmp_path: Path) -> Path:
    artifact_dir = tmp_path / "artifact"
    artifact_dir.mkdir()
    model_bytes = b"fake model bytes"
    model_path = artifact_dir / disease_model.MODEL_FILENAME
    model_path.write_bytes(model_bytes)

    _write_json(
        artifact_dir / disease_model.CLASS_TO_IDX_FILENAME,
        {
            label: index
            for index, label in enumerate(TOMATO_DISEASE_CLASS_NAMES)
        },
    )
    _write_json(
        artifact_dir / disease_model.UNCERTAINTY_POLICY_FILENAME,
        {
            "confidence_threshold": 0.70,
            "temperature": 1.0508726748943829,
        },
    )
    _write_json(
        artifact_dir / disease_model.TEMPERATURE_FILENAME,
        {
            "temperature": 1.0508726748943829,
            "validation_after": {
                "expected_calibration_error": 0.008117275312542915,
            },
        },
    )
    _write_json(
        artifact_dir / disease_model.MANIFEST_FILENAME,
        {
            "files": {
                disease_model.MODEL_FILENAME: {
                    "sha256": hashlib.sha256(model_bytes).hexdigest(),
                },
            },
        },
    )
    return artifact_dir


def test_valid_tiny_jpeg_base64_is_accepted() -> None:
    image = _decode_image_base64(_tiny_jpeg_base64())
    assert image.mode == "RGB"
    assert image.size == (2, 2)


def test_valid_data_uri_is_accepted() -> None:
    image = _decode_image_base64(f"data:image/jpeg;base64,{_tiny_jpeg_base64()}")
    assert image.size == (2, 2)


def test_embedded_whitespace_is_accepted() -> None:
    payload = _tiny_jpeg_base64()
    spaced = f"{payload[:10]}\n  {payload[10:30]}\t{payload[30:]}"
    assert _decode_image_base64(spaced).size == (2, 2)


@pytest.mark.parametrize("payload", ["not valid base64!!", "", "   "])
def test_invalid_or_empty_base64_is_rejected(payload: str) -> None:
    with pytest.raises(InvalidDiseaseImageError):
        _decode_image_base64(payload)


def test_decoded_non_image_bytes_are_rejected() -> None:
    payload = base64.b64encode(b"not an image").decode("ascii")
    with pytest.raises(InvalidDiseaseImageError):
        _decode_image_base64(payload)


def test_oversized_decoded_input_is_rejected() -> None:
    payload = base64.b64encode(
        b"x" * (disease_model.MAX_DECODED_IMAGE_BYTES + 1)
    ).decode("ascii")
    with pytest.raises(InvalidDiseaseImageError):
        _decode_image_base64(payload)


def test_unreasonable_dimensions_are_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(disease_model, "MAX_IMAGE_PIXELS", 1)
    with pytest.raises(InvalidDiseaseImageError):
        _decode_image_base64(_tiny_jpeg_base64())


def test_missing_required_artifact_file_is_rejected(tmp_path: Path) -> None:
    artifact_dir = _fake_artifact_dir(tmp_path)
    (artifact_dir / disease_model.TEMPERATURE_FILENAME).unlink()

    with pytest.raises(DiseaseArtifactValidationError):
        _validate_runtime_artifacts(artifact_dir)


def test_class_mapping_order_mismatch_is_rejected(tmp_path: Path) -> None:
    artifact_dir = _fake_artifact_dir(tmp_path)
    labels = list(TOMATO_DISEASE_CLASS_NAMES)
    _write_json(
        artifact_dir / disease_model.CLASS_TO_IDX_FILENAME,
        {
            label: index
            for index, label in enumerate(reversed(labels))
        },
    )

    with pytest.raises(DiseaseArtifactValidationError):
        _validate_runtime_artifacts(artifact_dir)


def test_checksum_mismatch_is_rejected(tmp_path: Path) -> None:
    artifact_dir = _fake_artifact_dir(tmp_path)
    manifest = json.loads(
        (artifact_dir / disease_model.MANIFEST_FILENAME).read_text(encoding="utf-8")
    )
    manifest["files"][disease_model.MODEL_FILENAME]["sha256"] = "0" * 64
    _write_json(artifact_dir / disease_model.MANIFEST_FILENAME, manifest)

    with pytest.raises(DiseaseArtifactValidationError):
        _validate_runtime_artifacts(artifact_dir)


def test_invalid_temperature_is_rejected(tmp_path: Path) -> None:
    artifact_dir = _fake_artifact_dir(tmp_path)
    _write_json(
        artifact_dir / disease_model.TEMPERATURE_FILENAME,
        {"temperature": 0.0},
    )

    with pytest.raises(DiseaseArtifactValidationError):
        _validate_runtime_artifacts(artifact_dir)


def test_threshold_mismatch_is_rejected(tmp_path: Path) -> None:
    artifact_dir = _fake_artifact_dir(tmp_path)
    _write_json(
        artifact_dir / disease_model.UNCERTAINTY_POLICY_FILENAME,
        {
            "confidence_threshold": 0.71,
            "temperature": 1.0508726748943829,
        },
    )

    with pytest.raises(DiseaseArtifactValidationError):
        _validate_runtime_artifacts(artifact_dir)


def test_optional_real_artifact_cpu_smoke() -> None:
    pytest.importorskip("torch")
    pytest.importorskip("torchvision")

    if not disease_model.DEFAULT_DISEASE_ARTIFACT_DIR.is_dir():
        pytest.skip("real disease artifact directory is absent")

    predictor = TorchTomatoDiseasePredictor(device="cpu")

    try:
        result = predictor.predict(_tiny_jpeg_base64())
    except (DiseaseModelUnavailableError, DiseaseArtifactValidationError) as exc:
        pytest.skip(f"real disease artifact unavailable: {exc}")
    except DiseaseInferenceError as exc:
        pytest.fail(f"real disease artifact inference failed: {exc}")

    assert result.predicted_label in TOMATO_DISEASE_CLASS_NAMES
    assert len(result.class_probs) == len(TOMATO_DISEASE_CLASS_NAMES)
    assert sum(result.class_probs.values()) == pytest.approx(1.0, abs=1e-5)
    assert 0.0 <= result.confidence_calibrated <= 1.0
    assert 0.0 <= result.uncertainty_score <= 1.0

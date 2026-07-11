from __future__ import annotations

import base64
import hashlib
import json
import sys
import types
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
    _load_state_dict_strict,
    _load_torch_artifact_safely,
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


def _valid_pt_metadata() -> dict[str, object]:
    return {
        "model_name": "mobilenet_v3_small",
        "num_classes": len(TOMATO_DISEASE_CLASS_NAMES),
        "class_names": list(TOMATO_DISEASE_CLASS_NAMES),
        "model_state_dict": {},
        "temperature": 1.0508726748943829,
        "input_size": [224, 224],
        "normalization": {
            "mean": [0.485, 0.456, 0.406],
            "std": [0.229, 0.224, 0.225],
        },
    }


class FakeTorchVersion:
    pass


def _install_fake_torch_version(monkeypatch: pytest.MonkeyPatch) -> type:
    torch_version = types.ModuleType("torch.torch_version")
    torch_version.TorchVersion = FakeTorchVersion
    monkeypatch.setitem(sys.modules, "torch.torch_version", torch_version)
    return FakeTorchVersion


def _attach_fake_safe_globals(
    fake_torch: types.ModuleType,
    *,
    events: list[str] | None = None,
    allowlisted: list[list[object]] | None = None,
) -> None:
    class FakeSafeGlobals:
        def __init__(self, classes: list[object]) -> None:
            self.classes = classes
            if allowlisted is not None:
                allowlisted.append(classes)

        def __enter__(self) -> None:
            if events is not None:
                events.append("enter")

        def __exit__(self, exc_type, exc, traceback) -> None:
            if events is not None:
                events.append("exit")

    fake_torch.serialization = types.SimpleNamespace(
        safe_globals=lambda classes: FakeSafeGlobals(classes)
    )


class RecordingLoadStateDictModel:
    def __init__(self) -> None:
        self.loaded_state_dict: object | None = None
        self.strict: bool | None = None

    def load_state_dict(self, state_dict: object, *, strict: bool) -> None:
        self.loaded_state_dict = state_dict
        self.strict = strict


class FailingLoadStateDictModel:
    def __init__(self, exc: Exception) -> None:
        self.exc = exc

    def load_state_dict(self, state_dict: object, *, strict: bool) -> None:
        raise self.exc


def test_strict_state_dict_loading_is_requested() -> None:
    model = RecordingLoadStateDictModel()
    state_dict = {"layer.weight": object()}

    _load_state_dict_strict(model, state_dict)

    assert model.loaded_state_dict is state_dict
    assert model.strict is True


@pytest.mark.parametrize(
    "exc",
    [
        RuntimeError("Missing key classifier.3.weight with shape [10, 576]"),
        ValueError("Missing key classifier.3.weight with shape [10, 576]"),
    ],
)
def test_state_dict_load_failures_become_artifact_validation_error(
    exc: Exception,
) -> None:
    model = FailingLoadStateDictModel(exc)

    with pytest.raises(DiseaseArtifactValidationError) as error:
        _load_state_dict_strict(model, {"classifier.3.weight": object()})

    assert str(error.value) == "Disease model state dictionary is incompatible."
    assert error.value.__cause__ is exc
    assert "classifier.3.weight" not in str(error.value)
    assert "shape" not in str(error.value)


def test_torch_version_is_scoped_allowlisted_for_safe_artifact_loading(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    torch_version_class = _install_fake_torch_version(monkeypatch)
    events: list[str] = []
    allowlisted: list[list[object]] = []
    load_calls: list[dict[str, object]] = []
    expected_artifact = {"ok": True}

    fake_torch = types.ModuleType("torch")
    _attach_fake_safe_globals(
        fake_torch,
        events=events,
        allowlisted=allowlisted,
    )

    def fake_load(*args, **kwargs):
        assert events == ["enter"]
        load_calls.append({"args": args, "kwargs": kwargs})
        events.append("load")
        return expected_artifact

    fake_torch.load = fake_load
    artifact_path = tmp_path / "model.pt"

    artifact = _load_torch_artifact_safely(fake_torch, artifact_path)

    assert artifact is expected_artifact
    assert allowlisted == [[torch_version_class]]
    assert events == ["enter", "load", "exit"]
    assert load_calls == [
        {
            "args": (artifact_path,),
            "kwargs": {
                "map_location": "cpu",
                "weights_only": True,
            },
        }
    ]


def test_safe_artifact_loading_has_no_unsafe_fallback(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_torch_version(monkeypatch)
    load_calls: list[dict[str, object]] = []
    fake_torch = types.ModuleType("torch")
    _attach_fake_safe_globals(fake_torch)

    def fake_load(*args, **kwargs):
        load_calls.append({"args": args, "kwargs": kwargs})
        raise RuntimeError("Unsupported global: GLOBAL another.Package")

    fake_torch.load = fake_load

    with pytest.raises(DiseaseArtifactValidationError):
        _load_torch_artifact_safely(fake_torch, tmp_path / "model.pt")

    assert len(load_calls) == 1
    assert load_calls[0]["kwargs"]["weights_only"] is True


def test_safe_loader_failure_becomes_artifact_validation_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_torch_version(monkeypatch)
    sensitive_message = "Unsupported global: GLOBAL secret.InternalClass"
    fake_torch = types.ModuleType("torch")
    _attach_fake_safe_globals(fake_torch)
    original = RuntimeError(sensitive_message)
    fake_torch.load = lambda *args, **kwargs: (_ for _ in ()).throw(original)

    with pytest.raises(DiseaseArtifactValidationError) as error:
        _load_torch_artifact_safely(fake_torch, tmp_path / "model.pt")

    assert type(error.value) is DiseaseArtifactValidationError
    assert str(error.value) == "Disease model artifact could not be loaded safely."
    assert error.value.__cause__ is original
    assert "secret.InternalClass" not in str(error.value)


def test_missing_safe_globals_support_is_model_unavailable(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_torch_version(monkeypatch)
    fake_torch = types.ModuleType("torch")
    fake_torch.serialization = types.SimpleNamespace()

    with pytest.raises(DiseaseModelUnavailableError) as error:
        _load_torch_artifact_safely(fake_torch, tmp_path / "model.pt")

    assert type(error.value) is DiseaseModelUnavailableError


def test_missing_torch_version_support_is_model_unavailable(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delitem(sys.modules, "torch.torch_version", raising=False)
    fake_torch = types.ModuleType("torch")
    _attach_fake_safe_globals(fake_torch)
    monkeypatch.setitem(sys.modules, "torch", fake_torch)

    with pytest.raises(DiseaseModelUnavailableError) as error:
        _load_torch_artifact_safely(fake_torch, tmp_path / "model.pt")

    assert type(error.value) is DiseaseModelUnavailableError


def test_checksum_validation_happens_before_safe_artifact_loading(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    artifact_dir = _fake_artifact_dir(tmp_path)
    manifest = json.loads(
        (artifact_dir / disease_model.MANIFEST_FILENAME).read_text(
            encoding="utf-8"
        )
    )
    manifest["files"][disease_model.MODEL_FILENAME]["sha256"] = "0" * 64
    _write_json(artifact_dir / disease_model.MANIFEST_FILENAME, manifest)

    fake_torch = types.ModuleType("torch")
    fake_torch.cuda = types.SimpleNamespace(is_available=lambda: False)
    fake_torch.device = lambda value: value
    fake_torch.nn = types.SimpleNamespace(
        Linear=lambda input_features, output_features: object()
    )
    fake_transforms = types.ModuleType("torchvision.transforms")
    fake_transforms.InterpolationMode = types.SimpleNamespace(BILINEAR="bilinear")
    fake_torchvision = types.ModuleType("torchvision")
    fake_torchvision.models = types.SimpleNamespace(
        mobilenet_v3_small=lambda *, weights: object()
    )
    fake_torchvision.transforms = fake_transforms

    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    monkeypatch.setitem(sys.modules, "torchvision", fake_torchvision)
    monkeypatch.setitem(sys.modules, "torchvision.transforms", fake_transforms)
    monkeypatch.setattr(
        disease_model,
        "_load_torch_artifact_safely",
        lambda *args, **kwargs: pytest.fail("safe loader should not be called"),
    )

    predictor = TorchTomatoDiseasePredictor(
        artifact_dir=artifact_dir,
        device="cpu",
    )

    with pytest.raises(DiseaseArtifactValidationError):
        predictor._load()


def test_unsupported_additional_safe_global_remains_rejected(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_fake_torch_version(monkeypatch)
    load_calls = 0
    fake_torch = types.ModuleType("torch")
    _attach_fake_safe_globals(fake_torch)

    def fake_load(*args, **kwargs):
        nonlocal load_calls
        load_calls += 1
        raise RuntimeError("Unsupported global: GLOBAL evil.OtherClass")

    fake_torch.load = fake_load

    with pytest.raises(DiseaseArtifactValidationError):
        _load_torch_artifact_safely(fake_torch, tmp_path / "model.pt")

    assert load_calls == 1


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


def test_runtime_artifact_validation_succeeds_without_test_metrics(
    tmp_path: Path,
) -> None:
    artifact_dir = _fake_artifact_dir(tmp_path)

    metadata = _validate_runtime_artifacts(artifact_dir)

    assert metadata.model_path == artifact_dir / disease_model.MODEL_FILENAME
    assert metadata.validation_ece_after == pytest.approx(0.008117275312542915)


def test_malformed_test_metrics_does_not_block_runtime_validation(
    tmp_path: Path,
) -> None:
    artifact_dir = _fake_artifact_dir(tmp_path)
    (artifact_dir / disease_model.TEST_METRICS_FILENAME).write_text(
        "{not json",
        encoding="utf-8",
    )

    metadata = _validate_runtime_artifacts(artifact_dir)

    assert metadata.confidence_threshold == pytest.approx(0.70)


@pytest.mark.parametrize(
    "artifact",
    [
        None,
        [],
        "not a dictionary",
    ],
)
def test_malformed_pt_artifact_object_raises_artifact_validation_error(
    tmp_path: Path,
    artifact: object,
) -> None:
    metadata = _validate_runtime_artifacts(_fake_artifact_dir(tmp_path))
    predictor = TorchTomatoDiseasePredictor(artifact_dir=tmp_path)

    with pytest.raises(DiseaseArtifactValidationError):
        predictor._validate_pt_artifact(artifact, metadata)


@pytest.mark.parametrize(
    "mutation",
    [
        lambda artifact: artifact.update({"class_names": None}),
        lambda artifact: artifact.update(
            {"class_names": [*TOMATO_DISEASE_CLASS_NAMES[:-1], 7]}
        ),
        lambda artifact: artifact.update({"input_size": None}),
        lambda artifact: artifact.update({"input_size": [224, True]}),
        lambda artifact: artifact.update({"normalization": None}),
        lambda artifact: artifact["normalization"].update({"mean": [0.485, 0.456]}),
        lambda artifact: artifact["normalization"].update({"std": [0.229, 0.0, 0.225]}),
        lambda artifact: artifact.update({"temperature": float("nan")}),
        lambda artifact: artifact.update({"num_classes": True}),
        lambda artifact: artifact.pop("model_state_dict"),
    ],
)
def test_malformed_pt_metadata_raises_artifact_validation_error(
    tmp_path: Path,
    mutation,
) -> None:
    metadata = _validate_runtime_artifacts(_fake_artifact_dir(tmp_path))
    predictor = TorchTomatoDiseasePredictor(artifact_dir=tmp_path)
    artifact = _valid_pt_metadata()
    mutation(artifact)

    with pytest.raises(DiseaseArtifactValidationError):
        predictor._validate_pt_artifact(artifact, metadata)


def test_lazy_initialization_state_dict_failure_is_artifact_validation_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    artifact_dir = _fake_artifact_dir(tmp_path)
    sensitive_message = "Missing key classifier.3.weight with incompatible shape"

    class FakeClassifierLayer:
        in_features = 576

    class FakeModel:
        def __init__(self) -> None:
            self.classifier = [FakeClassifierLayer()]

        def load_state_dict(self, state_dict: object, *, strict: bool) -> None:
            assert strict is True
            raise RuntimeError(sensitive_message)

        def to(self, device: object) -> None:
            raise AssertionError("device transfer should not run after load failure")

        def eval(self) -> None:
            raise AssertionError("eval should not run after load failure")

    fake_torch = types.ModuleType("torch")
    fake_torch.cuda = types.SimpleNamespace(is_available=lambda: False)
    fake_torch.device = lambda device_name: device_name
    fake_torch.load = lambda *args, **kwargs: _valid_pt_metadata()
    fake_torch.nn = types.SimpleNamespace(
        Linear=lambda input_features, output_features: object()
    )
    _install_fake_torch_version(monkeypatch)
    _attach_fake_safe_globals(fake_torch)

    fake_models = types.SimpleNamespace(
        mobilenet_v3_small=lambda *, weights: FakeModel()
    )
    fake_transforms = types.ModuleType("torchvision.transforms")
    fake_transforms.InterpolationMode = types.SimpleNamespace(BILINEAR="bilinear")

    fake_torchvision = types.ModuleType("torchvision")
    fake_torchvision.models = fake_models
    fake_torchvision.transforms = fake_transforms

    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    monkeypatch.setitem(sys.modules, "torchvision", fake_torchvision)
    monkeypatch.setitem(sys.modules, "torchvision.transforms", fake_transforms)

    predictor = TorchTomatoDiseasePredictor(
        artifact_dir=artifact_dir,
        device="cpu",
    )

    with pytest.raises(DiseaseArtifactValidationError) as error:
        predictor._load()

    assert type(error.value) is DiseaseArtifactValidationError
    assert str(error.value) == "Disease model state dictionary is incompatible."
    assert error.value.__cause__ is not None
    assert sensitive_message not in str(error.value)
    assert not predictor._loaded
    assert predictor._model is None


def test_model_construction_failure_is_model_unavailable(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    artifact_dir = _fake_artifact_dir(tmp_path)

    fake_torch = types.ModuleType("torch")
    fake_torch.cuda = types.SimpleNamespace(is_available=lambda: False)
    fake_torch.device = lambda value: value
    fake_torch.load = lambda *args, **kwargs: _valid_pt_metadata()
    _install_fake_torch_version(monkeypatch)
    _attach_fake_safe_globals(fake_torch)

    fake_models = types.SimpleNamespace(
        mobilenet_v3_small=lambda *, weights: (_ for _ in ()).throw(
            RuntimeError("runtime unavailable")
        )
    )

    fake_transforms = types.ModuleType("torchvision.transforms")
    fake_transforms.InterpolationMode = types.SimpleNamespace(
        BILINEAR="bilinear"
    )

    fake_torchvision = types.ModuleType("torchvision")
    fake_torchvision.models = fake_models
    fake_torchvision.transforms = fake_transforms

    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    monkeypatch.setitem(sys.modules, "torchvision", fake_torchvision)
    monkeypatch.setitem(
        sys.modules,
        "torchvision.transforms",
        fake_transforms,
    )

    predictor = TorchTomatoDiseasePredictor(
        artifact_dir=artifact_dir,
        device="cpu",
    )

    with pytest.raises(DiseaseModelUnavailableError) as error:
        predictor._load()

    assert type(error.value) is DiseaseModelUnavailableError


def test_device_transfer_failure_is_model_unavailable(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    artifact_dir = _fake_artifact_dir(tmp_path)

    class FakeClassifierLayer:
        in_features = 576

    class FakeModel:
        def __init__(self) -> None:
            self.classifier = [FakeClassifierLayer()]

        def load_state_dict(
            self,
            state_dict: object,
            *,
            strict: bool,
        ) -> None:
            assert strict is True

        def to(self, device: object) -> None:
            raise RuntimeError("device transfer failed")

        def eval(self) -> None:
            raise AssertionError("eval should not run")

    fake_torch = types.ModuleType("torch")
    fake_torch.cuda = types.SimpleNamespace(is_available=lambda: False)
    fake_torch.device = lambda value: value
    fake_torch.load = lambda *args, **kwargs: _valid_pt_metadata()
    fake_torch.nn = types.SimpleNamespace(
        Linear=lambda input_features, output_features: object()
    )
    _install_fake_torch_version(monkeypatch)
    _attach_fake_safe_globals(fake_torch)

    fake_models = types.SimpleNamespace(
        mobilenet_v3_small=lambda *, weights: FakeModel()
    )

    fake_transforms = types.ModuleType("torchvision.transforms")
    fake_transforms.InterpolationMode = types.SimpleNamespace(
        BILINEAR="bilinear"
    )

    fake_torchvision = types.ModuleType("torchvision")
    fake_torchvision.models = fake_models
    fake_torchvision.transforms = fake_transforms

    monkeypatch.setitem(sys.modules, "torch", fake_torch)
    monkeypatch.setitem(sys.modules, "torchvision", fake_torchvision)
    monkeypatch.setitem(
        sys.modules,
        "torchvision.transforms",
        fake_transforms,
    )

    predictor = TorchTomatoDiseasePredictor(
        artifact_dir=artifact_dir,
        device="cpu",
    )

    with pytest.raises(DiseaseModelUnavailableError) as error:
        predictor._load()

    assert type(error.value) is DiseaseModelUnavailableError
    assert not predictor._loaded
    assert predictor._model is None


def test_optional_real_artifact_cpu_smoke() -> None:
    pytest.importorskip("torch")
    pytest.importorskip("torchvision")

    if not disease_model.DEFAULT_DISEASE_ARTIFACT_DIR.is_dir():
        pytest.fail("Committed disease artifact directory is absent.")

    if not (
        disease_model.DEFAULT_DISEASE_ARTIFACT_DIR / disease_model.MODEL_FILENAME
    ).is_file():
        pytest.fail("Committed disease model file is absent.")

    predictor = TorchTomatoDiseasePredictor(device="cpu")

    try:
        result = predictor.predict(_tiny_jpeg_base64())
    except DiseaseArtifactValidationError as exc:
        pytest.fail(f"Committed disease artifact is invalid: {exc}")
    except DiseaseModelUnavailableError as exc:
        pytest.skip(f"Vision runtime unavailable: {exc}")
    except DiseaseInferenceError as exc:
        pytest.fail(f"real disease artifact inference failed: {exc}")

    assert result.predicted_label in TOMATO_DISEASE_CLASS_NAMES
    assert len(result.class_probs) == len(TOMATO_DISEASE_CLASS_NAMES)
    assert sum(result.class_probs.values()) == pytest.approx(1.0, abs=1e-5)
    assert 0.0 <= result.confidence_calibrated <= 1.0
    assert 0.0 <= result.uncertainty_score <= 1.0

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import math
import os
import re
import threading
from collections.abc import Mapping
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from PIL import Image, UnidentifiedImageError

from app.disease.classes import (
    TOMATO_DISEASE_CLASS_NAMES,
    get_disease_category,
)
from app.disease.uncertainty import (
    ACCEPTANCE_CONFIDENCE_THRESHOLD,
    uncertainty_band_from_confidence,
    uncertainty_score_from_confidence,
)
from app.schemas import DiseaseCategory, UncertaintyBand


DEFAULT_DISEASE_MODEL_NAME = "croptwin_tomato_mobilenet_v3_small"
DEFAULT_DISEASE_MODEL_VERSION = "1.0"
DEFAULT_DISEASE_MODEL_BASIS = (
    "plantvillage_tomato_10_class_mobilenet_v3_small_imagenet_pretrained_"
    "classifier_head_then_final_block_finetuned_on_amd_rocm"
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DISEASE_ARTIFACT_DIR = REPOSITORY_ROOT / "model_artifacts" / "croptwin_disease"
CROPTWIN_DISEASE_ARTIFACT_DIR_ENV = "CROPTWIN_DISEASE_ARTIFACT_DIR"

MODEL_FILENAME = "croptwin_tomato_mobilenet_v3_small.pt"
CLASS_TO_IDX_FILENAME = "class_to_idx.json"
UNCERTAINTY_POLICY_FILENAME = "uncertainty_policy.json"
TEMPERATURE_FILENAME = "temperature.json"
MANIFEST_FILENAME = "manifest.json"
TEST_METRICS_FILENAME = "test_metrics.json"

MAX_DECODED_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000
_BASE64_DATA_URI_RE = re.compile(r"^data:[^;,]+;base64,", re.IGNORECASE)
_FLOAT_TOLERANCE = 1e-6


class DiseasePredictorError(Exception):
    """Base class for disease predictor errors."""


class InvalidDiseaseImageError(DiseasePredictorError):
    """Raised when the submitted image cannot be safely decoded."""


class DiseaseModelUnavailableError(DiseasePredictorError):
    """Raised when dependencies, devices, or artifacts are unavailable."""


class DiseaseArtifactValidationError(DiseaseModelUnavailableError):
    """Raised when the deployment artifact bundle fails validation."""


class DiseaseInferenceError(DiseasePredictorError):
    """Raised when model execution fails."""


@dataclass(frozen=True)
class DiseaseInferenceResult:
    predicted_label: str
    disease_category: DiseaseCategory
    class_probs: dict[str, float]
    confidence_calibrated: float
    uncertainty_score: float
    uncertainty_band: UncertaintyBand


@runtime_checkable
class DiseasePredictor(Protocol):
    model_name: str
    model_version: str

    def predict(self, image_base64: str) -> DiseaseInferenceResult:
        ...


@dataclass(frozen=True)
class DiseaseArtifactMetadata:
    artifact_dir: Path
    model_path: Path
    class_names: tuple[str, ...]
    temperature: float
    confidence_threshold: float
    validation_ece_after: float | None
    normalization_mean: tuple[float, float, float] | None = None
    normalization_std: tuple[float, float, float] | None = None


def get_default_artifact_dir() -> Path:
    override = os.environ.get(CROPTWIN_DISEASE_ARTIFACT_DIR_ENV)
    if override:
        return Path(override).expanduser().resolve()
    return DEFAULT_DISEASE_ARTIFACT_DIR


def _safe_reason(exc: Exception) -> str:
    message = str(exc).strip()
    return message if message else exc.__class__.__name__


def _read_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except OSError as exc:
        raise DiseaseArtifactValidationError("Required artifact metadata is unreadable.") from exc
    except json.JSONDecodeError as exc:
        raise DiseaseArtifactValidationError("Required artifact metadata is invalid JSON.") from exc

    if not isinstance(data, dict):
        raise DiseaseArtifactValidationError("Artifact metadata must be a JSON object.")

    return data


def _validate_runtime_file(path: Path) -> None:
    if not path.is_file():
        raise DiseaseArtifactValidationError("A required disease model artifact file is missing.")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as exc:
        raise DiseaseArtifactValidationError("Could not read disease model artifact.") from exc
    return digest.hexdigest()


def _finite_float(name: str, value: object, *, positive: bool = False) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise DiseaseArtifactValidationError(f"{name} must be a finite number.")

    result = float(value)

    if not math.isfinite(result):
        raise DiseaseArtifactValidationError(f"{name} must be finite.")

    if positive and result <= 0.0:
        raise DiseaseArtifactValidationError(f"{name} must be positive.")

    return result


def _validate_class_to_idx(class_to_idx: dict[str, Any]) -> tuple[str, ...]:
    if set(class_to_idx) != set(TOMATO_DISEASE_CLASS_NAMES):
        raise DiseaseArtifactValidationError("class_to_idx labels do not match the canonical tomato classes.")

    seen_indices: set[int] = set()
    labels_by_index: dict[int, str] = {}

    for label, index_value in class_to_idx.items():
        if isinstance(index_value, bool) or not isinstance(index_value, int):
            raise DiseaseArtifactValidationError("class_to_idx indices must be integers.")

        if index_value in seen_indices:
            raise DiseaseArtifactValidationError("class_to_idx contains duplicate indices.")

        seen_indices.add(index_value)
        labels_by_index[index_value] = label

    expected_indices = set(range(len(TOMATO_DISEASE_CLASS_NAMES)))
    if seen_indices != expected_indices:
        raise DiseaseArtifactValidationError("class_to_idx indices must be exactly 0 through 9.")

    ordered = tuple(labels_by_index[index] for index in range(len(TOMATO_DISEASE_CLASS_NAMES)))
    if ordered != TOMATO_DISEASE_CLASS_NAMES:
        raise DiseaseArtifactValidationError("class_to_idx order does not match the trained artifact.")

    return ordered


def _validate_runtime_artifacts(artifact_dir: str | Path | None = None) -> DiseaseArtifactMetadata:
    root = Path(artifact_dir).expanduser().resolve() if artifact_dir is not None else get_default_artifact_dir()
    required_files = (
        MODEL_FILENAME,
        CLASS_TO_IDX_FILENAME,
        UNCERTAINTY_POLICY_FILENAME,
        TEMPERATURE_FILENAME,
        MANIFEST_FILENAME,
    )
    for filename in required_files:
        _validate_runtime_file(root / filename)

    manifest = _read_json(root / MANIFEST_FILENAME)
    files = manifest.get("files")
    if not isinstance(files, dict):
        raise DiseaseArtifactValidationError("manifest.json must contain a files object.")

    model_manifest = files.get(MODEL_FILENAME)
    if not isinstance(model_manifest, dict):
        raise DiseaseArtifactValidationError("manifest.json is missing the model checksum entry.")

    expected_sha256 = model_manifest.get("sha256")
    if not isinstance(expected_sha256, str) or not expected_sha256:
        raise DiseaseArtifactValidationError("manifest model checksum is invalid.")

    model_path = root / MODEL_FILENAME
    if _sha256_file(model_path) != expected_sha256:
        raise DiseaseArtifactValidationError("Disease model artifact checksum mismatch.")

    class_names = _validate_class_to_idx(_read_json(root / CLASS_TO_IDX_FILENAME))
    uncertainty_policy = _read_json(root / UNCERTAINTY_POLICY_FILENAME)
    confidence_threshold = _finite_float(
        "confidence_threshold",
        uncertainty_policy.get("confidence_threshold"),
    )
    if not math.isclose(
        confidence_threshold,
        ACCEPTANCE_CONFIDENCE_THRESHOLD,
        rel_tol=0.0,
        abs_tol=1e-12,
    ):
        raise DiseaseArtifactValidationError("Uncertainty confidence threshold does not match API policy.")

    temperature_json = _read_json(root / TEMPERATURE_FILENAME)
    temperature = _finite_float("temperature", temperature_json.get("temperature"), positive=True)
    policy_temperature = uncertainty_policy.get("temperature")
    if policy_temperature is not None and not math.isclose(
        temperature,
        _finite_float("uncertainty_policy.temperature", policy_temperature, positive=True),
        rel_tol=0.0,
        abs_tol=1e-12,
    ):
        raise DiseaseArtifactValidationError("Temperature metadata is inconsistent.")

    validation_after = temperature_json.get("validation_after")
    validation_ece_after = None
    if isinstance(validation_after, dict) and "expected_calibration_error" in validation_after:
        validation_ece_after = _finite_float(
            "validation_after.expected_calibration_error",
            validation_after["expected_calibration_error"],
        )

    return DiseaseArtifactMetadata(
        artifact_dir=root,
        model_path=model_path,
        class_names=class_names,
        temperature=temperature,
        confidence_threshold=confidence_threshold,
        validation_ece_after=validation_ece_after,
    )


def _decode_image_base64(image_base64: str) -> Image.Image:
    if not isinstance(image_base64, str) or not image_base64.strip():
        raise InvalidDiseaseImageError("Image payload must be a non-empty base64 string.")

    payload = _BASE64_DATA_URI_RE.sub("", image_base64.strip(), count=1)
    payload = "".join(payload.split())

    if not payload:
        raise InvalidDiseaseImageError("Image payload must be a non-empty base64 string.")

    try:
        decoded = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise InvalidDiseaseImageError("Image payload is not valid base64.") from exc

    if not decoded:
        raise InvalidDiseaseImageError("Decoded image payload is empty.")

    if len(decoded) > MAX_DECODED_IMAGE_BYTES:
        raise InvalidDiseaseImageError("Decoded image payload is too large.")

    try:
        with Image.open(BytesIO(decoded)) as image:
            image.verify()
        with Image.open(BytesIO(decoded)) as image:
            width, height = image.size
            if width <= 0 or height <= 0:
                raise InvalidDiseaseImageError("Image dimensions must be positive.")
            if width * height > MAX_IMAGE_PIXELS:
                raise InvalidDiseaseImageError("Image dimensions are too large.")
            return image.convert("RGB").copy()
    except InvalidDiseaseImageError:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise InvalidDiseaseImageError("Image payload is not a supported readable image.") from exc


class TorchTomatoDiseasePredictor:
    model_name = DEFAULT_DISEASE_MODEL_NAME
    model_version = DEFAULT_DISEASE_MODEL_VERSION

    def __init__(
        self,
        artifact_dir: str | Path | None = None,
        device: str | None = None,
    ) -> None:
        self._artifact_dir = Path(artifact_dir).expanduser().resolve() if artifact_dir is not None else get_default_artifact_dir()
        self._requested_device = device
        self._load_lock = threading.Lock()
        self._inference_lock = threading.Lock()
        self._loaded = False
        self._model: Any = None
        self._device: Any = None
        self._transform: Any = None
        self._metadata: DiseaseArtifactMetadata | None = None

    def _load(self) -> None:
        if self._loaded:
            return

        with self._load_lock:
            if self._loaded:
                return

            try:
                import torch
                from torchvision import models, transforms
                from torchvision.transforms import InterpolationMode
            except ImportError as exc:
                raise DiseaseModelUnavailableError("Optional vision dependencies are not installed.") from exc

            metadata = _validate_runtime_artifacts(self._artifact_dir)

            try:
                if self._requested_device is None:
                    device_name = "cuda:0" if torch.cuda.is_available() else "cpu"
                else:
                    device_name = self._requested_device

                if device_name.startswith("cuda") and not torch.cuda.is_available():
                    raise DiseaseModelUnavailableError("Requested CUDA/ROCm device is unavailable.")

                device = torch.device(device_name)
            except DiseaseModelUnavailableError:
                raise
            except Exception as exc:
                raise DiseaseModelUnavailableError("Requested disease model device is unavailable.") from exc

            try:
                artifact = torch.load(
                    metadata.model_path,
                    map_location="cpu",
                    weights_only=True,
                )
            except TypeError as exc:
                raise DiseaseModelUnavailableError(
                    "Installed PyTorch does not support safe weights_only artifact loading."
                ) from exc
            except Exception as exc:
                raise DiseaseArtifactValidationError("Disease model artifact could not be loaded safely.") from exc

            self._validate_pt_artifact(artifact, metadata)

            try:
                model = models.mobilenet_v3_small(weights=None)
                input_features = model.classifier[-1].in_features
                model.classifier[-1] = torch.nn.Linear(input_features, len(TOMATO_DISEASE_CLASS_NAMES))
                model.load_state_dict(artifact["model_state_dict"], strict=True)
                model.to(device)
                model.eval()

                normalization = artifact["normalization"]
                mean = tuple(float(value) for value in normalization["mean"])
                std = tuple(float(value) for value in normalization["std"])
                transform = transforms.Compose(
                    [
                        transforms.Resize(
                            256,
                            interpolation=InterpolationMode.BILINEAR,
                            antialias=True,
                        ),
                        transforms.CenterCrop((224, 224)),
                        transforms.ToTensor(),
                        transforms.Normalize(mean=mean, std=std),
                    ]
                )
            except DiseaseArtifactValidationError:
                raise
            except Exception as exc:
                raise DiseaseModelUnavailableError("Disease model artifact is incompatible with the runtime.") from exc

            self._model = model
            self._device = device
            self._transform = transform
            self._metadata = metadata
            self._loaded = True

    def _validate_pt_artifact(
        self,
        artifact: object,
        metadata: DiseaseArtifactMetadata,
    ) -> None:
        try:
            if not isinstance(artifact, Mapping):
                raise DiseaseArtifactValidationError(
                    "Disease model artifact must be a dictionary."
                )

            required_keys = {
                "model_name",
                "num_classes",
                "class_names",
                "model_state_dict",
                "temperature",
                "input_size",
                "normalization",
            }
            if not required_keys.issubset(artifact.keys()):
                raise DiseaseArtifactValidationError(
                    "Disease model artifact is missing required keys."
                )

            model_name = artifact["model_name"]
            if not isinstance(model_name, str):
                raise DiseaseArtifactValidationError(
                    "Disease model artifact model_name is invalid."
                )
            if model_name != "mobilenet_v3_small":
                raise DiseaseArtifactValidationError(
                    "Unexpected disease model architecture."
                )

            num_classes = artifact["num_classes"]
            if isinstance(num_classes, bool) or not isinstance(num_classes, int):
                raise DiseaseArtifactValidationError(
                    "Disease model artifact num_classes is invalid."
                )
            if num_classes != len(TOMATO_DISEASE_CLASS_NAMES):
                raise DiseaseArtifactValidationError(
                    "Unexpected disease class count."
                )

            class_names = artifact["class_names"]
            if not isinstance(class_names, (list, tuple)):
                raise DiseaseArtifactValidationError(
                    "Disease model artifact class_names is invalid."
                )
            if len(class_names) != len(TOMATO_DISEASE_CLASS_NAMES):
                raise DiseaseArtifactValidationError(
                    "Disease model artifact class_names length is invalid."
                )
            if any(not isinstance(label, str) for label in class_names):
                raise DiseaseArtifactValidationError(
                    "Disease model artifact class_names entries are invalid."
                )
            if tuple(class_names) != TOMATO_DISEASE_CLASS_NAMES:
                raise DiseaseArtifactValidationError(
                    "Artifact class order does not match API policy."
                )

            model_state_dict = artifact["model_state_dict"]
            if not isinstance(model_state_dict, Mapping):
                raise DiseaseArtifactValidationError(
                    "Disease model artifact state dictionary is invalid."
                )

            input_size = artifact["input_size"]
            if not isinstance(input_size, (list, tuple)) or len(input_size) != 2:
                raise DiseaseArtifactValidationError(
                    "Disease model artifact input_size is invalid."
                )
            if any(isinstance(value, bool) or not isinstance(value, int) for value in input_size):
                raise DiseaseArtifactValidationError(
                    "Disease model artifact input_size values are invalid."
                )
            if list(input_size) != [224, 224]:
                raise DiseaseArtifactValidationError(
                    "Unexpected disease model input size."
                )

            normalization = artifact["normalization"]
            if not isinstance(normalization, Mapping):
                raise DiseaseArtifactValidationError(
                    "Artifact normalization metadata is invalid."
                )
            mean = normalization.get("mean")
            std = normalization.get("std")
            if (
                not isinstance(mean, (list, tuple))
                or not isinstance(std, (list, tuple))
                or len(mean) != 3
                or len(std) != 3
            ):
                raise DiseaseArtifactValidationError(
                    "Artifact normalization mean/std must contain three values."
                )

            for value in mean:
                _finite_float("normalization.mean", value)
            for value in std:
                _finite_float("normalization.std", value, positive=True)

            artifact_temperature = _finite_float(
                "artifact.temperature",
                artifact["temperature"],
                positive=True,
            )
            if not math.isclose(
                artifact_temperature,
                metadata.temperature,
                rel_tol=0.0,
                abs_tol=1e-12,
            ):
                raise DiseaseArtifactValidationError(
                    "Artifact temperature does not match temperature.json."
                )
        except DiseaseArtifactValidationError:
            raise
        except Exception as exc:
            raise DiseaseArtifactValidationError(
                "Disease model artifact metadata is invalid."
            ) from exc

    def predict(self, image_base64: str) -> DiseaseInferenceResult:
        image = _decode_image_base64(image_base64)
        self._load()

        with self._inference_lock:
            try:
                import torch
            except ImportError as exc:
                raise DiseaseModelUnavailableError("Optional vision dependencies are not installed.") from exc

            try:
                assert self._model is not None
                assert self._device is not None
                assert self._transform is not None
                assert self._metadata is not None

                tensor = self._transform(image).unsqueeze(0).to(self._device)
                with torch.inference_mode():
                    logits = self._model(tensor)

                if tuple(logits.shape) != (1, len(TOMATO_DISEASE_CLASS_NAMES)):
                    raise DiseaseInferenceError("Disease model returned an unexpected logits shape.")

                if not torch.isfinite(logits).all().item():
                    raise DiseaseInferenceError("Disease model returned non-finite logits.")

                calibrated_logits = logits / self._metadata.temperature
                probabilities_tensor = torch.softmax(calibrated_logits, dim=1).detach().cpu()[0]

                if not torch.isfinite(probabilities_tensor).all().item():
                    raise DiseaseInferenceError("Disease model returned non-finite probabilities.")

                probabilities = [float(value) for value in probabilities_tensor.tolist()]
                if len(probabilities) != len(TOMATO_DISEASE_CLASS_NAMES):
                    raise DiseaseInferenceError("Disease model returned the wrong probability count.")

                probability_sum = sum(probabilities)
                if not math.isfinite(probability_sum) or probability_sum <= 0.0:
                    raise DiseaseInferenceError("Disease model returned invalid probabilities.")

                if not math.isclose(probability_sum, 1.0, rel_tol=0.0, abs_tol=1e-5):
                    probabilities = [value / probability_sum for value in probabilities]

                if any(not math.isfinite(value) or value < -_FLOAT_TOLERANCE or value > 1.0 + _FLOAT_TOLERANCE for value in probabilities):
                    raise DiseaseInferenceError("Disease model returned out-of-range probabilities.")

                probabilities = [min(1.0, max(0.0, value)) for value in probabilities]
                top_index = max(range(len(probabilities)), key=probabilities.__getitem__)
                predicted_label = TOMATO_DISEASE_CLASS_NAMES[top_index]
                confidence = float(probabilities[top_index])

                return DiseaseInferenceResult(
                    predicted_label=predicted_label,
                    disease_category=get_disease_category(predicted_label),
                    class_probs={
                        label: float(probabilities[index])
                        for index, label in enumerate(TOMATO_DISEASE_CLASS_NAMES)
                    },
                    confidence_calibrated=confidence,
                    uncertainty_score=uncertainty_score_from_confidence(confidence),
                    uncertainty_band=uncertainty_band_from_confidence(confidence),
                )
            except DiseasePredictorError:
                raise
            except Exception as exc:
                raise DiseaseInferenceError("Tomato disease inference failed.") from exc

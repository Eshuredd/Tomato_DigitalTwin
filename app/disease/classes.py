from __future__ import annotations

from app.schemas import DiseaseCategory


TOMATO_DISEASE_CLASS_NAMES: tuple[str, ...] = (
    "Tomato___Bacterial_spot",
    "Tomato___Early_blight",
    "Tomato___Late_blight",
    "Tomato___Leaf_Mold",
    "Tomato___Septoria_leaf_spot",
    "Tomato___Spider_mites Two-spotted_spider_mite",
    "Tomato___Target_Spot",
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus",
    "Tomato___Tomato_mosaic_virus",
    "Tomato___healthy",
)


_LABEL_TO_CATEGORY: dict[str, DiseaseCategory] = {
    "Tomato___Bacterial_spot": DiseaseCategory.BACTERIAL,
    "Tomato___Early_blight": DiseaseCategory.FUNGAL,
    "Tomato___Late_blight": DiseaseCategory.FUNGAL,
    "Tomato___Leaf_Mold": DiseaseCategory.FUNGAL,
    "Tomato___Septoria_leaf_spot": DiseaseCategory.FUNGAL,
    # The API schema has no pest category, so spider mites remain non-disease
    # evidence instead of being mislabeled as fungal, bacterial, or viral.
    "Tomato___Spider_mites Two-spotted_spider_mite": DiseaseCategory.NONE,
    "Tomato___Target_Spot": DiseaseCategory.FUNGAL,
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus": DiseaseCategory.VIRAL,
    "Tomato___Tomato_mosaic_virus": DiseaseCategory.VIRAL,
    "Tomato___healthy": DiseaseCategory.NONE,
}


DISEASE_CLASSES: tuple[tuple[str, DiseaseCategory], ...] = tuple(
    (label, _LABEL_TO_CATEGORY[label])
    for label in TOMATO_DISEASE_CLASS_NAMES
)


def get_disease_category(label: str) -> DiseaseCategory:
    try:
        return _LABEL_TO_CATEGORY[label]
    except KeyError as exc:
        raise ValueError(f"Unknown tomato disease label: {label!r}.") from exc

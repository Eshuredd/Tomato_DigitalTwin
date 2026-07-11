from __future__ import annotations

import pytest

from app.disease.classes import (
    DISEASE_CLASSES,
    TOMATO_DISEASE_CLASS_NAMES,
    get_disease_category,
)
from app.schemas import DiseaseCategory


EXPECTED_CATEGORIES = {
    "Tomato___Bacterial_spot": DiseaseCategory.BACTERIAL,
    "Tomato___Early_blight": DiseaseCategory.FUNGAL,
    "Tomato___Late_blight": DiseaseCategory.FUNGAL,
    "Tomato___Leaf_Mold": DiseaseCategory.FUNGAL,
    "Tomato___Septoria_leaf_spot": DiseaseCategory.FUNGAL,
    "Tomato___Spider_mites Two-spotted_spider_mite": DiseaseCategory.NONE,
    "Tomato___Target_Spot": DiseaseCategory.FUNGAL,
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus": DiseaseCategory.VIRAL,
    "Tomato___Tomato_mosaic_virus": DiseaseCategory.VIRAL,
    "Tomato___healthy": DiseaseCategory.NONE,
}


def test_exact_tomato_disease_class_order() -> None:
    assert TOMATO_DISEASE_CLASS_NAMES == (
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


def test_every_label_has_expected_category() -> None:
    assert dict(DISEASE_CLASSES) == EXPECTED_CATEGORIES
    for label, category in EXPECTED_CATEGORIES.items():
        assert get_disease_category(label) is category


def test_unknown_label_raises_value_error() -> None:
    with pytest.raises(ValueError):
        get_disease_category("Tomato___unknown")

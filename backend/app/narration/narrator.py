from __future__ import annotations

import json
from typing import Protocol

from app.schemas import (
    ActionEnum,
    CautionReason,
    IrrigationConstraint,
    NarrationResponse,
    RecommendationResponse,
)


MAX_LLM_RATIONALE_CHARS = 1200

MAX_LLM_RATIONALE_CHARS_BASIS = (
    "mvp_safety_limit_for_llm_narration_length"
)

POSITIVE_IRRIGATION_PHRASES: tuple[str, ...] = (
    "irrigate now",
    "irrigate today",
    "irrigate in 6 hours",
    "irrigate tomorrow",
    "water now",
    "water today",
    "water tomorrow",
)

NO_IRRIGATION_PHRASES: tuple[str, ...] = (
    "do not irrigate",
    "don't irrigate",
    "no irrigation needed",
    "skip irrigation",
    "avoid irrigation",
    "do not water",
    "don't water",
    "no watering needed",
)

IRRIGATION_NEGATION_MARKERS: tuple[str, ...] = (
    "do not",
    "don't",
    "no need to",
    "avoid",
    "skip",
)

OVERHEAD_OK_PHRASES: tuple[str, ...] = (
    "overhead irrigation is okay",
    "overhead irrigation is safe",
    "overhead irrigation is recommended",
    "overhead watering is okay",
    "overhead watering is safe",
    "overhead watering is recommended",
    "wet the leaves",
    "spray the leaves",
)

EARLY_MORNING_CONTRADICTION_PHRASES: tuple[str, ...] = (
    "timing does not matter",
    "any time is fine",
    "avoid early morning",
    "do not irrigate in the morning",
)

NO_INSPECTION_PHRASES: tuple[str, ...] = (
    "inspection is not needed",
    "no inspection needed",
    "no need to inspect",
    "do not inspect",
    "don't inspect",
)

CERTAINTY_CONTRADICTION_PHRASES: tuple[str, ...] = (
    "the model is certain",
    "uncertainty is low",
    "prediction is confirmed",
    "disease is confirmed",
    "fungal disease is confirmed",
)

NO_DISEASE_RISK_PHRASES: tuple[str, ...] = (
    "no fungal risk",
    "no disease risk",
    "fungal risk is absent",
    "disease risk is absent",
)

STRUCTURED_OUTPUT_PREFIXES: tuple[str, ...] = (
    "{",
    "[",
    "```",
)


class NarrationClient(Protocol):
    def generate(self, *, prompt: str) -> str:
        ...


def validate_recommendation_for_narration(
    recommendation: RecommendationResponse,
) -> None:
    """Validate that a deterministic recommendation can be narrated safely."""
    if not isinstance(recommendation, RecommendationResponse):
        raise ValueError("recommendation must be a RecommendationResponse.")

    if (
        not isinstance(recommendation.state_id, str)
        or not recommendation.state_id.strip()
    ):
        raise ValueError("recommendation.state_id must be a non-empty string.")

    if not isinstance(recommendation.chosen_action, ActionEnum):
        raise ValueError("recommendation.chosen_action must be an ActionEnum.")

    if not isinstance(recommendation.irrigation_constraint, IrrigationConstraint):
        raise ValueError(
            "recommendation.irrigation_constraint must be an IrrigationConstraint."
        )

    if not isinstance(recommendation.inspection_advisory, bool):
        raise ValueError("recommendation.inspection_advisory must be a bool.")

    if not isinstance(recommendation.decision_reason_codes, list):
        raise ValueError("recommendation.decision_reason_codes must be a list.")
    for reason_code in recommendation.decision_reason_codes:
        if not isinstance(reason_code, str) or not reason_code.strip():
            raise ValueError(
                "every decision_reason_codes item must be a non-empty string."
            )

    if not isinstance(recommendation.caution_reasons, list):
        raise ValueError("recommendation.caution_reasons must be a list.")
    for caution_reason in recommendation.caution_reasons:
        if not isinstance(caution_reason, CautionReason):
            raise ValueError(
                "every caution_reasons item must be a CautionReason enum member."
            )

    if not isinstance(recommendation.evidence_summary_structured, dict):
        raise ValueError("recommendation.evidence_summary_structured must be a dict.")


def _action_label(action: ActionEnum) -> str:
    if not isinstance(action, ActionEnum):
        raise ValueError("action must be an ActionEnum.")
    if action is ActionEnum.IRRIGATE_NOW:
        return "Irrigate now"
    if action is ActionEnum.IRRIGATE_IN_6H:
        return "Irrigate in 6 hours"
    if action is ActionEnum.IRRIGATE_TOMORROW_AM:
        return "Irrigate tomorrow morning"
    if action is ActionEnum.NO_IRRIGATION_24H:
        return "Do not irrigate in the next 24 hours"
    raise ValueError("unsupported ActionEnum.")


def _constraint_text(constraint: IrrigationConstraint) -> str | None:
    if not isinstance(constraint, IrrigationConstraint):
        raise ValueError("constraint must be an IrrigationConstraint.")
    if constraint is IrrigationConstraint.NONE:
        return None
    if constraint is IrrigationConstraint.AVOID_OVERHEAD_IRRIGATION:
        return "Avoid overhead irrigation to reduce leaf wetness."
    if constraint is IrrigationConstraint.PREFER_EARLY_MORNING_WINDOW:
        return "Prefer an early-morning irrigation window."
    raise ValueError("unsupported IrrigationConstraint.")


def _get_evidence_float(
    evidence: dict[str, object],
    key: str,
) -> float | None:
    value = evidence.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _get_evidence_bool(
    evidence: dict[str, object],
    key: str,
) -> bool | None:
    value = evidence.get(key)
    if isinstance(value, bool):
        return value
    return None


def _get_evidence_str(
    evidence: dict[str, object],
    key: str,
) -> str | None:
    value = evidence.get(key)
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    if not stripped:
        return None
    return stripped


def _format_mm(value: float) -> str:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("value must be an int or float.")
    return f"{float(value):.1f} mm"


def _contains_any_phrase(
    *,
    text_lower: str,
    phrases: tuple[str, ...],
) -> bool:
    if not isinstance(text_lower, str):
        raise ValueError("text_lower must be a string.")
    if not isinstance(phrases, tuple) or not all(
        isinstance(phrase, str) for phrase in phrases
    ):
        raise ValueError("phrases must be a tuple of strings.")
    return any(phrase in text_lower for phrase in phrases)


def _phrase_has_nearby_negation(
    *,
    text_lower: str,
    phrase: str,
) -> bool:
    index = text_lower.find(phrase)
    if index < 0:
        return False
    window = text_lower[max(0, index - 24) : index]
    return any(marker in window for marker in IRRIGATION_NEGATION_MARKERS)


def _contains_positive_irrigation_instruction(
    *,
    text_lower: str,
) -> bool:
    for phrase in POSITIVE_IRRIGATION_PHRASES:
        if phrase in text_lower and not _phrase_has_nearby_negation(
            text_lower=text_lower,
            phrase=phrase,
        ):
            return True
    return False


def _llm_text_looks_like_structured_output(text: str) -> bool:
    if not isinstance(text, str):
        raise ValueError("text must be a string.")
    stripped = text.lstrip()
    return stripped.startswith(STRUCTURED_OUTPUT_PREFIXES) or "```" in text


def _caution_text(
    *,
    recommendation: RecommendationResponse,
) -> str | None:
    validate_recommendation_for_narration(recommendation)
    evidence = recommendation.evidence_summary_structured
    caution_reasons = recommendation.caution_reasons

    if recommendation.inspection_advisory:
        predicted_label = _get_evidence_str(evidence, "predicted_label")
        disease_category = _get_evidence_str(evidence, "disease_category")
        if predicted_label or disease_category:
            return (
                "Inspection advised: the model reported an uncertain disease signal, "
                "so check the plant before relying on disease-specific irrigation "
                "constraints."
            )
        return (
            "Inspection advised: check the plant before relying on disease-specific "
            "irrigation constraints."
        )

    if CautionReason.HIGH_UNCERTAINTY in caution_reasons:
        return (
            "High uncertainty is flagged, so inspect the plant before relying on "
            "disease-specific irrigation constraints."
        )

    if CautionReason.FUNGAL_DISEASE_RISK in caution_reasons:
        if (
            recommendation.irrigation_constraint
            is IrrigationConstraint.AVOID_OVERHEAD_IRRIGATION
        ):
            return (
                "Fungal disease risk is flagged, so avoid wetting the leaves during "
                "irrigation."
            )
        if recommendation.irrigation_constraint is IrrigationConstraint.NONE:
            return (
                "Fungal disease risk is flagged, but no irrigation method constraint "
                "is applied for this action."
            )

    if (
        recommendation.irrigation_constraint
        is IrrigationConstraint.PREFER_EARLY_MORNING_WINDOW
    ):
        return _constraint_text(recommendation.irrigation_constraint)

    return None


def _build_deterministic_headline(
    *,
    recommendation: RecommendationResponse,
) -> str:
    validate_recommendation_for_narration(recommendation)
    action = recommendation.chosen_action
    constraint = recommendation.irrigation_constraint

    if action is ActionEnum.NO_IRRIGATION_24H:
        return "No irrigation needed in the next 24 hours"

    label = _action_label(action)
    headline = label[:1].upper() + label[1:]

    if constraint is IrrigationConstraint.AVOID_OVERHEAD_IRRIGATION:
        return f"{headline}, but avoid overhead watering"
    if constraint is IrrigationConstraint.PREFER_EARLY_MORNING_WINDOW:
        return f"{headline}, preferably in an early-morning window"

    return headline


def _build_deterministic_rationale(
    *,
    recommendation: RecommendationResponse,
) -> str:
    validate_recommendation_for_narration(recommendation)
    evidence = recommendation.evidence_summary_structured
    sentences: list[str] = []

    root_zone_depletion = _get_evidence_float(evidence, "root_zone_depletion")
    raw_threshold = _get_evidence_float(evidence, "raw_threshold")
    if root_zone_depletion is not None and raw_threshold is not None:
        sentences.append(
            "Current root-zone depletion is "
            f"{_format_mm(root_zone_depletion)} against a RAW threshold of "
            f"{_format_mm(raw_threshold)}."
        )

    projected_depletion = _get_evidence_float(
        evidence,
        "chosen_projected_root_zone_depletion",
    )
    if projected_depletion is not None:
        sentences.append(
            "Under the chosen action, projected depletion is "
            f"{_format_mm(projected_depletion)} after the simulation horizon."
        )

    projected_raw_crossing = _get_evidence_bool(
        evidence,
        "chosen_projected_raw_crossing",
    )
    if projected_raw_crossing is False:
        sentences.append(
            "The selected action is projected to avoid crossing the RAW threshold."
        )
    elif projected_raw_crossing is True:
        sentences.append(
            "The selected action still shows RAW crossing risk during the horizon, "
            "so monitor the crop closely."
        )

    stress_band = _get_evidence_str(evidence, "stress_band")
    if stress_band is not None:
        sentences.append(f"Current stress band is {stress_band}.")

    moisture_state = _get_evidence_str(evidence, "estimated_moisture_state")
    if moisture_state is not None:
        sentences.append(f"Estimated moisture state is {moisture_state}.")

    if (
        recommendation.inspection_advisory
        or CautionReason.HIGH_UNCERTAINTY in recommendation.caution_reasons
    ):
        predicted_label = _get_evidence_str(evidence, "predicted_label")
        disease_category = _get_evidence_str(evidence, "disease_category")
        if predicted_label or disease_category:
            sentences.append(
                "Disease evidence is uncertain and should be checked by inspection."
            )
    elif CautionReason.FUNGAL_DISEASE_RISK in recommendation.caution_reasons:
        sentences.append("Fungal disease risk is included in the recommendation.")

    if not sentences:
        return (
            "This narration follows the deterministic recommendation for the current "
            "twin state."
        )

    return " ".join(sentences[:5])


def build_narration_prompt(
    *,
    recommendation: RecommendationResponse,
) -> str:
    """Build a strict prompt for a future farmer-facing narration client."""
    validate_recommendation_for_narration(recommendation)
    caution_reason_values = [
        caution_reason.value for caution_reason in recommendation.caution_reasons
    ]
    evidence_json = json.dumps(
        recommendation.evidence_summary_structured,
        sort_keys=True,
        default=str,
    )

    return "\n".join(
        [
            "Write short farmer-readable rationale text for this fixed irrigation "
            "recommendation.",
            f"fixed chosen_action: {recommendation.chosen_action.value}",
            (
                "fixed irrigation_constraint: "
                f"{recommendation.irrigation_constraint.value}"
            ),
            f"fixed inspection_advisory: {recommendation.inspection_advisory}",
            f"fixed caution_reasons: {caution_reason_values}",
            f"fixed decision_reason_codes: {recommendation.decision_reason_codes}",
            f"structured evidence summary: {evidence_json}",
            "Rules:",
            "Do not change the chosen action.",
            "Do not recompute water balance.",
            "Do not recompute disease prediction.",
            "Do not add new caution reasons.",
            "Do not contradict irrigation_constraint.",
            "Do not contradict inspection_advisory.",
            "Do not contradict caution_reasons.",
            "Do not provide pesticide/treatment advice.",
            "Return only farmer-readable rationale text.",
            "Do not return JSON.",
            "Do not return markdown fences.",
            "Do not return a headline.",
            "Do not return a caution.",
            "Keep narration short.",
            "Use uncertain language when inspection_advisory is True.",
            "Do not treat high-uncertainty disease evidence as confirmed disease.",
        ]
    )


def _sanitize_llm_text(text: str) -> str:
    if not isinstance(text, str):
        raise ValueError("text must be a string.")
    if _llm_text_looks_like_structured_output(text):
        raise ValueError("LLM text must not be structured output.")

    sanitized = " ".join(text.strip().split())
    if not sanitized:
        raise ValueError("LLM text must be non-empty.")

    if len(sanitized) > MAX_LLM_RATIONALE_CHARS:
        sanitized = sanitized[:MAX_LLM_RATIONALE_CHARS].strip()

    if not sanitized:
        raise ValueError("LLM text must be non-empty after truncation.")

    return sanitized


def _llm_text_contradicts_action(
    *,
    text: str,
    chosen_action: ActionEnum,
) -> bool:
    if not isinstance(text, str):
        raise ValueError("text must be a string.")
    if not isinstance(chosen_action, ActionEnum):
        raise ValueError("chosen_action must be an ActionEnum.")

    text_lower = text.lower()
    if chosen_action is ActionEnum.NO_IRRIGATION_24H:
        return _contains_positive_irrigation_instruction(text_lower=text_lower)

    return _contains_any_phrase(
        text_lower=text_lower,
        phrases=NO_IRRIGATION_PHRASES,
    )


def _llm_text_contradicts_constraint_or_caution(
    *,
    text: str,
    recommendation: RecommendationResponse,
) -> bool:
    validate_recommendation_for_narration(recommendation)
    if not isinstance(text, str):
        raise ValueError("text must be a string.")

    text_lower = text.lower()

    if (
        recommendation.irrigation_constraint
        is IrrigationConstraint.AVOID_OVERHEAD_IRRIGATION
        and _contains_any_phrase(
            text_lower=text_lower,
            phrases=OVERHEAD_OK_PHRASES,
        )
    ):
        return True

    if (
        recommendation.irrigation_constraint
        is IrrigationConstraint.PREFER_EARLY_MORNING_WINDOW
        and _contains_any_phrase(
            text_lower=text_lower,
            phrases=EARLY_MORNING_CONTRADICTION_PHRASES,
        )
    ):
        return True

    if recommendation.inspection_advisory and _contains_any_phrase(
        text_lower=text_lower,
        phrases=NO_INSPECTION_PHRASES,
    ):
        return True

    if (
        CautionReason.HIGH_UNCERTAINTY in recommendation.caution_reasons
        and _contains_any_phrase(
            text_lower=text_lower,
            phrases=CERTAINTY_CONTRADICTION_PHRASES,
        )
    ):
        return True

    if (
        CautionReason.FUNGAL_DISEASE_RISK in recommendation.caution_reasons
        and _contains_any_phrase(
            text_lower=text_lower,
            phrases=NO_DISEASE_RISK_PHRASES,
        )
    ):
        return True

    return False


def generate_narration(
    *,
    recommendation: RecommendationResponse,
    client: NarrationClient | None = None,
) -> NarrationResponse:
    """Generate safe farmer-facing narration from a fixed recommendation."""
    validate_recommendation_for_narration(recommendation)

    headline = _build_deterministic_headline(recommendation=recommendation)
    caution = _caution_text(recommendation=recommendation)
    deterministic_rationale = _build_deterministic_rationale(
        recommendation=recommendation,
    )
    rationale = deterministic_rationale

    if client is not None:
        try:
            prompt = build_narration_prompt(recommendation=recommendation)
            llm_text = client.generate(prompt=prompt)
            sanitized_text = _sanitize_llm_text(llm_text)
            if not _llm_text_contradicts_action(
                text=sanitized_text,
                chosen_action=recommendation.chosen_action,
            ) and not _llm_text_contradicts_constraint_or_caution(
                text=sanitized_text,
                recommendation=recommendation,
            ):
                rationale = sanitized_text
        except Exception:
            rationale = deterministic_rationale

    return NarrationResponse(
        state_id=recommendation.state_id,
        headline=headline,
        rationale=rationale,
        caution=caution,
    )

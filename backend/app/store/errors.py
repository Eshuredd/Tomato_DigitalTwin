from __future__ import annotations

from datetime import date, datetime

from app.schemas import ObservationTimeBasis


class StateNotFoundError(Exception):
    def __init__(self, state_id: str) -> None:
        super().__init__(f"State '{state_id}' not found.")


class IncompleteStateError(Exception):
    def __init__(self, missing: list[str]) -> None:
        missing_list = ", ".join(missing)
        super().__init__(f"Cannot update current state; missing cached outputs: {missing_list}.")
        self.missing = missing


class MissingCachedOutputError(Exception):
    def __init__(self, state_id: str, output_name: str) -> None:
        super().__init__(f"State '{state_id}' is missing cached output: {output_name}.")
        self.state_id = state_id
        self.output_name = output_name


class DuplicateIrrigationEventApplicationError(Exception):
    def __init__(self, irrigation_event_id: str) -> None:
        super().__init__(
            f"Irrigation event '{irrigation_event_id}' has already been applied."
        )
        self.irrigation_event_id = irrigation_event_id


class WaterUpdatePayloadConflictError(Exception):
    def __init__(
        self,
        state_id: str,
        water_update_id: str,
        *,
        existing_fingerprint: str,
        request_fingerprint: str,
    ) -> None:
        super().__init__(
            f"Water update '{water_update_id}' for state '{state_id}' already "
            "exists with different calculation inputs."
        )
        self.state_id = state_id
        self.water_update_id = water_update_id
        self.existing_fingerprint_prefix = existing_fingerprint[:12]
        self.request_fingerprint_prefix = request_fingerprint[:12]


class WaterUpdateConcurrencyConflictError(Exception):
    def __init__(self, state_id: str, irrigation_event_id: str) -> None:
        super().__init__(
            "Another water update applied the reported irrigation event first; "
            "retry the water calculation."
        )
        self.state_id = state_id
        self.irrigation_event_id = irrigation_event_id


class StaleWaterBaselineError(Exception):
    def __init__(
        self,
        state_id: str,
        *,
        supplied_base_water_observation_id: str | None,
        supplied_base_water_sequence: int,
        current_base_water_observation_id: str | None,
        current_base_water_sequence: int,
    ) -> None:
        super().__init__(
            "The submitted water baseline is no longer the canonical latest "
            "water state; refresh and recalculate."
        )
        self.state_id = state_id
        self.supplied_base_water_observation_id = supplied_base_water_observation_id
        self.supplied_base_water_sequence = supplied_base_water_sequence
        self.current_base_water_observation_id = current_base_water_observation_id
        self.current_base_water_sequence = current_base_water_sequence


class WaterBaselineMismatchError(Exception):
    def __init__(self, message: str, **details: object) -> None:
        super().__init__(message)
        self.details = details


class OutOfOrderWaterObservationError(Exception):
    def __init__(
        self,
        state_id: str,
        *,
        supplied_observed_at: datetime,
        current_observed_at: datetime,
    ) -> None:
        super().__init__(
            "Water observations must be submitted after the canonical latest "
            "water observation."
        )
        self.state_id = state_id
        self.supplied_observed_at = supplied_observed_at
        self.current_observed_at = current_observed_at


class WaterObservationTimeConflictError(Exception):
    def __init__(
        self,
        state_id: str,
        *,
        supplied_observed_at: datetime,
        current_observed_at: datetime,
        observation_time_basis: ObservationTimeBasis,
    ) -> None:
        message = "A different water observation already exists at this observed_at."
        if observation_time_basis is ObservationTimeBasis.DATE_ONLY_UTC_START:
            message = (
                "A date-only water observation already exists for this date; "
                "supply an explicit timezone-aware observed_at for multiple "
                "updates on one date."
            )
        super().__init__(message)
        self.state_id = state_id
        self.supplied_observed_at = supplied_observed_at
        self.current_observed_at = current_observed_at


class WaterStateConcurrencyConflictError(Exception):
    def __init__(self, state_id: str) -> None:
        super().__init__(
            "Another water update advanced the canonical baseline first; retry "
            "the water calculation."
        )
        self.state_id = state_id


class DailyAdvancementBaselineRequiredError(Exception):
    def __init__(self, state_id: str) -> None:
        super().__init__(
            "Initial water state must be computed before advancing one day."
        )
        self.state_id = state_id


class DailyAdvancementDiseaseRequiredError(Exception):
    def __init__(self, state_id: str) -> None:
        super().__init__(
            "Disease evidence is required before advancing one day."
        )
        self.state_id = state_id


class DailyAdvancementDateConflictError(Exception):
    def __init__(
        self,
        state_id: str,
        *,
        requested_target_date: date,
        expected_target_date: date,
        canonical_base_date: date,
        base_water_observation_id: str,
        base_water_sequence: int,
    ) -> None:
        super().__init__(
            "Daily advancement target_date must be exactly one calendar day "
            "after the canonical water baseline."
        )
        self.state_id = state_id
        self.requested_target_date = requested_target_date
        self.expected_target_date = expected_target_date
        self.canonical_base_date = canonical_base_date
        self.base_water_observation_id = base_water_observation_id
        self.base_water_sequence = base_water_sequence


class DailyAdvancementPayloadConflictError(Exception):
    def __init__(
        self,
        state_id: str,
        advancement_id: str,
        *,
        existing_fingerprint: str,
        request_fingerprint: str,
    ) -> None:
        super().__init__(
            f"Daily advancement '{advancement_id}' for state '{state_id}' "
            "already exists with different inputs."
        )
        self.state_id = state_id
        self.advancement_id = advancement_id
        self.existing_fingerprint_prefix = existing_fingerprint[:12]
        self.request_fingerprint_prefix = request_fingerprint[:12]


class DailyAdvancementTargetConflictError(Exception):
    def __init__(
        self,
        state_id: str,
        *,
        target_date: date,
        existing_advancement_id: str,
    ) -> None:
        super().__init__(
            f"Daily advancement target date '{target_date.isoformat()}' for "
            f"state '{state_id}' has already been completed."
        )
        self.state_id = state_id
        self.target_date = target_date
        self.existing_advancement_id = existing_advancement_id


class IrrigationEventStateMismatchError(Exception):
    def __init__(
        self,
        irrigation_event_id: str,
        *,
        expected_state_id: str,
        actual_state_id: str,
    ) -> None:
        super().__init__(
            f"Irrigation event '{irrigation_event_id}' belongs to state "
            f"'{actual_state_id}', not '{expected_state_id}'."
        )
        self.irrigation_event_id = irrigation_event_id
        self.expected_state_id = expected_state_id
        self.actual_state_id = actual_state_id


class IrrigationEventPayloadConflictError(Exception):
    def __init__(self, irrigation_event_id: str, *, field: str) -> None:
        super().__init__(
            f"Irrigation event '{irrigation_event_id}' conflicts on {field}."
        )
        self.irrigation_event_id = irrigation_event_id
        self.field = field


class RelatedRecommendationNotFoundError(Exception):
    def __init__(self, recommendation_id: str) -> None:
        super().__init__(f"Recommendation '{recommendation_id}' was not found.")
        self.recommendation_id = recommendation_id


class RecommendationStateMismatchError(Exception):
    def __init__(
        self,
        recommendation_id: str,
        *,
        expected_state_id: str,
        actual_state_id: str,
    ) -> None:
        super().__init__(
            f"Recommendation '{recommendation_id}' belongs to state "
            f"'{actual_state_id}', not '{expected_state_id}'."
        )
        self.recommendation_id = recommendation_id
        self.expected_state_id = expected_state_id
        self.actual_state_id = actual_state_id


class DuplicateActualActionError(Exception):
    def __init__(self, actual_action_id: str) -> None:
        super().__init__(f"Actual action '{actual_action_id}' already exists.")
        self.actual_action_id = actual_action_id


class PersistenceIntegrityError(Exception):
    def __init__(self, message: str = "Persistence integrity check failed.") -> None:
        super().__init__(message)



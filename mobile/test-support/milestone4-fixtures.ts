import type { AdvanceOneDayResponse, UpdateTwinStateResponse, WaterStateResponse } from '@/lib/api';

export const waterState: WaterStateResponse = {
  state_id: 'state-a', water_observation_id: 'water-1', water_sequence: 1, base_water_observation_id: null, base_water_sequence: 0,
  previous_root_zone_depletion_mm: 0, water_update_id: 'water-update-1', reported_irrigation_event_id: null, applied_irrigation_event_id: null,
  effective_irrigation_mm: 0, irrigation_event_already_accounted_for: false, crop_type: 'tomato', growth_stage: 'development', soil_texture: 'loam',
  eto_computed: 4.2, eto_method: 'penman_monteith', eto_reference_feed: 4.1, eto_delta_pct: 2.4, kc: 0.8, etc: 3.36,
  field_capacity_assumed: 0.25, wilting_point_assumed: 0.12, root_depth_assumed: 0.4, taw: 52, p_allowable: 0.5, raw_threshold: 26,
  raw_root_zone_depletion_mm: 10, root_zone_depletion_mm: 10, root_zone_depletion: 10, water_surplus_mm: 0, depletion_beyond_taw_mm: 0,
  estimated_moisture_state: 'adequate', stress_band: 'low', observed_at: '2026-08-18T00:00:00Z', computed_at: '2026-08-18T10:00:00Z', observation_time_basis: 'DATE_ONLY_UTC_START',
};

export const twinState: UpdateTwinStateResponse = {
  state_id: 'state-a', state_history_count: 1, snapshot_id: 'snapshot-1', snapshot_created: true,
  current_state: { crop_type: 'tomato', growth_stage: 'development', days_since_planting: 20, predicted_label: 'healthy', disease_category: 'none', confidence_calibrated: 0.9, uncertainty_score: 0.1, uncertainty_band: 'low', eto_computed: 4.2, eto_method: 'penman_monteith', kc: 0.8, etc: 3.36, taw: 52, raw_threshold: 26, raw_root_zone_depletion_mm: 10, root_zone_depletion_mm: 10, root_zone_depletion: 10, water_surplus_mm: 0, depletion_beyond_taw_mm: 0, estimated_moisture_state: 'adequate', stress_band: 'low', observed_at: '2026-08-18T00:00:00Z', computed_at: '2026-08-18T10:00:00Z', observation_time_basis: 'DATE_ONLY_UTC_START', last_update_time: '2026-08-18T10:01:00Z' },
};

export const advancement: AdvanceOneDayResponse = { state_id: 'state-a', advancement_id: 'advance-1', target_date: '2026-08-19', advancement_created: true, water_state: { ...waterState, water_observation_id: 'water-2', water_sequence: 2, base_water_observation_id: 'water-1', base_water_sequence: 1, water_update_id: 'daily-water-1', observed_at: '2026-08-19T00:00:00Z' }, twin_state: { ...twinState, snapshot_id: 'snapshot-2', state_history_count: 2, current_state: { ...twinState.current_state, observed_at: '2026-08-19T00:00:00Z' } } };

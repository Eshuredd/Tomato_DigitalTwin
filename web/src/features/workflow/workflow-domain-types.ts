export type AdvancementTransitionKind =
  | "new_advancement"
  | "catch_up_retry"
  | "current_retry"
  | "historical_retry"
  | "malformed_retry";

export type TwinRefreshStatus = "not_needed" | "succeeded" | "failed";

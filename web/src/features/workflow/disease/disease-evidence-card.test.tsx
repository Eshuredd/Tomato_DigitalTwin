import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiseaseEvidenceCard } from "./disease-evidence-card";

const base = { state_id: "state-1", crop_type: "tomato" as const, predicted_label: "Tomato___Late_blight", disease_category: "fungal" as const, class_probs: { late_blight: 0.8, healthy: 0.2 }, confidence_calibrated: 0.8, uncertainty_score: 0.2, uncertainty_band: "low" as const, predicted_at: "2026-08-04T04:00:00Z" };

describe("DiseaseEvidenceCard", () => {
  it.each(["low", "medium", "high"] as const)("always shows safety wording for %s uncertainty", (uncertainty_band) => { render(<DiseaseEvidenceCard evidence={{ ...base, uncertainty_band }} modelVersion="1.0" />); expect(screen.getByText(/Supporting AI evidence — not a confirmed diagnosis/i)).toBeVisible(); expect(screen.queryByText(/pesticide|fertiliser|treatment instructions/i)).not.toBeInTheDocument(); });
  it("adds manual-inspection guidance for medium uncertainty", () => { render(<DiseaseEvidenceCard evidence={{ ...base, uncertainty_band: "medium" }} modelVersion="1.0" />); expect(screen.getByText(/Manual inspection remains useful/i)).toBeVisible(); });
  it("adds another-image or manual-inspection guidance for high uncertainty", () => { render(<DiseaseEvidenceCard evidence={{ ...base, uncertainty_band: "high" }} modelVersion="1.0" />); expect(screen.getByText(/Capture another clear leaf image or inspect/i)).toBeVisible(); });
});

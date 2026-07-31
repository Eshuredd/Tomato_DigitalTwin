import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CropTwinApiError } from "@/lib/api/errors";
import type { DiseasePredictionResponse, SessionResponse, SystemInfoResponse } from "@/lib/types/api";
import { WorkflowProvider, useWorkflowDispatch } from "@/features/workflow/workflow-context";
import type { WorkflowState } from "@/features/workflow/workflow-types";
import { DiseasePanel, type DiseasePanelEndpoints } from "./disease-panel";

const sessionA: SessionResponse = {
  state_id: "state-a",
  crop_type: "tomato",
  planting_date: "2026-07-01",
  location: { name: "Farm A", latitude: 17, longitude: 78, elevation_m: 500 },
  soil_texture: "sandy_loam",
  created_at: "2026-07-31T00:00:00Z",
};

const sessionB: SessionResponse = {
  ...sessionA,
  state_id: "state-b",
  location: { ...sessionA.location, name: "Farm B" },
};

const diseaseResponse: DiseasePredictionResponse = {
  state_id: "state-a",
  crop_type: "tomato",
  predicted_label: "Tomato___Late_blight",
  disease_category: "fungal",
  class_probs: {
    Tomato___Late_blight: 0.91,
    Tomato___healthy: 0.04,
    Tomato___Early_blight: 0.03,
  },
  confidence_calibrated: 0.91,
  uncertainty_score: 0.09,
  uncertainty_band: "low",
  predicted_at: "2026-07-31T00:00:00Z",
};

const systemInfo = {
  crop_type: "tomato",
  disease_model: {
    model_name: "croptwin_tomato_mobilenet_v3_small",
    model_version: "1.0",
    dataset: "PlantVillage tomato subset",
    calibration_method: "temperature_scaling",
    uncertainty_method: "confidence_threshold",
    classes: [],
    ece_validation_score: 0.01,
    basis: "runtime metadata",
  },
} as unknown as SystemInfoResponse;

function activeState(session: SessionResponse = sessionA): WorkflowState {
  return {
    ...inactiveState(),
    activeStateId: session.state_id,
    session,
  };
}

function inactiveState(): WorkflowState {
  return {
    activeStateId: null,
    session: null,
    systemInfo: null,
    disease: null,
    weatherSnapshot: null,
    weatherDraft: null,
    water: null,
    latestWaterObservationId: null,
    latestWaterSequence: 0,
  };
}

function fakeEndpoints(overrides: Partial<DiseasePanelEndpoints> = {}) {
  return {
    getSystemInfo: vi.fn().mockResolvedValue(systemInfo),
    predictDisease: vi.fn().mockResolvedValue(diseaseResponse),
    simulateActions: vi.fn(),
    recommend: vi.fn(),
    ...overrides,
  };
}

function renderDiseasePanel(
  endpoints = fakeEndpoints(),
  initialState = activeState(),
) {
  return {
    endpoints,
    ...render(
      <WorkflowProvider initialState={initialState}>
        <DiseasePanel endpoints={endpoints} />
      </WorkflowProvider>,
    ),
  };
}

function imageFile(name = "leaf.jpg", type = "image/jpeg") {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

function deferredDisease() {
  let resolve!: (response: DiseasePredictionResponse) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<DiseasePredictionResponse>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, reject, resolve };
}

describe("DiseasePanel", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((file: File) => `blob:${file.name}`),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("disables image submission without an active session", () => {
    renderDiseasePanel(fakeEndpoints(), inactiveState());

    expect(screen.getByText(/Create or load an active session/)).toBeInTheDocument();
    expect(screen.getByLabelText("Tomato leaf image")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit disease evidence" })).toBeDisabled();
  });

  it("selecting a valid file shows metadata and a preview", async () => {
    const user = userEvent.setup();
    renderDiseasePanel();

    await user.upload(screen.getByLabelText("Tomato leaf image"), imageFile());

    expect(screen.getByText("leaf.jpg")).toBeInTheDocument();
    expect(screen.getByText("3 B")).toBeInTheDocument();
    expect(await screen.findByAltText("Preview of leaf.jpg")).toBeInTheDocument();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("replacing and unmounting image previews revokes object URLs", async () => {
    const user = userEvent.setup();
    const view = renderDiseasePanel();
    const input = screen.getByLabelText("Tomato leaf image");

    await user.upload(input, imageFile("one.jpg"));
    await screen.findByAltText("Preview of one.jpg");
    await user.upload(input, imageFile("two.png", "image/png"));
    await screen.findByAltText("Preview of two.png");

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:one.jpg");
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:two.png");
  });

  it("valid replacement clears stale validation errors", async () => {
    const user = userEvent.setup();
    renderDiseasePanel();
    const input = screen.getByLabelText("Tomato leaf image");

    await user.upload(input, imageFile("leaf.gif", "image/gif"));
    expect(screen.getByText(/JPEG, PNG, or WebP/)).toBeInTheDocument();
    await user.upload(input, imageFile("leaf.webp", "image/webp"));

    expect(screen.queryByText("Use a JPEG, PNG, or WebP image.")).not.toBeInTheDocument();
    expect(screen.getByText("leaf.webp")).toBeInTheDocument();
  });

  it("prevents duplicate submission while pending", async () => {
    const deferred = deferredDisease();
    const endpoints = fakeEndpoints({ predictDisease: vi.fn().mockReturnValue(deferred.promise) });
    const user = userEvent.setup();
    renderDiseasePanel(endpoints);

    await user.upload(screen.getByLabelText("Tomato leaf image"), imageFile());
    await user.click(screen.getByRole("button", { name: "Submit disease evidence" }));

    expect(screen.getByRole("button", { name: "Submitting disease evidence" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Submitting disease evidence" }));
    expect(endpoints.predictDisease).toHaveBeenCalledTimes(1);

    deferred.resolve(diseaseResponse);
    expect(await screen.findByRole("heading", { name: "Late blight" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit disease evidence" })).toBeEnabled());
  });

  it("renders successful disease evidence fields and probabilities", async () => {
    const endpoints = fakeEndpoints();
    const user = userEvent.setup();
    renderDiseasePanel(endpoints);

    await user.upload(screen.getByLabelText("Tomato leaf image"), imageFile());
    await user.click(screen.getByRole("button", { name: "Submit disease evidence" }));

    expect(await screen.findByRole("heading", { name: "Late blight" })).toBeInTheDocument();
    expect(screen.getByText("fungal")).toBeInTheDocument();
    expect(screen.getAllByText("91.0%").length).toBeGreaterThan(0);
    expect(screen.getByText(/9.0%/)).toBeInTheDocument();
    expect(screen.getByText("croptwin_tomato_mobilenet_v3_small")).toBeInTheDocument();
    expect(screen.getAllByText("1.0").length).toBeGreaterThan(0);
    expect(screen.getByRole("progressbar", { name: /Late blight: 91.0%/ })).toBeInTheDocument();
    expect(endpoints.simulateActions).not.toHaveBeenCalled();
    expect(endpoints.recommend).not.toHaveBeenCalled();
  });

  it("uses system-info model version when available", async () => {
    const endpoints = fakeEndpoints({
      getSystemInfo: vi.fn().mockResolvedValue({
        ...systemInfo,
        disease_model: {
          ...systemInfo.disease_model,
          model_version: "2.3.4",
        },
      }),
    });
    const user = userEvent.setup();
    renderDiseasePanel(endpoints);

    await waitFor(() => expect(endpoints.getSystemInfo).toHaveBeenCalled());
    await user.upload(screen.getByLabelText("Tomato leaf image"), imageFile());
    await user.click(screen.getByRole("button", { name: "Submit disease evidence" }));

    expect(endpoints.predictDisease).toHaveBeenCalledWith(
      "state-a",
      expect.objectContaining({ model_version: "2.3.4" }),
      expect.anything(),
    );
  });

  it("falls back when system info is malformed or unavailable", async () => {
    const endpoints = fakeEndpoints({
      getSystemInfo: vi.fn().mockRejectedValue(new Error("malformed")),
    });
    const user = userEvent.setup();
    renderDiseasePanel(endpoints);

    await user.upload(screen.getByLabelText("Tomato leaf image"), imageFile());
    await user.click(screen.getByRole("button", { name: "Submit disease evidence" }));

    expect(endpoints.predictDisease).toHaveBeenCalledWith(
      "state-a",
      expect.objectContaining({ model_version: "1.0" }),
      expect.anything(),
    );
  });

  it("rejects disease responses for a different state", async () => {
    const endpoints = fakeEndpoints({
      predictDisease: vi.fn().mockResolvedValue({
        ...diseaseResponse,
        state_id: "state-b",
      }),
    });
    const user = userEvent.setup();
    renderDiseasePanel(endpoints);

    await user.upload(screen.getByLabelText("Tomato leaf image"), imageFile());
    await user.click(screen.getByRole("button", { name: "Submit disease evidence" }));

    expect(await screen.findByText("The backend returned disease evidence for a different session.")).toBeInTheDocument();
    expect(screen.queryByText("Late blight")).not.toBeInTheDocument();
  });

  it("keeps high uncertainty and unknown evidence visible", async () => {
    const highUnknown = {
      ...diseaseResponse,
      predicted_label: "UNKNOWN",
      class_probs: {},
      confidence_calibrated: 0.4,
      uncertainty_score: 0.6,
      uncertainty_band: "high",
    } satisfies DiseasePredictionResponse;
    const endpoints = fakeEndpoints({ predictDisease: vi.fn().mockResolvedValue(highUnknown) });
    const user = userEvent.setup();
    renderDiseasePanel(endpoints);

    await user.upload(screen.getByLabelText("Tomato leaf image"), imageFile());
    await user.click(screen.getByRole("button", { name: "Submit disease evidence" }));

    expect(await screen.findByText("Unknown evidence")).toBeInTheDocument();
    expect(screen.getByText(/did not have enough reliable evidence/)).toBeInTheDocument();
    expect(screen.getByText(/High uncertainty requires visual inspection/)).toBeInTheDocument();
    expect(screen.queryByText(/^healthy$/i)).not.toBeInTheDocument();
    expect(screen.getByText("No class-probability map was returned.")).toBeInTheDocument();
  });

  it("renders structured backend errors safely and keeps the file selected", async () => {
    const endpoints = fakeEndpoints({
      predictDisease: vi.fn().mockRejectedValue(new CropTwinApiError({
        kind: "api",
        status: 422,
        code: "INVALID_DISEASE_IMAGE",
        message: "Invalid tomato-leaf image.",
        details: { image_base64: "secret-image-bytes" },
      })),
    });
    const user = userEvent.setup();
    renderDiseasePanel(endpoints);

    await user.upload(screen.getByLabelText("Tomato leaf image"), imageFile());
    await user.click(screen.getByRole("button", { name: "Submit disease evidence" }));

    expect(await screen.findByText("Invalid tomato-leaf image.")).toBeInTheDocument();
    expect(screen.getByText(/INVALID_DISEASE_IMAGE/)).toBeInTheDocument();
    expect(screen.getByText("leaf.jpg")).toBeInTheDocument();
    expect(screen.queryByText("secret-image-bytes")).not.toBeInTheDocument();
    expect(screen.getByText(/\[redacted\]/)).toBeInTheDocument();
  });

  it("allows retry after timeout", async () => {
    const endpoints = fakeEndpoints({
      predictDisease: vi.fn()
        .mockRejectedValueOnce(new CropTwinApiError({
          kind: "timeout",
          status: null,
          code: "FRONTEND_REQUEST_TIMEOUT",
          message: "The CropTwin API request timed out.",
        }))
        .mockResolvedValueOnce(diseaseResponse),
    });
    const user = userEvent.setup();
    renderDiseasePanel(endpoints);

    await user.upload(screen.getByLabelText("Tomato leaf image"), imageFile());
    await user.click(screen.getByRole("button", { name: "Submit disease evidence" }));
    expect(await screen.findByText("The CropTwin API request timed out.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Submit disease evidence" }));

    expect(await screen.findByRole("heading", { name: "Late blight" })).toBeInTheDocument();
    expect(endpoints.predictDisease).toHaveBeenCalledTimes(2);
  });

  it("ignores late responses for a previous active state", async () => {
    const deferred = deferredDisease();
    const endpoints = fakeEndpoints({ predictDisease: vi.fn().mockReturnValue(deferred.promise) });
    const user = userEvent.setup();

    function Harness() {
      const dispatch = useWorkflowDispatch();
      return (
        <>
          <button type="button" onClick={() => dispatch({ type: "sessionCreated", session: sessionB })}>
            Switch session
          </button>
          <DiseasePanel endpoints={endpoints} />
        </>
      );
    }

    render(
      <WorkflowProvider initialState={activeState()}>
        <Harness />
      </WorkflowProvider>,
    );

    await user.upload(screen.getByLabelText("Tomato leaf image"), imageFile());
    await user.click(screen.getByRole("button", { name: "Submit disease evidence" }));
    await user.click(screen.getByRole("button", { name: "Switch session" }));
    deferred.resolve(diseaseResponse);

    await waitFor(() => expect(screen.queryByText("Late blight")).not.toBeInTheDocument());
  });

  it("clears selected files, previews and API errors on active session change", async () => {
    const endpoints = fakeEndpoints({
      predictDisease: vi.fn().mockRejectedValue(new CropTwinApiError({
        kind: "api",
        status: 422,
        code: "INVALID_DISEASE_IMAGE",
        message: "Invalid tomato-leaf image.",
        details: {},
      })),
    });
    const user = userEvent.setup();

    function Harness() {
      const dispatch = useWorkflowDispatch();
      return (
        <>
          <button type="button" onClick={() => dispatch({ type: "sessionCreated", session: sessionB })}>
            Switch session
          </button>
          <DiseasePanel endpoints={endpoints} />
        </>
      );
    }

    render(
      <WorkflowProvider initialState={activeState()}>
        <Harness />
      </WorkflowProvider>,
    );

    const input = screen.getByLabelText("Tomato leaf image") as HTMLInputElement;
    await user.upload(input, imageFile());
    await user.click(screen.getByRole("button", { name: "Submit disease evidence" }));
    expect(await screen.findByText("Invalid tomato-leaf image.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Switch session" }));

    await waitFor(() => expect(screen.queryByText("Invalid tomato-leaf image.")).not.toBeInTheDocument());
    expect(screen.queryByText("leaf.jpg")).not.toBeInTheDocument();
    expect(input.value).toBe("");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:leaf.jpg");
  });

  it("resets the native input when removing an image so the same file can be selected again", async () => {
    const user = userEvent.setup();
    renderDiseasePanel();
    const input = screen.getByLabelText("Tomato leaf image") as HTMLInputElement;
    const file = imageFile();

    await user.upload(input, file);
    expect(screen.getByText("leaf.jpg")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove image" }));
    expect(input.value).toBe("");
    await user.upload(input, file);

    expect(screen.getByText("leaf.jpg")).toBeInTheDocument();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
  });
});

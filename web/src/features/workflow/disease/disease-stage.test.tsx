import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/api/query-keys";
import type { DiseasePrediction } from "@/lib/api/contracts";
import type { CachedDiseaseEvidence } from "@/lib/api/hooks/use-workflow";
import { diseaseFileSignature } from "./disease-files";
import { DiseaseStage } from "./disease-stage";

const { mutateAsync, reset } = vi.hoisted(() => ({ mutateAsync: vi.fn(), reset: vi.fn() }));
vi.mock("@/lib/api/hooks/use-system-info", () => ({ useSystemInfo: () => ({ isLoading: false, isError: false, data: { disease_model: { model_version: "model-from-system" } } }) }));
vi.mock("@/lib/api/hooks/use-workflow", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api/hooks/use-workflow")>()), usePredictDisease: () => ({ mutateAsync, reset, isPending: false, error: null }) }));

const response: DiseasePrediction = { state_id: "state-1", crop_type: "tomato", predicted_label: "healthy", disease_category: "none", class_probs: { healthy: 1 }, confidence_calibrated: 1, uncertainty_score: 0, uncertainty_band: "low", predicted_at: "2026-08-04T04:00:00Z" };

describe("DiseaseStage request identity", () => {
  let client: QueryClient;
  beforeEach(() => { vi.clearAllMocks(); client = new QueryClient({ defaultOptions: { mutations: { retry: false } } }); });
  function renderStage(onAccepted = vi.fn(), accepted?: CachedDiseaseEvidence, onSuperseded = vi.fn()) { return { onAccepted, onSuperseded, ...render(<QueryClientProvider client={client}><DiseaseStage stateId="state-1" accepted={accepted} onAccepted={onAccepted} onSuperseded={onSuperseded} /></QueryClientProvider>) }; }

  it("uses the system model version and matching path/body state IDs", async () => {
    mutateAsync.mockResolvedValue(response);
    renderStage();
    fireEvent.change(screen.getByLabelText(/Choose one tomato leaf image/i), { target: { files: [new File(["abc"], "leaf.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Run disease prediction" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ stateId: "state-1", input: { state_id: "state-1", model_version: "model-from-system" } });
    const cached = client.getQueryData(queryKeys.diseaseEvidence("state-1"));
    expect(cached).toMatchObject({ response, modelVersion: "model-from-system" });
    expect(JSON.stringify(cached)).not.toContain("image_base64");
  });

  it("ignores a late response after the selected file changes", async () => {
    let resolve!: (value: typeof response) => void;
    mutateAsync.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { onAccepted } = renderStage();
    const input = screen.getByLabelText(/Choose one tomato leaf image/i);
    fireEvent.change(input, { target: { files: [new File(["one"], "one.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Run disease prediction" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    fireEvent.change(input, { target: { files: [new File(["two"], "two.png", { type: "image/png" })] } });
    resolve(response);
    await Promise.resolve();
    expect(onAccepted).not.toHaveBeenCalled();
    expect(client.getQueryData(queryKeys.diseaseEvidence("state-1"))).toBeUndefined();
  });

  it("marks accepted evidence as superseded when a different file is selected", () => {
    renderStage(vi.fn(), { response, fileSignature: "old-signature", modelVersion: "model-from-system", evidenceAcceptanceId: "evidence-1" });
    fireEvent.change(screen.getByLabelText(/Choose one tomato leaf image/i), { target: { files: [new File(["new"], "new.png", { type: "image/png" })] } });
    expect(screen.getByText("Previous evidence superseded")).toBeVisible();
  });

  it("supersedes same-metadata evidence and requires an explicit second prediction", () => {
    const options = { type: "image/png", lastModified: 1234 };
    const first = new File(["one"], "same.png", options);
    const second = new File(["two"], "same.png", options);
    expect(diseaseFileSignature(first)).toBe(diseaseFileSignature(second));
    const accepted = { response, fileSignature: diseaseFileSignature(first), modelVersion: "model-from-system", evidenceAcceptanceId: "evidence-1" };
    client.setQueryData(queryKeys.diseaseEvidence("state-1"), accepted);
    const { onSuperseded } = renderStage(vi.fn(), accepted);
    fireEvent.change(screen.getByLabelText(/Choose one tomato leaf image/i), { target: { files: [second] } });
    expect(onSuperseded).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Previous evidence superseded")).toBeVisible();
    expect(screen.queryByText("Class probabilities")).not.toBeInTheDocument();
    expect(client.getQueryData(queryKeys.diseaseEvidence("state-1"))).toBeUndefined();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("ignores a late response after a same-metadata selection event", async () => {
    let resolve!: (value: typeof response) => void;
    mutateAsync.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { onAccepted } = renderStage();
    const input = screen.getByLabelText(/Choose one tomato leaf image/i);
    const options = { type: "image/png", lastModified: 1234 };
    fireEvent.change(input, { target: { files: [new File(["one"], "same.png", options)] } });
    fireEvent.click(screen.getByRole("button", { name: "Run disease prediction" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { files: [new File(["two"], "same.png", options)] } });
    resolve(response);
    await Promise.resolve();
    expect(onAccepted).not.toHaveBeenCalled();
    expect(client.getQueryData(queryKeys.diseaseEvidence("state-1"))).toBeUndefined();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("ignores an error from a superseded same-metadata request", async () => {
    let reject!: (reason: unknown) => void;
    mutateAsync.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    renderStage();
    const input = screen.getByLabelText(/Choose one tomato leaf image/i);
    const options = { type: "image/png", lastModified: 1234 };
    fireEvent.change(input, { target: { files: [new File(["one"], "same.png", options)] } });
    fireEvent.click(screen.getByRole("button", { name: "Run disease prediction" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { files: [new File(["two"], "same.png", options)] } });
    await act(async () => reject(new Error("old request failed")));
    expect(screen.queryByText("old request failed")).not.toBeInTheDocument();
  });

  it("supersedes accepted evidence when the image is removed", () => {
    const accepted = { response, fileSignature: "metadata", modelVersion: "model-from-system", evidenceAcceptanceId: "evidence-1" };
    const { onSuperseded } = renderStage(vi.fn(), accepted);
    fireEvent.change(screen.getByLabelText(/Choose one tomato leaf image/i), { target: { files: [new File(["one"], "one.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onSuperseded).toHaveBeenCalled();
    expect(screen.getByText("Previous evidence superseded")).toBeVisible();
  });

  it("supersedes accepted evidence for an invalid replacement", () => {
    const accepted = { response, fileSignature: "metadata", modelVersion: "model-from-system", evidenceAcceptanceId: "evidence-1" };
    const { onSuperseded } = renderStage(vi.fn(), accepted);
    fireEvent.change(screen.getByLabelText(/Choose one tomato leaf image/i), { target: { files: [new File(["bad"], "leaf.txt", { type: "text/plain" })] } });
    expect(onSuperseded).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Use a JPEG, PNG, or WebP image.")).toBeVisible();
    expect(screen.getByText("Previous evidence superseded")).toBeVisible();
  });

  it("ignores a late response after the route component is replaced", async () => {
    let resolve!: (value: typeof response) => void;
    mutateAsync.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { onAccepted, unmount } = renderStage();
    fireEvent.change(screen.getByLabelText(/Choose one tomato leaf image/i), { target: { files: [new File(["one"], "one.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByRole("button", { name: "Run disease prediction" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    unmount();
    resolve(response);
    await Promise.resolve();
    expect(onAccepted).not.toHaveBeenCalled();
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionPanel } from "./session-panel";
import { WorkflowProvider } from "@/features/workflow/workflow-context";
import { ActiveSessionSummary } from "@/features/workflow/active-session-summary";

const sessionResponse = {
  state_id: "state-1",
  crop_type: "tomato",
  planting_date: "2026-07-01",
  location: { name: "Hyderabad Farm", latitude: 17.3, longitude: 78.4, elevation_m: 500 },
  soil_texture: "sandy_loam",
  created_at: "2026-07-31T00:00:00Z",
};

const currentState = {
  crop_type: "tomato",
  growth_stage: "development",
  days_since_planting: 30,
  predicted_label: "Tomato___healthy",
  disease_category: "none",
  confidence_calibrated: 0.95,
  uncertainty_score: 0.05,
  uncertainty_band: "low",
  eto_computed: 4,
  eto_method: "penman_monteith",
  kc: 0.8,
  etc: 3.2,
  taw: 48,
  raw_threshold: 24,
  raw_root_zone_depletion_mm: 10,
  root_zone_depletion_mm: 10,
  root_zone_depletion: 10,
  water_surplus_mm: 0,
  depletion_beyond_taw_mm: 0,
  estimated_moisture_state: "adequate",
  stress_band: "low",
  observed_at: "2026-07-31T00:00:00Z",
  computed_at: "2026-07-31T01:00:00Z",
  observation_time_basis: "DATE_ONLY_UTC_START",
  last_update_time: "2026-07-31T01:00:00Z",
};

function installFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fetcher = vi.fn<typeof fetch>().mockImplementation((input, init) =>
    Promise.resolve(handler(String(input), init)),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

function renderSessionPanel() {
  return render(
    <WorkflowProvider>
      <SessionPanel />
    </WorkflowProvider>,
  );
}

function renderSessionWorkflow() {
  return render(
    <WorkflowProvider>
      <SessionPanel />
      <ActiveSessionSummary />
    </WorkflowProvider>,
  );
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("SessionPanel", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_CROPTWIN_API_BASE_URL = "http://api.test";
  });

  it("renders required session fields", () => {
    installFetch(() => new Response("{}"));

    renderSessionPanel();

    expect(screen.getByLabelText("Planting date")).toBeRequired();
    expect(screen.getByLabelText("Location name")).toBeRequired();
    expect(screen.getByLabelText("Latitude")).toBeRequired();
    expect(screen.getByLabelText("Longitude")).toBeRequired();
  });

  it("submits a session and displays the created state ID", async () => {
    const fetcher = installFetch((_url, init) => {
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        crop_type: "tomato",
        location: { name: "Hyderabad Farm" },
      });
      return new Response(JSON.stringify(sessionResponse));
    });
    const user = userEvent.setup();

    renderSessionPanel();
    await user.type(screen.getByLabelText("Planting date"), "2026-07-01");
    await user.type(screen.getByLabelText("Location name"), "Hyderabad Farm");
    await user.type(screen.getByLabelText("Latitude"), "17.3");
    await user.type(screen.getByLabelText("Longitude"), "78.4");
    await user.click(screen.getByRole("button", { name: "Create session" }));

    expect(await screen.findByText(/Created session/)).toBeInTheDocument();
    expect(screen.getByText("state-1")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("writes created sessions into the active-session summary and copies state IDs by user action", async () => {
    installFetch(() => new Response(JSON.stringify(sessionResponse)));
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      get: () => ({ writeText }),
    });

    renderSessionWorkflow();
    await user.type(screen.getByLabelText("Planting date"), "2026-07-01");
    await user.type(screen.getByLabelText("Location name"), "Hyderabad Farm");
    await user.type(screen.getByLabelText("Latitude"), "17.3");
    await user.type(screen.getByLabelText("Longitude"), "78.4");
    await user.click(screen.getByRole("button", { name: "Create session" }));

    expect(await screen.findByText("Hyderabad Farm")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Copy state ID" }));

    expect(writeText).toHaveBeenCalledWith("state-1");
    expect(await screen.findByText("State ID copied.")).toBeInTheDocument();
  });

  it("disables duplicate session submission while loading", async () => {
    const deferred = deferredResponse();
    const fetcher = vi.fn<typeof fetch>().mockReturnValue(deferred.promise);
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();

    renderSessionPanel();
    await user.type(screen.getByLabelText("Planting date"), "2026-07-01");
    await user.type(screen.getByLabelText("Location name"), "Hyderabad Farm");
    await user.type(screen.getByLabelText("Latitude"), "17.3");
    await user.type(screen.getByLabelText("Longitude"), "78.4");
    await user.click(screen.getByRole("button", { name: "Create session" }));

    expect(screen.getByRole("button", { name: "Creating" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Creating" }));
    expect(fetcher).toHaveBeenCalledTimes(1);

    deferred.resolve(new Response(JSON.stringify(sessionResponse)));

    expect(await screen.findByText(/Created session/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Create session" })).toBeEnabled());
  });

  it("renders backend validation errors", async () => {
    installFetch(() =>
      new Response(
        JSON.stringify({
          error: { code: "INVALID_LOCATION", message: "Invalid location.", details: { reason: "bad" } },
        }),
        { status: 422 },
      ),
    );
    const user = userEvent.setup();

    renderSessionPanel();
    await user.type(screen.getByLabelText("Planting date"), "2026-07-01");
    await user.type(screen.getByLabelText("Location name"), "Bad");
    await user.type(screen.getByLabelText("Latitude"), "17.3");
    await user.type(screen.getByLabelText("Longitude"), "78.4");
    await user.click(screen.getByRole("button", { name: "Create session" }));

    expect(await screen.findByText("Invalid location.")).toBeInTheDocument();
    expect(screen.getByText(/INVALID_LOCATION/)).toBeInTheDocument();
  });

  it("rejects empty load IDs locally", async () => {
    installFetch(() => new Response("{}"));
    const user = userEvent.setup();

    renderSessionPanel();
    await user.type(screen.getByLabelText("State ID"), "   ");
    await user.click(screen.getByRole("button", { name: "Load session" }));

    expect(await screen.findByText("State ID is required.")).toBeInTheDocument();
  });

  it("loads an existing session with an encoded path", async () => {
    const fetcher = installFetch((url) => {
      expect(url).toBe("http://api.test/sessions/state%201%2F2");
      return new Response(
        JSON.stringify({
          ...sessionResponse,
          state_id: "state 1/2",
          current_state: currentState,
        }),
      );
    });
    const user = userEvent.setup();

    renderSessionPanel();
    await user.type(screen.getByLabelText("State ID"), "state 1/2");
    await user.click(screen.getByRole("button", { name: "Load session" }));

    expect(await screen.findByText(/Loaded current state/)).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("renders not-found errors when loading", async () => {
    installFetch(() =>
      new Response(
        JSON.stringify({
          error: { code: "STATE_NOT_FOUND", message: "Unknown state.", details: {} },
        }),
        { status: 404 },
      ),
    );
    const user = userEvent.setup();

    renderSessionPanel();
    await user.type(screen.getByLabelText("State ID"), "missing");
    await user.click(screen.getByRole("button", { name: "Load session" }));

    expect(await screen.findByText("Unknown state.")).toBeInTheDocument();
    expect(screen.getByText(/STATE_NOT_FOUND/)).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HealthStatus } from "./health-status";

function installFetch(response: Response) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

describe("HealthStatus", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_CROPTWIN_API_BASE_URL = "http://api.test";
  });

  it("shows a connected backend response", async () => {
    installFetch(new Response(JSON.stringify({ status: "ok", service: "crop", version: "mvp" })));

    render(<HealthStatus />);

    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(screen.getByText(/crop · mvp/)).toBeInTheDocument();
  });

  it("stays usable when the backend is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline")));

    render(<HealthStatus />);

    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  it("runs a manual retry", async () => {
    const fetcher = installFetch(new Response(JSON.stringify({ status: "ok", service: "crop", version: "mvp" })));
    const user = userEvent.setup();

    render(<HealthStatus />);
    await screen.findByText("Connected");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("announces malformed responses", async () => {
    installFetch(new Response(JSON.stringify({ status: "weird" })));

    render(<HealthStatus />);

    expect(await screen.findByText("Malformed response")).toBeInTheDocument();
    expect(screen.getByText("The backend responded, but its health response did not match the expected format.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });
});

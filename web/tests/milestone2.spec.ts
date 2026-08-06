import { expect, test, type Request } from "@playwright/test";

test.describe.configure({ mode: "serial" });

function isApiMutation(request: Request) {
  return request.method() === "POST" && request.url().startsWith("http://127.0.0.1:8000/");
}

test("runs corrected farm, plot, and session workflows against isolated FastAPI", async ({ page }) => {
  const consoleErrors: string[] = [];
  const apiRequests: Request[] = [];
  const mutationRequests: Request[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("request", (request) => {
    if (request.url().startsWith("http://127.0.0.1:8000/")) apiRequests.push(request);
    if (isApiMutation(request)) mutationRequests.push(request);
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByText("Status: ok")).toBeVisible();
  await page.getByRole("link", { name: /Farms and plots/i }).click();

  await page.getByLabel("Farm name").fill("Playwright Farm");
  await page.getByRole("button", { name: "Create farm" }).click();
  await expect(page).toHaveURL(/\/farms\/[^/]+$/);

  await page.getByLabel("Plot name").fill("Zero Coordinate Plot");
  await page.getByLabel("Location name").fill("Prime Meridian Field");
  const beforeInvalidPlotSubmit = mutationRequests.length;
  await page.getByRole("button", { name: "Create plot" }).click();
  await expect(page.getByText("Latitude is required.")).toBeVisible();
  await expect(page.getByText("Longitude is required.")).toBeVisible();
  expect(mutationRequests).toHaveLength(beforeInvalidPlotSubmit);

  await page.getByLabel("Latitude").fill("0");
  await page.getByLabel("Longitude").fill("0");
  await page.getByRole("button", { name: "Create plot" }).click();
  await expect(page.getByRole("link", { name: /Zero Coordinate Plot/ })).toBeVisible();
  const plotRequest = mutationRequests.find((request) =>
    /\/farms\/[^/]+\/plots$/.test(new URL(request.url()).pathname),
  );
  expect(plotRequest?.postDataJSON()).toMatchObject({
    location: { latitude: 0, longitude: 0 },
  });
  expect(plotRequest?.postDataJSON().location).not.toHaveProperty("elevation_m");

  await page.getByRole("link", { name: /Zero Coordinate Plot/ }).click();
  await expect(page.getByRole("heading", { name: "Zero Coordinate Plot" })).toBeVisible();
  await page.getByRole("button", { name: "Start crop cycle" }).click();
  await expect(page).toHaveURL(/\/cycle\/[^?]+\?plotId=/);
  await expect(page.getByText(/Opened from plot: Zero Coordinate Plot/)).toBeVisible();
  await expect(page.getByText(/Navigation context only/)).toBeVisible();
  await expect(page.getByText(/Plot-backed/)).toHaveCount(0);
  await expect(page.getByText("Current twin state not yet computed")).toBeVisible();

  const plotId = new URL(page.url()).searchParams.get("plotId");
  expect(plotId).toBeTruthy();
  const statePath = new URL(page.url()).pathname;
  expect(
    apiRequests.filter(
      (request) =>
        request.method() === "GET" &&
        new URL(request.url()).pathname === `/sessions/${statePath.split("/").at(-1)}`,
    ),
  ).toHaveLength(0);
  await page.evaluate((validPlotId) => {
    const edited = ` ${validPlotId} `;
    window.history.pushState({}, "", `${window.location.pathname}?plotId=${encodeURIComponent(edited)}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, plotId);
  await expect(page).toHaveURL(/plotId=%20.*%20$/);
  await expect(page.getByText(/Opened from plot: Zero Coordinate Plot/)).toBeVisible();
  await expect(page.getByText(/Plot-backed/)).toHaveCount(0);
  await page.getByRole("link", { name: "Remove navigation context" }).click();
  await expect(page).toHaveURL(new RegExp(`${statePath}$`));
  await expect(page.getByText("Current twin state not yet computed")).toBeVisible();
  await expect(page.getByText(/Opened from plot/)).toHaveCount(0);

  await page.getByRole("link", { name: /Active crop cycle/i }).click();
  await page.getByLabel("Location name").fill("Standalone blank coordinates");
  const beforeInvalidSessionSubmit = mutationRequests.length;
  await page.getByRole("button", { name: "Create standalone session" }).click();
  await expect(page.getByText("Latitude is required.")).toBeVisible();
  await expect(page.getByText("Longitude is required.")).toBeVisible();
  expect(mutationRequests).toHaveLength(beforeInvalidSessionSubmit);

  await page.getByLabel("Location name").fill("Standalone zero field");
  await page.getByLabel("Latitude").fill("0");
  await page.getByLabel("Longitude").fill("0");
  await page.getByLabel("Elevation (m), optional").fill("0");
  await page.getByRole("button", { name: "Create standalone session" }).click();
  await expect(page).toHaveURL(/\/cycle\/[^?]+\?mode=standalone/);
  await expect(page.getByText("Opened from standalone creation flow")).toBeVisible();
  await expect(page.getByText("Standalone session")).toHaveCount(0);

  const standaloneRequests = mutationRequests.filter(
    (request) => new URL(request.url()).pathname === "/sessions",
  );
  expect(standaloneRequests).toHaveLength(1);
  expect(standaloneRequests[0].postDataJSON()).toMatchObject({
    location: { latitude: 0, longitude: 0, elevation_m: 0 },
  });

  const cycleRequests = mutationRequests.filter((request) =>
    /\/plots\/[^/]+\/crop-cycles$/.test(new URL(request.url()).pathname),
  );
  expect(cycleRequests).toHaveLength(1);

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(consoleErrors).toEqual([]);
});

test("submits a standalone session without blank elevation", async ({ page }) => {
  let submittedBody: Record<string, unknown> | undefined;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/sessions") {
      submittedBody = request.postDataJSON() as Record<string, unknown>;
    }
  });

  await page.goto("/cycle");
  await page.getByLabel("Location name").fill("No elevation field");
  await page.getByLabel("Latitude").fill("0");
  await page.getByLabel("Longitude").fill("0");
  await page.getByRole("button", { name: "Create standalone session" }).click();
  await expect(page).toHaveURL(/\/cycle\/[^?]+\?mode=standalone/);
  expect(submittedBody).toMatchObject({
    location: { latitude: 0, longitude: 0 },
  });
  expect(submittedBody?.location).not.toHaveProperty("elevation_m");
});

test("prevents a duplicate standalone submission while POST is pending", async ({ page }) => {
  let posts = 0;
  await page.route("**/sessions", async (route) => {
    if (route.request().method() === "POST") {
      posts += 1;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await route.continue();
  });
  await page.goto("/cycle");
  await page.getByLabel("Location name").fill("Pending Field");
  await page.getByLabel("Latitude").fill("17.4");
  await page.getByLabel("Longitude").fill("78.5");
  await page.getByLabel("Elevation (m), optional").fill("542");
  const submit = page.getByRole("button", { name: "Create standalone session" });
  await submit.click();
  await expect(page.getByRole("button", { name: "Creating session…" })).toBeDisabled();
  await expect(page).toHaveURL(/\/cycle\/[^?]+\?mode=standalone/);
  expect(posts).toBe(1);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
  test(`Milestone 2 management has no horizontal overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/farms");
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
}

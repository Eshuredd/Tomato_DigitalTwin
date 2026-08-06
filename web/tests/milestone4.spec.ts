import { expect, test, type Page, type Request } from "@playwright/test";

async function createWorkflow(page: Page) {
  await page.goto("/cycle");
  await page.getByLabel("Location name").fill("Milestone 4 field");
  await page.getByLabel("Latitude").fill("17.385");
  await page.getByLabel("Longitude").fill("78.4867");
  await page.getByLabel("Elevation (m), optional").fill("542");
  await page.getByRole("button", { name: "Create standalone session" }).click();
  await page.getByRole("link", { name: "Open workflow" }).click();
  await page.getByLabel(/Choose one tomato leaf image/i).setInputFiles({ name: "leaf.png", mimeType: "image/png", buffer: Buffer.from("MILESTONE_4_LEAF") });
  await page.getByRole("button", { name: "Run disease prediction" }).click();
  await expect(page.getByText(/Supporting AI evidence — not a confirmed diagnosis/i)).toBeVisible();
  await page.getByRole("button", { name: /Weather/ }).click();
  await page.getByRole("button", { name: "Retrieve weather" }).click();
  await expect(page.getByRole("heading", { name: "Open-Meteo source" })).toBeVisible();
  await page.getByRole("button", { name: "Accept reviewed weather" }).click();
  await page.getByRole("button", { name: /Irrigation/ }).click();
  await page.getByRole("button", { name: "Accept irrigation input" }).click();
}

test("computes water, updates twin, and explicitly advances one day", async ({ page }) => {
  const consoleErrors: string[] = []; const apiRequests: Request[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("request", (request) => { if (request.url().startsWith("http://127.0.0.1:8000/")) apiRequests.push(request); });
  await page.setViewportSize({ width: 1440, height: 900 }); await createWorkflow(page);
  await page.getByRole("button", { name: /Water state/ }).click();
  const firstWaterResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("compute-water-state"));
  await page.getByRole("button", { name: "Compute first water state" }).click();
  await expect(page.getByText("Sequence 1 current")).toBeVisible();
  const firstWaterResult = await (await firstWaterResponse).json();
  const firstWater = apiRequests.find((request) => request.method() === "POST" && request.url().includes("compute-water-state"));
  expect(firstWater).toBeTruthy(); const firstBody = firstWater!.postDataJSON(); expect(firstBody.water_update_id).toBeTruthy(); expect(firstBody).not.toHaveProperty("observed_at"); expect(firstBody).not.toHaveProperty("base_water_observation_id"); expect(firstBody).not.toHaveProperty("base_water_sequence");
  await page.getByRole("button", { name: /Water state/ }).click(); await expect(page.getByText("Accepted deterministic water result")).toBeVisible();
  await page.screenshot({ path: "test-results/m4-water-result-lineage.png", fullPage: true }); await page.getByRole("button", { name: /Twin update/ }).click();

  await page.getByRole("button", { name: "Update canonical twin" }).click();
  await expect(page.getByText("New canonical twin snapshot created")).toBeVisible();
  await page.screenshot({ path: "test-results/m4-canonical-twin-created.png", fullPage: true });
  await page.getByRole("button", { name: "Update canonical twin again" }).click();
  await expect(page.getByText("Canonical twin already matched the latest accepted observations")).toBeVisible();
  await page.screenshot({ path: "test-results/m4-canonical-twin-reused.png", fullPage: true });
  expect(consoleErrors).toEqual([]);

  const nextWaterDate = new Date(`${firstBody.current_date}T00:00:00Z`); nextWaterDate.setUTCDate(nextWaterDate.getUTCDate() + 1); const competingDateText = nextWaterDate.toISOString().slice(0, 10); nextWaterDate.setUTCDate(nextWaterDate.getUTCDate() + 1); const nextWaterDateText = nextWaterDate.toISOString().slice(0, 10);
  await page.getByRole("button", { name: /Weather/ }).click(); await page.getByLabel("Target date").fill(nextWaterDateText); await page.getByRole("button", { name: "Retrieve weather" }).click(); await expect(page.getByRole("heading", { name: "Open-Meteo source" })).toBeVisible(); await page.getByRole("button", { name: "Accept reviewed weather" }).click();
  await page.getByRole("button", { name: /Irrigation/ }).click(); await page.getByRole("button", { name: "Accept irrigation input" }).click();
  await page.request.post(`http://127.0.0.1:8000/sessions/${firstBody.state_id}/compute-water-state`, { data: { state_id: firstBody.state_id, water_update_id: "playwright-competing-update", current_date: competingDateText, weather: { tmin_c: 21.5, tmax_c: 32.25, humidity_pct: 67, wind_speed_mps: 2.55, shortwave_radiation_sum_mj_m2: 19.75, rainfall_mm: 0, eto_reference_feed: 5.1 }, last_irrigation_event: null, base_water_observation_id: firstWaterResult.water_observation_id, base_water_sequence: firstWaterResult.water_sequence } });
  await page.getByRole("button", { name: /Water state/ }).click(); await page.getByRole("button", { name: "Compute first water state" }).click(); await expect(page.getByRole("button", { name: "Rebase water request" })).toBeVisible();
  const waterCountBeforeRebase = apiRequests.filter((request) => request.method() === "POST" && request.url().includes("compute-water-state")).length; await page.screenshot({ path: "test-results/m4-stale-baseline-recovery.png", fullPage: true }); await page.getByRole("button", { name: "Rebase water request" }).click(); expect(apiRequests.filter((request) => request.method() === "POST" && request.url().includes("compute-water-state"))).toHaveLength(waterCountBeforeRebase);
  expect(consoleErrors).toEqual([expect.stringMatching(/409 \(Conflict\)/)]); consoleErrors.length = 0;
  await page.getByRole("button", { name: "Compute first water state" }).click(); await expect(page.getByText("Sequence 3 current")).toBeVisible();
  const waterRequests = apiRequests.filter((request) => request.method() === "POST" && request.url().includes("compute-water-state")); const staleBody = waterRequests.at(-2)!.postDataJSON(); const rebasedBody = waterRequests.at(-1)!.postDataJSON(); expect(staleBody).toMatchObject({ base_water_observation_id: firstWaterResult.water_observation_id, base_water_sequence: firstWaterResult.water_sequence }); expect(rebasedBody).not.toHaveProperty("base_water_observation_id"); expect(rebasedBody.water_update_id).not.toBe(staleBody.water_update_id);
  await page.getByRole("button", { name: "Update canonical twin" }).click(); await expect(page.getByText("New canonical twin snapshot created")).toBeVisible();

  await page.getByRole("tab", { name: "Advance one day" }).click();
  const requiredDate = await page.getByLabel("Required target date").inputValue(); expect(requiredDate).toMatch(/^\d{4}-\d{2}-\d{2}$/); await expect(page.getByLabel("Required target date")).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "Retrieve weather" }).click(); await expect(page.getByRole("heading", { name: "Open-Meteo source" })).toBeVisible(); await page.getByRole("button", { name: "Accept reviewed weather" }).click();
  await page.getByRole("button", { name: "Accept irrigation input" }).click();
  await page.screenshot({ path: "test-results/m4-advancement-preparation.png", fullPage: true });
  await page.getByRole("button", { name: "Advance one day", exact: true }).click(); await expect(page.getByText("Advanced canonical state by one day")).toBeVisible();
  await page.screenshot({ path: "test-results/m4-advancement-success.png", fullPage: true });
  const advanceRequests = apiRequests.filter((request) => request.method() === "POST" && request.url().includes("advance-one-day")); expect(advanceRequests).toHaveLength(1); const advanceId = advanceRequests[0].postDataJSON().advancement_id; expect(advanceId).toBeTruthy();
  await page.getByRole("button", { name: "Retry exact advancement" }).click(); await expect(page.getByText("Current advancement result idempotently reused")).toBeVisible();
  const retries = apiRequests.filter((request) => request.method() === "POST" && request.url().includes("advance-one-day")); expect(retries).toHaveLength(2); expect(retries[1].postDataJSON().advancement_id).toBe(advanceId);
  await page.screenshot({ path: "test-results/m4-advancement-reused.png", fullPage: true });

  expect(apiRequests.filter((request) => /simulate-actions|recommend|narrate/.test(request.url()))).toHaveLength(0);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) { await page.setViewportSize(viewport); const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth })); expect(widths.scroll).toBeLessThanOrEqual(widths.client); }
  expect(consoleErrors).toEqual([]);
});

import { expect, test, type Request } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("completes Milestone 3 preparation without water-state computation", async ({ page }) => {
  const consoleErrors: string[] = [];
  const apiRequests: Request[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("request", (request) => { if (request.url().startsWith("http://127.0.0.1:8000/")) apiRequests.push(request); });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/cycle");
  await page.getByLabel("Location name").fill("Milestone 3 field");
  await page.getByLabel("Latitude").fill("17.385");
  await page.getByLabel("Longitude").fill("78.4867");
  await page.getByLabel("Elevation (m), optional").fill("542");
  await page.getByRole("button", { name: "Create standalone session" }).click();
  await expect(page).toHaveURL(/\/cycle\/[^?]+\?mode=standalone/);
  await page.getByRole("link", { name: "Open workflow" }).click();
  await expect(page).toHaveURL(/\/workflow\/state_/);

  expect(apiRequests.filter((request) => request.url().includes("weather-snapshot"))).toHaveLength(0);
  const fileInput = page.getByLabel(/Choose one tomato leaf image/i);
  await fileInput.setInputFiles({ name: "leaf.png", mimeType: "image/png", buffer: Buffer.from("LOW_UNCERTAINTY_LEAF") });
  await page.screenshot({ path: "test-results/m3-disease-image-selection.png", fullPage: true });
  await page.getByRole("button", { name: "Run disease prediction" }).click();
  await expect(page.getByText(/Supporting AI evidence — not a confirmed diagnosis/i)).toBeVisible();
  await page.screenshot({ path: "test-results/m3-disease-evidence.png", fullPage: true });
  expect(apiRequests.filter((request) => request.method() === "POST" && request.url().includes("predict-disease"))).toHaveLength(1);

  const diseaseStep = page.getByRole("button", { name: /Disease evidence/ });
  const weatherStep = page.getByRole("button", { name: /Weather/ });
  await diseaseStep.focus();
  await diseaseStep.press("ArrowRight");
  await expect(weatherStep).toBeFocused();
  await weatherStep.click();
  expect(apiRequests.filter((request) => request.url().includes("weather-snapshot"))).toHaveLength(0);
  await page.getByRole("button", { name: "Retrieve weather" }).click();
  await expect(page.getByRole("heading", { name: "Open-Meteo source" })).toBeVisible();
  await page.getByLabel("Shortwave radiation (MJ/m²), optional").fill("");
  await page.getByLabel("Rainfall (mm)").fill("0");
  await page.getByRole("button", { name: "Accept reviewed weather" }).click();
  await expect(page.getByText("Reviewed weather accepted")).toBeVisible();
  await page.screenshot({ path: "test-results/m3-fetched-reviewed-weather.png", fullPage: true });
  expect(apiRequests.filter((request) => request.method() === "GET" && request.url().includes("weather-snapshot"))).toHaveLength(1);

  await page.getByLabel("Review provenance").selectOption("manual");
  await expect(page.getByText("Fully manual weather")).toBeVisible();
  await page.screenshot({ path: "test-results/m3-manual-weather.png", fullPage: true });
  await page.getByLabel("Review provenance").selectOption("fetched_reviewed");
  await page.getByRole("button", { name: "Accept reviewed weather" }).click();

  await page.getByRole("button", { name: /Irrigation/ }).click();
  await page.getByRole("button", { name: "Accept irrigation input" }).click();
  await expect(page.getByText("Irrigation input accepted")).toBeVisible();
  await page.getByRole("button", { name: /Session/ }).click();
  await page.screenshot({ path: "test-results/m3-workflow-first-four-complete.png", fullPage: true });
  await page.getByRole("button", { name: /Irrigation/ }).click();

  await page.getByLabel("Input mode").selectOption("litres_area");
  await expect(page.getByText("Accepted irrigation input is stale")).toBeVisible();
  await page.getByLabel("Total water applied (litres)").fill("25");
  await page.getByLabel("Irrigated area (m²)").fill("10");
  await expect(page.getByText(/2\.500000 mm/)).toBeVisible();
  await page.getByRole("button", { name: "Accept irrigation input" }).click();

  await page.getByLabel("Input mode").selectOption("drip_runtime");
  await page.getByLabel("Emitter count").fill("10");
  await page.getByLabel("Emitter flow (litres/hour)").fill("2");
  await page.getByLabel("Runtime (minutes)").fill("30");
  await page.getByLabel("Irrigated area (m²)").fill("10");
  await expect(page.getByText(/Calculated total litres/)).toBeVisible();
  await expect(page.getByText("10 L")).toBeVisible();
  await page.getByRole("button", { name: "Accept irrigation input" }).click();
  await page.screenshot({ path: "test-results/m3-irrigation-conversion.png", fullPage: true });

  await page.getByRole("button", { name: /Weather/ }).click();
  await expect(page.getByLabel("Rainfall (mm)")).toHaveValue("0");
  await page.getByRole("button", { name: /Irrigation/ }).click();
  await expect(page.getByLabel("Emitter count")).toHaveValue("10");
  await page.getByRole("button", { name: /Weather/ }).click();
  await page.getByLabel("Rainfall (mm)").fill("1");
  await expect(page.getByText("Accepted weather is stale")).toBeVisible();

  await page.getByRole("button", { name: /Disease evidence/ }).click();
  await fileInput.setInputFiles({ name: "uncertain.webp", mimeType: "image/webp", buffer: Buffer.from("HIGH_UNCERTAINTY") });
  await page.getByRole("button", { name: "Run disease prediction" }).click();
  await expect(page.getByText("Manual inspection recommended")).toBeVisible();
  await page.screenshot({ path: "test-results/m3-high-uncertainty-evidence.png", fullPage: true });
  expect(apiRequests.filter((request) => request.method() === "POST" && request.url().includes("predict-disease"))).toHaveLength(2);
  expect(apiRequests.filter((request) => request.url().includes("compute-water-state"))).toHaveLength(0);

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  }
  expect(consoleErrors).toEqual([]);
});

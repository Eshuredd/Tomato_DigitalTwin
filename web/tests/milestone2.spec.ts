import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("runs health, farm, plot, and session entry workflows against isolated FastAPI", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByText("Status: ok")).toBeVisible();
  await page.getByRole("link", { name: /System information/i }).click();
  await expect(page.getByText(/deterministic engine decides narrator explains/i)).toBeVisible();

  await page.getByRole("link", { name: /Farms and plots/i }).click();
  await expect(page.getByText("No farms yet")).toBeVisible();
  await page.getByLabel("Farm name").fill("Playwright Farm");
  await page.getByRole("button", { name: "Create farm" }).click();
  await expect(page).toHaveURL(/\/farms\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Playwright Farm", exact: true })).toBeVisible();

  await page.getByLabel("Plot name").fill("North Plot");
  await page.getByLabel("Location name").fill("North Field");
  await page.getByLabel("Latitude").fill("17.385");
  await page.getByLabel("Longitude").fill("78.4867");
  await page.getByLabel("Soil texture").selectOption("sandy_loam");
  await page.getByRole("button", { name: "Create plot" }).click();
  await expect(page.getByRole("link", { name: /North Plot/ })).toBeVisible();
  await page.getByRole("link", { name: /North Plot/ }).click();
  await expect(page).toHaveURL(/\/plots\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "North Plot" })).toBeVisible();

  await page.getByRole("button", { name: "Start crop cycle" }).click();
  await expect(page).toHaveURL(/\/cycle\/[^?]+\?plotId=/);
  await expect(page.getByText(/Plot-backed · North Plot/)).toBeVisible();
  await expect(page.getByText("Current twin state not yet computed")).toBeVisible();

  await page.getByRole("link", { name: /Active crop cycle/i }).click();
  await expect(page.getByRole("heading", { name: "Open a crop cycle" })).toBeVisible();
  await page.getByLabel("Location name").fill("Standalone Field");
  await page.getByLabel("Latitude").fill("17.4");
  await page.getByLabel("Longitude").fill("78.5");
  await page.getByLabel("Elevation (m), optional").fill("542");
  await page.getByRole("button", { name: "Create standalone session" }).click();
  await expect(page).toHaveURL(/\/cycle\/[^?]+\?mode=standalone/);
  await expect(page.getByText("Standalone session")).toBeVisible();

  await page.getByRole("link", { name: /Active crop cycle/i }).click();
  await page.getByRole("tab", { name: "Load existing" }).click();
  expect(consoleErrors).toEqual([]);
  const priorUrl = page.url();
  await page.getByLabel("State ID").fill("missing-state");
  await page.getByRole("button", { name: "Load session" }).click();
  await expect(page.getByText(/requested farm, plot, or session was not found/i)).toBeVisible();
  await expect(page).toHaveURL(priorUrl);

  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(consoleErrors).toEqual([expect.stringMatching(/404 \(Not Found\)/)]);
});

test("prevents a duplicate standalone submission while POST is pending", async ({ page }) => {
  await page.route("**/sessions", async (route) => { if (route.request().method() === "POST") { await new Promise((resolve) => setTimeout(resolve, 500)); } await route.continue(); });
  await page.goto("/cycle");
  await page.getByLabel("Location name").fill("Pending Field");
  await page.getByLabel("Latitude").fill("17.4");
  await page.getByLabel("Longitude").fill("78.5");
  await page.getByLabel("Elevation (m), optional").fill("542");
  const submit = page.getByRole("button", { name: "Create standalone session" });
  await submit.click();
  await expect(page.getByRole("button", { name: "Creating session…" })).toBeDisabled();
  await expect(page).toHaveURL(/\/cycle\/[^?]+\?mode=standalone/);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
  test(`Milestone 2 management has no horizontal overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/farms");
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
}

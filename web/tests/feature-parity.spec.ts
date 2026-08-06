import { expect, test, type Page, type Request } from "@playwright/test";

async function prepareCurrentTwin(page: Page) {
  await page.goto("/cycle");
  await page.getByLabel("Location name").fill("Parity field");
  await page.getByLabel("Latitude").fill("17.385");
  await page.getByLabel("Longitude").fill("78.4867");
  await page.getByLabel("Elevation (m), optional").fill("542");
  await page.getByRole("button", { name: "Create standalone session" }).click();
  await page.getByRole("link", { name: "Open workflow" }).click();
  const stateId = decodeURIComponent(page.url().split("/workflow/")[1]!);
  await page.getByLabel(/Choose one tomato leaf image/i).setInputFiles({ name: "leaf.png", mimeType: "image/png", buffer: Buffer.from("PARITY_LEAF") });
  await page.getByRole("button", { name: "Run disease prediction" }).click();
  await expect(page.getByText(/Supporting AI evidence/i)).toBeVisible();
  await page.getByRole("button", { name: /Weather/ }).click();
  await page.getByRole("button", { name: "Retrieve weather" }).click();
  await page.getByRole("button", { name: "Accept reviewed weather" }).click();
  await page.getByRole("button", { name: /Irrigation/ }).click();
  await page.getByRole("button", { name: "Accept irrigation input" }).click();
  await page.getByRole("button", { name: /Water state/ }).click();
  await page.getByRole("button", { name: "Compute first water state" }).click();
  await page.getByRole("button", { name: "Update canonical twin" }).click();
  await expect(page.getByText("New canonical twin snapshot created")).toBeVisible();
  return stateId;
}

test("completes all nine stages, history, and actual-action recording", async ({ page }) => {
  const requests: Request[] = []; const errors: string[] = [];
  page.on("request", (request) => { if (request.url().startsWith("http://127.0.0.1:8000/")) requests.push(request); });
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); }); page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 }); await prepareCurrentTwin(page);
  expect(requests.filter((request) => /simulate-actions|recommend|narrate/.test(request.url()))).toHaveLength(0);
  await page.getByRole("button", { name: /Simulation/ }).click();
  await page.getByRole("button", { name: "Simulate selected candidates" }).click();
  await expect(page.getByRole("heading", { name: "Deterministic FastAPI recommendation" })).toBeVisible();
  const simulationPosts = requests.filter((request) => request.method() === "POST" && request.url().includes("simulate-actions")); expect(simulationPosts).toHaveLength(1); expect(simulationPosts[0].postDataJSON().actions).toEqual(["IRRIGATE_NOW", "IRRIGATE_IN_6H", "IRRIGATE_TOMORROW_AM", "NO_IRRIGATION_24H"]);
  await page.getByRole("button", { name: /Simulation/ }).click(); await page.screenshot({ path: "test-results/parity-simulation.png", fullPage: true }); await page.getByRole("button", { name: /Recommendation/ }).click();
  await page.getByRole("button", { name: "Request recommendation" }).click();
  await expect(page.getByRole("heading", { name: "Recommendation explanation" })).toBeVisible();
  expect(requests.filter((request) => request.method() === "POST" && request.url().endsWith("/recommend"))).toHaveLength(1);
  await page.getByRole("button", { name: /Recommendation/ }).click(); await expect(page.getByText("Backend selected")).toBeVisible(); const actionHref = await page.getByRole("link", { name: "Record actual action" }).getAttribute("href"); expect(actionHref).toContain("recommendationId="); await page.screenshot({ path: "test-results/parity-recommendation.png", fullPage: true });
  await page.getByRole("button", { name: /Narration/ }).click(); await page.getByRole("button", { name: "Request explanation" }).click(); await expect(page.getByRole("heading", { name: "Workflow complete" })).toBeVisible();
  expect(requests.filter((request) => request.method() === "POST" && request.url().endsWith("/narrate"))).toHaveLength(1); await expect(page.getByText("Completed")).toHaveCount(8); await expect(page.getByRole("button", { name: /Narration.*Active/ })).toBeVisible(); await page.screenshot({ path: "test-results/parity-completed-workflow.png", fullPage: true });
  await page.getByRole("link", { name: "History", exact: true }).click(); await expect(page.getByRole("heading", { name: "History events" })).toBeVisible(); expect(requests.filter((request) => request.method() === "GET" && request.url().endsWith("/history"))).toHaveLength(1); await page.screenshot({ path: "test-results/parity-history.png", fullPage: true });
  await page.goto(actionHref!); const twinPostsBefore = requests.filter((request) => request.url().includes("update-twin-state")).length;
  await page.getByLabel("Amount (mm, optional)").fill("0"); await page.getByRole("button", { name: "Record actual action" }).click(); await expect(page.getByText("Actual action recorded")).toBeVisible(); await expect(page.getByText("1 recorded action")).toBeVisible();
  expect(requests.filter((request) => request.method() === "POST" && request.url().includes("actual-actions"))).toHaveLength(1); expect(requests.filter((request) => request.url().includes("update-twin-state"))).toHaveLength(twinPostsBefore); await page.screenshot({ path: "test-results/parity-actual-actions.png", fullPage: true });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) { await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth)); }
  expect(errors).toEqual([]);
});

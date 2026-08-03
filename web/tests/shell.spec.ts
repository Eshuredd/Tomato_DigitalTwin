import { expect, test } from "@playwright/test";

const routes = [
  ["/", "Overview"],
  ["/farms", "Farms and plots"],
  ["/cycle", "Active crop cycle"],
  ["/workflow", "Workflow"],
  ["/history", "History"],
  ["/actions", "Actual actions"],
  ["/system", "System information"],
] as const;

test("loads cleanly, exposes navigation, and transitions through every placeholder route", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  for (const [href, label] of routes.slice(1)) {
    await page.getByRole("link", { name: new RegExp(label, "i") }).click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole("link", { name: new RegExp(label, "i") })).toHaveAttribute("aria-current", "page");
  }
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }]) {
  test(`has no horizontal overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/workflow");
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
}

test("supports keyboard focus and skip navigation", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await page.goto("/workflow");
  const firstStep = page.getByRole("button", { name: /Session.*Completed/ });
  await firstStep.click();
  await expect(page.getByText(/Selected demonstration step:/)).toContainText("Session");
  await firstStep.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: /Disease evidence.*Active/ })).toBeFocused();
});

test("loads the declared application icon without a failed response", async ({ page, request }) => {
  await page.goto("/");
  const iconHref = await page.locator('link[rel~="icon"]').first().getAttribute("href");
  expect(iconHref).toBeTruthy();
  const response = await request.get(iconHref!);
  expect(response.ok()).toBe(true);
});

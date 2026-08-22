import { test, expect, type Page } from "@playwright/test";

/**
 * Google's scripts are blocked so the run is hermetic: the smoke test covers
 * the chart and structure panel, never sign-in. Without this a CI box with no
 * network to accounts.google.com would fail on console noise that says nothing
 * about the app.
 */
async function blockGoogle(page: Page) {
  // Served as an empty script rather than aborted: an aborted request logs a
  // network error of its own, which would fail the console assertion below for
  // a reason the test itself caused.
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "",
    }),
  );
}

test("the chart mounts and the console stays clean", async ({ page }) => {
  await blockGoogle(page);
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");

  // amCharts renders into a canvas; its presence proves the root mounted.
  await expect(page.locator(".chart-area canvas").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("adding a team through the panel reaches the chart without errors", async ({
  page,
}) => {
  await blockGoogle(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.getByRole("button", { name: /add team/i }).click();
  await expect(page.getByText("New team").first()).toBeVisible();

  await page.getByRole("button", { name: /add stream to new team/i }).click();
  await expect(page.getByText("New stream").first()).toBeVisible();

  await page.getByRole("button", { name: /add item to new stream/i }).click();
  await expect(page.getByText("New item").first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("the unsaved marker appears after an edit", async ({ page }) => {
  await blockGoogle(page);
  await page.goto("/");
  await expect(page.getByTestId("dirty-dot")).toBeHidden();
  await page.getByRole("button", { name: /add team/i }).click();
  await expect(page.getByTestId("dirty-dot")).toBeVisible();
});

test("an edit survives a reload through the local draft", async ({ page }) => {
  await blockGoogle(page);
  await page.goto("/");
  await page.getByRole("button", { name: /add team/i }).click();
  await expect(page.getByText("New team").first()).toBeVisible();

  // The autosave debounce has to elapse before the draft exists.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("scrum-gantt:draft")))
    .not.toBeNull();

  await page.reload();
  await expect(page.getByText("New team").first()).toBeVisible();
});

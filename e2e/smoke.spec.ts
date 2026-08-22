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

test("Save as… takes a name from the keyboard alone", async ({ page }) => {
  await blockGoogle(page);
  await page.goto("/");
  await page.getByRole("button", { name: /save as/i }).click();

  const field = page.getByRole("textbox", { name: /plan name/i });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Untitled plan");

  // Typing replaces the selected name, and Enter submits without reaching for
  // the mouse. The submit button sits outside the form and is associated by
  // its form attribute, so this is the assertion that proves that wiring.
  await page.keyboard.type("Q3 Delivery Plan");
  await expect(field).toHaveValue("Q3 Delivery Plan");
  await page.keyboard.press("Enter");

  await expect(page.locator(".dialog-backdrop")).toBeHidden();
});

test("Save as… refuses an empty name", async ({ page }) => {
  await blockGoogle(page);
  await page.goto("/");
  await page.getByRole("button", { name: /save as/i }).click();

  await page.getByRole("textbox", { name: /plan name/i }).fill("");
  // Scoped to the dialog: the toolbar has a Save button of its own.
  const confirm = page
    .locator(".dialog")
    .getByRole("button", { name: /^save$/i });
  await expect(confirm).toBeDisabled();
  await page.keyboard.press("Enter");
  await expect(page.locator(".dialog-backdrop")).toBeVisible();
});

test("Fit drives the chart without errors", async ({ page }) => {
  await blockGoogle(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.getByRole("button", { name: /add team/i }).click();
  await page.getByRole("button", { name: /add stream to new team/i }).click();
  await page.getByRole("button", { name: /add item to new stream/i }).click();

  // The chart is a canvas, so there is no DOM text to compare a range against.
  // What this can prove is that Fit reaches amCharts and the chart survives it.
  await page.getByRole("button", { name: /fit/i }).click();

  await expect(page.locator(".chart-area canvas").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("switching the duration unit keeps the plan's dates", async ({ page }) => {
  await blockGoogle(page);
  await page.goto("/");
  await page.getByRole("button", { name: /add team/i }).click();
  await page.getByRole("button", { name: /add stream to new team/i }).click();
  await page.getByRole("button", { name: /add item to new stream/i }).click();

  const draft = () =>
    page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("scrum-gantt:draft") || "null")?.doc,
    );

  // Poll for the task, not merely for a non-null draft: the autosave debounce
  // means an empty or absent draft is the normal state for the first second.
  await expect.poll(async () => (await draft())?.tasks?.length).toBe(1);
  const before = await draft();

  await page.getByRole("button", { name: "1w" }).click();
  await expect
    .poll(async () => (await draft())?.calendar.durationUnit)
    .toBe("week");

  await page.getByRole("button", { name: "1d" }).click();
  await expect
    .poll(async () => (await draft())?.calendar.durationUnit)
    .toBe("day");

  // A round trip through weeks must leave the plan exactly as it was.
  const after = await draft();
  expect(after.tasks).toEqual(before.tasks);
});

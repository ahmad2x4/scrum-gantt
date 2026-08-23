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

test("switching the duration unit converts durations losslessly", async ({
  page,
}) => {
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
  const task = async () => (await draft())?.tasks?.[0];

  // Poll for the task, not merely for a non-null draft: the autosave debounce
  // means an empty or absent draft is the normal state for the first second.
  await expect.poll(async () => (await draft())?.tasks?.length).toBe(1);
  // And let the chart finish reconciling before reading a baseline, or the
  // comparison below races its normalising write-back.
  await page.waitForTimeout(2500);
  const before = await task();

  await page.getByRole("button", { name: "1w" }).click();
  await expect
    .poll(async () => (await draft())?.calendar.durationUnit)
    .toBe("week");
  await expect.poll(async () => (await task()).duration).toBe(1);

  // The chart plans at week granularity in week mode, so it snaps starts to
  // the start of their week. That is a real change to the plan, and it does
  // not come back when the unit does — see the note in CLAUDE.md.
  const inWeeks = await task();
  expect(new Date(inWeeks.start).getDay()).toBe(1);

  await page.getByRole("button", { name: "1d" }).click();
  await expect
    .poll(async () => (await draft())?.calendar.durationUnit)
    .toBe("day");

  // The duration is what must survive the round trip exactly: five working
  // days is one working week is five working days.
  const after = await task();
  expect(after.duration).toBe(before.duration);
  expect(after.start).toBe(inWeeks.start);
});

test("locking a plan stops edits until it is deliberately unlocked", async ({
  page,
}) => {
  await blockGoogle(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.getByRole("button", { name: /add team/i }).click();
  await expect(page.getByText("New team").first()).toBeVisible();

  await page.getByRole("button", { name: /lock plan/i }).click();

  // The panel's controls go dead, and so does the unit selector.
  await expect(page.getByRole("button", { name: /add team/i })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /delete new team/i }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "1w" })).toBeDisabled();

  // The lock reaches the document, which is what the store gate reads.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("scrum-gantt:draft") || "null")?.doc
            ?.locked,
      ),
    )
    .toBe(true);

  // A locked plan must sit still. The chart keeps reporting values of its own,
  // and a gate that refused them noisily would churn the document forever.
  const before = await page.evaluate(() =>
    localStorage.getItem("scrum-gantt:draft"),
  );
  await page.waitForTimeout(3000);
  expect(
    await page.evaluate(() => localStorage.getItem("scrum-gantt:draft")),
  ).toBe(before);

  await page.getByRole("button", { name: /unlock plan/i }).click();

  // Step one: the wrong name leaves Unlock dead.
  const confirm = page
    .locator(".dialog")
    .getByRole("button", { name: /^unlock$/i });
  await expect(confirm).toBeDisabled();
  await page.getByRole("textbox", { name: /plan name/i }).fill("Untitled plan");
  await expect(confirm).toBeEnabled();
  await confirm.click();

  // Step two: a separate confirmation, and only then is it editable again.
  await page.getByRole("button", { name: /yes, unlock/i }).click();
  await expect(page.getByRole("button", { name: /add team/i })).toBeEnabled();

  await page.getByRole("button", { name: /add team/i }).click();
  await expect(page.getByText("New team")).toHaveCount(2);
  expect(errors).toEqual([]);
});

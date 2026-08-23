import { test, expect, type Page } from "@playwright/test";

async function seed(page: Page, locked: boolean) {
  await page.route(/https:\/\/(accounts|apis)\.google\.com\/.*/, (r) =>
    r.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
  );
  await page.goto("/");
  await page.evaluate((isLocked) => {
    const MON = new Date(2026, 7, 17).getTime();
    localStorage.setItem(
      "scrum-gantt:draft",
      JSON.stringify({
        doc: {
          schemaVersion: 1,
          name: "Render check",
          savedAt: new Date().toISOString(),
          calendar: {
            durationUnit: "day",
            weekends: [0, 6],
            excludeWeekends: true,
            holidays: [],
          },
          view: { sidebarWidth: "30%" },
          rows: [
            { id: "t1", name: "Team A", kind: "team", color: "#297373" },
            { id: "s1", name: "Stream A", kind: "stream", parentId: "t1" },
            { id: "i1", name: "Ten days", kind: "item", parentId: "s1" },
          ],
          tasks: [{ id: "i1", start: MON, duration: 10, progress: 40 }],
          ...(isLocked ? { locked: true } : {}),
        },
        fileId: null,
        savedAt: Date.now(),
      }),
    );
  }, locked);
  await page.reload();
  await page.waitForTimeout(3000);
}

/** Counts teal pixels on the chart canvas: the bars are the only teal thing. */
async function barPixels(page: Page) {
  return page.evaluate(() => {
    let n = 0;
    for (const c of Array.from(
      document.querySelectorAll<HTMLCanvasElement>(".chart-area canvas"),
    )) {
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx || !c.width) continue;
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i],
          g = d[i + 1],
          b = d[i + 2];
        if (
          d[i + 3] > 200 &&
          g > 70 &&
          b > 70 &&
          g - r > 25 &&
          b - r > 25 &&
          Math.abs(g - b) < 25
        )
          n++;
      }
    }
    return n;
  });
}

test("the chart actually paints its bars on load, unlocked", async ({
  page,
}) => {
  await seed(page, false);
  // Thousands of pixels, not a handful: this fails if the bars render as
  // hairlines or not at all, which is what an unpainted chart looks like.
  expect(await barPixels(page)).toBeGreaterThan(3000);
});

test("the chart actually paints its bars on load, locked", async ({ page }) => {
  await seed(page, true);
  expect(await barPixels(page)).toBeGreaterThan(3000);
});

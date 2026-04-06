import { expect, test } from "@playwright/test";

test("AC_9_3_compare_panel_markup", async ({ page }) => {
  await page.goto("/");
  // Run checkboxes live in the Runs panel; Compare panel hides that table.
  const rowA = page.locator('tr[data-run-id="run_a"]');
  await expect(rowA).toBeVisible();
  await rowA.locator("input.pick").check();
  await page.locator('tr[data-run-id="run_b"] input.pick').check();
  await page.locator('button.tab[data-tab="compare"]').click();
  await page.getByRole("button", { name: "Compare selected" }).click();
  const section = page.locator('[data-etl-section="compare-result"]');
  await expect(section).toBeVisible();
  await expect(page.locator("[data-etl-headline]")).toBeVisible();
  await expect(page.locator("[data-etl-window-trend]")).toBeVisible();
  await expect(page.locator("[data-etl-pairwise-trend]")).toBeVisible();
  await expect(page.locator("[data-etl-recurrence]")).toBeVisible();
  // Empty <ul> has no layout box; Playwright treats it as not visible. Contract is DOM presence.
  await expect(section.locator('ul[data-etl-list="introduced"]')).toBeAttached();
  await expect(section.locator('ul[data-etl-list="resolved"]')).toBeAttached();
  await expect(section.locator('ul[data-etl-list="recurring"]')).toBeAttached();
});

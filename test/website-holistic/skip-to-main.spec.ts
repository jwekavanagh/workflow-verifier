import { expect, test } from "@playwright/test";

test("skip link moves focus to #site-main", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-to-main")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#site-main")).toBeFocused();
});

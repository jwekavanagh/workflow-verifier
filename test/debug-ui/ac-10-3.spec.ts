import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const root = join(fileURLToPath(import.meta.url), "..", "..", "..");
const expected = JSON.parse(
  readFileSync(join(root, "test/fixtures/debug-ui-compare/expected-strings.json"), "utf8"),
) as { observedDatabaseSubstring: string; verificationBasisSubstring: string };

test("AC_10_3_observed_database_column", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "run_a" }).click();
  await expect(page.locator('[data-etl-section="run-trust"]')).toBeVisible();
  await expect(page.locator('[data-etl-section="run-trust"]')).toContainText(
    expected.verificationBasisSubstring,
  );
  const cell = page.locator('[data-etl-dimension="observed_database"]').first();
  await expect(cell).toContainText(expected.observedDatabaseSubstring);
});

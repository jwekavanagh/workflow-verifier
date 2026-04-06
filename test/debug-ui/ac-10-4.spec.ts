import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const root = join(fileURLToPath(import.meta.url), "..", "..", "..");
const expected = JSON.parse(
  readFileSync(join(root, "test/fixtures/debug-ui-slice6/expected-strings.json"), "utf8"),
) as { executionPathEmpty: string; executionPathFindingCode: string };

test("AC_10_4_execution_path", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "run_path_nonempty" }).click();
  await expect(
    page.locator(`[data-etl-finding-code="${expected.executionPathFindingCode}"]`),
  ).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "run_path_empty" }).click();
  const emptyP = page.locator("[data-etl-execution-path-empty]");
  await expect(emptyP).toBeVisible();
  await expect(emptyP).toHaveText(expected.executionPathEmpty);
});

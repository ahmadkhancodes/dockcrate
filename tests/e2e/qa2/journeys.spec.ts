import { expect, test } from "@playwright/test";
import { signInViaUi, watch } from "../qa/helpers";

test("qa2 checkout return: cancel link explains nothing was charged; ?next survives sign-in; sign-out lands on a public page", async ({ page, request }) => {
  const problems = watch(page);
  await signInViaUi(page, request, { next: "/app/billing?checkout=canceled" });
  await expect(page).toHaveURL(/\/app\/billing\?checkout=canceled/);
  await expect(page.getByText("Checkout canceled")).toBeVisible();
  await expect(page.getByText("You were not charged")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/(sign-in.*)?$/);
  expect(problems.filter((p) => !p.includes("#418"))).toEqual([]);
});

test("qa2 landing hero and pricing do not contradict the verification pipeline", async ({ page }) => {
  await page.goto("/");
  // D-01: the clean-VM check has not run for any version, so no preview may show it as passed.
  await expect(page.locator('[aria-label*="VM check passed"], [aria-label*="VM passed"]')).toHaveCount(0);
  await expect(page.getByText("VM test install passed")).toHaveCount(0);
  await page.goto("/pricing");
  await expect(page.getByText("Cancel anytime from your account.")).toHaveCount(0);
});

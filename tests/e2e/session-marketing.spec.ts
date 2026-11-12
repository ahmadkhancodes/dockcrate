import { expect, test } from "@playwright/test";
import { signInViaUi } from "./qa/helpers";

const pages = ["/", "/pricing", "/docs"];

test("signed-out marketing pages still offer Sign in", async ({ page }) => {
  for (const path of pages) {
    await page.goto(path);
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Open your dock" })).toHaveCount(0);
  }
});

test("signed-in visitors see Open your dock and no Sign in on /, /pricing and /docs", async ({ page, request }) => {
  await signInViaUi(page, request);
  for (const path of pages) {
    await page.goto(path);
    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: "Open your dock" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Open your dock" })).toHaveAttribute("href", "/app");
    await expect(header.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  }
  await page.goto("/pricing");
  await expect(page.getByRole("link", { name: "Start free" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Choose Starter" })).toHaveAttribute("href", /\/app\/billing\?plan=starter/);
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("link", { name: "Open your dock" }).first()).toHaveAttribute("href", "/app");
});

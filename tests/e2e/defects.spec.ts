import { expect, test } from "@playwright/test";
import { docs } from "../../src/content/docs";

test("favicon.ico resolves", async ({ request }) => {
  const r = await request.get("/favicon.ico");
  expect(r.status()).toBe(200);
});

test("home head has og:image and twitter:image", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toMatch(/<meta property="og:image" content="https?:\/\/[^"]+opengraph-image/);
  expect(html).toMatch(/<meta name="twitter:image" content="https?:\/\/[^"]+opengraph-image/);
});

test("catalog renders", async ({ request }) => {
  expect((await request.get("/catalog")).status()).toBe(200);
});

test.describe("docs at 375px", () => {
  test.use({ viewport: { width: 375, height: 800 } });
  for (const slug of ["", ...docs.map((d) => d.slug)]) {
    test(`no horizontal scroll /docs/${slug}`, async ({ page }) => {
      await page.goto(`/docs${slug ? `/${slug}` : ""}`);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over).toBeLessThanOrEqual(0);
    });
  }
});

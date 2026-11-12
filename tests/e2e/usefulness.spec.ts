import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { product } from "../../src/config/product";
import { signInViaUi, watch } from "./qa/helpers";

/**
 * Usefulness pass (docs/QA-REPORT.md "Usefulness pass 2"): the first ten minutes of the ICP personas, with a click
 * budget, and every copy-paste sample executed against the running app. Tenant consent is the only stand-in
 * (`/api/dev/connect-tenant?name=`, E2E only), because Microsoft's consent screen needs a registered Entra app.
 */

const origin = (page: Page) => ({ origin: new URL(page.url()).origin });

/** Counts real clicks the user makes in the app, so the journey has a budget. */
function clickCounter() {
  let n = 0;
  return {
    click: async (loc: ReturnType<Page["locator"]>) => { n++; await loc.click(); },
    get count() { return n; },
  };
}

test.describe("first ten minutes", () => {
  test("Priya (one-person IT): connected tenant to first app in Pilot in at most 3 clicks, no false limit alarm", async ({ page, request }) => {
    const problems = watch(page);
    await signInViaUi(page, request, { org: "Lakeshore Law" });
    const r = await page.request.post(`/api/dev/connect-tenant?name=${encodeURIComponent("Lakeshore Law")}`, { headers: origin(page) });
    expect(r.ok()).toBe(true);
    await page.goto("/app");

    // Using the one Free tenant is normal: no "reached your limit" banner on every page.
    await expect(page.getByText("Get to your first published app")).toBeVisible();
    await expect(page.getByText(/reached your limit|close to your limit|over your limit/)).toHaveCount(0);

    const c = clickCounter();
    await c.click(page.getByRole("link", { name: "Pick the Pilot and Broad groups" }));
    // Groups that look like Pilot and Broad are preselected.
    await expect(page.getByLabel("Pilot group")).toHaveValue("g-pilot");
    await expect(page.getByLabel("Broad group")).toHaveValue("g-broad");
    await c.click(page.getByRole("button", { name: "Save rings" }));
    // First save returns to the dock with the next step waiting.
    await expect(page).toHaveURL(/\/app\?tenant=.*rings=saved/);
    await expect(page.getByText("Rings saved")).toBeVisible();
    await c.click(page.getByRole("button", { name: "Publish to Pilot" }));
    await expect(page.getByText("Published to Pilot.")).toBeVisible({ timeout: 20_000 });
    expect(c.count).toBeLessThanOrEqual(3);
    expect(problems).toEqual([]);
  });

  test("Mike (MSP owner): the second client tenant leads to an upgrade, not an error", async ({ page, request }) => {
    await signInViaUi(page, request, { org: "Buckeye MSP" });
    await page.request.post(`/api/dev/connect-tenant?name=${encodeURIComponent("Halvorsen Dental")}`, { headers: origin(page) });
    // The stand-in honours plan limits like the real route.
    const second = await page.request.post(`/api/dev/connect-tenant?name=${encodeURIComponent("Second client")}`, { headers: origin(page) });
    expect(second.status()).toBe(402);
    expect((await second.json()).error).toBe("limit_reached");

    await page.goto("/app/tenants");
    await expect(page.getByText("Your Free plan includes 1 tenant, all in use")).toBeVisible();
    await expect(page.getByText(/Starter adds up to 5 tenants for \$24\.99 a month/)).toBeVisible();
    await page.getByRole("link", { name: "Upgrade to Starter" }).click();
    await expect(page).toHaveURL(/\/app\/billing\?plan=starter&interval=month/);
    await expect(page.getByRole("button", { name: "Continue to checkout" })).toBeVisible();
  });

  test("Dan (IT lead): inviting a technician explains the role in the form and the e-mail, and fires member.invited", async ({ page, request }) => {
    await signInViaUi(page, request, { org: "Kestrel Manufacturing" });
    const ep = await page.request.post("/api/webhooks", { data: { url: "https://example.com/dockcrate-hook", events: ["member.invited"] }, headers: origin(page) });
    expect(ep.status()).toBe(201);
    await page.goto("/app/settings/members");
    await expect(page.getByText(/Operator:.*Publishes, rolls back/)).toBeVisible();
    await page.getByLabel("Role").selectOption("viewer");
    await expect(page.getByText(/Viewer:.*Changes nothing/)).toBeVisible();
    await page.getByLabel("Role").selectOption("operator");
    const tech = `tech+${Date.now()}@kestrel.test`;
    await page.getByLabel("Email").fill(tech);
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByText(`Invitation sent to ${tech}`)).toBeVisible();
    const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(tech)}`)).json();
    const mail = box.messages.at(-1).text as string;
    expect(mail).toContain("Cannot connect tenants, change rings");
    expect(mail).toContain("7 days");
    await expect.poll(async () => ((await (await page.request.get("/api/webhooks/deliveries")).json()).deliveries as { event: string }[]).map((d) => d.event)).toContain("member.invited");
  });
});

test.describe("docs work", () => {
  const run = (cmd: string) => execFileSync("bash", ["-c", cmd], { encoding: "utf8", timeout: 20_000 });

  test("the curl after creating a key, and the docs' curl, both answer with the org id; a bad key gives the documented error", async ({ page, request, baseURL }) => {
    await signInViaUi(page, request, { org: "Northwind MSP" });
    await page.goto("/app/settings/api-keys");
    await page.getByLabel("Name").fill("RMM script");
    await page.getByRole("button", { name: "Create key" }).click();
    const snippet = await page.getByLabel("curl command with your key").innerText();
    const key = /x-api-key: (\S+)"/.exec(snippet)![1]!;
    expect(snippet).toContain(`${baseURL}/api/v1/me`);
    const expected = (await page.getByText(/Expected answer:/).innerText()).replace(/^Expected answer:\s*/, "");
    const out = JSON.parse(run(`${snippet} -s`));
    expect(out).toEqual(JSON.parse(expected));
    expect(out.orgId).toBeTruthy();

    // The docs page sample, with the placeholders a reader would replace.
    await page.goto("/docs/authentication");
    const docCurl = await page.locator("pre").filter({ hasText: "curl" }).innerText();
    expect(docCurl).toContain(`${product.url}/api/v1/me`);
    const mine = docCurl.replace(product.url, baseURL!).replace("YOUR_API_KEY", key);
    expect(JSON.parse(run(`${mine} -s`))).toEqual(out);

    // API reference: the documented response shape and error code.
    await page.goto("/docs/api");
    const blocks = await page.locator("pre").allInnerTexts();
    expect(Object.keys(JSON.parse(blocks.find((b) => b.includes("orgId"))!))).toEqual(Object.keys(out));
    const documentedError = JSON.parse(blocks.find((b) => b.includes("invalid_api_key"))!);
    const bad = JSON.parse(run(`${docCurl.replace(product.url, baseURL!).replace("YOUR_API_KEY", "dock_not_a_real_key")} -s`));
    expect(bad).toMatchObject(documentedError);
  });
});

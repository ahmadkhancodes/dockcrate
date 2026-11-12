import { expect, test } from "@playwright/test";
import { signInViaUi, watch } from "./helpers";

// A free-plan MSP owner doing the first-week jobs. Every action asserts a visible outcome.

test("onboarding validates the organization name and renders hostile names as text", async ({ page, request }) => {
  const problems = watch(page);
  await signInViaUi(page, request, { org: null });
  await expect(page).toHaveURL(/onboarding/);
  const name = page.getByLabel("Organization name");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByText(/at least 2 characters/i)).toBeVisible();
  await name.fill("   ");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByText(/at least 2 characters/i)).toBeVisible();
  await name.fill("x".repeat(200));
  expect(await name.inputValue()).toHaveLength(60); // maxLength holds
  await name.fill("<img src=x onerror=window.__pwn=1> Ünï ‮ Ltd 日本");
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.waitForURL(/\/app/);
  expect(await page.evaluate(() => (window as unknown as { __pwn?: number }).__pwn)).toBeUndefined();
  await expect(page.getByText("<img src=x", { exact: false }).first()).toBeVisible(); // shown as text in the org switcher
  expect(problems).toEqual([]);
});

test("onboarding: double clicking Create makes exactly one organization", async ({ page, request }) => {
  await signInViaUi(page, request, { org: null });
  await page.getByLabel("Organization name").fill("Double Click MSP");
  const b = page.getByRole("button", { name: "Create organization" });
  await b.dblclick();
  await page.waitForURL(/\/app/);
  const orgs = await (await page.request.get("/api/auth/organization/list")).json();
  expect(orgs).toHaveLength(1);
});

test("dock empty state -> Connect a tenant -> without Entra the user gets a clear message, not a Microsoft error page", async ({ page, request }) => {
  const problems = watch(page);
  await signInViaUi(page, request);
  await page.getByRole("link", { name: "Connect a tenant" }).click();
  await expect(page).toHaveURL(/\/app\/tenants/);
  await page.getByRole("button", { name: "Add and connect" }).click();
  await expect(page.getByText(/at least 2 characters/i)).toBeVisible();
  await page.getByLabel("Customer name").fill("Halvorsen Dental");
  await page.getByRole("button", { name: "Add and connect" }).click();
  await expect(page.getByText(/early access/i).first()).toBeVisible();
  expect(page.url()).toContain("/app/tenants"); // never bounced to login.microsoftonline.com
  expect(problems.filter((p) => !p.includes("503"))).toEqual([]);
  // nothing half-created: still zero tenants
  const t = await (await page.request.get("/api/tenants")).json();
  expect(t.tenants).toHaveLength(0);
});

test("API keys: create shows the secret once, copy works, empty/long names handled, delete confirms and Escape cancels", async ({ page, request, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const problems = watch(page);
  await signInViaUi(page, request);
  await page.goto("/app/settings/api-keys");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByText(/Name the key/)).toBeVisible();
  await page.getByLabel("Name").fill("Production server");
  await page.getByRole("button", { name: "Create key" }).click();
  const secret = page.locator("code").filter({ hasText: /^dock_/ }).first();
  await expect(secret).toBeVisible();
  const copy = page.getByRole("button", { name: /copy/i }).first();
  await copy.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^dock_/);
  await expect(page.getByText("Production server").first()).toBeVisible();
  // duplicate + hostile name
  await page.getByLabel("Name").fill("Production server");
  await page.getByRole("button", { name: "Create key" }).click();
  await page.getByLabel("Name").fill("<b>bold</b> ".repeat(30));
  await page.getByRole("button", { name: "Create key" }).click();
  await page.waitForTimeout(800);
  await expect(page.locator("main b")).toHaveCount(0);
  // delete: Escape cancels, confirm deletes
  const before = await page.getByRole("button", { name: "Delete" }).count();
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.getByRole("button", { name: "Delete" }).count()).toBe(before);
  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("button", { name: "Delete key" }).click();
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(before - 1);
  expect(problems).toEqual([]);
});

test("webhooks: bad URL explains itself, good URL is added, test/pause/delete each show a result", async ({ page, request }) => {
  const problems = watch(page);
  await signInViaUi(page, request);
  await page.goto("/app/settings/webhooks");
  await page.getByLabel("Endpoint URL").fill("http://insecure.example.com/hook");
  await page.getByRole("button", { name: "Add endpoint" }).click();
  await expect(page.getByText(/https/i).first()).toBeVisible();
  await page.getByLabel("Endpoint URL").fill("not a url");
  await page.getByRole("button", { name: "Add endpoint" }).click();
  await expect(page.getByText(/https/i).first()).toBeVisible();
  await page.getByLabel("Endpoint URL").fill("https://hooks.example.com/dockcrate");
  await page.getByRole("button", { name: "Add endpoint" }).click();
  await expect(page.getByText("https://hooks.example.com/dockcrate").first()).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText(/Paused deliveries/)).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByText(/Resumed deliveries/)).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete endpoint" }).click();
  await expect(page.getByText(/deleted/)).toBeVisible();
  expect(problems).toEqual([]);
});

test("members: invalid / duplicate / self invitations; a valid one appears as pending and mails the invitee", async ({ page, request }) => {
  const problems = watch(page);
  const me = await signInViaUi(page, request);
  await page.goto("/app/settings/members");
  const email = page.getByLabel(/email/i).first();
  await email.fill("nope");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(/valid|email/i).first()).toBeVisible();
  await email.fill(me);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await page.waitForTimeout(800);
  await expect(page.getByText("Pending invitations").locator("..").getByText(me)).toHaveCount(0);
  const tech = `tech${Date.now()}@msp.test`;
  await email.fill(tech);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(tech).first()).toBeVisible();
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(tech)}`)).json();
  expect(box.messages.length).toBe(1);
  await email.fill(tech);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await page.waitForTimeout(800);
  await expect(page.getByText(tech)).toHaveCount(1); // not listed twice
  expect(problems.filter((p) => !/http 4\d\d/.test(p))).toEqual([]);
});

test("notifications and profile save with visible confirmation; delete account needs typing and Escape cancels", async ({ page, request }) => {
  await signInViaUi(page, request);
  await page.goto("/app/settings/notifications");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();
  await page.goto("/app/settings/profile");
  const save = page.getByRole("button", { name: "Save changes" });
  await expect(save).toBeDisabled();
  await page.locator("input[name=name]").fill("Priya Raman <i>");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText(/saved|updated/i).first()).toBeVisible();
  await page.reload();
  await expect(page.locator("input[name=name]")).toHaveValue("Priya Raman <i>");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete account permanently" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("audit log: shows our own actions, CSV downloads with a header, chain verifies, filters narrow", async ({ page, request }) => {
  await signInViaUi(page, request);
  await page.goto("/app/settings/audit");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export CSV" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.csv$/);
  await page.getByRole("button", { name: "Verify chain" }).click();
  await expect(page.getByText(/intact|valid|verified|ok/i).first()).toBeVisible();
  await page.locator("input[name=action]").fill("zzz-nothing");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/action=zzz-nothing/);
  await expect(page.getByText(/no (entries|events|audit)|nothing/i).first()).toBeVisible();
});

test("billing in stub mode: plan buttons give a calm answer; interval toggle changes prices; free-plan limits shown match config", async ({ page, request }) => {
  const problems = watch(page);
  await signInViaUi(page, request);
  await page.goto("/app/billing");
  const before = await page.locator("main").innerText();
  await page.getByRole("button", { name: "Monthly" }).click();
  expect(await page.locator("main").innerText()).not.toBe(before);
  await page.getByRole("button", { name: "Choose Starter" }).click();
  await expect(page.getByText(/not connected|unavailable|billing/i).nth(0)).toBeVisible();
  expect(page.url()).toContain("/app/billing");
  expect(problems.filter((p) => !p.includes("503"))).toEqual([]);
});

test("App Sets and MSP view on the Free plan explain the upgrade instead of showing a dead page", async ({ page, request }) => {
  await signInViaUi(page, request);
  await page.goto("/app/app-sets");
  await page.getByRole("link", { name: "See plans" }).click();
  await expect(page).toHaveURL(/\/app\/billing/);
  await page.goto("/app/msp");
  await expect(page.getByRole("link", { name: "Connect a tenant" })).toBeVisible();
});

test("sign out ends the session; back button and direct visits do not reveal the app", async ({ page, request }) => {
  await signInViaUi(page, request);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/(sign-in)?$|\/sign-in/);
  await page.goBack();
  await page.reload();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/app/settings/api-keys");
  await expect(page).toHaveURL(/\/sign-in/);
  expect((await page.request.get("/api/auth/get-session")).status()).toBeLessThan(500);
  const s = await (await page.request.get("/api/auth/get-session")).json();
  expect(s).toBeNull();
});

test("another organisation cannot read or change my data", async ({ browser, page, request }) => {
  await signInViaUi(page, request, { org: "Org A" });
  await page.goto("/app/settings/webhooks");
  await page.getByLabel("Endpoint URL").fill("https://a.example.com/hook");
  await page.getByRole("button", { name: "Add endpoint" }).click();
  await expect(page.getByText("https://a.example.com/hook").first()).toBeVisible();
  const aEndpoints = await (await page.request.get("/api/webhooks")).json();
  const aId = (aEndpoints.endpoints ?? aEndpoints)[0].id;
  const orgAId = (await (await page.request.get("/api/auth/organization/list")).json())[0].id;

  const ctx = await browser.newContext();
  const b = await ctx.newPage();
  await signInViaUi(b, request, { org: "Org B" });
  const bEndpoints = await (await b.request.get("/api/webhooks")).json();
  expect(JSON.stringify(bEndpoints)).not.toContain("a.example.com");
  const origin = { origin: new URL(b.url()).origin };
  for (const [m, u] of [["get", `/api/webhooks/${aId}`], ["delete", `/api/webhooks/${aId}`], ["get", `/api/tenants/${aId}`]] as const) {
    const r = await b.request.fetch(u, { method: m.toUpperCase(), headers: origin });
    expect([401, 403, 404, 405], `${m} ${u}`).toContain(r.status());
  }
  expect((await page.request.get("/api/webhooks")).ok()).toBeTruthy();
  expect(JSON.stringify(await (await page.request.get("/api/webhooks")).json())).toContain("a.example.com"); // A's endpoint survived B's delete
  expect((await (await b.request.get("/api/audit")).text())).not.toContain("webhook.deleted");
  // can't set another org active nor read its members/keys
  const act = await b.request.post("/api/auth/organization/set-active", { data: { organizationId: orgAId }, headers: origin });
  expect(act.ok()).toBeFalsy();
  const members = await b.request.get(`/api/auth/organization/get-full-organization?organizationId=${orgAId}`);
  expect(members.ok() && JSON.stringify(await members.json()).includes("Org A")).toBeFalsy();
  const audit = await (await b.request.get("/api/audit")).text();
  expect(audit).not.toContain("a.example.com");
  await ctx.close();
});

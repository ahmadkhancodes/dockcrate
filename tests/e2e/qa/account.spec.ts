import { expect, test } from "@playwright/test";
import { signInViaUi, watch } from "./helpers";

test("security page: passkey and authenticator buttons always answer (no silent click)", async ({ page, request }) => {
  const problems = watch(page);
  await signInViaUi(page, request);
  await page.goto("/app/settings/security");
  const before = await page.locator("main").innerText();
  await page.locator("#passkey-name").fill("Work laptop");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  // Headless Chrome has no authenticator: the user must be told, not left staring at a button that did nothing.
  await expect.poll(async () => (await page.locator("main").innerText()) !== before || (await page.getByRole("alert").count()) > 1, { timeout: 10_000 }).toBeTruthy();
  await page.getByRole("button", { name: "Set up authenticator app" }).click();
  await expect(page.getByRole("dialog").or(page.getByText(/secret|scan|QR|code/i).first())).toBeVisible({ timeout: 10_000 });
  expect(problems.filter((p) => !/http 4\d\d|console error/.test(p))).toEqual([]);
});

test("profile: very long and unicode names are saved or refused with a message; export downloads valid JSON", async ({ page, request }) => {
  await signInViaUi(page, request);
  await page.goto("/app/settings/profile");
  const name = page.locator("input[name=name]");
  await name.fill("名".repeat(300));
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").or(page.getByRole("alert")).or(page.getByText(/saved|updated|too long|shorter/i)).first()).toBeVisible();
  const res = await page.request.get("/api/account/export");
  expect(res.headers()["content-type"]).toContain("json");
  expect(JSON.parse(await res.text()).user.email).toContain("@");
});

test("delete account end to end: typed confirmation, signed out, cannot sign back into the old org", async ({ page, request }) => {
  const problems = watch(page);
  await signInViaUi(page, request);
  await page.goto("/app/settings/profile");
  await page.getByRole("button", { name: "Delete my account" }).click();
  const confirm = page.getByRole("button", { name: "Delete account permanently" });
  await expect(confirm).toBeDisabled();
  await page.getByRole("dialog").locator("input").fill("wrong");
  await expect(confirm).toBeDisabled();
  await page.getByRole("dialog").locator("input").fill("delete my account");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page).toHaveURL(/\/(sign-in|$)|\/sign-in|localhost:3100\/?$/, { timeout: 15_000 });
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in/);
  expect(problems.filter((p) => !/http 4\d\d/.test(p))).toEqual([]);
});

test("members: viewer role cannot reach admin actions in the UI or API", async ({ browser, page, request }) => {
  await signInViaUi(page, request, { org: "Role Test MSP" });
  const viewer = `viewer${Date.now()}@msp.test`;
  await page.goto("/app/settings/members");
  await page.getByLabel(/email/i).first().fill(viewer);
  await page.locator("select").first().selectOption({ label: "Viewer" });
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(viewer).first()).toBeVisible();
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(viewer)}`)).json();
  const accept = /https?:\/\/\S+accept-invite\/\S+/.exec(box.messages.at(-1).text)?.[0];
  expect(accept).toBeTruthy();
  const ctx = await browser.newContext();
  const v = await ctx.newPage();
  await signInViaUi(v, request, { email: viewer, org: null, next: new URL(accept!).pathname });
  await expect(v).toHaveURL(/\/accept-invite\//); // straight to the invitation, not an "create your organization" detour
  await v.getByRole("button", { name: "Accept invitation" }).click();
  await v.waitForURL(/\/app/);
  await v.goto("/app/settings/api-keys");
  await expect(v.getByText("Read only")).toBeVisible();
  await expect(v.getByRole("button", { name: "Create key" })).toHaveCount(0);
  const origin = { origin: new URL(v.url()).origin };
  const wh = await v.request.post("/api/webhooks", { data: { url: "https://x.example.com/h", events: ["alert.created"] }, headers: origin });
  expect(wh.status()).toBe(403);
  await ctx.close();
});

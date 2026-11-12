import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Sign in through the real sign-in form and the e-mail outbox, then create an org through the real onboarding form. */
export async function signInViaUi(page: Page, request: APIRequestContext, opts: { email?: string; org?: string | null; next?: string } = {}) {
  const email = opts.email ?? `qa+${Date.now()}${Math.floor(Math.random() * 1e4)}@msp.test`;
  // Each simulated person gets their own client IP so Better Auth's per-IP magic link limit (5 per minute) does not couple specs.
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  await page.goto(opts.next ? `/sign-in?next=${encodeURIComponent(opts.next)}` : "/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(`Check your inbox at ${email}`)).toBeVisible();
  const link = await magicLink(request, email);
  await page.goto(link);
  if (opts.org !== null) {
    await expect(page).toHaveURL(/onboarding/);
    await page.getByLabel("Organization name").fill(opts.org ?? "Northwind MSP");
    await page.getByRole("button", { name: "Create organization" }).click();
    await page.waitForURL(/\/app/);
  }
  return email;
}

export async function magicLink(request: APIRequestContext, email: string) {
  let link: string | undefined;
  for (let i = 0; i < 20 && !link; i++) {
    const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
    link = /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1)?.text ?? "")?.[0];
    if (!link) await new Promise((r) => setTimeout(r, 250));
  }
  expect(link, "magic link in outbox").toBeTruthy();
  return link!;
}

/** Collects console errors, page errors and failed/blocked requests so a spec can assert the page was clean. */
export function watch(page: Page, step: () => string = () => "") {
  const problems: string[] = [];
  const at = () => `${page.url().replace(/^https?:\/\/[^/]+/, "")}${step() ? ` [${step()}]` : ""}`;
  const noise = (url: string) => url.includes("/_vercel/") || url.includes("_rsc="); // Vercel analytics only exists on Vercel; aborted RSC prefetches are navigations cancelling them
  page.on("console", (m) => {
    if (/_vercel\/insights|MIME type|Failed to load resource/.test(m.text())) return;
    if (m.type() === "error" || /hydrat|Content Security Policy/i.test(m.text())) problems.push(`${at()} console ${m.type()}: ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => problems.push(`${at()} pageerror: ${e.message.slice(0, 200)}`));
  page.on("requestfailed", (r) => !noise(r.url()) && problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  page.on("response", (r) => {
    if (r.status() >= 400 && !noise(r.url()) && !r.url().includes("/api/auth/get-session")) problems.push(`http ${r.status()}: ${r.url()}`);
  });
  return problems;
}

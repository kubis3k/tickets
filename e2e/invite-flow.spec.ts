import { expect, test } from "@playwright/test";
import { cs } from "../lib/i18n/cs";
import { adminCredentials, e2eBaseUrl } from "./helpers/env";
import { extractInvitePath, waitForOutboxMessage } from "./helpers/outbox";

test.skip(process.env.E2E !== "1", "E2E=1 zapíná e2e testy");

test("admin založí organizaci, pozve ownera, owner přijme pozvánku a cizí organizaci nevidí", async ({
  page,
  browser,
}) => {
  const stamp = Date.now();
  const slug = `e2e-${stamp}`;
  const orgName = `E2E organizace ${stamp}`;
  const ownerEmail = `e2e+${stamp}@example.com`;
  const { email, password } = adminCredentials();

  // 1) platform admin se přihlásí heslem
  await page.goto("/login");
  await page.locator("#pw-email").fill(email);
  await page.locator("#pw-password").fill(password);
  await page.getByRole("button", { name: cs.auth.signIn }).click();
  await page.waitForURL(/\/admin/);

  // 2) založí organizaci
  await page.goto("/admin/platform/organizations/new");
  await page.locator("#org-slug").fill(slug);
  await page.locator("#org-name").fill(orgName);
  await page.getByRole("button", { name: cs.platform.create }).click();
  await page.waitForURL(/\/admin\/platform\/organizations\/[0-9a-f-]{36}$/);

  // 3) pozve ownera
  await page.locator("#invite-email").fill(ownerEmail);
  await page.locator("#invite-role").selectOption("owner");
  await page.getByRole("button", { name: cs.platform.invite, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: cs.invitations.inviteSent })).toBeVisible();

  // 4) odkaz z e-mailu (outbox driver)
  const invitePath = extractInvitePath(await waitForOutboxMessage(ownerEmail));

  // 5) čistý prohlížeč: owner otevře odkaz a nastaví heslo
  const ownerContext = await browser.newContext({ baseURL: e2eBaseUrl() });
  try {
    const owner = await ownerContext.newPage();
    await owner.goto(invitePath);
    await owner.locator("#invite-password").fill(`E2e-${stamp}-heslo!`);
    await owner.getByRole("button", { name: cs.invitations.createAndAccept }).click();
    await owner.waitForURL(`**/admin/${slug}`);
    await expect(
      owner.getByRole("heading", { name: cs.orgAdmin.dashboardTitle(orgName) }),
    ).toBeVisible();

    // 6) cizí organizace neexistuje (404, ne 403)
    const foreign = await owner.goto("/admin/3lwave");
    expect(foreign?.status()).toBe(404);
  } finally {
    await ownerContext.close();
  }
});

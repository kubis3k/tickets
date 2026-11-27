import { test, expect } from "@playwright/test";

test.skip(process.env.E2E !== "1", "E2E=1 zapíná e2e testy");

test("health check vrací ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true });
});

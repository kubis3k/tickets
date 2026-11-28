import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Playwright `.env.local` sám nenačítá. Nic se nevypisuje.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const baseURL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: `${baseURL}/api/health`,
    // Pozor: už běžící dev server bez EMAIL_DRIVER=outbox e2e rozbije (e-mail by odešel přes Resend).
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { EMAIL_DRIVER: "outbox", E2E: "1" },
  },
});

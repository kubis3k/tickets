import { beforeEach, describe, expect, it } from "vitest";
import { EnvValidationError, getServerEnv, resetServerEnvCache } from "./env";
import { getClientEnv, resetClientEnvCache } from "./env.client";

const validServer = {
  DATABASE_URL: "postgresql://u:secret-pass@host:6543/db",
  DIRECT_URL: "postgresql://u:secret-pass@host:5432/db",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
  RESEND_API_KEY: "re_secret",
  EMAIL_FROM: "tickets@example.com",
  PLATFORM_ADMIN_EMAIL: "admin@example.com",
};

const validClient = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
};

beforeEach(() => {
  resetServerEnvCache();
  resetClientEnvCache();
});

describe("getServerEnv", () => {
  it("projde s validní konfigurací a doplní default EMAIL_DRIVER", () => {
    const env = getServerEnv(validServer);
    expect(env.EMAIL_DRIVER).toBe("resend");
    expect(env.SEED_ADMIN_PASSWORD).toBeUndefined();
  });

  it("chybějící proměnná -> chyba s názvem", () => {
    const { RESEND_API_KEY: _omit, ...rest } = validServer;
    void _omit;
    expect(() => getServerEnv(rest)).toThrow(/RESEND_API_KEY/);
  });

  it("nevalidní proměnná -> chyba s názvem, bez hodnoty", () => {
    const bad = { ...validServer, PLATFORM_ADMIN_EMAIL: "not-an-email-SECRETVALUE" };
    try {
      getServerEnv(bad);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(EnvValidationError);
      const msg = (e as Error).message;
      expect(msg).toContain("PLATFORM_ADMIN_EMAIL");
      expect(msg).not.toContain("SECRETVALUE");
    }
  });

  it("nevalidní EMAIL_DRIVER selže", () => {
    expect(() => getServerEnv({ ...validServer, EMAIL_DRIVER: "smtp" })).toThrow(/EMAIL_DRIVER/);
  });

  it("chyba nikdy neobsahuje hodnoty ostatních proměnných", () => {
    try {
      getServerEnv({ ...validServer, DIRECT_URL: "" });
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("DIRECT_URL");
      expect(msg).not.toContain("secret");
    }
  });

  it("SKIP_ENV_VALIDATION=1 přeskočí validaci", () => {
    expect(() => getServerEnv({ SKIP_ENV_VALIDATION: "1" })).not.toThrow();
  });
});

describe("getClientEnv", () => {
  it("projde s validní konfigurací", () => {
    expect(getClientEnv(validClient).NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("nevalidní URL -> chyba s názvem", () => {
    expect(() => getClientEnv({ ...validClient, NEXT_PUBLIC_SUPABASE_URL: "nope" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });
});

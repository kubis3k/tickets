import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "@react-email/components";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { brand } from "@/lib/config/brand";
import { createOutboxDriver } from "./drivers/outbox";
import { sendEmail } from "./send";
import { Invite } from "./templates/Invite";

const url = "https://app.example.test/invite/abcDEF123_-token";
const props = {
  orgName: "Pořadatel <&> s.r.o.",
  role: "owner" as const,
  inviteUrl: url,
  expiresAt: new Date("2026-12-04T12:00:00Z"),
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "outbox-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("Invite šablona", () => {
  it("obsahuje org, odkaz, roli, platnost a brand; název org je escapovaný", async () => {
    const html = await render(createElement(Invite, props));
    const text = await render(createElement(Invite, props), { plainText: true });
    expect(html).toContain("Pořadatel &lt;&amp;&gt; s.r.o.");
    expect(html).not.toContain("<&>");
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain(brand.name);
    expect(html).toContain("vlastník");
    expect(html).toContain("4. prosince 2026");
    expect(text).toContain(url);
    expect(text).toContain("Pořadatel <&> s.r.o.");
  });
});

describe("outbox driver", () => {
  it("zapíše JSON soubor <timestamp>-<to>.json s to, subject, html, text", async () => {
    const driver = createOutboxDriver(dir);
    const { id } = await driver.send({
      to: "Jan@Example.test",
      subject: "S",
      html: "<p>h</p>",
      text: "t",
    });
    const files = await readdir(dir);
    expect(files).toEqual([`${id}.json`]);
    expect(files[0]).toMatch(/^\d+-jan@example\.test\.json$/);
    const body = JSON.parse(await readFile(join(dir, files[0] as string), "utf8")) as Record<
      string,
      string
    >;
    expect(body).toEqual({ to: "Jan@Example.test", subject: "S", html: "<p>h</p>", text: "t" });
  });

  it("dvě zprávy na stejnou adresu se nepřepíšou", async () => {
    const driver = createOutboxDriver(dir);
    await Promise.all([
      driver.send({ to: "a@b.test", subject: "1", html: "", text: "" }),
      driver.send({ to: "a@b.test", subject: "2", html: "", text: "" }),
    ]);
    expect(await readdir(dir)).toHaveLength(2);
  });

  it("neprojde path traversal přes adresu", async () => {
    const driver = createOutboxDriver(dir);
    await driver.send({ to: "../../x@b.test", subject: "1", html: "", text: "" });
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).not.toContain("/");
  });
});

describe("sendEmail", () => {
  it("vyrenderuje šablonu a předá ji driveru (html + text)", async () => {
    const driver = createOutboxDriver(dir);
    await sendEmail(
      { to: "x@y.test", subject: "Předmět", react: createElement(Invite, props) },
      driver,
    );
    const [file] = await readdir(dir);
    const body = JSON.parse(await readFile(join(dir, file as string), "utf8")) as Record<
      string,
      string
    >;
    expect(body.subject).toBe("Předmět");
    expect(body.html).toContain(url);
    expect(body.text).toContain(url);
  });
});

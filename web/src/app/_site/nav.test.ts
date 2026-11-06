import { test } from "node:test";
import assert from "node:assert/strict";
import { REPO_URL } from "../../lib/site.ts";
import { FOOTER_LINKS, SITE_CTA, siteNav } from "./nav.ts";

test("header nav is exactly: Genesis Drop, Docs, GitHub, then the Add Watermark pill", () => {
  for (const passLive of [true, false]) {
    assert.deepEqual(
      siteNav(passLive).map((i) => [i.label, i.href]),
      [
        ["Genesis Drop", "/pass"],
        ["Docs", "/docs"],
        ["GitHub", REPO_URL],
      ],
    );
  }
  assert.equal(REPO_URL, "https://github.com/Prashant-Mishra-12569/watermark");
  assert.deepEqual(SITE_CTA, { href: "/#add", label: "Add Watermark" });
});

test("footer links follow SITE_FINAL: Genesis Drop, Bot test, GitHub, Docs, Credits", () => {
  assert.deepEqual(
    FOOTER_LINKS.map((i) => i.label),
    ["Genesis Drop", "Bot test", "GitHub", "Docs", "Credits"],
  );
  assert.equal(FOOTER_LINKS.find((i) => i.label === "Docs")?.href, "/docs");
});

test("retired pages are never linked: no /dev, /sponsor or /verify in the header or footer", () => {
  for (const item of [...siteNav(true), SITE_CTA, ...FOOTER_LINKS])
    assert.ok(!/^\/(dev|sponsor|verify)\b/u.test(item.href), `${item.label} → ${item.href}`);
});

test("labels carry no arrows (PillButton and ExternalLink draw them); external means http(s)", () => {
  for (const item of [...siteNav(true), SITE_CTA, ...FOOTER_LINKS]) {
    assert.doesNotMatch(item.label, /[↗→]/u);
    assert.equal(Boolean(item.external), /^https:\/\//u.test(item.href), item.label);
    if (!item.external) assert.ok(item.href.startsWith("/"), `${item.href} is absolute`);
  }
});

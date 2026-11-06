import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { DRAWN_IN_CODE, FONT_CREDITS } from "./credits-data.ts";

const layout = readFileSync(new URL("../layout.tsx", import.meta.url), "utf8");
const publicDir = new URL("../../../public/", import.meta.url);

function filesUnder(dir: URL): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    const url = new URL(name, dir);
    return statSync(url).isDirectory() ? filesUnder(new URL(`${name}/`, dir)) : [url.pathname];
  });
}

test("/credits lists exactly the fonts layout.tsx loads", () => {
  const imported = /import\s*\{([^}]*)\}\s*from\s*"next\/font\/google"/.exec(layout)?.[1] ?? "";
  const fonts = imported
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  assert.ok(fonts.length > 0, "layout.tsx loads no next/font/google fonts");
  assert.deepEqual(FONT_CREDITS.map((f) => f.nextFontExport).sort(), [...fonts].sort());
  assert.doesNotMatch(layout, /next\/font\/local/, "a local font file needs its own credit");
});

test("every credit links over https and names its licence", () => {
  for (const f of FONT_CREDITS) {
    assert.match(f.source, /^https:\/\//, f.name);
    assert.match(f.licenceUrl, /^https:\/\//, f.name);
    assert.ok(f.licence && f.by && f.usedFor, f.name);
  }
  assert.ok(DRAWN_IN_CODE.length > 0);
});

/** The contract's own picture for token <id> (contracts/script/pass-art/generator.mjs writes these fixtures). */
const passFixture = (id: number) => new URL(`../../../../contracts/test/fixtures/pass-svg/${id}.svg`, import.meta.url);

test("the only image files the site ships are Genesis Drop stamps, byte for byte the contract's own picture", () => {
  // So the page's "every picture is drawn in code" stays true: anything else needs a credit in credits-data.ts (and
  // a new lead on the page) first.
  const images = filesUnder(publicDir).filter((p) => /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(p));
  for (const path of images) {
    // Our own logo (credited in DRAWN_IN_CODE): exactly these four files.
    if (/\/brand\/(mark(-white)?\.svg|lockup(-white)?\.png)$/u.test(path)) continue;
    const m = /\/assets\/stamps\/stamp-(\d{3})\.svg$/u.exec(path);
    assert.ok(m, `${path}: add a credit to credits-data.ts before adding an image`);
    const id = Number(m[1]);
    assert.ok(id >= 1 && id <= 100, `${path}: the drop has tokens 1 to 100`);
    assert.equal(readFileSync(path, "utf8"), readFileSync(passFixture(id), "utf8"), `${path} is not the contract's picture`);
  }
});

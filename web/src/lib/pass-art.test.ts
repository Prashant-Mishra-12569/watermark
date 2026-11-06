import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { svg as generatorSvg } from "../../../contracts/script/pass-art/generator.mjs";
import { isSvgDataUri } from "./genesis-pass.ts";
import {
  PASS_ART_HEIGHT,
  PASS_ART_WIDTH,
  PASS_PLATES,
  passArtDataUri,
  passArtEdition,
  passArtId,
  passPlate,
  svg,
} from "./pass-art.ts";

const fixture = (id: number) => new URL(`../../../contracts/test/fixtures/pass-svg/${id}.svg`, import.meta.url);
const renderer = readFileSync(new URL("../../../contracts/src/WatermarkPassRenderer.sol", import.meta.url), "utf8");
const decode = (uri: string) => Buffer.from(uri.split(",")[1]!, "base64").toString("utf8");

// The first and last of each plate, the hero's #042, and both ends of the drop.
const IDS = [1, 2, 21, 41, 42, 61, 81, 99, 100];

test("svg(id) is byte for byte the generator's output (the art the contract stores)", () => {
  for (const id of IDS) {
    const expected = generatorSvg(id);
    assert.equal(svg(id), expected, `token ${id} vs generator.mjs`);
    if (existsSync(fixture(id))) assert.equal(svg(id), readFileSync(fixture(id), "utf8"), `token ${id} vs fixture`);
  }
  for (let id = 1; id <= 100; id++) assert.equal(svg(id), generatorSvg(id), `token ${id}`);
  // The same for 42, 42n and "42".
  assert.equal(svg(42n), svg(42));
  assert.equal(svg("42"), svg(42));
});

test("svg(id) carries the edition, the plate and a postmark placed from the id", () => {
  const s42 = svg(42);
  assert.ok(s42.startsWith(`<svg xmlns="http://www.w3.org/2000/svg"`));
  assert.ok(s42.includes(`viewBox="0 0 ${PASS_ART_WIDTH} ${PASS_ART_HEIGHT}"`));
  assert.ok(s42.endsWith("</svg>"));
  assert.ok(s42.includes(">042</text>"));
  assert.ok(s42.includes(">BANDRA&#8211;WORLI SEA LINK</text>"));
  assert.ok(svg(7).includes(">007</text>"));
  assert.ok(svg(100).includes(">100</text>"));
  assert.ok(svg(1).includes(">GATEWAY OF INDIA</text>"));
  assert.ok(svg(20).includes(">GATEWAY OF INDIA</text>"));
  assert.ok(svg(21).includes(">RAJABAI CLOCK TOWER</text>"));
  assert.ok(svg(61).includes(">CHHATRAPATI SHIVAJI TERMINUS</text>"));
  assert.ok(svg(81).includes(">MARINE DRIVE &#183; QUEEN&#8217;S NECKLACE</text>"));
  assert.ok(s42.includes("FEE PAID"));
  // The postmark moves with the id.
  const postmark = (s: string) => s.match(/<g transform="(translate\(\d{3} \d{3}\) rotate\(\d{3}\))"/)?.[1];
  assert.ok(postmark(svg(1)));
  assert.notEqual(postmark(svg(1)), postmark(svg(2)));
});

test("the art loads nothing and is ASCII only", () => {
  for (const id of IDS) {
    const s = svg(id);
    assert.ok(/^[\x20-\x7e]*$/.test(s), `token ${id} is ASCII`);
    // Only the two namespace URLs; every href and url() points inside the document.
    assert.deepEqual(
      [...new Set(s.match(/https?:\/\/[^"]+/g))].sort(),
      ["http://www.w3.org/1999/xlink", "http://www.w3.org/2000/svg"],
    );
    for (const [, ref] of s.matchAll(/href="([^"]*)"/g)) assert.match(ref!, /^#[a-z]$/);
    for (const [, ref] of s.matchAll(/url\(([^)]*)\)/g)) assert.match(ref!, /^#[a-z]$/);
    assert.ok(!/<script|on[a-z]+=|<foreignObject|<image/i.test(s));
  }
});

test("only token ids 1..100 have art", () => {
  for (const bad of [0, 101, 1.5, -1, Number.NaN]) assert.throws(() => svg(bad), RangeError, String(bad));
  assert.throws(() => svg("x"), RangeError);
  assert.equal(passArtId(42), 42);
  assert.equal(passArtId("42"), 42);
  assert.equal(passArtId(42n), 42);
  assert.equal(passArtId("100"), 100);
  for (const bad of ["0", "101", "042", "4x", "", " 4", "1e1", null, undefined, 1000]) assert.equal(passArtId(bad), null);
  assert.equal(passArtEdition(7), "007");
  assert.equal(passArtEdition("42"), "042");
  assert.equal(passArtEdition(100n), "100");
});

test("the five plates are the renderer's landmarks, 20 tokens each", () => {
  assert.equal(PASS_PLATES.length, 5);
  PASS_PLATES.forEach((p, i) => {
    assert.equal(p.first, i * 20 + 1);
    assert.equal(p.last, i * 20 + 20);
    // WatermarkPassRenderer.landmark() returns these names (the NFT's "Landmark" trait).
    assert.ok(renderer.includes(`return "${p.landmark}";`), p.landmark);
    assert.equal(passPlate(p.first), p);
    assert.equal(passPlate(p.last), p);
  });
  assert.equal(passPlate("42").landmark, "Bandra-Worli Sea Link");
  assert.throws(() => passPlate(0), RangeError);
});

test("passArtDataUri is a base64 SVG the page accepts, decoding to svg(id)", () => {
  for (const id of IDS) {
    const uri = passArtDataUri(id);
    assert.ok(isSvgDataUri(uri), `token ${id}`);
    assert.equal(decode(uri), svg(id));
  }
  assert.equal(passArtDataUri("42"), passArtDataUri(42));
  assert.throws(() => passArtDataUri(0), RangeError);
});

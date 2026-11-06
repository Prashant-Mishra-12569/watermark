import assert from "node:assert/strict";
import { test } from "node:test";
import { DROP_URL, landmarkFor, shareOnXUrl, shareText, tokenLabel, X_HANDLE } from "./claim-share.ts";

test("landmarks follow the renderer: 20 stamps each, in order", () => {
  assert.equal(landmarkFor(1), "Gateway of India");
  assert.equal(landmarkFor(20), "Gateway of India");
  assert.equal(landmarkFor(21), "Rajabai Clock Tower");
  assert.equal(landmarkFor(42), "Bandra-Worli Sea Link");
  assert.equal(landmarkFor(61), "Chhatrapati Shivaji Terminus");
  assert.equal(landmarkFor(100), "Marine Drive");
  assert.throws(() => landmarkFor(0), RangeError);
  assert.throws(() => landmarkFor(101), RangeError);
});

test("token labels are zero-padded", () => {
  assert.equal(tokenLabel(1), "#001");
  assert.equal(tokenLabel(42), "#042");
  assert.equal(tokenLabel(100), "#100");
});

test("the post tags us once, names the stamp and fits in a post with its link", () => {
  for (const id of [1, 42, 61, 100]) {
    const text = shareText(id);
    assert.equal(text.split(`@${X_HANDLE}`).length - 1, 1);
    assert.ok(text.includes(tokenLabel(id)));
    // X counts any link as 23 characters, plus one separator.
    assert.ok(text.length + 24 <= 280, `post for ${id} is ${text.length} chars`);
  }
});

test("the share link is an X intent with the text and the drop url", () => {
  const u = new URL(shareOnXUrl(42));
  assert.equal(u.origin + u.pathname, "https://x.com/intent/post");
  assert.equal(u.searchParams.get("url"), DROP_URL);
  assert.ok(u.searchParams.get("text")?.includes("#042"));
});

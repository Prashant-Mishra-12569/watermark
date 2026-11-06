import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_APPS, resolveDemoApp } from "./demo-apps.ts";

test("short demo names map to their app ids; anything else passes through", () => {
  assert.equal(resolveDemoApp("001"), DEMO_APPS["001"]);
  assert.equal(resolveDemoApp("003"), DEMO_APPS["003"]);
  assert.equal(resolveDemoApp("12345"), "12345");
  assert.equal(resolveDemoApp(null), null);
  for (const id of Object.values(DEMO_APPS)) assert.match(id, /^\d{60,76}$/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MCP_TOOLS } from "../_builders/mcp-data.ts";
import { BACKEND_CHECK, CUSTOMIZE_ROWS, LIVE_VERIFY_LINK, MCP_TOOL_ROWS, RELAYER_SETTINGS, TOC } from "./docs-data.ts";

const repoFile = (path: string) => readFileSync(new URL(`../../../../${path}`, import.meta.url), "utf8");
const docs = repoFile("web/public/watermark.txt");
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("the tools table lists exactly the 12 MCP tools, once each", () => {
  assert.deepEqual(MCP_TOOL_ROWS.map((r) => r.tool).sort(), [...MCP_TOOLS].sort());
});

test("every relayer setting is a real environment name in relayer/src/config.ts", () => {
  const config = repoFile("relayer/src/config.ts");
  for (const s of RELAYER_SETTINGS) assert.match(config, new RegExp(`\\b${s.name}\\b`), s.name);
});

test("the backend check and the verify link are watermark.txt's own", () => {
  assert.ok(docs.includes(BACKEND_CHECK), "BACKEND_CHECK drifted from watermark.txt section 13");
  assert.ok(docs.includes(LIVE_VERIFY_LINK));
  assert.match(docs, /## 15\. Customize it/u);
});

test("the sponsor's daily quota and the stamp months match the contracts", () => {
  assert.match(repoFile("contracts/script/DeploySponsor.s.sol"), /DEFAULT_QUOTA = 20;/u);
  assert.match(repoFile("contracts/src/WatermarkRegistry.sol"), /v < m \+ 1 \|\| v > m \+ 3/u);
  assert.match(repoFile("sdk/src/session.ts"), /STAMP_MONTHS = 3;/u);
  const rows = CUSTOMIZE_ROWS.map((r) => r.setting);
  for (const s of ["Stamp length", "Claims per wallet per day", "Which cards count", "Who pays network fees", "Chains"])
    assert.ok(rows.includes(s), s);
});

test("every table-of-contents entry has its section on the page", () => {
  for (const { id } of TOC) assert.match(page, new RegExp(`id="${id}"`), id);
});

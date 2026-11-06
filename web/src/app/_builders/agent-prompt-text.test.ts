import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ADDR, LIVE_APP } from "../../lib/site.ts";
import { AGENT_PROMPT, DOCS_URL, VERIFY_URL } from "./agent-prompt-text.ts";

const repoFile = (path: string) => readFileSync(new URL(`../../../../${path}`, import.meta.url), "utf8");

test("the prompt sends the agent to watermark.txt first", () => {
  assert.equal(DOCS_URL, "https://usewatermark.xyz/watermark.txt");
  assert.ok(AGENT_PROMPT.includes(DOCS_URL));
  assert.ok(AGENT_PROMPT.indexOf(DOCS_URL) < AGENT_PROMPT.indexOf("Solidity"), "read the docs before anything else");
});

test("the prompt has the <YOUR_APP_ID> placeholder and the verify link in the SDK's format", () => {
  assert.ok(AGENT_PROMPT.includes("<YOUR_APP_ID>"));
  assert.equal(VERIFY_URL, "https://usewatermark.xyz/verify?app=<YOUR_APP_ID>");
  assert.ok(AGENT_PROMPT.includes(VERIFY_URL));
});

test("the prompt stays short: under 3,000 characters and about 350 words", () => {
  assert.ok(AGENT_PROMPT.length < 3000, `${AGENT_PROMPT.length} characters`);
  const words = AGENT_PROMPT.split(/\s+/).filter(Boolean).length;
  assert.ok(words <= 360, `${words} words`);
});

test("the prompt holds nothing that looks like a secret", () => {
  const secretLike: [string, RegExp][] = [
    ["32-byte hex (a private key or seed)", /\b(0x)?[0-9a-fA-F]{64}\b/],
    ["PEM block", /-----BEGIN [A-Z ]+-----/],
    ["API key prefix", /\b(sk-[A-Za-z0-9]|ghp_|gho_|github_pat_|AKIA[0-9A-Z]{12}|xox[abp]-)/],
    ["key or secret assignment", /\b[A-Z_]*(PRIVATE_KEY|SECRET|API_KEY|ACCESS_KEY|PASSWORD)\s*[=:]/],
    ["mnemonic", /\b(mnemonic|seed phrase)\s*[=:]/i],
    ["card number (13 to 19 digits starting 2-6, outside the 75-digit app id)", /(?<!\d)[2-6]\d{12,18}(?!\d)/],
  ];
  for (const [what, re] of secretLike) assert.doesNotMatch(AGENT_PROMPT, re, what);
});

test("the prompt's registry and live app id are the deployed ones", () => {
  const deployed = JSON.parse(repoFile("deployments/whitechain.json"));
  assert.ok(AGENT_PROMPT.includes(deployed.registry));
  assert.ok(AGENT_PROMPT.includes(deployed.liveAppId));
  assert.equal(ADDR.registry, deployed.registry);
  assert.equal(LIVE_APP.appId, deployed.liveAppId);
  for (const addr of AGENT_PROMPT.match(/0x[0-9a-fA-F]{40}/g) ?? []) assert.equal(addr, deployed.registry);
});

test("every MCP tool the prompt names exists in mcp/src/server.ts", () => {
  const server = repoFile("mcp/src/server.ts");
  const registered = new Set([...server.matchAll(/registerTool\(\s*"(watermark_[a-z_]+)"/g)].map((m) => m[1]));
  const named: string[] = AGENT_PROMPT.match(/watermark_[a-z_]+/g) ?? [];
  assert.ok(named.includes("watermark_create_verify_link") && named.includes("watermark_prepare_register_app"));
  for (const tool of named) assert.ok(registered.has(tool), `${tool} is not an MCP tool`);
});

test("the prompt asks for the safety rules and the refusal test", () => {
  assert.match(AGENT_PROMPT, /Never ask for, store or log card numbers/);
  assert.match(AGENT_PROMPT, /unstamped wallet is refused/);
  assert.match(AGENT_PROMPT, /existing test/);
  assert.match(AGENT_PROMPT, /short summary/);
});

// ------------------------------------------------------------------ web/public/watermark.txt (the docs it points at)

const docs = repoFile("web/public/watermark.txt");

test("/llms.txt is an exact copy of /watermark.txt", () => {
  assert.equal(repoFile("web/public/llms.txt"), docs);
});

test("every address and app id in watermark.txt is a published value", () => {
  const whitechain = JSON.parse(repoFile("deployments/whitechain.json"));
  const devnet = JSON.parse(repoFile("deployments/devnet.json"));
  const known = new Set<string>();
  const collect = (v: unknown): void => {
    if (typeof v === "string") known.add(v.toLowerCase());
    else if (v && typeof v === "object") Object.values(v).forEach(collect);
  };
  collect(whitechain);
  collect(devnet);
  // Not in deployments/: the relayer and business wallets (lib/site.ts, also GET /health) and the chain's Multicall3.
  for (const a of [ADDR.relayer, ADDR.business, "0xcA11bde05977b3631167028862bE2a173976CA11"]) known.add(a.toLowerCase());

  for (const addr of new Set(docs.match(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g) ?? [])) {
    if (/^0x0{30}/.test(addr)) continue; // example wallets in requests and tests, like 0x…0001 and 0x…dEaD
    assert.ok(known.has(addr.toLowerCase()), `unknown address ${addr}`);
  }
  for (const id of new Set(docs.match(/(?<!\d)\d{70,78}(?!\d)/g) ?? [])) {
    assert.ok(known.has(id), `unknown app id ${id}`);
  }
  assert.ok(docs.includes(whitechain.liveAppId) && docs.includes(whitechain.registry));
});

test("watermark.txt lists every MCP tool, with the client config verbatim from mcp/README.md", () => {
  const server = repoFile("mcp/src/server.ts");
  for (const [, tool] of server.matchAll(/registerTool\(\s*"(watermark_[a-z_]+)"/g)) {
    assert.ok(docs.includes(tool!), `${tool} is missing from watermark.txt`);
  }
  const config = repoFile("mcp/README.md").match(/```json\n([\s\S]*?)```/)![1]!;
  assert.ok(docs.includes(config), "the mcpServers config drifted from mcp/README.md");
});

test("watermark.txt carries docs/INTEGRATE.md's Solidity and SDK code verbatim", () => {
  const integrate = repoFile("docs/INTEGRATE.md");
  for (const lang of ["solidity", "ts"]) {
    const code = integrate.match(new RegExp("```" + lang + "\\n([\\s\\S]*?)```"))![1]!;
    assert.ok(docs.includes(code), `INTEGRATE.md's ${lang} block drifted`);
  }
});

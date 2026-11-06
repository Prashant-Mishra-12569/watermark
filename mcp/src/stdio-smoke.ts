/** Spawns the real stdio server like an MCP client would, lists tools and drafts a policy. Run: node src/stdio-smoke.ts */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [new URL("./index.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")] }));
const { tools } = await client.listTools();
console.log(`tools: ${tools.map((t) => t.name).join(", ")}`);
const r = await client.callTool({
  name: "watermark_draft_policy",
  arguments: { networks: ["RUPAY"], prefixes: [{ network: "RUPAY", prefix: "990001", bank: "Synthetic test card", type: "debit", status: "tested" }] },
});
console.log(`rulesRoot: ${JSON.parse((r.content as { text: string }[])[0]!.text).rulesRoot}`);
const c = await client.callTool({ name: "watermark_check_wallet", arguments: { wallet: "0x00000000000000000000000000000000000000a1", appId: "12345" } });
console.log(`check_wallet (no deployment yet): ${(c.content as { text: string }[])[0]!.text}`);
await client.close();

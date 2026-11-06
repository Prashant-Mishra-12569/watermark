/**
 * Spawns the real stdio server like an MCP client would and calls the tools against the live deployment
 * (deployments/whitechain.json). Read-only. Run: node src/stdio-smoke.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const text = (r: unknown) => ((r as { content: { text: string }[] }).content)[0]!.text;
const json = (r: unknown) => JSON.parse(text(r));

const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [new URL("./index.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")],
    env: { ...process.env, WHITECHAIN_RPC: process.env.WHITECHAIN_RPC ?? "https://rpc.testnet.whitechain.io" } as Record<string, string>,
  }),
);
const { tools } = await client.listTools();
console.log(`${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`);

const apps = json(await client.callTool({ name: "watermark_list_apps", arguments: {} }));
console.log(`registry ${apps.registry}; apps: ${apps.apps.map((a: { environment: string; label: string }) => `${a.environment} "${a.label}"`).join(", ")}`);

const live = apps.apps.find((a: { environment: string }) => a.environment === "live");
if (live) {
  const info = json(await client.callTool({ name: "watermark_app_info", arguments: { appId: live.appId } }));
  console.log(`app_info live: exists ${info.exists}, audit matches ${info.audit.matches} (${info.audit.published?.leaves} published leaves)`);
  const h = json(await client.callTool({ name: "watermark_stamp_history", arguments: { appId: live.appId, limit: 3 } }));
  console.log(`stamp_history live: ${h.totalStamps} stamp(s), ${h.liveNow} live; latest ${h.latest[0]?.wallet ?? "none"}`);
  if (h.latest[0]) {
    const c = json(await client.callTool({ name: "watermark_check_wallet", arguments: { wallet: h.latest[0].wallet, appId: live.appId } }));
    console.log(`check_wallet on that wallet: stamped ${c.stamped} until ${c.expiresAtIso}`);
  }
}
const cards = json(await client.callTool({ name: "watermark_supported_cards", arguments: {} }));
console.log(`supported_cards: ${cards.cards.map((c: { network: string; status: string }) => `${c.network} ${c.status}`).join(", ")}`);
await client.close();

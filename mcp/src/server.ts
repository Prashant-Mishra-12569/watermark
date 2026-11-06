/** Wires the tool handlers into an MCP server (stdio in index.ts, in-memory in tests). */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  checkWallet,
  checkWallets,
  draft,
  explain,
  getPolicy,
  integrationSnippet,
  STAMP_MEANING,
  ToolError,
  type ToolDeps,
} from "./tools.ts";

const wallet = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "a 0x wallet address");
const appId = z.string().regex(/^\d{1,78}$/, "a decimal appId");
const chain = z.enum(["whitechain", "devnet"]).optional().describe("Defaults to whitechain (Whitechain Sepolia, 1874)");
const network = z.enum(["RUPAY", "VISA", "MASTERCARD"]);
const cardType = z.enum(["debit", "credit", "prepaid"]);

function result(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

async function run(fn: () => unknown) {
  try {
    return result(await fn());
  } catch (e) {
    const msg = e instanceof ToolError || e instanceof Error ? e.message : "unknown error";
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
}

export function createServer(deps: ToolDeps): McpServer {
  const server = new McpServer({ name: "watermark", version: "0.1.0" });
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: true };

  server.registerTool(
    "watermark_check_wallet",
    {
      title: "Check one wallet's Watermark stamp",
      description:
        `Is this wallet stamped for this app, and until when? Reads WatermarkRegistry on-chain. ${STAMP_MEANING} ` +
        "Use it before paying a reward or giving access.",
      inputSchema: { wallet, appId, chain },
      annotations: readOnly,
    },
    async (a) => run(() => checkWallet(deps, a)),
  );

  server.registerTool(
    "watermark_check_wallets",
    {
      title: "Check up to 200 wallets",
      description: `The same check for an airdrop or allowlist (max 200 wallets). ${STAMP_MEANING}`,
      inputSchema: { wallets: z.array(wallet).min(1).max(200), appId, chain },
      annotations: readOnly,
    },
    async (a) => run(() => checkWallets(deps, a)),
  );

  server.registerTool(
    "watermark_draft_policy",
    {
      title: "Draft a card filter policy",
      description:
        "Turns rules like 'SBI RuPay debit only' into filter leaves and their Poseidon2 rulesRoot, with warnings about " +
        "narrow or untested filters and what a stamp reveals. Prefixes are BINs from a public BIN list, never digits " +
        "from someone's own card. Returns a draft only: it signs nothing.",
      inputSchema: {
        label: z.string().max(80).optional(),
        environment: z.enum(["live", "test"]).optional(),
        networks: z.array(network).min(1),
        banks: z.array(z.string().max(60)).optional(),
        types: z.array(cardType).optional(),
        prefixes: z
          .array(
            z.object({
              network,
              prefix: z.string().regex(/^(\d{6}|\d{8})$/, "6 or 8 digits"),
              bank: z.string().max(60).optional(),
              type: cardType.optional(),
              status: z.enum(["tested", "listed"]).optional(),
            }),
          )
          .max(4096),
        quotaPerDay: z.number().int().min(1).max(1000).optional(),
        stampMonths: z.number().int().min(1).max(3).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (a) => run(() => draft(deps, a)),
  );

  server.registerTool(
    "watermark_get_policy",
    {
      title: "Get an app's policy",
      description: "Returns the committed filter policy for an appId: label, environment, leaves, rulesRoot, quota.",
      inputSchema: { appId },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (a) => run(() => getPolicy(deps, a)),
  );

  server.registerTool(
    "watermark_explain_policy",
    {
      title: "Explain an app's policy",
      description: "Plain-language summary: who passes, what a stamp reveals publicly, and what it does not prove.",
      inputSchema: { appId },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (a) => run(() => explain(deps, a)),
  );

  server.registerTool(
    "watermark_integration_snippet",
    {
      title: "Integration code",
      description: "Solidity or TypeScript code that gates a feature on a live Watermark stamp for an appId.",
      inputSchema: { language: z.enum(["solidity", "typescript"]), appId, chain },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (a) => run(() => integrationSnippet(deps, a)),
  );

  return server;
}

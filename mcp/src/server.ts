/** Wires the tool handlers into an MCP server (stdio in index.ts, in-memory in tests). */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  appInfoTool,
  checkWallet,
  checkWallets,
  createVerifyLink,
  draft,
  explain,
  getPolicy,
  integrationSnippet,
  listApps,
  prepareRegisterAppTool,
  STAMP_MEANING,
  stampHistoryTool,
  supportedCardsTool,
  ToolError,
  type ToolDeps,
} from "./tools.ts";

const wallet = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "a 0x wallet address");
const appId = z.string().regex(/^\d{1,78}$/, "a decimal appId");
const chain = z.enum(["whitechain", "devnet"]).optional().describe("Defaults to whitechain (Whitechain Sepolia, 1874)");
const network = z.enum(["RUPAY", "VISA", "MASTERCARD"]);
const cardType = z.enum(["debit", "credit", "prepaid"]);
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "32 bytes of 0x-hex");

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
  const server = new McpServer({ name: "watermark", version: "0.2.0" });
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
        "from someone's own card. Visa and Mastercard filters can be drafted but are not provable yet (planned, not live). " +
        "Returns a draft only: it signs nothing.",
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
          .max(8192),
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


  server.registerTool(
    "watermark_app_info",
    {
      title: "An app's on-chain record and filter audit",
      description:
        "Reads an app from WatermarkRegistry (owner, rulesRoot, session signer) and audits it: does the filter enforced " +
        "on-chain equal the policy the app publishes? Use it before trusting an app's stamps.",
      inputSchema: { appId, chain },
      annotations: readOnly,
    },
    async (a) => run(() => appInfoTool(deps, a)),
  );

  server.registerTool(
    "watermark_stamp_history",
    {
      title: "An app's stamp history",
      description:
        "Transparency: how many stamps an app has given, how many wallets, how many are live now, and the latest ones " +
        "with explorer links. Public on-chain data only; no card data exists on-chain.",
      inputSchema: { appId, chain, limit: z.number().int().min(1).max(200).optional().describe("Latest stamps to list (default 20)") },
      annotations: readOnly,
    },
    async (a) => run(() => stampHistoryTool(deps, a)),
  );

  server.registerTool(
    "watermark_prepare_register_app",
    {
      title: "Prepare an app registration (unsigned)",
      description:
        "Builds an UNSIGNED registerApp transaction so a company can register its own app with its own card filter " +
        "(rulesRoot from watermark_draft_policy) and its own session signer. Returns the predicted appId. " +
        "It signs and sends nothing: the owner reviews and sends it from their own wallet.",
      inputSchema: {
        owner: wallet.describe("The account that will send the transaction and own the app"),
        rulesRoot: bytes32.describe("The filter root from watermark_draft_policy"),
        sessionSigner: wallet.describe("The address that signs this app's sessions"),
        salt: bytes32.optional().describe("Any 32 bytes; random if omitted"),
        chain,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (a) => run(() => prepareRegisterAppTool(deps, a)),
  );

  server.registerTool(
    "watermark_create_verify_link",
    {
      title: "Link for a user to get stamped",
      description: "A link to the Watermark /verify page for an app. The user opens it, scans the QR with an Android phone and taps a bank card.",
      inputSchema: { appId, siteUrl: z.string().url().max(200).describe("The Watermark website, e.g. https://…"), chain },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (a) => run(() => createVerifyLink(deps, a)),
  );

  server.registerTool(
    "watermark_list_apps",
    {
      title: "Deployed Watermark apps",
      description: "The registry address and the apps this deployment registered (test and live), with their filter labels.",
      inputSchema: { chain },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (a) => run(() => listApps(deps, a)),
  );

  server.registerTool(
    "watermark_supported_cards",
    {
      title: "Which cards can be proven today",
      description:
        "Honest status per card network: RuPay debit is live; Visa and Mastercard are planned, not live (they need their own circuit profile).",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => run(() => supportedCardsTool()),
  );

  return server;
}

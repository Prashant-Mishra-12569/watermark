# mcp

**Owner: Prashant.** Spec section P. A Watermark MCP server over stdio (`@modelcontextprotocol/sdk` 1.32). It lets
apps and AI agents check stamps and draft card-filter policies.

**Rules:**
- It holds **no keys** and never signs or sends a transaction. Everything it returns is data.
- **No tool takes card data.** Filter prefixes are 6- or 8-digit BINs from a public BIN list, and the schema rejects
  anything longer.

> A stamp means: *this wallet was linked to one real bank card that passed this app's filter.*
> It is **not** identity, KYC, age, balance or one-person-one-vote.

## Tools
Everything is read-only or unsigned. Registration is returned as an unsigned transaction for the app owner to send.

| Tool | What it does |
|---|---|
| `watermark_check_wallet` | Stamped or not, plus expiry, for one wallet and app (reads `WatermarkRegistry`) |
| `watermark_check_wallets` | The same for up to 200 wallets (airdrops, allowlists); one multicall on Whitechain |
| `watermark_app_info` | An app's on-chain owner, filter root and session signer, plus an **audit**: is the enforced filter the published one? |
| `watermark_stamp_history` | **Transparency**: total stamps, unique wallets, how many are live, the latest ones with explorer links |
| `watermark_list_apps` | The registry address and the deployed apps (test and live) with their filter labels |
| `watermark_draft_policy` | Rules like "SBI RuPay debit" → filter leaves, Poseidon2 `rulesRoot`, warnings, and what a stamp reveals |
| `watermark_prepare_register_app` | An **unsigned** `registerApp` transaction for a company's own app, filter and session signer, plus the predicted appId |
| `watermark_create_verify_link` | A link that sends a user to the `/verify` page for an app |
| `watermark_get_policy` | The committed policy for an appId (`policies/*.json`; local-only files are never served) |
| `watermark_explain_policy` | Plain language: who passes, what a stamp reveals, what it doesn't prove |
| `watermark_supported_cards` | Honest status: RuPay debit is **live**; Visa and Mastercard are **planned, not live** |
| `watermark_integration_snippet` | Solidity (`onlyStamped` modifier) or TypeScript (`check`, allowlist export) with the real registry address |

The registry address and its deploy block come from `deployments/whitechain.json` / `devnet.json`. Until those exist,
the check tools answer "isn't deployed yet". Event history needs an RPC that allows bounded `eth_getLogs` ranges: the SDK
uses Whitechain's official RPC by default (set `WATERMARK_LOGS_RPC` to change it).

## Use it from an MCP client
Add this to your client's MCP server config (the exact file depends on the client):
```json
{
  "mcpServers": {
    "watermark": {
      "command": "node",
      "args": ["/absolute/path/to/watermark/mcp/src/index.ts"],
      "env": { "WHITECHAIN_RPC": "https://rpc.ankr.com/whitechain_testnet" }
    }
  }
}
```
It needs Node 24, which runs the TypeScript directly, and `pnpm install` at the repo root.
For integrating Watermark in your own product, see [docs/INTEGRATE.md](../docs/INTEGRATE.md).

## Develop
```sh
pnpm --filter @watermark/mcp test     # handlers + an in-memory MCP client↔server round trip
node mcp/src/stdio-smoke.ts           # spawns the real stdio server and calls it against the live deployment
```
Demo line: *"An AI agent asks Watermark before sending a reward to a wallet."* The website payment stays the main
Whitechain flow.

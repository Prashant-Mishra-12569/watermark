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
| Tool | What it does |
|---|---|
| `watermark_check_wallet` | Stamped or not, plus expiry, for one wallet and app (reads `WatermarkRegistry`) |
| `watermark_check_wallets` | The same for up to 200 wallets (airdrops, allowlists); one multicall on Whitechain |
| `watermark_draft_policy` | Rules like "SBI RuPay debit" → filter leaves, Poseidon2 `rulesRoot`, warnings, and what a stamp reveals |
| `watermark_get_policy` | The committed policy for an appId (`policies/*.json`; local-only files are never served) |
| `watermark_explain_policy` | Plain language: who passes, what a stamp reveals, what it doesn't prove |
| `watermark_integration_snippet` | Solidity (`onlyStamped` modifier) or TypeScript (`@watermark/sdk`) gate code |

The registry address comes from `deployments/whitechain.json` / `devnet.json`. Until those exist, the check tools
answer "isn't deployed yet".

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

## Develop
```sh
pnpm --filter @watermark/mcp test     # handlers + an in-memory MCP client↔server round trip
node mcp/src/stdio-smoke.ts           # spawns the real stdio server like a client would
```
Demo line: *"An AI agent asks Watermark before sending a reward to a wallet."* The website payment stays the main
Whitechain flow.

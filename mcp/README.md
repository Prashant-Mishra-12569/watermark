# Watermark MCP server

**Owner: Prashant.** Give any AI agent (Claude Code, Cursor, Claude Desktop, or any MCP client) the power to check
whether a wallet is backed by a real bank card, audit an app's card rules, and add Watermark to your code.

It speaks the Model Context Protocol over stdio (`@modelcontextprotocol/sdk` 1.32) and reads the live
`WatermarkRegistry` on Whitechain Sepolia.

**Safe by design**
- **No keys.** It never signs or sends a transaction. Registering an app returns an *unsigned* transaction for you to send.
- **No card data.** No tool accepts card numbers. Filters use 6 or 8 digit bank prefixes (BINs) from a public list,
  and the input schema rejects anything longer.
- **Read-only chain access** through a public RPC. Nothing of ours has to be online for the checks to work.

> A stamp means: *this wallet was linked to one real bank card that passed this app's filter.*
> It is **not** identity, KYC, age, balance or one-person-one-vote.

---

## Quick start (2 minutes)

You need **Node 24** (it runs the TypeScript directly) and pnpm.

```sh
git clone https://github.com/Prashant-Mishra-12569/watermark.git
cd watermark
corepack enable && pnpm install
```

Then connect your agent. Pick one:

### Claude Code
Open the repo folder in Claude Code. The repo ships a `.mcp.json`, so it offers the `watermark` server: approve it.
Or add it for every project:
```sh
claude mcp add watermark -s user -- node /absolute/path/to/watermark/mcp/src/index.ts
```

### Cursor
Add this to `~/.cursor/mcp.json` (or `.cursor/mcp.json` in your project):
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

### Claude Desktop, or any other MCP client
Use the same JSON block in the client's MCP config file (for Claude Desktop: Settings → Developer → Edit Config).

### Check it works
```sh
node mcp/src/stdio-smoke.ts
```
This starts the real server, lists the 12 tools and calls them against the live chain. Expected output:
```
12 tools: watermark_check_wallet, watermark_check_wallets, …
app_info live: exists true, audit matches true (4208 published leaves)
check_wallet on that wallet: stamped true until 2027-02-28T23:59:59.000Z
supported_cards: RUPAY live, VISA planned, MASTERCARD planned
```

---

## Things to ask your agent

| You say | Tool it uses |
|---|---|
| "Is `0xcDeD…17a5` stamped on the Watermark live app?" | `watermark_check_wallet` |
| "Here are 150 airdrop addresses. Which ones are backed by a real card?" | `watermark_check_wallets` |
| "Add a Watermark check to the `claim()` function in my contract." | `watermark_integration_snippet` |
| "Is the live app enforcing the card list it publishes?" | `watermark_app_info` |
| "How many wallets has this app stamped, and which were the latest?" | `watermark_stamp_history` |
| "Draft a filter for RuPay debit cards from SBI and HDFC." | `watermark_draft_policy` |
| "What does a stamp from this filter reveal about the user?" | `watermark_explain_policy` |
| "Register my own Watermark app with this filter." | `watermark_prepare_register_app` (unsigned) |
| "Give me a link where my users can get stamped." | `watermark_create_verify_link` |
| "Which card networks work today?" | `watermark_supported_cards` |

## All tools

| Tool | What it does |
|---|---|
| `watermark_check_wallet` | Stamped or not, plus expiry, for one wallet and app (reads `WatermarkRegistry`) |
| `watermark_check_wallets` | The same for up to 200 wallets (airdrops, allowlists), in one multicall |
| `watermark_app_info` | An app's on-chain owner, filter root and session signer, plus an **audit**: is the enforced filter the published one? |
| `watermark_stamp_history` | **Transparency**: total stamps, unique wallets, how many are live, the latest ones with explorer links |
| `watermark_list_apps` | The registry address and the deployed apps, with their filter labels |
| `watermark_draft_policy` | Plain rules ("SBI RuPay debit") → filter leaves, the Poseidon2 `rulesRoot`, warnings and what a stamp reveals |
| `watermark_prepare_register_app` | An **unsigned** `registerApp` transaction for your own app, filter and session signer, plus the predicted appId |
| `watermark_create_verify_link` | A link that sends a user to the `/verify` page for an app |
| `watermark_get_policy` | The published policy for an appId (`policies/*.json`; local-only files are never served) |
| `watermark_explain_policy` | Plain language: who passes, what a stamp reveals, what it doesn't prove |
| `watermark_supported_cards` | Honest status: RuPay debit is **live**; Visa and Mastercard are **planned, not live** |
| `watermark_integration_snippet` | Solidity (`onlyStamped` modifier) or TypeScript (`check`, allowlist export), with the real registry address |

## Settings

| Variable | Default | Use |
|---|---|---|
| `WHITECHAIN_RPC` | `https://rpc.ankr.com/whitechain_testnet` | Any Whitechain Sepolia (1874) RPC |
| `WATERMARK_LOGS_RPC` | `https://rpc.testnet.whitechain.io` | RPC for event history; it must allow bounded `eth_getLogs` ranges |
| `ALTMEMPOOL_EXEC_RPC` | the devnet RPC | Only for the alt mempool devnet (chain 1337) |

Addresses come from [`deployments/whitechain.json`](../deployments/whitechain.json) and `deployments/devnet.json`.

## Troubleshooting
- **`Unknown file extension ".ts"` or a `SyntaxError` on start:** your Node is too old to run TypeScript directly. Use Node 24.
- **"isn't deployed yet":** the deployments file for that chain is missing. Pull the latest `main`.
- **Stamp history is empty or slow:** your RPC refuses large log ranges. Leave `WATERMARK_LOGS_RPC` on the default.

## Develop
```sh
pnpm --filter @watermark/mcp test     # handlers, plus an in-memory MCP client to server round trip
node mcp/src/stdio-smoke.ts           # the real stdio server against the live deployment
```
For integrating without an agent (Solidity, TypeScript), see [docs/INTEGRATE.md](../docs/INTEGRATE.md).

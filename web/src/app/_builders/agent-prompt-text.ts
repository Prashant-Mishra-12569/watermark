/**
 * The "copy this prompt into your AI coding agent" text for the builders page (AgentPrompt). Pure: no React, no fs, so
 * agent-prompt-text.test.ts runs it under `node --test`.
 *
 * The registry and the live appId come from deployments/whitechain.json through lib/site.ts, never typed here. Every
 * MCP tool name it mentions must exist in mcp/src/server.ts, and the docs it points at are web/public/watermark.txt
 * (served at /watermark.txt). The test checks all three, the length, and that it holds nothing secret-looking.
 */
import { ADDR, CHAIN_ID, LIVE_APP } from "../../lib/site.ts";

/** Where the agent reads the full reference (web/public/watermark.txt). */
export const DOCS_URL = "https://usewatermark.xyz/watermark.txt";

/** The verify page an unstamped user is sent to (the SDK's verifyLink and watermark_create_verify_link format). */
export const VERIFY_URL = "https://usewatermark.xyz/verify?app=<YOUR_APP_ID>";

export const AGENT_PROMPT = `Add Watermark anti-bot gating to this project. A Watermark stamp means a wallet was linked to one real bank card. Only stamped wallets may get what this app gives away or protects: airdrops, mints, rewards, faucet tokens, sponsored gas, votes or access.

1. Read ${DOCS_URL} first. Use only the addresses, functions and tool names it gives. Don't invent any.

2. Find every place this repo gives something away or lets a wallet in: airdrop claims, mints, rewards, faucets, sponsored gas, votes, allowlists. Check whether they live in Solidity contracts, a TypeScript/JavaScript backend, or both.

3. App id: <YOUR_APP_ID> below is a placeholder; keep it in one config constant. For real RuPay bank cards, set it to the live app id: ${LIVE_APP.appId}. Register our own app only if we want our own card list: draft it with watermark_draft_policy, then watermark_prepare_register_app (unsigned; I send it, and we must run our own session signer). Tell me which you chose and why.

4. Solidity: contracts on Whitechain Sepolia (chain ${CHAIN_ID}) can gate directly. Add the IWatermarkRegistry interface and the onlyStamped modifier from the docs, with the registry ${ADDR.registry} and <YOUR_APP_ID>, and put onlyStamped on each claim function. A contract on another chain can't read the registry: check in the backend instead.

5. Backend: before paying out, call check() from @watermark/sdk, or the plain viem isStamped read in the docs (the SDK isn't on npm yet). Refuse when stamped is false. Never trust a stamp flag sent by the browser.

6. For users who aren't stamped, show a "Get verified with Watermark" link to ${VERIFY_URL} (what watermark_create_verify_link returns). Tell them to verify the same wallet they claim with.

7. Never ask for, store or log card numbers or any card data. We only need the wallet address.

8. Keep every existing test passing. Add a test showing an unstamped wallet is refused (mock the registry or the check). Add no keys or secrets; reading a stamp needs none.

Finish with a short summary: files changed, where each check sits, the app id and why, how to run the new test, and anything left for me to do.`;

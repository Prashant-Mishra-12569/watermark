# mcp

**Owner: Prashant.** Spec section P. MCP server over stdio (`@modelcontextprotocol/sdk`).

The MCP never takes card data and never holds keys. It only reads, or prepares **unsigned** transactions for a person
to review and sign.

**Priority tools:** `watermark_check_wallet`, `watermark_draft_policy`.
**Then:** `watermark_check_wallets` (≤200), `watermark_get_policy`, `watermark_get_quota`, `watermark_explain_policy`,
`watermark_search_issuers`, `watermark_prepare_register_app`, `watermark_create_verify_link`,
`watermark_budget_status`, `watermark_integration_snippet`.
**Stretch:** `watermark_prepare_reward`.

Ship a ready MCP client config snippet here (stdio command + env). Never sell it as KYC, an age check or one-person-one-vote.

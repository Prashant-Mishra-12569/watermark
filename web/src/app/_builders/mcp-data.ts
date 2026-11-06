/**
 * The MCP facts for the builders page's "AI agents (MCP)" block. Pure: no React, no fs, so builders.test.ts runs it
 * under `node --test` and checks it against mcp/README.md and mcp/src/server.ts.
 */

/**
 * The MCP client config, verbatim from mcp/README.md ("Use it from an MCP client"). Never edit it here: change the
 * README and copy it again. builders.test.ts fails if the two differ.
 */
export const MCP_SERVERS_JSON = `{
  "mcpServers": {
    "watermark": {
      "command": "node",
      "args": ["/absolute/path/to/watermark/mcp/src/index.ts"],
      "env": { "WHITECHAIN_RPC": "https://rpc.ankr.com/whitechain_testnet" }
    }
  }
}`;

export const MCP_TOOL_PREFIX = "watermark_";

/** The 12 tools, without the prefix, in three groups. builders.test.ts checks them against mcp/src/server.ts. */
export const MCP_TOOL_GROUPS = [
  { title: "Check", tools: ["check_wallet", "check_wallets", "stamp_history"] },
  { title: "Audit", tools: ["app_info", "get_policy", "explain_policy", "list_apps", "supported_cards"] },
  { title: "Build", tools: ["draft_policy", "prepare_register_app", "create_verify_link", "integration_snippet"] },
] as const satisfies readonly { title: string; tools: readonly string[] }[];

/** Every tool, without the prefix. */
export const MCP_TOOLS: readonly string[] = MCP_TOOL_GROUPS.flatMap((g) => g.tools);

/** What the server is, in three words (mcp/README.md: no keys, read-only or unsigned, stdio). */
export const MCP_CHIPS = ["Read-only", "No keys", "Runs locally"] as const;

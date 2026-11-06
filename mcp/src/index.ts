#!/usr/bin/env node
/**
 * Watermark MCP server over stdio. Read-only: it holds no keys and never takes card data.
 * stdout carries the MCP protocol, so diagnostics go to stderr only.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getPolicy, registryFor } from "@watermark/sdk/node";
import { fieldHex, initHash, rulesTree } from "@watermark/zk";
import { createServer } from "./server.ts";

let hashReady: Promise<void> | undefined;

const server = createServer({
  registryFor: (chain) => registryFor(chain),
  getPolicy: (appId) => getPolicy(appId),
  rulesRoot: async (leaves) => {
    hashReady ??= initHash();
    await hashReady;
    return fieldHex(rulesTree(leaves.map((l) => ({ networkId: l.networkId, prefixLength: l.prefixLength, prefix: l.prefix }))).root);
  },
  rpcUrl: (chain) => (chain === "whitechain" ? process.env.WHITECHAIN_RPC : process.env.ALTMEMPOOL_EXEC_RPC) || undefined,
});

await server.connect(new StdioServerTransport());
console.error("watermark MCP server ready (stdio)");

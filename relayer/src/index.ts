import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { createApp } from "./app.ts";
import { viemChainReader, viemChainWriter } from "./chain.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
const app = createApp({
  config,
  chain: viemChainReader(),
  writer: config.relayerKey ? viemChainWriter(config.relayerKey) : null,
  clientIp: (c) => getConnInfo(c).remote.address ?? "unknown",
});

// 0.0.0.0 so the phone on the same hotspot can reach GET /session/:id.
serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
  const ready = [...config.chains.values()].filter((c) => c.registry).map((c) => c.chainId);
  console.log(`relayer on :${info.port} · chains with a registry: ${ready.join(", ") || "none yet"}`);
  if (!config.relayerKey) console.log("RELAYER_PRIVATE_KEY not set: POST /stamp answers 503 RELAYER_NOT_CONFIGURED");
  for (const w of config.warnings) console.warn(`config: ${w}`);
});

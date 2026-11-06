import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { createApp } from "./app.ts";
import { privateKeyToAccount } from "viem/accounts";
import {
  readPassInfo,
  viemAppSignerReader,
  viemChainReader,
  viemChainWriter,
  viemFundWriter,
  viemPassReader,
  viemPassWriter,
  viemPayReader,
  viemPayWriter,
} from "./chain.ts";
import { loadConfig } from "./config.ts";
import { passWarnings, sessionSignerWarnings, sponsorWarnings } from "./preflight.ts";

const config = loadConfig();
const payReader = viemPayReader();
const app = createApp({
  config,
  chain: viemChainReader(),
  writer: config.relayerKey ? viemChainWriter(config.relayerKey) : null,
  payReader,
  payWriter: config.relayerKey ? viemPayWriter(config.relayerKey) : null,
  funder: config.businessKey ? viemFundWriter(config.businessKey) : null,
  passReader: viemPassReader(),
  passWriter: config.relayerKey ? viemPassWriter(config.relayerKey) : null,
  warmUp: true,
  clientIp: (c) => getConnInfo(c).remote.address ?? "unknown",
});

// 0.0.0.0 so the phone on the same hotspot can reach GET /session/:id.
serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
  const ready = [...config.chains.values()].filter((c) => c.registry).map((c) => c.chainId);
  console.log(`relayer on :${info.port} · chains with a registry: ${ready.join(", ") || "none yet"}`);
  if (!config.relayerKey) console.log("RELAYER_PRIVATE_KEY not set: POST /stamp and POST /pay answer 503 RELAYER_NOT_CONFIGURED");
  if (![...config.chains.values()].some((c) => c.sponsor)) console.log("SPONSOR_ADDRESS not set: POST /pay answers 503 SPONSOR_NOT_CONFIGURED");
  if (!config.pass.address) console.log("GENESIS_PASS_ADDRESS not set: /pass answers 503 PASS_NOT_CONFIGURED");
  if (!config.businessKey) console.log("BUSINESS_PRIVATE_KEY not set: POST /fund answers 503 FUND_NOT_CONFIGURED");
  for (const w of config.warnings) console.warn(`config: ${w}`);
  // Compares each app's on-chain session signer with ours, and the sponsor's settings with ours (warn only).
  const signer = privateKeyToAccount(config.sessionSignerKey).address;
  void sessionSignerWarnings(config, signer, viemAppSignerReader()).then((ws) => {
    for (const w of ws) console.warn(`WARNING: ${w}`);
  });
  const relayer = config.relayerKey ? privateKeyToAccount(config.relayerKey).address : null;
  void sponsorWarnings(config, relayer, (c) => payReader.sponsorInfo(c)).then((ws) => {
    for (const w of ws) console.warn(`WARNING: ${w}`);
  });
  const sponsorAppId = async () => {
    const c = [...config.chains.values()].find((x) => x.sponsor && x.usdt);
    return c?.sponsor && c.usdt ? (await payReader.sponsorInfo({ ...c, sponsor: c.sponsor, usdt: c.usdt })).appId : null;
  };
  void passWarnings(config, relayer, readPassInfo, sponsorAppId).then((ws) => {
    for (const w of ws) console.warn(`WARNING: ${w}`);
  });
});

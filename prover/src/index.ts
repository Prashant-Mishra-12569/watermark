import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import { serve } from "@hono/node-server";
import { initHash, WatermarkProver } from "@watermark/zk";
import { createApp } from "./app.ts";
import { checkCircuit } from "./circuit-check.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
const circuit = checkCircuit(config.circuitPath, fileURLToPath(new URL("../../contracts/test/fixtures/synthetic-stamp.json", import.meta.url)));
if (!circuit.ok) {
  if (process.env.ALLOW_CIRCUIT_MISMATCH !== "1") {
    console.error(`prover: ${circuit.message}`);
    process.exit(1);
  }
  console.warn(`prover: WARNING ${circuit.message}`);
}
await initHash();
const prover = await WatermarkProver.load(config.circuitPath);

const app = createApp({
  config,
  prove: (inputs) => prover.prove(inputs),
  stamp: async (body) => {
    if (!config.relayerUrl) return "0x" as `0x${string}`; // dev: no relayer yet, the proof is kept and reported
    const res = await fetch(`${config.relayerUrl}/stamp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { txHash?: `0x${string}`; error?: string };
    if (!res.ok || !json.txHash) throw new Error(`STAMP_${json.error ?? res.status}`);
    return json.txHash;
  },
});

serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => `http://${i!.address}:${info.port}`);
  console.log(`prover on :${info.port} · LAN: ${lan.join(", ") || "none"} · apps: ${[...config.apps.keys()].join(", ") || "none"}`);
  console.log(`relayer: ${config.relayerUrl ?? "not set (dev: proofs are not stamped)"}`);
});

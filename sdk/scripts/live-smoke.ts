/**
 * Live check against the deployed WatermarkRegistry on Whitechain Sepolia (reads deployments/whitechain.json).
 * Read-only: it signs and sends nothing.
 *   node scripts/live-smoke.ts
 */
import { createPublicClient, http, type Hex } from "viem";
import { whitechainSepolia } from "../src/chains.ts";
import { prepareRegisterApp } from "../src/client.ts";
import { appInfo, auditApp, deployedApps, loadDeployment, stampHistory } from "../src/node.ts";
import { WATERMARK_REGISTRY_ABI } from "../src/registry.ts";

const rpcUrl = process.env.WHITECHAIN_RPC || "https://rpc.testnet.whitechain.io";
const d = loadDeployment("whitechain");
if (!d?.registry) throw new Error("deployments/whitechain.json has no registry");
console.log(`registry ${d.registry} · deploy block ${d.blockNumber} · rpc ${rpcUrl}`);

let failures = 0;
const expect = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failures++;
};

for (const app of deployedApps("whitechain")) {
  const info = await appInfo(app.appId, { rpcUrl });
  expect(info.exists, `${app.environment} app ${app.appId.slice(0, 10)}… exists (owner ${info.owner}, signer ${info.sessionSigner})`);
  const audit = await auditApp(app.appId, { rpcUrl });
  expect(audit.matches, `${app.environment} app: on-chain rulesRoot ${info.rulesRoot.slice(0, 12)}… == published "${audit.published?.label}" (${audit.published?.leaves} leaves)`);
}

// The current live app can be new and still empty, so its history is shown, not required. The first real-card stamp
// was made under the previous live app, so that one must have at least one stamp.
const previous = (d as { previousLive?: { liveAppId?: string } }).previousLive?.liveAppId;
for (const [name, id, required] of [["live", d.liveAppId, false], ["previous live", previous, true]] as const) {
  if (!id) continue;
  const h = await stampHistory(id, {});
  const line = `${name} app history: ${h.total} stamp(s), ${h.uniqueWallets} wallet(s), ${h.active} live now, blocks ${h.fromBlock}→${h.toBlock}`;
  if (required) expect(h.total >= 1, line);
  else console.log(`INFO  ${line}`);
  for (const s of h.stamps.slice(0, 3)) console.log(`      ${s.wallet} until ${new Date(s.expiresAt * 1000).toISOString().slice(0, 10)} tx ${s.tx}`);
}

const owner = "0x00000000000000000000000000000000000a11ce";
const salt = `0x${"42".repeat(32)}` as Hex;
const prepared = prepareRegisterApp({
  owner,
  salt,
  rulesRoot: (d.liveRulesRoot ?? `0x${"11".repeat(32)}`) as Hex,
  sessionSigner: d.sessionSigner ?? owner,
  registry: d.registry,
});
const client = createPublicClient({ chain: whitechainSepolia, transport: http(rpcUrl) });
const onChainId = (await client.readContract({
  address: d.registry,
  abi: WATERMARK_REGISTRY_ABI,
  functionName: "computeAppId",
  args: [owner, salt],
})) as bigint;
expect(onChainId.toString() === prepared.appId, `prepareRegisterApp appId == registry.computeAppId (${prepared.appId.slice(0, 12)}…)`);

console.log(failures ? `${failures} check(s) failed` : "all live checks passed");
process.exit(failures ? 1 : 0);

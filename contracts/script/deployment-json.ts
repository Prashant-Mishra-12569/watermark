/**
 * Writes deployments/<whitechain|devnet|local>.json (interfaces F11) from a Deploy.s.sol broadcast.
 * Plain Node 24, no dependencies:
 *
 *   node script/deployment-json.ts <chainId> [--broadcast <run-latest.json>] [--out <file>]
 *
 * Defaults: broadcast = contracts/broadcast/Deploy.s.sol/<chainId>/run-latest.json,
 *           out       = deployments/<whitechain|devnet|local>.json (repo root).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** USDT on Whitechain Sepolia (interfaces F7). */
const WHITECHAIN_USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";
/** keccak256("AppRegistered(uint256,address,bytes32,address)") */
const APP_REGISTERED_TOPIC = "0xe3f5855865a2c4e255bbab74b8128ea056aad14efceafccd7d4e83c1bb96a3bb";

interface BroadcastTx {
  hash: string;
  transactionType: string;
  contractName: string | null;
  contractAddress: string | null;
  function: string | null;
  arguments: string[] | null;
  transaction: { from: string; to?: string | null };
}
interface Receipt {
  transactionHash: string;
  status: string;
  blockNumber: string;
  contractAddress: string | null;
  logs: { address: string; topics: string[]; data: string }[];
}
interface Broadcast {
  transactions: BroadcastTx[];
  receipts: Receipt[];
  libraries?: string[];
  returns?: Record<string, { internal_type: string; value: string }>;
  timestamp: number;
  chain: number;
}

function fail(msg: string): never {
  console.error(`deployment-json: ${msg}`);
  process.exit(1);
}

/** Minimal Keccak-256 (BigInt lanes; only used for a handful of EIP-55 checksums). */
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n, 0x000000000000808bn,
  0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an, 0x0000000000000088n,
  0x0000000080008009n, 0x000000008000000an, 0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
  0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const M64 = (1n << 64n) - 1n;
const rotl = (x: bigint, n: number) => (n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M64);

function keccak256(data: Uint8Array): Uint8Array {
  const rate = 136;
  const padded = new Uint8Array(Math.ceil((data.length + 1) / rate) * rate);
  padded.set(data);
  padded[data.length] = 0x01;
  padded[padded.length - 1] = (padded[padded.length - 1] ?? 0) | 0x80;
  const s = new Array<bigint>(25).fill(0n);
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(padded[off + i * 8 + b]!);
      s[i] = s[i]! ^ lane;
    }
    for (let round = 0; round < 24; round++) {
      const c = [0, 1, 2, 3, 4].map((x) => s[x]! ^ s[x + 5]! ^ s[x + 10]! ^ s[x + 15]! ^ s[x + 20]!);
      for (let x = 0; x < 5; x++) {
        const d = c[(x + 4) % 5]! ^ rotl(c[(x + 1) % 5]!, 1);
        for (let y = 0; y < 25; y += 5) s[y + x] = s[y + x]! ^ d;
      }
      const b = new Array<bigint>(25);
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y]!, ROT[x + 5 * y]!);
      }
      for (let x = 0; x < 5; x++) {
        for (let y = 0; y < 25; y += 5) s[y + x] = b[y + x]! ^ (~b[y + ((x + 1) % 5)]! & M64 & b[y + ((x + 2) % 5)]!);
      }
      s[0] = s[0]! ^ RC[round]!;
    }
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) for (let b = 0; b < 8; b++) out[i * 8 + b] = Number((s[i]! >> BigInt(8 * b)) & 0xffn);
  return out;
}

/** EIP-55 checksum address (interfaces F0: checksum on output). */
function checksum(address: string | null | undefined): string | null {
  if (!address) return null;
  const hex = address.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(hex)) fail(`bad address ${address}`);
  const hash = keccak256(new TextEncoder().encode(hex));
  let out = "0x";
  for (let i = 0; i < 40; i++) {
    const nibble = (hash[i >> 1]! >> (i % 2 === 0 ? 4 : 0)) & 0xf;
    out += nibble >= 8 ? hex[i]!.toUpperCase() : hex[i];
  }
  return out;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

if (checksum("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266") !== "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266") {
  fail("keccak self-test failed");
}

const chainIdArg = process.argv[2];
if (!chainIdArg || !/^\d+$/.test(chainIdArg)) fail("usage: node script/deployment-json.ts <chainId> [--broadcast f] [--out f]");
const chainId = Number(chainIdArg);

const contractsDir = resolve(import.meta.dirname, "..");
const broadcastPath = resolve(arg("--broadcast") ?? join(contractsDir, "broadcast", "Deploy.s.sol", String(chainId), "run-latest.json"));
const name = chainId === 1874 ? "whitechain" : chainId === 1337 ? "devnet" : "local";
const outPath = resolve(arg("--out") ?? join(contractsDir, "..", "deployments", `${name}.json`));

let run: Broadcast;
try {
  run = JSON.parse(readFileSync(broadcastPath, "utf8")) as Broadcast;
} catch (e) {
  fail(`cannot read ${broadcastPath}: ${(e as Error).message}`);
}
if (run.chain !== chainId) fail(`broadcast is for chain ${run.chain}, not ${chainId}`);

const lower = (a: string | null | undefined) => (a ?? "").toLowerCase();
const receiptOf = (hash: string) => run.receipts.find((r) => r.transactionHash === hash);
for (const tx of run.transactions) {
  const r = receiptOf(tx.hash);
  if (!r) fail(`no receipt for ${tx.hash}: the broadcast did not finish`);
  if (r.status !== "0x1") fail(`transaction ${tx.hash} (${tx.contractName ?? tx.function}) failed`);
}

const created = (contract: string) => {
  const tx = run.transactions.find((t) => t.transactionType.startsWith("CREATE") && t.contractName === contract);
  if (!tx || !tx.contractAddress) fail(`no ${contract} deployment in ${broadcastPath}`);
  return tx;
};
const called = (fn: string) => run.transactions.find((t) => t.transactionType === "CALL" && t.function?.startsWith(fn));

const verifierTx = created("HonkVerifier");
const registryTx = created("WatermarkRegistry");

// Linked verifier libraries: "src/generated/Verifier.sol:ZKTranscriptLib:0x..."
const libraries: Record<string, string> = {};
const libraryTx: Record<string, string> = {};
for (const entry of run.libraries ?? []) {
  const [, libName, address] = entry.split(":");
  if (!libName || !address) continue;
  libraries[libName] = checksum(address)!;
  const tx =
    run.transactions.find((t) => lower(t.contractAddress) === lower(address)) ??
    run.transactions.find((t) => {
      const r = receiptOf(t.hash);
      return lower(r?.contractAddress) === lower(address);
    });
  if (tx) libraryTx[libName] = tx.hash;
}

// appId: the script's return value, else the AppRegistered log of the registry.
let appId = run.returns?.appId?.value;
const registerTx = called("registerApp");
if (!appId && registerTx) {
  const log = receiptOf(registerTx.hash)?.logs.find(
    (l) => lower(l.address) === lower(registryTx.contractAddress) && l.topics[0] === APP_REGISTERED_TOPIC,
  );
  if (log) appId = BigInt(log.topics[1]!).toString();
}
if (!appId) fail("could not find appId (no run() return value and no AppRegistered log)");

const setCaRootTx = called("setCaRoot");
const txHashes: Record<string, string> = {
  ...libraryTx,
  verifier: verifierTx.hash,
  registry: registryTx.hash,
};
if (setCaRootTx) txHashes.setCaRoot = setCaRootTx.hash;
if (registerTx) txHashes.registerApp = registerTx.hash;

const deployment = {
  chainId,
  registry: checksum(registryTx.contractAddress),
  verifier: checksum(verifierTx.contractAddress),
  sponsor: null,
  paymaster: null,
  usdt: chainId === 1874 ? WHITECHAIN_USDT : null,
  appId: BigInt(appId).toString(),
  deployedAt: new Date(run.timestamp > 1e12 ? run.timestamp : run.timestamp * 1000).toISOString(),
  deployer: checksum(registryTx.transaction.from),
  caRoot: setCaRootTx?.arguments?.[0] ?? null,
  rulesRoot: registerTx?.arguments?.[1] ?? null,
  sessionSigner: checksum(registerTx?.arguments?.[2]),
  libraries,
  blockNumber: Number(BigInt(receiptOf(registryTx.hash)!.blockNumber)),
  txHashes,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(deployment, null, 2) + "\n");
console.log(`wrote ${outPath}`);
console.log(JSON.stringify(deployment, null, 2));

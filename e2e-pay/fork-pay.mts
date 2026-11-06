// Driver for fork-pay.sh: the website's own payment code against the real relayer server and the REAL Whitechain USDT,
// all on a local anvil fork. It refuses to run against anything that isn't anvil. Prints PASS/FAIL lines with the
// evidence; exits 1 on any FAIL. Never prints a private key, a signature or a request body.
import { readFileSync } from "node:fs";

const env = (k: string) => {
  const v = process.env[k];
  if (v === undefined) throw new Error(`${k} is not set (run fork-pay.sh)`);
  return v;
};
const ROOT = env("ROOT");
const RPC = env("RPC");
const RELAYER_URL = env("RELAYER_URL");
const SPONSOR = env("SPONSOR") as `0x${string}`;
const REAL_SPONSOR = (process.env.REAL_SPONSOR ?? "") as `0x${string}` | "";
const LIVE_APP_ID = BigInt(env("LIVE_APP_ID"));
const REGISTRY = env("REGISTRY") as `0x${string}`;
const RELAYER_ADDR = env("RELAYER_ADDR") as `0x${string}`;
const BUSINESS_ADDR = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
/** Holds real test USDT on Whitechain; impersonated inside the fork only, to top up the business and a stranger. */
const HOLDER = "0x72b6B557Fee237ECdc0A88A9D9850049acfaFC4b";

// viem from the web package (the same copy the website bundles), and the website's own modules.
const viem = await import(`${ROOT}/web/node_modules/viem/_esm/index.js`);
const accounts = await import(`${ROOT}/web/node_modules/viem/_esm/accounts/index.js`);
const usdtLib = await import(`${ROOT}/web/src/lib/usdt.ts`);
const payLib = await import(`${ROOT}/web/src/lib/pay.ts`);
const client = await import(`${ROOT}/web/src/lib/relayer.ts`);
const { sponsorAbi, usdtAbi, registryAbi } = await import(`${ROOT}/relayer/src/abi.ts`);
const USDT = usdtLib.USDT_ADDRESS as `0x${string}`;

const results: { ok: boolean; name: string; evidence: string }[] = [];
function check(name: string, ok: boolean, evidence: string) {
  results.push({ ok, name, evidence });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${evidence}`);
}
const j = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? v.toString() : v));

async function rpc(method: string, params: unknown[]) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await r.json()) as { result?: unknown; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

// ------------------------------------------------------------------ guard: local anvil fork of 1874 only
const clientVersion = String(await rpc("web3_clientVersion", []));
if (!/anvil/i.test(clientVersion) || !/^http:\/\/127\.0\.0\.1:/.test(RPC)) {
  console.error(`refusing to run: ${RPC} is not a local anvil (${clientVersion})`);
  process.exit(2);
}
const fork = viem.defineChain({
  id: 1874,
  name: "Whitechain Sepolia (local fork)",
  nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});
const pc = viem.createPublicClient({ chain: fork, transport: viem.http(RPC) });
check("local fork", (await pc.getChainId()) === 1874, `${clientVersion}, chainId 1874, block ${await pc.getBlockNumber()}`);

const read = (address: string, abi: unknown, functionName: string, args: unknown[] = []) =>
  pc.readContract({ address, abi, functionName, args });
const usdtOf = (w: string) => read(USDT, usdtAbi, "balanceOf", [w]) as Promise<bigint>;
const wbtOf = (w: string) => pc.getBalance({ address: w });
const nonceOf = (w: string) => pc.getTransactionCount({ address: w });

// ------------------------------------------------------------------ the token really is Whitechain USDT
const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const impl = `0x${String(await rpc("eth_getStorageAt", [USDT, implSlot, "latest"])).slice(-40)}`;
const onChainSep = await read(USDT, usdtAbi, "DOMAIN_SEPARATOR");
const webSep = viem.hashDomain({
  domain: usdtLib.USDT_DOMAIN,
  types: { EIP712Domain: viem.getTypesForEIP712Domain({ domain: usdtLib.USDT_DOMAIN }) },
});
check(
  "real USDT + web EIP-712 domain",
  onChainSep === usdtLib.USDT_DOMAIN_SEPARATOR && webSep === onChainSep,
  `token ${USDT} (EIP-1967 impl ${impl}, name ${j(await read(USDT, viem.parseAbi(["function name() view returns (string)"]), "name"))}, ` +
    `decimals ${await read(USDT, usdtAbi, "decimals")}); DOMAIN_SEPARATOR() ${onChainSep} == web USDT_DOMAIN hash ${webSep}`,
);

// ------------------------------------------------------------------ A1: the sponsor DeploySponsor.s.sol made
const sp = async (addr: string) => ({
  registry: await read(addr, sponsorAbi, "registry"),
  appId: await read(addr, sponsorAbi, "appId"),
  usdt: await read(addr, sponsorAbi, "usdt"),
  relayer: await read(addr, sponsorAbi, "relayer"),
  quotaPerDay: await read(addr, sponsorAbi, "quotaPerDay"),
});
const forkSponsor = await sp(SPONSOR);
check(
  "A1 fork sponsor from DeploySponsor.s.sol",
  forkSponsor.registry === REGISTRY && forkSponsor.appId === LIVE_APP_ID && forkSponsor.usdt === USDT && forkSponsor.relayer === RELAYER_ADDR,
  `${SPONSOR} ${j(forkSponsor)}`,
);

// ------------------------------------------------------------------ A2: state inside the fork
// Stamp a fresh 0-WBT burner for the live app in the REAL registry v2: stampExpiry is slot 4,
// mapping(address => mapping(uint256 => uint64)). The slot is checked against a real stamp first.
const stampSlot = (wallet: string, appId: bigint) => {
  const inner = viem.keccak256(viem.encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [wallet, 4n]));
  return viem.keccak256(viem.encodeAbiParameters([{ type: "uint256" }, { type: "bytes32" }], [appId, inner]));
};
const realStamped = "0xefa2a1cfee2d3812088ded20096a677116d28cc8";
const realRaw = BigInt(String(await rpc("eth_getStorageAt", [REGISTRY, stampSlot(realStamped, LIVE_APP_ID), "latest"])));
const realExpiry = await read(REGISTRY, viem.parseAbi(["function stampExpiry(address,uint256) view returns (uint64)"]), "stampExpiry", [realStamped, LIVE_APP_ID]);
check("A2 stampExpiry slot layout", realRaw === BigInt(realExpiry) && realRaw > 0n, `slot value ${realRaw} == stampExpiry(0xefa2…8cc8) ${realExpiry}`);

const burner = accounts.privateKeyToAccount(accounts.generatePrivateKey());
const stranger = accounts.privateKeyToAccount(accounts.generatePrivateKey()); // never stamped
const shop = accounts.privateKeyToAccount(accounts.generatePrivateKey()).address; // a fresh recipient
const expiry = BigInt(Math.floor(Date.now() / 1000) + 30 * 86400);
await rpc("anvil_setStorageAt", [REGISTRY, stampSlot(burner.address, LIVE_APP_ID), viem.pad(viem.toHex(expiry), { size: 32 })]);
const [stampedOk] = (await read(REGISTRY, registryAbi, "isStamped", [burner.address, LIVE_APP_ID])) as [boolean, bigint];
const [strangerOk] = (await read(REGISTRY, registryAbi, "isStamped", [stranger.address, LIVE_APP_ID])) as [boolean, bigint];
check(
  "A2 burner stamped (registry v2, live app), stranger not",
  stampedOk && !strangerOk && (await wbtOf(burner.address)) === 0n && (await wbtOf(stranger.address)) === 0n,
  `burner …${burner.address.slice(-4)} isStamped=${stampedOk}, stranger …${stranger.address.slice(-4)} isStamped=${strangerOk}; both hold 0 WBT`,
);

// The business gets 5 USDT and the stranger 1 USDT from a real holder, impersonated in the fork.
await rpc("anvil_impersonateAccount", [HOLDER]);
await rpc("anvil_setBalance", [HOLDER, viem.toHex(10n ** 18n)]);
const holderWc = viem.createWalletClient({ account: HOLDER, chain: fork, transport: viem.http(RPC) });
for (const [to, amount] of [[BUSINESS_ADDR, 5_000_000n], [stranger.address, 1_000_000n]] as const) {
  const h = await holderWc.writeContract({ address: USDT, abi: usdtAbi, functionName: "transfer", args: [to, amount] });
  await pc.waitForTransactionReceipt({ hash: h });
}
await rpc("anvil_stopImpersonatingAccount", [HOLDER]);

// ------------------------------------------------------------------ A3: the relayer server
const health = (await (await fetch(`${RELAYER_URL}/health`)).json()) as Record<string, unknown>;
check(
  "A3 relayer /health",
  health.relayer === RELAYER_ADDR && health.sponsor === SPONSOR && health.business === BUSINESS_ADDR,
  j({ relayer: health.relayer, sponsor: health.sponsor, business: health.business }),
);

/** POST with raw fetch, to see the exact status and reason the relayer sends (the web client maps them). */
async function rawPost(path: string, body: unknown) {
  const r = await fetch(`${RELAYER_URL}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const b = (await r.json().catch(() => null)) as Record<string, string> | null;
  return { status: r.status, reason: b?.reason, detail: b?.detail };
}
/** The RelayerError code the website would show for the same answer. */
async function webCode(p: Promise<unknown>) {
  try {
    await p;
    return "no error";
  } catch (e) {
    return e instanceof client.RelayerError ? `${e.code}/${e.status}` : String(e);
  }
}

// ------------------------------------------------------------------ A4..A7: /balance and /fund via the web client
const b0 = await client.getBalance(RELAYER_URL, burner.address);
check("A4 web getBalance before funding", b0.usdt === "0" && b0.quotaLeft === 20, j(b0));

const fund = await client.postFund(RELAYER_URL, burner.address);
const fundTx = await pc.getTransaction({ hash: fund.txHash });
const fundRc = await pc.getTransactionReceipt({ hash: fund.txHash });
const burnerUsdtAfterFund = await usdtOf(burner.address);
check(
  "A5 web postFund: the business sends 2 USDT and pays its own gas",
  fundRc.status === "success" && fundTx.from.toLowerCase() === BUSINESS_ADDR.toLowerCase() && fundTx.to?.toLowerCase() === USDT.toLowerCase() && burnerUsdtAfterFund === 2_000_000n &&
    fund.from?.toLowerCase() === BUSINESS_ADDR.toLowerCase(),
  `tx ${fund.txHash} from ${fundTx.from} to ${fundTx.to} status ${fundRc.status}; burner USDT ${burnerUsdtAfterFund}; web TxResponse.from = ${fund.from}`,
);
const again = await webCode(client.postFund(RELAYER_URL, burner.address));
check("A6 second /fund refused", again === "ALREADY_FUNDED/409", again);
const b1 = await client.getBalance(RELAYER_URL, burner.address);
check("A7 web getBalance after funding", b1.usdt === "2" && b1.quotaLeft === 20, j(b1));

// ------------------------------------------------------------------ A8: the gasless payment, signed by the web code
const amount = payLib.checkAmount("1.5", "5", b1.usdt);
const intent = payLib.buildIntent({ from: burner.address, to: shop, value: amount.ok ? amount.value : 0n, nowMs: Date.now(), nonce: payLib.randomNonce() });
const signed = await payLib.signPayment(burner, intent);
const before = {
  burnerUsdt: await usdtOf(burner.address),
  shopUsdt: await usdtOf(shop),
  burnerWbt: await wbtOf(burner.address),
  burnerNonce: await nonceOf(burner.address),
  relayerWbt: await wbtOf(RELAYER_ADDR),
  relayerNonce: await nonceOf(RELAYER_ADDR),
};
const paid = await client.postPay(RELAYER_URL, signed);
const tx = await pc.getTransaction({ hash: paid.txHash });
const rc = await pc.getTransactionReceipt({ hash: paid.txHash });
const after = {
  burnerUsdt: await usdtOf(burner.address),
  shopUsdt: await usdtOf(shop),
  burnerWbt: await wbtOf(burner.address),
  burnerNonce: await nonceOf(burner.address),
  relayerWbt: await wbtOf(RELAYER_ADDR),
  relayerNonce: await nonceOf(RELAYER_ADDR),
};
check("A8 receipt status 1", rc.status === "success", `tx ${paid.txHash} block ${rc.blockNumber} gasUsed ${rc.gasUsed} (MAX_GAS_PER_PAY 300000)`);
check(
  "A8 tx.from == relayer, tx.to == sponsor",
  tx.from.toLowerCase() === RELAYER_ADDR.toLowerCase() && tx.to?.toLowerCase() === SPONSOR.toLowerCase(),
  `from ${tx.from} to ${tx.to}`,
);
const call = viem.decodeFunctionData({ abi: sponsorAbi, data: tx.input });
const sentIntent = call.args[0] as Record<string, unknown>;
check(
  "A8 relayPayment carries exactly the web-signed intent and signature",
  call.functionName === "relayPayment" &&
    sentIntent.from === intent.from && sentIntent.to === intent.to && sentIntent.value === BigInt(intent.value) &&
    sentIntent.validAfter === BigInt(intent.validAfter) && sentIntent.validBefore === BigInt(intent.validBefore) &&
    sentIntent.nonce === intent.nonce && call.args[1] === signed.signature.toLowerCase(),
  `relayPayment(value ${sentIntent.value}, validAfter ${sentIntent.validAfter}, validBefore ${sentIntent.validBefore}, nonce match, sig match)`,
);
const transferLogs = viem.parseEventLogs({
  abi: viem.parseAbi(["event Transfer(address indexed from, address indexed to, uint256 value)", "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)"]),
  logs: rc.logs,
});
const usdtTransfer = transferLogs.find((l: { eventName: string; address: string }) => l.eventName === "Transfer" && l.address.toLowerCase() === USDT.toLowerCase());
const authUsed = transferLogs.find((l: { eventName: string; address: string }) => l.eventName === "AuthorizationUsed" && l.address.toLowerCase() === USDT.toLowerCase());
check(
  "A8 the real USDT emitted Transfer(burner → shop, 1.5) and AuthorizationUsed",
  !!usdtTransfer && usdtTransfer.args.from === burner.address && usdtTransfer.args.to === shop && usdtTransfer.args.value === 1_500_000n && !!authUsed && authUsed.args.nonce === intent.nonce,
  `Transfer ${j(usdtTransfer?.args)} from ${usdtTransfer?.address}; AuthorizationUsed nonce matches=${authUsed?.args.nonce === intent.nonce}`,
);
check(
  "A8 USDT moved: burner -1.5, shop +1.5",
  before.burnerUsdt - after.burnerUsdt === 1_500_000n && after.shopUsdt - before.shopUsdt === 1_500_000n,
  `burner ${before.burnerUsdt} → ${after.burnerUsdt}, shop ${before.shopUsdt} → ${after.shopUsdt}`,
);
// Whitechain is an OP Stack chain: the sender also pays an L1 data fee, which the receipt reports as l1Fee.
const rawRc = (await rpc("eth_getTransactionReceipt", [paid.txHash])) as { l1Fee?: string };
const l1Fee = rawRc.l1Fee ? BigInt(rawRc.l1Fee) : 0n;
const cost = rc.gasUsed * rc.effectiveGasPrice + l1Fee;
const relayerPaid = before.relayerWbt - after.relayerWbt;
// anvil's fork also charges a few thousand wei of L1 data fee without reporting it in the receipt; allow up to 1 gwei.
const unreported = relayerPaid - cost;
check(
  "A8 payer paid 0 gas; the relayer paid all of it",
  after.burnerWbt === 0n && before.burnerWbt === 0n && after.burnerNonce === 0 && unreported >= 0n && unreported < 10n ** 9n && after.relayerNonce === before.relayerNonce + 1 &&
    paid.from?.toLowerCase() === RELAYER_ADDR.toLowerCase(),
  `burner WBT ${before.burnerWbt} → ${after.burnerWbt}, burner nonce ${before.burnerNonce} → ${after.burnerNonce}; relayer WBT -${relayerPaid} wei ` +
    `(gasUsed × effectiveGasPrice ${rc.gasUsed * rc.effectiveGasPrice} + l1Fee ${l1Fee} + unreported ${unreported}), relayer nonce ${before.relayerNonce} → ${after.relayerNonce}; ` +
    `web TxResponse.from = ${paid.from}`,
);
const authState = await read(USDT, usdtAbi, "authorizationState", [burner.address, intent.nonce]);
check("A8 USDT.authorizationState(burner, nonce) is used", authState === true, String(authState));
const b2 = await client.getBalance(RELAYER_URL, burner.address);
check("A9 web getBalance after paying", b2.usdt === "0.5" && b2.quotaLeft === 19, j(b2));

// ------------------------------------------------------------------ A10..A13: refusals spend no relayer gas
async function refusal(name: string, body: unknown, want: { status: number; reason: string; web?: string }, extraOk = true, extraEvidence = "") {
  const n0 = await nonceOf(RELAYER_ADDR);
  const w0 = await wbtOf(RELAYER_ADDR);
  const raw = await rawPost("/pay", body);
  const n1 = await nonceOf(RELAYER_ADDR);
  const w1 = await wbtOf(RELAYER_ADDR);
  const web = await webCode(client.postPay(RELAYER_URL, body as { intent: unknown; signature: `0x${string}` }));
  check(
    name,
    raw.status === want.status && raw.reason === want.reason && n1 === n0 && w1 === w0 && extraOk && (want.web === undefined || web === want.web),
    `${raw.status} ${raw.reason}${raw.detail ? ` (${raw.detail})` : ""}; relayer nonce ${n0} → ${n1}, WBT unchanged=${w1 === w0}; website sees ${web}${extraEvidence}`,
  );
}

await refusal("A10 replay of the same signed body", signed, { status: 409, reason: "NONCE_USED", web: "NONCE_USED/409" });

const over = payLib.buildIntent({ from: burner.address, to: shop, value: 1_000_000n, nowMs: Date.now(), nonce: payLib.randomNonce() });
await refusal("A11 more than the balance (1 USDT with 0.5)", await payLib.signPayment(burner, over), { status: 422, reason: "INSUFFICIENT_USDT", web: "INSUFFICIENT_FUNDS/422" });

const sUsdt0 = await usdtOf(stranger.address);
const strangerIntent = payLib.buildIntent({ from: stranger.address, to: shop, value: 500_000n, nowMs: Date.now(), nonce: payLib.randomNonce() });
const strangerBody = await payLib.signPayment(stranger, strangerIntent);
await refusal("A12 unstamped wallet (holds 1 USDT, 0 WBT)", strangerBody, { status: 403, reason: "NOT_STAMPED" });
const sUsdt1 = await usdtOf(stranger.address);
check(
  "A12 unstamped wallet unchanged",
  sUsdt0 === sUsdt1 && (await wbtOf(stranger.address)) === 0n && (await nonceOf(stranger.address)) === 0,
  `USDT ${sUsdt0} → ${sUsdt1}, WBT 0, nonce 0`,
);
const strangerFund = await rawPost("/fund", { wallet: stranger.address });
const strangerBal = await client.getBalance(RELAYER_URL, stranger.address);
check("A12 /fund and /balance for the unstamped wallet", strangerFund.status === 403 && strangerFund.reason === "NOT_STAMPED" && strangerBal.quotaLeft === 0, `/fund ${strangerFund.status} ${strangerFund.reason}; /balance ${j(strangerBal)}`);
// The contract enforces it too, not only the relayer: simulate relayPayment from the relayer for the stranger.
let contractReason = "no revert";
try {
  await pc.simulateContract({
    address: SPONSOR, abi: sponsorAbi, functionName: "relayPayment", account: RELAYER_ADDR,
    args: [{ ...strangerIntent, value: BigInt(strangerIntent.value), validAfter: 0n, validBefore: BigInt(strangerIntent.validBefore) }, strangerBody.signature],
  });
} catch (e) {
  const r = (e as { walk: (f: (x: unknown) => boolean) => { data?: { errorName?: string } } }).walk((x) => x instanceof viem.ContractFunctionRevertedError);
  contractReason = r?.data?.errorName ?? String(e).slice(0, 80);
}
check("A12 sponsor contract itself reverts NotStamped", contractReason === "NotStamped", contractReason);

const tampered = { intent: { ...over, value: "100000" }, signature: (await payLib.signPayment(burner, over)).signature };
await refusal("A13 tampered intent (value changed after signing)", tampered, { status: 401, reason: "BAD_SIGNATURE" });

// ------------------------------------------------------------------ B: the sponsor already deployed on Whitechain
if (!REAL_SPONSOR) {
  console.log("SKIP  B: REAL_SPONSOR is empty");
} else if ((await pc.getCode({ address: REAL_SPONSOR })) === undefined) {
  check("B0 REAL_SPONSOR has code", false, `${REAL_SPONSOR} has no code on the fork`);
} else {
  const real = await sp(REAL_SPONSOR);
  check(
    "B1 deployed sponsor immutables",
    real.registry === REGISTRY && real.appId === LIVE_APP_ID && real.usdt === USDT,
    `${REAL_SPONSOR} ${j(real)}`,
  );
  // Same source? Deploy contracts/src/WatermarkSponsor.sol with the same constructor args in the fork and compare code.
  const art = JSON.parse(readFileSync(`${ROOT}/contracts/out/WatermarkSponsor.sol/WatermarkSponsor.json`, "utf8"));
  const deployer = accounts.privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const dwc = viem.createWalletClient({ account: deployer, chain: fork, transport: viem.http(RPC) });
  const twinHash = await dwc.deployContract({ abi: art.abi, bytecode: art.bytecode.object, args: [real.registry, real.appId, real.usdt, real.relayer, real.quotaPerDay] });
  const twin = (await pc.waitForTransactionReceipt({ hash: twinHash })).contractAddress as string;
  const realCode = await pc.getCode({ address: REAL_SPONSOR });
  const twinCode = await pc.getCode({ address: twin });
  check("B2 deployed bytecode == this repo's WatermarkSponsor.sol", realCode === twinCode, `runtime ${(realCode.length - 2) / 2} bytes, identical=${realCode === twinCode}`);

  // The real relayer (impersonated in the fork only) relays a web-signed authorization through the real sponsor.
  const b0r = await usdtOf(burner.address);
  const s0r = await usdtOf(shop);
  const q0 = await read(REAL_SPONSOR, sponsorAbi, "quotaLeft", [burner.address]);
  const realIntent = payLib.buildIntent({ from: burner.address, to: shop, value: 250_000n, nowMs: Date.now(), nonce: payLib.randomNonce() });
  const realSigned = await payLib.signPayment(burner, realIntent);
  await rpc("anvil_impersonateAccount", [real.relayer]);
  const rwc = viem.createWalletClient({ account: real.relayer, chain: fork, transport: viem.http(RPC) });
  const rh = await rwc.writeContract({
    address: REAL_SPONSOR, abi: sponsorAbi, functionName: "relayPayment",
    args: [{ ...realIntent, value: 250_000n, validAfter: 0n, validBefore: BigInt(realIntent.validBefore) }, realSigned.signature],
  });
  await rpc("anvil_stopImpersonatingAccount", [real.relayer]);
  const rr = await pc.waitForTransactionReceipt({ hash: rh });
  const q1 = await read(REAL_SPONSOR, sponsorAbi, "quotaLeft", [burner.address]);
  check(
    "B3 real sponsor + real USDT pay a web-signed authorization (fork only)",
    rr.status === "success" && b0r - (await usdtOf(burner.address)) === 250_000n && (await usdtOf(shop)) - s0r === 250_000n && (await wbtOf(burner.address)) === 0n && q1 === q0 - 1,
    `relayer ${real.relayer} → ${REAL_SPONSOR}: status ${rr.status}, gasUsed ${rr.gasUsed}; burner -0.25 USDT, shop +0.25, burner WBT 0, quotaLeft ${q0} → ${q1}`,
  );
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} PASS${failed.length ? `; FAILED: ${failed.map((f) => f.name).join("; ")}` : ""}`);
process.exit(failed.length ? 1 : 0);

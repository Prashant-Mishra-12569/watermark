/** On-chain reads (/status) and writes (/stamp). Behind interfaces so the routes can be tested without a network. */
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { altmempoolDevnet, sessionTypedData, whitechainSepolia, type StampStatus } from "@watermark/sdk";
import { registryAbi, sponsorAbi, usdtAbi } from "./abi.ts";
import type { ChainConfig } from "./config.ts";
import { PayRejected, type FundWriter, type PayCall, type PayReader, type PayWriter } from "./pay.ts";
import type { AppSignerReader } from "./preflight.ts";
import { StampRejected, type ChainWriter, type StampCall } from "./stamp.ts";

export interface ChainReader {
  status(chain: ChainConfig, wallet: Address, appId: bigint): Promise<StampStatus>;
}

/** The sdk chain definition for a configured chain, pointed at the configured RPC URL. */
function chainFor(c: ChainConfig): Chain {
  const base = c.chainId === whitechainSepolia.id ? whitechainSepolia : altmempoolDevnet;
  if (base.id !== c.chainId) throw new Error(`unsupported chain ${c.chainId}`);
  return { ...base, rpcUrls: { default: { http: [c.rpcUrl] } } };
}

function publicClients() {
  const clients = new Map<number, PublicClient>();
  return (c: ChainConfig) => {
    let pc = clients.get(c.chainId);
    if (!pc) {
      pc = createPublicClient({ chain: chainFor(c), transport: http(c.rpcUrl, { timeout: 10_000 }), pollingInterval: 1_000 });
      clients.set(c.chainId, pc);
    }
    return pc;
  };
}

export function viemChainReader(): ChainReader {
  const client = publicClients();
  return {
    async status(c, wallet, appId) {
      if (!c.registry) throw new Error("no registry");
      const pc = client(c);
      const [ok, expiresAt] = await pc.readContract({
        address: c.registry,
        abi: registryAbi,
        functionName: "isStamped",
        args: [wallet, appId],
      });
      // WatermarkSponsor is one per app (F5). Until it is deployed, quotaLeft reads as 0.
      const quotaLeft =
        ok && c.sponsor
          ? await pc.readContract({ address: c.sponsor, abi: sponsorAbi, functionName: "quotaLeft", args: [wallet] })
          : 0;
      return { stamped: ok, expiresAt: Number(expiresAt), quotaLeft };
    },
  };
}

/** apps(appId).sessionSigner on the configured registry (preflight.ts). */
export function viemAppSignerReader(): AppSignerReader {
  const client = publicClients();
  return async (c, appId) => {
    if (!c.registry) throw new Error("no registry");
    const [, , sessionSigner] = await client(c).readContract({
      address: c.registry,
      abi: registryAbi,
      functionName: "apps",
      args: [appId],
    });
    return sessionSigner;
  };
}

/**
 * The registry's revert reason, as its custom error name (or its 4-byte selector when the name is unknown).
 * Returns null when the failure is not a contract revert (RPC down, bad response, …).
 */
export function revertReason(err: unknown): string | null {
  if (!(err instanceof BaseError)) return null;
  const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
  if (!(revert instanceof ContractFunctionRevertedError)) return null;
  if (revert.data?.errorName) return revert.data.errorName;
  if (revert.signature) return revert.signature;
  if (revert.raw && revert.raw.length >= 10) return revert.raw.slice(0, 10);
  // viem also maps JSON-RPC -32603 "internal error" here; only a message that says "revert" is a real revert.
  return /revert/i.test(`${revert.reason ?? ""} ${revert.shortMessage} ${revert.details}`) ? "UNKNOWN_REVERT" : null;
}

/**
 * Like revertReason, for payments: a custom error keeps its name (`NotStamped`, `QuotaUsed`, …), but USDT's
 * Error(string) reverts (bubbled up unchanged by WatermarkSponsor) give their text, such as "TetherToken: auth invalid"
 * or "ERC20: transfer amount exceeds balance". A Panic gives `Panic(<code>)`.
 */
export function payRevertReason(err: unknown): string | null {
  if (!(err instanceof BaseError)) return null;
  const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
  if (!(revert instanceof ContractFunctionRevertedError)) return null;
  const name = revert.data?.errorName;
  if (name === "Error" && typeof revert.data?.args?.[0] === "string") return revert.data.args[0];
  if (name === "Panic") return `Panic(${String(revert.data?.args?.[0] ?? "")})`;
  if (!name && revert.reason) return revert.reason;
  return revertReason(err);
}

function stampArgs(call: StampCall) {
  return [sessionTypedData(call.session).message, call.sig, call.proof, call.publicInputs] as const;
}

/** OP Stack receipts (Whitechain) carry an L1 data fee on top of gasUsed × effectiveGasPrice. */
function l1Fee(receipt: unknown): bigint {
  const v = (receipt as { l1Fee?: unknown }).l1Fee;
  try {
    return typeof v === "bigint" ? v : typeof v === "string" && v ? BigInt(v) : 0n;
  } catch {
    return 0n;
  }
}

async function fees(pc: PublicClient) {
  const { maxFeePerGas, maxPriorityFeePerGas } = await pc.estimateFeesPerGas();
  return { maxFeePerGas, maxPriorityFeePerGas };
}

async function receipt(pc: PublicClient, hash: Hex, timeoutMs: number) {
  try {
    const r = await pc.waitForTransactionReceipt({ hash, timeout: timeoutMs, pollingInterval: 1_000 });
    return { status: r.status, costWei: r.gasUsed * r.effectiveGasPrice + l1Fee(r) };
  } catch {
    // A timeout, or RPC trouble while waiting: the tx may still land, so both are reported as pending.
    return { status: "timeout" as const };
  }
}

const rethrowPay = (err: unknown): never => {
  const reason = payRevertReason(err);
  throw reason ? new PayRejected(reason) : err;
};

/** Reads for /pay, /fund and /balance. */
export function viemPayReader(): PayReader {
  const client = publicClients();
  return {
    async sponsorInfo(c) {
      const pc = client(c);
      const read = <F extends "appId" | "registry" | "relayer" | "usdt">(functionName: F) =>
        pc.readContract({ address: c.sponsor, abi: sponsorAbi, functionName });
      const [appId, registry, relayer, usdt] = await Promise.all([read("appId"), read("registry"), read("relayer"), read("usdt")]);
      return { appId, registry, relayer, usdt };
    },
    async isStamped(c, registry, wallet, appId) {
      const [ok] = await client(c).readContract({ address: registry, abi: registryAbi, functionName: "isStamped", args: [wallet, appId] });
      return ok;
    },
    async quotaLeft(c, wallet) {
      return client(c).readContract({ address: c.sponsor, abi: sponsorAbi, functionName: "quotaLeft", args: [wallet] });
    },
    async usdtBalance(c, wallet) {
      return client(c).readContract({ address: c.usdt, abi: usdtAbi, functionName: "balanceOf", args: [wallet] });
    },
  };
}

/** relayPayment(intent, userSig) on WatermarkSponsor, sent from the relayer key (which pays the gas). */
export function viemPayWriter(relayerKey: Hex): PayWriter {
  const account = privateKeyToAccount(relayerKey);
  const client = publicClients();
  const contractCall = (call: PayCall) => ({
    address: call.chain.sponsor,
    abi: sponsorAbi,
    functionName: "relayPayment" as const,
    args: [
      {
        from: call.intent.from,
        to: call.intent.to,
        value: BigInt(call.intent.value),
        validAfter: BigInt(call.intent.validAfter),
        validBefore: BigInt(call.intent.validBefore),
        nonce: call.intent.nonce,
      },
      call.signature,
    ] as const,
    account,
  });

  return {
    address: account.address,
    fees: (c) => fees(client(c)),
    async simulate(call, gas, f) {
      await client(call.chain).simulateContract({ ...contractCall(call), gas, ...f }).catch(rethrowPay);
    },
    async estimateGas(call, f) {
      return client(call.chain).estimateContractGas({ ...contractCall(call), ...f }).catch(rethrowPay);
    },
    async send(call, gas, f) {
      const chain = chainFor(call.chain);
      const wallet = createWalletClient({ account, chain, transport: http(call.chain.rpcUrl, { timeout: 15_000 }) });
      return wallet.writeContract({ ...contractCall(call), chain, gas, ...f });
    },
    waitForReceipt: (c, hash, timeoutMs) => receipt(client(c), hash, timeoutMs),
  };
}

/** usdt.transfer(to, amount) from the business key, which pays its own gas (POST /fund). */
export function viemFundWriter(businessKey: Hex): FundWriter {
  const account = privateKeyToAccount(businessKey);
  const client = publicClients();
  const contractCall = (c: { usdt: Address }, to: Address, amount: bigint) => ({
    address: c.usdt,
    abi: usdtAbi,
    functionName: "transfer" as const,
    args: [to, amount] as const,
    account,
  });
  return {
    address: account.address,
    async simulate(c, to, amount) {
      await client(c).simulateContract(contractCall(c, to, amount)).catch(rethrowPay);
    },
    async send(c, to, amount) {
      const chain = chainFor(c);
      const wallet = createWalletClient({ account, chain, transport: http(c.rpcUrl, { timeout: 15_000 }) });
      return wallet.writeContract({ ...contractCall(c, to, amount), chain });
    },
    waitForReceipt: (c, hash, timeoutMs) => receipt(client(c), hash, timeoutMs),
  };
}

export function viemChainWriter(relayerKey: Hex): ChainWriter {
  const account = privateKeyToAccount(relayerKey);
  const client = publicClients();

  const contractCall = (call: StampCall) => ({
    address: call.chain.registry,
    abi: registryAbi,
    functionName: "stamp" as const,
    args: stampArgs(call),
    account,
  });
  const rethrow = (err: unknown): never => {
    const reason = revertReason(err);
    throw reason ? new StampRejected(reason) : err;
  };

  return {
    address: account.address,

    async simulate(call) {
      await client(call.chain).simulateContract(contractCall(call)).catch(rethrow);
    },

    async estimateGas(call) {
      return client(call.chain).estimateContractGas(contractCall(call)).catch(rethrow);
    },

    fees: (c) => fees(client(c)),

    async send(call, gas, fees) {
      const chain = chainFor(call.chain);
      const wallet = createWalletClient({ account, chain, transport: http(call.chain.rpcUrl, { timeout: 15_000 }) });
      // writeContract does not simulate again; it checks eth_chainId against `chain` and uses the pending nonce.
      return wallet.writeContract({ ...contractCall(call), chain, gas, ...fees });
    },

    waitForReceipt: (c, hash, timeoutMs) => receipt(client(c), hash, timeoutMs),
  };
}

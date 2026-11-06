import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddress, hashTypedData, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { whitechainSepolia } from "@watermark/sdk";
import type { KeyStorage } from "./burner.ts";
import { walletErrorCopy } from "./messages.ts";
import { buildIntent } from "./pay.ts";
import { transferAuthorizationTypedData, USDT_DOMAIN } from "./usdt.ts";
import {
  addChainParams,
  ANNOUNCE_EVENT,
  ensureChain,
  LEGACY_RDNS,
  legacyDetail,
  loadWalletChoice,
  mergeProviders,
  nextAccount,
  normalizeSignature,
  parseChainIdValue,
  parseProviderDetail,
  pickProvider,
  REQUEST_EVENT,
  requestAccount,
  saveWalletChoice,
  signTransferWithProvider,
  silentAccount,
  subscribeProvider,
  toWalletError,
  typedDataJson,
  WALLET_CHOICE_KEY,
  WalletError,
  watchProviders,
  type Eip1193RequestArgs,
  type WalletErrorCode,
} from "./wallet.ts";

// ------------------------------------------------------------------ a mocked EIP-1193 wallet

const owner = privateKeyToAccount(`0x${"0a".repeat(32)}`);
const other = privateKeyToAccount(`0x${"0b".repeat(32)}`);
const shop = "0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF" as Address;

type Handler = (params: unknown) => unknown;

function rpcError(code: number, message = "error", data?: unknown) {
  return Object.assign(new Error(message), { code, ...(data ? { data } : {}) });
}

/** A wallet with an active chain, an account list and a real key behind eth_signTypedData_v4. */
class MockWallet {
  calls: Eip1193RequestArgs[] = [];
  chainId = 1874;
  known = new Set<number>([1, 1874]);
  accounts: Address[] = [owner.address];
  signer = owner;
  overrides = new Map<string, Handler>();
  listeners = new Map<string, Set<(p: unknown) => void>>();

  request = async (args: Eip1193RequestArgs): Promise<unknown> => {
    this.calls.push(args);
    const o = this.overrides.get(args.method);
    if (o) return o(args.params);
    const params = (args.params ?? []) as unknown[];
    switch (args.method) {
      case "eth_chainId":
        return `0x${this.chainId.toString(16)}`;
      case "eth_accounts":
      case "eth_requestAccounts":
        return this.accounts.map((a) => a.toLowerCase());
      case "wallet_switchEthereumChain": {
        const id = Number.parseInt((params[0] as { chainId: string }).chainId, 16);
        if (!this.known.has(id)) throw rpcError(4902, "Unrecognized chain ID");
        this.chainId = id;
        return null;
      }
      case "wallet_addEthereumChain": {
        const id = Number.parseInt((params[0] as { chainId: string }).chainId, 16);
        this.known.add(id);
        this.chainId = id; // MetaMask switches after adding
        return null;
      }
      case "eth_signTypedData_v4": {
        const td = JSON.parse(params[1] as string) as {
          domain: typeof USDT_DOMAIN;
          types: Record<string, { name: string; type: string }[]>;
          primaryType: "TransferWithAuthorization";
          message: Record<string, string>;
        };
        if (td.domain.chainId !== this.chainId) throw rpcError(-32603, "chainId must match the active chainId");
        const { EIP712Domain: _domain, ...types } = td.types;
        const m = td.message;
        return this.signer.signTypedData({
          domain: td.domain,
          types,
          primaryType: td.primaryType,
          message: {
            ...m,
            value: BigInt(m.value!),
            validAfter: BigInt(m.validAfter!),
            validBefore: BigInt(m.validBefore!),
          },
        } as never);
      }
      default:
        throw rpcError(4200, "unsupported");
    }
  };

  on = (event: string, l: (p: unknown) => void) => {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(l);
  };
  removeListener = (event: string, l: (p: unknown) => void) => {
    this.listeners.get(event)?.delete(l);
  };
  emit(event: string, payload: unknown) {
    for (const l of this.listeners.get(event) ?? []) l(payload);
  }
  methods() {
    return this.calls.map((c) => c.method);
  }
}

const intentFor = (from: Address) =>
  buildIntent({ from, to: shop, value: 1_000_000n, nowMs: 1_800_000_000_000, nonce: `0x${"ab".repeat(32)}` as Hex });

async function rejectsWith(p: Promise<unknown>, code: WalletErrorCode) {
  await assert.rejects(p, (e: unknown) => e instanceof WalletError && e.code === code);
}

class MapStorage implements KeyStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

// ------------------------------------------------------------------ discovery

const icon = "data:image/svg+xml;base64,PHN2Zy8+";
const announce = (uuid: string, rdns: string, name: string, provider: unknown = new MockWallet()) => ({
  info: { uuid, name, icon, rdns },
  provider,
});

test("parseProviderDetail: keeps a valid announcement, drops bad ones and non-image icons", () => {
  const ok = parseProviderDetail(announce("u1", "io.metamask", "MetaMask"));
  assert.equal(ok?.info.rdns, "io.metamask");
  assert.equal(ok?.info.icon, icon);
  assert.equal(parseProviderDetail({ info: { uuid: "u", name: "X", icon: "https://evil/x.png", rdns: "x.y" }, provider: new MockWallet() })?.info.icon, "");
  assert.equal(parseProviderDetail({ info: { uuid: "u", name: "X", icon, rdns: "x.y" }, provider: {} }), null);
  assert.equal(parseProviderDetail({ info: { uuid: "u", name: "", icon, rdns: "x.y" }, provider: new MockWallet() }), null);
  assert.equal(parseProviderDetail({ info: { uuid: "u", name: "X", icon, rdns: "bad rdns!" }, provider: new MockWallet() }), null);
  assert.equal(parseProviderDetail(null), null);
});

test("watchProviders: requests announcements, lists each wallet once, stops listening", () => {
  const target = new EventTarget();
  let requests = 0;
  const mm = announce("u-mm", "io.metamask", "MetaMask");
  target.addEventListener(REQUEST_EVENT, () => {
    requests++;
    target.dispatchEvent(new CustomEvent(ANNOUNCE_EVENT, { detail: mm }));
  });
  const seen: string[][] = [];
  const watch = watchProviders(target, (list) => seen.push(list.map((d) => d.info.name)), () => undefined);
  assert.equal(requests, 1);
  // A late extension announces itself on its own.
  target.dispatchEvent(new CustomEvent(ANNOUNCE_EVENT, { detail: announce("u-rabby", "io.rabby", "Rabby") }));
  target.dispatchEvent(new CustomEvent(ANNOUNCE_EVENT, { detail: mm })); // duplicate uuid: ignored
  watch.rescan();
  assert.equal(requests, 2);
  assert.deepEqual(seen.at(-1), ["MetaMask", "Rabby"]);
  const count = seen.length;
  watch.stop();
  target.dispatchEvent(new CustomEvent(ANNOUNCE_EVENT, { detail: announce("u-cb", "com.coinbase.wallet", "Coinbase Wallet") }));
  assert.equal(seen.length, count);
});

test("window.ethereum fallback: named from its flags, used only when no wallet announced itself", () => {
  const eth = Object.assign(new MockWallet(), { isMetaMask: true, isRabby: true });
  const legacy = legacyDetail(eth);
  assert.equal(legacy?.info.name, "Rabby");
  assert.equal(legacy?.info.rdns, LEGACY_RDNS);
  assert.equal(legacyDetail(Object.assign(new MockWallet(), { isMetaMask: true }))?.info.name, "MetaMask");
  assert.equal(legacyDetail({}), null);
  assert.deepEqual(mergeProviders([], legacy), [legacy]);
  const announced = parseProviderDetail(announce("u1", "io.metamask", "MetaMask"))!;
  assert.deepEqual(mergeProviders([announced, announced], legacy), [announced]);
  // Without any announcement, watchProviders still finds window.ethereum.
  const lists: string[][] = [];
  watchProviders(new EventTarget(), (l) => lists.push(l.map((d) => d.info.rdns)), () => eth).stop();
  assert.deepEqual(lists.at(-1), [LEGACY_RDNS]);
  assert.equal(pickProvider([announced], "io.metamask"), announced);
  assert.equal(pickProvider([announced], "io.rabby"), null);
});

// ------------------------------------------------------------------ accounts and errors

test("requestAccount: returns the first account in EIP-55, the same last 4 the phone shows", async () => {
  const w = new MockWallet();
  w.accounts = [owner.address, other.address];
  const a = await requestAccount(w);
  assert.equal(a, getAddress(owner.address));
  assert.equal(a.slice(-4), owner.address.slice(-4));
  assert.deepEqual(w.methods(), ["eth_requestAccounts"]);
  assert.equal(await silentAccount(w), owner.address);
});

test("requestAccount: 4001 is USER_REJECTED, -32002 is REQUEST_PENDING, an empty list is NO_ACCOUNT", async () => {
  const w = new MockWallet();
  w.overrides.set("eth_requestAccounts", () => {
    throw rpcError(4001, "User rejected the request.");
  });
  await rejectsWith(requestAccount(w), "USER_REJECTED");
  w.overrides.set("eth_requestAccounts", () => {
    throw rpcError(-32002, "Already processing");
  });
  await rejectsWith(requestAccount(w), "REQUEST_PENDING");
  w.overrides.set("eth_requestAccounts", () => ["not-an-address"]);
  await rejectsWith(requestAccount(w), "NO_ACCOUNT");
  w.overrides.set("eth_accounts", () => {
    throw new Error("locked");
  });
  assert.equal(await silentAccount(w), null);
});

test("toWalletError: reads codes nested by wallets and keeps WalletError as is", () => {
  assert.equal(toWalletError(rpcError(-32603, "Internal", { originalError: { code: 4001 } })).code, "USER_REJECTED");
  assert.equal(toWalletError({ code: 4100 }).code, "UNAUTHORIZED");
  assert.equal(toWalletError({ code: 4200 }).code, "UNSUPPORTED_METHOD");
  assert.equal(toWalletError({ code: 4900 }).code, "DISCONNECTED");
  assert.equal(toWalletError(new Error("boom")).code, "FAILED");
  const e = new WalletError("WRONG_CHAIN");
  assert.equal(toWalletError(e), e);
});

// ------------------------------------------------------------------ chain

test("addChainParams: Whitechain Sepolia from @watermark/sdk, official RPC first", () => {
  const p = addChainParams();
  assert.equal(p.chainId, "0x752");
  assert.equal(p.chainName, "Whitechain Sepolia");
  assert.deepEqual(p.nativeCurrency, { name: "WhiteBIT Coin", symbol: "WBT", decimals: 18 });
  assert.equal(p.rpcUrls[0], "https://rpc.testnet.whitechain.io");
  assert.equal(p.rpcUrls.length, whitechainSepolia.rpcUrls.default.http.length);
  assert.deepEqual(p.blockExplorerUrls, ["https://explorer.testnet.whitechain.io"]);
  assert.equal(parseChainIdValue("0x752"), 1874);
  assert.equal(parseChainIdValue("1874"), 1874);
  assert.equal(parseChainIdValue(1874), 1874);
  assert.equal(parseChainIdValue("chain"), null);
});

test("ensureChain: already on 1874 asks nothing; another known chain is switched", async () => {
  const w = new MockWallet();
  await ensureChain(w);
  assert.deepEqual(w.methods(), ["eth_chainId"]);
  const w2 = new MockWallet();
  w2.chainId = 1;
  await ensureChain(w2);
  assert.equal(w2.chainId, 1874);
  assert.deepEqual(w2.methods(), ["eth_chainId", "wallet_switchEthereumChain", "eth_chainId"]);
  assert.deepEqual(w2.calls[1]!.params, [{ chainId: "0x752" }]);
});

test("ensureChain: 4902 adds Whitechain Sepolia with the sdk values, then it's active", async () => {
  const w = new MockWallet();
  w.chainId = 1;
  w.known = new Set([1]);
  await ensureChain(w);
  assert.equal(w.chainId, 1874);
  const add = w.calls.find((c) => c.method === "wallet_addEthereumChain");
  assert.deepEqual(add?.params, [addChainParams()]);
});

test("ensureChain: MetaMask mobile's nested 4902 also adds; a wallet that doesn't switch after adding is switched", async () => {
  const w = new MockWallet();
  w.chainId = 1;
  w.known = new Set([1]);
  let switches = 0;
  w.overrides.set("wallet_switchEthereumChain", () => {
    switches++;
    if (!w.known.has(1874)) throw rpcError(-32603, "Internal error", { originalError: { code: 4902 } });
    w.chainId = 1874;
    return null;
  });
  w.overrides.set("wallet_addEthereumChain", () => {
    w.known.add(1874); // adds but stays on chain 1
    return null;
  });
  await ensureChain(w);
  assert.equal(switches, 2);
  assert.equal(w.chainId, 1874);
});

test("ensureChain: refused switch or add is USER_REJECTED; a wallet stuck elsewhere is WRONG_CHAIN", async () => {
  const w = new MockWallet();
  w.chainId = 1;
  w.overrides.set("wallet_switchEthereumChain", () => {
    throw rpcError(4001, "User rejected");
  });
  await rejectsWith(ensureChain(w), "USER_REJECTED");

  const w2 = new MockWallet();
  w2.chainId = 1;
  w2.known = new Set([1]);
  w2.overrides.set("wallet_addEthereumChain", () => {
    throw rpcError(4001, "User rejected");
  });
  await rejectsWith(ensureChain(w2), "USER_REJECTED");

  const w3 = new MockWallet();
  w3.chainId = 1;
  w3.overrides.set("wallet_switchEthereumChain", () => null); // says yes, does nothing
  await rejectsWith(ensureChain(w3), "WRONG_CHAIN");
});

// ------------------------------------------------------------------ signing

test("typedDataJson: the burner's EIP-3009 typed data plus EIP712Domain, numbers as strings", () => {
  const intent = intentFor(owner.address);
  const td = JSON.parse(typedDataJson(intent));
  assert.equal(td.primaryType, "TransferWithAuthorization");
  assert.deepEqual(td.domain, { ...USDT_DOMAIN, verifyingContract: USDT_DOMAIN.verifyingContract.toLowerCase() });
  assert.deepEqual(
    td.types.EIP712Domain.map((f: { name: string }) => f.name),
    ["name", "version", "chainId", "verifyingContract"],
  );
  assert.equal(td.message.value, "1000000");
  assert.equal(td.message.validBefore, intent.validBefore);
});

test("signTransferWithProvider: switches to 1874, signs with v4, the signature recovers to the account", async () => {
  const w = new MockWallet();
  w.chainId = 1;
  const intent = intentFor(owner.address);
  const body = await signTransferWithProvider(w, owner.address, intent);
  assert.deepEqual(body.intent, intent);
  // The account is checked again after the network switch, right before the signature popup.
  assert.deepEqual(w.methods(), [
    "eth_accounts",
    "eth_chainId",
    "wallet_switchEthereumChain",
    "eth_chainId",
    "eth_accounts",
    "eth_signTypedData_v4",
  ]);
  assert.equal(w.calls.at(-1)!.params![0 as never], owner.address);
  // Same signature the burner would make with the same key: the relayer can't tell the two apart.
  assert.equal(body.signature, await owner.signTypedData(transferAuthorizationTypedData(intent)));
  const v = Number.parseInt(body.signature.slice(130), 16);
  assert.ok(v === 27 || v === 28);
});

test("signTransferWithProvider: never signs for a stale account", async () => {
  const w = new MockWallet();
  w.accounts = [other.address]; // the person switched accounts in the wallet
  await rejectsWith(signTransferWithProvider(w, owner.address, intentFor(owner.address)), "ACCOUNT_CHANGED");
  assert.ok(!w.methods().includes("eth_signTypedData_v4"));
  const w2 = new MockWallet();
  await rejectsWith(signTransferWithProvider(w2, owner.address, intentFor(other.address)), "ACCOUNT_CHANGED");
  assert.deepEqual(w2.calls, []);
});

test("signTransferWithProvider: a signature from another key is SIGNATURE_MISMATCH; a cancel is USER_REJECTED", async () => {
  const w = new MockWallet();
  w.signer = other; // e.g. a smart-contract wallet signing with some other key
  await rejectsWith(signTransferWithProvider(w, owner.address, intentFor(owner.address)), "SIGNATURE_MISMATCH");
  const w2 = new MockWallet();
  w2.overrides.set("eth_signTypedData_v4", () => {
    throw rpcError(4001, "User denied message signature.");
  });
  await rejectsWith(signTransferWithProvider(w2, owner.address, intentFor(owner.address)), "USER_REJECTED");
  const w3 = new MockWallet();
  w3.overrides.set("eth_signTypedData_v4", () => "0x1234");
  await rejectsWith(signTransferWithProvider(w3, owner.address, intentFor(owner.address)), "SIGNATURE_MISMATCH");
});

test("normalizeSignature: v 0/1 becomes 27/28 and a high s is flipped, both still recover to the signer", async () => {
  const intent = intentFor(owner.address);
  const good = await owner.signTypedData(transferAuthorizationTypedData(intent));
  const r = good.slice(2, 66);
  const s = BigInt(`0x${good.slice(66, 130)}`);
  const v = Number.parseInt(good.slice(130), 16);
  const vZero = `0x${r}${good.slice(66, 130)}${(v - 27).toString(16).padStart(2, "0")}`;
  assert.equal(normalizeSignature(vZero), good.toLowerCase());
  const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const highS = `0x${r}${(N - s).toString(16).padStart(64, "0")}${(v === 27 ? 28 : 27).toString(16)}`;
  assert.equal(normalizeSignature(highS), good.toLowerCase());
  assert.equal(normalizeSignature(`0x${r}${good.slice(66, 130)}1d`), null); // v 29
  assert.equal(normalizeSignature(42), null);
  // A wallet returning v 0/1 still passes the whole flow.
  const w = new MockWallet();
  w.overrides.set("eth_signTypedData_v4", () => vZero);
  const body = await signTransferWithProvider(w, owner.address, intent);
  assert.equal(body.signature, good.toLowerCase());
  assert.ok(hashTypedData(transferAuthorizationTypedData(intent)));
});

// ------------------------------------------------------------------ events and the remembered choice

test("subscribeProvider + nextAccount: account switch, lock, chain change, disconnect, unsubscribe", () => {
  const w = new MockWallet();
  const got: string[] = [];
  const stop = subscribeProvider(w, {
    onAccounts: (a) => {
      const n = nextAccount(owner.address, a);
      got.push(n.kind === "switched" ? `switched:${n.address}` : n.kind);
    },
    onChain: (c) => got.push(`chain:${c}`),
    onDisconnect: () => got.push("disconnect"),
  });
  w.emit("accountsChanged", [owner.address.toLowerCase()]);
  w.emit("accountsChanged", [other.address.toLowerCase()]);
  w.emit("accountsChanged", []);
  w.emit("chainChanged", "0x752");
  w.emit("disconnect", { code: 4900 });
  assert.deepEqual(got, ["same", `switched:${other.address}`, "gone", "chain:1874", "disconnect"]);
  stop();
  w.emit("accountsChanged", [other.address]);
  assert.equal(got.length, 5);
  for (const set of w.listeners.values()) assert.equal(set.size, 0);
  // A wallet without events: nothing to subscribe to, nothing breaks.
  subscribeProvider({ request: async () => null }, { onAccounts() {}, onChain() {}, onDisconnect() {} })();
});

test("wallet choice: saved per browser, corrupt or blocked storage just means asking again", () => {
  const s = new MapStorage();
  assert.equal(loadWalletChoice(s), null);
  saveWalletChoice(s, { kind: "injected", rdns: "io.metamask" });
  assert.deepEqual(loadWalletChoice(s), { kind: "injected", rdns: "io.metamask" });
  saveWalletChoice(s, { kind: "burner" });
  assert.deepEqual(loadWalletChoice(s), { kind: "burner" });
  saveWalletChoice(s, { kind: "ask" });
  assert.deepEqual(loadWalletChoice(s), { kind: "ask" });
  s.setItem(WALLET_CHOICE_KEY, "{not json");
  assert.equal(loadWalletChoice(s), null);
  s.setItem(WALLET_CHOICE_KEY, JSON.stringify({ v: 1, kind: "injected", rdns: "<script>" }));
  assert.equal(loadWalletChoice(s), null);
  const throwing: KeyStorage = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
  };
  assert.equal(loadWalletChoice(throwing), null);
  assert.doesNotThrow(() => saveWalletChoice(throwing, { kind: "burner" }));
  assert.equal(loadWalletChoice(null), null);
});

test("walletErrorCopy: every code has calm copy that says nothing was sent or what to do", () => {
  const codes: WalletErrorCode[] = [
    "USER_REJECTED",
    "REQUEST_PENDING",
    "UNAUTHORIZED",
    "UNSUPPORTED_METHOD",
    "DISCONNECTED",
    "NO_ACCOUNT",
    "ACCOUNT_CHANGED",
    "WRONG_CHAIN",
    "SIGNATURE_MISMATCH",
    "FAILED",
  ];
  for (const c of codes) {
    const copy = walletErrorCopy(c);
    assert.ok(copy.title.length > 0 && copy.next.length > 0, c);
    assert.ok(!/\d{4}/.test(copy.title), `${c}: no raw error codes in the title`);
  }
});

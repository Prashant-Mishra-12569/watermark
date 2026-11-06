/**
 * Regression tests from the review of the "use my wallet" flow (src/lib/wallet.ts, src/lib/messages.ts).
 *
 * "review fix" tests pin gaps the review found (they failed before the fix). "guard" tests keep the security
 * properties from regressing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { getAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chooserNoteCopy, noWalletFoundCopy, walletPopupHint } from "./messages.ts";
import { buildIntent, PAY_VALIDITY_SECONDS } from "./pay.ts";
import { USDT_DOMAIN } from "./usdt.ts";
import {
  addChainParams,
  ensureChain,
  isRecoverableDisconnect,
  loadWalletChoice,
  requestAccount,
  saveWalletChoice,
  sortProviders,
  WALLET_CHOICE_KEY,
  type ProviderDetail,
  signTransferWithProvider,
  subscribeProvider,
  WalletError,
  type Eip1193RequestArgs,
  type WalletErrorCode,
} from "./wallet.ts";

const owner = privateKeyToAccount(`0x${"0a".repeat(32)}`);
const other = privateKeyToAccount(`0x${"0b".repeat(32)}`);
const shop = "0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF" as Address;
const attacker = "0x000000000000000000000000000000000000dEaD" as Address;

function rpcError(code: number, message = "error", data?: unknown) {
  return Object.assign(new Error(message), { code, ...(data ? { data } : {}) });
}

type Handler = (params: unknown) => unknown;

/** Same shape as the mock in wallet.test.ts: an active chain, an account list, a real key behind v4 signing. */
class MockWallet {
  calls: Eip1193RequestArgs[] = [];
  chainId = 1874;
  known = new Set<number>([1, 1874]);
  accounts: Address[] = [owner.address];
  signer = owner;
  /** Rewrites the message before signing (a malicious wallet signing something else). */
  tamper: ((m: Record<string, string>) => Record<string, string>) | null = null;
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
        this.chainId = id;
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
        const { EIP712Domain: _d, ...types } = td.types;
        const m = this.tamper ? this.tamper(td.message) : td.message;
        return this.signer.signTypedData({
          domain: td.domain,
          types,
          primaryType: td.primaryType,
          message: { ...m, value: BigInt(m.value!), validAfter: BigInt(m.validAfter!), validBefore: BigInt(m.validBefore!) },
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

const intentFor = (from: Address, to: Address = shop) =>
  buildIntent({ from, to, value: 1_000_000n, nowMs: 1_800_000_000_000, nonce: `0x${"ab".repeat(32)}` as Hex });

async function rejectsWith(p: Promise<unknown>, code: WalletErrorCode) {
  await assert.rejects(p, (e: unknown) => e instanceof WalletError && e.code === code);
}

// ------------------------------------------------------------------ review fixes (failed before the fix)

test("review fix: an account switch while the add/switch-network popup is open must not lead to a signature request for the old account", async () => {
  // The person clicks Pay, MetaMask shows "Switch to Whitechain Sepolia?", and while it is open they pick another
  // account. signTransferWithProvider used to check eth_accounts only BEFORE ensureChain, so it went on to ask the wallet
  // to sign for the account the page no longer shows (the page has already remounted for the new account).
  const w = new MockWallet();
  w.chainId = 1;
  w.overrides.set("wallet_switchEthereumChain", () => {
    w.chainId = 1874;
    w.accounts = [other.address]; // switched accounts during the popup
    return null;
  });
  await rejectsWith(signTransferWithProvider(w, owner.address, intentFor(owner.address)), "ACCOUNT_CHANGED");
  assert.ok(!w.methods().includes("eth_signTypedData_v4"), "never opens a signature popup for a stale account");
});

test("review fix: MetaMask's recoverable disconnect (code 1013) during a network switch must not drop the wallet", () => {
  // MetaMask emits `disconnect` with code 1013 ("Disconnected from chain. Attempting to connect.") while it reconnects,
  // e.g. right after wallet_addEthereumChain / a switch to a chain whose RPC is still loading. The page used to treat
  // every disconnect as final: /pay unmounted mid-payment and showed "Your wallet disconnected". wagmi ignores 1013 too.
  const w = new MockWallet();
  let disconnects = 0;
  subscribeProvider(w, { onAccounts() {}, onChain() {}, onDisconnect: () => disconnects++ });
  w.emit("disconnect", rpcError(1013, "MetaMask: Disconnected from chain. Attempting to connect."));
  assert.equal(disconnects, 0, "a recoverable 1013 disconnect is not a disconnect");
  w.emit("disconnect", rpcError(4900, "Disconnected"));
  assert.equal(disconnects, 1, "a real disconnect still is");
});

test("review fix: a locked wallet at Pay time is NO_ACCOUNT, not 'the account changed, the page now uses it'", async () => {
  // eth_accounts → [] (locked, or the site's permission was removed without an event). The page used to show
  // "The account in your wallet changed. ... The page now uses the account your wallet shows", which was false.
  // NO_ACCOUNT's copy ("Unlock your wallet") is the right one, and /pay then re-reads the wallet (useWallet.resync).
  const w = new MockWallet();
  w.accounts = [];
  await rejectsWith(signTransferWithProvider(w, owner.address, intentFor(owner.address)), "NO_ACCOUNT");
  assert.ok(!w.methods().includes("eth_signTypedData_v4"));
  // Locked while the switch popup was open: also NO_ACCOUNT, still no signature popup.
  const w2 = new MockWallet();
  w2.chainId = 1;
  w2.overrides.set("wallet_switchEthereumChain", () => {
    w2.chainId = 1874;
    w2.accounts = [];
    return null;
  });
  await rejectsWith(signTransferWithProvider(w2, owner.address, intentFor(owner.address)), "NO_ACCOUNT");
  assert.ok(!w2.methods().includes("eth_signTypedData_v4"));
});

test("review fix: a flow that is gone (isCurrent false after the switch popup) never opens a signature popup", async () => {
  // The page remounted for another account while MetaMask's switch popup was open, but the wallet still reports the
  // old account (accountsChanged came first, eth_accounts lags): isCurrent stops it anyway.
  const w = new MockWallet();
  w.chainId = 1;
  let current = true;
  w.overrides.set("wallet_switchEthereumChain", () => {
    w.chainId = 1874;
    current = false;
    return null;
  });
  await rejectsWith(
    signTransferWithProvider(w, owner.address, intentFor(owner.address), { isCurrent: () => current }),
    "ACCOUNT_CHANGED",
  );
  assert.ok(!w.methods().includes("eth_signTypedData_v4"));
  // Still current: signs as before.
  const ok = new MockWallet();
  const body = await signTransferWithProvider(ok, owner.address, intentFor(owner.address), { isCurrent: () => true });
  assert.equal(body.intent.from, owner.address);
});

test("review fix: only 1013 is recoverable; 4900, 4901, 1011 and a bare disconnect still drop the wallet", () => {
  assert.equal(isRecoverableDisconnect(rpcError(1013)), true);
  assert.equal(isRecoverableDisconnect({ code: 4900, data: { originalError: { code: 1013 } } }), true);
  for (const e of [rpcError(4900), rpcError(4901), rpcError(1011), undefined, null, "bye"]) {
    assert.equal(isRecoverableDisconnect(e), false, String(e));
  }
  const w = new MockWallet();
  let disconnects = 0;
  subscribeProvider(w, { onAccounts() {}, onChain() {}, onDisconnect: () => disconnects++ });
  w.emit("disconnect", rpcError(4901, "Chain disconnected"));
  w.emit("disconnect", rpcError(1011, "Internal error"));
  w.emit("disconnect", undefined);
  assert.equal(disconnects, 3);
});

test("review fix: the remembered wallet keeps its name (sanitised) and is listed first in the chooser", () => {
  const storage = new Map<string, string>();
  const s = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) };
  saveWalletChoice(s, { kind: "injected", rdns: "io.metamask", name: "MetaMask" });
  assert.deepEqual(loadWalletChoice(s), { kind: "injected", rdns: "io.metamask", name: "MetaMask" });
  // Older saved choices without a name still load.
  s.setItem(WALLET_CHOICE_KEY, JSON.stringify({ v: 1, kind: "injected", rdns: "io.rabby" }));
  assert.deepEqual(loadWalletChoice(s), { kind: "injected", rdns: "io.rabby" });
  // Control characters dropped, length capped, a non-string ignored.
  s.setItem(WALLET_CHOICE_KEY, JSON.stringify({ v: 1, kind: "injected", rdns: "io.rabby", name: `Ra\u0000bby${"x".repeat(80)}` }));
  const loaded = loadWalletChoice(s);
  assert.ok(loaded?.kind === "injected" && loaded.name?.startsWith("Rabbyx") && loaded.name.length === 40);
  s.setItem(WALLET_CHOICE_KEY, JSON.stringify({ v: 1, kind: "injected", rdns: "io.rabby", name: 42 }));
  assert.deepEqual(loadWalletChoice(s), { kind: "injected", rdns: "io.rabby" });

  const d = (rdns: string): ProviderDetail => ({
    info: { uuid: rdns, name: rdns, icon: "", rdns },
    provider: { request: async () => null },
  });
  const list = [d("io.rabby"), d("com.coinbase.wallet"), d("io.metamask")];
  assert.deepEqual(sortProviders(list, "io.metamask").map((p) => p.info.rdns), ["io.metamask", "io.rabby", "com.coinbase.wallet"]);
  assert.deepEqual(sortProviders(list, null).map((p) => p.info.rdns), ["io.rabby", "com.coinbase.wallet", "io.metamask"]);
  assert.deepEqual(sortProviders(list, "app.unknown").map((p) => p.info.rdns), ["io.rabby", "com.coinbase.wallet", "io.metamask"]);
});

test("review fix: a locked or missing remembered wallet is named, and the burner is called a different wallet", () => {
  const locked = chooserNoteCopy("LOCKED", "MetaMask");
  assert.match(locked.title, /MetaMask is locked/);
  assert.match(locked.next, /Connect MetaMask/);
  assert.match(locked.next, /different wallet/);
  const missing = chooserNoteCopy("NOT_FOUND", "Rabby");
  assert.match(missing.title, /couldn't find Rabby/);
  assert.match(missing.next, /different wallet/);
  // Unknown name (an older saved choice): still readable.
  assert.match(chooserNoteCopy("NOT_FOUND", null).title, /your wallet/);
  assert.match(chooserNoteCopy("LOCKED", null).title, /^Your wallet is locked/);
  // Wallet error codes keep their own copy.
  assert.match(chooserNoteCopy("USER_REJECTED", "MetaMask").title, /cancelled/);
});

test("review fix: phones aren't told to install a browser extension", () => {
  assert.doesNotMatch(noWalletFoundCopy(true), /install/i);
  assert.match(noWalletFoundCopy(true), /wallet app's browser/);
  assert.match(noWalletFoundCopy(true), /continue without a wallet/i);
  assert.match(noWalletFoundCopy(false), /Install one/);
});

test("review fix: the popup hint matches what the wallet shows for the same intent", () => {
  const intent = intentFor(owner.address);
  const hint = walletPopupHint({ value: BigInt(intent.value), to: shop, validitySeconds: PAY_VALIDITY_SECONDS });
  assert.match(hint, new RegExp(`value ${intent.value}\\b`)); // 1000000, as in the popup's message.value
  assert.match(hint, /1 USDT shows as/);
  assert.match(hint, new RegExp(shop.slice(-4)));
  assert.match(hint, /15 minutes/);
  assert.equal(Number(intent.validBefore) - 1_800_000_000, PAY_VALIDITY_SECONDS);
  const tenth = walletPopupHint({ value: 100_000n, to: shop, validitySeconds: PAY_VALIDITY_SECONDS });
  assert.match(tenth, /0\.1 USDT shows as value 100000/);
});

// ------------------------------------------------------------------ guards (pass today)

test("guard: a wallet that signs a different recipient with the right key is caught before POST /pay", async () => {
  const w = new MockWallet();
  w.tamper = (m) => ({ ...m, to: attacker.toLowerCase() });
  await rejectsWith(signTransferWithProvider(w, owner.address, intentFor(owner.address)), "SIGNATURE_MISMATCH");
  const w2 = new MockWallet();
  w2.overrides.set("eth_signTypedData_v4", () => ({ signature: "0x00" })); // not a string
  await rejectsWith(signTransferWithProvider(w2, owner.address, intentFor(owner.address)), "SIGNATURE_MISMATCH");
});

test("guard: connect + pay (incl. the 4902 add path) never asks the wallet to send or price a transaction", async () => {
  const w = new MockWallet();
  w.chainId = 1;
  w.known = new Set([1]);
  const a = await requestAccount(w);
  await signTransferWithProvider(w, a, intentFor(a));
  const allowed = new Set([
    "eth_requestAccounts",
    "eth_accounts",
    "eth_chainId",
    "wallet_switchEthereumChain",
    "wallet_addEthereumChain",
    "eth_signTypedData_v4",
  ]);
  for (const m of w.methods()) assert.ok(allowed.has(m), `unexpected wallet call ${m}`);
  assert.ok(!w.methods().some((m) => /send|estimate|gas|personal_sign|^eth_sign$/i.test(m)));
});

test("guard: a pending switch popup (-32002) is REQUEST_PENDING and doesn't open an add-network popup on top", async () => {
  const w = new MockWallet();
  w.chainId = 1;
  w.overrides.set("wallet_switchEthereumChain", () => {
    throw rpcError(-32002, "Request of type 'wallet_switchEthereumChain' already pending");
  });
  await rejectsWith(ensureChain(w), "REQUEST_PENDING");
  assert.ok(!w.methods().includes("wallet_addEthereumChain"));
});

test("guard: wallet_addEthereumChain values are Whitechain Sepolia 1874 (never viem's 2625), all https", () => {
  const p = addChainParams();
  assert.equal(p.chainId, "0x752");
  assert.notEqual(p.chainId, "0xa41"); // 2625, viem's whitechainTestnet
  for (const u of [...p.rpcUrls, ...p.blockExplorerUrls]) assert.equal(new URL(u).protocol, "https:", u);
});

test("guard: the last 4 shown is EIP-55 even when the wallet returns lowercase accounts", async () => {
  const w = new MockWallet(); // returns lowercase
  const a = await requestAccount(w);
  assert.equal(a.slice(-4), getAddress(owner.address).slice(-4));
});

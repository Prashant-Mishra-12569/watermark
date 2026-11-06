import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import {
  BURNER_STORAGE_KEY,
  forgetBurner,
  hasBurner,
  loadOrCreateBurner,
  resetMemoryWalletsForTests,
  type KeyStorage,
} from "./burner.ts";

class MapStorage implements KeyStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

const throwing: KeyStorage = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
};

const keyA = `0x${"11".repeat(32)}` as Hex;
const keyB = `0x${"22".repeat(32)}` as Hex;
const fixed = (k: Hex) => () => k;

beforeEach(() => resetMemoryWalletsForTests());

test("creates a wallet, saves it, and loads the same one again", () => {
  const storage = new MapStorage();
  const first = loadOrCreateBurner("12345", storage, fixed(keyA));
  assert.equal(first.created, true);
  assert.equal(first.persistent, true);
  assert.equal(first.account.address, privateKeyToAccount(keyA).address);

  const again = loadOrCreateBurner("12345", storage, fixed(keyB));
  assert.equal(again.created, false);
  assert.equal(again.account.address, first.account.address);
  assert.ok(storage.getItem(BURNER_STORAGE_KEY)?.includes('"12345"'));
});

test("one wallet per app: different appIds get different wallets", () => {
  const storage = new MapStorage();
  const a = loadOrCreateBurner("12345", storage, fixed(keyA));
  const b = loadOrCreateBurner("777", storage, fixed(keyB));
  assert.notEqual(a.account.address, b.account.address);
  assert.equal(loadOrCreateBurner("12345", storage).account.address, a.account.address);
});

test("storage that throws falls back to memory and says so", () => {
  const a = loadOrCreateBurner("12345", throwing, fixed(keyA));
  assert.equal(a.persistent, false);
  assert.equal(a.created, true);
  // Same page lifetime (e.g. a React remount): same wallet, no new key.
  const b = loadOrCreateBurner("12345", throwing, fixed(keyB));
  assert.equal(b.account.address, a.account.address);
  assert.equal(b.created, false);
});

test("null storage (no window) works in memory", () => {
  const a = loadOrCreateBurner("1", null, fixed(keyA));
  assert.equal(a.persistent, false);
});

test("storage that silently drops writes is not persistent", () => {
  const dropping: KeyStorage = { getItem: () => null, setItem: () => {} };
  const a = loadOrCreateBurner("12345", dropping, fixed(keyA));
  assert.equal(a.persistent, false);
});

test("corrupt or tampered storage is ignored, not fatal", () => {
  const storage = new MapStorage();
  storage.setItem(BURNER_STORAGE_KEY, "{not json");
  assert.equal(loadOrCreateBurner("12345", storage, fixed(keyA)).created, true);

  resetMemoryWalletsForTests();
  storage.setItem(BURNER_STORAGE_KEY, JSON.stringify({ v: 1, wallets: { "12345": "0xnothex" } }));
  const b = loadOrCreateBurner("12345", storage, fixed(keyB));
  assert.equal(b.account.address, privateKeyToAccount(keyB).address);
});

test("forgetBurner replaces only that app's wallet", () => {
  const storage = new MapStorage();
  const a = loadOrCreateBurner("12345", storage, fixed(keyA));
  const other = loadOrCreateBurner("777", storage, fixed(keyB));
  forgetBurner("12345", storage);
  const fresh = loadOrCreateBurner("12345", storage, fixed(keyB));
  assert.equal(fresh.created, true);
  assert.notEqual(fresh.account.address, a.account.address);
  assert.equal(loadOrCreateBurner("777", storage).account.address, other.account.address);
});

test("the account can sign typed data (needed later by /pay) and does not expose the key", async () => {
  const { account } = loadOrCreateBurner("12345", new MapStorage(), fixed(keyA));
  const sig = await account.signTypedData({
    domain: { name: "Test", version: "1", chainId: 1874 },
    types: { M: [{ name: "x", type: "uint256" }] },
    primaryType: "M",
    message: { x: 1n },
  });
  assert.match(sig, /^0x[0-9a-f]{130}$/);
  assert.ok(!JSON.stringify(account).includes(keyA.slice(2)));
});

test("hasBurner: true only once a wallet exists for this app, and never creates one", () => {
  const s = new MapStorage();
  assert.equal(hasBurner("7", s), false);
  assert.equal(s.data.size, 0);
  loadOrCreateBurner("7", s, fixed(keyA));
  assert.equal(hasBurner("7", s), true);
  assert.equal(hasBurner("8", s), false);
  loadOrCreateBurner("9", throwing, fixed(keyB)); // blocked storage: kept in memory
  assert.equal(hasBurner("9", throwing), true);
  forgetBurner("7", s);
  assert.equal(hasBurner("7", s), false);
});

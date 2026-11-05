import { defineChain } from "viem";

/**
 * Whitechain Sepolia (chain 1874). Defined by hand on purpose: viem's built-in
 * `whitechainTestnet` is a different network (chain 2625). See interfaces F10.
 */
export const whitechainSepolia = defineChain({
  id: 1874,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WhiteBIT Coin", symbol: "WBT", decimals: 18 },
  rpcUrls: {
    default: {
      // Ankr is the primary RPC on Whitechain's hackathon flyer; the official endpoint is the backup.
      http: ["https://rpc.ankr.com/whitechain_testnet", "https://rpc.testnet.whitechain.io"],
      webSocket: ["wss://rpc.testnet.whitechain.io/ws"],
    },
  },
  blockExplorers: {
    default: { name: "Whitechain Explorer", url: "https://explorer.testnet.whitechain.io" },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
  testnet: true,
});

/** EIP-8141 alternative mempool devnet (chain 1337). The devnet can be reset at any time. */
export const altmempoolDevnet = defineChain({
  id: 1337,
  name: "Alt Mempool Devnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://altmempool.forshtat.com"] },
    // The gateway sidecar: frame txs, the faucet and explorer methods (altmempool.forshtat.com/rpc has no faucet)
    sidecar: { http: ["https://altmempoolgateway.forshtat.com/rpc"] },
  },
  blockExplorers: {
    default: { name: "Alt Mempool Explorer", url: "https://explorer.altmempool.wtf" },
  },
  testnet: true,
});

/** Official test USDT, "the only one that counts" for the Whitechain prize. 6 decimals, supports permit and EIP-3009. */
export const USDT_WHITECHAIN = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7" as const;
export const USDT_DECIMALS = 6;

/** NaiveStakingRegistry on the alt mempool devnet. */
export const ALTMEMPOOL_STAKING_REGISTRY = "0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f" as const;

export const SUPPORTED_CHAIN_IDS = [whitechainSepolia.id, altmempoolDevnet.id] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

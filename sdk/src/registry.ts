/**
 * The read side of WatermarkRegistry (contracts/src/interfaces/IWatermarkRegistry.sol, interfaces F5).
 * Only what apps and agents need to check stamps; writes go through the relayer.
 */
export const WATERMARK_REGISTRY_ABI = [
  {
    type: "function",
    name: "isStamped",
    stateMutability: "view",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "appId", type: "uint256" },
    ],
    outputs: [
      { name: "ok", type: "bool" },
      { name: "expiresAt", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "apps",
    stateMutability: "view",
    inputs: [{ name: "appId", type: "uint256" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "rulesRoot", type: "bytes32" },
      { name: "sessionSigner", type: "address" },
    ],
  },
  {
    type: "function",
    name: "caRoot",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "event",
    name: "Stamped",
    inputs: [
      { name: "wallet", type: "address", indexed: true },
      { name: "appId", type: "uint256", indexed: true },
      { name: "nullifier", type: "bytes32", indexed: false },
      { name: "expiresAt", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AppRegistered",
    inputs: [
      { name: "appId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "rulesRoot", type: "bytes32", indexed: false },
      { name: "sessionSigner", type: "address", indexed: false },
    ],
  },
] as const;

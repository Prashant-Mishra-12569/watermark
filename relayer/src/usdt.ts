/**
 * Whitechain USDT and the EIP-3009 authorization the browser signs for a gasless payment (interfaces F7, Plan A).
 *
 * KEEP IN SYNC with web/src/lib/usdt.ts: both files hold the same constants and the same typed data, and each has a
 * test that pins the domain separator. Depends on viem only, so the file can be copied between packages as is.
 *
 * The token is TetherTokenV2 behind an EIP-1967 proxy. Its version() and eip712Domain() revert, so the domain is
 * fixed here and checked against the token's DOMAIN_SEPARATOR() (read on chain 1874, see USDT_DOMAIN_SEPARATOR).
 */
import { formatUnits, parseUnits, type Address, type Hex } from "viem";

export const USDT_ADDRESS = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7" as const satisfies Address;
export const USDT_DECIMALS = 6;
export const USDT_CHAIN_ID = 1874;

/** EIP-712 domain of the USDT proxy on Whitechain Sepolia. */
export const USDT_DOMAIN = {
  name: "Tether USD",
  version: "1",
  chainId: USDT_CHAIN_ID,
  verifyingContract: USDT_ADDRESS,
} as const;

/** USDT.DOMAIN_SEPARATOR() on chain 1874. A test recomputes it from USDT_DOMAIN. */
export const USDT_DOMAIN_SEPARATOR = "0xcdcfacb6b15c8238b4e5fbb47bdb83b7f83f50a531d264bf9763d2bd1d3d2a25" as const;

export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

/**
 * F7 PaymentIntent, F0-encoded for JSON: uint256 values are decimal strings, value is in USDT base units
 * (6 decimals: "1000000" is 1 USDT), nonce is a random bytes32.
 */
export interface PaymentIntent {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
}

/** The full typed-data object for signTypedData / verifyTypedData. */
export function transferAuthorizationTypedData(intent: PaymentIntent) {
  return {
    domain: USDT_DOMAIN,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization" as const,
    message: {
      from: intent.from,
      to: intent.to,
      value: BigInt(intent.value),
      validAfter: BigInt(intent.validAfter),
      validBefore: BigInt(intent.validBefore),
      nonce: intent.nonce,
    },
  };
}

const AMOUNT = /^\d{1,12}(\.\d{1,6})?$/;

/** "1.5" → 1500000n. Null for anything that isn't a plain decimal with at most 6 decimals. */
export function parseUsdt(amount: string): bigint | null {
  const s = amount.trim();
  if (!AMOUNT.test(s)) return null;
  return parseUnits(s, USDT_DECIMALS);
}

/** 1500000n → "1.5". */
export function formatUsdt(baseUnits: bigint): string {
  return formatUnits(baseUnits, USDT_DECIMALS);
}

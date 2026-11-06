/**
 * /pay logic: settings, form checks and the signed request body. Pure apart from the injected randomness and clock,
 * so it runs under `node --test`. The burner key never leaves the viem account: we only ask it for a signature.
 */
import { getAddress, isAddress, type Address, type Hex, type LocalAccount } from "viem";
import { formatUsdt, parseUsdt, transferAuthorizationTypedData, type PaymentIntent } from "./usdt.ts";

/** Same default as the relayer's PAY_MAX_USDT. */
export const DEFAULT_PAY_MAX_USDT = "5";
export const DEFAULT_PAY_AMOUNT_USDT = "1";
/** The authorization is valid for 15 minutes (the relayer accepts up to 1 hour). */
export const PAY_VALIDITY_SECONDS = 15 * 60;

export interface PayConfig {
  /** The demo shop's address, or null: then the page asks for a recipient. */
  demoShop: Address | null;
  /** Largest payment the page offers, in USDT, e.g. "5". */
  payMaxUsdt: string;
  problems: string[];
}

/** Reads NEXT_PUBLIC_DEMO_SHOP and NEXT_PUBLIC_PAY_MAX_USDT. A bad value is reported and replaced by the default. */
export function readPayConfig(env: { demoShop?: string | undefined; payMaxUsdt?: string | undefined }): PayConfig {
  const problems: string[] = [];
  let demoShop: Address | null = null;
  const shop = env.demoShop?.trim() ?? "";
  if (shop) {
    if (isAddress(shop, { strict: false }) && BigInt(shop) !== 0n) demoShop = getAddress(shop);
    else problems.push("NEXT_PUBLIC_DEMO_SHOP is not an address, so the page asks for a recipient instead.");
  }
  let payMaxUsdt = DEFAULT_PAY_MAX_USDT;
  const max = env.payMaxUsdt?.trim() ?? "";
  if (max) {
    const units = parseUsdt(max);
    if (units !== null && units > 0n) payMaxUsdt = formatUsdt(units);
    else problems.push(`NEXT_PUBLIC_PAY_MAX_USDT is not a positive USDT amount; using ${DEFAULT_PAY_MAX_USDT}.`);
  }
  return { demoShop, payMaxUsdt, problems };
}

export type AmountCheck = { ok: true; value: bigint } | { ok: false; message: string };

/** Checks the amount field: a positive USDT amount with at most 6 decimals, within the max and the balance. */
export function checkAmount(raw: string, payMaxUsdt: string, balanceUsdt: string | null): AmountCheck {
  const s = raw.trim();
  if (!s) return { ok: false, message: "Enter an amount." };
  const value = parseUsdt(s);
  if (value === null) return { ok: false, message: "Enter an amount like 1 or 0.50 (up to 6 decimals)." };
  if (value <= 0n) return { ok: false, message: "The amount must be more than 0." };
  const max = parseUsdt(payMaxUsdt);
  if (max !== null && value > max) return { ok: false, message: `This demo allows up to ${payMaxUsdt} USDT per payment.` };
  const balance = balanceUsdt === null ? null : parseUsdt(balanceUsdt);
  if (balance !== null && value > balance)
    return { ok: false, message: `That's more than your balance (${balanceUsdt} USDT).` };
  return { ok: true, value };
}

export type RecipientCheck = { ok: true; address: Address } | { ok: false; message: string };

/** Checks the recipient: a real address (mixed case must be a valid checksum), not zero, not the payer. */
export function checkRecipient(raw: string, from: Address): RecipientCheck {
  const s = raw.trim();
  if (!s) return { ok: false, message: "Enter the shop's wallet address." };
  if (!isAddress(s)) return { ok: false, message: "That doesn't look like a wallet address (0x followed by 40 characters)." };
  if (BigInt(s) === 0n) return { ok: false, message: "That address can't receive payments." };
  if (s.toLowerCase() === from.toLowerCase()) return { ok: false, message: "You can't pay your own wallet." };
  return { ok: true, address: getAddress(s) };
}

/** A fresh random bytes32 for the EIP-3009 nonce (USDT refuses a used nonce, so each payment needs a new one). */
export function randomNonce(getRandomValues: (a: Uint8Array) => Uint8Array = (a) => crypto.getRandomValues(a)): Hex {
  const bytes = getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}

/** validAfter 0 (valid right away), validBefore now + 15 min. */
export function buildIntent(args: { from: Address; to: Address; value: bigint; nowMs: number; nonce: Hex }): PaymentIntent {
  return {
    from: args.from,
    to: args.to,
    value: args.value.toString(),
    validAfter: "0",
    validBefore: String(Math.floor(args.nowMs / 1000) + PAY_VALIDITY_SECONDS),
    nonce: args.nonce,
  };
}

export interface PayRequestBody {
  intent: PaymentIntent;
  signature: Hex;
}

/** Signs the intent with the burner (EIP-712, no gas, no network) and returns the POST /pay body. */
export async function signPayment(
  account: Pick<LocalAccount, "address" | "signTypedData">,
  intent: PaymentIntent,
): Promise<PayRequestBody> {
  if (intent.from.toLowerCase() !== account.address.toLowerCase()) throw new Error("intent.from is not this wallet");
  const signature = await account.signTypedData(transferAuthorizationTypedData(intent));
  return { intent, signature };
}

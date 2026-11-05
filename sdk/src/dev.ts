/**
 * Development helpers only. DEV_SESSION_SIGNER is the publicly known Anvil/Hardhat test account #0:
 * anyone can sign with it, so it must never be the session signer of a real deployment.
 */
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { sessionTypedData } from "./session.ts";
import type { Session, SignedSession } from "./types.ts";

export const DEV_SESSION_SIGNER_KEY: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const DEV_SESSION_SIGNER: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

export async function signSessionDev(session: Session, key: Hex = DEV_SESSION_SIGNER_KEY): Promise<SignedSession> {
  const account = privateKeyToAccount(key);
  const sig = await account.signTypedData(sessionTypedData(session));
  return { session, sig };
}

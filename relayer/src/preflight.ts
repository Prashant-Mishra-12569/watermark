/**
 * Startup checks. They only warn: the relayer still starts, because a registry may not be deployed yet. An app's
 * session signer is fixed at registerApp, so a relayer whose SESSION_SIGNER_KEY differs from it signs sessions the
 * registry will refuse (WrongSessionSigner) for that app's whole life. This catches it before the first tap.
 */
import { getAddress, type Address } from "viem";
import type { ChainConfig, Config } from "./config.ts";

/** Reads apps(appId).sessionSigner from the registry on `chain` (address(0) = app not registered). */
export type AppSignerReader = (chain: ChainConfig, appId: bigint) => Promise<Address>;

/** The 10 default anvil/hardhat accounts ("test test ... junk"). Their private keys are public. */
export const PUBLIC_TEST_ADDRESSES: ReadonlySet<string> = new Set(
  [
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
    "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
    "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
    "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
    "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
  ].map((a) => a.toLowerCase()),
);

export async function sessionSignerWarnings(
  config: Pick<Config, "appIds" | "chains">,
  signer: Address,
  readSigner: AppSignerReader,
): Promise<string[]> {
  const warnings: string[] = [];
  const chains = [...config.chains.values()].filter((c) => c.registry);
  if (chains.length > 0 && PUBLIC_TEST_ADDRESSES.has(signer.toLowerCase())) {
    warnings.push(
      `SESSION_SIGNER_KEY is a public test key (${signer}): anyone can sign sessions with it. Local chains only`,
    );
  }
  for (const c of chains) {
    for (const id of config.appIds) {
      let onChain: Address;
      try {
        onChain = await readSigner(c, BigInt(id));
      } catch {
        warnings.push(`could not read apps(${id}) on chain ${c.chainId} from ${c.registry}: check the registry address and the RPC`);
        continue;
      }
      if (BigInt(onChain) === 0n) {
        warnings.push(`appId ${id} is not registered in the registry on chain ${c.chainId}: check APP_IDS and the registry address`);
      } else if (getAddress(onChain) !== getAddress(signer)) {
        warnings.push(
          `appId ${id} on chain ${c.chainId}: the registry's session signer is ${getAddress(onChain)}, but SESSION_SIGNER_KEY ` +
            `is ${getAddress(signer)}. Every stamp for this app will be refused (WrongSessionSigner)`,
        );
      }
    }
  }
  return warnings;
}

/** On-chain reads for /status. Behind an interface so the routes can be tested without a network. */
import { createPublicClient, http, parseAbi, type Address, type PublicClient } from "viem";
import type { StampStatus } from "@watermark/sdk";
import type { ChainConfig } from "./config.ts";

export interface ChainReader {
  status(chain: ChainConfig, wallet: Address, appId: bigint): Promise<StampStatus>;
}

const registryAbi = parseAbi([
  "function isStamped(address wallet, uint256 appId) view returns (bool ok, uint64 expiresAt)",
]);
const sponsorAbi = parseAbi(["function quotaLeft(address wallet) view returns (uint32)"]);

export function viemChainReader(): ChainReader {
  const clients = new Map<number, PublicClient>();
  const client = (c: ChainConfig) => {
    let pc = clients.get(c.chainId);
    if (!pc) {
      pc = createPublicClient({ transport: http(c.rpcUrl, { timeout: 10_000 }) });
      clients.set(c.chainId, pc);
    }
    return pc;
  };

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

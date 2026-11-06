/**
 * The builders page's "Add it in one line." code, copied verbatim from docs/INTEGRATE.md (checker.test.ts fails if
 * either drifts from the doc, or stops using the live registry and appId). Edit the doc first, then paste it here
 * unchanged.
 */

/** INTEGRATE.md "1. On-chain gate (Solidity)". */
export const SOLIDITY_GATE = `interface IWatermarkRegistry {
    function isStamped(address wallet, uint256 appId) external view returns (bool ok, uint64 expiresAt);
}

modifier onlyStamped() {
    (bool ok, uint64 expiresAt) = watermark.isStamped(msg.sender, watermarkAppId);
    require(ok && expiresAt > block.timestamp, "Watermark: no live stamp");
    _;
}`;

/** INTEGRATE.md "2. App or wallet backend (TypeScript SDK)". */
export const TYPESCRIPT_CHECK = `import { check, checkMany } from "@watermark/sdk";

const registry = "0x998934Efa31a6bE75945fDfAa126d3D6401F8Fd6";
const appId = "393344891601835728760966937624776276735512086066329273346256164761263100630";

const { stamped, expiresAt } = await check(userAddress, appId, { registry });
if (!stamped) showGetStampedButton(); // links to the /verify page (verifyLink)

// Airdrop or allowlist export: up to 200 wallets per call, one multicall
const results = await checkMany(addresses, appId, { registry });`;

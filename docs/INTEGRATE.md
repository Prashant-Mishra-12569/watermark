# Integrate Watermark

For any Web3 product (a wallet, a dapp, an airdrop, a faucet or an AI agent) that wants to let in only wallets backed
by a real bank card.

## What a stamp means
A Watermark stamp on `(wallet, appId)` means **this wallet was linked to one real bank card that passed this app's
filter**. The card signed a fresh challenge, and a zero-knowledge proof of its certificate chain was verified on-chain.

It does **not** mean identity, KYC, age, balance or one-person-one-vote. A person with three cards can get three stamps.
A tap has no PIN, so a borrowed card also works. What a stamp does do is make every extra wallet cost a real bank card,
which is what stops bots from farming.

Nothing about the card is on-chain: no card number, no BIN and no card expiry. Only the wallet, the app, a
random-looking nullifier and the stamp's expiry.

## Live deployment (Whitechain Sepolia, chain 1874)
| What | Value |
|---|---|
| `WatermarkRegistry` | [`0x998934Efa31a6bE75945fDfAa126d3D6401F8Fd6`](https://explorer.testnet.whitechain.io/address/0x998934Efa31a6bE75945fDfAa126d3D6401F8Fd6) (verified) |
| `VerifierRouter` | [`0xc2E883a53aC54CBc9564882a77ab3723E1373A5C`](https://explorer.testnet.whitechain.io/address/0xc2E883a53aC54CBc9564882a77ab3723E1373A5C) (verified) |
| Live app: **RuPay bank debit (India, no prepaid)**, 4,208 public BIN prefixes | `393344891601835728760966937624776276735512086066329273346256164761263100630` |
| Old live app, superseded: it also accepted prepaid card ranges | `245737539065175059008558421319713289281964530398934598066600266060113564106` |
| Test app: synthetic test card only | `242622643093352524455632509511752146182158360637522126326090117364223963656` |
| Deploy block (event history starts here) | `12335610` |

The same values are in [`deployments/whitechain.json`](../deployments/) and [`policies/`](../policies/).

## Three ways to integrate
### 1. On-chain gate (Solidity)
Any contract can check a stamp in one call:
```solidity
interface IWatermarkRegistry {
    function isStamped(address wallet, uint256 appId) external view returns (bool ok, uint64 expiresAt);
}

modifier onlyStamped() {
    (bool ok, uint64 expiresAt) = watermark.isStamped(msg.sender, watermarkAppId);
    require(ok && expiresAt > block.timestamp, "Watermark: no live stamp");
    _;
}
```
The MCP tool `watermark_integration_snippet` returns a complete contract (gate + one-claim-per-wallet example) with the
live address filled in.

### 2. App or wallet backend (TypeScript SDK)
A wallet such as Ledger Live, an exchange or a dapp backend checks a user's address before allowing an action:
```ts
import { check, checkMany } from "@watermark/sdk";

const registry = "0x998934Efa31a6bE75945fDfAa126d3D6401F8Fd6";
const appId = "393344891601835728760966937624776276735512086066329273346256164761263100630";

const { stamped, expiresAt } = await check(userAddress, appId, { registry });
if (!stamped) showGetStampedButton(); // links to the /verify page (verifyLink)

// Airdrop or allowlist export: up to 200 wallets per call, one multicall
const results = await checkMany(addresses, appId, { registry });
```
It reads the chain directly, with no API key and no relayer. It works in the browser; node apps can use
`@watermark/sdk/node`, which reads the addresses from `deployments/`.

### 3. AI agents (MCP)
Agents use the Watermark MCP server ([mcp/README.md](../mcp/README.md)) to check a wallet before paying a reward or
giving access, audit an app, or draft a filter. It holds no keys and never takes card data.

## Your own app with your own filter
You don't have to use our live app. Register your own, with your own card filter:

1. **Draft the filter:** `watermark_draft_policy` with networks, banks, card types and BIN prefixes from a public BIN
   list. It returns the leaves, the Poseidon2 `rulesRoot` and warnings. A narrower filter means each stamp reveals more
   (e.g. "this wallet holds an SBI card").
2. **Publish the policy** (its leaves) where users can see it, so anyone can check your on-chain root against it.
3. **Register:** `watermark_prepare_register_app` returns an **unsigned** `registerApp(salt, rulesRoot, sessionSigner)`
   transaction and the appId it will create. You sign and send it from the owner wallet.
4. **Run a session signer.** It signs the QR sessions for your app (our relayer does this for the live app). It decides
   who can *start* a verification. It can't stamp anyone without a real card and a valid proof.
5. **Gate on your appId** with any of the three methods above.

Rules are immutable per appId: a new filter means a new appId. The network is proven cryptographically (by the CA key
that signed the card). Bank, card type and country are only as good as the BIN list behind your prefixes.

## Transparency and accountability
Everything that decides who gets a stamp is public and checkable:
| Question | How to check |
|---|---|
| Is the enforced filter the one this app publishes? | `watermark_app_info` (or SDK `auditApp`): compares `apps(appId).rulesRoot` on-chain with the published policy. CI recomputes every committed root from its leaves (`tools/zk/src/roots.ts --check`). |
| How many wallets has an app stamped, and which are live? | `watermark_stamp_history` (or SDK `stampHistory`): every `Stamped` event since the deploy block, with explorer links |
| Who can start sessions for an app? | `apps(appId).sessionSigner`, on-chain |
| Which network keys are trusted? | `caRoot()` on-chain, built from the public keys in `policies/ca-keys.json` |

## Which cards work today
| Network | Status |
|---|---|
| **RuPay** debit | **Live.** Cards using the RuPay CA key 05 with the 1984/1408/768-bit, exponent-3 key profile. Verified on real cards. |
| Visa | **Planned, not live.** Filters can be drafted and registered, but no Visa card can be proven yet. It needs its own circuit profile, plugged in through the `VerifierRouter` without a redeploy. |
| Mastercard | **Planned, not live.** Same as Visa. |

`watermark_supported_cards` always returns the current status.

## Limits
- Testnet only (Whitechain Sepolia). A real launch needs PCI and legal review, network and bank terms, and a licensed
  BIN source.
- One card, not one person. Possession only: there is no PIN on a contactless tap.
- The prover sees card data briefly, in memory, to make the proof; on-device proving is the fix. See
  [PRIVACY.md](PRIVACY.md).

# @watermark/ef-sender

Builds, checks and sends a `WatermarkQuotaPaymaster`-sponsored EIP-8141 frame transaction on the alt mempool devnet
(chain 1337), and keeps the paymaster's clock fresh (`poke`). Design: `docs/EF_PAYMASTER_DESIGN.md`. Submission
summary and results: `docs/EF_ALTMEMPOOL.md`.

It uses `@forshtat/hegota-support@0.0.1` (the frame-tx codec the alt mempool workshop uses, profile
`ethrex-eip8141-tracer`) and `viem`. Given the same inputs, it encodes a byte-identical tx to the copy of this script
that sent the 2026-11-06 devnet tx (checked).

```sh
corepack pnpm install                     # from the repo root
cd tools/ef-sender
node src/send-quota-tx.ts --paymaster 0x.. --target 0x..          # dry run: no network calls, prints frames + checks
corepack pnpm typecheck
corepack pnpm test                                                # dry runs of both modes (no network)
```

Without `--send` nothing touches the network. With `--send` it first reads the chain (head, `lastSeen`, `TICK`,
`MIN_LIFETIME`, pinned fees, `MAX_COST_PER_TX`, and the keyed-nonce sequence from `NONCE_MANAGER`), runs its
self-checks, then calls `eth_sendFrameTransaction` on the sidecar. Keys come from the environment and are never
printed.

## Runbook (what worked on 2026-11-06, after the devnet reset)

Endpoints:
- execution RPC (ethrex): `https://altmempool.forshtat.com` (forge, cast, eth_call)
- alt mempool sidecar: `https://altmempool.forshtat.com/rpc` (where `eth_sendFrameTransaction` goes; the tool's
  default). The workshop gateway `altmempoolgateway.forshtat.com/rpc` admitted txs that were never mined.

Keys live only in your shell, loaded from a local env file outside git. Never commit them. Names used below:
`DEVNET_DEPLOYER` / `DEVNET_DEPLOYER_KEY` (funded deployer `0x9674…e135`), `DEVNET_SESSION_SIGNER` / `DEVNET_SESSION_SIGNER_PK`
(devnet-only session signer), `DEVNET_WALLET` / `DEVNET_SENDER_KEY` (the stamped user wallet; it never holds ETH).
`--account <keystore>` works in place of `--private-key` for every forge/cast command and is safer.

Devnet facts that shaped the flags:
- Base fee is 7 wei. All plain txs use `--legacy --with-gas-price 100000007`.
- The devnet charges EIP-8037 state gas for new code and storage, and forge's gas estimate leaves it out, so deploys
  run out of gas at the default estimate. `--gas-estimate-multiplier` values that worked: Deploy 1000, stamp 300,
  paymaster 2000 (its CREATE also deploys HegotaSupport's 7 helper contracts; 400 was not enough).
- Deadlines come from chain time (`lastSeen`), never the wall clock.

```sh
export ALTMEMPOOL_EXEC_RPC=https://altmempool.forshtat.com     # foundry.toml's `devnet` endpoint
cd contracts
FX=test/fixtures/devnet-stamp.json
```

**1. Proof fixture (synthetic test card only).** The proof's appId is bound to the app owner, so it must be made for
the deployer. `test/fixtures/devnet-stamp.json` is that fixture for `0x9674…e135` with salt 0; a reset devnet reuses
it. To regenerate (from the repo root):
```sh
(cd circuits && nargo compile)
APP_OWNER=$DEVNET_DEPLOYER OUT=contracts/test/fixtures/devnet-stamp.json node contracts/script/gen-stamp-fixture.ts \
  devnet-$(date +%Y%m%d) $(shasum -a 256 circuits/target/watermark.json | cut -d' ' -f1) 1.0.0
```

**2. Registry, router, verifier, app** (caRoot and rulesRoot from the fixture; test app only).
```sh
SESSION_SIGNER_ADDRESS=$DEVNET_SESSION_SIGNER \
CA_ROOT=$(node -p "require('./$FX').caRoot") RULES_ROOT=$(node -p "require('./$FX').rulesRoot") REGISTER_LIVE=false \
forge script script/Deploy.s.sol --rpc-url devnet --private-key $DEVNET_DEPLOYER_KEY \
  --legacy --with-gas-price 100000007 --gas-estimate-multiplier 1000 --slow --broadcast
node script/deployment-json.ts 1337        # writes deployments/devnet.json (re-add the EF fields afterwards)
export REGISTRY=$(node -p "require('../deployments/devnet.json').registry")
export APP_ID=$(node -p "require('../deployments/devnet.json').appId")
```

**3. Stamp the user wallet** with a normal tx. The deployer pays, never the user.
```sh
FIXTURE=$FX WALLET=$DEVNET_WALLET SESSION_SIGNER_PK=$DEVNET_SESSION_SIGNER_PK \
forge script script/StampFromFixture.s.sol --rpc-url devnet --private-key $DEVNET_DEPLOYER_KEY \
  --legacy --with-gas-price 100000007 --gas-estimate-multiplier 300 --slow --broadcast
cast call $REGISTRY 'stampExpiry(address,uint256)(uint64)' $DEVNET_WALLET $APP_ID --rpc-url devnet   # 1803859199
```

**4. Paymaster: deploy, fund 0.05 ETH, stake 0.012 ETH for 86400 s** (it calls `addStake` itself), then the demo target.
```sh
forge script script/DeployQuotaPaymaster.s.sol --rpc-url devnet --private-key $DEVNET_DEPLOYER_KEY \
  --legacy --with-gas-price 100000007 --gas-estimate-multiplier 2000 --slow --broadcast
export PM=<WatermarkQuotaPaymaster from the log>
cast call 0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f 'getDepositInfo(address)(uint256,uint32,uint64)' $PM \
  --rpc-url devnet                                       # 0.012 ETH (1.2e16 wei), 86400, 0
forge create src/demo/DemoCounter.sol:DemoCounter --rpc-url devnet --private-key $DEVNET_DEPLOYER_KEY \
  --legacy --gas-price 100000007 --gas-limit 6000000 --broadcast
export COUNTER=<Deployed to>
```
(After a failed attempt, add `--start-fresh` to `forge script` so it does not resume the old broadcast.)

**5. Keep the clock fresh.** The paymaster accepts deadlines in `[lastSeen + 7 min, lastSeen + 1 h]`. A new paymaster
is fresh, and every sponsored tx refreshes it. Otherwise poke (a plain tx, about 26k gas, paid by the relayer):
```sh
cd ../tools/ef-sender
RELAYER_KEY=$DEVNET_DEPLOYER_KEY node src/send-quota-tx.ts poke --paymaster $PM --send            # one-off
RELAYER_KEY=$DEVNET_DEPLOYER_KEY node src/send-quota-tx.ts poke --paymaster $PM --send --every 60 # for a session
```
On 2026-11-06 the one-off answered `lastSeen 1793968500 is current for head 1793968698 (TICK 300); nothing to do`,
so no poke tx was needed.

**6. Dry run, then send** to the sidecar.
```sh
node src/send-quota-tx.ts --paymaster $PM --target $COUNTER                                   # dry run
SENDER_KEY=$DEVNET_SENDER_KEY node src/send-quota-tx.ts --paymaster $PM --target $COUNTER --send
#   admitted: 0x<hash>
#   explorer: https://explorer.altmempool.wtf/tx/0x<hash>?node=https%3A%2F%2Faltmempool.forshtat.com%2Frpc
```
Refusals name the rule: `DeadlineTooFar` / `DeadlineTooSoon` mean poke first; `WrongFees` means the fees do not match
the paymaster's pin (the tool reads and uses the pinned values itself).

**7. Check (read-only).**
```sh
cast receipt <hash> --rpc-url devnet                                  # status 1, payer = $PM, 5 frameReceipts
cast call $COUNTER 'count(address)(uint256)' $DEVNET_WALLET --rpc-url devnet       # 1
cast balance $DEVNET_WALLET --rpc-url devnet                                        # 0: the user paid nothing
DAY=$(( $(cast call $PM 'lastSeen()(uint64)' --rpc-url devnet) / 86400 ))
cast storage 0x0000000000000000000000000000000000008250 \
  $(cast call $PM 'nonceSlot(address,uint256)(bytes32)' $DEVNET_WALLET $DAY --rpc-url devnet) --rpc-url devnet  # used today
```

The 2026-11-06 run's addresses and tx hashes are in `deployments/devnet.json`. The devnet can reset; then repeat from
step 2.

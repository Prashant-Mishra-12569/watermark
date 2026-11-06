#!/usr/bin/env bash
# Gasless USDT payment, end to end, on a LOCAL anvil fork of Whitechain Sepolia (1874). Nothing here sends a
# transaction to a public network: every write goes to http://127.0.0.1:$ANVIL_PORT, and every key is a public anvil
# test key or a throwaway key made for this run.
#
# What it proves, against the REAL Whitechain USDT (TetherTokenV2 proxy 0xcedf…55a7) and the REAL WatermarkRegistry v2:
#   A. DeploySponsor.s.sol deploys a sponsor for the live appId (relayer = anvil key #1). The relayer from this repo
#      (relayer/src/index.ts, a real server process) runs against the fork. The website's own code
#      (web/src/lib/pay.ts signPayment, web/src/lib/relayer.ts getBalance/postFund/postPay) drives it:
#      /balance → /fund → /balance → sign EIP-3009 → /pay → receipt status 1, payer USDT down, shop USDT up,
#      payer WBT and nonce unchanged (0 gas paid by the user), tx.from == relayer. Then: replay → refused, over balance
#      → refused, unstamped wallet → NOT_STAMPED, tampered intent → BAD_SIGNATURE, each with zero relayer gas.
#   B. The sponsor already deployed on Whitechain (REAL_SPONSOR, read-only on the real chain) is the same bytecode as
#      contracts/src/WatermarkSponsor.sol and pays a web-signed authorization when its real relayer (impersonated in
#      the fork only) calls it.
#
# The payer is a fresh key with 0 WBT, stamped for the live appId by writing the registry's stampExpiry slot in the
# fork (no card tap: this test is about the payment, not the proof).
#
# Usage: e2e-pay/fork-pay.sh            (needs Node 24, ~/.foundry/bin, the repo's node_modules)
# Env:   FORK_URL (default https://rpc.testnet.whitechain.io), ANVIL_PORT (18620), RELAYER_PORT (18622),
#        REAL_SPONSOR (default: the sponsor in the live deployments/whitechain.json, 0xAbD7…D7BA; empty = skip part B)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
FOUNDRY="${FOUNDRY_BIN:-$HOME/.foundry/bin}"
FORK_URL="${FORK_URL:-https://rpc.testnet.whitechain.io}"
ANVIL_PORT="${ANVIL_PORT:-18620}"
RELAYER_PORT="${RELAYER_PORT:-18622}"
RPC="http://127.0.0.1:${ANVIL_PORT}"
REAL_SPONSOR="${REAL_SPONSOR-0xAbD7327f6E6b884aEf395B80De073B8aDd0aD7BA}"
LIVE_APP_ID="${LIVE_APP_ID:-245737539065175059008558421319713289281964530398934598066600266060113564106}"
REGISTRY="${REGISTRY:-0x998934Efa31a6bE75945fDfAa126d3D6401F8Fd6}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/fork-pay.XXXXXX")"

# Public anvil test keys ("test test ... junk"). Never use these on a real chain.
DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # #0
RELAYER_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d    # #1 0x7099…79C8
BUSINESS_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a   # #2 0x3C44…93BC
SESSION_KEY=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f1270d64d0a52f1cfb8d4    # #4 (sessions are not used here)
RELAYER_ADDR=0x70997970C51812dc3A010C7d01b50e0d17dc79C8

for p in "$ANVIL_PORT" "$RELAYER_PORT"; do
  if lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then echo "port $p is in use; pick another (ANVIL_PORT / RELAYER_PORT)"; exit 2; fi
done

ANVIL_PID=""; RELAYER_PID=""; BROADCAST_DIRS=()
cleanup() {
  [ -n "$RELAYER_PID" ] && kill "$RELAYER_PID" 2>/dev/null || true
  [ -n "$ANVIL_PID" ] && kill "$ANVIL_PID" 2>/dev/null || true
  # forge script writes fork-only broadcast/cache files for chain 1874: remove them so nobody mistakes them for a real deploy.
  for d in "${BROADCAST_DIRS[@]+"${BROADCAST_DIRS[@]}"}"; do rm -rf "$d"; rmdir "$(dirname "$d")" 2>/dev/null || true; done
  rmdir "$ROOT/contracts/broadcast" 2>/dev/null || true
  echo "stopped anvil and the relayer; logs in $WORK"
}
trap cleanup EXIT

echo "== $(date +%T) anvil fork of $FORK_URL on :$ANVIL_PORT"
# --retries/--timeout: the public RPC sometimes resets a connection while the fork fetches state.
"$FOUNDRY/anvil" --fork-url "$FORK_URL" --port "$ANVIL_PORT" --retries 10 --timeout 45000 >"$WORK/anvil.log" 2>&1 &
ANVIL_PID=$!
for _ in $(seq 1 60); do "$FOUNDRY/cast" chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.5; done
[ "$("$FOUNDRY/cast" chain-id --rpc-url "$RPC")" = "1874" ] || { echo "fork is not chain 1874"; exit 1; }
"$FOUNDRY/cast" client --rpc-url "$RPC" | grep -qi anvil || { echo "$RPC is not anvil"; exit 1; }

echo "== $(date +%T) DeploySponsor.s.sol on the fork (live appId, relayer = anvil #1)"
for d in "$ROOT/contracts/broadcast/DeploySponsor.s.sol/1874" "$ROOT/contracts/cache/DeploySponsor.s.sol/1874"; do
  [ -e "$d" ] || BROADCAST_DIRS+=("$d")
done
# env -i: forge sees only these settings (no stray RELAYER_PRIVATE_KEY or .env from the shell).
# Up to 3 tries: a reset upstream connection fails the whole forge run (a retry deploys at the next nonce; the address
# is read from the log either way).
deployed=""
for try in 1 2 3; do
  if (cd "$ROOT/contracts" && env -i PATH="$PATH" HOME="$HOME" APP_ID="$LIVE_APP_ID" RELAYER_ADDRESS="$RELAYER_ADDR" \
    "$FOUNDRY/forge" script script/DeploySponsor.s.sol --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" --broadcast) \
    >"$WORK/deploy.log" 2>&1; then deployed=1; break; fi
  echo "deploy try $try failed: $(grep -m1 -i error "$WORK/deploy.log" | cut -c1-160)"; sleep 3
done
[ -n "$deployed" ] || { cat "$WORK/deploy.log"; exit 1; }
SPONSOR="$(awk '$1 == "WatermarkSponsor" && $2 ~ /^0x[0-9a-fA-F]{40}$/ {print $2; exit}' "$WORK/deploy.log")"
[ -n "$SPONSOR" ] || { cat "$WORK/deploy.log"; exit 1; }
echo "fork sponsor: $SPONSOR"

echo "== $(date +%T) relayer (relayer/src/index.ts) on :$RELAYER_PORT against the fork"
# env -i again: the relayer gets the fork RPC and test keys only, never the repo .env (no --env-file).
(cd "$ROOT/relayer" && exec env -i PATH="$PATH" HOME="$HOME" \
  WHITECHAIN_RPC="$RPC" ALTMEMPOOL_EXEC_RPC="http://127.0.0.1:9" \
  REGISTRY_ADDRESS="$REGISTRY" SPONSOR_ADDRESS="$SPONSOR" APP_IDS="$LIVE_APP_ID" \
  RELAYER_PRIVATE_KEY="$RELAYER_KEY" BUSINESS_PRIVATE_KEY="$BUSINESS_KEY" SESSION_SIGNER_KEY="$SESSION_KEY" \
  PROVER_URL="http://127.0.0.1:9" RELAYER_PORT="$RELAYER_PORT" DEMO_MODE=false \
  node src/index.ts) >"$WORK/relayer.log" 2>&1 &
RELAYER_PID=$!
for _ in $(seq 1 60); do curl -sf "http://127.0.0.1:$RELAYER_PORT/health" >/dev/null 2>&1 && break; sleep 0.5; done
curl -sf "http://127.0.0.1:$RELAYER_PORT/health" >/dev/null || { cat "$WORK/relayer.log"; exit 1; }

echo "== $(date +%T) driver (web code → relayer → fork)"
set +e
env RPC="$RPC" RELAYER_URL="http://127.0.0.1:$RELAYER_PORT" ROOT="$ROOT" SPONSOR="$SPONSOR" REAL_SPONSOR="$REAL_SPONSOR" \
  LIVE_APP_ID="$LIVE_APP_ID" REGISTRY="$REGISTRY" RELAYER_ADDR="$RELAYER_ADDR" \
  node "$HERE/fork-pay.mts"
STATUS=$?
set -e
echo "== relayer log (reasons and short wallets only)"
cat "$WORK/relayer.log"
exit $STATUS

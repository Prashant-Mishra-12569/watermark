// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {WatermarkQuotaPaymaster} from "../src/WatermarkQuotaPaymaster.sol";
import {IStampExpiry} from "../src/interfaces/IStampExpiry.sol";

/// Deploys, funds and stakes the paymaster on the alt mempool devnet (chain 1337).
/// Ran on 2026-11-06; the result is in deployments/devnet.json.
///
///   export ALTMEMPOOL_EXEC_RPC=https://altmempool.forshtat.com
///   REGISTRY=0x... APP_ID=<decimal or 0x> forge script script/DeployQuotaPaymaster.s.sol \
///     --rpc-url devnet --account devnet --broadcast --legacy --with-gas-price 100000007 \
///     --gas-estimate-multiplier 2000 --slow
/// The CREATE also deploys HegotaSupport's 7 helper contracts, and the devnet charges state gas for all that code,
/// which forge's estimate omits: 400 was not enough on 2026-11-06, 2000 worked.
///
/// Two txs: the CREATE (funded through its value) and stake(), which calls addStake from the paymaster itself
/// (the staking registry keys on msg.sender). The constructor sets lastSeen = block.timestamp rounded down to a
/// TICK, so the paymaster
/// accepts deadlines in [lastSeen + 7 min, lastSeen + 1 h] right away; keep it fresh with
/// `node src/send-quota-tx.ts poke` (tools/ef-sender).
///
/// Environment (all optional except REGISTRY and APP_ID):
///   QUOTA_PER_DAY        20       sponsored txs per wallet per UTC day
///   MAX_COST_PER_TX_WEI  1e15     cap on TXPARAM 0x06 max_cost (= 1M gas at 1 gwei); also the solvency reservation
///   SPONSORED_MAX_FEE    1e9      exact max_fee_per_gas every sponsored tx must sign (>= 10; above the base fee)
///   SPONSORED_TIP        1e6      exact max_priority_fee_per_gas (ethrex MIN_GAS_TIP, the floor its fee oracle
///                                 reports, so the tx also passes the sidecar's optional enforceGasPrice filter)
///   FUNDING_WEI          0.05 ETH
///   STAKE_WEI            0.012 ETH (> 0.01 ETH devnet minimum), unstake delay 1 day
contract DeployQuotaPaymaster is Script {
    address internal constant STAKING_REGISTRY = 0xD51c04d7A0B01124E84DE152F4e56d9eeCB22D2F;

    function run() external returns (WatermarkQuotaPaymaster pm) {
        require(block.chainid == 1337, "devnet only");
        address registry = vm.envAddress("REGISTRY");
        uint256 appId = vm.envUint("APP_ID");
        uint32 quota = uint32(vm.envOr("QUOTA_PER_DAY", uint256(20)));
        uint256 maxCost = vm.envOr("MAX_COST_PER_TX_WEI", uint256(1e15));
        uint256 maxFee = vm.envOr("SPONSORED_MAX_FEE", uint256(1 gwei));
        uint256 tip = vm.envOr("SPONSORED_TIP", uint256(1_000_000));
        uint256 funding = vm.envOr("FUNDING_WEI", uint256(0.05 ether));
        uint256 stakeWei = vm.envOr("STAKE_WEI", uint256(0.012 ether));

        // The paymaster's VERIFY calls stampExpiry(address,uint256); fail here, not in every VERIFY, if it is missing.
        require(registry.code.length != 0, "REGISTRY has no code on this chain");
        IStampExpiry(registry).stampExpiry(address(0), appId);
        require(block.basefee < maxFee, "SPONSORED_MAX_FEE must be above the current base fee");

        vm.startBroadcast();
        pm = new WatermarkQuotaPaymaster{value: funding}(registry, appId, quota, maxCost, STAKING_REGISTRY, maxFee, tip);
        pm.stake{value: stakeWei}(1 days);
        vm.stopBroadcast();

        (uint256 staked, uint32 delay,) = pm.STAKING_REGISTRY().getDepositInfo(address(pm));
        require(staked == stakeWei && delay == 1 days, "stake not recorded");
        console2.log("WatermarkQuotaPaymaster", address(pm));
        console2.log("balance (wei)          ", address(pm).balance);
        console2.log("staked (wei)           ", staked);
        console2.log("lastSeen               ", pm.lastSeen());
    }
}

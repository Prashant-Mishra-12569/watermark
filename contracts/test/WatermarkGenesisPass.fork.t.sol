// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {WatermarkGenesisPass} from "../src/WatermarkGenesisPass.sol";
import {WatermarkPassRenderer} from "../src/WatermarkPassRenderer.sol";
import {IWatermarkRegistry} from "../src/interfaces/IWatermarkRegistry.sol";
import {DeployGenesisPass} from "../script/DeployGenesisPass.s.sol";
import {PassTestBase} from "./utils/PassTestBase.sol";

/// @dev The live WatermarkSponsor's views this test reads.
interface ILiveSponsor {
    function appId() external view returns (uint256);
    function relayer() external view returns (address);
    function registry() external view returns (address);
}

/// @notice Fork tests against the LIVE WatermarkRegistry v2 on Whitechain Sepolia (read-only fork: nothing is
/// broadcast). The pass is deployed inside the fork, bound to the CURRENT live app (`liveAppId` in
/// deployments/whitechain.json), the same app the current sponsor (`sponsor`) pays for.
///
/// No real card has stamped a wallet in the current live app yet, so the mint paths for that app fake the stamp with
/// vm.mockCall on the live registry (inside the fork only). The one real-card stamp on-chain is in the previous live
/// app ("first live app, before the stricter filter"); `test_fork_realCardStampMints` mints against it with a pass
/// bound to that app, and `test_fork_previousAppStampDoesNotUnlock` shows it does not unlock the current pass.
///
/// Run with `forge test --fork-url https://rpc.testnet.whitechain.io` (or plain `forge test`: setUp forks itself when
/// the current chain isn't 1874, using $WHITECHAIN_RPC or the public RPC). Set SKIP_FORK=true to skip offline.
contract WatermarkGenesisPassForkTest is PassTestBase {
    address internal constant LIVE_REGISTRY = 0x998934Efa31a6bE75945fDfAa126d3D6401F8Fd6;
    /// @dev The first live app (before the stricter filter). Superseded, still on-chain (`previousLive` in the file).
    uint256 internal constant PREVIOUS_LIVE_APP_ID =
        245737539065175059008558421319713289281964530398934598066600266060113564106;
    /// @dev A wallet a real card tap stamped in the PREVIOUS live app (public on-chain state; no card data).
    address internal constant REAL_CARD_WALLET = 0xeFa2A1CFeE2D3812088dEd20096A677116D28CC8;

    IWatermarkRegistry internal registry = IWatermarkRegistry(LIVE_REGISTRY);
    WatermarkPassRenderer internal renderer;
    WatermarkGenesisPass internal pass;
    address internal minter = makeAddr("relayer");
    bool internal skipFork;

    // From deployments/whitechain.json: the current live app and its sponsor.
    string internal deployment;
    uint256 internal liveAppId;
    bytes32 internal liveRulesRoot;
    address internal liveSponsor;

    function setUp() public {
        if (vm.envOr("SKIP_FORK", false)) {
            skipFork = true;
            return;
        }
        if (block.chainid != 1874) {
            vm.createSelectFork(vm.envOr("WHITECHAIN_RPC", string("https://rpc.testnet.whitechain.io")));
        }
        assertEq(block.chainid, 1874, "not a Whitechain Sepolia fork");
        assertGt(LIVE_REGISTRY.code.length, 0, "registry v2 has no code on this fork");

        deployment = vm.readFile(string.concat(vm.projectRoot(), "/../deployments/whitechain.json"));
        liveAppId = vm.parseJsonUint(deployment, ".liveAppId");
        liveRulesRoot = vm.parseJsonBytes32(deployment, ".liveRulesRoot");
        liveSponsor = vm.parseJsonAddress(deployment, ".sponsor");
        assertEq(vm.parseJsonAddress(deployment, ".registry"), LIVE_REGISTRY, "deployment file registry");
        assertTrue(liveAppId != PREVIOUS_LIVE_APP_ID, "the file still names the previous live app");

        renderer = new WatermarkPassRenderer();
        pass = new WatermarkGenesisPass(LIVE_REGISTRY, liveAppId, minter, address(renderer));
    }

    modifier forkOnly() {
        if (skipFork) vm.skip(true);
        _;
    }

    function _mint(address to) internal returns (uint256) {
        vm.prank(minter);
        return pass.mint(to);
    }

    /// @dev Fakes a live stamp for `w` in `app` (inside the fork only).
    function _fakeStamp(address w, uint256 app) internal {
        vm.mockCall(
            LIVE_REGISTRY,
            abi.encodeCall(IWatermarkRegistry.isStamped, (w, app)),
            abi.encode(true, uint64(block.timestamp + 30 days))
        );
    }

    // ------------------------------------------------------------------ the current live app and its sponsor

    function test_fork_currentLiveAppIsRegistered_andTheSponsorPaysForIt() public forkOnly {
        (address owner, bytes32 root,) = registry.apps(liveAppId);
        assertTrue(owner != address(0), "current live app registered");
        assertEq(root, liveRulesRoot, "on-chain rulesRoot is liveRulesRoot");
        assertEq(vm.parseJsonUint(deployment, ".sponsorAppId"), liveAppId, "sponsorAppId == liveAppId");

        // The relayer reads payments from this sponsor, and the pass checks stamps for this app: they must agree.
        ILiveSponsor sponsor = ILiveSponsor(liveSponsor);
        assertEq(sponsor.appId(), liveAppId, "the current sponsor pays for the current live app");
        assertEq(sponsor.registry(), LIVE_REGISTRY, "the sponsor reads the same registry");
        assertTrue(sponsor.relayer() != address(0), "the sponsor has a relayer");
    }

    function test_fork_unstampedWalletRefused() public forkOnly {
        address nobody = makeAddr("never stamped");
        (bool ok,) = registry.isStamped(nobody, liveAppId);
        assertFalse(ok);
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NotStamped.selector, nobody));
        _mint(nobody);
        assertEq(pass.totalSupply(), 0);
    }

    /// @dev The real wallet's stamp is for the previous live app; the current pass must not accept it.
    function test_fork_previousAppStampDoesNotUnlock() public forkOnly {
        (bool previousOk,) = registry.isStamped(REAL_CARD_WALLET, PREVIOUS_LIVE_APP_ID);
        assertTrue(previousOk, "the real wallet is stamped in the previous live app");
        (bool currentOk,) = registry.isStamped(REAL_CARD_WALLET, liveAppId);
        if (currentOk) vm.skip(true); // that wallet was stamped in the current app later: nothing to show here
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NotStamped.selector, REAL_CARD_WALLET));
        _mint(REAL_CARD_WALLET);
    }

    function test_fork_stampedWalletMints_fakedStamp() public forkOnly {
        address w = makeAddr("stamped in the current live app");
        _fakeStamp(w, liveAppId);
        (bool stamped, uint64 exp, uint256 id, uint256 left) = pass.status(w);
        assertTrue(stamped);
        assertEq(id, 0);
        assertEq(left, 100);

        assertEq(_mint(w), 1);
        assertEq(pass.ownerOf(1), w);
        assertEq(pass.balanceOf(w), 1);
        assertTrue(pass.claimed(w));
        (,, id, left) = pass.status(w);
        assertEq(id, 1);
        assertEq(left, 99);
        assertGt(exp, 0);
        bytes memory svg = _checkTokenURI(pass, 1);
        assertTrue(_contains(svg, ">001</text>"));
    }

    function test_fork_secondMintRefused() public forkOnly {
        address w = makeAddr("claims twice");
        _fakeStamp(w, liveAppId);
        _mint(w);
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.AlreadyClaimed.selector, w, 1));
        _mint(w);
    }

    function test_fork_onlyMinter() public forkOnly {
        address w = makeAddr("not the minter");
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NotMinter.selector, w));
        vm.prank(w);
        pass.mint(w);
    }

    /// @dev 100 wallets are made "stamped" with vm.mockCall on the live registry (inside the fork only), then the
    /// 101st claim is refused.
    function test_fork_supplyCap() public forkOnly {
        for (uint256 i = 1; i <= 100; i++) {
            address w = address(uint160(0xC0FFEE0000 + i));
            _fakeStamp(w, liveAppId);
            assertEq(_mint(w), i);
        }
        assertEq(pass.remaining(), 0);

        address late = address(uint160(0xC0FFEE0000 + 1000));
        _fakeStamp(late, liveAppId);
        vm.expectRevert(WatermarkGenesisPass.SoldOut.selector);
        _mint(late);
        _checkTokenURI(pass, 100);
    }

    // ------------------------------------------------------------------ a real card's stamp (previous live app)

    /// @dev The contract against a real stamp from a real card tap, with no mocks: a pass bound to the previous live
    /// app (where that stamp lives) mints to that wallet. The deployed pass binds to the current app instead.
    function test_fork_realCardStampMints() public forkOnly {
        WatermarkGenesisPass previous =
            new WatermarkGenesisPass(LIVE_REGISTRY, PREVIOUS_LIVE_APP_ID, minter, address(renderer));
        (bool stamped, uint64 exp,,) = previous.status(REAL_CARD_WALLET);
        assertTrue(stamped, "real-card stamp in the previous live app");
        assertGt(exp, block.timestamp);
        vm.prank(minter);
        assertEq(previous.mint(REAL_CARD_WALLET), 1);
        assertEq(previous.ownerOf(1), REAL_CARD_WALLET);
        _checkTokenURI(previous, 1);
    }

    // ------------------------------------------------------------------ the deploy script

    /// @dev The deploy script's config layer reads the real deployments/whitechain.json and binds to the current live
    /// app, with the current sponsor's relayer as the minter; its preflight and deploy then run inside the fork
    /// (broadcast inside a test only records; nothing is sent).
    function test_fork_deployScriptBindsToTheLiveApp() public forkOnly {
        address relayer = ILiveSponsor(liveSponsor).relayer();
        DeployGenesisPass script = new DeployGenesisPass();
        DeployGenesisPass.Config memory c = script.resolve(deployment, 1874, address(0), false, 0, relayer, 0);
        assertEq(c.registry, LIVE_REGISTRY);
        assertEq(c.appId, liveAppId);
        assertEq(c.minter, relayer);
        assertEq(c.sponsor, liveSponsor);
        script.preflight(c);
        WatermarkGenesisPass deployed = script.deploy(c);
        assertEq(address(deployed.registry()), LIVE_REGISTRY);
        assertEq(deployed.appId(), liveAppId);
        assertEq(deployed.minter(), relayer);
        assertGt(address(deployed.renderer()).code.length, 0, "the script deployed a renderer");

        address w = makeAddr("first claimer");
        _fakeStamp(w, liveAppId);
        vm.prank(relayer);
        assertEq(deployed.mint(w), 1);
        _checkTokenURI(deployed, 1);
    }

    /// @dev The preflight refuses a pass whose app the deployment file's sponsor doesn't pay for (PASS_APP_ID override).
    function test_fork_deployScriptRefusesAnAppTheSponsorDoesNotPayFor() public forkOnly {
        DeployGenesisPass script = new DeployGenesisPass();
        DeployGenesisPass.Config memory c =
            script.resolve(deployment, 1874, address(0), false, PREVIOUS_LIVE_APP_ID, minter, 0);
        assertEq(c.appId, PREVIOUS_LIVE_APP_ID);
        vm.expectRevert(bytes("DeployGenesisPass: the sponsor in the deployment file pays for another app"));
        script.preflight(c);
    }
}

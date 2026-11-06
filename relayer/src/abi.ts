/**
 * WatermarkRegistry ABI fragments used by the relayer (interfaces F5).
 * Function fragments mirror contracts/src/interfaces/IWatermarkRegistry.sol exactly: the Session tuple order is
 * wallet, appId, nonce, expiresAt, validUntilMonth, chainId, registry. abi.test.ts checks this against the .sol file.
 *
 * The error fragments exist only so a reverted simulation can be named (422 STAMP_REJECTED { reason }). They are
 * exactly the errors declared in WatermarkRegistry.sol and MonthMath.sol (abi.test.ts checks both ways). The
 * generated HonkVerifier's own errors (SumcheckFailed, ValueGeFieldOrder, ...) are not listed: stamp() wraps
 * verify() in try/catch, so every verifier failure reaches the relayer as InvalidProof(). An error missing here is
 * reported by its 4-byte selector instead of its name, so a stale list degrades the reason string, never the behaviour.
 */
import { parseAbi } from "viem";

export const registryAbi = parseAbi([
  "struct Session { address wallet; uint256 appId; bytes32 nonce; uint64 expiresAt; uint32 validUntilMonth; uint256 chainId; address registry; }",
  "function stamp(Session s, bytes sessionSig, bytes proof, bytes32[] publicInputs)",
  "function isStamped(address wallet, uint256 appId) view returns (bool ok, uint64 expiresAt)",
  "function apps(uint256 appId) view returns (address owner, bytes32 rulesRoot, address sessionSigner)",
  "function caRoot() view returns (bytes32)",
  // Not in IWatermarkRegistry: a helper view on WatermarkRegistry itself (equals the sdk's hashSession).
  "function hashSession(Session s) view returns (bytes32)",

  // WatermarkRegistry admin and two-step ownership (cannot come from stamp; listed so the mirror is complete)
  "error NotOwner()",
  "error NotPendingOwner()",
  "error ZeroRulesRoot()",
  "error ZeroSessionSigner()",
  "error AppAlreadyExists(uint256 appId)",
  // WatermarkRegistry.stamp, checks 1-8 (F5)
  "error AppNotFound(uint256 appId)",
  "error ZeroWallet()",
  "error SessionExpired(uint64 expiresAt, uint256 nowTs)",
  "error WrongChainId(uint256 sessionChainId, uint256 chainId)",
  "error WrongRegistry(address sessionRegistry)",
  "error SessionAlreadyUsed(bytes32 digest)",
  "error InvalidSignature()",
  "error WrongSessionSigner(address recovered, address expected)",
  "error BadPublicInputsLength(uint256 length)",
  "error CaRootNotSet()",
  "error CaRootMismatch(bytes32 got, bytes32 expected)",
  "error RulesRootMismatch(bytes32 got, bytes32 expected)",
  "error AppIdMismatch(uint256 got, uint256 expected)",
  "error UnMismatch(uint256 got, uint256 expected)",
  "error ValidUntilMonthMismatch(uint256 got, uint32 expected)",
  "error ValidUntilMonthOutOfRange(uint256 validUntilMonth, uint256 currentMonth)",
  "error NullifierBoundToOtherWallet(bytes32 nullifier, address boundWallet)",
  "error InvalidProof()",
  // MonthMath (internal library: its reverts come from the registry's own code)
  "error BeforeYear2000(uint256 timestamp)",
  "error MonthTooLarge(uint256 month)",
]);

export const sponsorAbi = parseAbi(["function quotaLeft(address wallet) view returns (uint32)"]);

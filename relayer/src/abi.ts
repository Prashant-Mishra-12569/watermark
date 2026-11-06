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

/**
 * WatermarkSponsor (contracts/src/WatermarkSponsor.sol; F5, F7). One sponsor per app. The error list is exactly the
 * errors the contract declares (abi.test.ts checks both ways), so a refused simulation is named, not just a selector.
 * USDT's own reverts are Error(string) (for example "TetherToken: auth invalid"); the sponsor bubbles them up unchanged
 * and viem decodes Error(string) without an ABI entry.
 */
export const sponsorAbi = parseAbi([
  "struct PaymentIntent { address from; address to; uint256 value; uint256 validAfter; uint256 validBefore; bytes32 nonce; }",
  "function relayPayment(PaymentIntent intent, bytes userSig)",
  "function quotaLeft(address wallet) view returns (uint32)",
  "function usedToday(address wallet) view returns (uint32)",
  "function registry() view returns (address)",
  "function appId() view returns (uint256)",
  "function usdt() view returns (address)",
  "function relayer() view returns (address)",
  "function quotaPerDay() view returns (uint32)",

  // constructor
  "error ZeroAddress()",
  "error NotAContract(address account)",
  "error InvalidAppId(uint256 appId)",
  "error ZeroQuota()",
  // relayPayment, in check order
  "error NotRelayer(address caller)",
  "error ZeroValue()",
  "error InvalidRecipient(address to)",
  "error AuthorizationNotYetValid(uint256 validAfter, uint256 nowTs)",
  "error AuthorizationExpired(uint256 validBefore, uint256 nowTs)",
  "error NotStamped(address wallet, uint256 appId)",
  "error QuotaUsed(address wallet, uint32 quotaPerDay)",
]);

/** The ERC-20 / EIP-3009 surface of Whitechain USDT (TetherTokenV2) the relayer reads or calls. */
export const usdtAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function decimals() view returns (uint8)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
]);

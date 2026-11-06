import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appNoteCopy,
  chooserNoteCopy,
  DEFAULT_BURNER_LABEL,
  isRelayerDown,
  noWalletFoundCopy,
  PAY_RECEIPT,
  payErrorCopy,
  payNoStampCopy,
  QR_STEPS,
  relayerDownCopy,
  sessionErrorCopy,
  statusNoteCopy,
  TAPPED_NOTHING_HAPPENED,
  VERIFY_RECEIPT,
  verifiedUntilCopy,
  walletErrorCopy,
  walletGateCopy,
} from "./messages.ts";
import type { RelayerErrorCode } from "./relayer.ts";
import type { WalletErrorCode } from "./wallet.ts";
import { LIVE_APP, PREVIOUS_LIVE_APP, PREVIOUS_LIVE_LABEL, TEST_APP } from "./site.ts";

test("relayer unreachable: the shared line counts down in whole seconds", () => {
  assert.equal(relayerDownCopy(5), "Can't reach our server. Trying again in 5s.");
  assert.equal(relayerDownCopy(4.2), "Can't reach our server. Trying again in 5s.");
  assert.equal(relayerDownCopy(-3), "Can't reach our server. Trying again in 0s.");
  assert.equal(relayerDownCopy(Number.NaN), "Can't reach our server. Trying again in 0s.");
  // DESIGN_V2: no "relayer" jargon on user pages.
  assert.doesNotMatch(relayerDownCopy(5), /relayer/i);
  assert.equal(isRelayerDown("NETWORK"), true);
  assert.equal(isRelayerDown("TIMEOUT"), true);
  assert.equal(isRelayerDown("CHAIN_UNAVAILABLE"), false);
  assert.equal(isRelayerDown("RATE_LIMIT"), false);
});

test("wallet chooser: /verify and the pass walk use DESIGN_V2's two options, the browser wallet first", () => {
  assert.equal(walletGateCopy("verify").title, "Where should we keep your stamp?");
  assert.equal(walletGateCopy("pass").title, "Where should we keep your pass?");
  for (const purpose of ["verify", "pass"] as const) {
    const c = walletGateCopy(purpose);
    assert.equal(`${c.burner.title}: ${c.burner.body}`, "In this browser: Easiest. Nothing to install.");
    assert.equal(`${c.own.title}: ${c.own.body}`, "My wallet: MetaMask or similar. You only share your address.");
    assert.equal(c.burner.button, "Use this browser");
    assert.equal(c.burnerFirst, true);
    // "fee", never "gas", on user pages.
    assert.doesNotMatch(`${c.title} ${c.sub} ${c.own.body} ${c.burner.body}`, /\bgas\b/i);
  }

  // /pay: the same two options in the same order, with the same button as step 1 (the browser wallet first).
  const pay = walletGateCopy("pay");
  assert.equal(pay.title, "Which wallet will you pay from?");
  assert.equal(pay.own.title, "My wallet");
  assert.equal(pay.burner.title, "In this browser");
  assert.equal(pay.burner.button, "Use this browser");
  assert.equal(pay.burnerFirstOnTouch, true);
  assert.equal(pay.burnerFirst, true);
  assert.equal(pay.burner.button, walletGateCopy("verify").burner.button);
  assert.equal(pay.burner.button, walletGateCopy("pass").burner.button);
  // /pay's main path says "network fee", not "gas", and "stamped", not "verified".
  assert.match(pay.sub, /network fee/);
  assert.doesNotMatch(`${pay.title} ${pay.sub} ${pay.own.body} ${pay.burner.body}`, /\bgas\b|verified/i);
  // The button label fits a narrow card: no truncation at 1440px's two-card layout.
  assert.ok(pay.burner.button.length <= 20);
  assert.notEqual(DEFAULT_BURNER_LABEL, pay.burner.button);
});

test("wallet chooser notes name the button the page really shows", () => {
  const label = walletGateCopy("pass").burner.button;
  assert.match(chooserNoteCopy("LOCKED", "MetaMask", label).next, /"Use this browser" uses a different wallet/);
  assert.match(chooserNoteCopy("LOCKED", "MetaMask").next, /"Continue without a wallet" uses a different wallet/);
  assert.match(noWalletFoundCopy(true, label), /^No wallet in this browser\. Choose "Use this browser", or open/);
  assert.match(noWalletFoundCopy(false, label), /or choose "Use this browser"\.$/);
  // The default copy is unchanged.
  assert.equal(
    noWalletFoundCopy(true),
    "No wallet in this browser. Continue without a wallet, or open this page in your wallet app's browser (MetaMask, Rabby, Coinbase Wallet).",
  );
  assert.equal(
    noWalletFoundCopy(false),
    "No browser wallet found. Install one (for example MetaMask), reload this page, or continue without a wallet.",
  );
});

test("/verify note: only for a non-live app on Whitechain, and the pass is named only while live", () => {
  const base = {
    chainId: "1874",
    liveAppId: LIVE_APP.appId,
    previousLiveAppId: PREVIOUS_LIVE_APP.appId,
    previousLiveLabel: PREVIOUS_LIVE_LABEL,
    liveLabel: LIVE_APP.label,
    passLive: true,
  };
  assert.equal(appNoteCopy({ ...base, appId: LIVE_APP.appId }), null);
  assert.equal(
    appNoteCopy({ ...base, appId: TEST_APP.appId }),
    "This is a test app. Free payments and the Genesis Pass accept only stamps for the live app, RuPay (India).",
  );
  assert.equal(
    appNoteCopy({ ...base, appId: TEST_APP.appId, passLive: false }),
    "This is a test app. Free payments accept only stamps for the live app, RuPay (India).",
  );
  assert.match(appNoteCopy({ ...base, appId: PREVIOUS_LIVE_APP.appId }) ?? "", /^This is the first live app \(before the stricter filter\)\./);
  // A private app id is never echoed.
  const priv = appNoteCopy({ ...base, appId: "3086000000000000000000000000000909" }) ?? "";
  assert.doesNotMatch(priv, /3086/);
  // The devnet (hidden EF switch) has no free payments or pass to talk about.
  assert.equal(appNoteCopy({ ...base, appId: TEST_APP.appId, chainId: "1337" }), null);
});

test("/verify copy is DESIGN_V2's", () => {
  assert.equal(QR_STEPS.title, "Stamp your *wallet*.");
  assert.equal(QR_STEPS.stamped, "You're *stamped*.");
  assert.equal(QR_STEPS.lead, "Scan this with the Watermark phone app.");
  assert.equal(QR_STEPS.scan, "The phone scans this code.");
  const check = QR_STEPS.check("a9Ba");
  assert.equal(`${check.before}${check.strong}${check.after}`, "Check the phone shows your wallet ending a9Ba.");
  // The ending is shown exactly (case-sensitive): the phone shows the same 4 characters.
  assert.equal(check.strong, "a9Ba");
  assert.equal(QR_STEPS.hold, "Hold your card on the back of the phone.");
  assert.equal(`${QR_STEPS.waiting} ${QR_STEPS.waitingNote}`, "Waiting for your tap… It takes about 10 seconds after you tap.");
  assert.equal(TAPPED_NOTHING_HAPPENED.summary, "Tapped but nothing happened?");
  assert.equal(
    TAPPED_NOTHING_HAPPENED.body,
    "Only RuPay cards work today. If this card already stamped another wallet, use that wallet. If the phone lost internet, tap again.",
  );
  assert.match(TAPPED_NOTHING_HAPPENED.note, /only sees a stamp arrive/);
  assert.equal(VERIFY_RECEIPT.you, "Tapped a card, signed nothing, paid $0.");
  assert.equal(VERIFY_RECEIPT.relayer, "Put it on-chain and paid the fee.");
  assert.equal(verifiedUntilCopy("31 January 2027"), "Valid until 31 January 2027.");
  assert.equal(verifiedUntilCopy(""), "");
  // DESIGN_V2: no jargon or "gas" on the page; honest privacy words only.
  const all = [
    QR_STEPS.title,
    QR_STEPS.stamped,
    QR_STEPS.lead,
    QR_STEPS.scan,
    QR_STEPS.hold,
    QR_STEPS.waiting,
    QR_STEPS.waitingNote,
    ...Object.values(TAPPED_NOTHING_HAPPENED),
    ...Object.values(VERIFY_RECEIPT),
  ].join(" ");
  assert.doesNotMatch(all, /\bgas\b|relayer|prover|nullifier|never leaves|real person/i);
});

test("/pay copy: no-stamp boxes and the four-row receipt (DESIGN_V2 lines)", () => {
  const other = payNoStampCopy("other-app", LIVE_APP.label);
  assert.equal(other.title, "This wallet's stamp won't work here.");
  assert.doesNotMatch(`${other.title} ${other.next}`, /Verified|Stamped|free payments left/);
  assert.match(other.next, /live app, RuPay \(India\)\.$/);
  const none = payNoStampCopy("not-stamped", LIVE_APP.label);
  assert.equal(`${none.title} ${none.next}`, "This wallet has no stamp yet. Stamp it first. It takes 2 minutes.");

  assert.equal(PAY_RECEIPT.you("1"), "You signed for 1 USDT. You paid $0.");
  assert.equal(PAY_RECEIPT.relayer, "We sent it and paid the fee.");
  assert.equal(PAY_RECEIPT.business(19), "The business checked your stamp on-chain. 19 free payments left today.");
  assert.equal(PAY_RECEIPT.business(1), "The business checked your stamp on-chain. 1 free payment left today.");
  // Before the balance read after the payment answers, no number (never the count from before the payment).
  assert.equal(PAY_RECEIPT.business(null), "The business checked your stamp on-chain.");
  assert.equal(PAY_RECEIPT.shop("1.5"), "The shop got 1.5 USDT.");
  assert.equal(PAY_RECEIPT.explorer, "See it on the explorer");
  // User pages say "fee", never "gas".
  const all = [PAY_RECEIPT.you("1"), PAY_RECEIPT.relayer, PAY_RECEIPT.business(3), PAY_RECEIPT.shop("1"), other.next, none.next];
  for (const line of all) assert.doesNotMatch(line, /\bgas\b|relayer|Sponsor/i, line);
});

test("error copy speaks DESIGN_V2: short, plain, says what to do next; jargon only in operator hints", () => {
  const relayerCodes: RelayerErrorCode[] = [
    "NOT_STAMPED", "QUOTA_USED", "BUDGET_CAP", "GAS_CAP", "RATE_LIMIT", "BAD_SIGNATURE", "PAUSED",
    "SPONSOR_NOT_CONFIGURED", "FUND_NOT_CONFIGURED", "ALREADY_FUNDED", "INSUFFICIENT_FUNDS", "TX_FAILED", "TX_PENDING",
    "NONCE_USED", "PAY_REJECTED", "FUND_EMPTY", "BUSY", "BAD_REQUEST", "CHAIN_UNAVAILABLE", "NETWORK", "TIMEOUT",
    "ABORTED", "BAD_RESPONSE", "HTTP_ERROR", "UNKNOWN_APP", "CHAIN_NOT_READY",
  ];
  const walletCodes: WalletErrorCode[] = [
    "USER_REJECTED", "REQUEST_PENDING", "UNAUTHORIZED", "UNSUPPORTED_METHOD", "DISCONNECTED", "NO_ACCOUNT",
    "ACCOUNT_CHANGED", "WRONG_CHAIN", "SIGNATURE_MISMATCH", "FAILED",
  ];
  const JARGON = /\bgas\b|relayer|gasless|SPONSOR_|BUSINESS_|\.env|nullifier|calldata|EIP-?\d/i;
  const ctx = { relayerUrl: "http://localhost:8788", appId: "12345", chainName: "Whitechain Sepolia" };
  const lines: string[] = [];
  for (const c of relayerCodes) {
    const p = payErrorCopy(c, { payMaxUsdt: "5" });
    lines.push(p.title, p.next, sessionErrorCopy(c, ctx).title, statusNoteCopy(c));
  }
  for (const c of walletCodes) lines.push(walletErrorCopy(c).title, walletErrorCopy(c).next);
  for (const line of lines) {
    assert.doesNotMatch(line, JARGON, line);
    // ~12 words per sentence (DESIGN_V2): a sentence of more than 16 words is too long.
    for (const s of line.split(/(?<=[.?!])\s+/)) assert.ok(s.split(/\s+/).length <= 16, `too long: ${s}`);
  }
  // The operator hints keep their technical detail (shown only in "Details").
  assert.match(payErrorCopy("SPONSOR_NOT_CONFIGURED", { payMaxUsdt: "5" }).detail ?? "", /SPONSOR_ADDRESS/);
  assert.match(payErrorCopy("FUND_NOT_CONFIGURED", { payMaxUsdt: "5" }).detail ?? "", /BUSINESS_PRIVATE_KEY/);
  assert.match(sessionErrorCopy("NETWORK", ctx).hint, /CORS_ORIGINS/);
  // DESIGN_V2's /pay "Not stamped" line, word for word.
  const ns = payErrorCopy("NOT_STAMPED", { payMaxUsdt: "5" });
  assert.equal(`${ns.title} ${ns.next}`, "This wallet has no stamp yet. Stamp it first. It takes 2 minutes.");
});

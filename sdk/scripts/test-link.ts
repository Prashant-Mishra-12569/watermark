/**
 * Prints a signed watermark://verify link for testing the Tap app without the website.
 * Signed with the public dev signer, so only debug builds that trust it will accept it.
 *
 *   node scripts/test-link.ts [proverUrl] [chainId]
 *   adb shell am start -a android.intent.action.VIEW -d "'<link>'"
 */
import { randomBytes } from "node:crypto";
import type { Hex } from "viem";
import { buildVerifyLink, deriveUn, hashSession, sessionValidUntilMonth, SESSION_TTL_SECONDS } from "../src/session.ts";
import { signSessionDev, DEV_SESSION_SIGNER } from "../src/dev.ts";
import type { Session } from "../src/types.ts";

const proverUrl = process.argv[2] ?? "http://192.168.1.20:8787";
const chainId = process.argv[3] ?? "1874";

const session: Session = {
  wallet: "0x00000000000000000000000000000000000ab1e5",
  appId: "12345",
  nonce: `0x${randomBytes(32).toString("hex")}` as Hex,
  expiresAt: String(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS),
  validUntilMonth: sessionValidUntilMonth(),
  chainId,
  registry: "0x0000000000000000000000000000000000000001",
};

const signed = await signSessionDev(session);
console.log(`signer  ${DEV_SESSION_SIGNER}`);
console.log(`digest  ${hashSession(session)}`);
console.log(`UN      ${deriveUn(session.nonce)}`);
console.log(`expires in ${SESSION_TTL_SECONDS / 60} minutes\n`);
console.log(buildVerifyLink(signed, proverUrl));

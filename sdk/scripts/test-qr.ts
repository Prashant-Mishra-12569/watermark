/**
 * Writes a QR (PNG) for a signed test link, to check that the phone camera opens watermark:// links.
 *   node scripts/test-qr.ts <out.png> [proverUrl] [chainId] [appId]
 */
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import type { Hex } from "viem";
import { buildVerifyLink, sessionValidUntilMonth, SESSION_TTL_SECONDS } from "../src/session.ts";
import { signSessionDev } from "../src/dev.ts";
import type { Session } from "../src/types.ts";

const [out, proverUrl = "http://127.0.0.1:8787", chainId = "1874", appId = "12345"] = process.argv.slice(2);
if (!out) throw new Error("usage: node scripts/test-qr.ts <out.png> [proverUrl] [chainId] [appId]");
const session: Session = {
  wallet: "0x00000000000000000000000000000000000ab1e5",
  appId,
  nonce: `0x${randomBytes(32).toString("hex")}` as Hex,
  expiresAt: String(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS),
  validUntilMonth: sessionValidUntilMonth(),
  chainId,
  registry: "0x0000000000000000000000000000000000000001",
};
const link = buildVerifyLink(await signSessionDev(session), proverUrl);
await QRCode.toFile(out, link, { errorCorrectionLevel: "L", margin: 2, width: 900 });
console.log(`${link.length} chars → ${out}`);

/**
 * The F2 envelope: card data encrypted on the phone to the prover's RSA key.
 * ek = AES-256 key wrapped with RSA-OAEP (SHA-256, MGF1-SHA-256), iv = 12 bytes,
 * ct = AES-256-GCM ciphertext || 16-byte tag, AAD = the session's 32-byte EIP-712 hash.
 * Moving a ciphertext to another session changes the AAD, so decryption fails.
 */
import { constants, createCipheriv, createDecipheriv, privateDecrypt, publicEncrypt, randomBytes, type KeyObject } from "node:crypto";
import { hashSession, type Envelope, type Session } from "@watermark/sdk";
import { hexToBytes, type Hex } from "viem";

const hex = (b: Uint8Array): Hex => `0x${Buffer.from(b).toString("hex")}`;

/** Decrypts in memory. The caller must wipe the returned buffer when done. */
export function openEnvelope(env: Envelope, privateKey: KeyObject): Buffer {
  const aesKey = privateDecrypt(
    { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(hexToBytes(env.ek)),
  );
  try {
    const iv = Buffer.from(hexToBytes(env.iv));
    const ct = Buffer.from(hexToBytes(env.ct));
    if (aesKey.length !== 32 || iv.length !== 12 || ct.length < 17) throw new Error("bad envelope sizes");
    const decipher = createDecipheriv("aes-256-gcm", aesKey, iv);
    decipher.setAAD(Buffer.from(hexToBytes(hashSession(env.session))));
    decipher.setAuthTag(ct.subarray(ct.length - 16));
    return Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]);
  } finally {
    aesKey.fill(0);
  }
}

/** What the phone does (spec M step 7). Used here by tests and the dev tools. */
export function sealEnvelope(session: Session, sig: Hex, plaintext: Uint8Array, publicKey: KeyObject): Envelope {
  const aesKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey, iv);
  cipher.setAAD(Buffer.from(hexToBytes(hashSession(session))));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  const ek = publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, aesKey);
  aesKey.fill(0);
  return { v: 1, session, sig, ek: hex(ek), iv: hex(iv), ct: hex(ct) };
}

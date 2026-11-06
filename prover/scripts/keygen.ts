/**
 * Creates the prover's RSA-3072 key pair (interfaces F2).
 * The private key goes to a path OUTSIDE the repo; the public half goes to prover/keys/prover_pub.pem for the app.
 *   node scripts/keygen.ts /absolute/path/outside/repo/prover_key.pem
 */
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const out = process.argv[2];
const repoRoot = resolve(import.meta.dirname, "../..");
if (!out) throw new Error("usage: node scripts/keygen.ts /path/outside/repo/prover_key.pem");
if (resolve(out).startsWith(repoRoot)) throw new Error("the private key must be outside the repo");
if (existsSync(out)) throw new Error(`${out} exists; refusing to overwrite`);

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
const pub = resolve(repoRoot, "prover/keys/prover_pub.pem");
mkdirSync(dirname(pub), { recursive: true });
writeFileSync(pub, publicKey.export({ type: "spki", format: "pem" }));
console.log(`private key: ${out} (keep it off git, rotate after the event)\npublic key:  ${pub} (commit this one)`);

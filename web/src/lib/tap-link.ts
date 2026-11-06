/**
 * The rules Watermark Tap applies to a watermark://verify link
 * (android/app/src/main/java/com/watermark/tap/session/VerifyLink.kt), so the page never shows a QR the app rejects.
 * Pure logic, no React.
 */

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const SIG65 = /^0x[0-9a-fA-F]{130}$/;
const DECIMAL = /^[0-9]{1,78}$/;
const SESSION_ID = /^[A-Za-z0-9_-]{6,64}$/;
const SUPPORTED_CHAINS = new Set(["1874", "1337"]);
const PREFIX = "watermark://verify?";
const FULL_KEYS = ["w", "app", "n", "e", "v", "c", "r", "sig", "p"] as const;

/** One hostname label: letters, digits and inner hyphens (no '_': java.net.URI then has no host). */
const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const PORT = /^\d{1,5}$/;
/** Path characters java.net.URI accepts unescaped, plus %XX escapes. No spaces. */
const PATH = /^(?:\/(?:[A-Za-z0-9\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})*)*$/;

function isIpv4(host: string): boolean {
  const parts = host.split(".");
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/** A hostname the way java.net.URI reads one: dot-separated labels, the last one starting with a letter. */
function isHostname(host: string): boolean {
  const labels = host.replace(/\.$/, "").split(".");
  if (labels.length === 0 || !labels.every((l) => LABEL.test(l))) return false;
  return /^[A-Za-z]/.test(labels[labels.length - 1] ?? "");
}

/**
 * True when Watermark Tap's httpUrl() accepts `s` as is: scheme exactly "http" or "https" (lowercase), a real host
 * (IPv4 or hostname), an optional port and path. Deliberately stricter than the app (no userinfo, query, fragment
 * or IPv6), so whatever passes here also passes there.
 */
export function isTapHttpUrl(s: string): boolean {
  const m = /^(https?):\/\/([^/?#]*)([^?#]*)$/.exec(s);
  if (!m) return false;
  const authority = m[2] ?? "";
  const path = m[3] ?? "";
  const colon = authority.lastIndexOf(":");
  const host = colon >= 0 ? authority.slice(0, colon) : authority;
  const port = colon >= 0 ? authority.slice(colon + 1) : "";
  if (!host || (colon >= 0 && !PORT.test(port))) return false;
  const allDigitsAndDots = /^[\d.]+$/.test(host);
  if (allDigitsAndDots ? !isIpv4(host) : !isHostname(host)) return false;
  return PATH.test(path);
}

/** Splits the query like VerifyLinkParser.query: every part needs a non-empty key and '='. Null when malformed. */
function parseQuery(raw: string): Map<string, string> | null {
  const out = new Map<string, string>();
  for (const part of raw.split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    if (i <= 0) return null;
    let key: string;
    let value: string;
    try {
      // Java's URLDecoder turns '+' into a space, like URLSearchParams.
      key = decodeURIComponent(part.slice(0, i).replace(/\+/g, " "));
      value = decodeURIComponent(part.slice(i + 1).replace(/\+/g, " "));
    } catch {
      return null;
    }
    if (out.has(key)) return null; // the app keeps the last value, URLSearchParams the first: refuse the ambiguity
    out.set(key, value);
  }
  return out;
}

export interface FullTapLink {
  w: string;
  app: string;
  n: string;
  e: string;
  v: string;
  c: string;
  r: string;
  sig: string;
  p: string;
}

export type TapLinkResult = { ok: true; link: FullTapLink } | { ok: false; reason: string };

/** Checks a full watermark://verify link against every rule of VerifyLinkParser. `reason` names the field, never a value. */
export function checkFullTapLink(link: string): TapLinkResult {
  const fail = (reason: string): TapLinkResult => ({ ok: false, reason });
  if (!link.startsWith(PREFIX)) return fail("qr scheme");
  if (/[\s<>"{}|\\^`]/.test(link)) return fail("qr characters"); // java.net.URI would throw
  const q = parseQuery(link.slice(PREFIX.length));
  if (!q) return fail("qr query");
  if (q.has("id")) return fail("qr is a short link");
  const get = (k: string) => q.get(k) ?? "";
  for (const k of FULL_KEYS) if (!get(k)) return fail(`qr missing ${k}`);

  if (!DECIMAL.test(get("app")) || BigInt(get("app")) >= 1n << 248n) return fail("qr app");
  if (!DECIMAL.test(get("c")) || !SUPPORTED_CHAINS.has(get("c"))) return fail("qr c");
  if (!ADDRESS.test(get("w"))) return fail("qr w");
  if (!BYTES32.test(get("n"))) return fail("qr n");
  if (!DECIMAL.test(get("e"))) return fail("qr e");
  if (!DECIMAL.test(get("v"))) return fail("qr v");
  if (!ADDRESS.test(get("r"))) return fail("qr r");
  if (!SIG65.test(get("sig"))) return fail("qr sig");
  if (!isTapHttpUrl(get("p"))) return fail("qr p (PROVER_URL must look like http://<mac-lan-ip>:8787)");

  return {
    ok: true,
    link: { w: get("w"), app: get("app"), n: get("n"), e: get("e"), v: get("v"), c: get("c"), r: get("r"), sig: get("sig"), p: get("p") },
  };
}

/** True when the app would read `link` as a short link (id + relayer URL). */
export function isShortTapLink(link: string): boolean {
  if (!link.startsWith(PREFIX)) return false;
  const q = parseQuery(link.slice(PREFIX.length));
  return !!q && SESSION_ID.test(q.get("id") ?? "") && isTapHttpUrl(q.get("p") ?? "");
}

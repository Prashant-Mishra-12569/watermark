import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const webDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * One .env for every package: take the NEXT_PUBLIC_* values from the repo-root .env (and .env.local,
 * .env.development, ...). Next has already loaded web/ and caches the result, so a plain loadEnvConfig call would do
 * nothing: force a reload of the root files, then put back exactly what was set before (the shell, web/.env*) and
 * add only the root's NEXT_PUBLIC_* values. The root's private keys never enter the web server's process.env.
 */
const before = { ...process.env };
const { parsedEnv } = loadEnvConfig(
  path.resolve(webDir, ".."),
  process.env.NODE_ENV !== "production",
  { info: () => {}, error: console.error },
  true,
);
for (const k of Object.keys(process.env)) if (!(k in before)) delete process.env[k];
Object.assign(process.env, before);
for (const [k, v] of Object.entries(parsedEnv ?? {})) {
  if (k.startsWith("NEXT_PUBLIC_") && process.env[k] === undefined && v !== undefined) process.env[k] = v;
}

/** The only origin the page talks to. Same default as src/lib/config.ts. */
function relayerOrigin(): string | null {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_RELAYER_URL?.trim() || "http://localhost:8788");
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Production only (`next dev` needs eval and websockets for hot reload). The burner key lives in localStorage, so
 * keep injected script out: scripts from this origin only (Next's inline bootstrap needs 'unsafe-inline'), network
 * calls to the relayer only, no plugins, no framing.
 */
function productionSecurityHeaders(): { key: string; value: string }[] {
  if (process.env.NODE_ENV !== "production") return [];
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${relayerOrigin() ? ` ${relayerOrigin()}` : ""}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}

const nextConfig: NextConfig = {
  // The public domain reaches the dev server through the Cloudflare tunnel while the site is still being finished.
  allowedDevOrigins: ["usewatermark.xyz", "www.usewatermark.xyz"],
  devIndicators: false,
  // The sdk ships TypeScript source with .ts import extensions.
  transpilePackages: ["@watermark/sdk"],
  poweredByHeader: false,
  // Keep the repo lean: don't let `next dev` write an AGENTS.md into web/.
  agentRules: false,
  /**
   * SITE_FINAL.md: the site is two pages. The old builders page is now the home page, and the old businesses page
   * is its "You stay in control" section. Old links keep working.
   */
  async redirects() {
    return [
      { source: "/dev", destination: "/", permanent: true },
      { source: "/sponsor", destination: "/#control", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...productionSecurityHeaders(),
        ],
      },
    ];
  },
};

export default nextConfig;

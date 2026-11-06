import { statSync } from "node:fs";
import path from "node:path";
import { REPO_URL } from "@/lib/site.ts";

/*
 * The Android app's download (the /app page). The APK is not in git (*.apk is ignored): whoever builds it copies it to
 * web/public/download/watermark-tap.apk on the server, and the page picks it up on the next request.
 */

/** Where Next serves the file from web/public. */
export const APK_HREF = "/download/watermark-tap.apk";
export const APK_FILE_NAME = "watermark-tap.apk";
/** What the QR opens: the public site, so a phone can reach it from any laptop screen. */
export const APK_PUBLIC_URL = "https://usewatermark.xyz/download/watermark-tap.apk";
/** The app's source in the public repo. */
export const ANDROID_SOURCE_URL = `${REPO_URL}/tree/main/android`;

/**
 * The APK on disk, read at request time (server only). null while it isn't published yet, so the page shows a note
 * instead of a dead download button. `next dev` and `next start` run with web/ as the working directory.
 */
export function apkOnDisk(): { bytes: number } | null {
  try {
    const s = statSync(path.join(process.cwd(), "public", "download", APK_FILE_NAME));
    return s.isFile() && s.size > 0 ? { bytes: s.size } : null;
  } catch {
    return null;
  }
}

/**
 * Where the download lives. On Vercel there is no disk to drop a file on, so APK_URL (server env, https only, e.g. the
 * GitHub Release asset) wins; APK_BYTES (optional) is its size for the "24.3 MB" line. Otherwise the file on disk.
 * null = not published yet.
 */
export function apkDownload(): { href: string; qr: string; bytes: number | null } | null {
  const url = process.env.APK_URL?.trim();
  if (url && /^https:\/\/\S+$/u.test(url)) {
    const bytes = Number(process.env.APK_BYTES);
    return { href: url, qr: url, bytes: Number.isFinite(bytes) && bytes > 0 ? bytes : null };
  }
  const disk = apkOnDisk();
  return disk ? { href: APK_HREF, qr: APK_PUBLIC_URL, bytes: disk.bytes } : null;
}

/** 24_310_000 → "24.3 MB" (decimal units, as Android's file manager shows them). */
export function formatSize(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

/** Pure helpers for the claim reveal: token label, landmark and the prefilled X post. */

/** The X account the post tags. Set NEXT_PUBLIC_X_HANDLE (without @) once the account exists. */
export const X_HANDLE = (process.env.NEXT_PUBLIC_X_HANDLE || "usewatermark").replace(/^@/, "");

/** Where the post sends people. */
export const DROP_URL = process.env.NEXT_PUBLIC_DROP_URL || "https://usewatermark.xyz/pass";

/** Same order as the on-chain renderer: 20 stamps per landmark (contracts/script/pass-art/generator.mjs). */
export const LANDMARKS = [
  "Gateway of India",
  "Rajabai Clock Tower",
  "Bandra-Worli Sea Link",
  "Chhatrapati Shivaji Terminus",
  "Marine Drive",
] as const;

export function landmarkFor(tokenId: number): string {
  if (!Number.isInteger(tokenId) || tokenId < 1 || tokenId > 100) throw new RangeError(`token ${tokenId} out of range`);
  return LANDMARKS[Math.floor((tokenId - 1) / 20)]!;
}

/** "#001" style label. */
export function tokenLabel(tokenId: number): string {
  return `#${String(tokenId).padStart(3, "0")}`;
}

/** The post text: short, plain, one tag. Under 280 characters including the link. */
export function shareText(tokenId: number): string {
  return [
    `I just claimed Watermark Genesis Pass ${tokenLabel(tokenId)}: a free Mumbai stamp NFT (${landmarkFor(tokenId)}).`,
    "",
    "One bank card, one pass. No fee. Bots can't claim it.",
    "",
    `Protected by @${X_HANDLE}`,
  ].join("\n");
}

export function shareOnXUrl(tokenId: number): string {
  const q = new URLSearchParams({ text: shareText(tokenId), url: DROP_URL });
  return `https://x.com/intent/post?${q.toString()}`;
}

import { PASS_ART_HEIGHT, PASS_ART_WIDTH, PASS_PREVIEW_ID, passArtDataUri, passArtEdition, passArtId, passPlate } from "@/lib/pass-art.ts";
import { cx } from "./cx";

/**
 * The Genesis Drop's NFT: the "modern engraved Mumbai stamp". A cream postage stamp on its own #101010 field, one of
 * five Mumbai landmarks engraved in ink (20 tokens each), a saffron "FEE PAID" postmark and the edition "#042 / 100".
 *
 * It is the on-chain artwork itself: lib/pass-art.ts builds the same SVG string WatermarkPassRenderer stores
 * (pass-art.test.ts pins it byte for byte), shown as an <img> data: URI. Nothing inside an <img> SVG can run, its ids
 * can't clash with the page's or another stamp's, and the CSP (img-src 'self' data:) allows it. Portrait, 600 × 760.
 *
 * Without a valid tokenId it shows #042, the drop's example (label it "Example" where it is shown). `src` replaces the
 * locally drawn picture with the token's own on-chain image (tokenURI) when the relayer returns one.
 */
export function PassArt({
  tokenId,
  src,
  size = 320,
  shadow = false,
  example = false,
  alt,
  className,
}: {
  tokenId?: number | bigint | string | null;
  /** The minted token's on-chain image (a data:image/svg+xml;base64 URI the relayer returned), when there is one. */
  src?: string | null;
  /** Rendered width in CSS px (height follows the art). It also shrinks to its container (max-width: 100%). */
  size?: number;
  /** A soft drop shadow under the stamp's field (off by default: some callers add their own). */
  shadow?: boolean;
  /** Say "Example" in the alt text (a preview, not a token anyone owns). Implied when there is no valid tokenId. */
  example?: boolean;
  /** Replaces the generated alt text (e.g. a shorter one beside a caption that already names the landmark). */
  alt?: string;
  className?: string;
}) {
  const id = passArtId(tokenId) ?? PASS_PREVIEW_ID;
  const preview = example || passArtId(tokenId) === null;
  const what = `Watermark Genesis Pass NFT #${passArtEdition(id)} of 100, a Mumbai stamp: ${passPlate(id).landmark}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a data: SVG; next/image would add nothing here.
    <img
      src={src || passArtDataUri(id)}
      alt={alt ?? (preview ? `Example: ${what}` : what)}
      width={size}
      height={Math.round((size * PASS_ART_HEIGHT) / PASS_ART_WIDTH)}
      decoding="async"
      draggable={false}
      className={cx(
        // The art's own dark field, with corners rounded in proportion (24px at full size).
        "block h-auto max-w-full select-none rounded-[4%/3.16%] bg-[#101010]",
        shadow && "shadow-object",
        className,
      )}
    />
  );
}

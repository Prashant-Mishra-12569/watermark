import { cx } from "./cx";

/**
 * The approved logo, "One tap" (variant B): a tilted bank card with a hand-drawn W and three tap lines.
 * Artwork lives in public/brand/ (from the Watermark Brand Assets kit). Decorative by default; pass `title` to make
 * the mark an image on its own.
 */
export function LogoMark({ className, title, inverse = false }: { className?: string; title?: string; inverse?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a tiny static SVG; next/image adds nothing here
    <img
      src={inverse ? "/brand/mark-white.svg" : "/brand/mark.svg"}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      width={512}
      height={512}
      className={cx("block size-7 shrink-0", className)}
    />
  );
}

/** The full lockup: the mark + the hand-lettered "watermark". `inverse` for dark backgrounds. */
export function Logo({ className, inverse = false }: { className?: string; markClassName?: string; inverse?: boolean }) {
  return (
    <span className={cx("inline-flex items-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand image, trimmed to the artwork */}
      <img
        src={inverse ? "/brand/lockup-white.png" : "/brand/lockup.png"}
        alt="Watermark"
        width={1024}
        height={204}
        className="block h-[26px] w-auto min-[380px]:h-[30px]"
      />
    </span>
  );
}

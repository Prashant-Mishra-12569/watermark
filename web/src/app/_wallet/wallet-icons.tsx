import { cx } from "../_site/cx";

/**
 * The wallet marks every wallet control shares (header pill, its menu, the modal rows, the page's wallet choice and
 * its "Using …" pill), so a wallet looks the same wherever it shows. Server-safe.
 */

/** A wallet, line drawn, with the saffron clasp: "My wallet" and the Connect wallet pill. */
export function WalletGlyph({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={cx("block shrink-0", className)}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17a1 1 0 0 1 1 1v1.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="3.5" y="7.5" width="17" height="11.5" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.3" cy="13.25" r="1.3" fill="#ff6b1a" />
    </svg>
  );
}

/** A browser window: the wallet kept in this browser. */
export function BrowserGlyph({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={cx("block shrink-0", className)}>
      <rect x="3" y="4.5" width="18" height="15" rx="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="6.2" cy="6.8" r="0.9" fill="#ff6b1a" />
      <circle cx="8.9" cy="6.8" r="0.9" fill="currentColor" />
    </svg>
  );
}

/**
 * The connected wallet's round avatar: its own icon (an EIP-6963 data: URI, never a remote URL), else an ink circle
 * with the browser-window mark (the wallet kept in this browser) or the wallet mark. Size it with className.
 */
export function WalletAvatar({
  wallet,
  className,
}: {
  wallet: { kind: "burner" | "injected"; icon?: string | null | undefined };
  className?: string;
}) {
  if (wallet.icon)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={wallet.icon} alt="" width={32} height={32} className={cx("block shrink-0 rounded-full", className)} />;
  return (
    <span aria-hidden="true" className={cx("grid shrink-0 place-items-center rounded-full bg-ink text-white", className)}>
      {wallet.kind === "burner" ? <BrowserGlyph className="size-[58%]" /> : <WalletGlyph className="size-[58%]" />}
    </span>
  );
}

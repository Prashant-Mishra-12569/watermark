"use client";

import { useEffect, useRef } from "react";
import { Headline, PillButton } from "@/app/_site";
import { landmarkFor, shareOnXUrl, tokenLabel } from "./claim-share";

const EXPLORER = "https://explorer.testnet.whitechain.io";

export interface ClaimRevealProps {
  /** The token the wallet now holds (1..100). */
  tokenId: number;
  /** The stamp artwork: a data: URI from tokenURI, or a /assets path. Shown as <img>, never inline SVG. */
  image: string;
  /** The mint transaction, when known. */
  txHash?: string | null;
  /** The NFT contract, for the explorer link when there's no tx hash. */
  passAddress: string;
  onClose: () => void;
}

/**
 * The full-screen moment after a successful claim: the stamp, one big line, and two actions (share on X, see it on
 * the explorer). Calm on purpose: no confetti, no extra numbers. The reveal motion is off under reduced motion.
 */
export function ClaimReveal({ tokenId, image, txHash, passAddress, onClose }: ClaimRevealProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const label = tokenLabel(tokenId);
  const landmark = landmarkFor(tokenId);
  const explorerHref = txHash ? `${EXPLORER}/tx/${txHash}` : `${EXPLORER}/token/${passAddress}/instance/${tokenId}`;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (!focusables.length) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-reveal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-bg/95 backdrop-blur-sm"
    >
      {/*
        Phones: the stamp (sized by the screen's height too, so the headline and "Share on X" stay close), then the
        words. From md: side by side. The stamp is never wider than 340px.
      */}
      <div className="mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center gap-6 px-4 py-8 sm:gap-8 sm:px-6 sm:py-10 md:flex-row md:gap-12 lg:gap-16">
        <figure className="claim-reveal-stamp w-full max-w-[min(260px,36svh)] shrink-0 sm:max-w-[min(300px,44svh)] md:max-w-[min(340px,40vw,60svh)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- on-chain SVG as a data URI; next/image adds nothing */}
          <img
            src={image}
            alt={`Watermark Genesis Pass ${label}: a Mumbai postage stamp of ${landmark}`}
            width={600}
            height={760}
            className="h-auto w-full rotate-[-2deg] rounded-[6px] shadow-[0_30px_80px_-20px_rgba(10,10,10,0.45)]"
          />
          <figcaption className="mt-4 text-balance text-center font-mono text-xs text-muted">
            {landmark} · {label} of 100 · on Whitechain
          </figcaption>
        </figure>

        <div className="min-w-0 max-w-md text-center md:text-left">
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-sm font-medium shadow-float ring-1 ring-black/[0.04]">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-saffron" />
            Claimed · Watermark Genesis Drop
          </p>
          <Headline as="h2" size="section" id="claim-reveal-title" className="mt-4 outline-none sm:mt-5">
            <span ref={headingRef} tabIndex={-1} className="outline-none">
              You claimed <em className="font-serif italic">Genesis Pass {label}</em>.
            </span>
          </Headline>
          <p className="mt-3 text-lg leading-relaxed text-muted sm:mt-4">
            It&apos;s yours, in your wallet, on Whitechain. You signed nothing and paid $0 in fees.
          </p>

          <div className="mt-6 flex flex-col items-center gap-3 sm:mt-8 sm:flex-row sm:flex-wrap sm:justify-center md:justify-start">
            <PillButton href={shareOnXUrl(tokenId)} external variant="primary" size="md">
              Share on X
            </PillButton>
            <PillButton href={explorerHref} external variant="secondary" size="md">
              See it on the explorer
            </PillButton>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 text-sm font-medium text-muted underline-offset-4 hover:text-ink hover:underline sm:mt-6"
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .claim-reveal-stamp { animation: claim-reveal-in 900ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
          @keyframes claim-reveal-in {
            from { opacity: 0; transform: translateY(24px) scale(0.92) rotate(4deg); }
            to { opacity: 1; transform: none; }
          }
        }
      `}</style>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { cx } from "@/app/_site/cx";
import { Headline } from "@/app/_site/headline";
import { PillButton } from "@/app/_site/pill-button";
import { DEFAULT_RELAYER_URL, parseChainId, parseHttpUrl } from "@/lib/config.ts";
import { getStatus } from "@/lib/relayer.ts";
import {
  WALLET_PLACEHOLDER,
  describe,
  readWallet,
  viewFromError,
  viewFromStatus,
  type CheckerApp,
  type CheckerView,
  type Tone,
} from "./checker";

// Literal process.env read, so Next inlines it. Same default as lib/config.ts.
const RELAYER_URL = parseHttpUrl(process.env.NEXT_PUBLIC_RELAYER_URL?.trim() || DEFAULT_RELAYER_URL);

/** The answer line: tinted background, AA text colour, and a mark so colour is never the only cue. */
const TONE: Record<Tone, { box: string; mark: string }> = {
  muted: { box: "bg-surface text-muted", mark: "bg-[#b5b5b5]" },
  ok: { box: "bg-ok-bg text-ok", mark: "bg-leaf" },
  note: { box: "bg-note-bg text-note", mark: "bg-note" },
  error: { box: "bg-error-bg text-error", mark: "bg-red" },
};

function ToneMark({ tone, busy }: { tone: Tone; busy: boolean }) {
  if (tone === "ok" || tone === "error")
    return (
      <span aria-hidden="true" className={cx("grid size-6 shrink-0 place-items-center rounded-full", TONE[tone].mark)}>
        <svg viewBox="0 0 12 12" focusable="false" className="block size-3">
          {tone === "ok" ? (
            <path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <path d="M3.3 3.3l5.4 5.4M8.7 3.3l-5.4 5.4" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" />
          )}
        </svg>
      </span>
    );
  return (
    <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center">
      <span className={cx("block size-2.5 rounded-full", TONE[tone].mark, busy && "motion-safe:animate-pulse")} />
    </span>
  );
}

/**
 * "Is this wallet stamped?": GET /status/:wallet?app={live|test}&chain=1874 on our relayer, which reads
 * isStamped from the registry. Read-only: nothing is signed or sent. A pasted valid address is checked at once;
 * switching the app re-checks the same wallet.
 *
 * It sits in a half-width column on the builders page, so its layout follows its own width (container queries), not
 * the screen's. Its title is an h3 under the section's h2.
 */
export function WalletChecker({
  liveAppId,
  testAppId,
  chainId,
  className,
}: {
  liveAppId: string;
  testAppId: string;
  /** "1874": Whitechain Sepolia. */
  chainId: string;
  /** Extra classes for the card, e.g. to fill its grid cell. */
  className?: string;
}) {
  const ids = useId();
  const [input, setInput] = useState("");
  const [app, setApp] = useState<CheckerApp>("live");
  const [view, setView] = useState<CheckerView>({ kind: "empty" });
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  const run = useCallback(
    async (raw: string, which: CheckerApp) => {
      inFlight.current?.abort();
      const read = readWallet(raw);
      if (!read.ok) {
        inFlight.current = null;
        setView(read.view);
        return;
      }
      const chain = parseChainId(chainId);
      if (!RELAYER_URL || !chain) {
        setView({ kind: "error", why: "unreachable" });
        return;
      }
      const controller = new AbortController();
      inFlight.current = controller;
      setView({ kind: "loading" });
      try {
        const status = await getStatus(RELAYER_URL, read.wallet, which === "live" ? liveAppId : testAppId, chain, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) setView(viewFromStatus(status));
      } catch (e) {
        // A newer check (or leaving the page) aborted this one: its answer no longer applies.
        if (!controller.signal.aborted) setView(viewFromError(e));
      } finally {
        if (inFlight.current === controller) inFlight.current = null;
      }
    },
    [chainId, liveAppId, testAppId],
  );

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void run(input, app);
  };

  const onChange = (value: string) => {
    setInput(value);
    const read = readWallet(value);
    if (read.ok) {
      void run(value, app);
      return;
    }
    inFlight.current?.abort();
    inFlight.current = null;
    // Don't scold while someone is still typing: "invalid" shows at 42+ characters, on leaving the field, or on Check.
    setView(value.trim().length >= 42 ? read.view : { kind: "empty" });
  };

  const onApp = (next: CheckerApp) => {
    setApp(next);
    if (readWallet(input).ok) void run(input, next);
  };

  const { text, tone } = describe(view);
  const statusId = `${ids}-status`;
  const hintId = `${ids}-hint`;

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className={cx("@container rounded-card bg-white p-6 shadow-object ring-1 ring-black/[0.05] sm:p-8", className)}
    >
      <div className="flex flex-col gap-5 @lg:flex-row @lg:items-end @lg:justify-between">
        <div className="min-w-0">
          <Headline as="h3" size="card" id={`${ids}-title`}>
            Is this wallet *stamped*?
          </Headline>
          <p className="mt-2 text-base text-muted">We ask the chain. Your app would get the same answer.</p>
        </div>

        <fieldset className="min-w-0 shrink-0">
          <legend className="sr-only">App</legend>
          <div className="inline-flex rounded-full bg-surface p-1">
            {(["live", "test"] as const).map((option) => (
              <label
                key={option}
                className={cx(
                  "inline-flex min-h-10 cursor-pointer items-center rounded-full px-5 text-sm font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink",
                  app === option ? "bg-ink text-white" : "text-muted hover:text-ink",
                )}
              >
                <input
                  type="radio"
                  name={`${ids}-app`}
                  value={option}
                  checked={app === option}
                  onChange={() => onApp(option)}
                  className="sr-only"
                />
                {option === "live" ? "Live app" : "Test app"}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-6">
        <label htmlFor={`${ids}-wallet`} className="sr-only">
          Wallet address
        </label>
        <div className="flex flex-col gap-3 @md:flex-row">
          <input
            id={`${ids}-wallet`}
            type="text"
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={WALLET_PLACEHOLDER}
            value={input}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => {
              const read = readWallet(input);
              if (!read.ok && read.view.kind === "invalid") setView(read.view);
            }}
            aria-describedby={`${statusId} ${hintId}`}
            aria-invalid={view.kind === "invalid"}
            className={cx(
              "min-h-14 w-full min-w-0 rounded-full border bg-white px-6 font-mono text-[15px] text-ink transition-colors placeholder:font-sans placeholder:text-base placeholder:text-muted hover:border-[#cfcfcf]",
              view.kind === "invalid" ? "border-error" : "border-line",
            )}
          />
          <PillButton type="submit" size="lg" arrow={false} busy={view.kind === "loading"} className="shrink-0">
            Check
          </PillButton>
        </div>
        <p id={hintId} className="mt-3 px-1 text-sm text-muted">
          {app === "live"
            ? "Live app: RuPay bank debit cards from India."
            : "Test app: our synthetic test card only."}
        </p>
      </form>

      <p
        id={statusId}
        role="status"
        aria-live="polite"
        className={cx(
          "mt-5 flex min-h-14 items-center gap-3 rounded-inner px-4 py-3 text-base font-medium",
          TONE[tone].box,
        )}
      >
        <ToneMark tone={tone} busy={view.kind === "loading"} />
        <span className="min-w-0">{text}</span>
      </p>
    </section>
  );
}

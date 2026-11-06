import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 px-4 py-10 sm:px-8">
      <p className="text-sm font-semibold tracking-[0.2em] text-muted">WATERMARK</p>

      <h1 className="text-4xl font-bold leading-tight sm:text-6xl">Bots can&apos;t hold plastic.</h1>

      <div className="space-y-4 text-lg sm:text-xl">
        <p>
          Tap your bank card on an Android phone once, and your wallet gets a private &ldquo;real card&rdquo; stamp
          that bots can&apos;t fake. No money is charged, and no card number goes on-chain.
        </p>
        <p className="text-muted">
          A stamp means one thing: this wallet was linked to a real bank card that passed this app&apos;s filter. It
          says nothing about who you are, your age or your balance.
        </p>
      </div>

      <p className="text-xs font-semibold tracking-[0.15em] text-muted">
        TAP ONCE · ₹0 · NO CARD NUMBER ON-CHAIN
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/verify"
          className="inline-flex min-h-12 items-center rounded-lg bg-accent px-6 text-lg font-semibold text-accent-text hover:opacity-90"
        >
          Verify a wallet
        </Link>
        <Link
          href="/pay"
          className="inline-flex min-h-12 items-center rounded-lg border border-line bg-surface px-6 text-lg font-semibold hover:opacity-90"
        >
          Pay
        </Link>
        <span className="text-sm text-muted">Verified wallets pay a shop in USDT. The relayer pays the gas.</span>
      </div>

      <p className="border-t border-line pt-6 text-sm text-muted">
        Hackathon build, testnet only. Our prover sees card data briefly (it arrives encrypted) and never puts it
        on-chain; proving on the phone itself is the next step.
      </p>
    </main>
  );
}

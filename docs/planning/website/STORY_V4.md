# Landing v4: company-first, professional (this file WINS over LANDING_V3.md and DESIGN_V2.md where they differ)

## FINAL SITE STRUCTURE (from the team, 22:25; this wins over everything above)
1. **`/` is the SERVICE page, not a consumer landing.** It explains to companies what Watermark does and how to add it
   to their project (one line in a contract, the SDK, or the MCP server for AI agents), with proof (bot test, receipts).
   Everything on `/` speaks to a company or a judge. The primary CTA is "Add Watermark to your project ↗" (→ /dev); the
   secondary CTA, repeated in the nav and in the case-study section, is **"Try it now ↗"** (→ /pass).
2. **`/pass` is the "Watermark Genesis Drop" campaign page**: our own launch that USES the service. It must read like a
   real project's NFT drop, top to bottom:
   - Eyebrow: "Watermark Genesis Drop · powered by Watermark". H1: "A free NFT for *real* cardholders."
   - Sub: "We're launching Watermark with 100 free NFTs. No fee to pay: we cover it. To stop bots from taking them, you
     verify once with your bank card."
   - Facts row: "Free" · "No fee" · "Only 100 will ever exist" · "One per bank card".
   - The pass artwork (PassArt) big, with the live "{N} left" counter.
   - The claim checklist (existing logic): "1 Verify with your card" (→ /verify?next=pass) · "2 Send one free test
     payment (we pay the fee)" (→ /pay?next=pass) · "3 Claim your NFT".
   - A small note: "Why the card? Wallets are free to make, so bots make thousands. Bank cards aren't. This drop is
     protected by Watermark, the same check any company can add." with a link "See how it works ↗" (→ /).
   Keep all existing claim logic, states and tests.
3. App pages (/verify, /pay, /attack, /sponsor, /dev) stay as they are, restyled.

## Who we sell to
The MAIN product is a service for companies and projects: **Watermark stops fake bot wallets from draining airdrops,
mints and rewards, and saves the money.** Companies add one check (Solidity, SDK, or our MCP server for AI agents).
Their users tap a real bank card once; only stamped wallets can claim; bots get refused.
The **Watermark Genesis Pass is our own first airdrop**: a live case study that uses the service. Users trying it is
the proof, not the main pitch. Audience order: companies/projects and hackathon judges first, users second.

## Look: professional, calm, expensive
- Mostly **black, white and greys**. ONE accent: saffron `#FF6B1A`, only for the stamp seal, one highlight per
  section at most, and focus rings. Functional status colours (green ok / red refused) only inside app states and the
  bot test. **No pink, no yellow, no leaf-green decoration, no rainbow chips.** FloatChip dots become black or saffron.
- **No emoji-style art anywhere.** Remove every Microsoft Fluent Emoji PNG (web/public/assets/3d/*.png without the
  3dicons- prefix) from every page. Allowed: the real photos, and ONE consistent custom **line-art system** (SVG,
  1.5px black strokes, round caps, saffron accent strokes only where it means something), drawn in code.
- Layout: a clear 12-column grid; sections left-aligned with consistent max widths; text never floats in a corner of a
  box; every card has padding ≥ 24px and a clear title → line → visual order. Generous whitespace. Same radius (28px
  large, 16px small) everywhere.
- Motion: subtle and premium (fade/slide 8–16px, line-art draw-on via stroke-dashoffset, counters). Off under
  prefers-reduced-motion. No scrolljacking.

## The line-art set (built in web/src/app/_art/, exported from web/src/app/_art/index.ts)
- `MumbaiSkyline({ draw?: boolean, className? })`: our OWN drawing (not copied from ethmumbai.in) of Mumbai: Gateway of
  India arch, Taj Mahal Palace dome, Rajabai clock tower, Bandra–Worli Sea Link cables, a few high-rises, sea lines.
  When `draw` is true it draws itself on scroll into view (stroke-dashoffset). Wide (aspect ~5:1), scales to width.
- `BotFarm({ className? })`: a professional visual of a bot farm: a grid of many identical small wallet glyphs (line
  art), a few highlighted with a red ✕ "refused", one saffron-stamped wallet "allowed". No cartoon robot faces.
- `WalletGrid({ count, className? })`: n identical wallet glyphs (for "1 → 1,000 wallets").
- `LineIcon({ name, size?, className? })`: names: "card", "phone", "tap", "stamp", "lock", "code", "agent", "shield",
  "coin", "ticket", "check", "cross", "receipt", "building". Same stroke style as the rest.

## The story (sections, top to bottom, files in web/src/app/_story/)
1. **Hero** (`hero.tsx`). Eyebrow chip: "For airdrops, mints and rewards". H1: "Bots can't hold a *bank card*."
   Sub: "Watermark makes sure your airdrop reaches wallets backed by a real bank card. Bots get refused. Add it with
   one line of code." Pills: "Add Watermark to your project ↗" → /dev, "Try it now ↗" → /pass.
   Visual: the product doing its job: a clean "Airdrop claims" panel (labelled "Example") where wallet rows come in
   and most are marked "Refused · no stamp" and one "Allowed · stamped", next to/over the real card-tap photo.
2. **Problem** (`problem.tsx`). H2: "Your airdrop is being *farmed*." Body lit word by word on scroll: "One script
   makes 1,000 wallets in a minute. They claim your tokens, mints and rewards. Real users get less. You pay for all of
   it." Visual: WalletGrid growing 1 → 1,000 on scroll. Caption "Wallets are free to make. Bank cards are not."
3. **How it works for you** (`how.tsx`). H2: "Add one check. Keep the *bots* out." Three steps (LineIcons):
   1 "Add one line" — "Check the stamp in your contract, your backend or your AI agent." (code icon)
   2 "Users tap their card once" — "A private proof checks the card is real. No KYC. No card number stored." (tap icon)
   3 "Only stamped wallets claim" — "Bots get refused before they touch your tokens." (shield icon)
4. **Reveal** (`reveal.tsx`, keep the signature moment, make it monochrome + saffron seal). H2 "Hold it to the
   *light*." Line: "A watermark proves a banknote is real. Ours proves a real bank card is behind a wallet."
5. **Bot test teaser** (`bot-test.tsx`, replaces bots-orbit). H2: "Try to *farm* it." Body: "Press the button. We
   make 5 bot wallets and send them at our own airdrop. Every one gets refused. These are real requests." Visual:
   BotFarm + a monochrome terminal-style result block (labelled "Example run"): rows "bot 1 … refused · no stamp".
   Pill "Run the bot test ↗" → /attack.
6. **For AI agents** (`agents.tsx`). H2: "Ask your AI agent who's *real*." Body: "Our MCP server gives AI agents 12
   read-only tools. Paste up to 200 wallets before an airdrop and get back which ones are stamped." Show the MCP
   config code block (verbatim from mcp/README.md) and a small tool list (check_wallets, stamp_history, app_info,
   create_verify_link…). Chips: "Read-only" · "No keys" · "Runs locally". Link "Set it up ↗" → /dev#mcp.
7. **Value for the business** (`value.tsx`). H2: "Pay *real* users, not farms." Three facts: "You pick which cards
   count: 4,208 RuPay bank debit ranges today, no prepaid." · "Sponsor your users' fees: they pay $0, up to 20 payments
   a day each." · "Nothing sensitive to store: no KYC files, no card numbers." Link "For businesses ↗" → /sponsor.
8. **Case study** (`case-study.tsx`). H2: "We use it *ourselves*." Body: "Our first airdrop is the Watermark Genesis
   Pass. Only 100 will ever exist. Each bank card can claim one." PassArt + live "{N} left" (hidden on error).
   Steps: "Tap your card → send one free test payment → claim." Pill "Claim yours ↗" → /pass.
9. **Phone story** (keep `phone-story.tsx`, dark section): "See every *step*." Monochrome check.
10. **Privacy** (keep `privacy.tsx`): H2 "No KYC. No card numbers *stored*." Three honest columns as before.
11. **Receipts ring** (keep `receipts-ring.tsx`, monochrome): "See it *yourself*."
12. **Built in Mumbai** (`mumbai.tsx`): MumbaiSkyline drawing itself, "Built in *Mumbai* at ETHGlobal 2026", then
    "Good to know" limits (DESIGN_V2). Replace the Sea Link photo with the drawing (the photo may stay small or go).
13. **Footer** (`_site/footer-3d.tsx`): keep the big wordmark, add the MumbaiSkyline line at the bottom edge, links
    incl. "Credits".

## Nav (SiteHeader)
Logo · "How it works" (#how) · "Bot test" (/attack) · "For AI agents" (#agents) · "Docs" (/dev) · "Try it" (/pass) ·
"Try it now" (/pass) · black pill "Add Watermark ↗" (/dev). Mobile: logo + pill, the rest in the menu.

## Words
Same rules as DESIGN_V2 (plain, short, honest). Never invent numbers or customers; "Example" labels on any mock data.
Never say "real person"; say "real bank card". Never claim KYC-grade identity.

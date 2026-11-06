# THE FINAL SITE: two pages (this file WINS over every other plan file: STORY_V4, LANDING_V3, DESIGN_V2, SITE_SPEC)

The team found the many plans confusing. The site is now exactly TWO pages, plus the steps inside the drop.

| Page | Route | For | Job |
|---|---|---|---|
| Builders (home) | `/` | companies, builders, judges | Explain the service and how to add it. Proof. |
| Genesis Drop | `/pass` | anyone | Our own NFT drop that uses the service. "Try it now." |

Steps inside the drop (not separate pages in the nav): `/verify` (step 1, verify with your card) and `/pay` (step 2,
one free test payment). They keep their `?next=pass` flow mode ("Genesis Drop · Step n of 3").
`/attack` (the bot test) is a tool opened from the builders page ("Run the bot test"), not a nav item.
`/dev` → permanent redirect to `/` . `/sponsor` → permanent redirect to `/#control`. `/credits` stays (footer link).
Delete the long story landing: nothing renders the 13 story sections any more. Reuse its good parts below.

## Nav (both pages)
Logo "watermark" · "Genesis Drop" (/pass) · "GitHub" (https://github.com/Prashant-Mishra-12569/watermark) · black pill
"Add Watermark ↗" (/#add). Mobile: logo + pill, the rest in the menu. Nothing else.

## Look
Professional and calm: white, black, greys, ONE accent saffron #FF6B1A (stamp seal, a highlight, focus). Red/green only
inside functional states (refused / ok). No emoji art (no Microsoft Fluent PNGs anywhere). Real photos and the custom
line art in web/src/app/_art (MumbaiSkyline, BotFarm, WalletGrid, LineIcon). Geist + one Instrument Serif italic word per
headline + Geist Mono for code/hashes. 12-column grid, consistent spacing, radius 28px large / 16px small. Subtle motion,
off under reduced motion.

## Page 1: Builders (`/`), top to bottom
1. **Hero.** Eyebrow: "For airdrops, mints and rewards". H1: "Stop bots from farming your *airdrop*."
   Sub: "Watermark lets only wallets backed by a real bank card claim. Add it with one line. No KYC. Your users pay no
   fees." Pills: "Add Watermark ↓" (#add) and "Try the live drop ↗" (/pass).
   Visual: the "Airdrop claims" example panel (label "Example"): rows of wallets, most "Refused · no stamp" (red dot),
   one "Allowed · stamped" (saffron seal). Reuse the hero panel already built in _story/hero.tsx if it fits.
   **MUMBAI IN THE HERO (team request, must have):** the hand-drawn-in-code MumbaiSkyline line art (from _art) runs
   wide along the bottom of the hero, behind/under the claims panel, and DRAWS ITSELF on page load (stroke-dashoffset,
   ~2.5 s, fully drawn under reduced motion). Gateway of India, Taj dome, Rajabai tower, Sea Link, high-rises, sea
   lines, a few palms; black strokes with ONE saffron detail (e.g. the sun or the Sea Link cables). It must feel like a
   confident illustrator's sketch, the signature of the brand, not a decoration in a corner. Keep it in the footer too.
2. **How it works** (id="how"). H2: "Three steps. *Zero* bots." 1 "You add one check" — "In your contract, your
   backend or your AI agent." 2 "Users tap their card once" — "On our phone app. A private proof checks the card is
   real. No card number is stored." 3 "Only stamped wallets claim" — "Bots get refused before they touch your tokens."
   LineIcons: code, tap, shield.
3. **Add it** (id="add"). H2: "Add it in *one line*." Three blocks, copied VERBATIM from docs/INTEGRATE.md and
   mcp/README.md: "Solidity" (the isStamped modifier), "TypeScript SDK" (check / checkMany), "AI agents (MCP)" (the
   mcpServers config + the 12 tool names as small chips, "Read-only · No keys · Runs locally"). Then "Live on Whitechain
   Sepolia" facts with copy buttons: chain 1874, Registry address, live appId, deploy block (from deployments/whitechain.json).
4. **Try to break it** (id="test"). H2: "Try to *farm* it." Left: "Press the button. We make 5 bot wallets and send
   them at our own drop. Every one gets refused. These are real requests." + pill "Run the bot test ↗" (/attack) and
   BotFarm art. Right: the live wallet checker "Is this wallet stamped?" (move it here from the old /dev page).
5. **You stay in control** (id="control"). H2: "You decide who *counts*." Facts: "Which cards count: 4,208 RuPay bank
   debit ranges from India. No prepaid cards, because anyone can buy many." · "Sponsor your users' fees: they pay $0,
   up to 20 payments a day each." · "Stamps last up to 3 months. One card, one wallet per app." · "Nothing sensitive to
   store: no KYC files, no card numbers." · "Visa and Mastercard: coming soon." Link: "Download the card list" (the
   published policies/live.json leaves, as on the old /sponsor page).
6. **Proof** (id="proof"). H2: "See it *yourself*." Real receipt cards from lib/evidence.ts: real-card stamp tx,
   gas-free USDT payment tx, EF fee-sponsored tx, Sponsor verified, Registry verified. Calm grid (the 3D ring is optional:
   only if it stays readable and professional).
7. **Privacy and limits** (short). Two columns: "What we see, store and put on-chain" (honest, from DESIGN_V2/privacy
   section) and "Good to know" (RuPay only today; test networks; one card one stamp per app).
8. **Footer** with the MumbaiSkyline line art drawing itself: "Built in *Mumbai* at ETHGlobal 2026". Links: Genesis
   Drop, Bot test, GitHub, Docs (INTEGRATE.md on GitHub), Credits.

## Page 2: Genesis Drop (`/pass`)
- Eyebrow: "Watermark Genesis Drop · protected by Watermark". H1: "A free NFT for *real* cardholders."
- Sub: "We're launching Watermark with 100 free NFTs. No fee to pay: we cover it. To stop bots from taking them, you
  verify once with your bank card."
- Facts row: "Free" · "No fee" · "Only 100 will ever exist" · "One per bank card".
- Big PassArt + live "{N} left" (hidden on error).
- The claim checklist (existing logic and states): "1 Verify with your card" (→ /verify?next=pass) · "2 Send one free
  test payment, we pay the fee" (→ /pay?next=pass) · "3 Claim your NFT".
- Note: "Why the card? Wallets are free to make, so bots make thousands. Bank cards aren't. This drop is protected by
  Watermark, the same check any company can add." + "See how it works ↗" (→ /).
- When the pass contract isn't deployed: "The drop opens soon. You can verify your wallet now." (keep the logic).

## Words
Plain, short, honest (DESIGN_V2 rules). No "Bots can't hold plastic" anywhere. Never "real person"; say "real bank
card". No invented numbers, customers or press; "Example" on mock data.

## Stamp NFT art on the web (from the contract review, 23:45)
- Source of truth: contracts/script/pass-art/generator.mjs and contracts/test/fixtures/pass-svg/<id>.svg (all 100).
- ALWAYS show the stamp art as <img src="data:image/svg+xml;base64,..."> or <img src="/assets/stamps/...">, never inline
  <svg>: two inline stamps on one page break each other (they share short element ids like h, v, x).
- web/src/lib/genesis-pass.test.ts must compare the web art to the fixtures for all 100 ids (the old SVG_HEAD/SVG_TAIL
  regex test is obsolete), and remove the caption "The contract stores the same picture" if it's no longer accurate.

## Claim reveal (team request, 23:50)
web/src/app/pass/claim-reveal.tsx (ClaimReveal) + claim-share.ts are DONE (tests in claim-share.test.ts). Wire them in:
when a claim succeeds in this session (POST /pass returns {txHash, tokenId}), open <ClaimReveal tokenId image txHash
passAddress onClose/> full-screen once; image = the token's stamp as a data: URI (tokenURI image from GET /pass/:wallet,
or the web port of the generator). Also a "View my pass" button on /pass for a wallet that already claimed reopens it.

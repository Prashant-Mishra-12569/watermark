> NOTE FOR RESTYLE AGENTS: DESIGN_V2.md (the team's chosen dopepay-style direction and exact copy) WINS over this playbook wherever they differ (e.g. palette, headline). Use this playbook for evidence-backed rules: hierarchy, scanning, button wording, honesty about privacy, motion limits, contrast, no scrolljacking.

# The Watermark Design Playbook (reviewed)

**Evidence grades:** STUDY means measured user research. PRACTITIONER means an official brand guide, an NN/g guideline or observed practice. OPINION means essays, trend posts or my own pick. COMPUTED means WCAG 2 contrast ratios I calculated with a script on 6 Nov. None of these rules has been tested on our audience.

**Do not cite these anywhere (myths or unverified claims):**
- The "8-second goldfish attention span." It comes from an unsourced 2015 Microsoft Canada report.
- Colour meanings such as "saffron = trust" or "orange = energy."
- "'my' beats 'your' by +90%." Nobody could verify it, and one test found the opposite.
- "70% of people drop off at wallet onboarding." This is an unverified agency figure.
- "35% of over-40s have vestibular issues." Unverified.
- "Gen Z prefers stickers, bento or 3D." I found no study.
- "Looking AI-made lowers trust." That study kept the art the same and changed only the label.

**Repo facts to deal with first.** I checked these in the :3200 copy at `/Users/samanwaybaranwal/Desktop/watermark/.recovered/site-ws/web`.
- **The prover sees card data.** It decrypts card data in memory (README Limitations, `docs/PRIVACY.md`). Never write "your card never leaves your phone." Write: "Your card number never goes on-chain, and we don't store it."
- **Product limits.** Only Indian RuPay debit cards work. Free payments are capped at 20 per wallet per day (`WatermarkSponsor`).
- **Live data.** Only "passes left" has a live source: the relayer's `GET /pass`, already parsed in `_landing/pass-supply.ts`. There is no global "wallets stamped" or "bots refused" count. The bot test only counts within each run.
- **The slop is in token values, not class names.** In `src/app/globals.css`:
  - `--accent #1f4fd1`
  - navy `--ink #0b1426`
  - slate `--ink-muted #94a3b8`
  - sky `--wave #38bdf8`
  - violet `--role-business #6d28d9`
  - fuchsia `--role-shop #a21caf`
  - the system font stack

  Changing these values restyles every page without renaming a single class. Today no class uses indigo, violet, purple or blue utilities, and there are no gradient classes.
- **CSP.** `font-src 'self'`, so next/font works. `img-src 'self' data:`, so a `data:` SVG background works. `connect-src` allows only the site and the relayer, so live numbers must come through the relayer or a server component, never a browser RPC call.

## 1. The 10 laws

1. **Familiar layout, our own look.** Standard skeleton, original colour, type and objects. [STUDY] https://research.google/blog/users-love-simple-and-familiar-designs-why-websites-need-to-make-a-great-first-impression/
2. **The first screen carries the pitch, and the next section peeks in.** On desktop, 57% of viewing time is above the fold. [STUDY, desktop 1920×1080 only; the study has no mobile data] https://www.nngroup.com/articles/scrolling-and-attention/
3. **Show real things:** UI screenshots, the pass and tx links. Users ignored decorative photos and looked closely at informative ones. [STUDY, 2010, photos only] https://www.nngroup.com/articles/photos-as-web-content/ The CSS card is a brand object. [OPINION]
4. **One accent with two jobs:** the main button and STAMPED. Base: "lead with monochrome and spotlight one accent." [PRACTITIONER] https://brand.base.org/color
5. **Every claim gets a link or a live number beside it.** [STUDY, qualitative] https://www.nngroup.com/articles/young-adults-ux/
6. **The headings alone tell the story,** with the meaning in their first two words. [STUDY] https://www.nngroup.com/articles/layer-cake-pattern-scanning/
7. **Plain words by default; tech words only in the builders layer.** Grade-5–7 pages converted better [STUDY, vendor data, correlation only], but Unbounce says financial services is the one industry where more complex language can help. So this is a default, not a law. https://unbounce.com/conversion-benchmark-report/
8. **Buttons name what you get.** Never "Get started". [PRACTITIONER] https://www.nngroup.com/articles/get-started/
9. **One delight moment (the stamp),** 300 ms or less, with a reduced-motion version. [PRACTITIONER] https://www.nngroup.com/articles/animation-duration/
10. **No scrolljacking or parallax** [STUDY] https://www.nngroup.com/articles/scrolljacking-101/. **No purple or blue gradients, glow or glass.** [OPINION, plus Base: "avoid opacity, layering and other visual effects"]

## 2. The first 5 seconds (hero)

| Element | Budget | Draft |
|---|---|---|
| H1 | 8 words or fewer | "Tap your bank card. Stamp your wallet." |
| Subline | 20 words or fewer | "One card, one stamp. Stamped wallets get a free pass and fee-free USDT. Bots get refused." |
| Main button | names the outcome | "Stamp my wallet" → /verify ("my" is a taste choice, not evidence) |
| Text link | 6 words or fewer | "Watch a bot get refused →" → /attack |
| Trust line | 12 words or fewer | "Indian RuPay debit cards. No charge. Card number never on-chain. Testnet." |
| Live line | — | "N of 100 free passes left". Already built, and hidden when the fetch fails. |
| Sticker | 4 words | "Bots can't hold plastic." |

- **No "prove you're real" or "human" in the H1.** The tap proves someone holds a real card, not that a person exists.
- **Budgets:**
  - 50 visible words or fewer, nav included.
  - At most 3 type sizes and 3 colour fields. [OPINION]
  - The button's top edge within 420 px on a 390×844 phone. [OPINION, derived]
- **Nav:** logo on the left; How it works, Builders and GitHub on the right.
- **Height:** use `min-h-[85svh]`, not `h-screen`, so the proof strip peeks in. A design that looks finished creates a "false floor" and people stop scrolling. [STUDY, desktop]
- **Card position:** right of the text on desktop, under the button on mobile.

## 3. Scroll rhythm (landing page)

Every section gets a claim heading of 6 words or fewer, at most 25 words of body text and one proof item. One column throughout.

| # | Heading | Proof item |
|---|---|---|
| 1 | Proof strip (no heading) | "N/100 passes left" (live), then the Whitechain stamp tx ↗, the USDT tx ↗, the alt-mempool admitted tx ↗ and GitHub ↗. An inline mono row, never a coloured box. No "stamped" or "refused" totals unless a relayer endpoint ships for them. |
| 2 | "Bots get refused. Watch." | A dark stage block showing a captured real /attack run, dated ("run on 6 Nov"), plus "Run the bot test". Counters move only during a live run. |
| 3 | "One tap, three steps." | Real screenshots: tap → math receipt → stamped. Use the synthetic test card only, and crop or blur any card digits (repo rule). |
| 4 | "Stamped wallets get perks." | The pass object, the live count and "Claim my free pass". Then "Send USDT. We pay the fee. Up to 20 a day." with a tx link. |
| 5 | "Your card stays private." | Three columns. **We see briefly:** the card number and certificates, in our prover's memory, then wiped. **We store:** nothing from the card. **On-chain:** a proof, a one-way card ID, your wallet and an expiry month. Add "You trust us on the wipe; on-device proving is the fix." Link to PRIVACY.md. Say "card", never "identity". |
| 6 | "Apps: pay fees only for real people." | /sponsor, a verified Sponsor contract link, "Built on Whitechain" and the README's stablecoin-settlement line. |
| 7 | "Built for builders." | A collapsed `<details>` → /dev |
| 8 | Footer | "Hackathon build · testnet · not audited", "built on Whitechain + Ethereum", team, licence. |

## 4. Colour

Pick colours for contrast and distinctiveness. The main review (Elliot & Maier 2014) calls colour psychology nascent and says real-world generalisation is still untested. Keep colour meanings out of the copy and the pitch. [STUDY review] https://pubmed.ncbi.nlm.nih.gov/23808916/

**Palette 1: Paper & Lime (the default).** Change only the existing token values.

| Token | Hex | Job | Contrast [COMPUTED] |
|---|---|---|---|
| `--bg` | #F4EFE6 | page | — |
| `--surface` | #FBF8F2 | inputs, pass, light receipts | text on it: 18.6 |
| `--text` | #0B0B0C | text, 2px borders, hard shadows | 17.2 on bg |
| `--muted` | #5C564C | secondary text | 6.3 on bg, 6.9 on surface |
| `--accent` | #D4FF3A | **fill only**: main button, STAMPED | `--accent-text` #0B0B0C on it: 17.0. As text on bg: 1.0, so never. |
| `--error` | #B42318 | refused (on light) | 5.7 |
| `--ok` | #17703A | success text in flows | 5.4 |
| `--ink` | #0B0B0C | stage blocks | — |
| `--ink-text` / `--ink-muted` | #F4EFE6 / #A8A29E | stage text | 17.2 / 7.8 |
| `--wave` | #D4FF3A | accent text or lines, on stage only | 17.0 |
| refused on stage | #FF4D4D | refused rows | 6.0 |

- **`--color-role-user`** is mapped to `var(--accent)` and used as text. Map it to `var(--text)` instead; otherwise it drops to 1.0:1.
- **Other role colours:** map them to `--text` or `--muted` and tell the roles apart by their label words.
- **Alternative accent:** orange #FF5A1F, as a fill only. Ink text on it is 6.3; as text on paper it is 2.7.

**Palette 2: Ink & Marigold (only if the team picks B).**

| Token | Hex | Job | Contrast |
|---|---|---|---|
| `--bg` | #141414 | page | — |
| `--text` | #E8E2D6 | body | 14.3 |
| `--muted` | #B8B2A7 | secondary text | 8.7 |
| `--accent` | #FFB300 | button and STAMPED, as a fill | #0B0B0C text on it: 11.0 |
| `--sticker` | #FF7AB6 | 2 stickers per screen at most | #0B0B0C text on it: 8.2 |
| `--refused` | #FF6B6B | refused | 6.6 |
| reading sections | #F2EDE4 bg / #141414 text | privacy, builders | 15.8 |

On #141414, a #0B0B0C shadow is only 1.07:1 and disappears. Use #E8E2D6 or the accent for borders and shadows instead.

**Rules**
- **One theme tonight, no toggle.**
  - Palette 1: delete the `prefers-color-scheme: dark` block and set `color-scheme: light`.
  - Palette 2: dark page with light reading sections.
  - Light text reads better for people with normal vision at small sizes; the gap disappears for quick glances. [STUDY review] https://www.nngroup.com/articles/dark-mode/
- **The 2px border is required, not decoration.** Lime on paper is 1.0:1, so the border is what makes the button visible (WCAG 1.4.11 asks for 3:1).
- **Focus ring.** `:focus-visible { outline: 3px solid var(--accent) }` becomes invisible once the accent is lime. Set it to `var(--text)`. On stage, the existing `.bg-ink :focus-visible` rule already uses `--wave`.
- **Accent budget:** at most 2 elements per screen. [OPINION]
- **Status:** always colour + icon + word.
- **Lock the old palette out** after the swap: `@theme { --color-indigo-*: initial; --color-violet-*: initial; --color-purple-*: initial; --color-blue-*: initial; --color-sky-*: initial; --color-slate-*: initial; }`. No class uses these today, so nothing breaks.
- **Gradients:** the only one allowed is the sheen on the card.

**Avoid**
- Blue as the main colour (Base owns it). [OPINION]
- Solana's purple-to-green gradient.
- Accent-coloured text on light backgrounds.
- Dim small text on dark backgrounds.
- Saffron + green + white together, which reads as political in India. [OPINION/news] For C's energy, use marigold + pink + ink.

## 5. Type

- **Loading:** `next/font/google`, self-hosted at build time, so it fits `font-src 'self'`.
- **Limit:** at most 3 families.
- **Grades:** the font picks are OPINION. The metrics follow Base's guide. [PRACTITIONER] https://brand.base.org/typography The rules on width and caps come from one study (Sawyer 2017: Frutiger, single words only). [STUDY] https://www.nngroup.com/articles/glanceable-fonts/

| Role | Pairing 1 (Paper & Lime) | Pairing 2 (Ink & Marigold) |
|---|---|---|
| Display | `Archivo` with `axes: ['wdth']` and **no `weight` option** (next/font accepts `axes` only for a variable font). In CSS: weight 800, `font-stretch: 112%`. | `Bricolage_Grotesque` 800 |
| Text | `Geist` 400/500 | `DM_Sans` 400/500 |
| Mono (data only) | `JetBrains_Mono` 400/500 | `JetBrains_Mono` 400/500 |

- **Cut Doto.** It would be a 4th family.
- **Skip Space Grotesk and Instrument Serif.** Each was flagged by one opinion source, but they cost nothing to avoid.
- **Sizes:**
  - H1: `clamp(2.5rem, 8vw, 5.5rem)`, leading 1.0, tracking -0.03em.
  - H2: `clamp(1.75rem, 4vw, 2.75rem)`, leading 1.05.
  - Body: 17px on phones and 18px on desktop, leading 1.5.
  - Labels: 12–13px, ALL CAPS, 3 words or fewer. Caps read faster only as single words.
  - Mono: 14–15px with `tabular-nums slashed-zero`.
  - Line length: body `max-w-[65ch]`, hero subline `max-w-[40ch]`.
- **Usage:**
  - Sentence case everywhere.
  - Display face only for H1, H2 and the pass number.
  - Condensed type only for a decorative "100".
- **Wiring:**
  1. Set `variable: '--ff-display'` (and `--ff-text`, `--ff-mono`) on `<html>`.
  2. In `@theme inline`, set `--font-sans: var(--ff-text)` and `--font-mono: var(--ff-mono)`, and add `--font-display: var(--ff-display)`.
  3. Swapping `--font-sans` restyles every page at once.

## 6. Visual language

**Use**
- **The card as the hero.** [OPINION]
  - A CSS card with masked digits only and no bank or network logo.
  - `-rotate-6`, a 2px border and `shadow-[6px_6px_0_var(--text)]`.
  - The sheen is the only gradient on the site.
  - `motion-safe` hover tilt: 3–5° over 200 ms, ease-out.
- **One mark: the stamp.** A round seal at -8°, used as the logo, list bullet, loader and STAMPED badge. One mark used everywhere is a PRACTITIONER idea (Base, Rainbow); the seal shape is OPINION.
- **The Genesis Pass as a ticket.** A perforated edge and an edition number like "#037 / 100" in tabular figures. Real numbers only.
- **Buttons that look clickable.**
  - Accent fill, 2px border and `shadow-[4px_4px_0_var(--text)]`.
  - On press: `translate-x-1 translate-y-1 shadow-none`.
  - Underline links. One corner radius (6px) everywhere.
  - Minimum height 44px (Apple HIG; the WCAG AA minimum is 24px).
  - Weak click cues cost 22% more time. [STUDY] https://www.nngroup.com/articles/flat-ui-less-attention-cause-uncertainty/
  - Neobrutal rules: at most 3 bright colours and 24–32px of padding. [PRACTITIONER] https://www.nngroup.com/articles/neobrutalism/
- **Receipts.** A sentence first ("You sent 5 USDT. Fee: 0. We paid it."), then a mono row with the short hash and "View on explorer ↗". Dashed top edge.
- **Grain (optional, cut first).** A tiled `data:` SVG as the `body` background-image at 3–6% opacity. Never a fixed overlay, which would sit on top of the text and slow scrolling. [OPINION]
- **At most 2 hand-made marks per page:** one arrow and one sticker. [OPINION]

**Avoid**
- Blobs, glow, glass, WebGL or 3D.
- **Bento grids.**
- Stock or AI-made illustrations. The reason is honesty. People do rate art lower when it is *labelled* AI-made [STUDY], but that study is about labels, not looks.
- Emoji icons, three icon cards, and cards inside cards.
- Copies of partner marks.

## 7. Copy

**Voice**
- "You" and "we", contractions, short lines. Read every line aloud.
- Casual and warm everywhere, but no jokes near fees, payments or privacy. In NN/g's survey of 100 people, casual copy raised a bank's trust score (+0.3), while playful copy lowered an insurer's (−0.3). [STUDY] https://www.nngroup.com/articles/tone-voice-users/
- Hinglish once, as a sticker: "Asli card. Asli wallet." (untested)

**Reading level:** grade 7 or below by default (check at hemingwayapp.com). About 400 visible words on the landing page. Deeper detail goes in `<details>` or on /dev.

**Words to cut** [OPINION; judge each line by how specific it is]: seamless, unlock, leverage, robust, empower, revolutionize, next-gen, "the future of", "not just X, it's Y".

| Before | After |
|---|---|
| Zero-knowledge proof of EMV card possession | A math receipt that you hold a real card. Not the card itself. |
| Sybil-resistant attestation | One card, one stamp. |
| Gasless UX via ERC-4337 paymaster | We pay the fee. Up to 20 payments a day. |
| Mint the Genesis Pass NFT | Claim your free pass. Only 100. |
| Connect wallet to get started | Stamp my wallet |
| Error: nullifier already used | This card already stamped a wallet. One card, one stamp. |
| UserOperation submitted to bundler | Sending… we're paying the fee. |
| Tx reverted: missing attestation | Refused: no real card behind this wallet. Got a RuPay card? Tap it. |
| Sponsor contract with on-chain allowlist | Your app pays fees only for real people. |
| MCP server exposing verify tools | Let your AI agent check whether a wallet is real. |

"Math receipt" is untested. Try it in the 5-second test.

## 8. Motion and delight

**Budget**
- 100 ms for button feedback and 200–300 ms for things entering. Nothing lasts 500 ms or more.
- Things entering ease out; things leaving ease in.
- **No scroll reveals.** [OPINION: one YC video transcript] There are practical reasons too: content stays visible in screenshots and the demo recording, and it's less code.
- Use `motion-safe:` and `motion-reduce:`.

**The moments**
1. **Stamp landing (/verify success).** The stamp scales from 1.15 to 1 over 300 ms, once. Reduced motion: a 150 ms fade.
2. **Waiting for the tap (/verify).** One ring pulse every 2 s; it stops on success or timeout. Reduced motion: static text plus a seconds counter.
3. **Bot refused (/attack and the landing stage block).** The new row slides in over 200 ms. Live runs only, or a captured run labelled with its date. Reduced motion: the row appears instantly.
4. **Pass claimed (/pass).** The pass drops into place over 250 ms. Reduced motion: it appears instantly.
5. **Button press.** A 100 ms shift. Reduced motion: keep the 4px state change but drop the transition.

## 9. Audience checks

| Who | Must see | Where |
|---|---|---|
| Hacker | GitHub, verified contracts, a bot test they can run, limitations | proof strip, /attack, /dev, footer |
| Judge | Problem → demo → proof within the hero and the first 2 scrolls, the stamp, USDT and admitted txs, and "testnet, hackathon build" | Demo path: / → /verify → /pass → /pay → /attack → /sponsor |
| Mentor or partner | Their tech used correctly, with a link. "Built on", never "partner". A business outcome. Why stablecoin settlement is needed. | section 6, /sponsor, /pay, /dev |
| Beginner | One big button. "Charged? Safe? What's stored?" answered beside it. Plain errors with a next step. 44px tap targets. | hero, /verify, /pay |

- **Sticky bottom CTA: optional, cut first.** Show it only after the hero button scrolls out of view. The thumb-use data behind it is Hoober's own non-scientific street observation.
- **Before submitting:**
  - Run a 5-second test with someone outside the team: "What is it, and who is it for?"
  - Test on a real phone.
  - Check every link and do a typo pass.

## 10. "AI slop" checklist

- [ ] `grep -rnE "indigo|violet|purple|fuchsia|sky-|slate-|blue-[0-9]|bg-gradient|bg-linear|bg-radial" src` finds nothing except the card sheen
- [ ] `grep -rniE "#(1f4fd1|7ea2ff|0b1426|94a3b8|38bdf8|6d28d9|a21caf)" src` finds nothing
- [ ] `grep -rniE "never leaves your phone|prove you're human|goldfish|8.second" src` finds nothing
- [ ] The display font is not the system stack or Inter, and there are 3 families or fewer
- [ ] No centred hero followed by 3 icon cards, no bento, no blobs, glow, glass or 3D
- [ ] One corner radius and hard shadows, visible on whichever background they sit on
- [ ] The focus ring is visible on paper, on the lime button and on stage blocks
- [ ] No accent-coloured text on light backgrounds; `text-role-user` is not lime
- [ ] The H1 says what it is and the outcome; the main button is never "Get started", "Launch app" or "Learn more"
- [ ] None of ZK, attestation, paymaster, relayer or ERC above the fold
- [ ] Every number is live or dated and labelled; no fake stats, testimonials or logos
- [ ] Screenshots show only the synthetic card
- [ ] No scrolljacking, parallax, cursor effects or fade-ins
- [ ] At 390px: no horizontal scroll, the button is in the top half, and the next section peeks in

---

**What I changed and why**

1. **Added a "Do not cite" list** (8-second goldfish, colour meanings, "+90% my vs your", the 70% drop-off, the vestibular figure, "Gen Z likes stickers", "AI-looking loses trust"), because the brief asked for myths to be flagged.
2. **Corrected the colour-psychology citation.** Elliot & Maier call the field nascent; they don't say it "can't support recommendations." The conclusion is the same, now worded accurately.
3. **Downgraded "57% above the fold."** I checked the source: it was measured on desktop (1920×1080) with no mobile data, and the playbook applies it to a 390px phone.
4. **Downgraded "Show the real object."** The NN/g source covers photos only. A CSS card is brand OPINION; real screenshots and tx links are the evidence-backed part.
5. **Grade-7 copy is now a default, not a law.** Unbounce's own report says financial services is the one industry where more complex language can help, and the figure is a vendor correlation.
6. **Labelled "my" on buttons as taste,** since the +90% figure is unverified.
7. **Fixed honesty claims against the repo:**
   - "Prove you're real" and "Asli insaan" overclaim; the tap proves a real card, not a person.
   - The privacy column now lists the expiry month and the in-memory wipe.
   - The trust line now says "Indian RuPay debit".
   - The fee copy now includes "up to 20 a day".
8. **Cut the "wallets stamped" and "bots refused" totals.** No data source exists, and the CSP blocks browser RPC calls. Only the `GET /pass` count is live.
9. **Found slop the old grep missed.** It lives in hex token values (navy `--ink`, sky `--wave`, violet and fuchsia role colours). Mapped the new palette onto the existing token names, so the restyle is a value swap with no class renames.
10. **Fixed two contrast traps the old palette created:**
    - The focus ring uses `var(--accent)` and would vanish on lime.
    - `--color-role-user` is the accent and is used as text, so lime would make it 1.0:1.
11. **Made the 2px button border required.** Lime on paper is 1.0:1, which fails WCAG 1.4.11 without it. Also noted that ink shadows disappear in Palette 2 (1.07:1).
12. **Rechecked every contrast number with a script.** All stated ratios held. Added the surface and ok tokens.
13. **Cut Doto** (it broke the 3-family rule) and **bento** (one opinion source, and it contradicted the inline proof row).
14. **Fixed grain from a fixed overlay to a body background,** which keeps it off the text and avoids scroll cost.
15. **Downgraded "no scroll reveals" and "skip Space Grotesk"** to single-source OPINION, keeping them for practical reasons.
16. **Refined the tone rule from the source.** Casual copy raised the bank's trust; only playful or irreverent copy hurt the insurer.
17. **Cut the dark-mode toggle** and picked one theme per palette. Made the sticky CTA optional, since it rests on non-scientific data.
18. **Added a next/font detail and a screenshot rule:** `axes` requires leaving `weight` unset, and screenshots must use the synthetic card only (repo data rule).
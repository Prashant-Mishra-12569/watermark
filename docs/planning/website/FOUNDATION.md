# v2 foundation report (components, props, tokens)

The web typecheck FAILED at the end of the foundation step; whoever touches the failing file fixes it.

CHECKS: web unit tests (npm test)=PASS; web typecheck (npm run typecheck = next typegen && tsc --noE=FAIL; GET http://localhost:3200/=PASS; No sideways scroll (headless Chrome over a temporary compone=PASS; Slop greps from the playbook (in _site, globals.css and layo=PASS

INTERFACES:
All of these import from "@/app/_site" (index.ts re-exports them). Every component is server-safe unless marked CLIENT.

TOKENS (globals.css, light theme only; the dark-mode block is removed)
- Colours. The utilities are bg-/text-/border-/ring-/divide-<name>:
  - bg #FFF, surface #F5F5F3, ink #0A0A0A (text = ink), muted #6B6B6B, line #EAEAEA.
  - Night card: night #0B0B0B, night-text #FFF, night-muted #A3A3A3, night-line #262626.
  - Accents, for dots and small fills only: saffron #FF6B1A, leaf #16A34A, pink #FF4FA0, sun #FFC233, red #E5484D.
  - Status text (AA on white): ok #15803D with ok-bg; error #CE2C31 with error-bg; note #8A5A00 with note-bg.
  - v1 aliases, so pages not yet restyled still compile:
    - accent maps to ink and accent-text to white, so bg-accent buttons are now black.
    - ink-text maps to night-text, and ink-muted to night-muted.
    - wave maps to saffron.
    - role-user/prover/relayer/business/shop map to saffron/muted/leaf/sun/pink, and are used for dots.
  - Locked out (no utilities are generated): indigo, violet, purple, blue, sky, slate, fuchsia.
- Fonts: font-sans = Geist (default on body); font-mono = Geist Mono; font-serif = Instrument Serif.
  - Any <em> inside an h1, h2 or h3 is automatically serif italic, and so is anything with the class .wm-serif.
  - The CSS variables are --font-geist, --font-geist-mono and --font-instrument-serif. They are set on <html> by next/font, so the CSP is unchanged.
- Shape: rounded-card is 28px and rounded-inner is 20px. shadow-float is the soft chip shadow. shadow-object is the card or pass drop shadow.
- Motion:
  - animate-float: 6s bob.
  - animate-stamp: 320ms scale+turn landing.
  - animate-flip: 260ms rotateX, for bot rows turning to Refused.
  - animate-rise: 260ms fade-up.
  - Use them with motion-safe:. A global prefers-reduced-motion rule also turns off all animation and transitions.
- Focus ring: 2px ink with a 3px offset. Inside .bg-night or .bg-ink it is white.
- Base headings: h1, h2 and h3 get tracking -0.03em, leading 1.08 and text-wrap balance.

NEW COMPONENTS
- PillButton(props: PillButtonProps)
  - Props:
    - children: ReactNode
    - variant?: "primary" | "secondary" | "inverse" (default primary)
      - primary: black pill with a white circle holding ↗
      - secondary: white pill with a 1px line border
      - inverse: white pill with a black circle, for the NightCard
    - size?: "sm" | "md" | "lg" (44 / 48 / 56px min height; default md)
    - href?: string. Internal hrefs use next/link. http(s) hrefs open a new tab and add sr-only text "(opens in a new tab)".
    - external?: boolean
    - arrow?: boolean (default true for primary and inverse, false for secondary; a secondary arrow is inline, not circled)
    - disabled?: boolean. Sets 40% opacity. A link becomes <span role=link aria-disabled>.
    - busy?: boolean (sets aria-busy)
    - type?: "button" | "submit" | "reset"
    - onClick?: MouseEventHandler<HTMLElement> (only from a client caller)
    - className?, id?, "aria-label"?, "aria-describedby"?, "aria-current"?: "page" | "step"
  - A trailing " ↗" or " →" in string children is stripped, so DESIGN_V2 lines can be pasted as they are.
  - Also exported: ArrowUpRight({className?}), and the types PillVariant and PillSize.
  - Do not override padding or display through className (conflicting utilities have no guaranteed order). Wrap the button instead.
- FloatChip({children: ReactNode, icon?: "check" | "cross" | "dot" | "none", tone?: "ok" | "refused" | "saffron" | "pink" | "sun" | "ink" | "muted", at?: ChipPosition {top?, right?, bottom?, left?: string | number}, float?: boolean (default false), delayMs?: number, decorative?: boolean (sets aria-hidden), className?})
  - A white pill with shadow-float, an icon and text.
  - Text that starts with ✓ picks check + ok automatically; text that starts with ✕ picks cross + refused. Otherwise it shows a saffron dot.
  - With at, it is absolutely positioned (z-10), so give the parent `relative`. Without at, it is inline, which also works as the eyebrow chip.
- Headline({children: ReactNode, as?: "h1" | "h2" | "h3" | "p" (default h2), size?: "hero" | "section" | "card", id?, className?})
  - A string child renders each *word* pair as <em> in Instrument Serif italic.
  - The default size comes from the tag (h1 → hero, h2 → section, h3 → card): hero clamp(44px,7vw,88px)/600, section clamp(34px,4.6vw,58px), card 26–30px.
  - The colour is inherited, so it works on the NightCard.
  - Also exported: emphasize(text: string): ReactNode[], EM_CLASS, HEADLINE_SIZE, and the type HeadlineSize.
- Section({id?, title?: ReactNode (string with *word* goes through Headline), eyebrow?: ReactNode, lead?: ReactNode, object?: ReactNode, side?: "left" | "right" (default left; which side the text sits on from lg up), align?: "split" | "center" (default split), tone?: "plain" | "surface" (surface = a rounded-card #F5F5F3 container), as?: "h1" | "h2" | "h3" (default h2), children?: ReactNode (rendered under the lead), className?})
  - Uses py-20 / sm:py-28 / lg:py-32 and a max-w-6xl container with px-4 / sm:px-6. On phones the text comes first and the object sits below.
  - The heading id is `${id}-title`, and the section is aria-labelledby that id.
  - Pages can alternate side between left and right for the dopepay rhythm.
- NightCard({children, as?: "div" | "section" | "article" | "aside" (default div), id?, labelledBy?: string (aria-labelledby), label?: string (aria-label), className?})
  - Classes: rounded-card bg-night text-night-text, padding p-6 / sm:p-10 / lg:p-14, overflow-hidden.
  - Inside it, use the tone="night" chips, CopyButton tone="ink" and PillButton variant="inverse".
- BankCard({stamped?: boolean (default false), last4?: string (shown only if it has 4+ digits; otherwise all dots), float?: boolean (default true), tilt?: boolean (default true, -7°), land?: boolean (default true; the seal lands once when it appears), label?: string (replaces the aria-label), className?})
  - A pure CSS/HTML card with container-query text: "Your bank", DEBIT, gold chip, contactless mark, masked number, "VALID THRU ••/••" and an italic "RuPay" corner.
  - stamped adds a round saffron StampSeal at -12°. When not stamped, a faint dashed ring marks the spot.
  - Accessibility: role=img with an aria-label of the form "A bank card[ ending NNNN][, stamped by Watermark]".
  - Width is w-full max-w-[400px], with padding that keeps the tilted corners in bounds. Override with className.
- StampSeal({className?, land?: boolean}): the saffron seal on its own, with the circular text "STAMPED • ONE CARD • ONE STAMP •" and a white check. land adds motion-safe:animate-stamp. It uses useId for the textPath (verified working from a server component).
- Counter (CLIENT): ({value: number, from?: number, durationMs?: number (default 700), animateOnMount?: boolean (default false), pad?: number, grouping?: boolean (default true, en-US commas), className?})
  - SSR renders the real value. It ticks only when value changes, or once on mount from `from` (default 0) when animateOnMount is set.
  - Under reduced motion it jumps straight to the value. Screen readers get only the final value.
  - Pass no functions; it is a client component.
- Logo({className?, markClassName?}): the mark plus a lowercase "watermark" wordmark in Geist Bold (17px under 380px, 19px above).
- LogoMark({className? (default size-7), title?}): an inline SVG black card with a saffron check seal. It is aria-hidden unless title is given.

RESTYLED COMPONENTS (props are backward compatible; only additions)
- SiteHeader({mode?: "site" | "flow", step?: FlowStep, current?: string | null}), plus SiteHeaderPlaceholder().
  - Site mode: Logo, NAV links, and NAV_CTA as a black pill (with the ↗ circle from 440px up; plain below that).
    - The links show from lg (1024px).
    - Below lg there is a <details> menu: a round button with sr-only text "Menu".
    - The active link is ink and semibold with a saffron dot.
  - Flow mode: Logo, a chip reading "Genesis Pass · Step n of 3" (only "Step n of 3" is visible under 640px; the full text stays for screen readers), and a secondary "Exit" pill.
- RouteHeader(): unchanged.
- SiteFooter(): one quiet line, "Built at ETHGlobal Mumbai 2026 · Test networks only · No trackers", then links: GitHub, Registry, Sponsor, USDT, Ethereum test paymaster, Integrate, Privacy, Alt mempool notes.
- StatusChip({status: StatusKind, label?: string, className?, tone?: "light" | "night"})
  - New labels: live "Live", verified "Verified", admitted "Admitted", deployed "Deployed", testnet and devnet "Testnet", planned "Coming soon", foundry and not-deployed "Not live yet", not-recorded "Not recorded yet".
  - Each chip has a dot plus the word. Quiet states get a dashed border.
  - statusLabel(status) returns these labels.
- RoleChip({role: Role, label?: string, className?, tone?: "light" | "night"}).
  - ROLE_LABEL is now: user "You", prover "Proof", relayer "Us", business "Business", shop "Shop".
  - It is a white pill with a role-coloured dot.
- Receipt({title: string, rows: ReceiptRow[], as?: "h2" | "h3", className?}).
  - ReceiptRow is unchanged: {role, label?, who?, text: ReactNode, href?: string | null, linkLabel?}.
  - It is a rounded-card surface slip with dashed dividers. The title is shown as given, so pass "Receipt" rather than "RECEIPT".
- EvidenceRow({item: Evidence, tone?: "light" | "night"}). It renders an <li>, and empty values now read "Not recorded yet".
- Step({n: number, role?: Role (now optional), title: string, body: ReactNode, roleLabel?: string, object?: ReactNode (new), className?}). It renders an <li> card with a big serif-italic number.
- CodeBlock({code: string, label: string, className?}) (CLIENT). A dark rounded-inner panel with window dots, a mono label and a Copy pill. The <pre> scrolls on its own.
- CopyButton({state, onCopy, what, tone?: "surface" | "ink"}) (CLIENT). It is now a pill.
- CopyText({value, label, className?}) (CLIENT). Unchanged.
- Disclosure({summary: ReactNode, children: ReactNode, defaultOpen?: boolean, className?}). A <details> on rounded-inner surface, with a + icon that turns into × when open.
- Hash({value: string, href?: string | null, className?}). Geist Mono at 0.92em with tabular numbers, truncated as 0xd7e0…bc07.
- ExternalLink({href, children, title?, className?, arrow?: boolean}). The underline uses current colour at 35%, so it works on white and on night.
- Wave({lines?, className?}). Deprecated; it renders null.
- PassArt is untouched (owned by the pass agent).
- cx, useCopy and useFlowStep are unchanged.

site.ts
- navItems(passLive): ["Genesis Pass" (only when live), "Bot test" /attack, "For businesses" /sponsor, "For builders" /dev].
- NAV_CTA = {href: "/verify", label: "Stamp your wallet"}.
- primaryCta(passLive, soldOut?):
  - Pass live and not sold out: {"/pass", "Claim your free pass"}.
  - Otherwise: {"/verify", "Stamp your wallet"}.
- Labels never contain an arrow: PillButton draws ↗.

NOTES:
The v2 foundation is in place. Tests pass (177/177), and every page returns 200 on :3200. The 1 typecheck error is in src/lib/use-scroll-progress.ts:32, a file another agent added while I was working. I did not touch it; its owner needs to guard `entry`.

Decisions the page agents and the team should know about:
1. I removed "Pay" from the nav to match DESIGN_V2's Nav line exactly: Genesis Pass, Bot test, For businesses, For builders, then the pill. The task said I could change only nav labels in site.ts, so this goes slightly beyond that.
   - /pay is still linked from verify's Next link, step 2 of the pass walk and the landing's "Payments with no fee" unlock.
   - If the team wants Pay back in the nav, it is a one-line add in navItems, plus updating the site.test.ts expectation.
2. primaryCta and NAV_CTA labels are now "Claim your free pass" and "Stamp your wallet", without arrows. PillButton draws the ↗.
   - _landing/hero-actions and pass-counter still render these labels in their old v1 buttons until the landing agent switches them to PillButton.
   - The test was updated.
3. The theme is light only. I removed the prefers-color-scheme dark block, following DESIGN_V2's white page and the playbook's "one theme".
   - The v1 token names stay as aliases, so pages not yet restyled already render in the v2 palette: bg-accent becomes black, bg-ink becomes the #0A0A0A panel, text-wave becomes saffron.
   - Pages should still drop bg-ink hero bands (one dark card per page at most) and their Wave imports.
4. StatusChip labels changed to plain words.
   - Pages that pass label="WHITECHAIN SEPOLIA" or "EF ALT-MEMPOOL DEVNET" keep that text, but the page agents should restate it in plain words.
   - foundry and not-deployed both read "Not live yet". devnet reads "Testnet".
5. ROLE_LABEL is now You / Proof / Us / Business / Shop, to keep "relayer" and "prover" off user pages. verify-flow still passes its own old caps labels ("STAMP · RELAYER pays gas"), which its page agent should rewrite.
6. Notes on the BankCard:
   - It is pure CSS: no images and no real card data.
   - The issuer reads "Your bank". The masked number is all dots unless last4 is passed.
   - "RuPay" is plain italic Geist text, not the network's logo.
   - The diagonal sheen is the one gradient on the site, as the playbook allows. It is white on graphite, not blue or purple.
7. Fonts: next/font self-hosts all three families, so web/next.config.ts and its CSP were not changed. Instrument Serif loads italic and normal at weight 400.
8. How I verified the visuals:
   - I added a temporary route, src/app/zz-v2-kit-preview, and screenshotted it with headless Chrome on debug port 3171 at 360, 375, 390, 768, 1024 and 1280. Then I deleted the route.
   - The screenshots are in /private/tmp/claude-501/-Users-samanwaybaranwal-Desktop-watermark/55cc012f-6cb8-4b0e-9ef7-5057554d67ea/scratchpad/v2shots/ (kit-390.png, kit-1280.png, hero-360.png, flow2-360.png, home-1280.png).
   - A backup of the v1 _site components and layout is at /private/tmp/claude-501/-Users-samanwaybaranwal-Desktop-watermark/55cc012f-6cb8-4b0e-9ef7-5057554d67ea/scratchpad/v1-site-backup/.
   - Nothing was changed outside .recovered/site-ws. No git, no POST requests, and :3200 was not restarted.
9. On the user's copy concern: none of the shared components says "100 per card" or "free money". The "Only 100 will ever exist. Each bank card can claim one." line belongs in the page agents' copy.
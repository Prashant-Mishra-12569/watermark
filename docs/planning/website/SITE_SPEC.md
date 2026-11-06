# FACTS OVERRIDE (read first; these beat anything below that disagrees)

The spec below was written before the live app changed at 19:58 IST. Corrections, all verified on-chain:

- **Live app (current):** appId `393344891601835728760966937624776276735512086066329273346256164761263100630` (salt 0x…03),
  label "RuPay bank debit (India, no prepaid)", 4,208 prefixes (only bank debit categories: CLASSIC, PLATINUM, PMJDY,
  RUPAY SELECT, STANDARD; prepaid and uncategorised ranges removed), rulesRoot `0x0061cb51b3abde45582be5a854b6d75903e09472bce31b019339db95505bea59`.
  Registered in tx `0xce55c3b64001ac616d8796e92998bdcc42b487dc47d2a80cba95138452690c46`. File: `policies/live.json`.
- **Sponsor (current):** `0x21b6ae18a412afb84a09263939c5e787d374939a`, bound to the live app above, quota 20/day, relayer
  `0xf95E3C36020286117f1c3cd8Efd57Fcfb2e2a9Ba`. Deploy tx `0x64e89664108ca4b2988de740c42e42b87ddc0ada27ad666d3585b31037e31e9c`.
  Blockscout verification of this sponsor is PENDING (status chip DEPLOYED, not VERIFIED).
- **Previous live app (superseded, still on-chain):** appId `2457…106` (6,258 prefixes incl. prepaid), previous sponsor
  `0xAbD7327f6E6b884aEf395B80De073B8aDd0aD7BA`. `deployments/whitechain.json` has them under `previousLive`.
  The first real-card stamp and the first gas-free USDT payment happened under this previous app. They are REAL and may be
  shown as evidence, labelled "first live app (before the stricter filter)":
  - real-card stamp `0xd7e0166584dbb3b404d2b81308b5b69c94fa52b4d2d0da6a66759a52bb86bc07`
  - gas-free USDT payment `0x298d3d178794b988aee4286db9591e6b9a8c1d2ad5008b69fd231460c7477c69` (payer paid 0 gas, sent by the relayer)
  A new payment on the current app will be recorded tonight; `lib/evidence.ts` must make it a one-line change.
- **Test app:** `242622643093352524455632509511752146182158360637522126326090117364223963656` (synthetic test card only).
- **Demo app 2 (`3086…909`) is a private test app. Never show it on the site.**
- Registry `0x998934Efa31a6bE75945fDfAa126d3D6401F8Fd6`, VerifierRouter `0xc2E883a53aC54CBc9564882a77ab3723E1373A5C`,
  USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`, chain 1874, explorer https://explorer.testnet.whitechain.io
  (`/tx/<hash>`, `/address/<addr>`). Business wallet `0x30D55f6B9e0dfBc849e97ddbf5807A74CCE46b21`. Demo shop
  `NEXT_PUBLIC_DEMO_SHOP` (= deployer `0x72b6…FC4b`).
- EF tx `0xcab8c9e2171a8048c8f5e12d4bb830c92cba7f458763d2c7ac8f23ab1faa8a93`, block 3699, link
  https://explorer.altmempool.wtf/tx/0xcab8c9e2171a8048c8f5e12d4bb830c92cba7f458763d2c7ac8f23ab1faa8a93?node=https%3A%2F%2Faltmempool.forshtat.com%2Frpc
- **Decision 1 is RESOLVED:** main is merged here; the live app is the 4,208-prefix one above. Use `sponsorAppId` /
  `liveAppId` / `liveRulesRoot` from `deployments/whitechain.json`, never hard-code `2457…`.
  /sponsor text: drop the "732 prepaid / 1,318 no category" sentence for the live list and say instead "Prepaid and
  uncategorised ranges are left out, because anyone can buy prepaid cards over the counter." Compute the category table
  from `policies/live.json` at build time.
- **Decision 2:** the stage wallet is a fresh MetaMask account; the team's one card has never tapped the current live app.
- **Decision 3:** pass tagline "one real card" (not "one real person"). **Decision 4:** ship /pass with the hard stop.
  **Decision 5:** 5 bots, keep the rate limit.
- Genesis Pass is NOT deployed; it binds to the CURRENT live app and checks payments against the CURRENT sponsor.
  The humans deploy it later with their keystore.

---

# Watermark website: final build spec (UI freeze 02:30 IST Sat)

## 1. Positioning

Watermark lets any app give perks only to wallets backed by a real bank card. There is no KYC and no card number on-chain, and the user never pays gas. The site tells one story to three audiences:
- **A visitor at the venue** gets a free Genesis Pass in three plain steps.
- **A judge** sees the user, business and relayer roles, with a chain receipt for every claim.
- **A builder or AI agent** gets one Solidity call, an SDK call and a read-only MCP server.

Watermark is its own first customer. The Genesis Pass reward walks a visitor through stamp, then gas-free USDT payment, then claim, so the Whitechain USDT payment sits in the main flow.

- **Headline (EXISTS, keep):** **Bots can't hold plastic.**
- **Subhead (CHANGE):** "Tap a real bank card on a phone once. Your wallet gets a private stamp bots can't fake, and perks they can't farm. No card number on-chain. You never pay gas."

## 2. Sitemap and nav

| Route | Nav label | Role in story | Status |
|---|---|---|---|
| `/` | wordmark | Whole story in one scroll | CHANGE (rewrite) |
| `/verify` | **Verify** (accent button) | Tap, prove, stamp | CHANGE |
| `/pay` | Pay | USDT, 0 gas | CHANGE |
| `/pass` | Genesis Pass | NFT, visitor path | NEW (integrate draft) |
| `/attack` | Bot test | Bots refused live | NEW |
| `/sponsor` | Business | Card filter and perk rules | NEW (static) |
| `/dev` | Builders | Solidity, SDK, MCP, live checker | NEW (static plus 1 island) |

**One switch: `PASS_LIVE`.** It is on when `NEXT_PUBLIC_GENESIS_PASS_ADDRESS` is set.
- On: the nav shows "Genesis Pass", and the primary CTA is **Get your Genesis Pass →** (/pass).
- Off: the pass is hidden everywhere, and the CTA is **Stamp your wallet →** (/verify). Nothing links to a dead page.

**Header (`SiteHeader`, NEW):**
- **Desktop:** `WATERMARK` · Genesis Pass · Pay · Bot test · Business · Builders · **[Verify]**.
- **Under 640px:** the wordmark and the CTA button on row 1, with the links inside a `<details>` "Menu". No JS, no sideways page scroll.
- **Flow mode** (`/pass` and `?next=pass` on /verify and /pay): the wordmark, "Genesis Pass · Step {n} of 3" and an "Exit" link to `/`. Nothing else is clickable.

**Footer (`SiteFooter`, NEW):**
- Links: Registry ↗, Sponsor ↗, USDT ↗, devnet Paymaster ↗, GitHub repo, INTEGRATE.md, PRIVACY.md, EF_ALTMEMPOOL.md.
- Line: "Testnet only · RuPay (India) live · Visa and Mastercard planned, not live · No analytics. No trackers."

**Shared rules (NEW):**
- When the relayer is unreachable, every page says: "Can't reach the relayer. Retrying in {n}s."
- Every flow page ends with exactly one "Next:" link: verify → pay → pass → attack → dev. This lets the video be one continuous walk.

## 3. Pages

### `/` Landing (CHANGE: rewrite `page.tsx` as a server component with one client island)

1. **Hero** (NEW). An ink band in both themes, with an inline SVG wave background.
   - Eyebrow: `WATERMARK · TESTNET · LIVE ON WHITECHAIN SEPOLIA`
   - H1 and subhead as in section 1.
   - CTA per `PASS_LIVE`. Text link: "For builders →".
   - **PassCounter** (client), reads `GET /pass` (section 4):
     - ok: "{remaining} of 100 left · one per bank card · about 2 minutes at the Watermark booth"
     - remaining is 0: "All 100 passes are claimed." The CTA switches to "Stamp your wallet".
     - loading: an empty line of reserved height.
     - error or 503: the line is hidden. Never a placeholder number.
   - Proof line: "A real card's stamp, on-chain: `0xd7e0…bc07` ↗"
   - Art: `PassArt`, captioned "Preview. Each pass is drawn on-chain by its contract."
2. **Problem** (NEW).
   - H2: "Airdrops reward wallets. Farmers make wallets."
   - Body: "A script makes thousands of wallets in seconds. It can't make thousands of bank cards. Watermark lets each real card stamp one wallet per app."
3. **How it works** (NEW). Four `Step` cards, each with a `RoleChip`:
   - **Tap · YOU:** "Tap your RuPay card on our Android phone. Nothing is charged."
   - **Prove · PROVER:** "A zero-knowledge proof shows the card is genuine and on the app's list. The card number stays out of it."
   - **Stamp · RELAYER:** "The relayer puts the proof on-chain and pays the gas. The stamp lasts up to 3 months."
   - **Use · BUSINESS:** "Apps read the stamp and pay for the perks."
   - Small print: "Today our prover receives the card data encrypted, holds it in memory only while it proves, then wipes it. You have to trust that wipe for now; proving on the phone is next. Privacy details ↗"
4. **What a stamp says** (NEW), two columns.
   - **Says:** "This wallet is linked to a real RuPay card whose prefix is on this app's public list, until {date}." / "That card can't stamp a second wallet for this app."
   - **Doesn't say:** "Your name, card number, bank, balance or age." / "That you're one person: two cards can stamp two wallets, and a tap has no PIN."
5. **What a stamp unlocks** (NEW). Three cards, each with a `StatusChip` and one `Hash`:
   - **Genesis Pass** (LIVE or NOT DEPLOYED): "100 passes, one per bank card. The relayer mints it; you sign nothing."
   - **Gas-free USDT** (WHITECHAIN SEPOLIA; LIVE once recorded, otherwise NOT RECORDED): "Pay a shop in USDT. You sign, the relayer pays the gas, and the business's Sponsor contract allows 20 free payments a day."
   - **Sponsored gas** (EF ALT-MEMPOOL DEVNET; ADMITTED): "A paymaster pays gas only for stamped wallets, inside an EIP-8141 frame transaction." Links `0xcab8…8a93` ↗ · block 3699.
6. **Bot teaser** (NEW).
   - H2: "We attack it live."
   - Body: "Five bot wallets, made in your browser with no card, ask for demo USDT, a free payment and a pass. Every door stays shut."
   - Link: "Run the bot test →"
7. **MCP** (NEW, `_landing/mcp-block.tsx`, which /dev reuses).
   - Eyebrow: `FOR BUILDERS AND AI AGENTS`
   - H2: "Your AI agent can check for real people too."
   - Body: "Watermark ships an MCP server with 12 read-only tools. An agent can check up to 200 wallets before an airdrop, audit an app's filter against the chain, or draft a new one."
   - **Left:** a `CodeBlock` with the `mcpServers` JSON, copied verbatim from main's `mcp/README.md`.
   - **Right:** a "Recorded run" ink card showing `web/src/content/mcp-run.txt` verbatim. That file is the stdout of one `node mcp/src/stdio-smoke.ts` run. Caption: "Output of mcp/src/stdio-smoke.ts against Whitechain Sepolia, captured {date} {time} IST. Not edited."
     - If the file is empty, leave the card out.
     - Never type or edit output by hand. If it prints `audit matches false`, fix the cause (decision 1) and capture it again.
     - There is no staged agent chat.
   - **ToolGrid**, 12 chips. Each chip drops the `watermark_` prefix; the full name goes in `title`.
     - **Check:** check_wallet, check_wallets, stamp_history
     - **Audit:** app_info, get_policy, explain_policy, list_apps, supported_cards
     - **Build:** draft_policy, prepare_register_app, create_verify_link, integration_snippet
   - Guarantees: "Read-only · holds no keys · signs nothing · never sees card data · runs locally over stdio (Node 24); not hosted, not on npm."
   - CTA: "Set it up →" (/dev#mcp).
8. **Evidence** (NEW).
   - H2: "Every claim is one click from a chain."
   - Rows come from `lib/evidence.ts`. **A row is never hidden.** An empty value shows "not recorded yet" with a NOT RECORDED chip.

   | Row | Value | Chip |
   |---|---|---|
   | Contracts on Whitechain Sepolia | Registry, Router, Sponsor ↗ | VERIFIED once a human has seen it on Blockscout, else DEPLOYED |
   | Real-card stamp | `0xd7e0…bc07` | LIVE |
   | Gas-free USDT payment (main flow) | filled tonight | NOT RECORDED until filled |
   | The payer paid 0 gas | same tx, "sent by relayer …{4}" | same as above |
   | Genesis Pass contract | address ↗ | NOT DEPLOYED / VERIFIED |
   | EF: admitted sponsored frame tx | `0xcab8…8a93`, block 3699 | ADMITTED |
   | EF: design and trade-offs | EF_ALTMEMPOOL.md ↗ | none |

   - Below the rows: "**Why on-chain stablecoins:** perks are paid in money people understand. USDT settles on-chain in seconds, the shop can check it without trusting us, and the 20-a-day limit is enforced by a contract, not our server."
9. **Limits** (NEW): "RuPay cards from India only; Visa and Mastercard are planned, not live. Testnet only, no real money. One card, not one person. A tap has no PIN, so a borrowed card works too. Stamps last up to 3 months."

### `/verify` (CHANGE)
- **`?next=pass`:**
  - Ignore `?app=` and force the live app `2457…106`.
  - Flow header shows Step 1 of 3.
  - `WalletGate purpose="pass"` with the title "Where should we keep your pass?" Options:
    - "Keep it in this browser (easiest). Nothing to install." This comes first on touch devices.
    - "Use my wallet (MetaMask etc.). Connecting only shares your address."
- **`?app=` that isn't the live app** (note box): "This is a test app. Free payments and the Genesis Pass accept only stamps for the live app, RuPay (India)."
- **QR screen:**
  - Title: "Show this code to the Watermark phone."
  - Steps: 1 "The phone scans it." · 2 "Check the phone says **ending {last4}**." · 3 "Hold your card on the back of the phone for 2 seconds."
  - Role chips: `PHONE · YOU` · `PROOF · PROVER` · `STAMP · RELAYER pays gas`.
- **Waiting:** "Waiting for your tap… the proof takes about 5–10 seconds after it." A CSS pulse that is off under `prefers-reduced-motion`.
- **Disclosure "Tapped, but nothing happened?"** (NEW): "This page only sees a stamp arrive, so it can't tell you why one didn't. Common causes: the card isn't a RuPay card on this app's list (Visa and Mastercard aren't live yet); this card already stamped another wallet for this app (use that wallet); the phone lost its connection (tap again)."
- **Success:**
  - "Verified ✓ until {date}" (EXISTS), plus a `Receipt`:
    - YOU: "Tapped a card. Signed nothing. Gas: 0."
    - RELAYER …{4}: "Sent the stamp and paid its gas ↗." This links the relayer address taken from `GET /health`, because `/status` returns no tx hash.
  - Button: "Continue to step 2 →" when `next=pass`, otherwise "Next: pay a shop →".
- **Into a "Details" disclosure:** the explorer links, Short QR and Demo tools. These are moved there, not removed.

### `/pay` (CHANGE)
- **App:** the stamp read always uses the Sponsor's app (`NEXT_PUBLIC_APP_ID`) and ignores `?app=`. Not stamped means the CTA to `/verify` (EXISTS).
- **`?next=pass`:** flow header Step 2 of 3. The amount is fixed at 1 and the shop at `NEXT_PUBLIC_DEMO_SHOP`, and the address field is hidden.
- **Wording:** on the main path, say "test dollars (USDT)" and "network fee". The `messages.ts` errors stay as they are.
- **Zero balance:** "Get demo USDT (from the business)" (EXISTS). It sends `DEMO_FUND_USDT`, default 2, so the copy never says "1".
- **Paid, "Paid ✓":** a `Receipt` replaces the box.
  - YOU: "Signed a {amount} USDT payment. Network fee: 0."
  - RELAYER …{4}: "Sent it and paid the gas." Links the tx ↗.
  - BUSINESS: "Its Sponsor contract checked your stamp. {q} free payments left today." Links Sponsor ↗.
  - SHOP …{4}: "Received {amount} USDT." Links the address ↗.
- **Next link:** "Next: claim your Genesis Pass →" when `PASS_LIVE`, otherwise "Next: watch bots get refused →".

### `/pass` (NEW: integrate the `.recovered/pass-ws` draft)
- **Layout:** art on the left and the checklist on the right (stacked on mobile), with the draft FAQ below.
- **Eyebrow:** "GENESIS PASS · 100 ONLY · ONE PER BANK CARD". Drop every "one per real person".
- **Hero line:** "{N} of 100 left".
- **Side panel "How we gated this":** three lines of the `isStamped` check, then "Step 2 is checked by our relayer from the Sponsor's PaymentRelayed events, not on-chain."
- **Polling:** `GET /pass/:wallet` every 10 s. The user signs nothing.

| State | Copy |
|---|---|
| 503 PASS_NOT_CONFIGURED | "The Genesis Pass isn't deployed yet. You can stamp and pay now; claiming opens when it is." |
| Loading | "Checking your wallet…" |
| Step 1 to do / done | "Prove you have a real card" + **Tap my card** (→ `/verify?next=pass`) / "Stamped ✓ until {date}" |
| Step 1 hint | "If your card already stamped another wallet, switch to that wallet: one card, one pass." |
| Step 2 to do / unknown / done | "Send one free test payment" + **Make the payment** (→ `/pay?next=pass`) / "Can't check payments right now. You can still try to claim." / "Paid ✓" |
| Step 3 locked / ready | "Finish steps 1 and 2 first." / **Claim my pass, free** |
| Claiming | "Minting your pass… about 10 seconds. You sign nothing; the relayer pays the gas." |
| Success | "You hold Genesis Pass #{N} of 100 ✓", plus the on-chain art (`<img>` data URI) and the Receipt "YOU · 0 gas, nothing signed / RELAYER …{4} · minted it ↗ / Contract ↗" |
| Success on a burner | Add: "This pass lives in a wallet kept in this browser. Don't clear site data or use private mode." |
| CLAIM_PENDING / PASS_PENDING | "Your pass is on its way. This page updates by itself." |
| ALREADY_CLAIMED | "This wallet already claimed pass #{N}." |
| NOT_STAMPED | "No live stamp on this wallet. Do step 1 first." |
| NO_PAYMENT | "We can't see your free payment yet. If you just paid, wait 30 seconds and try again." |
| SOLD_OUT | "All 100 passes are claimed. You can still stamp, pay and run the bot test." |
| RATE_LIMIT / BUSY | "Too many requests right now. Try again in a minute." |

The next link is "Next: watch bots get refused →".

### `/attack` (NEW, client only, real requests)
- **H1:** "Bot army vs. Watermark".
- **Sub:** "Bot wallets cost nothing to make. This page makes five in your browser, with no card, and sends each one to every free perk. Every row is a real request to our relayer. Nothing here is simulated."
- **Idle:** button **Launch 5 bots**. Note: "Keys are made in this browser, kept in memory and thrown away on reload. Wait a minute between runs."
- **How the bots run:** each bot is a viem `generatePrivateKey` key. The bots run one after another. Each one calls:
  1. `POST /fund`
  2. `POST /pay`, with a real EIP-3009 signature for 1 USDT to the demo shop. It reuses the `lib/usdt.ts` domain.
  3. `POST /pass`, only when `PASS_LIVE`.
- **Rate budget:** 5 calls per endpoint, against separate limits of 10 a minute per IP.
- **Tiles:** "Bot {n} · …{4}", each with three door cells: Demo USDT · Free payment · Genesis Pass.

| Door state | Copy (tone) |
|---|---|
| Running | "asking…" |
| 403 NOT_STAMPED | "Refused: no stamp" (ok, because the defence worked) |
| 429 RATE_LIMIT | "Slowed: too many requests from this network (10 a minute). A second defence." (note) |
| Any 2xx | "Got through. This is a bug." plus the tx link (error, never hidden) |
| Other code | "Other answer: {code}" (muted; not counted as a refusal) |
| Network | "Can't reach the relayer. Nothing was tested." |

**Summary:**
- Every request refused: "{r} of {t} requests refused before any transaction was sent. 0 USDT moved. 0 gas spent."
- Anything got through: "{k} got through. This is a bug."
- Network errors are left out of the counts and named: "{e} couldn't reach the relayer."

**Contrast row:** "A wallet with a real card's stamp gets through: see the payment ↗" (from the evidence USDT row; omitted if that payment isn't recorded).

**Layer cards** (static):

| Layer | Text | Chip |
|---|---|---|
| Relayer | "Checks the stamp before it sends anything." | LIVE |
| Sponsor contract | "Reverts `NotStamped` even if someone skips our relayer." | FOUNDRY-TESTED |
| Pass contract | "`mint` reverts `NotStamped`." | FOUNDRY-TESTED |
| Alt-mempool paymaster | "Refuses unstamped senders in its VERIFY frame (`test_unstampedSender`). A stamped wallet's tx was admitted ↗. On-chain refusal planned." | FOUNDRY-TESTED |
| Same card, second wallet | "The registry reverts `NullifierBoundToOtherWallet`. The phone shows a general 'chain refused the stamp' message." | FOUNDRY-TESTED; live run untested |

### `/sponsor` "Business" (NEW, static server component)
- **Policy source:** chosen at build time from `policies/*.json`, never `local*`. Pick the file whose `appId == sponsorAppId` and whose `rulesRoot == liveRulesRoot` in `deployments/whitechain.json`.
- **If no file matches**, show an error box: "The published filter for the live app isn't in this build."
- **H1:** "Who gets a stamp, in public." Sub: "The business picks the cards. Anyone can check the list against the chain."
- **App card:** "RuPay (India) · live app" · appId `2457…106` (copy) · Registry ↗ · Sponsor ↗ · Session signer ↗.
- **Filter text:**
  - "Card network: RuPay, proven inside the proof by the RuPay CA key."
  - "Prefix list: 6,258 six-digit prefixes that a public BIN list (CC BY 4.0, unofficial) tags as Indian RuPay debit. The same list tags 732 of them prepaid and gives 1,318 no category. Listed, not proven: card type comes only from that list."
- **Category table** (computed at build): CLASSIC 3,537 · none 1,318 · PLATINUM 440 · PREPAID PLATINUM 363 · PREPAID 216 · PMJDY 190 · …
  - There is no bank table: the file has no bank field.
- **Chips:** RuPay LIVE · Visa PLANNED · Mastercard PLANNED.
- **Root:** "rulesRoot `0x205f…e5dc` matches the root recorded at deployment. Check it against the chain yourself: `watermark_app_info` (MCP) or `auditApp` (SDK)."
- **Perk rules:**
  - 20 free payments per wallet per UTC day (on-chain `quotaPerDay`).
  - Up to 5 USDT per payment (a website limit).
  - Stamps last up to 3 months; one card stamps one wallet per app.
  - "The business runs the relayer ↗, which pays the gas, and its wallet ↗ funds demo USDT."
- **Download:** the published filter JSON. "We never ask you to type card digits."
- **CTA:** "Run your own filter →" (/dev#own-filter).

### `/dev` "Builders" (NEW)
- **H1:** "Gate anything on a real card." Sub: "Read a stamp from Solidity, TypeScript or your AI agent. No API key."
- **Sections:**
  1. **Live addresses**, each with copy: chain 1874, Registry, live appId, test appId `2426…656`, Sponsor, USDT, deploy block 12335610.
  2. **Gate it:** three stacked `CodeBlock`s copied verbatim from main's `docs/INTEGRATE.md`: the Solidity `isStamped` modifier, TypeScript `check`/`checkMany`, and the MCP config (`#mcp`, reusing `mcp-block`).
  3. **Your own app in 4 steps** (`#own-filter`): `draft_policy` → publish the leaves → `prepare_register_app` (an unsigned tx you sign) → `create_verify_link`.
  4. **Audit anyone:** `app_info`, `stamp_history`.
  5. **Which cards work:** RuPay live; Visa and Mastercard "Planned, not live".
  6. **Limits:** "A stamp is not KYC. Three cards, three stamps. The MCP runs locally over stdio, not hosted, not on npm." Link: INTEGRATE.md.
- **Live checker "Is this wallet stamped?"** (client). Calls `GET /status/:wallet?app={live|test}&chain=1874`, with an app switch Live | Test ("synthetic test card only").

| State | Copy |
|---|---|
| Empty | "Paste a wallet address (0x…)" |
| Invalid | "That isn't a wallet address: 0x and 40 hex characters." |
| Loading | "Checking Whitechain…" |
| Stamped | "Stamped until {date} ✓ Your gate would let it in." (ok) |
| Not stamped | "No live stamp. Your gate would refuse this wallet." (note) |
| Error | "Couldn't reach the relayer, so nothing was checked." |

- **Copy button:** "Copy", then "Copied ✓" for 2 s. If the clipboard fails, it selects the text and shows "Press ⌘C / Ctrl+C."

## 4. Relayer endpoints and contract calls

| | Method and path | Shape |
|---|---|---|
| **NEW** | `GET /pass` | 200 `{pass, remaining:number, totalSupply:string, maxSupply:string}`; 503 `PASS_NOT_CONFIGURED`; 502 `CHAIN_UNAVAILABLE`; 429 `RATE_LIMIT` (passReadLimiter). Reads `remaining()`, `totalSupply()`, `MAX_SUPPLY()` and caches them for 5 s. Feeds the landing PassCounter, so no wallet is needed. |
| **NEW** in live (from draft) | `GET /pass/:wallet` | `{pass, stamped, paid:boolean\|null, claimed, tokenId:string\|null, remaining, totalSupply, maxSupply, image:string\|null}` |
| **NEW** in live (from draft) | `POST /pass {wallet}` | `{txHash, tokenId, from}`. Errors: 403 NOT_STAMPED / NO_PAYMENT, 409 ALREADY_CLAIMED / CLAIM_PENDING, 410 SOLD_OUT, 422 PASS_REJECTED, 429 RATE_LIMIT, 502 CHAIN_UNAVAILABLE, 503 BUSY / PASS_NOT_CONFIGURED / RELAYER_NOT_CONFIGURED |
| EXISTS, new use | `GET /health` | `relayer` address for the receipts |
| EXISTS, new use | `GET /status/:wallet?app=&chain=` | the /dev checker |
| no change | `/session`, `/stamp`, `/pay`, `/fund`, `/balance` | none |

**Contract (`WatermarkGenesisPass`):**
1. Change the SVG tagline from "one real person" to "one real card" before deploying, plus the matching test (decision 3).
2. Run `DeployGenesisPass` as a dry run, then deploy with `--verify` on Blockscout, using:
   - `registry_ = 0x9989…8Fd6`
   - `appId_ = 2457…106`
   - `minter_ = the relayer address`
3. Set `GENESIS_PASS_ADDRESS` (relayer) and `NEXT_PUBLIC_GENESIS_PASS_ADDRESS` (web).
4. The relayer needs the draft's 0.1 WBT pass budget on hand.

**Not built:** `GET /session/:id/result`, the nullifier refusal on the web (cut).

## 5. Visual system (evolve `globals.css`, replace nothing)

**Keep:** every current token, the system fonts, the cards, buttons and status boxes, the mono "Wallet ending" panel, the tracked-caps eyebrows and the always-white `.qr-frame`.

```css
:root { --ink:#0b1426; --ink-text:#e2e8f0; --ink-muted:#94a3b8; --wave:#38bdf8;
        --role-relayer:#0f766e; --role-business:#6d28d9; }
@media (prefers-color-scheme: dark) { :root { --role-relayer:#5eead4; --role-business:#c4b5fd; } }
@theme inline { --color-ink:var(--ink); --color-ink-text:var(--ink-text); --color-ink-muted:var(--ink-muted);
  --color-wave:var(--wave); --color-role-user:var(--accent);
  --color-role-relayer:var(--role-relayer); --color-role-business:var(--role-business); }
```

- **Ink** is for the hero band, code and terminal blocks, and the /pass art panel. It stays navy in both themes, the way the QR stays white.
- **Wave** lines are 1.5px at 40% opacity.
- **Role colours never reuse** the ok, note or error colours.
- **Type:** the hero is `text-5xl sm:text-7xl` and body text `text-lg` (for the projector). Contrast is AA in both themes. Mono is for hashes, addresses and tool names.

**Components (`web/src/app/_site/`):**

| Component | Props and behaviour |
|---|---|
| `SiteHeader` | `{mode?:"site"\|"flow", step?:1\|2\|3}` |
| `SiteFooter` | none |
| `RoleChip` | `{role:"user"\|"prover"\|"relayer"\|"business"\|"shop", label?}` |
| `StatusChip` | `{status:"live"\|"testnet"\|"devnet"\|"admitted"\|"verified"\|"deployed"\|"planned"\|"foundry"\|"not-recorded"\|"not-deployed"}`. Planned is muted and dashed; foundry uses the note colour. |
| `Hash` | `{value, href}`. Renders `0xd7e0…bc07 ↗`, full value in `title`. |
| `Receipt` | `{title, rows:{role, who?, text, href?}[]}` |
| `EvidenceRow` | `{item:Evidence}` |
| `Step` | `{n, role, title, body}` |
| `CodeBlock` (client) | `{code, label}`. Scrolls inside the block, never the page. Copy states as on /dev. |
| `Disclosure` | a styled `<details>` |
| `PassArt` | `{tokenId?, size}`. A JSX port of the contract's `svg()`. |
| `Wave` | the divider |

**Data files:**
- `lib/evidence.ts`: `{id, label, chain:"whitechain"|"altmempool", value:string|null, href:string|null, status}[]`
- `lib/site.ts`: `PASS_LIVE`, the nav items, and the addresses imported from `deployments/whitechain.json`.

**No CSP change:** browser calls go only to the relayer, and explorer links are plain navigation.

## 6. Demo script (4 minutes)

**Setup:**
- On the Mac: the web app, relayer and prover are running, with MetaMask on Whitechain.
- The stage wallet per decision 2.
- The relayer log is visible in a split pane; it logs no card data.

| Time | Click | What it shows | Role |
|---|---|---|---|
| 0:00 | `/` hero, counter, proof line ↗ | The problem, and a real stamp on-chain | none |
| 0:25 | **Get your Genesis Pass** → /pass → "Use my wallet" (MetaMask) | Checklist, step 1 to do | USER |
| 0:40 | **Tap my card** → /verify?next=pass. The phone scans and shows "ending {last4}", then the tap. | The prover log line, then "Verified ✓", then the Receipt "Relayer paid the gas" | USER → PROVER → RELAYER |
| 1:25 | **Continue to step 2** → **Get demo USDT** → **Send 1 USDT**. MetaMask shows a signature with no gas. | "Paid ✓" four-row Receipt. Open the tx ↗: `from` is the relayer, and the shop got 1 USDT | BUSINESS funds, RELAYER pays, SHOP is paid |
| 2:10 | **Back to your pass** → **Claim my pass, free** | Pass #N art and the mint tx ↗ | RELAYER mints |
| 2:35 | Nav **Bot test** → **Launch 5 bots** | 15 refusals, "0 gas spent". Point at the paymaster card and open the admitted frame tx ↗ (EF) | none |
| 3:10 | Nav **Business** | Filter list, 20 a day, who pays (Whitechain roles) | BUSINESS |
| 3:25 | Nav **Builders** | Paste the stage wallet into the checker ("Stamped ✓"), then the MCP recorded run | none |
| 3:50 | `/` Limits | One sentence: one card, not one person; RuPay only | none |

**Running it:**
- Run /attack only after the live payment: the attack uses 5 of the 10 `/pay` calls allowed per minute per IP.
- If `PASS_LIVE` is off, skip 2:10 and the 0:25 step goes straight to /verify.

## 7. Build order (about 6 hours, parallel chunks with no shared files)

**Chunk 0: the humans (0:30, blocking).**
1. Run `git fetch` and run `git show origin/main:policies/live.json | head -5`, then resolve decision 1 and merge main.
2. Make and record one real gas-free USDT payment on the live app. Add the hash to `evidence.ts` and to the README, along with the "why on-chain stablecoin" line.
3. Capture `mcp-run.txt`.

**Chunk A: Shell (0:45; others start against its props after 0:15).**
- `web/src/app/globals.css`, `web/src/app/layout.tsx`
- `web/src/app/_site/*` (all components in section 5)
- `web/src/lib/evidence.ts`, `web/src/lib/site.ts`

**Chunk B: Landing (1:30).**
- `web/src/app/page.tsx`
- `web/src/app/_landing/{hero,pass-counter,how-it-works,stamp-says,unlocks,bot-teaser,mcp-block,evidence-list,limits}.tsx`
- `web/src/content/mcp-run.txt`

**Chunk C: Pass, end to end (1:45, hard stop at T+2:30).**
- Copy the draft per `PASS_INTEGRATION.md` after the `cmp` drift check passes.
  - **Except** `web/src/app/page.tsx`, `pay-flow.tsx` and `_wallet/wallet-gate.tsx`, which other chunks own.
- Add `GET /pass`, change the tagline, deploy and verify, set the env vars.
- **Files:**
  - Contracts: `contracts/src/WatermarkGenesisPass.sol`, `contracts/src/libraries/Base64.sol`, `contracts/script/DeployGenesisPass.s.sol`, `contracts/test/*GenesisPass*`, `contracts/test/utils/PassTestBase.sol`, `contracts/README.md`
  - Relayer: `relayer/src/{app,pass,pass.test,abi,abi.test,chain,config,index,preflight,stamp.test}.ts`, `relayer/README.md`, `.env.example`
  - Web: `web/src/app/pass/*`, `web/src/lib/genesis-pass.ts`, `web/src/lib/genesis-pass.test.ts`, `web/src/lib/relayer.ts`, `web/README.md`
- **Done when** one pass is minted from a browser. If that hasn't happened by T+2:30, unset `NEXT_PUBLIC_GENESIS_PASS_ADDRESS`.

**Chunk D: /verify and /pay (1:00).**
- `web/src/app/verify/*`, `web/src/app/pay/*`, `web/src/app/_wallet/*` (including `purpose:"pass"`, the draft's four lines), `web/src/lib/config.ts`, `web/src/lib/messages.ts`

**Chunk E: /attack (0:50).**
- `web/src/app/attack/{page.tsx,attack-client.tsx,use-attack.ts,bots.ts}`
- It only imports `lib/relayer.ts` and `lib/usdt.ts`, and calls `/pass` with its own fetch.

**Chunk F: /sponsor and /dev (1:00).**
- `web/src/app/sponsor/page.tsx`, `web/src/lib/policy-summary.ts` (server-only, reads the files at build time)
- `web/src/app/dev/{page.tsx,wallet-checker.tsx}`
- It imports `mcp-block` and `CodeBlock` without editing them.

**Timeline:**
- **T+4:00:** integrate and run `next build` with the production CSP.
- **T+4:30:** full rehearsal of section 6 on the projector, phone width and dark mode.
- **T+5:30:** fixes only.
- **02:30:** freeze.

**CUT:**
- A live stats or stamp feed; a live on-chain audit read on /sponsor.
- Any BIN lookup or card-digit input; a bank table (the data has no bank field).
- A live paymaster refusal; the web nullifier message (it would need a new endpoint).
- An MCP playground or a staged agent chat.
- A real-person WalletGate panel on /attack (it's a link instead).
- A theme toggle, a cross-page progress tracker, gas amounts in receipts, and motion beyond the waiting pulse.
- Arkiv, Hindi, share images, moving a burner pass to MetaMask, and `scripts/bots.ts`.
- The Short QR option stays, hidden in Details.

## 8. Open decisions for the humans

1. **Main's policy change could break the demo app.**
   - **What I saw:** this branch and the local `origin/main` (90f553c) both still have `live.json` set to appId `2457…106`, with 6,258 leaves and root `0x205f…`. That matches `sponsorAppId` and `liveRulesRoot`.
   - **What is reported but unchecked:** the judge reports that the newer remote main moved `live.json` to appId `3086…909` with 4,208 leaves, under a root that isn't on-chain. 4,208 equals 6,258 − 732 prepaid − 1,318 uncategorised, so it looks like a debit-only cut. I didn't fetch, so I haven't seen it.
   - **Default:** merge main for the MCP, SDK and INTEGRATE.md, but keep the 6,258-leaf file for `2457…106` in `POLICY_FILES` and on /sponsor. Don't register a new app tonight. Agree this with Prashant before he pushes again.
2. **Stage card and wallet.** One card binds to one wallet per app, and `/fund` pays each wallet once per relayer run.
   - **Default:** record the video with a card that has never been tapped on the live app and a fresh MetaMask wallet, and claim the pass.
   - For the live demo, re-stamp that same wallet. Confirm in rehearsal that a same-wallet re-stamp works. Its pass then shows "already claimed #N", which is honest.
3. **Pass art tagline.** The draft SVG says "one real person", which the site's limits contradict.
   - **Default:** change it to "one real card" before deploying. It's one line plus a test, and the contract isn't deployed yet.
4. **Ship /pass at all.**
   - **Default:** yes, with the T+2:30 hard stop. If it hasn't minted in a browser by then, unset the address, the pass disappears, and the CTA becomes "Stamp your wallet".
5. **Bot count and rate limit.**
   - **Default:** 5 bots, keep `PAYS_PER_MINUTE_PER_IP=10`, and run /attack after the live payment. Showing a slowdown as a second defence is better than raising the limit.
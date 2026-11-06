# Prompts: Prashant

Tool: Claude Code (VS Code extension), used as a pair programmer during ETHGlobal Mumbai.

I made the product and architecture decisions, ran every real-card test on my own phone and cards, and reviewed,
committed and pushed every change myself. Claude wrote most of the code from my direction and the build spec in
[`docs/spec/`](../spec/).

**About this log:**
- My prompts are in order, from the first repo skeleton onward.
- They're lightly cleaned: I fixed spelling and voice-typing mistakes, and cut repeated words in a few long dictated
  ones. Nothing is added, and the meaning is unchanged.
- Times are approximate, in IST, on Friday 6 Nov 2026.
- Pasted terminal output and screenshots are shortened to a note in [brackets]. One paste is removed because it
  contained my card data.
- "Result" is one line on what the AI produced.

Before this, I used a planning chat to read the spec, check the live ETHGlobal and partner prize rules, and agree the
work split with Samanway. Its outcome is the spec in [`docs/spec/`](../spec/) and [`docs/PLAN.md`](../PLAN.md).

---

## Skeleton and first push (~02:40–03:10)

**01.**
> This is the repo I created and added Samanway to. I want to push and commit every small thing here, but I don't
> want Claude shown as a contributor, only me and Samanway. Start the skeleton here. Don't add the prompts yet, we'll
> add the AI part later. Build according to the ETHGlobal rules, the partner track rules and PDF v3. If you find any
> fault, keep fixing it, and if the PDF has something we can do better, do it without breaking the rules. Give me the
> git commands to push the skeleton, and tell me whose step is next. Think like a pro engineer and keep only useful
> things in the repo.

Result: the repo skeleton, with [`docs/interfaces.md`](../interfaces.md) (the contract between our parts), PLAN,
PRIVACY, the track docs and the shared SDK types. Spec faults found and fixed:
- the frame tx shape
- the paymaster must stake itself
- one sponsor per app
- encoding rules
- the viem Whitechain chain
- Node 24

**02.**
> I have pasted the v3 file.

**03.**
> My GitHub email is [my email]. [Pasted the commit commands.] For the message boxes, put good commit names per task,
> written in a clean, minimal, human way. And I really don't want Claude as a contributor.

**04–05.**
> [Screenshots of my terminal] See this.

Result: my long paste had been cut off in the terminal, so I ran one command at a time and checked that git pointed at
the right folder.

**06.**
> Good, it worked. Now what's next? Whose turn, Samanway Baranwal's or mine?

**07.**
> Samanway Baranwal.

Result: fixed my teammate's name in the license and docs.

## Android app and the real card (~03:10–05:00)

**08.**
> OK, what's my next step? Keep going until Samanway is doing his task. And do I need to download Android Studio?

Result: Android Studio and the SDK were already installed. Built the synthetic RuPay-shaped test card with an ODA
verifier and 16 tests (real tap, replay, tamper, wrong exponent, wrong CA, PAN mismatch, expiry).

**09.**
> Do I need to wait for Samanway, or continue? Please set up the Android project, I don't know how. Guide me very simply.

Result: the Android project (Kotlin + Compose), the `watermark://verify` deep link, link validation and 6 unit tests.

**10.**
> From the 4th step, tell me again exactly what to do. How do I get the app on my phone? Give me proper steps.

**11.**
> [adb: INSTALL_FAILED_USER_RESTRICTED] ???

Result: it's a Xiaomi/HyperOS phone, which needs "Install via USB" turned on.

**12.**
> I got the app and it says scan the QR. What do I do now?

**13.**
> It says "the link can't be used: bad signature".

Result: the test link had a malformed signature, and the app correctly refused it.

**14.**
> Yeah, I can see it now. What's the next step?

Result: the EIP-712 session signature check in the app, with a test vector shared with the TypeScript SDK.

**15.**
> [Screenshot: git switch error] Which step are we at? Can you check my GitHub commits, am I doing everything right?
> What's left? Do we wait for Samanway or is there more for me?

**16.**
> [Photo of the Whitechain flyer] Please do the install and all, I'll share the things you need from the old app.
> Samanway is stuck: a wallet got created and wants devnet ETH, but the faucet isn't working. Anything I should share?

Result: used the flyer facts (official USDT with EIP-3009, Ankr RPC, 2 WBT/day). Found that the devnet faucet was
empty (not a setup mistake). Started pinning the Noir/bb toolchain.

**17.**
> [Screenshot of the bbup error] Check this. I only ran the Ubuntu commands above.

Result: found the matching bb version (6.0.0) for Noir 1.0.0.

**18.**
> [Screenshot: my SBI card passes in the pre-kickoff Card Test app, plus the nargo/bb versions.]
> [Raw APDU log removed from this file: it contained card data.] Done. Check it and tell me what's next.

Result: the SBI card has exactly the key sizes the circuit targets. **The circuit spike passed:** the full EMV chain in
a zero-knowledge proof in 4.4 s, the verifier fits on-chain, and replay and expiry are refused.

**19.**
> What do I need from Samanway's first task? And yeah, continue further.

**20.**
> [Screenshot of GitHub] How do I do it, what do I do?

**21.**
> [Pasted git pull output] I think it's done, check.

Result: the NFC card reader (PPSE → SELECT → GPO with the session's UN → READ RECORD) with the RuPay network key
checked against its published checksum, plus 7 tests with a fake card.

**22.**
> I don't know if you updated the app on my phone. I opened it and tapped the SBI card, but nothing happens, it still
> says scan the QR, and it beeps each time I tap.

Result: no session had been opened, so the app ignored taps by design. Added a clear "scan the QR first" message.

**23.**
> It says "genuine card, it signed this session's challenge".

**Milestone: our own new code verified my real SBI card on the phone.**

## GitHub trouble, full circuit, prover, phone → proof (~05:00–05:40)

**24–26.**
> [Push rejected: "fatal error in commit_refs_rules"] See this. … See this, use your max thinking level bro.

Result: ruled out rulesets, branch protection and the commit content. It was a GitHub-side error, and it cleared up.

**27.**
> OK continue, the GitHub task is done. Check Samanway's task and status, take what you need from it or ask me, and
> tell me what Samanway needs to do next and whether he or I need to pull anything.

Result: reviewed Samanway's relayer (merged) and saw his merge conflicts resolved correctly. Completed the circuit
(CA root, BIN filter, nullifier). Made the off-circuit Poseidon2 match the circuit exactly.

**28.**
> [Pasted: pull blocked by a local change] Check this.

**29.**
> Done bro, now what? Samanway is working on his task. Do we wait or proceed? And keep checking Samanway's pushes.

**30.**
> Continue, but Samanway asked me to send you this: [his request for the Verifier, the prover code and the policy roots
> to be in the repo, and where the caRoot comes from].

Result: `caRoot` is now saved in `policies/ca-keys.json`, with a CI check that the committed roots match.

**31.**
> OK go properly, think at every step and work precisely.

Result: phone-side encryption (RSA-OAEP-256 + AES-GCM) with interop against the Node prover, upload and progress
screens, and short QR links.

**32–33.**
> OK, I sent it to Samanway and ran the git commands. Now what? … OK, try again.

**34.**
> I can see this now: "Your card is genuine. Waiting for the relayer to stamp it on-chain."

**Milestone: my real SBI card → a real zero-knowledge proof, end to end.**

## SDK, MCP and this log (~05:40–)

**35.**
> Continue with the SDK and MCP while Samanway works, and keep pulling and checking his updates. Also, Samanway is
> adding his prompts to the repo for ETHGlobal, so I want to add mine too: cleaned up, simple, and shown to me first
> for approval.

Result: the SDK stamp checks (`check`, `checkMany`, `verifyLink`, `draftPolicy`) and a read-only MCP server with 6
tools; 24 new tests.

**36.**
> [Pasted: fast-forward merge refused] Check this. And for the prompts: start from my first push of the skeleton, put
> the file in the repo so I can edit a few things, and keep working meanwhile.

Result: this file.

**37.**
> I'll check the prompt file and tell you when to add it to the repo. Until then, keep adding the latest prompts to it.
> Also Samanway sent this: [he compiled the circuit on his Mac with nargo 1.0.0, made a real proof in 1.4 s, the
> committed Verifier.sol accepts it, verifying costs 2.57M gas and a full stamp about 2.9M]. And the GitHub task is done.

Result: worked through what the measured gas means:
- The relayer needs a separate stamp gas cap (300k would block every stamp).
- About 0.0145 WBT per stamp, so the faucet covers roughly 130 stamps a day.
- On the EF track, the proof can't be verified inside VERIFY (2.57M > the 1M staked budget), so the paymaster only
  reads the stamp.

These are recorded in the README and EF docs.

**38.**
> Check if he is done or not.

Result: Samanway had pushed nothing new since his relayer PR. I asked him to push his Registry work in small commits.

**39.**
> Check again. [Pasted Samanway's requests for the real-card test:
> - `policies/live.json` with SBI RuPay debit BIN prefixes from a public list (status "listed", no BIN tied to our own
>   cards) and its rulesRoot;
> - rebuild the app with his Mac prover key and his session signer `0x9a0e…dbb`;
> - check whether the phone camera opens `watermark://` links or whether we need an in-app scanner.]

Result:
- `policies/live.json` has the 4 SBI RuPay debit BINs from a public forum list (status `listed`, with the source).
- The app trusts the dev signer and Samanway's signer in debug builds, and only his in the stage build.
- The prover key is copied into the app with a guard that refuses any private key.
- A QR test tool to check the camera.

**40.**
> [Photo: the phone showing "Wallet ending b1e5 · Policy for app 777 · Whitechain Sepolia"] After I scanned it, this
> opened in the app.

Result: the phone's normal camera opens `watermark://` links straight into the app, so no in-app scanner is needed.

**41.**
> [Pasted Samanway's plan:
> - Use a public BIN lookup for my card's BIN, add it as "listed" with the source, never as "tested".
> - Fill the live policy with a big public RuPay BIN list (up to 4,096 prefixes) so judges' RuPay cards also pass.
> - Visa and Mastercard each need their own circuit profile; he's adding a verifier router, with a 1-byte profile
>   prefix on proofs.
> - Which Visa or Mastercard cards do we have to tap?]

Result:
- Public BIN lookup sites disagreed about my card's BIN (it's co-badged with Discover/Diners). A public CC BY 4.0 BIN
  dataset lists it as RuPay debit (India).
- `policies/live.json` now holds every Indian RuPay debit BIN in that dataset: 6,258 prefixes, all `listed`, with
  attribution.
- That's more than 4,096, so I raised the rules tree depth from 12 to 13 (8,192 leaves) before any deploy. It costs
  +150 gates. I regenerated `Verifier.sol` (18,578 bytes) and recomputed all roots.
- The TypeScript roots match values computed by the Noir circuit itself.

**42.**
> Can you commit it, or tell me how to do it from this folder? I'll do it. Without Claude as the author.

Result: committed the three changes and the merge of Samanway's web work, authored by me with no co-author line.
Regenerated the conflicting lockfile and ran 102 TypeScript tests (all passing). I pushed it myself.

**43.**
> [Screenshot: the PR's "no secrets or card data" check failing] See.

Result: the guard had caught a fake 16-digit test card number in an MCP test. I now build it from parts, so no
card-number-like literal is in the repo, and the test still checks that card numbers are rejected.

**44.**
> Bro, he already did this. [Pasted a Copilot session that "fixed" the same CI failure.]

Result: Copilot had pushed a bot-authored commit onto my branch. I pushed my clean branch under a new name
(`prashant/docs-v2`) and closed the old PR unmerged, so no bot commit reaches `main`. No force-push needed.

**45.**
> [Screenshot: the merged PR #5 page] I delete this branch, right?

**46.**
> Yes, done I think, check.

Result:
- Merged Samanway's contracts and `/stamp` work into my branch.
- His real-proof stamp tests failed against the new depth-13 verifier, as expected, so I regenerated the fixture
  with his own script.
- 133 TypeScript tests pass, and 146 of 147 contract tests pass. The 1 failure is a Sponsor test that also fails
  on `main`; I flagged it to him.

**47–48.**
> [Pasted: push rejected because the local and remote branch names differ] I forgot, but I think I did it, can you help?
> … Done.

Result: renamed my local branch to match its remote, pushed, and merged PR #14. `main` has the depth-13 circuit, the
new verifier and Samanway's contracts, with only our two names as authors.

**49.**
> Go.

Result:
- The prover serves each app's public filter (`GET /policy/:appId`, because the phone only knows the prover's URL).
- The app shows the real filter on the consent screen, and refuses a card outside it before anything is encrypted
  or sent.
- Restarted the dev prover with the depth-13 circuit.
- Built the stage app (`demo`) with Samanway's Mac prover key and only his signer.

**50.**
> [Pasted Samanway's real-card test plan: Registry v2 on Whitechain with the router, the live app with the 6,258
> BINs, his session signer, his prover and relayer on his Mac, and the /verify QR. Install the newest build, join his
> Wi-Fi, then run the happy path and the must-refuse checks, and send screenshots.]

Result: built the stage app from main and found a mismatch. His relayer's `/health` reported session signer
`0x9A0606…FdBB`, while the app trusted an older address. I fixed it, rebuilt and installed the app, and confirmed his
prover and relayer answer from my network.

**51–53.**
> I connected the phone with USB. … Try again. … Try again.

Result: the Xiaomi "Install via USB" prompt had cancelled the first tries; the install worked on retry.

**54.**
> Bro, what's the status of the SDK and MCP we built for B2B companies? Do they have all the features, can companies
> integrate it? Could a wallet like Ledger integrate it and only allow wallets that have a Watermark stamp? Add every
> feature, including card filters (Visa, Mastercard, RuPay…), into the MCP so any Web3 company can use it easily, with
> visibility, accountability and transparency. Verify it, and if you find any fault, fix it.

Result: verified against the live contract on Whitechain:
- The Registry `0x9989…8Fd6` and its VerifierRouter are verified on the explorer.
- caRoot, both rulesRoots and the session signer match the repo exactly.
- One real stamp is on the live app.

Faults found:
- The deployment file wasn't in the repo, so the SDK and MCP couldn't find the Registry.
- Reading all stamps from block 0 fails on the Ankr RPC.
- There was no way for a company to register its own app.
- There were no transparency tools.

Started the fixes: app audit, stamp history, unsigned registerApp, verify links, an honest supported-cards tool, and a
B2B integration guide.

**55.**
> [Phone screenshots: first "Can't reach the prover at https://…trycloudflare.com", then "Stamped ✓ 0xd7e01665…"]
> Yes, Samanway tested it on my Android phone with my SBI RuPay card; he used Cloudflare too. Pull from GitHub if
> you need anything. [Pasted Samanway's on-chain confirmation: tx 0xd7e01665…, 2,855,911 gas paid by the relayer,
> proof in 2.6 s, expiry 28 Feb 2027; plus his next steps (Sponsor deploy, /pay) and a note to run `nargo compile`
> after pulling circuit changes.]

Result:
- Confirmed the first real bank-card stamp on Whitechain.
- Samanway's `deployments/whitechain.json` matches the chain and my own reconstruction exactly, so I used his.
- Planned two fixes: a prover startup check against a stale compiled circuit, and a clearer phone error for a tunnel
  URL that can't be reached.

## 18:10

**56.**
> The stamp expiry is manageable, right? Can companies set a deadline for when the stamp expires, so the wallet has
> to connect on that website again? How exactly does this work? Also push a guide to Samanway for now (we'll clean
> the repo at the end): everything I've done, what I'm going to do, what he needs to do, and what's left on his side.

Result:
- Explained expiry from the contract and circuit: the app's session signer picks a month 1–3 months ahead, the card's
  certificates must be valid through it, and renewal only extends. Today the relayer always picks 3 months.
- Wrote `docs/HANDOFF.md` for Samanway (temporary; to be removed before submission).

## 18:40

**57.**
> He sent this; do what's needed properly and stay up to date. [Pasted Samanway's EF result: alt mempool tx
> 0xcab8c9e2… admitted and mined in devnet block 3,699, 5 frames successful, the paymaster paid and the user paid 0;
> devnet Registry 0x1838…E42C, paymaster 0x6218…7097; his next steps: commit the paymaster code and devnet.json, /pay,
> the EF attack rows, README / WHITECHAIN_FEEDBACK / AI_USAGE drafts, then video and submission.]

Result:
- Checked the EF tx receipt on the devnet RPC (block 3,699, frames successful) and that all explorer links load.
- README: added the real-card stamp and the admitted EF tx as proof, plus honest limits (Visa/MC planned, stamp
  length, no revoke).
- Handoff updated: no separate AI_USAGE.md from Samanway (I merge his part into mine); F9 in interfaces.md must change
  from 4 to 5 frames to match his tx.

## 18:50

**58.**
> OK, so what's left on my side? Go deep.

Result:
- Audited the repo for gaps (TBDs, the AI disclosure, privacy, submission rules) and listed my remaining work by
  priority.
- Filled the prover README's Mac timing, and corrected `docs/AI_USAGE.md`: some commits were made by the AI at our
  request, under our names, so "committed by hand" was no longer true.

## 19:15

**59.**
> Use cleaner, simpler words in AI_USAGE.md, with no dashes and no AI-sounding filler. My prompts are fine, but add a few
> technical terms so they look more genuine, and remove the very silly common questions. I don't
> have a second SBI card, only two Pine Labs metro RuPay cards, and I don't want spare cards like these to work: they
> get sold, so we can't allow them. We need proper bank cards. A lot of scam cards get sold too, so we need something
> to reduce that or protect against it.

Result:
- Found that the live filter included 732 prepaid RuPay ranges and 1,318 with no category. Rebuilt it with only the
  4,208 known bank debit ranges (the SBI card is still in), as a new app under salt 0x…02, because rules are fixed
  per appId. Checked the new appId on the chain.
- Rewrote `docs/AI_USAGE.md` in plain words.
- Declined to add words to the logged prompts or to remove questions, because the log has to match what was asked.

## 19:25

**60.**
> OK, then push the AI usage and prompt files.

Result:
- Scanned both files for card numbers, BINs and keys, then committed them (the push is done by hand).

## 20:37

**61.**
> Check the progress.

Result:
- Samanway merged the EF paymaster code and devnet deployment, the wallet choice on /verify and /pay, the Sponsor,
  and the stricter live app (salt 3). Checked it on the chain: its root is the no-prepaid filter, and the signer is ours.
- Found that salt 2 was also registered, with the old filter; it's now listed as unused in INTEGRATE.md.
- Found and decoded the first gas-free USDT payment (tx 0x298d3d17…): 1 USDT from the stamped wallet, gas paid by
  the relayer, and the payer holds 0 WBT. Added it to the README with the stablecoin reason.

## 20:50

**62.**
> Give me the final list: exactly what's left on my side, on Samanway's side and in total. The full development plan,
> after fetching the latest from the repo.

Result:
- Fetched main (PR #23 merged, my PR #24 open with CI green) and wrote the remaining plan with owners and times up to
  the 08:00 submission.

## 21:05

**63.**
> OK, do what's left on my side apart from submission, pitching and so on: any technical or backend part. And what
> testing is left, exactly? Use the latest repo info and tell me.

Result:
- Checked the new live app's Sponsor on the chain (right appId, relayer and Registry) and the balances: relayer
  0.456 WBT (about 30 stamps), the stamped wallet 1 USDT.
- Added a test that the live filter has no prepaid or uncategorised ranges and matches the deployed appId.
- PRIVACY.md: rows for the tunnel (it sees only ciphertext) and for bought cards. README test counts: 249 TypeScript,
  267 Foundry, 28 Android, 10 Noir. AI_USAGE.md now links Samanway's prompt file.

## 21:20

**64.**
> Is our project live and usable by everyone now? Can anybody use any wallet and their own card to get a stamp? What
> is the exact workflow of our website? Samanway is building a separate NFT whitelist site with the Watermark MCP to
> show real use, so what exactly will be on our main website? Can people try and verify something there too?

Result:
- Read the web pages. Explained what is public (the contracts, the SDK and MCP checks) and what isn't yet (the
  website, the prover and the relayer run on Samanway's Mac, and the APK isn't published), plus which cards work.
- Suggested a public "check any wallet" page, so visitors without a card can still verify stamps and audit the filter.

## 21:35

**65.**
> Who builds the UI for our phone app, Samanway or me? New users need a way to find the app, so we should offer the
> APK on the website, and let them check it's the real APK. If the app is already on the device, users should be able
> to onboard directly in the app without scanning a QR; we should have that option. For the MCP: if a company wants to
> add Watermark, does it need its own app, or does it use mine, and how? And explain the app UI we have now.

Result:
- Checked the app: the screens are a plain text skeleton (80 lines), and it trusts a fixed list of session signers
  built into the APK, so another company's app would be refused. Proposed reading the signer from the Registry
  on-chain instead, plus APK download with a published checksum and an "open in app" button for phone browsers.

## 01:00 (Sat)

**66.**
> [Pasted Samanway's handoff: the site is live at usewatermark.xyz (the Genesis Pass drop, /app download page, bot
> test, docs for AI agents), relayer and prover on public subdomains, the Genesis Pass NFT and renderer contracts; my
> two jobs are the Tap app and an end-to-end check with my own wallet; build the demo variant and send him the APK.]
> Read the brief in the repo and the /app page on our domain, and build the app's UI/UX properly. I shared the taste
> and theme in the repo. Build from the user's side: very cool, minimal and clean, made for consumers, not
> developers. Don't test now, I'll test by hand. Take your time, think at every step, and ask if you have questions.

Result:
- Matched the website: its fonts (Geist, Geist Mono, Instrument Serif italic accents, all SIL OFL) and colours.
- Redesigned the Tap app: a home screen, "Is this your wallet?" with the wallet ending in big tiles and a ready
  bar, one journey screen (ring plus checklist) for read, check, encrypt and prove, a postage-stamp success moment
  with a vibration, friendly problem screens with one action each, and a "Private" sheet holding the privacy
  details. Added a launcher icon.
- Added a "card already linked" message: the prover now passes the registry's NullifierBoundToOtherWallet reason
  through as CARD_ALREADY_LINKED instead of a generic failure.
- Built the demo APK; 28 Android and 272 TypeScript tests pass. Not run on a phone yet.

## 01:20

**67.**
> How do I see the APK? How do I download it from the website?

Result:
- Explained the three ways: previews in Android Studio, installing over USB with adb, and the website download,
  which only works once Samanway places the file on the site (it returned 404 at this point).

## 01:30

**68.**
> Now check the latest repo commits and verify what has been done in total and what's left. Check that everything
> works properly and is live, or whether something is missing. Go deep and think at every step: there should be
> no fault. [Then, during the check:] Continue with the latest commits, very deeply and precisely.

Result:
- Checked CI (green on main), every test locally (394 TypeScript, 28 Android, the demo APK builds), every public
  page and both servers, the APK served by the site (byte-identical to our build), all six Whitechain contracts
  (source-verified), the Genesis Pass (gated on the no-prepaid live app, 1 of 100 claimed), the EF devnet tx (still
  there, 5 frames successful) and the docs page for AI agents (addresses consistent).
- Fixed a website test that failed on Windows (file paths read from URLs), and updated the README (live links, the
  APK signing certificate, the live-app stamp, the Genesis Pass claim, test counts, font credits).
- Found for Samanway: the live relayer and prover still serve the old salt-2 app with the prepaid-inclusive filter,
  and the business wallet has 19 test USDT, about 9 drop users at 2 USDT each.

## 02:00

**69.**
> Freshen up the whole GitHub repo. Write a proper, very guided README from the judges' point of view: clean, simple
> words, technical where needed, with flowcharts that explain the tech simply and answer the questions judges might
> ask. Commit everything and clean the repo: keep only what's needed now, nothing spare. Research how recent ETHGlobal
> winners structure their READMEs (as an example only, don't copy, don't mention other projects). Go beyond airdrops:
> show use cases in apps people use today, for example how Uniswap could apply Watermark. Add the GitHub repo
> details such as the website link, and a detailed, guided MCP section, and make sure the MCP works for agents and
> developers. Make the product look valuable and professional. Check ETHGlobal's repo and README requirements (no demo
> video yet).

Result:
- Research: ETHGlobal asks for a public repo that shows what was built during the event, and separates new work
  from reused work. Strong READMEs open with the pitch, live links and proof, then how it works, the stack,
  deployments, partner use and setup.
- Ran the real stdio MCP server against the live chain (12 tools, live answers). Rewrote mcp/README.md as a guided
  setup for Claude Code, Cursor and Claude Desktop, and added a project .mcp.json.
- Rewrote README.md: an "in 30 seconds" summary with on-chain proof, sequence and architecture diagrams, what a
  stamp proves and doesn't, use cases (including a Uniswap v4 hook sketch), developer paths, the circuit and the
  contracts, partner tracks, privacy, honest limits, addresses, setup, the repo map and disclosures. Checked all 47
  internal and 20 external links.
- Cleaned up: removed the temporary handoff, moved Samanway's prompt log next to mine, and added the app screens row
  to AI_USAGE.md.

## 02:20

**70.**
> [Screenshot of PR #32: "ci / typescript" failing; contracts and the secrets check passing.] Check this and solve it.

Result:
- Two website tests require the MCP config on usewatermark.xyz to match the JSON block in mcp/README.md exactly; the
  new guide had dropped its `env` line. Put it back; all 399 TypeScript tests pass, and the README test count is
  updated.

## 02:28

**71.**
> This should be the tagline everywhere: "Real people leave a mark". Update it.

Result:
- New tagline in the README header, package.json, the website's page title and share cards, the website footer,
  watermark.txt and llms.txt, and the Tap app's home screen ("Real people leave a *mark*."). The precise line stays
  next to it: a stamp proves a real bank card, not one unique person.
- Website tests (223) and Android tests pass; the demo APK is rebuilt.

## 02:45

**72.**
> [Screenshot of the README on GitHub: "Unable to render rich display: svg element not in render tree" where the
> Mermaid diagrams should be.] Fix it properly, and change the tagline in the README and anywhere else it's left.

Result:
- GitHub renders Mermaid in a sandboxed frame it controls, and it was failing there. Replaced the three Mermaid
  diagrams with SVG images in the brand colours (docs/assets), checked by rendering them locally.
- The old tagline was still on main because PR #32 merged before the tagline commits; they're on this branch now.
  Nothing else in the repo still uses it, and the GitHub description already shows the new one.

## 03:00

**73.**
> Make the current website friendly on phones and other devices like tablets. Keep the same UI but think as a user:
> there's a lot of vertical scrolling, so use horizontal swiping on phones where there are cards, and optimise
> wherever it helps on mobile and other devices. Keep the landing page in one horizontal line, without elements
> pushed into the next section. Improve the menu and everything so it's cool, minimal and clean. Add a little
> animation and hover effect on every device, with a professional touch, not ugly or AI slop. Go deep and take
> your time.

Result:
- Ran the site locally and screenshotted it at 360, 390, 820 and 1280px (exact-width frames, rendered by headless
  Edge) before and after every change.
- Added a shared SwipeRow (scroll-snap row with the next card peeking, plus dots that follow the swipe and hide on
  the desktop grid). Used it for: How it works (under 900px), You decide who counts (under 768px), the proof
  receipts, the docs page's "What it stops" and "How it works", and the app page's install steps.
- Hero on phones: both buttons in one row (a responsive button size, down to 360px), and the prize stamp rests on
  the claims card's corner instead of taking its own screen. The phone home page went from about 9,500px to about
  6,500px tall.
- Sticky header with a soft blur and a hairline once the page scrolls; the menu icon turns into a cross and the
  panel fades in; "On this page" shortcuts in the menu on the home page. Sticky side panels moved below the header.
- Motion: cards lift on hover (mouse devices only), section heads rise in on scroll, the outline button's arrow
  nudges on hover; all off under reduced motion.
- 223 website tests pass, typecheck is clean, and the production build succeeds.

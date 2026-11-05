# Prompts · Samanway · session 1: alt mempool workshop and relayer sessions

- **Tool:** Claude Code (Claude Opus 5.5), in VS Code on the Mac
- **When:** Friday 6 Nov 2026, about 01:30–05:00 IST
- **Editing:** prompts are lightly edited for spelling and grammar, and the Hindi/Hinglish parts are translated into
  English. Long pastes (prize text, docs) are summarised in brackets. Later short follow-ups about running git
  commands and installing tools are left out.
- **What came out of this session:** `relayer/` (all files), the session helpers and test in `sdk/src/session.ts` and
  `sdk/src/session.test.ts`, the new settings in `.env.example`, the relayer lines in `.github/workflows/ci.yml`, and
  the "Devnet setup and funding" section of `docs/EF_ALTMEMPOOL.md`.

---

**1.** https://github.com/Prashant-Mishra-12569/watermark/blob/main/docs/PLAN.md — the PDF is attached. I have to start
building. My steps are:
1. Install the tools: Foundry, Node, Noir, bb, and Android Studio for the Compose previews.
2. Run the workshop steps outside the app.
3. Sign up for the tracks.

Tell me exactly what to build, what the docs say, and what matters. If I go and read everything myself it will take a
long time. We have to explain the project to the team: "look, this is what you're building, this is what you're doing,
this is your first step." We're building for the alt mempool track. You can read the PDF to see what's built and what
isn't. I have one screenshot you can see. The tools are installed. My part is the mempool workshop, steps 1, 3, 7 and 8,
as the PDF says.

> Result: read the plan, the interfaces and the workshop; explained the project and the first step; found that step 7
> needs step 6 first; tried to run the workshop (blocked by a permission prompt).

**2.** Use English to talk.

**3.** I changed the mode from auto to manual so I can really see everything, and you have to do it. Don't wait for the
due times: when everything is ready, we build now. I installed yarn and Foundry is installing right now. We'll work
together, and I'll give you permission.

> Result: cloned the workshop outside the repo and installed it. Step 1 failed because the devnet faucet was empty.

**4.** Yes, do it.

> Result: checked out the repo, built the relayer (`POST /session`, `GET /session/:id`, `GET /status/:wallet`) and the
> sdk session helpers, with tests.

**5.** What native token do we need from the alt mempool team?

**6.** ETH isn't available here, the faucet is empty. Read this. Do we have any other step?
[pasted: the ETHGlobal EF alt mempool prize description]

> Result: found the official devnet guide, which says to fund your own key once from the shared genesis account.

**7.** Ignore that. Read this from the ETHGlobal website, so we stay qualified. What other way can we try?
[pasted: the same prize description]

> Result: listed the options (ask the alt mempool team, ask another team, or run a local devnet) and noted that
> "code that submits one" also qualifies.

**8.** We're doing Whitechain and also this devnet. How are we going to add both to our project? And should I ask them
for the faucet?

**9.** Let's do this:
[pasted: the "Getting funds" section of the devnet guide, which says to fund your own key from the shared genesis account]

> Result: sent one 0.5 ETH transfer from the shared genesis account to our devnet key, then ran workshop steps 1, 3,
> 6, 7 and 8, which all passed. Switched the workshop to the endpoint that actually mines transactions.

**10.** Let's push. As planned, use several commits, with natural, human-sounding commit messages. Give them to me
here one by one and I'll run them. We also need to mention that we used the shared genesis account because there was
no faucet.

> Result: wrote the funding disclosure in `docs/EF_ALTMEMPOOL.md` and gave the git commands. Samanway ran all git
> commands.

**11.** Why so many commits? It looks fishy if we make them all at the same time.

> Result: cut the plan to 3 commits, and agreed to commit as we go from now on.

**12.** So, all of them together?

**13.** Are you sure these are safe to use now, and that the shared key isn't anywhere in the repo?

> Result: searched the repo and the workshop clone. No copy of the shared key and no private keys were found.

# web

**Owner: Samanway.** Spec section N; interfaces F1, F6, F7.

## Create the app
`create-next-app` needs an empty folder, so move this README out first and merge it back afterwards.
```sh
pnpm create next-app@latest . --ts --tailwind --app --eslint --src-dir --import-alias "@/*" --use-pnpm
pnpm add viem wagmi @tanstack/react-query qrcode.react @watermark/sdk@workspace:*
```
In `next.config.ts`, add `transpilePackages: ["@watermark/sdk"]`. Name the package `@watermark/web`.

## Pages
| Route | Job |
|---|---|
| `/` | Pitch: "Bots can't hold plastic." Buttons to the demo pages |
| `/verify` | Silent browser wallet → `POST /session` → big QR + `watermark://` link + the wallet's last 4 chars → poll `/status` → "Verified ✓" + explorer link |
| `/pay` | Gasless USDT: amount + recipient, signed in the background (EIP-3009) → `POST /pay` → explorer link showing the relayer paid gas |
| `/attack` | "Start bot attack": live counters (requests, refused, budget left), protection toggle, "estimated" label when it's off |
| `/sponsor` | App rules, TEST/LIVE badge, rules root, what a stamp reveals, budget and quota |
| `/dev` | Integration: contract call, SDK snippet, MCP config |

**Rules:**
- No trackers or analytics.
- The payer never sees gas, seed phrases or a chain picker.
- Import chains from `@watermark/sdk` (never viem's `whitechainTestnet`).
- On stage: 150% zoom, QR scannable from 30 cm.

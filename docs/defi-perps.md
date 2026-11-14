# Leash perps UI

`/perps` trades on **Orderly Network testnet**, broker `demo`, Arbitrum Sepolia (`421614`). All balances are test USDC. The server's Orderly key has `read,trading` scope and cannot withdraw.

The page supports existing guest sessions and connected NEAR wallets. New guests go to `/agent` to create an account and install its guard; the shared account provider does not install guards. Setup derives the EVM address, registers Orderly and requests its faucet when the balance is zero. The account panel labels NEAR Chain Signatures versus the server-derived fallback and links the address to Arbiscan.

## Requests and execution

- Markets: `GET /api/perps/markets`, every 10 seconds.
- Account balance and positions: `GET /api/perps/positions?account=<near id>`, every 15 seconds and after actions. A failed read keeps the last successful exposure visible, displays an error and disables new openings. Closing remains accessible.
- Setup: `POST /api/perps/bootstrap {auth}`, signing `{}`.
- Open: `POST /api/perps/order {symbol, side, notionalUsd, leverage, auth}`.
- Close: `POST /api/perps/close {symbol, auth}`, signing `{symbol}`.
- Close all: `POST /api/perps/close-all {auth}`, signing `{}`. Both close actions require a separate reduce-only preview and confirmation.

Guests use `signRequest(guest, ["leash_perp", actionDigest(payloadWithoutAuth)])`. Wallets use the existing `walletSignRequest` NEP-413 helper with the same parts, producing `leash_perp|<digest>|<timestamp>`. No private keys are sent to these APIs.

The ticket defaults to $30 notional and 2x leverage. It requires at least $10; the server applies market-specific minimums and rounds quantity down to its tick. Advanced mode permits up to 20x to demonstrate a real guard rejection. The default policy is max 5x leverage and $500 notional, enforced on-chain for guests and off-chain for wallets. The UI does not pre-block over-limit attempts.

The preview shows requested leverage, estimated quantity, margin, liquidation price/distance, funding and a 0.1% estimated taker fee. Liquidation uses the same simple formula as `perps-policy.ts`: move = `1 / leverage - 0.025`, long = `mark * (1 - move)`, short = `mark * (1 + move)`. This is an isolated-style **estimate**; Orderly uses cross margin, so collateral, other positions and fills affect actual leverage/liquidation. There is no automatic stop-loss. Policy caps do not cap losses or close exposure.

Execution displays an authorization → Orderly placement → accepted timeline. The API returns those confirmations together; the UI does not invent intermediate success or claim that an accepted request guarantees a fill. HTTP 409 bodies retain failed NEAR links and plain-language rejection reasons. An authorization rejection labels placement as skipped. Requests are never automatically retried, and duplicate submissions are disabled while pending.

Two small backend fixes accompany the UI:

1. `/api/perps/order` preserves `authTx` and `authId` when authorization succeeds but a later venue operation fails.
2. `/api/perps/positions` surfaces venue read failures instead of reporting a false zero balance and empty exposure.

## Verification · 14 November 2026

Commands, run in `/workspace/wt/perps`:

```text
npm run typecheck
✓ Types generated successfully; tsc exit 0

npm test
ℹ tests 32
ℹ pass 32
ℹ fail 0

npm run build:vinext
Build complete. (exit 0)
```

The build has existing vinext/RSC sourcemap, import-optimization and chunk warnings; they do not prevent a successful build.

Live read checks against the existing server at `http://localhost:3002` returned HTTP 200:

- `/api/perps/markets`: live BTC, ETH, SOL and other testnet marks/funding.
- `/api/perps/positions?account=g-zuf7rn.leash-11141537.testnet`: `registered: true`, `signerMode: "chain-signatures"`, `usdcBalance: 1000`, `positions: []`, `freeCollateral: 999.939931`.

The existing [`defi-perps-e2e.json`](./defi-perps-e2e.json) was read and left unchanged. **The slow faucet/e2e was not rerun and no new live orders were submitted in this UI task.** Prior live evidence:

- Guard authorization: [`5zEAh9jN4MUiSTUGPnk9FbJomVJEWq1TwwCX4aAe5Svb`](https://testnet.nearblocks.io/txns/5zEAh9jN4MUiSTUGPnk9FbJomVJEWq1TwwCX4aAe5Svb), Orderly open ID `3975163016`.
- Rejected 10x attempt: [`C9KPu6Et3re4HDVUZDNtoHCCR6WtjRSAXNQodM9iwbh7`](https://testnet.nearblocks.io/txns/C9KPu6Et3re4HDVUZDNtoHCCR6WtjRSAXNQodM9iwbh7), code `LEVERAGE`.
- Orderly close ID `3975163059`.

Playwright used the existing install in `/tmp/localagentpay-browser` and the supplied Chromium headless shell. Browser interaction checks used explicitly intercepted API fixtures (not live transaction evidence): setup payload and cryptographic guest signature, zero-balance blocking, 10/15-second polling, a submit-able 10x attempt, rejection receipt retention, pending duplicate prevention, success receipts, refreshed positions, individual close, close-all, and refresh-failure recovery. At 390 px with an open-position table, `document.documentElement.scrollWidth === 390`. Reduced-motion duration was effectively zero and no page errors were recorded. Temporary runner: `/tmp/localagentpay-browser/perps-ui.mjs`.

Live-data desktop and mobile screenshots were captured and visually inspected:

- `/workspace/shots/leash-wip-perps-desktop.png` (1440 px)
- `/workspace/shots/leash-wip-perps-mobile.png` (390 px)

To capture them again:

```sh
BASE=http://localhost:3002 PAGES=/perps MOBILE=1 FULL=1 PREFIX=leash-wip \
  node /tmp/localagentpay-browser/shot.mjs
```

Interactive external-wallet approval was not exercised in a real wallet. Setup can still take around 20 minutes for Orderly's faucet; the page continues polling. No push or Cloudflare deployment was performed.

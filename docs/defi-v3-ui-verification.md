# Leash v3 token and faucet UI verification

Local branch: `defi-agent`. No push or deployment was performed.

The UI uses the seven-token `SWAP_TOKENS` registry throughout swaps, including exact base-unit MAX, NEAR pairing, live quote pool IDs, output decimals, browser-owner cap upgrades, and the existing wallet co-pilot executor. Shared local logos cover staking, lending, balances, proposal cards, activity and perps. Portfolio USD estimates remain limited to NEAR and tUSDC.

The faucet dialog supports the current AccountProvider account, both guest and connected wallet. It displays live stock, real transfers, friendly skipped/cooldown results and explorer links. Entry points are the account controls, new-wallet banner, zero-balance widgets and portfolio. The gas faucet `https://near-faucet.io/` returned HTTP 200 with curl. The perps page explains the separate Orderly test USDC funding delay.

Bridge destinations come from the live 1Click catalog. All 25 matching routes passed $20 USDC dry quotes. The shared bridge validation catalog also had to be synchronized, including EVM address checks for BSC and Avalanche. The $25 cap, quote checks, mainnet badge and wallet signing/deposit flow are preserved. No edits were made to `lib/defi/server.ts`, `app/api/*` or `contracts/*`.

## Files changed

- Shared widgets and helpers: `components/leash/{TokenIcon,GetTestTokens,EnableTokenLimits,DefiWorkspace,ManagementDialog}.tsx`, `components/leash/{token-display,swap-model}.ts`, `components/leash/widget/Widget.tsx`.
- Account entry points: `components/account/{AccountControls,AccountProvider}.tsx`.
- Holdings, chat, activity and perps: `components/leash/{PortfolioPage,ActionPreview,ActivityFeed}.tsx`, `components/perps/PerpsPage.tsx`.
- Bridge: `components/leash/MainnetBridgePanel.tsx`, `components/integrations/BridgePage.tsx`, `lib/near/intents.ts` (`bridgeDestinations` only), `lib/bridge/validation.ts` (catalog/address allowlists).
- Styling: `app/{leash,widget}.css`.
- Tests: `tests/swap-pairs.test.ts`.
- Reproducible verification: `scripts/defi/{ui-v3-tokens-smoke,ui-v3-wallet-faucet,v3-bridge-routes,v3-verify-ui-receipts}.mjs` and the evidence files linked below.

## Command results

All three required commands completed with exit code 0 on the final implementation:

```text
npm run typecheck
✓ Types generated successfully
(tsc --noEmit exited 0)

npm test
ℹ tests 55
ℹ pass 55
ℹ fail 0

npm run build:vinext
Build complete.
```

The build still emits existing vinext sourcemap, barrel-import and route-classification warnings.

```text
node scripts/defi/ui-v3-tokens-smoke.mjs
V3 TOKENS UI PASS

node --env-file=.dev.vars scripts/defi/v3-bridge-routes.mjs
DRY QUOTES: 25/25 passed

node scripts/defi/v3-verify-ui-receipts.mjs
13 transactions FINAL; every receipt succeeded
```

The browser smoke initially encountered pre-hydration selectors and development reloads while source/evidence files changed. It resumed the same private browser fixture, completed the real transactions, and passed with progress evidence written outside the watched tree. `RESUME=1` reuses that fixture; keys are stored only under `/workspace/secrets/leash/`, never in these reports. No automatic transaction retry was added to the application.

## Real testnet receipts

Account: `g-8qijts.leash-11141537.testnet`.

| Action | Transaction |
| --- | --- |
| Guest creation | `3T1DSKS4gcg4e9bNRJgasoH7Fgin9716krKnGBSMnaeX` |
| Guard installation | `HwFm8wiWFQKRJkoYSojFFdb2eDFvJejur6kCESiwRou` |
| Enable USDT on an older policy | `HbxjHJsXcLMLj9JaQdqXdrHvZK1HfGGRJCR61pNDBmxe` |
| 0.05 NEAR → USDT, pool 1084 | `6FpDU59ENmAwkMVaXnpJfr1cMrjoKsBtG2rmXkhgARcf` |
| USDT → NEAR, pool 1084 | `EaMHQGnjhciQ9fZ7hvLCaCa73JgtRKvFmqGYpfUgoQyk` |
| Faucet tUSDC | `iCAz4WSN6njqCh7upeyaHJ6CZtuLj7BpniCVrCT1h8f` |
| Faucet USDT | `7K4F6UsHzmFiTub6yCJ77DZnYzZmRhcZz2pukBBCKYKR` |
| Faucet USDC | `EcXcN93NoTgh9LuxeZG9edo5iz2wpAzXsgJtdbYerAbJ` |
| Faucet PEM | `642cUxJ6m83pT1xnitVDZwPYN1j4Dsj6WizrNrHi5HCm` |
| Faucet LNC | `3C8TKeotauCQEN6APDTXvBBeeqQgepeEiDDVWi1kv1hz` |
| Faucet NST | `AVLFxaz1D9cvhNRnErJWVC3sG3qwsgrcC9E5tJ6d4TPV` |

Each hash above was independently checked through NEAR RPC. Both swaps had successful protocol receipts (50 and 36 receipts respectively). The old-policy check removed the USDT cap, used the UI's browser-owner update button to restore it, and checked that every other cap and the expiry were unchanged.

## Browser evidence and limits

- [Guest UI smoke](defi-v3-tokens-ui.json): real swaps and faucet, token search/pairing/MAX, explorer links, cooldown, live bridge preview, guest mainnet block, no browser errors.
- [Independent final receipts](defi-v3-ui-receipts.json).
- [Live bridge dry quotes](defi-v3-bridge-routes.json).
- [Connected-wallet branch](defi-v3-wallet-ui.json): an injected NEAR Connect test adapter selected real plain account `w-mwgpd73o.leash-11141537.testnet` over the saved guest. Requests hit the real faucet API. Already-funded results and repeated-claim rate limits were rendered correctly. An aborted image request also verified the initials fallback, including an error before hydration. This was an adapter test, not an external wallet approval.
- Screenshots: `/workspace/shots/v3tok-*.png`. Swap, stake, lend, portfolio, agent, perps and bridge were captured at 1440×900 and 390×844, checked for horizontal overflow, and visually reviewed. Additional shots cover faucet results, the connected-wallet dialog, the old-policy notice and searchable bridge chains. Tests used reduced motion.

Not exercised: a third-party wallet's interactive approval screen, a mainnet deposit, or a new perps fill. Existing backend/perps evidence remains in the repository. Mainnet transactions were outside this UI test; only dry bridge quotes ran. Push and deployment were intentionally omitted.

# Leash UI v2 · session A

Local branch: `defi-agent`. No push or deployment.

Changed the shared widget primitives, `app/widget.css`, root toast provider, PageFrame transition, SiteChrome pill navigation, collapsed CustodyFacts, reduced-motion support in NumberTicker, DefiWorkspace (Swap / Stake / Lend), ActionPreview, BridgePage, MainnetBridgePanel, and AgentApp. Primitive props are documented in `components/leash/widget/README.md`.

Server routes, execution libraries, contracts, LandingPage and AgentScene were not edited. Perps, Portfolio, Guardrails and Protocols page implementations remain session B's responsibility.

## Checks

- `npm run typecheck`: route types generated successfully; TypeScript exit 0.
- `npm test`: 46 tests, 46 passed, 0 failed.
- `npm run build:vinext`: `Build complete.` (exit 0; existing vinext sourcemap / barrel import / route classification warnings).
- `npm run dev:vinext`: local Vite on port 3001. `.dev.vars` copied from the authorized secret directory after `git check-ignore .dev.vars`; never staged.
- `node scripts/defi/ui-v2-widget-smoke.mjs`: `WIDGET UI SMOKE PASS`. Real guest + immutable guard, undo cancellation, stake, supply, withdraw, swap, unstake, intentional guard rejection, agent perps risk preview, quote-only bridge proposal, live Intents dry quote, guest mainnet block, both viewports with reduced motion. Public evidence: `defi-ui-v2-a.json`.
- `node scripts/defi/ui-v2-widget-review.mjs`: `FINAL UI REVIEW PASS`. Receiving-token selection, Escape/focus return, expandable route/contract details, mainnet chain search and token selection, real-money badge/cap/wallet gate, mobile navigation, above-fold Agent composer and reduced-motion CSS. Evidence: `defi-ui-v2-a-review.json`.
- Independent NEAR `tx` RPC reads verified all eight recorded hashes at `FINAL`: seven successes and the expected `CAP_PER_ACTION` failure. Receipt-level failures checked, not only top-level status. Full results: `defi-ui-v2-a-rpc.json`.
- Screenshot command: `BASE=http://localhost:3001 PREFIX=leash-ui-a-final PAGES=/swap,/stake,/lend,/bridge,/agent MOBILE=1 node /tmp/localagentpay-browser/shot.mjs`. Inspected 1440×900 and 390×844 captures; no horizontal overflow. Mainnet card, picker, route expansion and connected execution screenshots were also captured and inspected under `/workspace/shots/leash-ui-a-*`.

## Confirmed transactions

Account: `g-02rsgr.leash-11141537.testnet`.

| Action | NEAR testnet receipt |
| --- | --- |
| Create guest | [Dg6qRo5WdFbDY3ez8SogyCRC9cprNfjiHLv4X5BPyJg6](https://testnet.nearblocks.io/txns/Dg6qRo5WdFbDY3ez8SogyCRC9cprNfjiHLv4X5BPyJg6) |
| Install guard + limited key | [C11AJgTTjTaJhfo7mRGSXmXpr9YBjHDgwJu3yyAafg7G](https://testnet.nearblocks.io/txns/C11AJgTTjTaJhfo7mRGSXmXpr9YBjHDgwJu3yyAafg7G) |
| Stake 0.02 NEAR | [9329eKcqL8MwY52kGacdRxx3NZoiXw8oqe3BaFXMqXQY](https://testnet.nearblocks.io/txns/9329eKcqL8MwY52kGacdRxx3NZoiXw8oqe3BaFXMqXQY) |
| Supply 0.02 wNEAR | [4hxnsyFe4CehQAKBva19gedkaUCTHxBpyBZTctbu1cVL](https://testnet.nearblocks.io/txns/4hxnsyFe4CehQAKBva19gedkaUCTHxBpyBZTctbu1cVL) |
| Withdraw 0.01 wNEAR | [5ye878zpAHkwnpNYPWqZajDvZmcjipWxsFCYPsFC2dnc](https://testnet.nearblocks.io/txns/5ye878zpAHkwnpNYPWqZajDvZmcjipWxsFCYPsFC2dnc) |
| Swap 0.01 NEAR | [B7GjjCfCQYMwuDS1PLnFcsL4AtqPdFMHoUJ2tRf8B95u](https://testnet.nearblocks.io/txns/B7GjjCfCQYMwuDS1PLnFcsL4AtqPdFMHoUJ2tRf8B95u) |
| Unstake 0.005 NEAR redemption units | [7aHY5CdExV7G4iLLVHvMnM8tCNYcG16sms17vnHrkXCR](https://testnet.nearblocks.io/txns/7aHY5CdExV7G4iLLVHvMnM8tCNYcG16sms17vnHrkXCR) |
| Expected over-cap rejection | [H9DJ9uqPk9K6qGgynBttTPbs4mx6XB5CVkR75gagip33](https://testnet.nearblocks.io/txns/H9DJ9uqPk9K6qGgynBttTPbs4mx6XB5CVkR75gagip33) |

## Limits of verification

No real-money mainnet deposit or external wallet co-pilot signature was submitted. Mainnet review, picker, cap display, guest block and existing wallet/cap unit tests passed. Bridge status/deposit tracking still uses the original persistence, duplicate-deposit lock, APIs and signing code; its new timeline was not exercised with a real mainnet deposit. Perps proposal rendering was verified without submitting an Orderly order in session A.

An initial browser run closed unexpectedly after onboarding; its public guest/install receipts were superseded by the complete successful run above. The later review caught and fixed the generic rejection heading, receiving-token selection, focus return and unavailable-APR skeleton state.

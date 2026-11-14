# Leash authority and limits

- The browser keeps the guest full-access key. It installs the published guard and can sign `set_policy`, pause/resume and revoke. Never clear browser storage without preserving guest access.
- The server's function-call key is installed with receiver=self, methods `agent_execute,authorize_perp`, and a 0.5 NEAR gas allowance. It cannot directly transfer, deploy, change policy or delete keys. Guard-mediated swaps, staking, supplies and withdrawals return positions/assets to the user's own account.
- Guard policy enforces asset per-action/daily caps, protocols, pause, expiry and perp leverage/notional. Ref enforces the submitted positive minimum output. The quote adapter computes it from live output less policy-bounded slippage; the guard does not contain a market-price oracle.
- The immutable global code hash identifies a version. The user's owner key remains able to select different code. Global deployment: https://testnet.nearblocks.io/txns/DFDDLVn8UTdaak4ipLHc5sQTDzgdE1dEYrm49UQyftyg .
- Pause is an owner-signed on-chain policy action. It stops unissued steps; already issued receipts cannot be cancelled. Revoke deletes the agent function-call key on-chain. Neither closes perps or withdraws supplied/staked assets. Close-all-perps is a separate reduce-only action.
- Orderly exposure requires server-verified authorization from the guest guard before a request reaches the exchange. The server retains read/trading credentials. Those keys cannot withdraw. Chain Signatures owner derivation and a labelled server-derived fallback are supported by the perps service. This is a prototype server trust boundary, not a TEE.
- Wallet co-pilot signs protocol transactions directly. Its default limits and browser-local daily usage are off-chain checks, not externally enforceable permission boundaries; clearing browser state resets that local accounting.
- Caps limit spending and new exposure, not trading losses. Liquidation estimates shown before an order are arithmetic approximations, not guarantees; actual cross-margin liquidation depends on total equity, maintenance margin, funding and exchange execution.
- Mainnet bridge execution requires a separate user-owned wallet and explicit review. The $25 cap includes route fees plus conservative gas/storage reserve on both client and server. No mainnet key or user deposit is held by the Leash server.

“Prove it” requests 0.9 NEAR against the default 0.5 NEAR per-action cap. The resulting CAP_PER_ACTION transaction is a real testnet failure and still consumes testnet gas. Rejected attempts are saved locally with their transaction hashes; the successful guard log cannot retain panic writes.

## Verified live on the deployed site

- Over-cap stake (0.9 NEAR vs 0.5 NEAR per-action cap) rejected on-chain with `CAP_PER_ACTION`: [Hzq1vY3v…](https://testnet.nearblocks.io/txns/Hzq1vY3v7LPUdXq5KsuZM5a6f28RHDEPABWLo7SNMsfB)
- 10x perp rejected on-chain with `LEVERAGE` before any Orderly order: [5owbKorr…](https://testnet.nearblocks.io/txns/5owbKorrwSVNU6zmYeTKewDMqhXjqoA9t74wX182duho)
- Owner-signed pause [DRMXtp68…](https://testnet.nearblocks.io/txns/DRMXtp68zHkZfWXbPcnw4mrSEh4xD2amezny3JjnqCtr), policy edit [2tfxveFE…](https://testnet.nearblocks.io/txns/2tfxveFEVmaCihJ3EbJSEPqxq2nQ2GsBySAMsumZJA9U), and revoke [GF7YTNWe…](https://testnet.nearblocks.io/txns/GF7YTNWeSSPZpJWvQwzk8tmZcCZmmm1Qi2Amv22WwpZP) (agent key deleted; later agent calls fail).

# Leash guard (Testnet)

The owner deploys this contract onto their own NEAR account. Their full-access key controls policy, pause, upgrades and revocation. The agent receives a function-call key restricted to that same account and exactly `agent_execute,authorize_perp`. Agent calls attach no deposit; the guard funds approved protocol calls from the account's balance.

Actions use internally tagged JSON, for example:

```json
{"action":{"kind":"LinearStake","amount":"200000000000000000000000"}}
```

`RefSwap`, `BurrowSupply`, `BurrowWithdraw`, `LinearStake` and `LinearUnstake` use base units. `perp_usd` uses whole dollars. wNEAR inputs and liquid staking debit the shared `near` cap; wNEAR withdrawals debit `wrap.testnet`; unstaking debits `linear-protocol.testnet`. Burrow withdrawals remain in the user's account. They cannot target an arbitrary recipient.

Daily windows use `timestamp_ms / 86400000`. Policy changes preserve spend. Attempts reserve their entire amount before cross-contract execution, including attempts whose protocol receipts fail. This intentionally favors conservative limits over asynchronous refunds. A single operation runs at a time, preventing overlapping token balance checks. Callbacks stop unissued steps after pause, expiry or revocation; already-issued protocol receipts cannot be cancelled.

Ref uses the working instant-swap message (`force:0`, `skip_unwrap_near:true`, `actions:[...]`), registers Ref/token storage and verifies that output reached the same account. Storage deposits are bounded at 0.1 NEAR per call. wNEAR storage is registered before wrapping, because its first `near_deposit` otherwise subtracts storage from the minted amount. Existing wNEAR is reused; only a shortfall is wrapped. Stake/wrap/storage reservations preserve at least 0.3 liquid NEAR after the account's storage requirement.

The contract requires a positive swap minimum. The server must compute it from a fresh quote using `max_slippage_bps`; the contract has no price oracle and cannot prove the server's quote or slippage calculation. Ref enforces the supplied minimum. Perp authorization returns an id and enforces venue, caps, leverage and notional; it does not execute an Orderly order or guarantee that an off-chain service honors an id.

The last 50 activities report `PENDING`, `COMPLETED` or a failure reason; `ok` becomes true only after protocol completion (and output delivery for swaps). Panics roll back state, so rejected cap/leverage attempts appear in failed transaction receipts rather than the activity ring. UIs should combine receipts with this ring. Failed protocol attempts retain their cap reservation. If Ref ever falls back to an internal deposit instead of direct delivery, activity reports `OUTPUT_NOT_DELIVERED`; the full-access owner can recover directly from Ref. Caps bound authorized action sizes, not losses on existing positions.

## Build and verify

From the repository root:

```sh
cargo test --manifest-path contracts/guard/Cargo.toml
cargo near build non-reproducible-wasm --manifest-path contracts/guard/Cargo.toml
npm test
npx tsc --noEmit
node scripts/defi/deploy-guard-global.mjs
npx tsx scripts/defi/e2e-guard.ts
```

WASM: `contracts/target/near/guard/guard.wasm`. Global publication is immutable by code hash and costs 0.0001 test NEAR per byte on the verified network. The publication script can fund root from only the designated Leash reserve accounts and preserves guest funding. It skips an already-recorded matching hash.

For a pre-publication protocol check, use `npx tsx scripts/defi/e2e-guard.ts --preflight`: the unpublished hash fails `UseGlobalContract`, then the script funds storage and exercises the plain deployment fallback. `--resume <preflight-guest>` upgrades that disposable preflight's WASM while retaining its previous evidence and successful stake. Normal runs always create a fresh guest. The canonical successful run must use the published global contract.

`installGuardActions(agentPublicKey, policy, accountId, options?)` needs the account id because NEAR access-key receivers must be absolute. Pass `options.fallbackWasm` to build the plain-deploy retry. Keep all actions in one owner-signed transaction to `accountId`. Both install variants preserve the owner's existing full-access key.

Public receipts and balances go to `docs/defi-e2e.json`; all prior runs are retained. Guest private keys go only to `/workspace/secrets/leash/e2e-guests.json` with mode 0600. A post-revoke signed transaction is submitted and rejected by RPC because its access key no longer exists. Its hash is identified as *not included on chain*; it must not be displayed as a confirmed transaction.

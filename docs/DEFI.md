# Leash architecture

`lib/agent/actions.ts` defines the strict intent union. NEAR AI Cloud returns tool arguments; malformed output tries the backup model and then deterministic rules. Explicit parsed sizes survive model refusals or reductions. `/api/agent` prepares readable proposals using current LiNEAR, Ref, Burrow or perps market data. Policy prechecks explain refusals; the execution API intentionally leaves guard-limit enforcement to the contract so a user can inspect a real rejection.

`components/leash/ActionPreview.tsx` is shared by the protocol pages, agent, bridge and owner policy review. It shows deltas, economics, applicable limits, timestamps, mode/network, expandable calls and status. Confirmed guest proposals have a three-second Undo interval. Expired quotes cannot execute. Requests are serialized per account in the browser. Local history preserves rejected tx hashes because contract panics roll back activity writes.

`hooks/useDefiState.ts` coalesces state requests across components, polls every eight seconds, and refreshes after writes. Protocol state uses `get_account`, `get_asset`, `ft_balance_of`, `ft_price`, and the guard's views. Market rates come from live Burrow `get_asset` calls. Portfolio estimates use the live LiNEAR rate and Ref pool reserves. Test USDC is treated as $1 only for an explicitly labelled estimate; perps equity, historical fees, realized PnL and non-wNEAR lending markets are excluded from this total.

`lib/defi/copilot.ts` builds unsigned direct protocol calls. It handles wrap deficits, conditional storage registration, Ref token registration and the same instant-swap message/minimum as the guard. Wallet mode checks default policy off-chain and records local daily spending. Direct wallet signatures are necessary for every protocol transaction; no guard is installed on that wallet.

Perps integration uses only `/api/perps/{bootstrap,markets,positions,order,close,close-all}` and signed `leash_perp|digest|timestamp` authorization. Missing routes degrade to “Perps unavailable.” Market orders are described as accepted requests until the exchange's positions/fill data confirms the result. The faucet can take about twenty minutes. No automatic stop-loss watcher is included.

Unstaking requests NEAR redemption units through LiNEAR `unstake`. The protocol controls epoch unlock; the owner completes the later `withdraw` directly with LiNEAR. Borrow/repay and automatic strategies are outside this build.

## System map

```
Browser (Next.js on Cloudflare Workers via vinext)
  ├─ /agent      NEAR AI planner → action preview → 3 s countdown → execute
  ├─ /swap /stake /lend   guard path (agent key) or wallet co-pilot
  ├─ /perps      Orderly testnet via /api/perps/*
  ├─ /portfolio /guardrails   state, policy editor, pause, revoke, close-all
  └─ /bridge     NEAR Intents 1Click, mainnet, user wallet signs, $25 cap
Worker API
  ├─ /api/defi/{state,quote,execute}   execute = agent signs agent_execute as the guest account
  ├─ /api/perps/{bootstrap,markets,positions,order,close,close-all}
  └─ /api/bridge/*                     quote / status only, no keys
NEAR testnet
  ├─ guard (global contract) on each user account
  ├─ ref-finance-101.testnet (pool 2973), contract.burrow.testnet, linear-protocol.testnet
  └─ v1.signer-prod.testnet (Chain Signatures → EVM address for Orderly)
Orderly EVM testnet (chain 421614, broker demo)
```

## Protocols

| Protocol | Contract / endpoint | Action |
|---|---|---|
| Ref Finance | `ref-finance-101.testnet` pool 2973 | swap wNEAR ⇄ tUSDC |
| Burrow | `contract.burrow.testnet` | supply (ft_transfer_call), withdraw (execute) |
| LiNEAR | `linear-protocol.testnet` | deposit_and_stake / unstake |
| Orderly | `https://testnet-api.orderly.org` | market orders, positions |
| Chain Signatures | `v1.signer-prod.testnet` | derive EVM address, sign EIP-712 registration |
| NEAR Intents 1Click | 1click.chaindefuser.com (mainnet) | bridge quote + deposit |

## Perps flow

1. `bootstrap`: derive the EVM address with Chain Signatures (falling back to a server-derived key if MPC is slow), register an Orderly account, add an ed25519 trading key, and request faucet USDC (testnet only; it can take ~20 min).
2. `order`: size the order, check off-chain, call guard `authorize_perp` on-chain (rejects over leverage or notional), then place the Orderly market order.
3. `close` / `close-all`: reduce-only market orders.

## RPC resilience

Cloudflare Workers share egress IPs, so free NEAR RPCs sometimes answer 429 for traffic that is not ours. All server reads and agent writes go through `lib/near/rpc.ts`: reads fail over across FastNEAR, dRPC, Intear and rpc.testnet.near.org; signed writes are retried with backoff only when every RPC refused them with a rate limit (so a transaction can never be sent twice).

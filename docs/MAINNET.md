# Mainnet support and deployment

Leash supports NEAR testnet and mainnet in one web deployment. Use the **Testnet / Mainnet** switch beside the logo. Selection persists in browser storage. Switching reloads the application, discarding unconfirmed proposals and wallet objects. Every app API request carries its selected network; server handlers use `AsyncLocalStorage`, never a mutable global network.

## Feature behavior

| Feature                            | Testnet                                       | Mainnet                                                                                            |
| ---------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Swap                               | Existing seven demo tokens                    | NEAR ↔ native USDC (pool 4512); NEAR ↔ USDT (pool 3879)                                            |
| Stake / unstake                    | LiNEAR testnet                                | `linear-protocol.near`, wallet-signed                                                              |
| Supply / withdraw                  | Burrow testnet                                | `contract.main.burrow.near`, wallet-signed wNEAR                                                   |
| Perps / charts / positions / close | Orderly testnet and starter faucet            | Orderly production API, separate broker and Chain Signatures configuration; funded margin required |
| Agent                              | Planner and proposals                         | Same planner with mainnet tokens, protocol addresses and network-bound signatures                  |
| Wallet limits                      | Off-chain checks                              | Same off-chain checks, isolated from testnet policy and spending                                   |
| Autonomous guest / faucet          | Browser-owned practice account and test funds | Unavailable; mainnet requires a funded wallet                                                      |
| Guard contract                     | Published testnet artifact                    | Separate `mainnet` Rust feature; publication pending                                               |
| Bridge                             | Existing explicit mainnet bridge              | Same independent wallet-signed mainnet bridge, existing $25 cap                                    |

Testnet-only tokens are not representations of mainnet assets. On mainnet USDC/USDT use 6 decimals. Wallet mode retains the existing co-pilot behavior: the wallet signs protocol calls and its limits are off-chain. Publishing a global guard **does not** install it on an existing wallet, turn wallet limits into on-chain enforcement, or provision a mainnet autonomous guest service.

## Deployment account

The requested publication account is `jjhkhkl.near`. A read-only mainnet RPC check on 15 November 2026 found this account with a balance of **1 yoctoNEAR**, which cannot fund deployment or transactions. No mainnet transaction has been sent by this change. The mainnet deployment manifest deliberately leaves the guard hash and publication receipt empty until publication succeeds.

## Configuration

Existing unprefixed server secrets continue to mean **testnet**. Optional `TESTNET_` overrides are supported. Mainnet never falls back to those credentials.

Configure these as local environment variables or Cloudflare Worker secrets (not in git or chat):

- `MAINNET_CHAINSIG_ACCOUNT_ID` and `MAINNET_CHAINSIG_PRIVATE_KEY`: the funded NEAR account calling `v1.signer` for Orderly. The MPC-derived EVM trading account follows the existing service-owned signing model.
- `MAINNET_ORDERLY_DERIVE_SECRET`: a separate random secret for read/trading-scoped Orderly keys. Preserve it between deployments.
- `MAINNET_ORDERLY_BROKER_ID`: a production broker ID accepted by Orderly. The testnet `demo` value is not assumed to work on mainnet.
- `MAINNET_NEAR_RPC_URL`: optional mainnet RPC endpoint.
- `MAINNET_RELAYER_ACCOUNT_ID` and `MAINNET_RELAYER_PRIVATE_KEY`: used locally for global guard publication. This change does not enable mainnet guest sponsorship.

Mainnet perps use Chain Signatures only. They do not silently fall back to a server-derived EVM private key. Setup returns the Orderly account ID and derived address; fund its **Orderly margin account** through a supported Orderly deposit flow before opening positions. Sending USDC directly to the derived address does not credit Orderly margin. A deposit/withdrawal UI is outside the existing testnet feature set and has not been added here.

## Build and publish the guard

Install Rust and the WASM target, then build to a separate directory so the existing testnet artifact cannot be overwritten:

```sh
rustup target add wasm32-unknown-unknown
cargo test --manifest-path contracts/guard/Cargo.toml
cargo test --manifest-path contracts/guard/Cargo.toml --features mainnet
cargo build --manifest-path contracts/guard/Cargo.toml \
  --release --target wasm32-unknown-unknown --features mainnet \
  --target-dir contracts/guard/target/mainnet
npm run mainnet:guard:preflight
```

Preflight is read-only. It reports the WASM hash, storage publication estimate, available balance and whether the account is funded. Global publication currently costs 0.0001 NEAR per byte; the script also retains one NEAR for gas and later transactions. Fund the account based on the actual artifact size. The script rejects a testnet artifact.

Once funded, supply signing credentials securely in the local environment and run:

```sh
npm run mainnet:guard:publish
```

This sends a real mainnet transaction and writes the successful hash and receipt into `lib/near/deployment.mainnet.json`. Review and commit that manifest before rebuilding the web app. Do not reuse the existing testnet deployment script, which contains testnet reserve-funding logic.

## Publish the web app

The repository's existing hosting is Cloudflare Workers:

```sh
npm ci
npm test
npm run typecheck
npm run build:vinext
npm run deploy:vinext -- --skip-build
```

Set production Orderly/Chain Signatures secrets in the Worker before enabling trading. Build and preview the branch first. The current work must not replace the live testnet site until the intended branch is reviewed and deployment credentials are available.

## Verification before release

1. With no wallet connected, switch testnet → mainnet. Confirm the mainnet badge, USDC/USDT picker and absence of guest/faucet buttons. Reload and navigate between pages; mainnet must persist.
2. Switch back to testnet. Confirm the existing guest remains available and mainnet policy/receipts do not appear there. Two tabs may select different networks without affecting in-flight requests.
3. Connect a mainnet wallet. Verify its account, balance, explorer links and signatures refer to mainnet. Preview a small swap, stake and supply; confirm receivers and amounts in the wallet before signing. Verify receipts and resulting balances after each funded operation.
4. Configure the production Orderly broker and signing service, register an account, fund its Orderly margin balance, then open and reduce-only close a small position. Verify order IDs against the production API. No faucet or reserve transfer may run on mainnet.
5. Keep mainnet guest sponsorship unavailable. Wallet limits remain explicitly labeled off-chain. A published guard is a separate artifact and requires an owner-authorized installation before it enforces any policy.

Automated coverage includes concurrent server network scopes, cache separation, real mainnet receivers and token units, network-bound authorization, rejection of invalid networks, and blocking every testnet funding entry point on mainnet. Live signed transactions require funding and wallet access and cannot be inferred from passing unit tests.

## Verification evidence for this branch

- 101 TypeScript tests passed, including network concurrency and funding isolation.
- 42 Rust guard tests passed with the default feature set and 42 with `--features mainnet`.
- Mainnet WASM compiled successfully: 518,424 bytes before any external optimization. Read-only publication preflight estimated 51.8424 NEAR storage plus a 1 NEAR reserve; `jjhkhkl.near` is not funded for it.
- Cloudflare production build passed. Its local Workerd preview could not reach remote RPCs in this managed environment. A Node preview using the environment's HTTP proxy returned live mainnet Ref quotes, LiNEAR/Burrow proposals, and 73 production Orderly markets and passed browser toggle, persistence and route-navigation checks with zero page errors.
- Signed mainnet execution and production perps funding/trading are pending; no transaction was broadcast. Cloudflare deployment credentials and the mainnet service secrets are absent from this workspace.

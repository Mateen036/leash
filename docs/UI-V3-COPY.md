# Leash v3 copy and clarity verification

Local branch: `v3-copy`. No push or deployment.

## Changes

- Short page headings, one-line introductions, clear action verbs, and collapsed secondary copy across all ten routes.
- Removed rendered JSON and contract method names from previews, onboarding, timelines, and protocol cards. Proposal source labels are translated in the UI, leaving the separately owned planner unchanged.
- Shared friendly errors cover notices, toasts, rejected proposals, timelines, account setup, bridge, portfolio, and perps. Unknown errors use a collapsed Details disclosure with diagnostic redaction.
- Account IDs are shortened and copyable. Amounts have at most four decimal places and thousands separators. Tiny nonzero amounts display a less-than threshold.
- Fixed NEAR Connect to the current repository, verified through npm metadata and curl. Protocol information links use official documentation. Full results and the service/explorer exceptions are in [link-check.md](link-check.md).
- Fixed a home-page hydration mismatch with reduced motion. Kept the dark theme, Motion, scene, network badges, and Pause/Revoke/Close-all controls.
- Updated selectors in the existing browser smoke scripts to match the new labels. No changes under `lib/defi/`, `lib/agent/`, `app/api/`, or `contracts/`. DefiWorkspace changes are presentation only.

## Command results

| Command | Result |
| --- | --- |
| `npm ci` | Installed successfully |
| `npm run typecheck` | Passed; route types generated; no TypeScript errors |
| `npm test` | 81 tests, 81 passed, 0 failed |
| `npm run build:vinext` | Build complete |
| `git diff --check` | Passed |
| `node scripts/defi/check-links.mjs` | Every extracted URL checked with HEAD and GET fallback; see link-check.md |
| `node scripts/defi/ui-v3-copy-states.mjs` | 60 states passed across 1440px and 390px; no overflow or raw-code matches |
| `node scripts/defi/ui-v3-copy-controls.mjs` | Real guest creation, guard installation, Pause, Resume, policy change and Revoke passed; resulting on-chain state checked |
| `PERPS_ONLY=1 OUT=docs/defi-ui-v3-copy-perps.json node scripts/defi/ui-v2-management-smoke.mjs` | Real 2× ETH long filled; 10× attempt rejected on-chain; Close-all left zero positions |
| `node scripts/defi/ui-v2-widget-review.mjs` | Picker, focus restoration, mainnet quote cap, mobile navigation and reduced-motion checks passed |

Browser commands used `BASE=http://localhost:3006` and `CHROME=/usr/bin/google-chrome`. The dev server was started with `npm run dev:vinext -- --host 127.0.0.1 --port 3006` and the gitignored `.dev.vars`.

Screenshots were captured with `BASE=http://localhost:3006 PREFIX=/workspace/shots/v3copy- node /tmp/localagentpay-browser/shot.mjs`, repeated with `MOBILE=1`. All 20 page screenshots were opened and inspected. See [page screenshots](defi-ui-v3-copy-shots.json), [60 state checks](defi-ui-v3-copy-states.json), and [widget review](defi-ui-v3-copy-review.json). The state audit injects HTTP failures and delayed reads to check errors/loading; it never fakes successful transactions or fills. Connected balance checks read a real public account in a session that cannot sign.

## Testnet receipts

The first full UI smoke completed stake, supply, withdraw, swap, unstake, an over-limit rejection, policy controls and Revoke. Its initial Resume receipt selector reused a stale href; the separate owner-controls run below verifies distinct Pause and Resume hashes. Later full-smoke retries encountered testnet API response timeouts, saved in [retry evidence](defi-ui-v3-copy-retry.json). These timeouts are not represented as confirmed UI success. The final state audit, owner-controls run, and real perps run all passed on the final copy.

Orderly open order: `3975241059`; close order: `3975241670`. Live positions were empty after closing.

| Action | Transaction hash |
| --- | --- |
| Protocol smoke · created | `6VwTXoJ4xGGQt8kbU4xv3cWdhYMcHmMR9XFuvDakSs7w` |
| Protocol smoke · install | `7Tod7nMywKYB8kzZvmw6iraXMiVSPKyZZGXMMozmBfM5` |
| Protocol smoke · stake | `BZf8rmUXRVuPJu6dsQFBVS3aoVmaMUhU8mZu4CNyRGrv` |
| Protocol smoke · rejected | `9k7geibShD9QZ22Ca4X8iyEr6qsy8jTrGLFJaXQypac` |
| Protocol smoke · supply | `6X4kPA6YP4MyWLsg3sUyqHQsBSrhPKpethdzcvA92ijq` |
| Protocol smoke · withdraw | `EGe5N984PceBuVJRUEY3mZFnKbx9JcQid1KSwjxp1Uhn` |
| Protocol smoke · swap | `cgWZccoarAXufRX79j4X6RPrg671bXm5TKRXTVmSwfa` |
| Protocol smoke · unstake | `4JDAotEyCgknUmUXnTGKjWteyCYwBRQHLGjR8RpiR97a` |
| Protocol smoke · pause | `24ENvsWzGHYQdbJN9JeG3ktC6iHP1TdbQAeinRwqqcxV` |
| Protocol smoke · setPolicy | `C7bDgpmAXyPDG7eUvQg69w1eYGKqaMugJBiCLnzDQyp5` |
| Protocol smoke · revoke | `CkLGh7U6BZ7LT3UzUmq55rSyzaPcnNvraqGVtJQE3KYM` |
| Owner controls · create | `HekUZLs2DjRiiYv3sJur862wioHRC3rUK7Ew9nm49Xps` |
| Owner controls · install | `9nooLQte9HWbjwVfSuwQnZ6X4DymgrEJk9myEVeAeQaU` |
| Owner controls · pause | `ERnufmmeomDuL5B6bZcbTPvJ34yZ1Hqz5bU53D8u2LH4` |
| Owner controls · resume | `7tAPg2u3KGc4xS7BhgdiG8EB22zMnM49gqL3sGfTT28A` |
| Owner controls · policy | `FGuDxjatuMNKKzyUQZjQTmzwpm1DhTVWX91BzcPdjYtZ` |
| Owner controls · revoke | `DoFcAEopuH9Ax9dnXLfwmoqCF6EgozrxcCZT5A11geJR` |
| Perps · perpOpen | `hHahjPqbtsGsNJL1fDxo9gNS3u1DQXdNwFQTPRfpMzv` |
| Perps · perpRejected | `8j3142qAUR4nCLhmGuDSSqwrqJ2m4cvEsCkdFoMA6Skf` |

See [protocol evidence](defi-ui-v3-copy-smoke.json), [owner controls](defi-ui-v3-copy-controls.json), [perps evidence](defi-ui-v3-copy-perps.json), and [independent RPC receipt verification](defi-ui-v3-copy-receipts.json).

## Limits of verification

- No real wallet signature or mainnet transfer was performed. Both real wallet selectors and the mainnet cap/consent UI were inspected.
- Curl cannot access some explorer pages (403); exact receipt links were retained. RPC receipt verification is recorded separately. POST/authenticated APIs correctly reject plain GET/HEAD and were preserved.
- Backend changes, token-registry expansion, publishing, deployment and pushing are outside this copy pass.

## Files changed

- `README.md`
- `app/widget.css`
- `components/AgentApp.tsx`
- `components/IntegrationProposal.tsx`
- `components/LandingPage.tsx`
- `components/SiteChrome.tsx`
- `components/account/AccountControls.tsx`
- `components/account/AccountProvider.tsx`
- `components/integrations/BridgePage.tsx`
- `components/kokonutui/action-status.tsx`
- `components/leash/AccountId.tsx`
- `components/leash/ActionPreview.tsx`
- `components/leash/ActivityFeed.tsx`
- `components/leash/CustodyFacts.tsx`
- `components/leash/DefiWorkspace.tsx`
- `components/leash/ErrorNotice.tsx`
- `components/leash/GuardControls.tsx`
- `components/leash/GuardrailRing.tsx`
- `components/leash/GuardrailsPage.tsx`
- `components/leash/LeashSteps.tsx`
- `components/leash/MainnetBridgePanel.tsx`
- `components/leash/PortfolioPage.tsx`
- `components/leash/ProtocolsPage.tsx`
- `components/leash/display.ts`
- `components/leash/friendly-error.ts`
- `components/leash/widget/ToastProvider.tsx`
- `components/leash/widget/Widget.tsx`
- `components/perps/PerpPreview.tsx`
- `components/perps/PerpsPage.tsx`
- `components/perps/model.ts`
- `components/ui/number-ticker.tsx`
- `docs/UI-V3-COPY.md`
- `docs/defi-ui-v3-copy-controls.json`
- `docs/defi-ui-v3-copy-perps.json`
- `docs/defi-ui-v3-copy-receipts.json`
- `docs/defi-ui-v3-copy-retry.json`
- `docs/defi-ui-v3-copy-review.json`
- `docs/defi-ui-v3-copy-shots.json`
- `docs/defi-ui-v3-copy-smoke.json`
- `docs/defi-ui-v3-copy-states.json`
- `docs/link-check.md`
- `scripts/defi/check-links.mjs`
- `scripts/defi/ui-smoke.mjs`
- `scripts/defi/ui-v2-management-smoke.mjs`
- `scripts/defi/ui-v2-shots.mjs`
- `scripts/defi/ui-v2-widget-review.mjs`
- `scripts/defi/ui-v2-widget-smoke.mjs`
- `scripts/defi/ui-v3-copy-controls.mjs`
- `scripts/defi/ui-v3-copy-states.mjs`
- `tests/display.test.ts`
- `tests/friendly-error.test.ts`
- `tests/perps.test.ts`

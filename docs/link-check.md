# External link check

Checked 2026-11-14T19:01:05.270Z with curl -sIL, a browser user agent, redirects, and GET retry for every non-200 HEAD response. 78 unique URLs extracted from components/, app/, lib/, README.md and docs/*.md. Dynamic explorer templates use the representative URL shown below; mainnet transaction template uses a placeholder because this pass does not spend mainnet funds.

NEAR Connect: npm view @hot-labs/near-connect repository homepage returns hot-dao/near-selector; curl follows that repository to azbang/near-connect (200). The old hot-dao/near-connect URL returns 404. The UI now points directly to azbang/near-connect. Protocol cards with curl-blocked explorer landing pages now use official Rhea, LiNEAR, and NEAR documentation (all 200).

All informational navigation links return 200. Remaining non-200 responses are listed honestly: local examples, an XML namespace, authenticated/POST service endpoints, and curl-blocked explorer evidence. API addresses were not replaced by web pages. Explorer receipts remain linked to the exact transaction.

| URL | HEAD → final status | Fixed / result | Found in |
| --- | --- | --- | --- |
| http://localhost:3001 | 000 → 000 | Local development example; no public site expected. | README.md, docs/UI-V2-A.md, lib/agent/proposals.ts |
| http://localhost:3002 | 000 → 000 | Local development example; no public site expected. | docs/defi-perps.md |
| http://localhost:3006 | 000 → 000 | Local development example; no public site expected. | docs/UI-V3-COPY.md |
| http://www.w3.org/2000/svg | 500 → 500 | SVG XML namespace; identifier, not a navigation link. | app/leash-base.css, components/ui/animated-beam.tsx |
| https://1click.chaindefuser.com | 200 → 200 | OK | lib/bridge/server.ts |
| https://1click.chaindefuser.com/v0/quote | 404 → 404 | POST API (GET returns 404); executable service URL retained. | lib/near/intents.ts |
| https://1click.chaindefuser.com/v0/tokens | 200 → 200 | OK | lib/near/intents.ts |
| https://cdn.jsdelivr.net/gh/azbang/hot-connector/repository/manifest.json | 200 → 200 | OK | lib/bridge/wallet-isolation.ts |
| https://cloud-api.near.ai/v1 | 404 → 404 | Authenticated AI API base, not a web page; retained. Public UI links use https://cloud.near.ai (200). | lib/agent/near-ai.ts |
| https://cloud.near.ai | 200 → 200 | Resolves → https://cloud.near.ai/signin | components/leash/ProtocolsPage.tsx |
| https://docs.near-intents.org/near-intents/integration/distribution-channels/1click-api | 200 → 200 | Resolves → https://docs.near-intents.org/integration/distribution-channels/1click-api/about-1click-api | components/leash/ProtocolsPage.tsx |
| https://docs.near.org/chain-abstraction/chain-signatures | 200 → 200 | OK | components/leash/ProtocolsPage.tsx |
| https://docs.near.org/getting-started/faucet | 200 → 200 | OK | lib/near/wallet.ts |
| https://easings.net/#easeOutExpo | 200 → 200 | OK | components/ui/animated-beam.tsx |
| https://explorer.near-intents.org | 200 → 200 | OK | components/leash/MainnetBridgePanel.tsx |
| https://github.com/azbang/near-connect | 200 → 200 | OK | components/leash/ProtocolsPage.tsx |
| https://github.com/hot-dao/near-connect | 404 → 404 | Fixed → https://github.com/azbang/near-connect (200). | old protocol link |
| https://github.com/hot-dao/near-selector | 200 → 200 | npm metadata redirects → https://github.com/azbang/near-connect (200). | npm repository/homepage |
| https://github.com/kokonut-labs/kokonutui | 200 → 200 | OK | components/kokonutui/action-status.tsx |
| https://github.com/Mateen036/leash | 200 → 200 | OK | lib/near/wallet.ts |
| https://guide.rhea.finance | 200 → 200 | OK | components/leash/ProtocolsPage.tsx |
| https://kokonutui.com | 200 → 200 | OK | components/kokonutui/action-status.tsx |
| https://leash.leash-agent.workers.dev | 200 → 200 | OK | README.md |
| https://leash.leash-agent.workers.dev/agent | 200 → 200 | OK | README.md |
| https://linearprotocol.org | 200 → 200 | OK | components/leash/ProtocolsPage.tsx |
| https://near-faucet.io/ | 200 → 200 | OK | components/leash/GetTestTokens.tsx, components/perps/PerpsPage.tsx, docs/defi-v3-ui-verification.md |
| https://near-testnet.drpc.org | 405 → 200 | Resolves → https://drpc.org/chainlist/near-testnet-rpc | lib/near/rpc.ts |
| https://near.org | 200 → 200 | OK | lib/bridge/wallet.ts |
| https://nearblocks.io/txns/${attempt.txHash} | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. Representative: https://nearblocks.io/txns/11111111111111111111111111111111 | components/leash/MainnetBridgePanel.tsx |
| https://nearblocks.io/txns/${result.txHash} | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. Representative: https://nearblocks.io/txns/11111111111111111111111111111111 | components/leash/MainnetBridgePanel.tsx |
| https://orderly.network/docs | 200 → 200 | OK | components/leash/ProtocolsPage.tsx |
| https://raw.githubusercontent.com/hot-dao/near-selector/refs/heads/main/repository/manifest.json | 200 → 200 | OK | lib/bridge/wallet-isolation.ts |
| https://rpc.mainnet.near.org | 405 → 405 | POST service endpoint (GET returns 405); retained for functionality. | lib/bridge/server.ts, lib/bridge/wallet.ts |
| https://rpc.testnet.near.org | 405 → 405 | POST service endpoint (GET returns 405); retained for functionality. | lib/near/rpc.ts, lib/near/wallet.ts |
| https://sepolia.arbiscan.io/address/${account.address} | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. Representative: https://sepolia.arbiscan.io/address/0x0000000000000000000000000000000000000000 | components/perps/PerpsPage.tsx |
| https://test.rpc.fastnear.com | 405 → 405 | POST service endpoint (GET returns 405); retained for functionality. | lib/near/deployment.testnet.json |
| https://testnet-api.orderly.org | 200 → 200 | OK | docs/DEFI.md, lib/defi/orderly.ts |
| https://testnet-operator-evm.orderly.org/v1/faucet/usdc | 405 → 405 | POST service endpoint (GET returns 405); retained for functionality. | lib/defi/orderly.ts |
| https://testnet-rpc.intea.rs | 405 → 405 | POST service endpoint (GET returns 405); retained for functionality. | lib/near/rpc.ts |
| https://testnet.nearblocks.io | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | lib/near/deployment.testnet.json |
| https://testnet.nearblocks.io/address/${accountId} | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. Representative: https://testnet.nearblocks.io/address/ref-finance-101.testnet | components/leash/ActivityFeed.tsx |
| https://testnet.nearblocks.io/txns/${encodeURIComponent(hash | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. Representative: https://testnet.nearblocks.io/txns/DFDDLVn8UTdaak4ipLHc5sQTDzgdE1dEYrm49UQyftyg | components/perps/PerpsPage.tsx |
| https://testnet.nearblocks.io/txns/${t.txHash} | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. Representative: https://testnet.nearblocks.io/txns/DFDDLVn8UTdaak4ipLHc5sQTDzgdE1dEYrm49UQyftyg | components/leash/GetTestTokens.tsx |
| https://testnet.nearblocks.io/txns/2tfxveFEVmaCihJ3EbJSEPqxq2nQ2GsBySAMsumZJA9U | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md, docs/SAFETY.md |
| https://testnet.nearblocks.io/txns/3DSUEgUw1pqxSvfnxtegFym3Lbj6YtLxSLpimYinWhF6 | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md |
| https://testnet.nearblocks.io/txns/4emPdPnvLeYA7bKduYRfQNnkH9B4S8kkgPTQZBZA6zWh | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md |
| https://testnet.nearblocks.io/txns/4hxnsyFe4CehQAKBva19gedkaUCTHxBpyBZTctbu1cVL | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | docs/UI-V2-A.md |
| https://testnet.nearblocks.io/txns/4VmHHf8PzkoEUj8BZh5U7WWWcAjkYJqAMZiShnNehanX | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md |
| https://testnet.nearblocks.io/txns/5owbKorrwSVNU6zmYeTKewDMqhXjqoA9t74wX182duho | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md, docs/SAFETY.md |
| https://testnet.nearblocks.io/txns/5ye878zpAHkwnpNYPWqZajDvZmcjipWxsFCYPsFC2dnc | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | docs/UI-V2-A.md |
| https://testnet.nearblocks.io/txns/5zEAh9jN4MUiSTUGPnk9FbJomVJEWq1TwwCX4aAe5Svb | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | docs/defi-perps.md |
| https://testnet.nearblocks.io/txns/77CKcRAkJiA9Tx7R9Z6KrRz8ZViVspLmmPrxAysbUSpG | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md |
| https://testnet.nearblocks.io/txns/7aHY5CdExV7G4iLLVHvMnM8tCNYcG16sms17vnHrkXCR | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | docs/UI-V2-A.md |
| https://testnet.nearblocks.io/txns/7aXSSY1Bp6apYg85yXojDyTgcwM71fCeVtByLGcjyr1K | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md |
| https://testnet.nearblocks.io/txns/7FbGb6FFX1bqMQEzJVL4kx2TuTFCR4PjR9k5WUA7SjT2 | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md |
| https://testnet.nearblocks.io/txns/89HUq4V9cZbBJBLPc5BZmA5vSQQFgW9HdxbcbiHvc9rB | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md |
| https://testnet.nearblocks.io/txns/8N4WUTeZWm8SV9b4yUTTS5UwDUEjAMFE29Fr3xfLMAEq | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md |
| https://testnet.nearblocks.io/txns/9329eKcqL8MwY52kGacdRxx3NZoiXw8oqe3BaFXMqXQY | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | docs/UI-V2-A.md |
| https://testnet.nearblocks.io/txns/95RMDYYbQff5Rr5SM7smr7xiha8qR3XVPE2cF2j6njQC | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md |
| https://testnet.nearblocks.io/txns/AA5ws5nPkXSLyZL85zqNnN1tT4kyDCNknDRcSSUSXvnR | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md |
| https://testnet.nearblocks.io/txns/B7GjjCfCQYMwuDS1PLnFcsL4AtqPdFMHoUJ2tRf8B95u | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | docs/UI-V2-A.md |
| https://testnet.nearblocks.io/txns/BN5d2WbiWrJCEFycTdYHHmUEFo89w6ZUkdV5fBBLTBWv | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md |
| https://testnet.nearblocks.io/txns/C11AJgTTjTaJhfo7mRGSXmXpr9YBjHDgwJu3yyAafg7G | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | docs/UI-V2-A.md |
| https://testnet.nearblocks.io/txns/C9KPu6Et3re4HDVUZDNtoHCCR6WtjRSAXNQodM9iwbh7 | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | docs/defi-perps.md |
| https://testnet.nearblocks.io/txns/CRzrMpxRharMYGupTKxd628sYEvcTyamZj5BgTTnqcf5 | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md |
| https://testnet.nearblocks.io/txns/DFDDLVn8UTdaak4ipLHc5sQTDzgdE1dEYrm49UQyftyg | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md, docs/SAFETY.md |
| https://testnet.nearblocks.io/txns/Dg6qRo5WdFbDY3ez8SogyCRC9cprNfjiHLv4X5BPyJg6 | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | docs/UI-V2-A.md |
| https://testnet.nearblocks.io/txns/DPLwA8uk1xZReJmtAAGCWgSm9qK7Z4cmStLszvCLL5Po | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md |
| https://testnet.nearblocks.io/txns/DRMXtp68zHkZfWXbPcnw4mrSEh4xD2amezny3JjnqCtr | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md, docs/SAFETY.md |
| https://testnet.nearblocks.io/txns/EYwNoysBbMLL1NrAG5x5ogTGnxmXYcG5thNSiEhAxsHs | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md |
| https://testnet.nearblocks.io/txns/FoBVnhRzH3voLqcfC2ob6egDGiN2TzHTr2YdNCmS83bV | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md |
| https://testnet.nearblocks.io/txns/FRaarDD7TTH9D44TaZTEgZtnggvFoJ6XMBK4zFxx7BSL | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md |
| https://testnet.nearblocks.io/txns/G4oLJLkT6VgcrSHgXSnBUf6LBJ4FkSmmNgUD4XWnGmRJ | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md |
| https://testnet.nearblocks.io/txns/GF7YTNWeSSPZpJWvQwzk8tmZcCZmmm1Qi2Amv22WwpZP | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md, docs/SAFETY.md |
| https://testnet.nearblocks.io/txns/Gnc2bQb3b6ZkvfYy8aFQi9YZ5LQEzCpXfrgMXLGg83xg | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md |
| https://testnet.nearblocks.io/txns/H9DJ9uqPk9K6qGgynBttTPbs4mx6XB5CVkR75gagip33 | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | docs/UI-V2-A.md |
| https://testnet.nearblocks.io/txns/Hzq1vY3v7LPUdXq5KsuZM5a6f28RHDEPABWLo7SNMsfB | 403 → 403 | Explorer blocks this curl client (403). Retained exact transaction/address link. | README.md, docs/SAFETY.md |
| https://ui.aceternity.com/components/card-spotlight | 200 → 200 | OK | components/ui/card-spotlight.tsx |

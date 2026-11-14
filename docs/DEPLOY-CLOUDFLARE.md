# Leash build handoff

T1 is local only. No push or Cloudflare deployment is authorized for this task.

```sh
npm test
npm run typecheck
npm run build:vinext
```

Server environment names are documented in `.env.example`. Private Leash values live outside the repository, in `/workspace/secrets/leash/.dev.vars`. Local `.env.local` and `.dev.vars` files are ignored by Git.

The existing Worker configuration still names the original app. Before a future release task, configure the separate Leash worker target and verify the final safety model. This change does not deploy or alter the existing hosted app.

Guests use the Leash testnet relayer root and receive 0.8 testnet NEAR. The legacy Ref swap fallback also needs `AGENT_ACCOUNT_ID` and `AGENT_SWAP_PRIVATE_KEY`; the new guard key cannot sign calls to that legacy account. No mainnet key belongs on this server.

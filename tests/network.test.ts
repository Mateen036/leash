import test from "node:test";
import assert from "node:assert/strict";
import { withNetwork, networkRoute } from "../lib/near/network-server";
import { near, isGuestAccount, txUrl } from "../lib/near/config";
import { networkEnv } from "../lib/near/env";
import { rpcUrls } from "../lib/near/rpc";
import { defaultPolicy, installGuardActions } from "../lib/near/guard";
import { getSwapTokens, poolFor, toBase } from "../lib/defi/tokens";
import { buildCopilotTransactions } from "../lib/defi/copilot";
import { parseAction } from "../lib/agent/planner";
import { claimFaucet } from "../lib/defi/faucet";
import { createGuest, relay } from "../lib/near/server";
import {
  grantStarterUsdc,
  requestFaucet,
  brokerId,
  findSession,
  ensureAccount,
} from "../lib/defi/orderly";
import { verifyPerpAuth } from "../lib/defi/perps-auth";
import { cachedKlines, resetKlineCache } from "../lib/defi/kline";

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
test("concurrent requests keep RPCs, protocols, policies and tokens on their selected network", async () => {
  await Promise.all(
    Array.from({ length: 20 }, (_, i) => {
      const network = i % 2 ? "mainnet" : "testnet";
      return withNetwork(network, async () => {
        await tick();
        assert.equal(near.network, network);
        const mainnet = network === "mainnet";
        assert.equal(
          near.ref,
          mainnet ? "v2.ref-finance.near" : "ref-finance-101.testnet",
        );
        assert.equal(near.chainId, mainnet ? 42161 : 421614);
        assert.equal(
          near.mpcContract,
          mainnet ? "v1.signer" : "v1.signer-prod.testnet",
        );
        assert.equal(
          rpcUrls().some((url) => /testnet|test\.rpc/.test(url)),
          !mainnet,
        );
        const tokens = getSwapTokens();
        const policy = defaultPolicy();
        assert.ok(policy.allowed_protocols.includes(near.ref));
        assert.ok(policy.allowed_protocols.includes(near.orderlyVenue));
        assert.ok(tokens.every((t) => !!policy.caps[t.id]));
        if (mainnet) {
          assert.deepEqual(
            tokens.map((t) => t.symbol),
            ["NEAR", "USDC", "USDT"],
          );
          assert.ok(
            tokens.every((t) => !t.id.includes("testnet") && !t.faucet),
          );
          assert.ok(!JSON.stringify(policy).includes("testnet"));
          assert.equal(txUrl("receipt"), "https://nearblocks.io/txns/receipt");
        }
        await tick();
        assert.equal(near.network, network);
      });
    }),
  );
  assert.equal(near.network, "testnet");
});

test("route validates network header and disables response caching across networks", async () => {
  const route = networkRoute(async () => {
    await tick();
    return Response.json({ network: near.network, ref: near.ref });
  });
  const responses = await Promise.all(
    ["testnet", "mainnet"].map((network) =>
      route(
        new Request("http://localhost/api/defi/state", {
          headers: { "x-leash-network": network },
        }),
      ),
    ),
  );
  assert.equal((await responses[0].json()).network, "testnet");
  assert.equal((await responses[1].json()).network, "mainnet");
  assert.equal(responses[1].headers.get("cache-control"), "no-store");
  assert.equal(responses[1].headers.get("x-leash-network"), "mainnet");
  assert.equal(
    (
      await route(
        new Request("http://localhost/api", {
          headers: { "x-leash-network": "invalid" },
        }),
      )
    ).status,
    400,
  );
});

test("mainnet builds exact wallet-signed stake, lend and swap calls using real token decimals", () =>
  withNetwork("mainnet", () => {
    const id = "jjhkhkl.near";
    const [stake] = buildCopilotTransactions(id, {
      kind: "LinearStake",
      amount: toBase("0.1", 24),
    });
    assert.equal(stake.receiverId, "linear-protocol.near");
    assert.equal(stake.calls[0].deposit, 10n ** 23n);
    const supply = buildCopilotTransactions(id, {
      kind: "BurrowSupply",
      token: near.wrap,
      amount: "100",
      as_collateral: false,
    });
    assert.equal(supply.at(-1)?.receiverId, "wrap.near");
    assert.equal(
      (supply.at(-1)?.calls[0].args as any).receiver_id,
      "contract.main.burrow.near",
    );
    for (const token of getSwapTokens().slice(1)) {
      const pool = poolFor(near.wrap, token.id);
      const txs = buildCopilotTransactions(id, {
        kind: "RefSwap",
        pool_id: pool,
        token_in: near.wrap,
        token_out: token.id,
        amount_in: "100",
        min_amount_out: "1",
      });
      const transfer = txs.at(-1)!;
      const args: any = transfer.calls[0].args;
      assert.equal(args.receiver_id, "v2.ref-finance.near");
      assert.equal(JSON.parse(args.msg).actions[0].pool_id, token.pool);
      assert.equal(token.decimals, 6);
    }
    assert.deepEqual(parseAction("swap 0.1 NEAR to USDC"), {
      kind: "swap",
      amount: "0.1",
      source: "NEAR",
      target: "USDC",
    });
    assert.equal(parseAction("swap 0.1 NEAR to PEM").kind, "explain");
  }));

test("mainnet never uses testnet credentials, free funding, or unpublished testnet guard hashes", async () =>
  withNetwork("mainnet", async () => {
    const old = process.env.RELAYER_PRIVATE_KEY;
    process.env.RELAYER_PRIVATE_KEY = "test-only-placeholder";
    try {
      assert.equal(
        networkEnv("RELAYER_PRIVATE_KEY"),
        process.env.MAINNET_RELAYER_PRIVATE_KEY,
      );
    } finally {
      if (old === undefined) delete process.env.RELAYER_PRIVATE_KEY;
      else process.env.RELAYER_PRIVATE_KEY = old;
    }
    assert.equal(isGuestAccount("g-abcd.leash-11141537.testnet"), false);
    await assert.rejects(createGuest("not-a-key"), /testnet/);
    await assert.rejects(relay("invalid"), /testnet/);
    await assert.rejects(claimFaucet("jjhkhkl.near"), /testnet/);
    await assert.rejects(requestFaucet("0x123"), /testnet/);
    await assert.rejects(grantStarterUsdc("abc"), /testnet/);
    assert.throws(
      () => installGuardActions("invalid", defaultPolicy(), "jjhkhkl.near"),
      /Publish a guard code hash/,
    );
    if (!process.env.MAINNET_ORDERLY_BROKER_ID)
      assert.throws(brokerId, /MAINNET_ORDERLY_BROKER_ID/);
    await assert.rejects(
      verifyPerpAuth(
        {
          kind: "nep413",
          accountId: "jjhkhkl.near",
          message: `testnet|leash_perp|{}|${Date.now()}`,
          nonce: "",
          publicKey: "",
          signature: "",
        },
        {},
      ),
      /does not match/,
    );
  }));

test("price-history caches cannot return testnet candles for mainnet", async () => {
  resetKlineCache();
  const urls: string[] = [];
  const fetcher: typeof fetch = async (url) => {
    urls.push(String(url));
    return Response.json({
      s: "ok",
      t: [100],
      o: [1],
      h: [2],
      l: [1],
      c: [2],
      v: [10],
    });
  };
  const testnet = await withNetwork("testnet", () =>
    cachedKlines("PERP_ETH_USDC", "1h", fetcher, 1000),
  );
  const mainnet = await withNetwork("mainnet", () =>
    cachedKlines("PERP_ETH_USDC", "1h", fetcher, 1000),
  );
  assert.equal(testnet.source, "orderly-testnet");
  assert.equal(mainnet.source, "orderly-mainnet");
  assert.match(urls[0], /testnet-api/);
  assert.match(urls[1], /^https:\/\/api.orderly.org/);
});

test("mainnet account reads surface missing service configuration", async () =>
  withNetwork("mainnet", async () => {
    if (!process.env.MAINNET_ORDERLY_BROKER_ID) {
      await assert.rejects(
        findSession("jjhkhkl.near"),
        /MAINNET_ORDERLY_BROKER_ID/,
      );
      await assert.rejects(
        ensureAccount("jjhkhkl.near"),
        /MAINNET_ORDERLY_BROKER_ID/,
      );
    }
  }));

import { test } from "node:test";
import assert from "node:assert/strict";
import { NEAR_USDC, type IntentsToken } from "../lib/near/intents";
import {
  buildMainnetQuote,
  validateTransfer,
  validateQuote,
  totalWithFees,
  decimalUnits,
  assertDeadline,
  type OneClickQuote,
} from "../lib/bridge/validation";
import { requestBridgeQuote, prepareDeposit } from "../lib/bridge/server";
import {
  isolateMainnetManifest,
  MAINNET_STORAGE_PREFIX,
} from "../lib/bridge/wallet-isolation";
const tokens: IntentsToken[] = [
  {
    assetId: NEAR_USDC,
    blockchain: "near",
    symbol: "USDC",
    decimals: 6,
    price: 1,
    priceUpdatedAt: new Date().toISOString(),
    contractAddress: NEAR_USDC.slice(7),
  },
  {
    assetId: "nep141:wrap.near",
    blockchain: "near",
    symbol: "wNEAR",
    decimals: 24,
    price: 3,
    priceUpdatedAt: new Date().toISOString(),
    contractAddress: "wrap.near",
  },
  {
    assetId: "nep141:base-usdc",
    blockchain: "base",
    symbol: "USDC",
    decimals: 6,
    price: 1,
    priceUpdatedAt: new Date().toISOString(),
  },
];
const transfer = {
  mode: "mainnet-wallet" as const,
  source: "USDC" as const,
  amount: "5",
  destinationAsset: tokens[2].assetId,
  recipient: "0x52908400098527886E0F7030069857D2E4169EE7",
  refundTo: "alice.near",
  realMoneyConfirmed: true as const,
};
function quote(amount = "5000000"): OneClickQuote {
  return {
    amountIn: amount,
    amountInFormatted: String(Number(amount) / 1e6),
    amountInUsd: String(Number(amount) / 1e6),
    amountOut: "4800000",
    amountOutFormatted: "4.8",
    amountOutUsd: "4.8",
    minAmountOut: "4752000",
    depositAddress: "deposit.near",
    timeEstimate: 30,
  };
}
test("mainnet quotes fix exact input and reject wrong identity, address, precision and missing confirmation", () => {
  const request = buildMainnetQuote(transfer, tokens, false);
  assert.equal(request.swapType, "EXACT_INPUT");
  assert.equal(request.amount, "5000000");
  assert.equal(request.refundTo, "alice.near");
  for (const change of [
    { refundTo: "g-abcd.root.testnet" },
    { recipient: "0x0000000000000000000000000000000000000000" },
    { amount: "25.01" },
    { amount: "1.0000001" },
    { mode: "guest" },
    { realMoneyConfirmed: false },
    { destinationAsset: "unknown" },
  ])
    assert.throws(() => validateTransfer({ ...transfer, ...change }, tokens));
  assert.equal(
    decimalUnits("1.000000000000000000000001", 24),
    "1000000000000000000000001",
  );
  assert.throws(
    () =>
      validateTransfer(
        transfer,
        tokens.map((t) => ({
          ...t,
          priceUpdatedAt: new Date(0).toISOString(),
        })),
      ),
    /Fresh/,
  );
});
test("the cap includes route input fees plus network and storage, including a depegged stablecoin", () => {
  assert.equal(
    totalWithFees(5, "5", 10000000000000000000000n, tokens[1]),
    5.03,
  );
  assert.throws(() => totalWithFees(25, "25", 1n, tokens[1]), /at most/);
  assert.throws(
    () => totalWithFees(24.9, "24.9", 100000000000000000000000n, tokens[1]),
    /at most/,
  );
  assert.throws(
    () =>
      validateTransfer(
        { ...transfer, amount: "25.01" },
        tokens.map((t) => (t.symbol === "USDC" ? { ...t, price: 0.9 } : t)),
      ),
    /at most/,
  );
});
test("quote checks exact source, minimum output, expiry and deposit safety", () => {
  const request = buildMainnetQuote(transfer, tokens, false);
  validateQuote(quote(), request, transfer, tokens[0]);
  assert.throws(
    () =>
      validateQuote(
        { ...quote(), amountIn: "6000000" },
        request,
        transfer,
        tokens[0],
      ),
    /exact/,
  );
  assert.throws(
    () =>
      validateQuote(
        { ...quote(), depositAddress: "x.testnet" },
        request,
        transfer,
        tokens[0],
      ),
    /deposit/,
  );
  assert.throws(
    () =>
      validateQuote(
        { ...quote(), minAmountOut: "0" },
        request,
        transfer,
        tokens[0],
      ),
    /minimum/,
  );
  assert.throws(
    () => assertDeadline(new Date(Date.now() - 1).toISOString()),
    /expired/,
  );
});
test("mainnet connector and executor namespaces are isolated from testnet", () => {
  const manifest = {
    version: "1",
    wallets: [
      {
        id: "wallet",
        name: "Wallet",
        network: "mainnet",
        icon: "icon",
        executor: "https://example.com",
        features: {},
      },
    ],
  } as any;
  const isolated = isolateMainnetManifest(manifest);
  assert.equal(manifest.wallets[0].id, "wallet");
  assert.equal(isolated.wallets[0].id, "leash-bridge-mainnet-wallet");
  assert.equal(isolated.wallets[0].executor, manifest.wallets[0].executor);
  assert.equal(MAINNET_STORAGE_PREFIX, "leash-bridge-mainnet:");
});
test("server re-reads original quotes, rejects tampering/duplicates and builds only unsigned deposit actions", async () => {
  const original = global.fetch;
  let current = buildMainnetQuote(transfer, tokens, false);
  let currentQuote = quote();
  let state = "PENDING_DEPOSIT";
  global.fetch = (async (url, init) => {
    if (String(url).endsWith("/v0/tokens")) return Response.json(tokens);
    if (String(url).endsWith("/v0/quote")) {
      current = JSON.parse(String(init?.body));
      currentQuote = quote(current.amount);
      return Response.json({
        quoteRequest: current,
        quote: currentQuote,
        correlationId: "test",
      });
    }
    if (String(url).includes("/v0/status?"))
      return Response.json({
        status: state,
        quoteResponse: { quoteRequest: current, quote: currentQuote },
      });
    const call = JSON.parse(String(init?.body));
    if (call.method === "gas_price")
      return Response.json({ result: { gas_price: "100000000" } });
    const method = call.params.method_name;
    const result =
      method === "storage_balance_of"
        ? null
        : { min: "1250000000000000000000" };
    return Response.json({
      result: { result: [...new TextEncoder().encode(JSON.stringify(result))] },
    });
  }) as typeof fetch;
  try {
    const prepared = await requestBridgeQuote({ ...transfer, dry: false });
    assert.ok(prepared.totalUsd > 5 && prepared.totalUsd < 25);
    await assert.rejects(
      requestBridgeQuote({ ...transfer, amount: "25", dry: false }),
      /including/,
    );
    const input = { ...transfer, depositAddress: "deposit.near" };
    const plan = await prepareDeposit(input);
    assert.equal(plan.receiverId, NEAR_USDC.slice(7));
    assert.equal(plan.sourceAccount, "alice.near");
    assert.deepEqual(
      plan.actions.map((a) =>
        a.type === "FunctionCall" ? a.params.methodName : a.type,
      ),
      ["storage_deposit", "ft_transfer"],
    );
    assert.equal((plan.actions[1] as any).params.args.amount, "5000000");
    await assert.rejects(
      prepareDeposit({
        ...input,
        recipient: "0x1111111111111111111111111111111111111111",
      }),
      /match/,
    );
    current = { ...current, swapType: "EXACT_OUTPUT" } as any;
    await assert.rejects(prepareDeposit(input), /match/);
    current = buildMainnetQuote(transfer, tokens, false);
    state = "PROCESSING";
    await assert.rejects(prepareDeposit(input), /already/);
    state = "PENDING_DEPOSIT";
    const native = { ...transfer, source: "NEAR" as const, amount: "1" };
    current = buildMainnetQuote(native, tokens, false);
    currentQuote = { ...quote(), amountIn: current.amount, amountInUsd: "3" };
    const nativePlan = await prepareDeposit({
      ...native,
      depositAddress: "deposit.near",
    });
    assert.deepEqual(nativePlan.actions, [
      { type: "Transfer", params: { deposit: current.amount } },
    ]);
  } finally {
    global.fetch = original;
  }
});

test("wallet signing stays on mainnet, refuses account/cap/expiry changes and distinguishes rejection from ambiguous failure", async () => {
  const { signDeposit, DepositNotSentError } = await import(
    "../lib/bridge/wallet"
  );
  let signed = 0;
  const wallet = {
    async getAccounts(input: { network: string }) {
      assert.equal(input.network, "mainnet");
      return [{ accountId: "alice.near" }];
    },
    async signAndSendTransaction(input: any) {
      signed++;
      assert.equal(input.network, "mainnet");
      assert.equal(input.signerId, "alice.near");
      assert.equal(input.receiverId, "deposit.near");
      return { transaction: { hash: "test-hash" } };
    },
  };
  const session = { accountId: "alice.near", wallet } as any;
  const plan = {
    receiverId: "deposit.near",
    actions: [
      {
        type: "Transfer" as const,
        params: { deposit: "1000000000000000000000000" },
      },
    ],
    storageDeposit: "0",
    sourceAccount: "alice.near",
    depositAddress: "deposit.near",
    amountIn: "1000000000000000000000000",
    deadline: new Date(Date.now() + 300000).toISOString(),
    totalUsd: 3.2,
    walletReserveNear: "0.06",
  };
  assert.equal((await signDeposit(session, plan)).txHash, "test-hash");
  await assert.rejects(
    signDeposit({ ...session, accountId: "g-abcd.root.testnet" }, plan),
    DepositNotSentError,
  );
  await assert.rejects(
    signDeposit(session, { ...plan, sourceAccount: "bob.near" }),
    DepositNotSentError,
  );
  await assert.rejects(
    signDeposit(session, { ...plan, totalUsd: 25.01 }),
    DepositNotSentError,
  );
  await assert.rejects(
    signDeposit(session, { ...plan, deadline: new Date(0).toISOString() }),
    DepositNotSentError,
  );
  assert.equal(signed, 1);
  wallet.signAndSendTransaction = async () => {
    throw Object.assign(new Error("User rejected"), { code: 4001 });
  };
  await assert.rejects(signDeposit(session, plan), DepositNotSentError);
  wallet.signAndSendTransaction = async () => {
    throw new Error("timeout");
  };
  await assert.rejects(
    signDeposit(session, plan),
    (error) =>
      error instanceof Error && !(error instanceof DepositNotSentError),
  );
});

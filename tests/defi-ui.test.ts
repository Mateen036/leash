import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCopilotTransactions,
  checkCopilotPolicy,
} from "../lib/defi/copilot";
import {
  minimumOut,
  stakeOutput,
  suppliedBalance,
  policyCheck,
} from "../lib/defi/preview";
import { defaultPolicy } from "../lib/near/guard";
import { toBase } from "../lib/defi/tokens";
test("wallet stake and unstake call LiNEAR directly with precise deposit and units", () => {
  const amount = toBase("0.2", 24);
  const [stake] = buildCopilotTransactions("alice.testnet", {
    kind: "LinearStake",
    amount,
  });
  assert.equal(stake.receiverId, "linear-protocol.testnet");
  assert.equal(stake.calls[0].method, "deposit_and_stake");
  assert.equal(stake.calls[0].deposit, BigInt(amount));
  const [unstake] = buildCopilotTransactions("alice.testnet", {
    kind: "LinearUnstake",
    amount,
  });
  assert.deepEqual(unstake.calls[0].args, { amount });
  assert.equal(unstake.calls[0].deposit, 0n);
});
test("wallet supply wraps only missing NEAR, registers storage, and transfers directly to Burrow", () => {
  const action = {
    kind: "BurrowSupply" as const,
    token: "wrap.testnet",
    amount: toBase("0.2", 24),
    as_collateral: false,
  };
  const txs = buildCopilotTransactions("alice.testnet", action, {
    wrap: true,
    wrappedBalance: toBase("0.1", 24),
  });
  assert.equal(txs[0].calls[0].method, "near_deposit");
  assert.equal(txs[0].calls[0].deposit, BigInt(toBase("0.1", 24)));
  assert.equal(txs[1].receiverId, "contract.burrow.testnet");
  assert.equal(txs[1].calls[0].method, "storage_deposit");
  assert.deepEqual(txs[2].calls[0].args, {
    receiver_id: "contract.burrow.testnet",
    amount: action.amount,
    msg: "",
  });
  assert.equal(txs[2].calls[0].deposit, 1n);
  const registered = buildCopilotTransactions("alice.testnet", action, {
    wrap: true,
    burrow: true,
    wrappedBalance: action.amount,
  });
  assert.equal(registered.length, 1);
  assert.equal(registered[0].calls[0].method, "ft_transfer_call");
});
test("wallet withdrawal uses Burrow execute and one yocto", () => {
  const [tx] = buildCopilotTransactions("alice.testnet", {
    kind: "BurrowWithdraw",
    token: "wrap.testnet",
    amount: "123",
  });
  assert.deepEqual(tx.calls[0].args, {
    actions: [{ Withdraw: { token_id: "wrap.testnet", max_amount: "123" } }],
  });
  assert.equal(tx.calls[0].deposit, 1n);
});
test("wallet swap matches guard message, output storage and minimum; no arbitrary recipient", () => {
  const a = {
    kind: "RefSwap" as const,
    pool_id: 2973,
    token_in: "wrap.testnet",
    token_out: "usdc.lapdemo-11140542.testnet",
    amount_in: toBase("0.05", 24),
    min_amount_out: "123",
  };
  const txs = buildCopilotTransactions("alice.testnet", a);
  const ft = txs.at(-1)!.calls[0];
  const args = ft.args as any;
  const msg = JSON.parse(args.msg);
  assert.equal(args.receiver_id, "ref-finance-101.testnet");
  assert.deepEqual(msg.actions[0], {
    pool_id: a.pool_id,
    token_in: a.token_in,
    token_out: a.token_out,
    amount_in: a.amount_in,
    min_amount_out: a.min_amount_out,
  });
  assert.equal(msg.skip_unwrap_near, true);
  assert.equal(msg.swap_out_recipient, undefined);
  assert.equal(txs.at(-2)!.receiverId, a.token_out);
  assert.equal(ft.deposit, 1n);
  assert.equal(
    checkCopilotPolicy({ kind: "LinearStake", amount: toBase("0.9", 24) }),
    "CAP_PER_ACTION",
  );
});
test("preview calculations use integer units and normalize UTC daily budget", () => {
  assert.equal(
    minimumOut("100000000000000000000001", 50),
    "99500000000000000000000",
  );
  assert.equal(
    stakeOutput(toBase("0.2", 24), toBase("2.3", 24)),
    "86956521739130434782608",
  );
  assert.throws(() => stakeOutput("1", "0"));
  assert.throws(() => minimumOut("1", 10000));
  assert.equal(
    suppliedBalance({
      supplied: [{ token_id: "wrap.testnet", balance: "123" }],
      collateral: [{ token_id: "wrap.testnet", balance: "2" }],
    }),
    "125",
  );
  const now = Date.now(),
    p = defaultPolicy(now),
    day = Math.floor(now / 86400000);
  assert.equal(
    policyCheck(
      p,
      { near: { amount: toBase("1.4", 24), day_index: day } },
      "near",
      toBase("0.2", 24),
      now,
    ),
    "CAP_DAILY",
  );
  assert.equal(
    policyCheck(
      p,
      { near: { amount: toBase("1.4", 24), day_index: day - 1 } },
      "near",
      toBase("0.2", 24),
      now,
    ),
    undefined,
  );
});

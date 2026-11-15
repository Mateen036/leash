import { near } from "@/lib/near/config";
import type { GuardAction, GuardPolicy, GuardSpent } from "../near/guard";
import { defaultPolicy } from "../near/guard";
import type { Call } from "../near/client";
import { TOKENS } from "./tokens";
import { amountMeta, policyCheck } from "./preview";
export type CopilotTransaction = { receiverId: string; calls: Call[] };
export type Registration = {
  wrap?: boolean;
  burrow?: boolean;
  ref?: boolean;
  output?: boolean;
  wrappedBalance?: string;
};
const call = (
  method: string,
  args: object,
  deposit = 0n,
  gas = 40_000_000_000_000n,
): Call => ({ method, args, deposit, gas });
const storage = (
  accountId: string,
  deposit: bigint,
  registration_only = true,
) =>
  call(
    "storage_deposit",
    { account_id: accountId, registration_only },
    deposit,
    20_000_000_000_000n,
  );
/** Pure unsigned protocol calls. Each transaction is signed directly by the connected wallet. */
export function buildCopilotTransactions(
  accountId: string,
  a: GuardAction,
  r: Registration = {},
): CopilotTransaction[] {
  const txs: CopilotTransaction[] = [];
  const add = (receiverId: string, ...calls: Call[]) =>
    txs.push({ receiverId, calls });
  if (a.kind === "LinearStake")
    add(near.linear, call("deposit_and_stake", {}, BigInt(a.amount)));
  else if (a.kind === "LinearUnstake")
    add(near.linear, call("unstake", { amount: a.amount }));
  else if (a.kind === "BurrowWithdraw")
    add(
      near.burrow,
      call(
        "execute",
        {
          actions: [{ Withdraw: { token_id: a.token, max_amount: a.amount } }],
        },
        1n,
        100_000_000_000_000n,
      ),
    );
  else {
    const token = a.kind === "RefSwap" ? a.token_in : a.token;
    const amount = a.kind === "RefSwap" ? a.amount_in : a.amount;
    if (token === TOKENS.wNEAR.id) {
      if (!r.wrap) add(token, storage(accountId, 10n ** 22n));
      const needed = BigInt(amount) - BigInt(r.wrappedBalance || "0");
      if (needed > 0n)
        add(token, call("near_deposit", {}, needed, 20_000_000_000_000n));
    }
    if (a.kind === "BurrowSupply") {
      if (!r.burrow) add(near.burrow, storage(accountId, 10n ** 23n));
      add(
        token,
        call(
          "ft_transfer_call",
          { receiver_id: near.burrow, amount, msg: "" },
          1n,
          150_000_000_000_000n,
        ),
      );
    } else {
      if (!r.ref) add(near.ref, storage(accountId, 2n * 10n ** 22n, false));
      add(
        near.ref,
        call("register_tokens", { token_ids: [a.token_in, a.token_out] }, 1n),
      );
      if (!r.output) add(a.token_out, storage(accountId, 10n ** 22n));
      add(
        token,
        call(
          "ft_transfer_call",
          {
            receiver_id: near.ref,
            amount,
            msg: JSON.stringify({
              force: 0,
              skip_unwrap_near: true,
              actions: [
                {
                  pool_id: a.pool_id,
                  token_in: a.token_in,
                  token_out: a.token_out,
                  amount_in: a.amount_in,
                  min_amount_out: a.min_amount_out,
                },
              ],
            }),
          },
          1n,
          180_000_000_000_000n,
        ),
      );
    }
  }
  return txs;
}
export function checkCopilotPolicy(
  action: GuardAction,
  spent: GuardSpent = {},
  policy: GuardPolicy = defaultPolicy(),
) {
  const meta = amountMeta(action);
  return policyCheck(policy, spent, meta.asset, meta.amount);
}

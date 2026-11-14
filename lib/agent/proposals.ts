import { markets as orderlyMarkets } from "@/lib/defi/orderly";
import type { Action } from "./actions";
import { accountState, swapQuote, view } from "../defi/server";
import {
  BURROW,
  LINEAR,
  REF,
  TOKENS,
  fromBase,
  poolFor,
  swapToken,
  toBase,
} from "../defi/tokens";
import {
  amountMeta,
  limitText,
  minimumOut,
  policyCheck,
  stakeOutput,
  suppliedBalance,
  type Proposal,
} from "../defi/preview";
import { defaultPolicy, type GuardAction } from "../near/guard";
import {
  bridgeDestinations,
  bridgeQuote,
  intentsTokens,
} from "../near/intents";
export async function prepareProposal(
  action: Action,
  accountId?: string,
  walletMode = false,
  origin = "http://localhost:3001",
): Promise<Proposal> {
  const state = accountId ? await accountState(accountId) : null;
  const d = state?.exists ? state : null;
  const policy = walletMode ? defaultPolicy() : d?.policy || defaultPolicy();
  const spent = walletMode ? {} : d?.spent || {};
  const now = Date.now();
  const p: Proposal = {
    action,
    headline: "",
    deltas: [],
    protocol: "Leash",
    contract: "",
    because:
      "Because this matches your request; no yield or price prediction is assumed.",
    quotedAt: now,
    sources: [],
    facts: [],
    limit: "No spending authorization required",
  };
  let ga: GuardAction | undefined;
  if (action.kind === "stake" || action.kind === "unstake") {
    const price = await view<string>(LINEAR, "ft_price");
    const amount = toBase(action.amount, 24),
      linear = stakeOutput(amount, price);
    p.because =
      "Because you requested a staking position; the conversion uses LiNEAR’s live rate, with no assumed future yield.";
    p.protocol = "LiNEAR";
    p.contract = LINEAR;
    p.sources.push({ name: "LiNEAR ft_price", at: Date.now() });
    if (action.kind === "stake") {
      p.headline = `You stake ${action.amount} NEAR → receive ≈${fromBase(linear, 24)} LiNEAR`;
      p.deltas = [`−${action.amount} NEAR`, `+≈${fromBase(linear, 24)} LiNEAR`];
      ga = { kind: "LinearStake", amount };
    } else {
      p.headline = `You unstake ${action.amount} NEAR worth of LiNEAR`;
      p.deltas = [
        `−≈${fromBase(linear, 24)} LiNEAR`,
        `+${action.amount} NEAR pending redemption`,
      ];
      ga = { kind: "LinearUnstake", amount };
      p.facts.push({
        label: "Unlock",
        value:
          "Protocol epoch delay applies. Owner must withdraw unlocked NEAR from LiNEAR; this action only requests unstaking.",
      });
    }
    p.facts.push({
      label: "Live exchange rate",
      value: `1 LiNEAR = ${fromBase(price, 24)} NEAR`,
    });
  } else if (action.kind === "supply" || action.kind === "withdraw") {
    const asset = await view<any>(BURROW, "get_asset", {
      token_id: TOKENS.wNEAR.id,
    });
    const amount = toBase(action.amount, 24),
      supplied = suppliedBalance(d?.burrow);
    const projected =
      BigInt(supplied) +
      (action.kind === "supply" ? BigInt(amount) : -BigInt(amount));
    p.because =
      "Because wNEAR has a live Burrow supply market and the position remains on your own account.";
    p.protocol = "Rhea Lending / Burrow";
    p.contract = BURROW;
    p.headline = `You ${action.kind} ${action.amount} wNEAR ${action.kind === "supply" ? "to" : "from"} Rhea`;
    p.deltas =
      action.kind === "supply"
        ? [`−${action.amount} NEAR/wNEAR`, `+${action.amount} wNEAR supplied`]
        : [
            `−${action.amount} wNEAR supplied`,
            `+${action.amount} wNEAR in wallet`,
          ];
    p.sources.push({ name: "Burrow get_asset + get_account", at: Date.now() });
    p.facts.push(
      {
        label: "Projected supplied balance",
        value: `${fromBase(projected > 0n ? projected : 0n, 24)} wNEAR`,
      },
      {
        label: "Supply APR · variable",
        value: `${(Number(asset.supply_apr) * 100).toFixed(4)}%`,
      },
      {
        label: "Projected health factor",
        value: d?.burrow?.borrowed?.length
          ? "Unavailable: withdrawal disabled while borrows exist (testnet wNEAR oracle unavailable)"
          : "N/A — no borrows, so there is no liquidation health factor",
      },
    );
    ga =
      action.kind === "supply"
        ? {
            kind: "BurrowSupply",
            token: TOKENS.wNEAR.id,
            amount,
            as_collateral: false,
          }
        : { kind: "BurrowWithdraw", token: TOKENS.wNEAR.id, amount };
    if (action.kind === "withdraw" && projected < 0n)
      p.blocked = "Withdrawal exceeds your supplied balance";
    if (action.kind === "withdraw" && d?.burrow?.borrowed?.length)
      p.blocked =
        "Cannot safely project health with missing oracle data. Repay borrows in the protocol first.";
  } else if (action.kind === "swap") {
    const input = swapToken(action.source);
    const output = swapToken(
      action.target || (action.source === "NEAR" ? "tUSDC" : "NEAR"),
    );
    if (!input || !output) throw new Error("Unsupported swap token");
    const poolId = poolFor(input.id, output.id);
    const amount = toBase(action.amount, input.decimals);
    const q = await swapQuote(input.id, output.id, amount);
    const slippage = Math.min(50, policy.max_slippage_bps);
    const minimum = minimumOut(q.amountOut, slippage);
    if (BigInt(minimum) <= 0n)
      throw new Error("Swap amount is too small for a positive minimum output");
    const pool = q.pool;
    const ri = Number(pool.amounts[pool.token_account_ids.indexOf(input.id)]),
      ro = Number(pool.amounts[pool.token_account_ids.indexOf(output.id)]);
    const impact = Math.max(
      0,
      (1 - Number(q.amountOut) / ((Number(amount) * ro) / ri)) * 100,
    );
    p.because =
      `Because Ref Finance has a live ${input.symbol}/${output.symbol} pool; the minimum output protects your quote.`;
    p.protocol = "Ref / Rhea DEX";
    p.contract = REF;
    p.quotedAt = q.quotedAt;
    p.headline = `You swap ${action.amount} ${action.source} → receive ≈${fromBase(q.amountOut, output.decimals)} ${output.symbol}`;
    p.deltas = [
      `−${action.amount} ${input.symbol}`,
      `+≥${fromBase(minimum, output.decimals)} ${output.symbol}`,
    ];
    p.sources.push({
      name: `Ref Finance pool #${poolId}`,
      at: q.quotedAt,
    });
    p.facts.push(
      {
        label: "Minimum received",
        value: `${fromBase(minimum, output.decimals)} ${output.symbol}`,
      },
      {
        label: "Price impact (includes pool fee)",
        value: `${impact.toFixed(2)}%`,
        warning: impact > 1,
      },
      {
        label: "Pool fee",
        value: `${pool.total_fee / 100}% · ≈${((Number(action.amount) * pool.total_fee) / 10000).toFixed(6)} ${input.symbol}`,
      },
      {
        label: "Slippage limit",
        value: `${slippage / 100}% · policy maximum ${policy.max_slippage_bps / 100}%`,
      },
      {
        label: "Gas & storage",
        value:
          "Paid in NEAR; first use also registers storage. NEAR output remains wNEAR.",
      },
    );
    ga = {
      kind: "RefSwap",
      pool_id: poolId,
      token_in: input.id,
      token_out: output.id,
      amount_in: amount,
      min_amount_out: minimum,
    };
  } else if (
    action.kind === "perp_open" ||
    action.kind === "perp_close" ||
    action.kind === "close_all"
  ) {
    p.protocol = "Orderly testnet";
    p.contract = "Orderly API · Arbitrum Sepolia 421614";
    p.limit = `Max ${policy.max_leverage_x100 / 100}x leverage · $${policy.max_perp_notional_usd} notional · ${limitText(policy, spent, "perp_usd")}`;
    if (action.kind === "perp_open") {
      // Direct call: a Worker fetching its own workers.dev origin is blocked by Cloudflare.
      const rows = await orderlyMarkets().catch(() => {
        throw new Error("Perps unavailable");
      });
      const market: any = rows.find((m) => m.symbol === action.symbol);
      if (!market)
        throw new Error(
          `Perps unavailable: ${action.symbol} is not listed on testnet`,
        );
      p.headline = `${action.side === "BUY" ? "Long" : "Short"} ${action.symbol.replace("PERP_", "").replace("_USDC", "")} · $${action.notionalUsd} notional at ${action.leverage}x`;
      p.deltas = [
        `Exposure ${action.side === "BUY" ? "+" : "−"}$${action.notionalUsd}`,
        `Estimated initial margin $${(action.notionalUsd / action.leverage).toFixed(2)} USDC`,
      ];
      p.sources.push({ name: "Orderly live mark + funding", at: Date.now() });
      p.facts.push(
        { label: "Mark price", value: `$${market.markPrice}` },
        {
          label: "Funding rate",
          value: `${(Number(market.fundingRate) * 100).toFixed(5)}% · variable`,
        },
        {
          label: "Liquidation estimate",
          value: `≈$${(Number(market.markPrice) * (1 + (action.side === "BUY" ? -1 : 1) / action.leverage)).toFixed(2)} · isolated arithmetic estimate; actual cross-margin liquidation depends on account equity & maintenance`,
        },
        {
          label: "Margin mode / fees",
          value:
            "Cross margin · exchange fees charged on fills; available in Orderly receipts",
        },
        {
          label: "Stop controls",
          value:
            "No automatic stop-loss. Close position or close all separately. Caps do not limit losses.",
        },
      );
      p.blocked =
        action.leverage > policy.max_leverage_x100 / 100
          ? "LEVERAGE"
          : action.notionalUsd > policy.max_perp_notional_usd
            ? "NOTIONAL"
            : policyCheck(
                policy,
                spent,
                "perp_usd",
                String(Math.ceil(action.notionalUsd)),
              );
      p.tryAnyway = !!p.blocked && !walletMode;
    } else {
      p.headline =
        action.kind === "close_all"
          ? "Close all open perps (reduce only)"
          : `Close ${action.symbol} (reduce only)`;
      p.deltas = [
        "Reduce open exposure; realized PnL and fees determined at fill",
      ];
    }
  } else if (action.kind === "bridge_quote") {
    const options = bridgeDestinations(await intentsTokens()).filter(
      (t) => t.blockchain === action.destination,
    );
    const dest = options.find((t) => t.symbol === "USDC") || options[0];
    if (!dest) throw new Error("Bridge destination unavailable");
    const q = await bridgeQuote(action.source, dest.assetId, action.amount);
    p.headline = `Quote: ${q.amountIn} ${q.source} → ≈${q.amountOut} ${q.destination}`;
    p.deltas = ["No funds move · mainnet dry quote with preview addresses"];
    p.protocol = "NEAR Intents 1Click";
    p.contract = dest.assetId;
    p.quoteOnly = true;
    p.facts.push(
      {
        label: "API estimate",
        value:
          q.timeEstimateSec === null ? "Unavailable" : `${q.timeEstimateSec}s`,
      },
      { label: "Reference", value: q.correlationId },
    );
    p.sources.push({ name: "1Click live dry quote", at: q.quotedAt });
  } else {
    p.headline =
      action.kind === "portfolio"
        ? "Your portfolio is ready to inspect"
        : "How your leash works";
    p.deltas = [
      action.kind === "portfolio"
        ? "Open Portfolio for live balances, protocol positions and receipts."
        : "Agent requests are bounded by caps, allowed protocols and expiry. Pause stops new calls; revoke deletes the key. Close positions separately.",
    ];
    if (
      action.kind === "explain" &&
      /Only NEAR|Unsupported|Specify|Choose|Amount must/.test(action.topic)
    )
      p.deltas = [action.topic];
    p.quoteOnly = true;
  }
  if (ga) {
    p.guardAction = ga;
    const meta = amountMeta(ga);
    p.limit = limitText(policy, spent, meta.asset);
    const rejection = policyCheck(policy, spent, meta.asset, meta.amount);
    if (rejection && !p.blocked) {
      p.blocked = rejection;
      p.tryAnyway = !walletMode;
    }
    if (!policy.allowed_protocols.includes(p.contract)) {
      p.blocked = "PROTOCOL_NOT_ALLOWED";
      p.tryAnyway = !walletMode;
    }
  }
  p.quotedAt = Date.now();
  return p;
}

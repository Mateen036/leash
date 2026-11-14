export function formatAmount(value: string | number, decimals = 4): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const precision = Math.min(4, Math.max(0, decimals));
  if (n !== 0 && Math.abs(n) < 10 ** -precision)
    return `${n < 0 ? "−" : ""}<${10 ** -precision}`;
  return n.toLocaleString("en-US", { maximumFractionDigits: precision });
}

export function shortAccount(id: string): string {
  return id.length > 20 ? `${id.slice(0, 8)}…${id.slice(-7)}` : id;
}

export function protocolName(value: string): string {
  if (/ref-finance|ref.*get_|RefSwap/i.test(value)) return "Ref Finance";
  if (/burrow/i.test(value)) return "Rhea Lending";
  if (/linear/i.test(value)) return "LiNEAR";
  if (/orderly|PERP_/i.test(value)) return "Orderly";
  if (/intents|1click/i.test(value)) return "NEAR Intents";
  if (value === "wrap.testnet") return "Wrapped NEAR";
  return plainText(value);
}

export function assetLabel(value: string): string {
  if (value === "perp_usd") return "USD exposure";
  if (value === "usdc.fakes.testnet") return "Test USDC";
  if (value === "usdtt.fakes.testnet") return "Test USDT";
  return plainText(value);
}

/** Presentation only: keep server payloads and transaction amounts untouched. */
export function plainText(value: string): string {
  const text = value.replace(/\bPERP_(\w+)_USDC\b/g, "$1");
  if (
    /^\s*[{[]|```|\b(?:yocto|base units|e24)\b|\b[A-Z]+(?:_[A-Z]+){2,}\b/.test(
      text,
    )
  )
    return "See transaction details";
  return text
    .replace(
      /\b(?:agent_execute|authorize_perp|ft_transfer_call|storage_deposit|deposit_and_stake|get_return|get_pool|get_asset|get_account|get_policy|ft_price|set_policy|revoke_agent|oracle_call)\b/g,
      "protocol action",
    )
    .replace(/\bpool\s+\d+/gi, "liquidity pool")
    .replace(/\b[\w-]+(?:\.[\w-]+)*\.(?:testnet|near)\b/g, shortAccount)
    .replace(/\b0x[a-fA-F0-9]{24,}\b/g, shortAccount)
    .replace(/(?<![\w.])\d+(?:,\d{3})*(?:\.\d+)?(?![\w.])/g, (n) =>
      formatAmount(n.replaceAll(",", "")),
    );
}

export function actionName(value: string): string {
  const names: Record<string, string> = {
    LinearStake: "Stake",
    LinearUnstake: "Unstake",
    RefSwap: "Swap",
    BurrowSupply: "Supply",
    BurrowWithdraw: "Withdraw",
    Perp: "Perps trade",
    authorize_perp: "Perps trade approved",
    AUTHORIZED: "Approved",
    success: "Confirmed",
    SUCCESS: "Confirmed",
    COMPLETED: "Confirmed",
    pending: "Pending",
    WAITING_DEPOSIT: "Waiting for deposit",
    PENDING_DEPOSIT: "Checking deposit",
    PROCESSING: "Transfer in progress",
    KNOWN_DEPOSIT_TX: "Deposit received",
    INCOMPLETE_DEPOSIT: "Deposit needs attention",
    FAILED: "Transfer stopped",
    REFUNDED: "Refund sent",
    revoke: "Agent revoked",
    pause: "Agent paused",
  };
  return names[value] || plainText(value);
}

/** Translate untrusted API, wallet and contract errors before rendering them. */
export function errorText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw instanceof Error) return raw.message;
  if (raw && typeof raw === "object") {
    const value = raw as Record<string, unknown>;
    return errorText(value.message ?? value.error ?? value.cause);
  }
  return "";
}

const rules: [RegExp, string, string?][] = [
  [
    /CAP_PER_ACTION|over your per.action limit/i,
    "Blocked: over your per-trade limit",
  ],
  [/CAP_DAILY|\bDAILY\b/i, "Blocked: daily limit reached"],
  [/PAUSED/i, "Agent is paused", "Resume it in Guardrails."],
  [/quote.*expir|preview.*expir/i, "Quote expired — get a new quote"],
  [
    /EXPIRED|limits have expired/i,
    "Your limits have expired — renew them in Guardrails",
  ],
  [
    /PROTOCOL_NOT_ALLOWED|app isn't on your allow-list/i,
    "That app isn't on your allow-list",
  ],
  [
    /ASSET_NOT_ALLOWED|token isn't on your allow-list/i,
    "That token isn't on your allow-list",
  ],
  [
    /SLIPPAGE|\bE68\b|price moved too much/i,
    "Price moved too much — try again",
  ],
  [/LEVERAGE|max_leverage/i, "Blocked: leverage above your limit"],
  [
    /BUSY|another action|still settling/i,
    "Another action is still finishing — try again in a moment",
  ],
  [
    /faucet.*cooldown|cooldown.*faucet|already claimed/i,
    "Already claimed — try again later",
  ],
  [
    /relayer.*(?:fund|balance)|Exceeded|LackBalanceForState|guest.*(?:fail|busy|creat.*error)|\b429\b/i,
    "Guest sign-ups are busy — try again or connect a wallet",
  ],
  [
    /LOW_BALANCE|NotEnoughBalance|not enough|insufficient.*(?:balance|fund|collateral)|withdrawal exceeds.*balance/i,
    "Not enough balance",
  ],
  [
    /too many requests|\brate\b|rate.?limit/i,
    "Too many requests — wait a minute",
  ],
  [
    /user.*reject|reject.*user|wallet.*(?:closed|cancel)|cancel.*wallet|user.*cancel/i,
    "Cancelled in your wallet",
  ],
  [
    /network|fetch.*fail|fail.*fetch|timeout|timed out|ECONN/i,
    "Network problem — try again",
  ],
  [
    /NOT_AGENT|AGENT_REVOKED|\bREVOKED\b|no longer.*author/i,
    "Agent access has been revoked",
    "Check your access in Guardrails.",
  ],
  [
    /NOTIONAL|position.*(?:exceeds|above).*limit/i,
    "Blocked: position above your limit",
  ],
  [
    /INPUT_REFUNDED|protocol refunded/i,
    "Your tokens were returned — try a new quote",
  ],
  [
    /PROTOCOL_FAILED|OUTPUT_NOT_DELIVERED/i,
    "The action didn’t complete",
    "Check the transaction before trying again.",
  ],
  [/future expiry/i, "Choose an expiry in the future"],
  [/daily cap must cover/i, "Daily limit must cover one trade"],
  [
    /amount.*(?:invalid|positive|small)|positive.*amount/i,
    "Enter a valid amount",
  ],
  [/\$25|25.*cap/i, "Keep the total under $25, including fees"],
  [/recipient|destination address/i, "Check your destination address"],
  [
    /perps unavailable|market.*unavailable/i,
    "Market unavailable — try again shortly",
  ],
];

export function friendlyError(raw: unknown): { title: string; hint?: string } {
  const text = errorText(raw);
  // Preserve our own messages when an error passes through several UI surfaces.
  const existing = rules.find(([, title]) => text === title);
  const match = existing ?? rules.find(([pattern]) => pattern.test(text));
  return match
    ? { title: match[1], ...(match[2] ? { hint: match[2] } : {}) }
    : { title: "Something went wrong — try again" };
}

/** Diagnostic text is optional, collapsed, and never includes credentials or a stack. */
export function errorDetail(raw: unknown): string {
  const text = errorText(raw);
  if (/^\s*[{[]|```/.test(text))
    return "The service could not complete this request. Check your activity before trying again.";
  return text
    .split(/\n\s*at\s/)[0]
    .replace(/\b(?:Error|TypeError|ReferenceError):\s*/g, "")
    .replace(/(?:ed25519:|(?:0x)?[a-f\d]{64}\b|Bearer\s+)\S*/gi, "[hidden]")
    .replace(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/g, "[technical reference]")
    .replace(/(?:\/[\w.-]+){2,}/g, "[technical reference]")
    .replace(/\b[a-z]+(?:_[a-z]+)+\b/g, "[technical reference]")
    .replace(/\b(?:yocto\w*|base units|\d+e\d+)\b/gi, "[amount]")
    .slice(0, 500);
}

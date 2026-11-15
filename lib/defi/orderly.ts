import { requireTestnet } from "@/lib/near/network";
import { near } from "@/lib/near/config";
import { networkEnv } from "@/lib/near/env";
import { ed25519 } from "@noble/curves/ed25519";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { hashTypedData, type Hex } from "viem";
import { signerFor, type SignerMode } from "./chainsig";

export const ORDERLY_FAUCET =
  "https://testnet-operator-evm.orderly.org/v1/faucet/usdc";
export function brokerId() {
  const id =
    networkEnv("ORDERLY_BROKER_ID") ??
    (near.network === "testnet" ? "demo" : "");
  if (!id)
    throw new OrderlyError(
      "Configure MAINNET_ORDERLY_BROKER_ID before trading on mainnet",
      503,
    );
  return id;
}
const domain = () =>
  ({
    name: "Orderly",
    version: "1",
    chainId: near.chainId,
    verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC",
  }) as const;
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58(bytes: Uint8Array) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let s = "";
  while (n > 0n) {
    s = B58[Number(n % 58n)] + s;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b === 0) s = "1" + s;
    else break;
  }
  return s;
}
function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function env(name: string) {
  const v = networkEnv(name);
  if (!v) throw new Error(`Server is missing ${name}`);
  return v;
}

export class OrderlyError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

/** Deterministic trading key (scope read,trading — Orderly keys with this scope cannot withdraw). */
export function orderlyKeyFor(nearAccountId: string) {
  const seed = hmac(
    sha256,
    new TextEncoder().encode(env("ORDERLY_DERIVE_SECRET")),
    new TextEncoder().encode(
      (near.network === "testnet" ? "orderly-key:" : "mainnet:orderly-key:") +
        nearAccountId,
    ),
  );
  const pub = ed25519.getPublicKey(seed);
  return { seed, publicKey: `ed25519:${b58(pub)}` };
}

async function pub<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(near.orderlyApi + path, {
    ...init,
    signal: AbortSignal.timeout(15_000),
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false)
    throw new OrderlyError(
      `Orderly ${path.split("?")[0]}: ${j.message || r.status}`,
      r.status >= 500 ? 502 : 400,
    );
  return j;
}
/** Production lookup failures must never look like an empty/unregistered account. */
async function optionalLookup(path: string) {
  return pub(path).catch((error) => {
    if (
      near.network === "testnet" ||
      /not found|does not exist|not exist|: 404$/i.test(String(error?.message))
    )
      return null;
    throw error;
  });
}
export type OrderlySession = {
  nearAccountId: string;
  accountId: string;
  address: string;
  mode: SignerMode;
};

async function signed<T = any>(
  s: OrderlySession,
  method: "GET" | "POST" | "DELETE" | "PUT",
  path: string,
  body?: object,
): Promise<T> {
  const key = orderlyKeyFor(s.nearAccountId);
  const ts = Date.now();
  const bodyText = body ? JSON.stringify(body) : "";
  const sig = ed25519.sign(
    new TextEncoder().encode(`${ts}${method}${path}${bodyText}`),
    key.seed,
  );
  const r = await fetch(near.orderlyApi + path, {
    method,
    body: bodyText || undefined,
    signal: AbortSignal.timeout(15_000),
    headers: {
      "content-type":
        method === "GET" || method === "DELETE"
          ? "application/x-www-form-urlencoded"
          : "application/json",
      "orderly-timestamp": String(ts),
      "orderly-account-id": s.accountId,
      "orderly-key": key.publicKey,
      "orderly-signature": b64url(sig),
    },
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false)
    throw new OrderlyError(
      `Orderly ${method} ${path.split("?")[0]}: ${j.message || r.status}`,
      r.status >= 500 ? 502 : 400,
    );
  return j;
}

const preferredMode = (): SignerMode =>
  networkEnv("LEASH_PERPS_SIGNER") === "fallback"
    ? "server-derived"
    : "chain-signatures";

/** Finds or creates the Orderly testnet account for a NEAR account. Chain Signatures first, server-derived fallback. */
export async function ensureAccount(nearAccountId: string): Promise<
  OrderlySession & {
    created: boolean;
    keyAdded: boolean;
    signerTxs: string[];
    note?: string;
  }
> {
  brokerId();
  const modes: SignerMode[] =
    near.network === "mainnet"
      ? ["chain-signatures"]
      : preferredMode() === "chain-signatures"
        ? ["chain-signatures", "server-derived"]
        : ["server-derived"];
  let lastError: unknown;
  for (const mode of modes) {
    try {
      const signer = await signerFor(nearAccountId, mode);
      const address = signer.address;
      let created = false,
        keyAdded = false;
      const signerTxs: string[] = [];
      const acct = await optionalLookup(
        `/v1/get_account?address=${address}&broker_id=${brokerId()}`,
      );
      let accountId: string | undefined = acct?.data?.account_id;
      if (!accountId) {
        const nonce = (await pub(`/v1/registration_nonce`)).data
          .registration_nonce;
        const message = {
          brokerId: brokerId(),
          chainId: near.chainId,
          timestamp: Date.now(),
          registrationNonce: String(nonce),
        };
        const digest = hashTypedData({
          domain: domain(),
          primaryType: "Registration",
          types: {
            Registration: [
              { name: "brokerId", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "timestamp", type: "uint64" },
              { name: "registrationNonce", type: "uint256" },
            ],
          },
          message: {
            ...message,
            chainId: BigInt(near.chainId),
            timestamp: BigInt(message.timestamp),
            registrationNonce: BigInt(message.registrationNonce),
          },
        });
        const signature = await signer.sign(digest);
        const reg = await pub(`/v1/register_account`, {
          method: "POST",
          body: JSON.stringify({ message, signature, userAddress: address }),
        });
        accountId = reg.data.account_id;
        created = true;
      }
      const key = orderlyKeyFor(nearAccountId);
      const existing = await optionalLookup(
        `/v1/get_orderly_key?account_id=${accountId}&orderly_key=${encodeURIComponent(key.publicKey)}`,
      );
      if (!existing?.data?.orderly_key) {
        const ts = Date.now();
        const message = {
          brokerId: brokerId(),
          chainId: near.chainId,
          orderlyKey: key.publicKey,
          scope: "read,trading",
          timestamp: ts,
          expiration: ts + 365 * 86_400_000,
        };
        const digest = hashTypedData({
          domain: domain(),
          primaryType: "AddOrderlyKey",
          types: {
            AddOrderlyKey: [
              { name: "brokerId", type: "string" },
              { name: "chainId", type: "uint256" },
              { name: "orderlyKey", type: "string" },
              { name: "scope", type: "string" },
              { name: "timestamp", type: "uint64" },
              { name: "expiration", type: "uint64" },
            ],
          },
          message: {
            ...message,
            chainId: BigInt(near.chainId),
            timestamp: BigInt(ts),
            expiration: BigInt(message.expiration),
          },
        });
        const signature = await signer.sign(digest);
        await pub(`/v1/orderly_key`, {
          method: "POST",
          body: JSON.stringify({ message, signature, userAddress: address }),
        });
        keyAdded = true;
      }
      return {
        nearAccountId,
        accountId: accountId!,
        address,
        mode,
        created,
        keyAdded,
        signerTxs,
        note:
          mode !== preferredMode()
            ? "Chain Signatures unavailable; using the server-derived fallback key"
            : undefined,
      };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new OrderlyError("Could not set up the Orderly account");
}

/** Read-only lookup of an existing session (no signing). */
export async function findSession(
  nearAccountId: string,
): Promise<OrderlySession | null> {
  brokerId();
  for (const mode of (near.network === "mainnet"
    ? ["chain-signatures"]
    : ["chain-signatures", "server-derived"]) as SignerMode[]) {
    try {
      const { address } = await signerFor(nearAccountId, mode);
      const acct = await optionalLookup(
        `/v1/get_account?address=${address}&broker_id=${brokerId()}`,
      );
      if (acct?.data?.account_id)
        return {
          nearAccountId,
          accountId: acct.data.account_id,
          address,
          mode,
        };
    } catch (error) {
      if (near.network === "mainnet") throw error;
      /* try the other testnet signer */
    }
  }
  return null;
}

export async function requestFaucet(address: string) {
  requireTestnet("Orderly faucet");
  const r = await fetch(ORDERLY_FAUCET, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_address: address,
      broker_id: brokerId(),
      chain_id: String(near.chainId),
    }),
  });
  const j: any = await r.json().catch(() => ({}));
  return {
    ok: r.ok && j.success !== false,
    message: j.message as string | undefined,
  };
}

export async function markets() {
  const j = await pub(`/v1/public/futures`);
  return (j.data.rows as any[])
    .filter((m) => /^PERP_[A-Z0-9]+_USDC$/.test(m.symbol))
    .map((m) => ({
      symbol: m.symbol as string,
      markPrice: Number(m.mark_price),
      indexPrice: Number(m.index_price),
      fundingRate: Number(m.est_funding_rate ?? m.last_funding_rate ?? 0),
      change24h: m["24h_open"]
        ? (Number(m["24h_close"]) - Number(m["24h_open"])) /
          Number(m["24h_open"])
        : 0,
      volume24h: Number(m["24h_amount"] ?? 0),
    }));
}
export async function symbolInfo(symbol: string) {
  const j = await pub(`/v1/public/info/${symbol}`);
  return {
    baseTick: Number(j.data.base_tick),
    baseMin: Number(j.data.base_min),
    minNotional: Number(j.data.min_notional ?? 10),
    quoteTick: Number(j.data.quote_tick),
  };
}
export const holdings = (s: OrderlySession) =>
  signed(s, "GET", "/v1/client/holding").then(
    (j) =>
      j.data.holding as { token: string; holding: number; frozen: number }[],
  );
export const positions = (s: OrderlySession) =>
  signed(s, "GET", "/v1/positions").then((j) => j.data);
export const setLeverage = (
  s: OrderlySession,
  symbol: string,
  leverage: number,
) => signed(s, "POST", "/v1/client/leverage", { symbol, leverage });
export const accountInfo = (s: OrderlySession) =>
  signed(s, "GET", "/v1/client/info").then((j) => j.data);
export async function placeMarket(
  s: OrderlySession,
  o: {
    symbol: string;
    side: "BUY" | "SELL";
    quantity: number;
    reduceOnly?: boolean;
    clientOrderId?: string;
  },
) {
  const body: any = {
    symbol: o.symbol,
    order_type: "MARKET",
    side: o.side,
    order_quantity: o.quantity,
  };
  if (o.reduceOnly) body.reduce_only = true;
  if (o.clientOrderId) body.client_order_id = o.clientOrderId;
  return signed(s, "POST", "/v1/order", body).then(
    (j) => j.data as { order_id: number; client_order_id?: string },
  );
}
export const getOrder = (s: OrderlySession, id: number) =>
  signed(s, "GET", `/v1/order/${id}`).then((j) => j.data);

export const LEDGER_TESTNET = "0x1826B75e2ef249173FC735149AE4B8e9ea10abff";
/** Wallet-signed (EIP-712) internal USDC transfer from a server-held Orderly testnet account to another Orderly account. */
export async function internalTransfer(
  from: OrderlySession,
  receiverAccountId: string,
  amountUsdc: number,
) {
  requireTestnet("Reserve transfers");
  const signer = await signerFor(from.nearAccountId, from.mode);
  const nonce = String(
    (await signed(from, "GET", "/v1/transfer_nonce")).data.transfer_nonce,
  );
  const amount = BigInt(Math.round(amountUsdc * 1e6));
  const digest = hashTypedData({
    domain: {
      name: "Orderly",
      version: "1",
      chainId: near.chainId,
      verifyingContract: LEDGER_TESTNET,
    },
    primaryType: "InternalTransfer",
    types: {
      InternalTransfer: [
        { name: "receiver", type: "bytes32" },
        { name: "token", type: "string" },
        { name: "amount", type: "uint256" },
        { name: "transferNonce", type: "uint64" },
      ],
    },
    message: {
      receiver: receiverAccountId as Hex,
      token: "USDC",
      amount,
      transferNonce: BigInt(nonce),
    },
  });
  const signature = await signer.sign(digest);
  const body = {
    message: {
      receiver: receiverAccountId,
      token: "USDC",
      amount: amount.toString(),
      transferNonce: nonce,
      chainId: String(near.chainId),
      chainType: "EVM",
    },
    signature,
    userAddress: signer.address,
    verifyingContract: LEDGER_TESTNET,
  };
  return signed(from, "POST", "/v2/internal_transfer", body).then(
    (j) => j.data,
  );
}

/** Server-held Orderly testnet account (server-derived key) pre-funded with test USDC, used to top up new perps accounts instantly. */
export const RESERVE_NEAR_ID = "perps-reserve.leash-11141537.testnet";
export const STARTER_USDC = 50;
export async function reserveSession(): Promise<OrderlySession> {
  requireTestnet("Perps reserve");
  const { address } = await signerFor(RESERVE_NEAR_ID, "server-derived");
  const acct = await pub(
    `/v1/get_account?address=${address}&broker_id=${brokerId()}`,
  );
  return {
    nearAccountId: RESERVE_NEAR_ID,
    accountId: acct.data.account_id,
    address,
    mode: "server-derived",
  };
}
/** Sends starter test USDC from the reserve. Returns the amount sent, or 0 if the reserve is empty or the transfer failed. */
export async function grantStarterUsdc(
  receiverAccountId: string,
): Promise<number> {
  requireTestnet("Starter USDC");
  try {
    const r = await reserveSession();
    if (r.accountId === receiverAccountId) return 0;
    const left =
      (await holdings(r)).find((x) => x.token === "USDC")?.holding ?? 0;
    if (left < STARTER_USDC + 1) {
      requestFaucet(r.address).catch(() => undefined);
      return 0;
    }
    await internalTransfer(r, receiverAccountId, STARTER_USDC);
    if (left < 300) requestFaucet(r.address).catch(() => undefined);
    return STARTER_USDC;
  } catch {
    return 0;
  }
}

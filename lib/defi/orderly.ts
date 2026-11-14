import { ed25519 } from "@noble/curves/ed25519";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { hashTypedData, type Hex } from "viem";
import { signerFor, type SignerMode } from "./chainsig";

export const ORDERLY_API = "https://testnet-api.orderly.org";
export const ORDERLY_FAUCET = "https://testnet-operator-evm.orderly.org/v1/faucet/usdc";
export const BROKER_ID = "demo";
export const CHAIN_ID = 421614;
const DOMAIN = { name: "Orderly", version: "1", chainId: CHAIN_ID, verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" } as const;
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58(bytes: Uint8Array) { let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b); let s = ""; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const b of bytes) { if (b === 0) s = "1" + s; else break; } return s; }
function b64url(bytes: Uint8Array) { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function env(name: string) { const v = process.env[name]; if (!v) throw new Error(`Server is missing ${name}`); return v; }

export class OrderlyError extends Error { constructor(message: string, public status = 502) { super(message); } }

/** Deterministic trading key (scope read,trading — Orderly keys with this scope cannot withdraw). */
export function orderlyKeyFor(nearAccountId: string) {
  const seed = hmac(sha256, new TextEncoder().encode(env("ORDERLY_DERIVE_SECRET")), new TextEncoder().encode("orderly-key:" + nearAccountId));
  const pub = ed25519.getPublicKey(seed);
  return { seed, publicKey: `ed25519:${b58(pub)}` };
}

async function pub<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(ORDERLY_API + path, { ...init, signal: AbortSignal.timeout(15_000), headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw new OrderlyError(`Orderly ${path.split("?")[0]}: ${j.message || r.status}`, r.status >= 500 ? 502 : 400);
  return j;
}
export type OrderlySession = { nearAccountId: string; accountId: string; address: string; mode: SignerMode };

async function signed<T = any>(s: OrderlySession, method: "GET" | "POST" | "DELETE" | "PUT", path: string, body?: object): Promise<T> {
  const key = orderlyKeyFor(s.nearAccountId);
  const ts = Date.now();
  const bodyText = body ? JSON.stringify(body) : "";
  const sig = ed25519.sign(new TextEncoder().encode(`${ts}${method}${path}${bodyText}`), key.seed);
  const r = await fetch(ORDERLY_API + path, { method, body: bodyText || undefined, signal: AbortSignal.timeout(15_000), headers: {
    "content-type": method === "GET" || method === "DELETE" ? "application/x-www-form-urlencoded" : "application/json",
    "orderly-timestamp": String(ts), "orderly-account-id": s.accountId, "orderly-key": key.publicKey, "orderly-signature": b64url(sig) } });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw new OrderlyError(`Orderly ${method} ${path.split("?")[0]}: ${j.message || r.status}`, r.status >= 500 ? 502 : 400);
  return j;
}

const preferredMode = (): SignerMode => (process.env.LEASH_PERPS_SIGNER === "fallback" ? "server-derived" : "chain-signatures");

/** Finds or creates the Orderly testnet account for a NEAR account. Chain Signatures first, server-derived fallback. */
export async function ensureAccount(nearAccountId: string): Promise<OrderlySession & { created: boolean; keyAdded: boolean; signerTxs: string[]; note?: string }> {
  const modes: SignerMode[] = preferredMode() === "chain-signatures" ? ["chain-signatures", "server-derived"] : ["server-derived"];
  let lastError: unknown;
  for (const mode of modes) {
    try {
      const signer = await signerFor(nearAccountId, mode);
      const address = signer.address;
      let created = false, keyAdded = false;
      const signerTxs: string[] = [];
      const acct = await pub(`/v1/get_account?address=${address}&broker_id=${BROKER_ID}`).catch(() => null);
      let accountId: string | undefined = acct?.data?.account_id;
      if (!accountId) {
        const nonce = (await pub(`/v1/registration_nonce`)).data.registration_nonce;
        const message = { brokerId: BROKER_ID, chainId: CHAIN_ID, timestamp: Date.now(), registrationNonce: String(nonce) };
        const digest = hashTypedData({ domain: DOMAIN, primaryType: "Registration", types: { Registration: [
          { name: "brokerId", type: "string" }, { name: "chainId", type: "uint256" }, { name: "timestamp", type: "uint64" }, { name: "registrationNonce", type: "uint256" }] },
          message: { ...message, chainId: BigInt(CHAIN_ID), timestamp: BigInt(message.timestamp), registrationNonce: BigInt(message.registrationNonce) } });
        const signature = await signer.sign(digest);
        const reg = await pub(`/v1/register_account`, { method: "POST", body: JSON.stringify({ message, signature, userAddress: address }) });
        accountId = reg.data.account_id; created = true;
      }
      const key = orderlyKeyFor(nearAccountId);
      const existing = await pub(`/v1/get_orderly_key?account_id=${accountId}&orderly_key=${encodeURIComponent(key.publicKey)}`).catch(() => null);
      if (!existing?.data?.orderly_key) {
        const ts = Date.now();
        const message = { brokerId: BROKER_ID, chainId: CHAIN_ID, orderlyKey: key.publicKey, scope: "read,trading", timestamp: ts, expiration: ts + 365 * 86_400_000 };
        const digest = hashTypedData({ domain: DOMAIN, primaryType: "AddOrderlyKey", types: { AddOrderlyKey: [
          { name: "brokerId", type: "string" }, { name: "chainId", type: "uint256" }, { name: "orderlyKey", type: "string" }, { name: "scope", type: "string" },
          { name: "timestamp", type: "uint64" }, { name: "expiration", type: "uint64" }] },
          message: { ...message, chainId: BigInt(CHAIN_ID), timestamp: BigInt(ts), expiration: BigInt(message.expiration) } });
        const signature = await signer.sign(digest);
        await pub(`/v1/orderly_key`, { method: "POST", body: JSON.stringify({ message, signature, userAddress: address }) });
        keyAdded = true;
      }
      return { nearAccountId, accountId: accountId!, address, mode, created, keyAdded, signerTxs,
        note: mode !== preferredMode() ? "Chain Signatures unavailable; using the server-derived fallback key" : undefined };
    } catch (e) { lastError = e; }
  }
  throw lastError instanceof Error ? lastError : new OrderlyError("Could not set up the Orderly account");
}

/** Read-only lookup of an existing session (no signing). */
export async function findSession(nearAccountId: string): Promise<OrderlySession | null> {
  for (const mode of ["chain-signatures", "server-derived"] as SignerMode[]) {
    try {
      const { address } = await signerFor(nearAccountId, mode);
      const acct = await pub(`/v1/get_account?address=${address}&broker_id=${BROKER_ID}`).catch(() => null);
      if (acct?.data?.account_id) return { nearAccountId, accountId: acct.data.account_id, address, mode };
    } catch { /* next */ }
  }
  return null;
}

export async function requestFaucet(address: string) {
  const r = await fetch(ORDERLY_FAUCET, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user_address: address, broker_id: BROKER_ID, chain_id: String(CHAIN_ID) }) });
  const j: any = await r.json().catch(() => ({}));
  return { ok: r.ok && j.success !== false, message: j.message as string | undefined };
}

export async function markets() {
  const j = await pub(`/v1/public/futures`);
  return (j.data.rows as any[]).filter((m) => /^PERP_[A-Z0-9]+_USDC$/.test(m.symbol)).map((m) => ({
    symbol: m.symbol as string, markPrice: Number(m.mark_price), indexPrice: Number(m.index_price), fundingRate: Number(m.est_funding_rate ?? m.last_funding_rate ?? 0),
    change24h: m["24h_open"] ? (Number(m["24h_close"]) - Number(m["24h_open"])) / Number(m["24h_open"]) : 0, volume24h: Number(m["24h_amount"] ?? 0),
  }));
}
export async function symbolInfo(symbol: string) {
  const j = await pub(`/v1/public/info/${symbol}`);
  return { baseTick: Number(j.data.base_tick), baseMin: Number(j.data.base_min), minNotional: Number(j.data.min_notional ?? 10), quoteTick: Number(j.data.quote_tick) };
}
export const holdings = (s: OrderlySession) => signed(s, "GET", "/v1/client/holding").then((j) => j.data.holding as { token: string; holding: number; frozen: number }[]);
export const positions = (s: OrderlySession) => signed(s, "GET", "/v1/positions").then((j) => j.data);
export const setLeverage = (s: OrderlySession, symbol: string, leverage: number) => signed(s, "POST", "/v1/client/leverage", { symbol, leverage });
export const accountInfo = (s: OrderlySession) => signed(s, "GET", "/v1/client/info").then((j) => j.data);
export async function placeMarket(s: OrderlySession, o: { symbol: string; side: "BUY" | "SELL"; quantity: number; reduceOnly?: boolean; clientOrderId?: string }) {
  const body: any = { symbol: o.symbol, order_type: "MARKET", side: o.side, order_quantity: o.quantity };
  if (o.reduceOnly) body.reduce_only = true;
  if (o.clientOrderId) body.client_order_id = o.clientOrderId;
  return signed(s, "POST", "/v1/order", body).then((j) => j.data as { order_id: number; client_order_id?: string });
}
export const getOrder = (s: OrderlySession, id: number) => signed(s, "GET", `/v1/order/${id}`).then((j) => j.data);

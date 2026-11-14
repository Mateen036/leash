import { FailoverRpcProvider, JsonRpcProvider } from "near-api-js";
import deployment from "./deployment.testnet.json";

/**
 * Public NEAR testnet RPCs. Cloudflare Workers share egress IPs, so a single free RPC
 * can answer 429 for requests that are not ours; every server read and write fails over.
 */
export function rpcUrls(): string[] {
  const primary =
    (typeof process !== "undefined" && process.env?.NEAR_RPC_URL) ||
    deployment.rpcUrl;
  return [
    ...new Set([
      primary,
      "https://near-testnet.drpc.org",
      "https://testnet-rpc.intea.rs",
      "https://rpc.testnet.near.org",
    ]),
  ];
}

const TRANSIENT =
  /429|rate limit|TIMEOUT|INTERNAL_ERROR|NO_SYNCED_BLOCKS|UNAVAILABLE_SHARD|NOT_SYNCED/i;

/** JSON-RPC call with failover on transport errors and rate limits. Contract/handler errors are returned as-is. */
export async function rpcCall(
  method: string,
  params: unknown,
  timeoutMs = 10_000,
): Promise<any> {
  let last: unknown = new Error("NEAR RPC unavailable");
  for (let round = 0; round < 3; round++) {
  if (round) await sleep(700 * 2 ** round);
  for (const url of rpcUrls()) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({ jsonrpc: "2.0", id: "leash", method, params }),
      });
      if (!r.ok) {
        last = new Error(`NEAR RPC HTTP ${r.status}`);
        continue;
      }
      const d = await r.json();
      if (d.error && TRANSIENT.test(JSON.stringify(d.error))) {
        last = new Error(JSON.stringify(d.error).slice(0, 200));
        continue;
      }
      return d;
    } catch (e) {
      last = e;
    }
  }
  }
  throw last;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RATE_LIMITED = /429|rate limit|DEPRECATED/i;

/**
 * Retries a signed write only when every RPC refused it with a rate limit (the request was
 * never accepted, so no transaction can be duplicated). Any other error is surfaced as-is.
 */
export async function withRpcRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e: any) {
      const errors: unknown[] = Array.isArray(e?.errors) ? e.errors : [e];
      const limited = errors.every((x: any) => RATE_LIMITED.test(String(x?.message || x)));
      if (!limited || i >= tries - 1) throw e;
      await sleep(1000 * 2 ** i);
    }
  }
}

export const failoverProvider = () =>
  new FailoverRpcProvider(rpcUrls().map((url) => new JsonRpcProvider({ url })));

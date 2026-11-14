import { near } from "./config";
import { rpcCall } from "./rpc";

/** Read-only RPC view call; works in the browser, Node and Cloudflare Workers. */
export async function view<T>(
  contractId: string,
  method: string,
  args: object = {},
): Promise<T> {
  const json = await rpcCall("query", {
        request_type: "call_function",
        finality: "optimistic",
        account_id: contractId,
        method_name: method,
        args_base64: btoa(JSON.stringify(args)),
      });
  if (json.error || json.result?.error)
    throw new Error(
      JSON.stringify(json.error || json.result.error).slice(0, 300),
    );
  return JSON.parse(
    new TextDecoder().decode(new Uint8Array(json.result.result)),
  ) as T;
}

export async function accountExists(accountId: string) {
  const json = await rpcCall("query", {
        request_type: "view_account",
        finality: "optimistic",
        account_id: accountId,
      });
  return !json.error && !json.result?.error;
}

export const getTokenBalance = (account_id: string) =>
  view<string>(near.token, "ft_balance_of", { account_id });

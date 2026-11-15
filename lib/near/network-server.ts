import { AsyncLocalStorage } from "node:async_hooks";
import { registerNetworkReader, type Network } from "./network";

const scope = new AsyncLocalStorage<Network>();
registerNetworkReader(() => scope.getStore());
export const withNetwork = <T>(network: Network, action: () => T): T =>
  scope.run(network, action);

/** An explicit header prevents a different tab's selection from changing a signed action. */
export function networkRoute(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const value = request.headers.get("x-leash-network") ?? "testnet";
    if (value !== "testnet" && value !== "mainnet")
      return Response.json(
        { error: "Choose testnet or mainnet" },
        { status: 400 },
      );
    return withNetwork(value, async () => {
      const response = await handler(request);
      response.headers.set("cache-control", "no-store");
      response.headers.set("x-leash-network", value);
      response.headers.append("vary", "x-leash-network");
      return response;
    });
  };
}

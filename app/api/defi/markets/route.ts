import { near } from "@/lib/near/config";
import { networkRoute } from "@/lib/near/network-server";
import { view } from "@/lib/defi/server";
import {} from "@/lib/defi/tokens";
import { fail } from "@/lib/near/api";
async function handleGET() {
  try {
    const [assets, pool] = await Promise.all([
      view<[string, any][]>(near.burrow, "get_assets_paged", {
        from_index: 0,
        limit: 30,
      }),
      view<any>(near.ref, "get_pool", { pool_id: near.pool }),
    ]);
    const markets = await Promise.all(
      assets.map(async ([token, asset]) => {
        const details = await view<any>(near.burrow, "get_asset", {
          token_id: token,
        }).catch(() => null);
        return {
          token,
          supplyApr: details?.supply_apr ?? null,
          borrowed: asset.borrowed.balance,
          supplied: asset.supplied.balance,
          extraDecimals: asset.config.extra_decimals,
        };
      }),
    );
    return Response.json({ markets, pool, quotedAt: Date.now() });
  } catch (e) {
    return fail(e);
  }
}

export const GET = networkRoute(handleGET);

import { view } from "@/lib/defi/server";
import { BURROW, REF, SWAP_POOL } from "@/lib/defi/tokens";
import { fail } from "@/lib/near/api";
export async function GET() {
  try {
    const [assets, pool] = await Promise.all([
      view<[string, any][]>(BURROW, "get_assets_paged", {
        from_index: 0,
        limit: 30,
      }),
      view<any>(REF, "get_pool", { pool_id: SWAP_POOL }),
    ]);
    const markets = await Promise.all(
      assets.map(async ([token, asset]) => {
        const details = await view<any>(BURROW, "get_asset", {
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

import { NextResponse } from "next/server";
import { fail, limit } from "@/lib/near/api";
import { verifyPerpAuth } from "@/lib/defi/perps-auth";
import { ensureAccount, grantStarterUsdc, holdings, requestFaucet } from "@/lib/defi/orderly";

const usdcOf = (h: { token: string; holding: number }[]) => h.find((x) => x.token === "USDC")?.holding ?? 0;

export async function POST(request: Request) {
  try {
    limit(request, "perps-bootstrap", 4);
    const { auth } = await request.json();
    const id = await verifyPerpAuth(auth, {});
    const s = await ensureAccount(id);
    let usdc = usdcOf(await holdings(s).catch(() => []));
    let faucetRequested = false;
    let starterUsdc = 0;
    if (usdc <= 0) {
      // Orderly's public faucet is slow and unreliable on testnet, so send starter USDC from Leash's reserve account first.
      starterUsdc = await grantStarterUsdc(s.accountId);
      if (starterUsdc > 0) {
        for (let i = 0; i < 4 && usdc <= 0; i++) {
          await new Promise((r) => setTimeout(r, 1200));
          usdc = usdcOf(await holdings(s).catch(() => []));
        }
        if (usdc <= 0) usdc = starterUsdc;
      } else faucetRequested = (await requestFaucet(s.address)).ok;
    }
    return NextResponse.json({ address: s.address, signerMode: s.mode, accountId: s.accountId, registered: true, created: s.created, keyAdded: s.keyAdded, faucetRequested, starterUsdc, usdcBalance: usdc, note: s.note });
  } catch (e) { return fail(e); }
}

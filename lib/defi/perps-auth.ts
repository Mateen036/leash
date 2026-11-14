import { NearError, verifyWalletSignature, isGuestAccount, type WalletAuth } from "@/lib/near/server";
import { verifyGuestRequest } from "./server";
import { actionDigest } from "./tokens";

export type PerpAuth = { accountId: string; message: string; publicKey: string; signature: string; kind?: "nep413"; nonce?: string };
/** Guests sign with their browser key; wallet users sign NEP-413. Message = leash_perp|<digest>|<ts>. */
export async function verifyPerpAuth(auth: PerpAuth, payload: object) {
  const expected = ["leash_perp", actionDigest(payload)];
  if (auth.kind === "nep413") {
    if (auth.message.split("|").slice(0, -1).join("|") !== expected.join("|")) throw new NearError("Signed request does not match", 401);
    await verifyWalletSignature(auth as WalletAuth);
    return auth.accountId;
  }
  if (!isGuestAccount(auth.accountId)) throw new NearError("Unknown account type", 401);
  await verifyGuestRequest(auth, expected);
  return auth.accountId;
}

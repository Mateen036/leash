import { near, isGuestAccount } from "./config";

/** Methods the gasless relayer will sponsor, per receiver contract. */
export function allowedMethods(receiverId: string): string[] | undefined {
  if (receiverId === near.token) return ["faucet"];
  return undefined;
}
const MAX_GAS = 150_000_000_000_000n;

export type RelayAction = {
  methodName: string;
  args: Uint8Array;
  gas: bigint;
  deposit: bigint;
} | null;
export type RelayCheck = {
  senderId: string;
  receiverId: string;
  actions: RelayAction[];
};

/** Returns a reason string when the delegate must NOT be sponsored, otherwise null. */
export function rejectReason({
  senderId,
  receiverId,
  actions,
}: RelayCheck): string | null {
  if (!isGuestAccount(senderId))
    return "Only Leash guest accounts are sponsored";
  const allowed = allowedMethods(receiverId);
  if (!allowed) return "Receiver is not a Leash contract";
  if (!actions.length || actions.length > 3) return "Use 1-3 actions";
  for (const a of actions) {
    if (!a) return "Only function calls are sponsored";
    if (!allowed.includes(a.methodName))
      return `Method ${a.methodName} is not sponsored`;
    if (a.deposit > 1n) return "Deposits above 1 yoctoNEAR are not sponsored";
    if (a.gas > MAX_GAS) return "Too much gas";
  }
  return null;
}

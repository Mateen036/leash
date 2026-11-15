import { networkKey } from "@/lib/near/network";
export type Receipt = {
  id: string;
  at: number;
  headline: string;
  ok: boolean;
  txHash: string;
  error?: string | null;
  orderId?: string;
  rejected?: boolean;
};
const key = (id: string) => networkKey(`leash:activity:${id}`);
export function loadReceipts(id: string): Receipt[] {
  try {
    return JSON.parse(localStorage.getItem(key(id)) || "[]");
  } catch {
    return [];
  }
}
export function saveReceipt(accountId: string, receipt: Receipt) {
  const items = loadReceipts(accountId).filter((r) => r.id !== receipt.id);
  localStorage.setItem(
    key(accountId),
    JSON.stringify([receipt, ...items].slice(0, 100)),
  );
  window.dispatchEvent(new Event("leash:activity"));
}

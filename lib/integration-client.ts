"use client";
import { networkFetch } from "@/lib/near/network";

export async function integrationPost<T>(
  url: string,
  input: unknown,
): Promise<T> {
  const response = await networkFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(90000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Integration request failed");
  return data;
}

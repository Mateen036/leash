import type { Metadata } from "next";
import AgentApp from "@/components/AgentApp";
export const metadata: Metadata = { title: "AI Agent — Leash" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ask?: string | string[] }>;
}) {
  const { ask } = await searchParams;
  return <AgentApp initialAsk={typeof ask === "string" ? ask : ""} />;
}

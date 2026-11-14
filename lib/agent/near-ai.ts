import OpenAI from "openai";
import { z } from "zod";
import { actionDigest } from "../defi/tokens";
import { ActionSchema } from "./actions";
import { rulesPlan, type Plan } from "./planner";
const resultSchema = z
  .object({ actions: z.array(ActionSchema).min(1).max(3) })
  .strict();
/** AI selects typed intents only. Protocol adapters supply every amount, price and receipt. */
export async function planWithNearAI(message: string): Promise<Plan> {
  const fallback = rulesPlan(message);
  if (!process.env.NEAR_AI_API_KEY) return fallback;
  const client = new OpenAI({
    apiKey: process.env.NEAR_AI_API_KEY,
    baseURL: process.env.NEAR_AI_BASE_URL || "https://cloud-api.near.ai/v1",
    timeout: 12000,
    maxRetries: 0,
  });
  for (const model of new Set([
    process.env.NEAR_AI_MODEL || "qwen/qwen3.6-35b-a3b",
    process.env.NEAR_AI_FALLBACK_MODEL || "z-ai/glm-5.3-flash",
  ])) {
    try {
      const result = await client.chat.completions.create({
        model,
        max_tokens: 800,
        tools: [
          {
            type: "function",
            function: {
              name: "propose_actions",
              description:
                "Propose requested DeFi intents for live preview, never execute",
              parameters: z.toJSONSchema(resultSchema) as any,
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "propose_actions" },
        },
        messages: [
          {
            role: "system",
            content:
              "You are Leash on NEAR testnet. Use the propose_actions tool. Match the exact requested amount; do not silently reduce over-limit requests. Never invent balances, quotes or fills. Only supply/withdraw NEAR/wNEAR; other supply assets produce explain. Swap: source and target are token symbols from NEAR, tUSDC, USDT, USDC, PEM, LNC, NST; one side must be NEAR. Unstake amount is NEAR redemption units (LiNEAR protocol unstake). Perps symbols PERP_ETH_USDC/PERP_BTC_USDC/PERP_SOL_USDC; default leverage 2x, notional $30. close_all means close all perps. Bridge is quote only and destination is chain code base/arb/eth/sol/btc. 'Prove the leash works' means stake 0.9 NEAR. For unsupported or ambiguous requests use explain.",
          },
          { role: "user", content: message },
        ],
      });
      const msg = result.choices[0]?.message;
      const tool = msg?.tool_calls?.find(
        (t) => t.type === "function" && t.function.name === "propose_actions",
      );
      const raw =
        tool?.type === "function" ? tool.function.arguments : msg?.content;
      const parsed = resultSchema.parse(JSON.parse(raw || ""));
      const exact = fallback.actions[0];
      // Deterministic parsing preserves explicit sizes, including over-cap requests the model may refuse or shrink.
      if (
        exact.kind !== "explain" &&
        parsed.actions.length === 1 &&
        actionDigest(parsed.actions[0]) !== actionDigest(exact)
      )
        return {
          ...fallback,
          source: "near-ai",
          model,
          fallback: "Exact requested intent preserved by deterministic parser",
        };
      return {
        reply:
          "Review the proposal, its live sources and your limits before confirming.",
        source: "near-ai",
        model,
        actions: parsed.actions,
      };
    } catch {
      /* backup model, then strict deterministic rules */
    }
  }
  return {
    ...fallback,
    fallback: "NEAR AI unavailable; deterministic rules used",
  };
}

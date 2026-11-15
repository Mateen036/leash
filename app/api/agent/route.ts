import { networkRoute } from "@/lib/near/network-server";
import { body, fail, limit } from "@/lib/near/api";
import { planWithNearAI } from "@/lib/agent/near-ai";
import { ActionSchema } from "@/lib/agent/actions";
import { prepareProposal } from "@/lib/agent/proposals";
async function handlePOST(request: Request) {
  try {
    limit(request, "agent", 40);
    const input = await body<{
      message?: string;
      action?: unknown;
      accountId?: string;
      walletMode?: boolean;
    }>(request);
    const message = String(input.message || "")
      .trim()
      .slice(0, 500);
    const plan = input.action
      ? {
          source: "rules" as const,
          reply: "Review the live proposal before confirming.",
          actions: [ActionSchema.parse(input.action)],
        }
      : await planWithNearAI(message);
    if (!input.action && message.length < 2)
      return Response.json(
        { error: "Tell the agent what you need" },
        { status: 400 },
      );
    const accountId =
      typeof input.accountId === "string" &&
      /^[a-z0-9._-]{2,64}$/.test(input.accountId)
        ? input.accountId
        : undefined;
    const proposals = [];
    for (const action of plan.actions)
      proposals.push(
        await prepareProposal(
          action,
          accountId,
          input.walletMode === true,
          new URL(request.url).origin,
        ),
      );
    const refused = proposals.some((p) => p.blocked);
    return Response.json({
      ...plan,
      reply: refused
        ? "I won't automatically submit this proposal because it exceeds a limit or cannot be safely prepared. Inspect the reason below. For guard limits, Try anyway lets you see the on-chain refusal."
        : plan.reply,
      proposals,
    });
  } catch (e) {
    return fail(e);
  }
}

export const POST = networkRoute(handlePOST);

import { z } from "zod";
const amount = z
  .string()
  .regex(/^\d{1,8}(\.\d{1,24})?$/)
  .refine((v) => Number(v) > 0, "Amount must be positive");
const sized = (kind: "stake" | "unstake" | "supply" | "withdraw") =>
  z.object({ kind: z.literal(kind), amount }).strict();
export const ActionSchema = z.discriminatedUnion("kind", [
  sized("stake"),
  sized("unstake"),
  sized("supply"),
  sized("withdraw"),
  z
    .object({
      kind: z.literal("swap"),
      amount,
      source: z.string().min(2).max(10),
      target: z.string().min(2).max(10).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("perp_open"),
      symbol: z.string().regex(/^PERP_[A-Z0-9]+_USDC$/),
      side: z.enum(["BUY", "SELL"]),
      notionalUsd: z.number().positive().max(1e6),
      leverage: z.number().positive().max(100),
    })
    .strict(),
  z
    .object({
      kind: z.literal("perp_close"),
      symbol: z.string().regex(/^PERP_[A-Z0-9]+_USDC$/),
    })
    .strict(),
  z.object({ kind: z.literal("close_all") }).strict(),
  z
    .object({
      kind: z.literal("bridge_quote"),
      amount,
      source: z.enum(["NEAR", "USDC"]),
      destination: z.string().min(2).max(20),
    })
    .strict(),
  z.object({ kind: z.literal("portfolio") }).strict(),
  z.object({ kind: z.literal("explain"), topic: z.string().max(500) }).strict(),
]);
export type Action = z.infer<typeof ActionSchema>;

import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const startReviewRpc = defineRpc({
  name: "review.start",
  input: z.object({ agentId: z.string().min(1) }),
  output: z.object({ reviewerAgentId: z.string(), title: z.string() }),
});

export const finishReviewRpc = defineRpc({
  name: "review.finish",
  input: z.object({ reviewerAgentId: z.string().min(1) }),
  output: z.object({ summary: z.string() }),
});

/** Timeline row appended to a reviewer when one of its turns completes. */
export const FINISH_CARD_KIND = "review-finished";
export const FINISH_CARD_VERSION = 1;
export const FINISH_CARD_ID = "finish-review";

export const finishCardSchema = z.object({
  state: z.enum(["ready", "finished"]),
  reviewerAgentId: z.string(),
  sourceTitle: z.string(),
  actionLabel: z.string(),
  summary: z.string().optional(),
});
export type FinishCardData = z.output<typeof finishCardSchema>;

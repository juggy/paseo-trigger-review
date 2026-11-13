import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createReviewHandlers } from "./server/review";
import { finishReviewRpc, startReviewRpc } from "./shared/rpc";
import { reviewSettings } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(reviewSettings);
  const review = createReviewHandlers(settings);

  server.handle(startReviewRpc, review.startReview);
  server.handle(finishReviewRpc, review.finishReview);

  // Turn ends are the best available "review is done" signal. Every completed reviewer
  // turn gets a Finish review card; the composer pill stays available as a fallback.
  server.addHook("agent.turn.after", async (event, { paseo }) => {
    if (event.outcome.kind !== "completed") return;
    await review.onTurnCompleted(paseo, event.agent.id);
  });

  return () => {};
}

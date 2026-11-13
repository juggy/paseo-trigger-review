import type { PluginClientContext } from "@getpaseo/plugin/client";
import { FinishCard } from "./client/finish-card";
import { contributePills } from "./client/pills";
import { SettingsScreen } from "./client/settings-screen";
import { isReviewer } from "./shared/labels";
import {
  FINISH_CARD_KIND,
  FINISH_CARD_VERSION,
  finishCardSchema,
  finishReviewRpc,
  startReviewRpc,
} from "./shared/rpc";

export default function contribute(client: PluginClientContext) {
  client.addSettingsScreen({
    id: "review",
    title: "Trigger review",
    icon: "ScanSearch",
    Component: SettingsScreen,
  });

  client.addTimelineRenderer({
    kind: FINISH_CARD_KIND,
    version: FINISH_CARD_VERSION,
    schema: finishCardSchema,
    Component: FinishCard,
  });

  client.addCommandCenterItem({
    id: "review-agent",
    title: "Review this agent's work",
    icon: "ScanSearch",
    context: "agent",
    async onSelect({ agent, rpc }) {
      await rpc(startReviewRpc, { agentId: agent.id });
    },
  });

  client.addCommandCenterItem({
    id: "finish-review",
    title: "Finish review",
    icon: "CheckCheck",
    context: "agent",
    async onSelect({ agent, rpc, paseo }) {
      const result = await paseo.agents.ref(agent.id).refresh();
      if (!isReviewer(result?.agent.labels)) {
        throw new Error("This agent was not started by Trigger review.");
      }
      await rpc(finishReviewRpc, { reviewerAgentId: agent.id });
    },
  });

  const removePills = contributePills(client);

  return () => {
    removePills();
  };
}

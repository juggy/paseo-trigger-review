import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { isReviewer } from "../shared/labels";
import { finishReviewRpc, startReviewRpc } from "../shared/rpc";

interface ObservedAgent {
  id: string;
  workspaceId?: string | null;
  status: string;
  labels: Record<string, string>;
  archivedAt?: string | null;
  internal?: boolean;
}

type PillKind = "review" | "finish";

interface PillEntry {
  kind: PillKind;
  workspaceId: string;
  registration: PluginButtonRegistration;
}

/**
 * Keeps one composer pill per agent: "Review" on ordinary agents, "Finish review" on
 * reviewer agents. Follows the agent directory through an owned list subscription.
 */
export function contributePills(client: PluginClientContext) {
  const pills = new Map<string, PillEntry>();
  const lifetime = new AbortController();

  const remove = (agentId: string) => {
    pills.get(agentId)?.registration.remove();
    pills.delete(agentId);
  };

  const removeAll = () => {
    for (const pill of pills.values()) pill.registration.remove();
    pills.clear();
  };

  const register = (agent: ObservedAgent) => {
    if (lifetime.signal.aborted) return;
    if (!agent.workspaceId || agent.archivedAt || agent.internal) {
      remove(agent.id);
      return;
    }
    const agentId = agent.id;
    const workspaceId = agent.workspaceId;
    const kind: PillKind = isReviewer(agent.labels) ? "finish" : "review";
    const running = agent.status === "running" || agent.status === "initializing";
    const existing = pills.get(agentId);

    if (existing && existing.kind === kind && existing.workspaceId === workspaceId) {
      if (kind === "finish") existing.registration.update({ disabled: running });
      return;
    }
    remove(agentId);

    const registration =
      kind === "review"
        ? client.addComposerPill({
            id: "review",
            workspaceId,
            agentId,
            button: {
              title: "Start a review of this agent's work in a new agent",
              icon: "ScanSearch",
              label: "Review",
              behavior: {
                kind: "action",
                async onPress() {
                  await client.rpc(startReviewRpc, { agentId });
                },
              },
            },
          })
        : client.addComposerPill({
            id: "finish-review",
            workspaceId,
            agentId,
            button: {
              title: "Finish this review (runs the configured finish action)",
              icon: "CheckCheck",
              label: "Finish review",
              disabled: running,
              behavior: {
                kind: "action",
                async onPress() {
                  await client.rpc(finishReviewRpc, { reviewerAgentId: agentId });
                },
              },
            },
          });
    pills.set(agentId, { kind, workspaceId, registration });
  };

  void client.paseo.agents
    .list({ subscribe: {} })
    .then(({ subscription }) => {
      if (lifetime.signal.aborted) {
        subscription.release();
        return;
      }
      lifetime.signal.addEventListener("abort", () => subscription.release(), { once: true });
      subscription.subscribe({
        snapshot: ({ entries }) => {
          const seen = new Set<string>();
          for (const { agent } of entries) {
            seen.add(agent.id);
            register(agent);
          }
          for (const agentId of [...pills.keys()]) if (!seen.has(agentId)) remove(agentId);
        },
        update: (message) => {
          if (message.type !== "agent_update") return;
          const update = message.payload;
          if (update.kind === "upsert") {
            register(update.agent);
            return;
          }
          remove(update.agentId);
        },
      });
      return undefined;
    })
    .catch((error: unknown) => {
      if (!lifetime.signal.aborted) console.error("[trigger-review] agent observation failed", error);
    });

  return () => {
    lifetime.abort();
    removeAll();
  };
}

import type { RpcInput } from "@getpaseo/plugin";
import type { PluginHandlerContext, PluginSettings } from "@getpaseo/plugin/server";
import {
  PROJECT_LABEL,
  REVIEWER_ROLE,
  ROLE_LABEL,
  SOURCE_AGENT_LABEL,
  SOURCE_TITLE_LABEL,
  isReviewer,
} from "../shared/labels";
import {
  FINISH_CARD_ID,
  FINISH_CARD_KIND,
  FINISH_CARD_VERSION,
  type FinishCardData,
  type finishReviewRpc,
  type startReviewRpc,
} from "../shared/rpc";
import {
  REVIEW_PROMPT_SUFFIX,
  finishActionLabel,
  renderTemplate,
  resolveConfig,
  type ReviewConfig,
  type reviewSettings,
} from "../shared/settings";
import { extractFindings } from "./findings";

type PaseoApi = PluginHandlerContext["paseo"];
type Settings = PluginSettings<(typeof reviewSettings)["schema"]>;

const TIMELINE_TAIL_LIMIT = 300;

function agentTitle(agent: { id: string; title: string | null }): string {
  return agent.title?.trim() || agent.id.slice(0, 7);
}

async function readConfig(settings: Settings, projectId: string | null): Promise<ReviewConfig> {
  const state = await settings.read();
  if (state.status !== "ready") {
    console.error("[trigger-review] settings are invalid, using defaults:", state.error);
    return resolveConfig(null, projectId);
  }
  return resolveConfig(state.values, projectId);
}

async function workspaceProjectId(paseo: PaseoApi, workspaceId: string): Promise<string | null> {
  try {
    const workspace = await paseo.workspaces.ref(workspaceId).refresh();
    return workspace?.projectId ?? null;
  } catch (error) {
    console.error("[trigger-review] could not resolve project of workspace", workspaceId, error);
    return null;
  }
}

async function providerSelection(paseo: PaseoApi, config: ReviewConfig, cwd: string) {
  if (config.model) return `${config.provider}/${config.model}`;
  const result = await paseo.providers.listModels(config.provider, { cwd });
  const models = result.models ?? [];
  const model = models.find((candidate) => candidate.isDefault) ?? models[0];
  if (!model) {
    throw new Error(
      `No model is available for provider "${config.provider}". Pick a model in the Trigger review settings.`,
    );
  }
  return `${config.provider}/${model.id}`;
}

async function getAgent(paseo: PaseoApi, agentId: string) {
  const result = await paseo.agents.ref(agentId).refresh();
  if (!result) throw new Error(`Agent ${agentId} was not found.`);
  return result.agent;
}

export function createReviewHandlers(settings: Settings) {
  async function startReview(
    { agentId }: RpcInput<typeof startReviewRpc>,
    { paseo }: PluginHandlerContext,
  ) {
    const source = await getAgent(paseo, agentId);
    if (isReviewer(source.labels)) {
      throw new Error("This agent is already a reviewer. Use Finish review instead.");
    }
    if (!source.workspaceId) throw new Error("This agent is not attached to a workspace.");

    const projectId = await workspaceProjectId(paseo, source.workspaceId);
    const config = await readConfig(settings, projectId);
    const sourceTitle = agentTitle(source);
    const prompt =
      renderTemplate(config.prompt, {
        sourceAgentId: source.id,
        sourceAgentTitle: sourceTitle,
        cwd: source.cwd,
      }) + REVIEW_PROMPT_SUFFIX;

    const title = `Review: ${sourceTitle}`;
    const labels: Record<string, string> = {
      [ROLE_LABEL]: REVIEWER_ROLE,
      [SOURCE_AGENT_LABEL]: source.id,
      [SOURCE_TITLE_LABEL]: sourceTitle.slice(0, 200),
    };
    if (projectId) labels[PROJECT_LABEL] = projectId;

    const reviewer = await paseo.workspaces.ref(source.workspaceId).agents.create({
      config: {
        provider: await providerSelection(paseo, config, source.cwd),
        ...(config.modeId ? { modeId: config.modeId } : {}),
        ...(config.thinkingOptionId ? { thinkingOptionId: config.thinkingOptionId } : {}),
      },
      title,
      prompt,
      labels,
      ...(config.placement === "subagent" ? { parent: source.id } : {}),
    });
    console.log(`[trigger-review] started reviewer ${reviewer.id} for ${source.id}`);
    return { reviewerAgentId: reviewer.id, title };
  }

  async function finishReview(
    { reviewerAgentId }: RpcInput<typeof finishReviewRpc>,
    { paseo }: PluginHandlerContext,
  ) {
    const reviewerSnapshot = await getAgent(paseo, reviewerAgentId);
    if (!isReviewer(reviewerSnapshot.labels)) {
      throw new Error("This agent was not started by Trigger review.");
    }
    if (reviewerSnapshot.status === "running") {
      throw new Error("The review is still running. Wait for it to finish.");
    }
    const sourceId = reviewerSnapshot.labels[SOURCE_AGENT_LABEL];
    const sourceTitle = reviewerSnapshot.labels[SOURCE_TITLE_LABEL] ?? sourceId ?? "original agent";
    const projectId = reviewerSnapshot.labels[PROJECT_LABEL] ?? null;
    const config = await readConfig(settings, projectId);
    const reviewer = paseo.agents.ref(reviewerAgentId);
    const reviewerTitle = agentTitle(reviewerSnapshot);

    const steps: string[] = [];

    if (config.finishAction === "send-to-source" || config.finishAction === "send-to-source-and-archive") {
      if (!sourceId) throw new Error("The original agent of this review is unknown.");
      const source = await getAgent(paseo, sourceId).catch(() => null);
      if (!source || source.archivedAt) {
        throw new Error(`The original agent "${sourceTitle}" no longer exists or is archived.`);
      }
      const page = await reviewer.timeline.refetch({ direction: "tail", limit: TIMELINE_TAIL_LIMIT });
      const findings = extractFindings(page.entries.map((entry) => entry.item));
      if (!findings) throw new Error("The reviewer has not produced any findings yet.");
      const message = renderTemplate(config.finishMessageTemplate, {
        findings,
        reviewerTitle,
        reviewerAgentId,
        sourceAgentId: sourceId,
        sourceAgentTitle: sourceTitle,
      });
      await paseo.agents.ref(sourceId).send(message);
      steps.push(`Sent findings to "${sourceTitle}"`);
    }

    if (config.finishAction === "prompt-reviewer") {
      const prompt = renderTemplate(config.finishReviewerPrompt, {
        sourceAgentId: sourceId ?? "",
        sourceAgentTitle: sourceTitle,
      }).trim();
      if (!prompt) throw new Error("The follow-up prompt for the reviewer is empty.");
      await reviewer.send(prompt);
      steps.push("Sent the follow-up prompt to the reviewer");
    }

    const archive =
      config.finishAction === "archive" || config.finishAction === "send-to-source-and-archive";

    const summary = archive ? [...steps, "Archived the reviewer"].join(". ") : steps.join(". ");
    // Mark the card first; an archived agent may no longer accept timeline rows.
    await appendFinishCard(paseo, reviewerAgentId, {
      state: "finished",
      reviewerAgentId,
      sourceTitle,
      actionLabel: finishActionLabel(config.finishAction, sourceTitle),
      summary,
    }).catch((error) => console.error("[trigger-review] could not update the finish card", error));

    if (archive) {
      await reviewer.archive();
    }
    return { summary };
  }

  /** Offers the Finish review card at the end of every completed reviewer turn. */
  async function onTurnCompleted(paseo: PaseoApi, agentId: string) {
    const snapshot = await getAgent(paseo, agentId);
    if (!isReviewer(snapshot.labels) || snapshot.archivedAt) return;
    const sourceTitle =
      snapshot.labels[SOURCE_TITLE_LABEL] ?? snapshot.labels[SOURCE_AGENT_LABEL] ?? "original agent";
    const config = await readConfig(settings, snapshot.labels[PROJECT_LABEL] ?? null);
    await appendFinishCard(paseo, agentId, {
      state: "ready",
      reviewerAgentId: agentId,
      sourceTitle,
      actionLabel: finishActionLabel(config.finishAction, sourceTitle),
    });
  }

  return { startReview, finishReview, onTurnCompleted };
}

async function appendFinishCard(paseo: PaseoApi, agentId: string, data: FinishCardData) {
  await paseo.agents.ref(agentId).timeline.append({
    type: "plugin",
    id: FINISH_CARD_ID,
    kind: FINISH_CARD_KIND,
    version: FINISH_CARD_VERSION,
    data,
  });
}

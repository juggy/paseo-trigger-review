import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const PLACEMENTS = ["tab", "subagent"] as const;
export type Placement = (typeof PLACEMENTS)[number];

export const FINISH_ACTIONS = [
  "send-to-source",
  "send-to-source-and-archive",
  "prompt-reviewer",
  "archive",
] as const;
export type FinishAction = (typeof FINISH_ACTIONS)[number];

export const DEFAULT_REVIEW_PROMPT = `You are reviewing the work of another coding agent ("{{sourceAgentTitle}}") in {{cwd}}.

Review the uncommitted changes and the commits on the current branch that are not on the default branch (use git to find them).
Look for bugs, regressions, missing edge cases, security issues, missing tests, and anything that does not match the apparent intent of the change.
Do not modify any files.

Report your findings grouped by severity (critical, major, minor, nit). For each finding give file:line, what is wrong, and a suggested fix. If there is nothing worth flagging, say so.`;

export const DEFAULT_FINISH_MESSAGE_TEMPLATE = `Findings from review agent "{{reviewerTitle}}":

{{findings}}

Address the findings you agree with, and explain briefly why you skip any.`;

export const DEFAULT_FINISH_REVIEWER_PROMPT =
  "Fix the issues you found, starting with the most severe ones.";

/** Appended to every review prompt so the last message is the one worth forwarding. */
export const REVIEW_PROMPT_SUFFIX =
  "\n\nFinish with a final message that contains only the consolidated findings. That final message is what will be forwarded to the requesting agent.";

export const reviewConfigSchema = z.object({
  prompt: z.string().default(DEFAULT_REVIEW_PROMPT),
  provider: z.string().default("claude"),
  /** Empty string means the provider's default model. */
  model: z.string().default(""),
  /** Empty string means the provider's default mode. */
  modeId: z.string().default("auto"),
  /** Empty string means the model's default thinking option. */
  thinkingOptionId: z.string().default(""),
  placement: z.enum(PLACEMENTS).default("tab"),
  finishAction: z.enum(FINISH_ACTIONS).default("send-to-source"),
  finishMessageTemplate: z.string().default(DEFAULT_FINISH_MESSAGE_TEMPLATE),
  finishReviewerPrompt: z.string().default(DEFAULT_FINISH_REVIEWER_PROMPT),
});
export type ReviewConfig = z.output<typeof reviewConfigSchema>;

export const DEFAULT_REVIEW_CONFIG: ReviewConfig = reviewConfigSchema.parse({});

export const reviewSettings = defineSettings({
  id: "review",
  scope: "host",
  version: 1,
  schema: z.object({
    /** Used by every project without its own entry. */
    defaults: reviewConfigSchema.default(DEFAULT_REVIEW_CONFIG),
    /** Complete per-project configurations, keyed by Paseo project id. */
    projects: z.record(z.string(), reviewConfigSchema).default({}),
  }),
});
export type ReviewSettingsValues = z.output<typeof reviewSettings.schema>;

export function resolveConfig(
  values: ReviewSettingsValues | null,
  projectId: string | null | undefined,
): ReviewConfig {
  if (!values) return DEFAULT_REVIEW_CONFIG;
  if (projectId && values.projects[projectId]) return values.projects[projectId];
  return values.defaults;
}

export function finishActionLabel(action: FinishAction, sourceTitle: string): string {
  switch (action) {
    case "send-to-source":
      return `Send findings to "${sourceTitle}"`;
    case "send-to-source-and-archive":
      return `Send findings to "${sourceTitle}" and archive this reviewer`;
    case "prompt-reviewer":
      return "Run the configured follow-up prompt on this reviewer";
    case "archive":
      return "Archive this reviewer";
  }
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : match,
  );
}

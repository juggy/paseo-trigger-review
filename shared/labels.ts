/** Agent labels that mark reviewer agents and link them to the agent that requested the review. */
export const ROLE_LABEL = "trigger-review.role";
export const REVIEWER_ROLE = "reviewer";
export const SOURCE_AGENT_LABEL = "trigger-review.source-agent-id";
export const SOURCE_TITLE_LABEL = "trigger-review.source-title";
export const PROJECT_LABEL = "trigger-review.project-id";

export function isReviewer(labels: Record<string, string> | null | undefined): boolean {
  return labels?.[ROLE_LABEL] === REVIEWER_ROLE;
}

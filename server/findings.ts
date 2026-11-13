import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";

/**
 * Extracts the reviewer's findings from a timeline page.
 *
 * Only the turn after the last user message is considered. Within it, the final
 * contiguous run of assistant text (after the last tool call) is the reviewer's
 * concluding message, which the review prompt asks to contain only the findings.
 * If the turn ends on a tool call, all assistant text of the turn is returned.
 */
export function extractFindings(items: readonly AgentTimelineItem[]): string {
  let lastUser = -1;
  items.forEach((item, index) => {
    if (item.type === "user_message") lastUser = index;
  });
  const turn = items.slice(lastUser + 1);

  const all: string[] = [];
  let tail: string[] = [];
  for (const item of turn) {
    if (item.type === "assistant_message") {
      all.push(item.text);
      tail.push(item.text);
    } else if (item.type === "tool_call") {
      tail = [];
    }
    // Reasoning, todos, notifications and plugin rows neither contribute nor break the run.
  }
  const text = (tail.length > 0 ? tail : all).join("").trim();
  return text;
}

# Trigger review

Trigger review adds a **Review** button to every agent's composer. Pressing it starts a second agent that reviews the first agent's work using your review prompt. When the review is done, a **Finish review** button on the reviewer runs a configurable action. By default it sends the reviewer's findings back to the agent that asked for the review.

## How it works

- The reviewer runs in the same workspace and directory as the reviewed agent. It opens as a new tab, or as a subagent of the reviewed agent if you choose that in settings.
- Paseo has no definite "review finished" event. The plugin adds a Finish review card to the reviewer's timeline each time one of its turns completes. The reviewer also always has a Finish review pill in its composer, so you can keep chatting with it before finishing.
- The findings are the reviewer's final message: the assistant text after its last tool call in the latest turn. The review prompt always ends with an instruction to close on a findings-only message.

## Settings

Open Settings, then Plugins, then the cog next to Trigger review. Settings have global defaults, and any project can have its own complete set instead.

- **Provider, model, mode, and thinking** for the reviewer. Mode defaults to auto mode. Model and thinking default to the provider's defaults.
- **Open reviewer as**: a new tab in the workspace (default) or a subagent of the reviewed agent.
- **Review prompt**: supports `{{sourceAgentTitle}}`, `{{sourceAgentId}}`, and `{{cwd}}`.
- **When Finish review is pressed**:
  - send the findings to the original agent (default)
  - send the findings and archive the reviewer
  - send a follow-up prompt to the reviewer, for example asking it to fix what it found
  - archive the reviewer
- **Message to the original agent**: a template using `{{findings}}`, `{{reviewerTitle}}`, `{{reviewerAgentId}}`, `{{sourceAgentTitle}}`, and `{{sourceAgentId}}`.

## Limits

- Requires Paseo 0.15.4 or later.
- Reviewers are recognized by agent labels starting with `trigger-review.`. Removing those labels detaches a reviewer from the plugin.
- Finish review is refused while the reviewer is still running.
- The Finish review card lives in the daemon's in-memory timeline and disappears after a daemon restart. The composer pill remains.

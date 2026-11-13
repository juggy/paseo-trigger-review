# paseo-trigger-review

A [Paseo](https://paseo.sh) plugin for one-click reviews by a second agent.

- A **Review** pill appears in every agent's composer. Pressing it starts a reviewer agent in the same workspace. You configure its prompt, provider/model, mode (auto by default), and thinking level.
- When the reviewer's turn completes, its timeline gets a **Finish review** card. The reviewer also always has a **Finish review** pill. Finishing runs a configurable action. By default it sends the reviewer's findings to the agent that requested the review.
- Settings have global defaults and optional overrides for each project.

## Install

Requires Paseo 0.15.4 or later with plugins enabled (Settings → Plugins → Enable plugins).

```bash
paseo plugin install github:juggy/paseo-trigger-review
```

From a local checkout:

```bash
git clone https://github.com/juggy/paseo-trigger-review.git
cd paseo-trigger-review
npm install
paseo plugin install "$PWD"
```

## Use

1. In any agent, press **Review** above the composer, or run "Review this agent's work" from the Command Center (⌘K).
2. A reviewer agent named `Review: <agent title>` starts in the same workspace. It opens as a new tab by default, or as a subagent if configured.
3. When it finishes a turn, press **Finish review** on the card in its timeline, or use the pill in its composer. You can keep talking to the reviewer first. The card comes back after every completed turn.

## Configuration

Open Settings → Plugins → Trigger review (cog). Use **Configure** to pick either the defaults or a specific project. For a project, turn on **Custom settings for this project** to give it its own complete configuration. Projects without one use the defaults.

| Setting | Default | Notes |
| --- | --- | --- |
| Provider | `claude` | Any enabled Paseo provider. |
| Model | provider default | |
| Mode | `auto` | Provider-specific mode id. |
| Thinking | model default | |
| Open reviewer as | New tab | Or a subagent of the reviewed agent. |
| Review prompt | Reviews uncommitted changes and branch commits, reports findings by severity with file:line | Variables: `{{sourceAgentTitle}}`, `{{sourceAgentId}}`, `{{cwd}}`. An instruction to end with a findings-only message is always appended. |
| When Finish review is pressed | Send findings to the original agent | Other choices: send and archive the reviewer, send a follow-up prompt to the reviewer, archive the reviewer. |
| Message to the original agent | `Findings from review agent "{{reviewerTitle}}": …` | Variables: `{{findings}}`, `{{reviewerTitle}}`, `{{reviewerAgentId}}`, `{{sourceAgentTitle}}`, `{{sourceAgentId}}`. |
| Follow-up prompt for the reviewer | `Fix the issues you found…` | Used by the follow-up action. |

## How it works

- **Linking.** A reviewer carries agent labels: `trigger-review.role=reviewer`, `trigger-review.source-agent-id`, `trigger-review.source-title`, and `trigger-review.project-id`. The plugin needs no other state. Its config is resolved from the reviewed agent's project.
- **Detecting the end.** Paseo has no definite "review finished" event. An `agent.turn.after` hook appends (or replaces) a plugin timeline row on the reviewer whenever one of its turns completes. The composer pill stays available as a manual fallback.
- **Extracting findings.** The plugin reads the reviewer's timeline tail and takes the assistant text after the last tool call in the latest turn. That is the reviewer's closing message. If the turn ended on a tool call, it uses all assistant text from that turn.

## Layout

```text
index.client.tsx        composer pills, Command Center items, timeline renderer, settings screen
index.server.ts         RPC handlers and the turn-end hook
client/pills.ts         Review / Finish review pills that follow the agent directory
client/finish-card.tsx  Finish review timeline card
client/settings-screen.tsx
server/review.ts        review.start / review.finish and the turn-end card
server/findings.ts      findings extraction from a timeline page
shared/                 settings schema, RPC contracts, labels
```

## Develop

```bash
npm install
npm run typecheck
paseo plugin reload paseo-trigger-review
paseo plugin logs paseo-trigger-review
```

## License

MIT

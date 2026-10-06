# blind-spots

A Claude Code plugin that adds a reviewer pass after long turns. When the main agent finishes a turn that took many tool calls, the plugin asks the model to step back and look for the one thing you are likely to have missed. If it finds something, it shows a banner above the prompt.

The reviewer looks for four kinds of finding:

- **decision**: the agent picked an approach, default or trade-off on its own, and you never weighed in on it.
- **risk**: something in the result may be wrong, fragile or unsafe.
- **gap**: something you probably think is done but isn't: a skipped test, a TODO, an unverified claim.
- **concept**: a system, mechanism or design that shapes the work and that you haven't shown you understand, where misunderstanding it would likely lead you astray later. The explanation starts from scratch, and the next step says where it will matter for you.

Most reviews find nothing, and then nothing is shown. A concept is raised only when there is no more urgent decision, risk or gap.

## Using it

The banner shows the kind of finding and a one-line headline. Its buttons (focus the banner with ctrl+x tab, then use the hotkeys):

| Key | Button | What it does |
| --- | --- | --- |
| `d` | Details / Hide details | Shows or hides the explanation and a suggested next step |
| `a` | Ask Claude | Puts a question about the finding into an empty prompt box, so you can discuss it in the main session |
| `m` | Mute topic (I know this, for a concept) | Hides the finding and tells future reviews never to raise it again |
| `x` | Close | Hides the finding |

A finding you leave unopened expires after you send three prompts.

The `/blind-spots` command:

- `/blind-spots` or `/blind-spots status` shows the current review threshold, your recent reactions per kind, and how the last review went, including the HTTP status when the model request failed.
- `/blind-spots review` runs a review right away, whatever the threshold.
- `/blind-spots unmute` forgets the muted and recently raised topics.
- `/blind-spots reset` forgets everything learned: muted topics, reactions, and the back-off of every project.

## How it adapts to you

Each finding's fate is recorded:

- **engaged**: you opened its details or asked Claude about it.
- **rejected**: you muted it without opening it.
- **ignored**: you closed it unopened, it expired, or a new finding replaced it while still unopened.

Two things adapt, each scoped to what it measures:

- **How often reviews run, per project.** Each ignored or rejected finding raises the project's back-off level by one, and each engaged finding lowers it by one. The threshold is `minToolCalls × 2^level`, so 8, 16, 32 or at most 64 tool calls. The level drops by one for each day without a reaction, so a quiet week does not silence the plugin for good.
- **What the reviewer raises, for you everywhere.** A per-kind summary of your last 30 reactions goes into the review prompt (for example "concept: 1 engaged, 4 ignored"). The reviewer raises a kind you mostly ignore or mute only when it is exceptionally important.

Muted topics are global too: a topic you know does not stop being known in another repository.

## Configuration

| Option | Default | Meaning |
| --- | --- | --- |
| `minToolCalls` | `8` | The base threshold: a finished turn is reviewed only if the main agent made at least this many tool calls in it. The back-off multiplies it. |

Set it in the `/config` menu, or in settings under `pluginConfigs.blind-spots`.

## How it works

- It is a hooks module: a plugin of TypeScript function hooks (`hooks/register.tsx`), not a skill.
- A `turn.step` hook counts the main agent's tool calls in each turn. Subagent steps are not counted.
- A `turn.complete` hook starts the review once the turn has ended normally and reached the current threshold. It does not wait for the review, so the session is free right away.
- The review is a `$.model.fork` call: the session's own conversation is sent again with a review prompt after it, tools disabled, on the session's model and connection. That is why it works whichever way Claude Code reaches the model (direct API, a gateway, or a cloud provider). It also means each review costs a full request over the conversation, cheaper when the prompt cache still holds it.
- A fork replays the main thread's last request, which ends before the turn's final reply. The plugin keeps each main turn's final answer and adds it to the review prompt, so the agent's closing claims and summaries are reviewed too.
- The reviewer answers in JSON (`hooks/review.ts` has the prompt and the parser). Replies it cannot read are reported by `/blind-spots status`, never shown as findings.
- `hooks/feedback.ts` holds the fate, back-off and summary rules as pure functions.
- The finding being shown lives in session state. Muted and recent topics, reactions and the per-project back-off (keyed by the session's project root) live in the plugin's store, a JSON file under the Claude Code configuration directory, so they carry over to later sessions.

## Developing

```sh
claude plugin validate skills/blind-spots
claude plugin test skills/blind-spots
claude --plugin-dir skills/blind-spots   # run a session with the working copy
```

When the engine loads the plugin from a folder, it writes the API typings into `.claude-plugin/types/`. That folder is gitignored, and `tsc -p skills/blind-spots` type-checks against it.

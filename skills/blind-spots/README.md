# blind-spots

A Claude Code plugin that adds a reviewer pass after long turns. When the main agent finishes a turn that took many tool calls, the plugin asks the model to step back and look for the one thing you are likely to have missed. If it finds something, it shows a banner above the prompt.

The reviewer looks for three kinds of finding:

- **decision**: the agent picked an approach, default or trade-off on its own, and you never weighed in on it.
- **risk**: something in the result may be wrong, fragile or unsafe.
- **gap**: something you probably think is done but isn't: a skipped test, a TODO, an unverified claim.

Most reviews find nothing, and then nothing is shown.

## Using it

The banner shows the kind of finding and a one-line headline. Its buttons (focus the banner with ctrl+x tab, then use the hotkeys):

| Key | Button | What it does |
| --- | --- | --- |
| `d` | Details / Hide details | Shows or hides the explanation and a suggested next step |
| `a` | Ask Claude | Puts a question about the finding into an empty prompt box, so you can discuss it in the main session |
| `m` | Mute topic | Hides the finding and tells future reviews never to raise it again (kept across sessions) |
| `x` | Close | Hides the finding |

The `/blind-spots` command:

- `/blind-spots` or `/blind-spots status` shows the threshold, how many topics are muted, and how the last review went, including the HTTP status when the model request failed.
- `/blind-spots review` runs a review right away, whatever the length of the last turn.
- `/blind-spots unmute` forgets the muted and recently raised topics.

## Configuration

| Option | Default | Meaning |
| --- | --- | --- |
| `minToolCalls` | `8` | A finished turn is reviewed only if the main agent made at least this many tool calls in it |

Set it in the `/config` menu, or in settings under `pluginConfigs.blind-spots`.

## How it works

- It is a hooks module: a plugin of TypeScript function hooks (`hooks/register.tsx`), not a skill.
- A `turn.step` hook counts the main agent's tool calls in each turn. Subagent steps are not counted.
- A `turn.complete` hook starts the review once the turn has ended normally and reached the threshold. It does not wait for the review, so the session is free right away.
- The review is a `$.model.fork` call: the session's own conversation is sent again with a review prompt after it, tools disabled, on the session's model and connection. That is why it works whichever way Claude Code reaches the model (direct API, a gateway, or a cloud provider). It also means each review costs a full request over the conversation, cheaper when the prompt cache still holds it.
- The reviewer answers in JSON (`hooks/review.ts` has the prompt and the parser). Replies it cannot read are reported by `/blind-spots status`, never shown as findings.
- The finding being shown lives in session state. Muted and recently raised topics live in the plugin's store, so they carry over to later sessions.

## Developing

```sh
claude plugin validate skills/blind-spots
claude plugin test skills/blind-spots
claude --plugin-dir skills/blind-spots   # run a session with the working copy
```

When the engine loads the plugin from a folder, it writes the API typings into `.claude-plugin/types/`. That folder is gitignored, and `tsc -p skills/blind-spots` type-checks against it.

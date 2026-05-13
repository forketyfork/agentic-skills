---
name: walkthrough
description: Authors inline code walkthroughs in IntelliJ IDEA via the walkthrough-plugin MCP tools (show_walkthrough_items, await_walkthrough_question, insert_walkthrough_tangents). Use when the user asks for a guided tour, walkthrough, explainer, or step-by-step code tour anchored to specific files and lines, and the `idea` MCP server is available.
---

# Authoring walkthroughs

The [walkthrough-plugin](https://github.com/forketyfork/walkthrough-plugin) renders styled popups inside IntelliJ next to specific lines of code, lets the user step through items with Previous/Next, and lets them type follow-up questions that you answer by inserting child steps.

The three MCP tools form one stateful protocol. Skipping the question-loop leaves the popup waiting for input that never arrives.

## Tools

All tools live on the `idea` MCP server. Fully qualified names:

- `mcp__idea__show_walkthrough_items` — create the walkthrough, returns a `walkthroughId`
- `mcp__idea__await_walkthrough_question` — blocks until the user asks a question or dismisses
- `mcp__idea__insert_walkthrough_tangents` — splices answer steps as children of a step

## Required protocol

```
show_walkthrough_items(description, items)        → walkthroughId
loop:
  await_walkthrough_question(walkthroughId)        → "dismissed" | (parentLabel, question)
  if dismissed: stop
  answer = build items addressing the question
  insert_walkthrough_tangents(walkthroughId, parentLabel, answer)
```

**You must enter the await loop immediately after `show_walkthrough_items` returns.** Do not summarize, do not stop, do not call other tools first. The popup's question UI depends on you waiting. Keep looping until `await_walkthrough_question` returns the literal string `dismissed`.

## Item format

Each item is a JSON object:

```json
{ "text": "...markdown...", "file": "src/Foo.kt", "line": 42 }
```

- `text` (required) — GitHub-flavored markdown. Supported: headings, fenced code with syntax highlighting, lists, tables, strikethrough, GitHub alerts (`> [!NOTE]`), autolinks, inline HTML.
- `file` (optional) — project-relative path, forward slashes
- `line` (optional) — 1-based line number; navigates the editor and anchors the connector to that line

Items without `file`/`line` render the popup without navigating.

The `items` parameter is a JSON **string** containing an array — pass `"[{...},{...}]"`, not a list.

## Verifying line numbers (mandatory)

Line numbers must be correct — the connector visibly points at that line. **Read the file with the Read tool before calling `show_walkthrough_items` or `insert_walkthrough_tangents`.** Never estimate from a diff, commit, memory, or LSP output. Files drift; verify in the current working tree.

For each item with a `line`:
1. Read the file
2. Confirm the line number matches the symbol/expression the step describes
3. If you got the line from `grep`/`rg` output, the printed line number is the authoritative anchor

## Labels

Top-level items are auto-labeled `1`, `2`, `3`, … in order. Do not set labels yourself.

Child steps inserted via `insert_walkthrough_tangents` are auto-labeled by appending `.N` to the parent: tangents under `3` become `3.1`, `3.2`. Nested tangents under `3.1` become `3.1.1`, etc. Pass the exact `parentLabel` returned by `await_walkthrough_question`.

## Description field

A short human-readable phrase, shown in the project's walkthrough history (`.idea/walkthroughs/`). Treat it as the title a user will scan a week later. Examples:

- `"Auth middleware request flow"`
- `"How WalkthroughPopupSurface paints the connector"`
- `"Adding a new MCP tool to ShowWalkthroughItemsToolset"`

Avoid generic phrases like `"Code walkthrough"` or `"Tour"`.

## Writing step content

Each step is one focused idea anchored to one location. The popup is ~560×300px — readable, but not a doc page.

Good step text:
- Opens with the **what** in one sentence, then the **why** if non-obvious
- Uses inline code for identifiers: `` `WalkthroughSession` ``, not WalkthroughSession
- Uses fenced code blocks for snippets longer than a line or two
- Quotes the actual surrounding code only when the reader needs more than what's visible at the anchored line

A walkthrough is a narrative, not a file dump. If two consecutive steps differ only in line number, merge them or rewrite to show progression.

Suggested step count for a single walkthrough: 3–8 top-level items. Longer than that, the user loses the thread; shorter than that, a comment would have done the job.

## Q&A loop: answering tangents

`await_walkthrough_question` returns either:
- `dismissed` (literal string) — stop the loop
- a body like `parentLabel=3\nquestion=Why is this dispatched on the EDT?`

To answer:
1. Investigate as you normally would (read files, search, run commands)
2. Build a small `items` array — usually 1–3 child steps — addressing the question
3. Call `insert_walkthrough_tangents` with the **exact** `parentLabel` from the question
4. Loop back to `await_walkthrough_question` with the same `walkthroughId`

Tangent items use the same format as top-level items. Give them `file`/`line` when the answer is anchored somewhere specific; omit when the answer is purely conceptual.

If the question is unanswerable (out of scope, hallucinated premise), still respond with at least one tangent item that says so plainly — silence leaves the user staring at a spinner.

## Authoring workflow

```
[ ] 1. Clarify the goal — what should the user understand after stepping through this?
[ ] 2. Pick anchor points — the specific files/lines the narrative hangs on
[ ] 3. Read each anchor file to confirm line numbers and surrounding context
[ ] 4. Draft the items array, one focused step per anchor
[ ] 5. Call show_walkthrough_items, capture walkthroughId
[ ] 6. Enter the await_walkthrough_question loop; respond to each question; stop on dismissed
```

## Common mistakes

- **Skipping the await loop.** The user can't ask questions if you don't wait. Don't call `show_walkthrough_items` and then end your turn.
- **Stale line numbers.** Copying line numbers from a previous session, a diff, or a tool output that wasn't a real file read. Always re-read.
- **Passing items as a list.** The `items` parameter is a JSON string. Stringify.
- **Manually setting `label` or `parentLabel` on items.** The plugin assigns labels. Authors only pass `parentLabel` to `insert_walkthrough_tangents`, never inside an item.
- **Generic descriptions.** `"Walkthrough"` is useless in history; the description is searchable metadata.
- **Walls of text per step.** The popup is small; break content across steps anchored to the relevant lines instead.
- **One step per line of a function.** Group related lines under one anchor; the connector only points at one line per popup.

## Example

User: "Walk me through how the MCP toolset shows a walkthrough."

After reading `ShowWalkthroughItemsToolset.kt` and `WalkthroughOrchestrator.kt` to verify line numbers:

```
mcp__idea__show_walkthrough_items(
  description = "How show_walkthrough_items wires an MCP call to the editor popup",
  items = "[
    {\"text\":\"The MCP framework invokes `showWalkthroughItems` by reflection — it's a `suspend` method annotated `@McpTool`.\",\"file\":\"src/main/kotlin/com/forketyfork/walkthrough/ShowWalkthroughItemsToolset.kt\",\"line\":34},
    {\"text\":\"The active project comes from the coroutine context, not a parameter.\",\"file\":\"src/main/kotlin/com/forketyfork/walkthrough/ShowWalkthroughItemsToolset.kt\",\"line\":139},
    {\"text\":\"UI work hops to the EDT via `withContext(Dispatchers.EDT)` before touching the editor.\",\"file\":\"src/main/kotlin/com/forketyfork/walkthrough/ShowWalkthroughItemsToolset.kt\",\"line\":56},
    {\"text\":\"`showWalkthroughSession` is the actual entry point: it resolves the anchor, creates the Compose popup, and registers a session in `WalkthroughSessionRegistry`.\",\"file\":\"src/main/kotlin/com/forketyfork/walkthrough/WalkthroughOrchestrator.kt\",\"line\":36}
  ]"
)
→ walkthroughId=abc123
```

Then immediately:

```
mcp__idea__await_walkthrough_question(walkthroughId = "abc123")
→ parentLabel=3
  question=What happens if there's no active editor?
```

Build the tangent answer (after re-reading the relevant code), then:

```
mcp__idea__insert_walkthrough_tangents(
  walkthroughId = "abc123",
  parentLabel = "3",
  items = "[{\"text\":\"`showWalkthroughSession` returns null, and the toolset calls `mcpFail(\\\"No active editor\\\")`, which surfaces as an error response to the MCP client.\",\"file\":\"src/main/kotlin/com/forketyfork/walkthrough/ShowWalkthroughItemsToolset.kt\",\"line\":58}]"
)
```

Loop back to `await_walkthrough_question`. Continue until it returns `dismissed`.

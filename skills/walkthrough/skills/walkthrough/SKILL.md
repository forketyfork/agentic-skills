---
name: walkthrough
description: Authors inline code and diff walkthroughs in IntelliJ IDEA via the walkthrough-plugin MCP tools (show_walkthrough_items, show_diff_walkthrough_items, await_walkthrough_question, insert_walkthrough_tangents). Use when the user asks for a guided tour, walkthrough, explainer, code tour, PR/commit/branch review, or "what changed" anchored to specific files and lines (or diff sides and lines), and the `idea` MCP server is available.
---

# Authoring walkthroughs

The [walkthrough-plugin](https://github.com/forketyfork/walkthrough-plugin) renders styled popups inside IntelliJ next to specific lines of code (or to one side of an IDEA diff viewer), lets the user step through items with Previous/Next, and lets them type follow-up questions that you answer by inserting child steps.

The MCP tools form one stateful protocol. Skipping the question-loop leaves the popup waiting for input that never arrives.

## Tools

All tools live on the `idea` MCP server. Fully qualified names:

- `mcp__idea__show_walkthrough_items` — create a **file** walkthrough, returns a `walkthroughId`
- `mcp__idea__show_diff_walkthrough_items` — create a **diff** walkthrough, returns a `walkthroughId`
- `mcp__idea__await_walkthrough_question` — blocks until the user asks a question or dismisses
- `mcp__idea__insert_walkthrough_tangents` — splices answer steps as children of a step

If these tools are not available, do not pretend to create an inline walkthrough. Tell the user that the IntelliJ walkthrough plugin and its `idea` MCP server are required, then offer a normal text walkthrough only if they want one.

## Choose File vs Diff Mode

Before preparing items, choose exactly one mode for the whole walkthrough. Sessions are single-kind; you cannot mix file and diff items in one call or one session.

Use **file** mode for:
- explaining how existing code works
- architecture or onboarding tours
- tracing runtime behavior
- debugging a current implementation without focusing on a change set

Use **diff** mode for:
- PR review
- commit, branch, or patch review
- "what changed?", "review my changes", or "explain this diff"
- risk analysis, regression analysis, or test recommendations for a change set

If the user asks both to review changes and explain surrounding architecture, start with a diff walkthrough and use follow-up tangent steps for extra context, or ask whether they also want a separate file walkthrough afterwards.

## Required protocol

```
show_walkthrough_items(description, items)              → walkthroughId   # file mode
  OR
show_diff_walkthrough_items(description, payload)       → walkthroughId   # diff mode

loop:
  await_walkthrough_question(walkthroughId)             → "dismissed" | (parentLabel, question)
  if dismissed: stop
  answer = build items addressing the question
  insert_walkthrough_tangents(walkthroughId, parentLabel, answer)
```

**You must enter the await loop immediately after the show tool returns.** Do not summarize, do not stop, do not call other tools first. The popup's question UI depends on you waiting. Keep looping until `await_walkthrough_question` returns the literal string `dismissed`.

If a walkthrough tool returns an error such as `No active project`, `No active editor`, `No diff walkthrough items to show`, or `Unknown walkthroughId`, tell the user what failed and stop the loop. Do not retry blindly.

## File item format

`show_walkthrough_items` parses `items` with Gson as a JSON array string. Each object:

```json
{ "text": "...markdown...", "file": "src/Foo.kt", "line": 42 }
```

- `text` (required) — GitHub-flavored markdown. Supported: headings, fenced code with syntax highlighting, lists, tables, strikethrough, GitHub alerts (`> [!NOTE]`), autolinks, inline HTML.
- `file` (optional) — project-relative path, forward slashes.
- `line` (optional) — 1-based line number in the current full file; navigates the editor and anchors the connector to that line.

Items without `file`/`line` render the popup without navigating.

The `items` parameter is a JSON **string** containing an array. Build a JSON array, then stringify it exactly once for the tool argument:

```json
{
  "description": "Auth middleware request flow",
  "items": "[{\"text\":\"This middleware validates the bearer token before routing continues.\",\"file\":\"src/AuthMiddleware.kt\",\"line\":42},{\"text\":\"This step is conceptual and does not navigate.\"}]"
}
```

Do not include `label` or `parentLabel` in item objects. The plugin ignores input labels for top-level items and assigns child labels from the `parentLabel` tool argument.

## Diff item format

`show_diff_walkthrough_items` parses `payload` with Gson as a JSON **object** string containing `diffs` and `items`.

```json
{
  "diffs": [
    {
      "id": "foo-main-to-pr",
      "file": "src/Foo.kt",
      "leftCommit": "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
      "rightCommit": "9f8e7d6c5b4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c"
    }
  ],
  "items": [
    {
      "text": "This new branch handles the null result.",
      "diffId": "foo-main-to-pr",
      "diffFile": "src/Foo.kt",
      "diffSide": "right",
      "line": 42
    }
  ]
}
```

`diffs[]` (descriptors) fields:

- `id` (required) — unique within the payload; items reference it via `diffId`.
- `file` — project-root-relative path shared by both sides (non-rename case).
- `leftFile` / `rightFile` — use these instead of `file` for **renames**; they may differ.
- `leftCommit` / `rightCommit` (required) — Git commit hashes (prefer full hashes) that Git can resolve locally. Refs/short hashes may be accepted but full hashes are stable for history replay.

`items[]` fields:

- `text` (required) — same markdown rules as file items.
- `diffId` (required) — must match a descriptor's `id`.
- `diffFile` (optional but recommended) — item path. If omitted, the parser falls back to the descriptor's `file`, then `rightFile`, then `leftFile`. For renames, include the side-specific path matching `diffSide`.
- `diffSide` (required) — `"left"` or `"right"`.
- `line` (required) — 1-based line in the chosen side's **full file text at that commit**, not a patch hunk line.

Side rules:

- Use `right` for added or modified new code.
- Use `left` for removed/old code.
- Use `right` for unchanged context lines, unless the step specifically discusses the old version.

Pass `payload` as a JSON **string** (stringify once):

```json
{
  "description": "Review PR #123: null-handling in Foo",
  "payload": "{\"diffs\":[{\"id\":\"foo-main-to-pr\",\"file\":\"src/Foo.kt\",\"leftCommit\":\"1a2b...\",\"rightCommit\":\"9f8e...\"}],\"items\":[{\"text\":\"This new branch handles the null result.\",\"diffId\":\"foo-main-to-pr\",\"diffFile\":\"src/Foo.kt\",\"diffSide\":\"right\",\"line\":42}]}"
}
```

Do **not** submit file contents in any field. Submit commit hashes; the plugin renders a native IDEA diff from the Git revisions.

## Diff commits

For diff walkthroughs, submit commit hashes, not file text. The plugin requires the `Git4Idea` bundled plugin and resolves revisions through the platform's Git cache.

For **PR walkthroughs**:
- Fetch the PR branch and the target branch if needed.
- Resolve the merge base between the target branch and the PR head.
- Use the merge-base commit as `leftCommit`.
- Use the PR head commit as `rightCommit`.
- For every walkthrough item, verify the anchor line in the selected side at that commit.

For **single-commit walkthroughs**, use the first parent as `leftCommit` and the commit being explained as `rightCommit`.

For **branch walkthroughs**, use the merge base of the target branch and topic branch as `leftCommit` and the topic branch head as `rightCommit`.

Prefer full 40-character SHAs over refs/short hashes — they are stable for history replay even after branches move.

## Line Numbers (mandatory verification)

Line numbers must be correct — the connector visibly points at that line. Never estimate from a diff, commit message, memory, or LSP output.

**File walkthrough lines** are 1-based lines in the current full file in the working tree.

For each file item with a `line`:
1. Read the file.
2. Confirm the line number matches the symbol/expression the step describes.
3. Use `rg -n` to find candidate anchors when available; if `rg` is unavailable, use `grep -n`.
4. Treat search output as a candidate only; re-read the current file before using the line number.

**Diff walkthrough lines** are 1-based lines in the selected side's **full file text at that commit**, not patch hunk line numbers. For each diff item:

1. Inspect that exact file at that exact commit on the requested side, e.g. `git show <rightCommit>:src/Foo.kt | nl -ba` (use `<leftCommit>` and `leftFile`/`file` for `diffSide: "left"`).
2. Confirm the line number matches the symbol/expression the step describes in that revision.
3. Re-verify after any rebase or force-push — line numbers move when commits change.

## Labels

Top-level items are auto-labeled `1`, `2`, `3`, … in order. Do not set labels yourself.

Child steps inserted via `insert_walkthrough_tangents` are auto-labeled by appending `.N` to the parent: tangents under `3` become `3.1`, `3.2`. Nested tangents under `3.1` become `3.1.1`, etc. Pass the exact `parentLabel` returned by `await_walkthrough_question`.

## Description field

A short human-readable phrase, shown in the project's walkthrough history (`.idea/walkthroughs/`). Treat it as the title a user will scan a week later. Examples:

- `"Auth middleware request flow"`
- `"How WalkthroughPopupSurface paints the connector"`
- `"Review PR #123: null-handling in Foo"`
- `"Commit abc1234: extract DiffWalkthroughSession"`

Avoid generic phrases like `"Code walkthrough"`, `"Tour"`, or `"Diff"`.

## Writing step content

Each step is one focused idea anchored to one location. The popup is ~560×300px — readable, but not a doc page.

Good step text:
- Opens with the **what** in one sentence, then the **why** if non-obvious.
- Uses inline code for identifiers: `` `WalkthroughSession` ``.
- Uses fenced code blocks for snippets longer than a line or two.
- Quotes the actual surrounding code only when the reader needs more than what's visible at the anchored line.

A walkthrough is a narrative, not a file dump. If two consecutive steps differ only in line number, merge them or rewrite to show progression.

Suggested step count for a single walkthrough: 3–8 top-level items. Longer than that, the user loses the thread; shorter than that, a comment would have done the job.

## Q&A loop: answering tangents

`await_walkthrough_question` returns either:
- `dismissed` (literal string) — stop the loop.
- a body like `parentLabel=3\nquestion=Why is this dispatched on the EDT?`

To answer:
1. Investigate as you normally would (read files, search, inspect commits, run commands).
2. Build a small `items` array — usually 1–3 child steps — addressing the question.
3. Call `insert_walkthrough_tangents` with the **exact** `parentLabel` from the question.
4. Loop back to `await_walkthrough_question` with the same `walkthroughId`.

Tangent items must use the **same kind** as the parent walkthrough: file items for a file walkthrough, diff items (with `diffId`, `diffFile`, `diffSide`, `line` referring to descriptors from the original `show_diff_walkthrough_items` call) for a diff walkthrough. The plugin parses the items array according to the stored session kind.

Tangent items use the same field shape as top-level items of that kind. Give them anchor fields when the answer is anchored somewhere specific; for file walkthroughs you may omit `file`/`line` when the answer is purely conceptual. For diff walkthroughs, tangent items should normally still anchor to one of the original diff descriptors.

If the question is unanswerable (out of scope, hallucinated premise), still respond with at least one tangent item that says so plainly — silence leaves the user staring at a spinner.

## Authoring workflow

```
[ ] 1. Clarify the goal — what should the user understand after stepping through this?
[ ] 2. Choose file vs diff mode based on the user's request
[ ] 3. Pick anchor points — files/lines (file mode) or descriptor+side+line (diff mode)
[ ] 4. For diff mode: resolve commit hashes (merge base + head, parent + commit, etc.)
[ ] 5. Verify each anchor line by reading the file (file mode) or `git show <sha>:<path>` (diff mode)
[ ] 6. Draft the items array, one focused step per anchor
[ ] 7. Call show_walkthrough_items or show_diff_walkthrough_items, capture walkthroughId
[ ] 8. Enter the await_walkthrough_question loop; respond to each question; stop on dismissed
```

## Common mistakes

- **Skipping the await loop.** The user can't ask questions if you don't wait. Don't call a show tool and then end your turn.
- **Mixing file and diff items in one session.** Use the matching show tool; tangents must match the parent session kind.
- **Using a file walkthrough for "what changed".** PR / commit / branch / patch review must use `show_diff_walkthrough_items`.
- **Submitting file contents in the diff payload.** Pass commit hashes only.
- **Using patch hunk line numbers for diff items.** `line` is into the side's full file text at the commit, not the diff hunk.
- **Stale or remembered line numbers.** Copying line numbers from a previous session, a diff, or a tool output that wasn't a real file/commit read. Always re-verify.
- **Passing items or payload as a list/object instead of a string.** Both `items` and `payload` are JSON strings. Stringify.
- **Manually setting `label` or `parentLabel` on items.** The plugin assigns labels. Authors only pass `parentLabel` to `insert_walkthrough_tangents`, never inside an item.
- **Generic descriptions.** `"Walkthrough"` or `"Diff"` is useless in history; the description is searchable metadata.
- **Walls of text per step.** The popup is small; break content across steps anchored to the relevant lines instead.
- **One step per line of a function.** Group related lines under one anchor; the connector only points at one line per popup.

## File walkthrough example

User: "Walk me through how the MCP toolset shows a walkthrough."

After reading the current files and verifying the line numbers:

```json
{
  "description": "How show_walkthrough_items wires an MCP call to the editor popup",
  "items": "[{\"text\":\"The MCP framework invokes `showWalkthroughItems` by reflection from an `@McpTool` method.\",\"file\":\"src/main/kotlin/com/forketyfork/walkthrough/ShowWalkthroughItemsToolset.kt\",\"line\":43},{\"text\":\"The active project comes from the coroutine context, not from a tool parameter.\",\"file\":\"src/main/kotlin/com/forketyfork/walkthrough/ShowWalkthroughItemsToolset.kt\",\"line\":226},{\"text\":\"UI work runs on the EDT before the tool touches the editor and popup state.\",\"file\":\"src/main/kotlin/com/forketyfork/walkthrough/ShowWalkthroughItemsToolset.kt\",\"line\":80},{\"text\":\"`showWalkthroughSession` resolves the first anchor before creating the popup session and handing the items to the UI.\",\"file\":\"src/main/kotlin/com/forketyfork/walkthrough/WalkthroughOrchestrator.kt\",\"line\":31}]"
}
```

Then immediately call `await_walkthrough_question` with the returned `walkthroughId`.

If it returns:

```
parentLabel=3
question=What happens if there's no active editor?
```

Build the tangent answer after re-reading the relevant code, then call `insert_walkthrough_tangents`:

```json
{
  "walkthroughId": "abc123",
  "parentLabel": "3",
  "items": "[{\"text\":\"If no active editor is available, `showWalkthroughSession` returns null and the tool reports `No active editor` to the MCP client.\",\"file\":\"src/main/kotlin/com/forketyfork/walkthrough/ShowWalkthroughItemsToolset.kt\",\"line\":82}]"
}
```

Loop back to `await_walkthrough_question`. Continue until it returns `dismissed`.

## Diff walkthrough example

User: "Review my PR #123 that adds null-handling to `Foo`."

After resolving the merge base (`1a2b...`) and PR head (`9f8e...`), fetching both commits locally, and verifying each anchor line via `git show <sha>:<path> | nl -ba`:

```json
{
  "description": "Review PR #123: null-handling in Foo",
  "payload": "{\"diffs\":[{\"id\":\"foo-pr\",\"file\":\"src/Foo.kt\",\"leftCommit\":\"1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b\",\"rightCommit\":\"9f8e7d6c5b4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c\"}],\"items\":[{\"text\":\"The new guard returns early when the lookup misses, replacing the previous NPE path.\",\"diffId\":\"foo-pr\",\"diffFile\":\"src/Foo.kt\",\"diffSide\":\"right\",\"line\":42},{\"text\":\"The old code dereferenced the result unconditionally on this line.\",\"diffId\":\"foo-pr\",\"diffFile\":\"src/Foo.kt\",\"diffSide\":\"left\",\"line\":38}]}"
}
```

Then immediately call `await_walkthrough_question` with the returned `walkthroughId` and stay in the loop. Any tangents must also be diff items referencing `diffId: "foo-pr"` and the appropriate side and line at the same commits.

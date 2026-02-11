---
name: review-story
description: Generate a narrative story of a PR's changes with embedded code snippets. Use when the user asks to create a PR story, review story, or narrative walkthrough of a pull request's changes.
---

# PR Story Generator

You are generating a structured narrative that tells the story of a pull request. The output must be parseable for later visualization.

The user will provide a PR number or URL. Use it in the `gh` commands below.

## Step 1: Gather PR metadata

Run these commands to collect context:

```
gh pr view <pr> --json title,body,author,baseRefName,headRefName,commits,files,additions,deletions
```

Extract the PR number, branch name, base branch, title, and description. Pay attention to the PR description (`body`) — it often explains the author's intent, motivation, and context that aren't visible from the code alone. Use this to inform your narrative.

## Step 2: Get PR comments and review feedback

Fetch conversation comments and review comments to understand the discussion around the PR:

```
gh pr view <pr> --json comments --jq '.comments[] | "**\(.author.login)**: \(.body)\n"'
```

For inline review comments (code-level feedback):

```
gh pr view <pr> --json reviews --jq '.reviews[] | select(.body != "") | "**\(.author.login)** (\(.state)): \(.body)\n"'
```

These comments provide valuable context — they may reveal why certain decisions were made, what was revised, or what trade-offs were considered. Weave relevant insights from the discussion into your narrative where appropriate.

## Step 3: Get the commit history

```
gh pr view <pr> --json commits --jq '.commits[] | "\(.oid) \(.messageHeadline)"'
```

If there are multiple commits, this is important — you will narrate the evolution of changes commit by commit.

## Step 4: Get the full diff

```
gh pr diff <pr>
```

If the diff is very large (over ~2000 lines), focus on the most structurally significant changes. Skip trivial changes like import reordering, whitespace, lock files, and auto-generated code.

## Step 5: If multiple commits exist, examine evolution

For each significant commit, look at what specifically changed:

```
git show <commit-sha> --stat
git show <commit-sha> -- <specific-file>
```

This helps you explain HOW the code evolved across commits, not just the final state.

## Step 6: Write the story

### Output format

Write a Markdown document. The narrative is prose text explaining what the author did and why, interspersed with code snippets.

**Every code snippet must be wrapped in a fenced block with the `story-diff` info string and a JSON metadata comment on the first line:**

````markdown
Some narrative explaining what happens next...

```story-diff
<!-- {"file": "src/api/users.ts", "commit": "a1b2c3d", "type": "addition", "description": "New user validation endpoint"} -->
+export async function validateUser(req: Request) {
+  const { email, password } = req.body;
+  if (!email || !password) {
+    throw new ValidationError('Missing credentials');
+  }
+}
```

Then the author moved on to...
````

**Metadata fields:**
- `file` — the file path
- `commit` — short SHA (if attributable to a specific commit, otherwise omit)
- `type` — one of: `addition`, `deletion`, `modification`, `rename`, `context`
- `description` — brief label for what this snippet represents

### Line references

When the prose needs to point the reader to specific lines in the immediately following snippet, use **line references**:

- In prose, use **`**[N]**`** — visible bold markers that readers can follow
- In code, use **`<!--ref:N-->`** appended to the referenced line
- Reference numbers reset with each snippet (always start from 1)
- Only use references when they genuinely aid comprehension — not every snippet needs them

````markdown
The author initializes the connection pool **[1]** but defers cleanup
to a shutdown hook **[2]**, which ensures graceful teardown even on
SIGTERM.

```story-diff
<!-- {"file": "src/db/pool.ts", "commit": "f4e5d6c", "type": "addition", "description": "Connection pool with graceful shutdown"} -->
+const pool = new Pool({ <!--ref:1-->
+  max: 20,
+  idleTimeoutMillis: 30000,
+});
+
+process.on('SIGTERM', async () => {
+  await pool.end(); <!--ref:2-->
+  process.exit(0);
+});
```
````

**Code snippet rules:**
- Use unified diff format with `+`/`-` prefixes for added/removed lines
- Include a few lines of unchanged context (prefix with space) where it helps understanding
- Keep snippets focused: 5–40 lines each. Trim aggressively.
- For large structural additions, show the signature/shape, not every line

### Narrative rules

- **Tell a story, not a list.** Write flowing prose: "First, the author introduced...", "To support this, they added...", "This required updating..."
- **Follow logical order, not file order.** Group by intent: "Here's the new API endpoint, and here's the frontend form that calls it."
- **If there were multiple commits, narrate the evolution.** "In the first commit, the author scaffolded the migration. In the second, they refined the error handling after..."
- **Be opinionated about what matters.** Skip boilerplate. Highlight architectural decisions, tricky logic, and non-obvious choices.
- **Incorporate discussion context.** If PR comments or reviews reveal why a decision was made or what was debated, mention it naturally: "After feedback on the initial approach, the author switched to..." or "As noted in the review discussion, this trade-off was intentional because..."
- **Note potential issues or interesting patterns** if you spot them, but keep it brief.
- **Start with a one-paragraph summary** of what the PR accomplishes before diving into the detailed story.
- **End with a brief conclusion** summarizing the overall change.

### Length guidelines

- Small PR (<200 lines diff): 3–8 code snippets, ~500–1000 words of prose
- Medium PR (200–1000 lines): 5–15 code snippets, ~1000–2000 words of prose
- Large PR (1000+ lines): 8–20 code snippets, ~1500–3000 words of prose. Be highly selective.

## Step 7: Save the output

Save the story as `pr-story-<pr-number>.md` in the current directory.

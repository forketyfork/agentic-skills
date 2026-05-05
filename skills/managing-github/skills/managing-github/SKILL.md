---
name: managing-github
description: |
  Interact with GitHub via the gh CLI: create issues, pull requests, fetch
  review threads, post comments, and search. Use when the project's source code
  hosting or issue tracker is GitHub.
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

# GitHub CLI reference

## Repository setup

### Repository metadata

Set a description and topics for discoverability:

```bash
gh repo edit --description "<description>" \
  --add-topic "<topic1>" --add-topic "<topic2>"
```

Add a homepage link if applicable:

```bash
gh repo edit --homepage "<url>"
```

### Default branch

Rename the default branch to `main` if it is still named `master`:

```bash
# Rename the branch on GitHub (also updates the default branch)
gh api repos/<org>/<repo>/branches/master/rename \
  --method POST --field new_name=main

# Update your local clone to track the renamed branch
git branch -m master main
git fetch origin
git branch -u origin/main main
git remote set-head origin -a
```

### Secret scanning and push protection

Enable via:

`https://github.com/<org>/<repo>/settings/security_analysis`

- **Secret scanning:** enabled
- **Push protection:** enabled

### Code scanning (CodeQL)

Enable CodeQL with default settings via:

`https://github.com/<org>/<repo>/settings/security_analysis`

- **CodeQL analysis:** enabled with default setup

### CI workflow permissions

In every GitHub Actions workflow file, add a top-level `permissions` block with
minimum required access:

```yaml
permissions:
  contents: read
```

### Branch rulesets

On `https://github.com/<org>/<repo>/settings/rules`, create a ruleset named
"Protect the main" targeting the default branch with these settings:

- **Require status checks to pass** — add the CI build job as a required check
- **Require branches to be up to date before merging**
- **Block force pushes**
- **Restrict deletions**
- **Require code scanning results**

### Dependabot configuration

Create `.github/dependabot.yml` with ecosystem-appropriate entries. Example for
Maven/Gradle:

```yaml
version: 2
updates:
  - package-ecosystem: "maven"
    directory: "/"
    schedule:
      interval: "daily"
    groups:
      all-dependencies:
        patterns:
          - "*"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      all-actions:
        patterns:
          - "*"
```

Enable Dependabot features via:

`https://github.com/<org>/<repo>/settings/security_analysis`

- **Dependency graph:** enabled
- **Dependabot alerts:** enabled
- **Grouped security updates:** enabled
- **Dependabot security updates:** enabled

## Issues

Create an issue:

```bash
gh issue create --title "<title>" --label "<labels>" --body "<body>"
```

For long bodies, write to a temp file and use `--body-file`:

```bash
gh issue create --title "<title>" --label "<labels>" --body-file .tmp/issue-body-$RANDOM.md
```

Search issues:

```bash
gh issue list --search "<query>"
gh issue list --label "bug"
```

## Pull requests

Create a PR:

```bash
gh pr create --title "<title>" --body-file .tmp/pr-body-$RANDOM.md
```

Create a draft PR:

```bash
gh pr create --draft --title "<title>" --body-file .tmp/pr-body-$RANDOM.md
```

Include `Fixes #<number>` in PR body to auto-close the linked issue on merge.

View PR details:

```bash
gh pr view <number>
gh pr view --json number --jq '.number'
gh pr diff <number>
```

Fetch PR comments (paginated):

```bash
gh api repos/<org>/<repo>/pulls/<pr>/comments --paginate
```

Get root-level comments only:

```bash
gh api repos/<org>/<repo>/pulls/<pr>/comments --paginate \
  --jq '[.[] | select(.in_reply_to_id == null)]'
```

## Review threads and comments

Fetch review threads with resolution state:

```bash
gh api graphql -f query='
{
  repository(owner: "<org>", name: "<repo>") {
    pullRequest(number: <pr>) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          comments(first: 1) {
            nodes {
              databaseId
              body
              author { login }
              path
            }
          }
        }
      }
    }
  }
}'
```

Reply to a review comment:

```bash
gh api repos/<org>/<repo>/pulls/<pr>/comments \
  --method POST \
  --field in_reply_to=<comment_id> \
  --field body="<reply text>"
```

Post an issue comment:

```bash
gh api repos/<org>/<repo>/issues/<number>/comments \
  --method POST \
  --field body="<comment text>"
```

Avoid shell expansion issues by using a body file:

```bash
gh api repos/<org>/<repo>/pulls/<pr>/comments \
  --method POST \
  --field in_reply_to=<comment_id> \
  --field body=@.tmp/reply.txt
```

## Posting a pending review with inline comments

The default for any agent-posted review is **pending** — a draft visible only to the review author until they submit it manually from the GitHub UI. Never use `event: COMMENT | APPROVE | REQUEST_CHANGES` on the user's behalf without explicit authorization; those values publish the review immediately. Omitting `event` is what keeps the review pending.

Get the full PR head SHA. Abbreviated SHAs are rejected as `"invalid GitObjectID"`:

```bash
gh api repos/<org>/<repo>/pulls/<pr> --jq '.head.sha'
```

Identify valid lines for inline comments. A comment must anchor to a line inside a diff hunk on the new side (`RIGHT`); lines in unchanged context between hunks are rejected with `"Line could not be resolved"`. Each hunk header has the form `@@ -X[,Y] +A[,B] @@`; when a count (`,Y` or `,B`) is omitted, treat it as `1`. Valid new-side lines are `A` through `A + (B-1)` inclusive:

- `@@ -10,3 +12,5 @@` → new-side lines 12 through 16
- `@@ -10 +12 @@` → new-side line 12 only (single-line hunk)
- `@@ -10,3 +12 @@` → new-side line 12 only

Get each file's patch via:

```bash
gh api repos/<org>/<repo>/pulls/<pr>/files --paginate
```

Build the payload. Write it to a body file to avoid shell-expansion issues with backticks or special characters in the comment text:

```json
{
  "commit_id": "<full sha>",
  "body": "<top-level summary>",
  "comments": [
    { "path": "<file>", "line": 42, "side": "RIGHT", "body": "<inline comment>" }
  ]
}
```

POST the payload:

```bash
gh api -X POST repos/<org>/<repo>/pulls/<pr>/reviews \
  --input .tmp/review-$RANDOM.json
```

Verify the response includes `"state": "PENDING"`. Report the review ID to the user; the draft is visible only to them and does not notify the PR author. They submit it from the GitHub UI (*Files changed* → *Finish your review*).

Discard a pending review:

```bash
gh api -X DELETE repos/<org>/<repo>/pulls/<pr>/reviews/<review-id>
```

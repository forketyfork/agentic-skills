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

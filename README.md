# Agentic Skills

A collection of Claude Code plugins for structured development workflows.

## Plugins

### airtight-plans

Writes structured multi-step implementation plans in markdown format. Each step includes four sections: Status Quo, Objectives, Tech Notes, and Acceptance Criteria.

Activates when you ask Claude to create an implementation plan, development roadmap, or multi-step task breakdown.

### review-story

Generates a narrative story of a pull request's changes with embedded code snippets. Gathers PR metadata, comments, review feedback, commit history, and the full diff, then writes a flowing prose walkthrough interspersed with annotated `story-diff` code blocks.

Activates when you ask Claude to create a PR story or narrative walkthrough of a pull request.

### managing-youtrack

Interacts with YouTrack issue tracker via REST API. Create, read, update, and search issues and drafts; manage comments, tags, and issue links; log work items; inspect custom field schemas; list saved queries; look up users and groups.

Activates when you ask Claude about YouTrack issues, want to file bugs, update tickets, add comments, manage tags or links, track time, or search for issues. Requires `YOUTRACK_URL` and `YOUTRACK_TOKEN` environment variables.

### managing-github

Interacts with GitHub via the gh CLI: create issues, PRs, fetch review threads, post comments, and search.

Activates when you ask Claude to work with GitHub repositories, issues, PRs, or review comments.

### walkthrough

Authors and revises inline code and diff walkthroughs in IntelliJ IDEA via the [walkthrough-plugin](https://plugins.jetbrains.com/plugin/31637-walkthrough/) MCP tools (`show_walkthrough_items`, `show_diff_walkthrough_items`, `await_walkthrough_question`, `insert_walkthrough_tangents`). Covers saved presentation revisions, the show/await/insert protocol, file and diff item formats, line-number verification, and tangent answering.

Activates when you ask Claude for a guided tour, walkthrough, explainer, code tour, PR/commit/branch review, or "what changed" view anchored to specific files and lines or diff sides. Requires the walkthrough-plugin installed in IntelliJ and its `idea` MCP server reachable from Claude Code.

With Walkthrough Plugin 0.6.0 or later and walkthrough skill 0.2.0 or later, you can say: "Shorten the introduction and show me the updated walkthrough without adding another history entry." The agent updates the same saved presentation as you iterate. Ask for a separate copy when you want to keep the original as well.

## Installation

In Claude Code:

```
/plugin marketplace add forketyfork/agentic-skills
/plugin install airtight-plans@agentic-skills
/plugin install review-story@agentic-skills
/plugin install managing-youtrack@agentic-skills
/plugin install managing-github@agentic-skills
/plugin install walkthrough@agentic-skills
```

## License

Apache 2.0

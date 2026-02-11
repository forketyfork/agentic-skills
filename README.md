# Agentic Skills

A collection of Claude Code skills for structured development workflows.

## Skills

### airtight-plans

Writes structured multi-step implementation plans in markdown format. Each step includes four sections: Status Quo, Objectives, Tech Notes, and Acceptance Criteria.

Activates when you ask Claude to create an implementation plan, development roadmap, or multi-step task breakdown.

### review-story

Generates a narrative story of a pull request's changes with embedded code snippets. Gathers PR metadata, comments, review feedback, commit history, and the full diff, then writes a flowing prose walkthrough interspersed with annotated `story-diff` code blocks.

Activates when you ask Claude to create a PR story or narrative walkthrough of a pull request.

## Installation

In Claude Code:

```
/plugin marketplace add forketyfork/agentic-skills
/plugin install airtight-plans@agentic-skills
/plugin install review-story@agentic-skills
```

## License

Apache 2.0 - see [LICENSE.txt](skills/airtight-plans/LICENSE.txt)

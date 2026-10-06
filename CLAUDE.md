# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A plugin marketplace for Claude Code, distributing skills for structured development workflows. Each plugin lives in `skills/<plugin-name>/` with a `.claude-plugin/plugin.json` manifest and skills in `skills/<skill-name>/SKILL.md`.

## Repository Structure

```
.claude-plugin/
  marketplace.json          # Marketplace catalog
skills/
  <plugin-name>/
    .claude-plugin/
      plugin.json           # Plugin manifest (name, description, version)
    skills/
      <skill-name>/
        SKILL.md            # Skill definition (frontmatter + prompt)
        reference/           # Supporting files (if applicable)
```

## Current Plugins

- **airtight-plans** — Generates structured multi-step implementation plans with Status Quo, Objectives, Tech Notes, and Acceptance Criteria sections per step.
- **review-story** — Generates narrative PR walkthroughs with `story-diff` code blocks and line references. Uses `gh` CLI to gather PR data.
- **managing-youtrack** — Interacts with YouTrack issue tracker via REST API. Manages issues, drafts, comments, tags, links, time tracking, custom fields, saved queries, users, and groups.
- **managing-github** — Interacts with GitHub via the gh CLI: issues, PRs, review threads, comments, and search.
- **walkthrough** — Authors and revises inline code and diff walkthroughs in IntelliJ IDEA via the walkthrough-plugin MCP tools.
- **blind-spots** — A hooks-module plugin: after a long turn, a tool-less fork of the session reviews it and flags one missed decision, risk, gap or concept in a banner above the prompt; how the user reacts adjusts how often it reviews and what it raises.

## Writing Skills

Each plugin contains:
1. `.claude-plugin/plugin.json` — manifest with `name`, `description`, `version`, and optionally `license`
2. `skills/<skill-name>/SKILL.md` — YAML frontmatter (`name`, `description`) followed by the skill prompt in Markdown

The `description` field in SKILL.md frontmatter determines when the skill activates. Refer to `~/.claude/skills/best-practices.md` for authoring guidelines.

## Writing Hooks-Module Plugins

A plugin can instead ship TypeScript function hooks (see `skills/blind-spots/`):
1. `.claude-plugin/plugin.json` — manifest; `types` names the plugin's state contract (`types/index.d.ts`), `userConfig` declares its options
2. `hooks/hooks.json` — `{ "modules": ["./register.tsx"] }`
3. `hooks/register.tsx` — exports `register(on, options)`; any function that receives `$` must be declared at the top level of the file
4. `tests/*.test.tsx` — run with `claude plugin test skills/<plugin-name>`

Run `claude plugin validate skills/<plugin-name>` and `claude plugin test skills/<plugin-name>` after every change. The API is early access and changes between Claude Code releases; the typings the engine writes into `.claude-plugin/types/` (gitignored) are the reference.

## Versioning

When changing a plugin, bump its version in **both** places:
1. `skills/<plugin-name>/.claude-plugin/plugin.json` — the `version` field
2. `.claude-plugin/marketplace.json` — the matching entry in the `plugins` array

Use semver: patch for fixes, minor for new features, major for breaking changes.

## Installation (for testing)

```
/plugin marketplace add forketyfork/agentic-skills
/plugin install <plugin-name>@agentic-skills
```

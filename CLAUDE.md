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

## Writing Skills

Each plugin contains:
1. `.claude-plugin/plugin.json` — manifest with `name`, `description`, `version`, and optionally `license`
2. `skills/<skill-name>/SKILL.md` — YAML frontmatter (`name`, `description`) followed by the skill prompt in Markdown

The `description` field in SKILL.md frontmatter determines when the skill activates. Refer to `~/.claude/skills/best-practices.md` for authoring guidelines.

## Installation (for testing)

```
/plugin marketplace add forketyfork/agentic-skills
/plugin install <plugin-name>@agentic-skills
```

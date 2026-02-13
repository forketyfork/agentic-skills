# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A collection of Claude Code skills (plugins) for structured development workflows. Each skill lives in `skills/<skill-name>/SKILL.md` and follows the Claude Code skill format with YAML frontmatter (`name`, `description`, `license`) followed by the skill prompt in Markdown.

## Repository Structure

```
skills/
  <skill-name>/
    SKILL.md          # Skill definition (frontmatter + prompt)
    LICENSE.txt        # License file (if applicable)
```

## Current Skills

- **airtight-plans** — Generates structured multi-step implementation plans with Status Quo, Objectives, Tech Notes, and Acceptance Criteria sections per step.
- **review-story** — Generates narrative PR walkthroughs with `story-diff` code blocks and line references. Uses `gh` CLI to gather PR data.
- **managing-youtrack** — Interacts with YouTrack issue tracker via REST API. Manages issues, drafts, comments, tags, links, time tracking, custom fields, saved queries, users, and groups.

## Writing Skills

Skills are defined as a single `SKILL.md` file with:
1. YAML frontmatter between `---` delimiters containing `name`, `description`, and optionally `license`
2. Markdown body with the skill's instructions/prompt

The `description` field in frontmatter determines when the skill activates. Refer to `~/.claude/skills/best-practices.md` for authoring guidelines.

## Installation (for testing)

```
/plugin marketplace add forketyfork/agentic-skills
/plugin install <skill-name>@agentic-skills
```

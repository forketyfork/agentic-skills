# Airtight Plans

A Claude Code skill for writing structured multi-step implementation plans in markdown format.

## Why "Airtight"?

Every step includes four sections that leave no gaps:
- **Status Quo** - What exists before this step
- **Objectives** - What we're trying to achieve
- **Tech Notes** - How to implement it
- **Acceptance Criteria** - How to verify it's done

No ambiguity, no missing context, no gaps.

## Installation

In Claude Code:

```
/plugin marketplace add forketyfork/agentic-skills
/plugin install airtight-plans@agentic-skills
```

## What It Does

This skill helps Claude write implementation plans with:

- Numbered steps (`## Step N: Title`)
- Four sections per step:
  - **Status Quo** - What exists at the start
  - **Objectives** - Business requirements and goals
  - **Tech Notes** - Implementation hints (optional)
  - **Acceptance Criteria** - Verification steps

## When It Activates

The skill activates when you ask Claude to:
- Create an implementation plan
- Write a development roadmap
- Break down a multi-step task

## Example Output

```markdown
## Step 1: Create user model

### Status Quo
- Database is configured with migrations support
- No user-related tables exist yet

### Objectives
Create the foundational User model to store account credentials.

### Tech Notes
- Use UUID for id to avoid enumeration attacks
- Store passwordHash, never plain passwords

### Acceptance Criteria
- `just test` passes including new user model tests
- Unit test verifies passwordHash !== plaintext password
```

## License

Apache 2.0 - see [LICENSE.txt](skills/airtight-plans/LICENSE.txt)

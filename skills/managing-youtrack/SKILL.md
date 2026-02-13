---
name: managing-youtrack
description: |
  Interact with YouTrack issue tracker via REST API. Create, read, update, and
  search issues and drafts; manage comments, tags, and issue links; log work
  items; inspect custom field schemas; list saved queries; look up users and
  groups. Use when the user asks about YouTrack issues, wants to file bugs,
  update tickets, add comments, manage tags or links, track time, or search
  for issues. Requires YOUTRACK_URL and YOUTRACK_TOKEN environment variables.
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
---

# YouTrack REST API

Interact with YouTrack via its REST API using `curl`.

## Setup

All requests use `curl` with Bearer token auth and `Accept: application/json`. POST requests additionally need `Content-Type: application/json`. Always request specific fields via the `fields` query parameter — without it, the API returns only entity IDs.

Examples below use shorthand for brevity — expand to full `curl` with the headers above when executing:

- `yt_get "path"` → `curl -s -H "Authorization: Bearer $YOUTRACK_TOKEN" -H "Accept: application/json" "$YOUTRACK_URL/api/path"`
- `yt_post "path" '{...}'` → same with `-X POST -H "Content-Type: application/json" -d '{...}'`
- `yt_delete "path"` → same with `-X DELETE`

## API Reference

- **Issues, drafts & comments**: See [reference/issues.md](reference/issues.md)
- **Tags, links & time tracking**: See [reference/metadata.md](reference/metadata.md)
- **Field schema, saved queries, users, groups & projects**: See [reference/admin.md](reference/admin.md)

## Field quick reference

### Common fields parameter values

| Entity | Fields |
|---|---|
| Minimal issue | `idReadable,summary` |
| Standard issue | `idReadable,summary,description,reporter(login,name),created,updated,resolved,customFields(name,value(name)),tags(name)` |
| Issue with comments | add `comments(id,text,author(login,name),created)` |
| Issue with links | add `links(id,direction,linkType(name),issues(idReadable,summary))` |
| Comment | `id,text,author(login,name),created,updated` |
| Work item | `id,author(login,name),text,type(name),duration(minutes,presentation),date,created` |
| Tag | `id,name` |
| User | `id,login,fullName,email` |
| Group | `id,name,usersCount` |

### Custom field $type values

| Field type | $type |
|---|---|
| Single enum (Priority, Type) | `SingleEnumIssueCustomField` |
| Multi enum | `MultiEnumIssueCustomField` |
| Single user (Assignee) | `SingleUserIssueCustomField` |
| Multi user | `MultiUserIssueCustomField` |
| State | `StateIssueCustomField` |
| Date | `DateIssueCustomField` |
| Period | `PeriodIssueCustomField` |
| Text | `TextIssueCustomField` |
| Simple (string/int/float) | `SimpleIssueCustomField` |

For user fields, use `{"login": "username"}`. For enum/state fields, use `{"name": "Value Name"}`.

## Output requirements

After any create, update, or delete operation, always output a clickable link to the affected item:

- **Issue**: `$YOUTRACK_URL/issue/<idReadable>` (e.g. `$YOUTRACK_URL/issue/PROJ-123`)
- **Comment**: `$YOUTRACK_URL/issue/<idReadable>#focus=Comments-<COMMENT_ID>`
- **Draft**: drafts are only accessible via the API and have no web URL

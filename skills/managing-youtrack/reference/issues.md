# Issues, Drafts & Comments

## Contents
- [Issues: Search/List](#issues-searchlist)
- [Issues: Get single](#issues-get-single)
- [Issues: Create](#issues-create)
- [Issues: Update](#issues-update)
- [Issues: Delete](#issues-delete)
- [Issue Drafts](#issue-drafts)
- [Comments](#comments)

---

## Issues: Search/List

```bash
yt_get "issues?fields=idReadable,summary,description,reporter(login,name),created,resolved,customFields(name,value(name))&query=<QUERY>&\$top=<N>&\$skip=<N>"
```

- `query` — YouTrack search query (e.g. `project: PROJ State: Open`, `for: me`, `#unresolved`)
- `$top` — max results (default varies, typically 42)
- `$skip` — offset for pagination

## Issues: Get single

Use either the database ID (e.g. `2-24`) or the readable ID (e.g. `PROJ-123`):

```bash
yt_get "issues/PROJ-123?fields=idReadable,summary,description,reporter(login,name),created,updated,resolved,comments(id,text,author(login,name),created),customFields(name,value(name)),tags(name)"
```

## Issues: Create

Requires `project.id` and `summary`. Get the project ID from the projects endpoint first.

```bash
yt_post "issues?fields=idReadable,summary" '{
  "project": {"id": "<PROJECT_DB_ID>"},
  "summary": "Issue title",
  "description": "Issue description in markdown"
}'
```

To set custom fields at creation time, add `customFields` array:

```json
{
  "project": {"id": "0-3"},
  "summary": "Issue title",
  "description": "Description",
  "customFields": [
    {"name": "Priority", "$type": "SingleEnumIssueCustomField", "value": {"name": "Major"}},
    {"name": "Assignee", "$type": "SingleUserIssueCustomField", "value": {"login": "jane.doe"}}
  ]
}
```

## Issues: Update

```bash
yt_post "issues/PROJ-123?fields=idReadable,summary,description" '{
  "summary": "Updated title",
  "description": "Updated description"
}'
```

To update custom fields:

```bash
yt_post "issues/PROJ-123?fields=customFields(name,value(name))" '{
  "customFields": [
    {"name": "State", "$type": "StateIssueCustomField", "value": {"name": "In Progress"}},
    {"name": "Priority", "$type": "SingleEnumIssueCustomField", "value": {"name": "Critical"}}
  ]
}'
```

Writable issue fields: `summary`, `description`, `project`, `tags`, `visibility`, `customFields`.

## Issues: Delete

```bash
yt_delete "issues/PROJ-123"
```

## Issue Drafts

A draft is an issue that has not yet been "reported." Its `isDraft` field is `true` and it is only visible to the `draftOwner`.

**Create a draft** — use the `/users/me/drafts` endpoint:

```bash
yt_post "users/me/drafts?fields=id,idReadable,summary,isDraft" '{
  "project": {"id": "<PROJECT_DB_ID>"},
  "summary": "Draft title"
}'
```

**Report (publish) a draft** — pass the draft's database ID via `draftId`:

```bash
yt_post "issues?draftId=<DRAFT_DB_ID>&fields=idReadable,summary" '{}'
```

**Read/update/delete a draft** — use the standard issue endpoints with the draft's database ID (e.g. `2-24`).

---

## Comments

**List**:

```bash
yt_get "issues/PROJ-123/comments?fields=id,text,author(login,name),created,updated,deleted&\$top=<N>&\$skip=<N>"
```

**Get single**:

```bash
yt_get "issues/PROJ-123/comments/<COMMENT_ID>?fields=id,text,author(login,name),created,updated"
```

**Create**:

```bash
yt_post "issues/PROJ-123/comments?fields=id,text,author(login,name),created" '{"text": "Comment text in markdown"}'
```

**Update**:

```bash
yt_post "issues/PROJ-123/comments/<COMMENT_ID>?fields=id,text,updated" '{"text": "Updated comment text"}'
```

# Tags, Links & Time Tracking

## Contents
- [Tags](#tags)
- [Issue Links](#issue-links)
- [Time Tracking / Work Items](#time-tracking--work-items)

---

## Tags

**List all tags** (optionally filter by name):

```bash
yt_get "tags?fields=id,name&query=<NAME_FILTER>&\$top=<N>"
```

**List tags on an issue**:

```bash
yt_get "issues/PROJ-123/tags?fields=id,name"
```

**Add a tag to an issue** — requires the tag's database ID (get it from the list endpoint above):

```bash
yt_post "issues/PROJ-123/tags?fields=id,name" '{"id": "<TAG_DB_ID>"}'
```

**Remove a tag from an issue**:

```bash
yt_delete "issues/PROJ-123/tags/<TAG_DB_ID>"
```

---

## Issue Links

**List available link types**:

```bash
yt_get "issueLinkTypes?fields=id,name,sourceToTarget,targetToSource,directed"
```

Common link types: `Relates` (relates to / relates to), `Depend` (is required for / depends on), `Subtask` (parent for / subtask of), `Duplicate` (is duplicated by / duplicates).

**Get links for an issue**:

```bash
yt_get "issues/PROJ-123/links?fields=id,direction,linkType(name,sourceToTarget,targetToSource),issues(idReadable,summary)"
```

Each element has `direction` (`OUTWARD`, `INWARD`, or `BOTH`) and an `issues` array.

**Add a link** — first find the link's `id` from the issue's links list, then POST the target issue:

```bash
yt_post "issues/PROJ-123/links/<LINK_ID>/issues?fields=idReadable,summary" '{"id": "<TARGET_ISSUE_DB_ID>"}'
```

`<LINK_ID>` is the `id` from the issue's links collection (not the link type ID). To link PROJ-123 as a parent of PROJ-456, find the link entry with `direction: INWARD` and `linkType.name: Subtask` on PROJ-456, then POST PROJ-123's database ID.

**Remove a link**:

```bash
yt_delete "issues/PROJ-123/links/<LINK_ID>/issues/<TARGET_ISSUE_DB_ID>"
```

---

## Time Tracking / Work Items

**List work items**:

```bash
yt_get "issues/PROJ-123/timeTracking/workItems?fields=id,author(login,name),text,type(id,name),duration(minutes,presentation),date,created&\$top=<N>&\$skip=<N>"
```

**Create a work item** — `duration` is required (provide `minutes` or `presentation` like `"1h 30m"`):

```bash
yt_post "issues/PROJ-123/timeTracking/workItems?fields=id,duration(minutes,presentation),date,type(name),text" '{
  "duration": {"minutes": 90},
  "text": "Implemented feature X",
  "date": <TIMESTAMP_MS>,
  "type": {"id": "<WORK_TYPE_ID>"}
}'
```

- `date` — Unix timestamp in milliseconds; defaults to today if omitted
- `type` — optional; get available work type IDs from the project settings

**Update a work item**:

```bash
yt_post "issues/PROJ-123/timeTracking/workItems/<ITEM_ID>?fields=id,duration(minutes,presentation),text" '{"duration": {"minutes": 120}, "text": "Updated description"}'
```

**Delete a work item**:

```bash
yt_delete "issues/PROJ-123/timeTracking/workItems/<ITEM_ID>"
```

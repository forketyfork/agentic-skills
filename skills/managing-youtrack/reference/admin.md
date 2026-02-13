# Field Schema, Saved Queries, Users, Groups & Projects

## Contents
- [Custom Field Schema](#custom-field-schema)
- [Saved Queries](#saved-queries)
- [Users](#users)
- [User Groups](#user-groups)
- [Projects](#projects)

---

## Custom Field Schema

**List global custom fields**:

```bash
yt_get "admin/customFieldSettings/customFields?fields=id,name,fieldType(id)&\$top=100"
```

**List project-specific custom fields** (with their bundle values):

```bash
yt_get "admin/projects/<PROJECT_DB_ID>/customFields?fields=field(id,name,fieldType(id)),bundle(id,values(id,name))&\$top=100"
```

**List enum bundle values** (replace `enum` with `state`, `build`, `version`, or `ownedField` for other bundle types):

```bash
yt_get "admin/customFieldSettings/bundles/enum/<BUNDLE_ID>?fields=id,name,values(id,name,description)"
```

---

## Saved Queries

**List saved queries** (returns the current user's saved searches):

```bash
yt_get "savedQueries?fields=id,name,query&\$top=<N>"
```

**Get a single saved query**:

```bash
yt_get "savedQueries/<QUERY_ID>?fields=id,name,query"
```

---

## Users

**Current user**:

```bash
yt_get "users/me?fields=id,login,fullName,email"
```

**Find user by login**:

```bash
yt_get "users/<LOGIN>?fields=id,login,fullName,email"
```

**List users**:

```bash
yt_get "users?fields=id,login,fullName&\$top=<N>&\$skip=<N>"
```

---

## User Groups

**List groups**:

```bash
yt_get "groups?fields=id,name,usersCount&\$top=<N>&\$skip=<N>"
```

**Get group details** (including associated project team):

```bash
yt_get "groups/<GROUP_ID>?fields=id,name,usersCount,teamForProject(id,name,shortName)"
```

---

## Projects

Use this to find project IDs for issue creation:

```bash
yt_get "admin/projects?fields=id,name,shortName&\$top=100"
```

The `id` field is the database ID needed for creating issues. The `shortName` is the project prefix used in readable issue IDs (e.g. `PROJ` in `PROJ-123`).

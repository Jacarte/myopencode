---
name: remote-mr-review
description: "Review GitLab merge requests remotely with AI-assisted code review. Use when: (1) reviewing an MR by ID or URL, (2) adding code review comments to GitLab, (3) checking MR changes against best practices. Triggers: 'review MR', 'review merge request', 'code review', 'check this MR', 'review !123'."
compatibility: opencode
---

# Remote MR Review Skill

AI-assisted code review for GitLab merge requests. Reviews code for security, performance, maintainability, and best practices, then posts comments directly to GitLab.

## Workflow

### 1. Fetch MR Context

```
gitlab_get_merge_request(project_id, merge_request_iid)
gitlab_get_merge_request_diffs(project_id, merge_request_iid)
```

Extract ticket ID from MR title (e.g., `CHAT-1234: Feature title` → `CHAT-1234`).

### 2. Gather Additional Context (Optional)

If ticket ID found, search Confluence for related documentation via Atlassian MCP.

### 3. Review the Diff

Analyze each changed file against the review checklist. Focus on **new or modified code only**.

### 4. Interactive Comment Approval

For EACH review comment:
1. Present the comment to user
2. Ask: "Post this comment? (yes/no/edit)"
3. If "edit" → user provides revised text
4. Only post after explicit approval

### 5. Post Approved Comments

All comments MUST be prefixed with `(AI assisted)`.

**For line-specific comments** (diff threads):
```
gitlab_create_merge_request_thread(
  project_id, merge_request_iid,
  body="(AI assisted) ...",
  position={base_sha, head_sha, start_sha, position_type="text", new_path, new_line}
)
```

**For general comments** (MR-level):
```
gitlab_create_merge_request_note(project_id, merge_request_iid, body="(AI assisted) ...")
```

## Review Checklist

### Security
- Input validation on all external inputs (GraphQL types, Joi, Yup)
- No secrets/credentials in code
- Proper authentication/authorization checks

### Performance  
- MongoDB queries have appropriate indexes
- No N+1 query patterns
- Efficient data structures and algorithms

### Code Quality
- Tests written for new features
- Using `@chatlayer/logger` (not console.log)
- Critical errors captured in Sentry
- Semantic variable/function names (`isValidLength` not `isOk`)
- No magic numbers (use named constants)
- No commented-out code
- Breaking changes documented in MR description

### Go-Specific Rules
- `log.Fatal` → only in `main.go`
- `context.WithoutCancel` → forbidden
- Helper functions (lowercase) declared AFTER first usage
- Constants in `UPPER_CASE`

### API Guidelines
- GraphQL/REST changes follow [schema design guidelines](https://confluence.sinch.com/display/BF/GraphQL+Schema+Design+Guidelines)

## Getting diff_refs for Thread Position

The `position` object requires SHAs from the MR's `diff_refs`:

```
mr = gitlab_get_merge_request(project_id, merge_request_iid)
# Use: mr.diff_refs.base_sha, mr.diff_refs.head_sha, mr.diff_refs.start_sha
```

## Comment Format

```
(AI assisted) **[Category]**: Description of the issue.

**Suggestion**: How to fix it.

**Line X**: `problematic_code()`
```

Categories: `Security`, `Performance`, `Maintainability`, `Best Practice`, `Style`

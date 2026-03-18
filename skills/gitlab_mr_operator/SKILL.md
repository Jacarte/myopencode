---
name: gitlab_mr_operator
description: "Operate GitLab merge requests with curl using GITLAB_TOKEN (no MCP). Use when listing MRs, reading MR details, updating MR descriptions, adding MR comments, creating MRs, or fetching diffs/jobs directly through GitLab REST API."
compatibility: opencode
---

# GitLab MR Operator

Use GitLab REST API calls through `curl` instead of MCP tools.

## Preconditions

1. Require `GITLAB_TOKEN`.
2. Use `GITLAB_URL` when set; default to `https://gitlab.com`.
3. Build API base as `${GITLAB_URL%/}/api/v4`.

## Command Rules

1. Always include `--header "PRIVATE-TOKEN: $GITLAB_TOKEN"`.
2. Use `--fail-with-body --silent --show-error` on every request.
3. Use `--header "Content-Type: application/json"` for write operations.
4. URL-encode project IDs when they are paths like `group/subgroup/repo`.
5. Treat description updates and comments as different operations:
   - Description update: `PUT /projects/:id/merge_requests/:iid`
   - Comment add: `POST /projects/:id/merge_requests/:iid/notes`

## Setup Snippet

```bash
test -n "$GITLAB_TOKEN" || { echo "GITLAB_TOKEN is required"; exit 1; }
GITLAB_URL="${GITLAB_URL:-https://gitlab.com}"
API_BASE="${GITLAB_URL%/}/api/v4"
ENC_PROJECT_ID="$(python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$PROJECT_ID")"
```

## Operations

### List merge requests

```bash
curl --fail-with-body --silent --show-error \
  --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  "$API_BASE/projects/$ENC_PROJECT_ID/merge_requests?state=opened&per_page=20"
```

### Get merge request details

```bash
curl --fail-with-body --silent --show-error \
  --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  "$API_BASE/projects/$ENC_PROJECT_ID/merge_requests/$MR_IID"
```

### Update merge request description

```bash
curl --fail-with-body --silent --show-error \
  --request PUT \
  --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  --header "Content-Type: application/json" \
  --data "$(jq -nc --arg description "$NEW_DESCRIPTION" '{description:$description}')" \
  "$API_BASE/projects/$ENC_PROJECT_ID/merge_requests/$MR_IID"
```

### Add merge request comment

```bash
curl --fail-with-body --silent --show-error \
  --request POST \
  --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  --header "Content-Type: application/json" \
  --data "$(jq -nc --arg body "$COMMENT_BODY" '{body:$body}')" \
  "$API_BASE/projects/$ENC_PROJECT_ID/merge_requests/$MR_IID/notes"
```

### Create merge request

```bash
curl --fail-with-body --silent --show-error \
  --request POST \
  --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  --header "Content-Type: application/json" \
  --data "$(jq -nc \
    --arg source_branch "$SOURCE_BRANCH" \
    --arg target_branch "$TARGET_BRANCH" \
    --arg title "$TITLE" \
    --arg description "$DESCRIPTION" \
    '{source_branch:$source_branch,target_branch:$target_branch,title:$title,description:$description}')" \
  "$API_BASE/projects/$ENC_PROJECT_ID/merge_requests"
```

### Read merge request pipelines

```bash
curl --fail-with-body --silent --show-error \
  --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  "$API_BASE/projects/$ENC_PROJECT_ID/merge_requests/$MR_IID/pipelines"
```

### Read jobs for a merge request pipeline

```bash
curl --fail-with-body --silent --show-error \
  --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  "$API_BASE/projects/$ENC_PROJECT_ID/pipelines/$PIPELINE_ID/jobs?per_page=100&include_retried=true"
```

### Job and pipeline read options

1. Use `per_page` and `page` for pagination.
2. Filter jobs by status with repeated `scope[]` params (for example `scope[]=failed&scope[]=running`).
3. Include retried jobs with `include_retried=true` when investigating flaky pipelines.
4. Prefer MR pipeline listing first, then fetch jobs by `pipeline_id` to avoid mixing unrelated project pipelines.

## Response Handling

1. Parse successful JSON responses and report key fields (`iid`, `title`, `web_url`, `state`).
2. On error, surface HTTP status and response body exactly.
3. Do not guess missing IDs or branch names; fetch first, then act.

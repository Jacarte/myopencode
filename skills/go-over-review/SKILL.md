---
name: go-over-review
description: "Go over GitLab MR or GitHub PR review comments one by one. Use when resolving review feedback comment-by-comment, prioritizing inline comments over general comments, avoiding overreach, or replying to a solved review item with an `(AI assisted)` message in the exact review thread when supported."
compatibility: opencode
---

# Go Over Review

Process review feedback one comment at a time.

This skill is for resolving existing review comments on a GitLab merge request or GitHub pull request. It is not for broad MR/PR review, batch fixes, or sweeping cleanup.

## Core Rules

1. Work on exactly one review item at a time.
2. Prioritize inline comments over general comments.
3. Make only the change needed for the active review comment.
4. Do not fix adjacent issues, opportunistic cleanup, or other review comments in the same pass.
5. After the specific comment is solved and verified, reply to that exact review item with a message prefixed `(AI assisted)` when the backend supports an exact thread reply.
6. If exact thread reply is not supported, stop and explain the limitation. Do not silently post to a broader scope unless the user explicitly accepts that fallback.

## Inputs

Expect one of:

- A GitLab MR URL or project + MR IID
- A GitHub PR URL or repo + PR number
- Optionally, a specific review comment/thread ID

If a specific review comment or thread is provided, use that exact item and ignore all others.

If no specific review item is provided, build a queue and select only the next item.

## Review Item Queue

When building a queue, order candidates like this:

1. Unresolved inline comments
2. Unresolved general comments
3. Resolved inline comments only if the user explicitly asks to revisit resolved feedback
4. Resolved general comments only if explicitly requested

Within a bucket, process oldest first.

Treat each queue entry as a single unit of work with platform-specific identity, for example:

- Platform
- MR/PR identifier
- Discussion/thread ID
- Note/comment ID
- Inline or general
- Resolved state
- File path and line number when available

## Scope Discipline

Before changing code, restate the active review item in one sentence and keep the work bound to that sentence.

Good scope:

- Rename a function because the review comment asks for clearer naming
- Add a missing test because the review comment asks for coverage
- Adjust a conditional because the review comment points out a bug

Bad scope:

- Refactor the whole module because the active comment touches one function
- Fix unrelated lint, style, or architecture issues not mentioned in the active comment
- Resolve multiple review comments in one edit pass

If the requested fix naturally spans multiple files, keep the change set limited to what is required for that single comment.

## Platform Handling

### GitLab

Use the local GitLab tooling to fetch discussions and identify comment scope.

- Use MR discussions to distinguish inline threads from general MR comments.
- Treat discussions with file/line position as inline comments.
- Treat MR-level standalone notes as general comments.

If the available tooling can reply to the exact discussion thread, use it.

If the available tooling can only add a broad MR-level note, do not use that as a substitute for an exact thread reply unless the user explicitly accepts the loss of precision.

If discussion resolution/unresolution is unsupported, do not pretend the comment was resolved through the API. Report the limitation plainly.

### GitHub

Use `gh` via shell when authenticated.

- Fetch review comments and general PR comments separately.
- Treat line-specific review comments as inline comments.
- Treat PR-level discussion/comments as general comments.

Reply only to the exact review item being handled.

If GitHub only allows replying to a top-level review comment and the active item is already a nested reply, stop and explain the limitation instead of posting in the wrong place.

## Execution Workflow

### 1. Identify the active review item

- Parse the MR/PR reference.
- Fetch candidate review items.
- Select exactly one item using the queue rules.
- Summarize the chosen item before editing.

### 2. Gather minimal context

Read only what is needed to address that one review item:

- The relevant file(s)
- The nearby code
- The specific discussion/thread text
- Minimal diff or MR/PR metadata when needed

Do not do a broad review of the full MR/PR.

### 3. Implement the fix

Apply the smallest change that satisfies the active comment.

If the comment is unclear, ask a narrow clarification question instead of guessing or expanding scope.

### 4. Verify the fix

Run the narrowest meaningful validation for the changed surface:

- Diagnostics on changed files
- Focused tests when available
- Build or targeted manual verification when needed

Do not mark the review item solved until the specific change is verified.

### 5. Reply to the review item

After the fix is verified, reply in the exact thread/comment scope when supported.

Prefix every reply with `(AI assisted)`.

Keep the reply short and specific:

```text
(AI assisted) Addressed this review item in the latest change. The update is scoped to this feedback and has been re-verified.
```

If useful, mention the exact file or behavior changed, but do not claim unrelated cleanup.

### 6. Move to the next item only after completion

Only after the current item is fixed, verified, and replied to should the skill proceed to the next review item.

## Refusal Conditions

Refuse or pause when any of these are true:

- The active review item cannot be identified precisely.
- The only available write path posts to a broader scope than the active comment/thread.
- The requested change would require broad refactoring beyond the active comment.
- The review item conflicts with another unresolved comment and the tradeoff is ambiguous.

In those cases, explain the blocker briefly and stop rather than overreaching.

## Reply Format

Always prefix posted replies exactly like this:

```text
(AI assisted) ...
```

Do not use the prefix for comments you do not actually post.

## What This Skill Is Not For

Do not use this skill for:

- Reviewing an MR/PR from scratch
- Generating a large batch of comments
- Whole-branch cleanup
- Unrelated refactors discovered while addressing feedback

Use it only when the job is to work through existing review feedback in a disciplined, comment-scoped way.
